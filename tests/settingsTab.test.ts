import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import Module from 'node:module';

// Setup JSDOM globals
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://localhost',
});
global.window = dom.window as any;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.DocumentFragment = dom.window.DocumentFragment;

// Augment HTMLElement prototype for Obsidian helper methods if missing
if (!HTMLElement.prototype.empty) {
  HTMLElement.prototype.empty = function () {
    this.innerHTML = '';
  };
}

if (!HTMLElement.prototype.createEl) {
  HTMLElement.prototype.createEl = function (tag: string, o?: any) {
    const el = document.createElement(tag);
    if (o?.text) el.textContent = o.text;
    if (o?.cls) el.className = o.cls;
    if (o?.href) el.setAttribute('href', o.href);
    if (o?.attr) {
      for (const key of Object.keys(o.attr)) {
        el.setAttribute(key, o.attr[key]);
      }
    }
    this.appendChild(el);
    return el;
  };
}

if (!HTMLElement.prototype.appendText) {
  HTMLElement.prototype.appendText = function (text: string) {
    this.appendChild(document.createTextNode(text));
  };
}

if (!(DocumentFragment.prototype as any).createSpan) {
  (DocumentFragment.prototype as any).createSpan = function (o?: any) {
    const el = document.createElement('span');
    if (o?.text) el.textContent = o.text;
    if (o?.cls) el.className = o.cls;
    if (o?.attr) {
      for (const key of Object.keys(o.attr)) {
        el.setAttribute(key, o.attr[key]);
      }
    }
    this.appendChild(el);
    return el;
  };
}

if (!(DocumentFragment.prototype as any).appendText) {
  (DocumentFragment.prototype as any).appendText = function (text: string) {
    this.appendChild(document.createTextNode(text));
  };
}

// Mock 'obsidian' module for Node runtime
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'obsidian') {
    return {
      PluginSettingTab: class {
        app: any;
        plugin: any;
        containerEl: any;
        constructor(app: any, plugin: any) {
          this.app = app;
          this.plugin = plugin;
          this.containerEl = document.createElement('div');
        }
      },
      Setting: class {
        containerEl: any;
        constructor(containerEl: any) {
          this.containerEl = containerEl;
        }
        setName() { return this; }
        setDesc() { return this; }
        addToggle(cb: (cb: any) => void) {
          cb({ setValue: () => ({ onChange: () => {} }) });
          return this;
        }
        addButton() { return this; }
        addExtraButton() { return this; }
      },
    };
  }
  return originalRequire.apply(this, arguments as any);
};

test('ChartSettingTab.display() renders Credits & Acknowledgments section with all credit links and descriptions', async () => {
  const { ChartSettingTab } = await import('../src/ui/settingsTab');

  const mockPlugin: any = {
    settings: {
      contextMenu: true,
      themeable: false,
      colors: ['#3b82f6'],
    },
    saveSettings: async () => {},
  };

  const settingTab = new ChartSettingTab({} as any, mockPlugin);
  settingTab.display();

  const container = settingTab.containerEl;

  // Check Credits heading
  const headings = Array.from(container.querySelectorAll('h3')).map((h: any) => h.textContent);
  assert.ok(headings.includes('Credits & Acknowledgments'), 'Should render "Credits & Acknowledgments" h3 heading');

  // Check credit links
  const links = Array.from(container.querySelectorAll('a')).map((a: any) => ({
    text: a.textContent,
    href: a.getAttribute('href'),
  }));

  const expectedLinks = [
    { text: 'obsidian-charts', href: 'https://github.com/phibr0/obsidian-charts' },
    { text: 'Leaflet.js', href: 'https://leafletjs.com/' },
    { text: 'abcjs', href: 'https://www.abcjs.net/' },
    { text: 'Observable Plot', href: 'https://observablehq.com/@observablehq/plot' },
    { text: 'D3.js', href: 'https://d3js.org/' },
    { text: 'chroma-js', href: 'https://github.com/gka/chroma.js' },
    { text: 'Vanilla Picker', href: 'https://github.com/SavenokMaxim/vanilla-picker' },
  ];

  for (const expected of expectedLinks) {
    const found = links.find((l) => l.text === expected.text && l.href === expected.href);
    assert.ok(found, `Credit link for ${expected.text} (${expected.href}) should be rendered in settingTab`);
  }

  // Check attribution text for obsidian-charts
  const listItems = Array.from(container.querySelectorAll('li')).map((li: any) => li.textContent);
  const obsidianChartsCredit = listItems.find((item) => item.includes('obsidian-charts'));
  assert.ok(obsidianChartsCredit, 'obsidian-charts credit list item should exist');
  assert.ok(
    obsidianChartsCredit?.includes('simple chart part and setting page are from here'),
    'obsidian-charts credit must state that code in simple chart part and setting page are from here'
  );
});
