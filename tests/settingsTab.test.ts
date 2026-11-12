import { setupDomPolyfills } from './setupDom';
setupDomPolyfills();
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import Module from 'node:module';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://obsidian.md',
});
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).HTMLElement = dom.window.HTMLElement;
(globalThis as any).DocumentFragment = dom.window.DocumentFragment;
(globalThis as any).Node = dom.window.Node;
(globalThis as any).Element = dom.window.Element;
setupDomPolyfills(dom.window);

class MockSetting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.settingEl = containerEl.createEl('div', { cls: 'setting-item' });
    this.infoEl = this.settingEl.createEl('div', { cls: 'setting-item-info' });
    this.nameEl = this.infoEl.createEl('div', { cls: 'setting-item-name' });
    this.descEl = this.infoEl.createEl('div', { cls: 'setting-item-description' });
    this.controlEl = this.settingEl.createEl('div', { cls: 'setting-item-control' });
  }

  setName(name: string | DocumentFragment) {
    if (typeof name === 'string') {
      this.nameEl.textContent = name;
    } else {
      this.nameEl.empty();
      this.nameEl.appendChild(name);
    }
    return this;
  }

  setHeading() {
    this.settingEl.classList.add('setting-item-heading');
    return this;
  }

  setDesc(desc: string | DocumentFragment) {
    if (typeof desc === 'string') {
      this.descEl.textContent = desc;
    } else {
      this.descEl.empty();
      this.descEl.appendChild(desc);
    }
    return this;
  }

  addToggle(cb: (toggle: any) => void) {
    const toggle = {
      value: false,
      setValue: (val: boolean) => {
        toggle.value = val;
        return toggle;
      },
      onChange: (fn: (val: boolean) => void) => {
        toggle.triggerChange = fn;
        return toggle;
      },
      triggerChange: (_val: boolean) => {},
    };
    cb(toggle);
    return this;
  }

  addButton(cb: (btn: any) => void) {
    const btnEl = this.controlEl.createEl('button');
    const btn = {
      buttonEl: btnEl,
      setButtonText: (text: string) => {
        btnEl.textContent = text;
        return btn;
      },
      onClick: (fn: () => void) => {
        btnEl.addEventListener('click', fn);
        return btn;
      },
    };
    cb(btn);
    return this;
  }

  addExtraButton(cb: (btn: any) => void) {
    const btnEl = this.controlEl.createEl('div', { cls: 'clickable-icon extra-setting-button' });
    const btn = {
      extraSettingsEl: btnEl,
      setIcon: (_icon: string) => btn,
      setTooltip: (tip: string) => {
        btnEl.setAttribute('aria-label', tip);
        return btn;
      },
      setDisabled: (disabled: boolean) => {
        if (disabled) btnEl.setAttribute('disabled', 'true');
        else btnEl.removeAttribute('disabled');
        return btn;
      },
      onClick: (fn: () => void) => {
        btnEl.addEventListener('click', fn);
        return btn;
      },
    };
    cb(btn);
    return this;
  }
}

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'obsidian') {
    return {
      PluginSettingTab: class {
        app: any;
        plugin: any;
        containerEl: HTMLElement;
        constructor(app: any, plugin: any) {
          this.app = app;
          this.plugin = plugin;
          this.containerEl = document.createElement('div');
        }
      },
      Setting: MockSetting,
    };
  }
  return originalRequire.apply(this, arguments as any);
};

test('ChartSettingTab renders settings using display() and handles toggles and color list', async () => {
  const { ChartSettingTab } = await import('../src/ui/settingsTab');

  let saved = false;
  const mockPlugin: any = {
    settings: {
      contextMenu: true,
      themeable: false,
      colors: ['#ff0000', '#00ff00', '#0000ff'],
    },
    saveSettings: async () => {
      saved = true;
    },
  };

  const mockApp: any = {};

  const tab = new ChartSettingTab(mockApp, mockPlugin);
  const container = dom.window.document.createElement('div');
  tab.containerEl = container;

  // Initial display
  tab.display();

  // Check heading
  const headings = Array.from(container.querySelectorAll('.setting-item-heading'));
  assert.ok(headings.length >= 1, 'Should render Colors section heading');
  assert.equal(headings[0].textContent, 'Colors');

  // Check color items rendered
  const colorItems = Array.from(container.querySelectorAll('.setting-item')).filter(
    (el) => el.textContent?.includes('Color #')
  );
  assert.equal(colorItems.length, 3, 'Should render 3 color items');

  // Verify "Add Color" button exists
  const buttons = Array.from(container.querySelectorAll('button'));
  const addColorBtn = buttons.find((b) => b.textContent === 'Add Color');
  assert.ok(addColorBtn, 'Add Color button should exist');

  // Click Add Color
  addColorBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(mockPlugin.settings.colors.length, 4, 'Should add a new color');
  assert.equal(mockPlugin.settings.colors[3], '#ffffff');
  assert.ok(saved);

  // Check themeable toggle hides colors
  mockPlugin.settings.themeable = true;
  tab.display();
  const colorItemsAfterThemeable = Array.from(container.querySelectorAll('.setting-item')).filter(
    (el) => el.textContent?.includes('Color #')
  );
  assert.equal(colorItemsAfterThemeable.length, 0, 'Color items should be hidden when themeable is true');
});

test('ChartSettingTab implements getSettingDefinitions() declarative API', async () => {
  const { ChartSettingTab } = await import('../src/ui/settingsTab');

  let saved = false;
  const mockPlugin: any = {
    settings: {
      contextMenu: true,
      themeable: false,
      colors: ['#ff0000', '#00ff00', '#0000ff'],
    },
    saveSettings: async () => {
      saved = true;
    },
  };

  const mockApp: any = {};
  const tab = new ChartSettingTab(mockApp, mockPlugin);

  const defs = tab.getSettingDefinitions();
  assert.ok(Array.isArray(defs), 'Definitions should be an array');
  assert.equal(defs.length, 3, 'Should include contextMenu, themeable, and colors group');

  // Verify getControlValue and setControlValue
  assert.equal(tab.getControlValue('contextMenu'), true);
  await tab.setControlValue('contextMenu', false);
  assert.equal(mockPlugin.settings.contextMenu, false);
  assert.ok(saved);

  // When themeable is true, colors group is omitted from definitions
  mockPlugin.settings.themeable = true;
  const defsThemeable = tab.getSettingDefinitions();
  assert.equal(defsThemeable.length, 2, 'Should only include contextMenu and themeable');
});
