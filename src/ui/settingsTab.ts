import {
  DEFAULT_SETTINGS,
} from './../constants/settingsConstants';
import {
  App,
  PluginSettingTab,
  Setting,
} from 'obsidian';
import type ChartPlugin from '../main';

let _Picker: any = null;
function getPicker(): any {
  if (!_Picker) {
    const loaded = require('vanilla-picker');
    _Picker = loaded.default ?? loaded;
  }
  return _Picker;
}

export class ChartSettingTab extends PluginSettingTab {
  plugin: ChartPlugin;

  constructor(app: App, plugin: ChartPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl, plugin } = this;

    containerEl.empty();

    containerEl.createEl('h2', { text: 'Settings - Charts' });

    containerEl.createEl('h3', { text: 'General' });

    new Setting(containerEl)
      .setName('Show Button in Context Menu')
      .setDesc(
        'If enabled, you will se a Button in your Editor Context Menu to open the Chart Creator.'
      )
      .addToggle((cb) => {
        cb.setValue(this.plugin.settings.contextMenu).onChange(
          async (value) => {
            plugin.settings.contextMenu = value;
            await plugin.saveSettings();
          }
        );
      });

    containerEl.createEl('h3', {
      text: 'Colors',
      attr: {
        style: 'margin-bottom: 0',
      },
    });
    const desc = containerEl.createEl('p', { cls: 'setting-item-description' });
    desc.append(
      'Set the Colors for your Charts. This will set the border Color and the inner Color will be the same, but with less opacity. This ensures better compatibility with Dark and Light Mode. ',
      'You can use any ',
      desc.createEl('a', {
        href: 'https://www.w3schools.com/cssref/css_colors.asp',
        text: 'valid CSS Color.',
      })
    );

    new Setting(containerEl)
      .setName('Enable Theme Colors')
      .setDesc(
        'If your Obsidian Theme (or snippet) provides Colors you can use them instead.'
      )
      .addToggle((cb) => {
        cb.setValue(plugin.settings.themeable).onChange(async (value) => {
          plugin.settings.themeable = value;
          await plugin.saveSettings();
          this.display();
        });
      });

    if (!plugin.settings.themeable) {
      plugin.settings.colors.forEach((color, idx) => {
        const nameEl = document.createDocumentFragment();
        nameEl.createSpan({ text: '●', attr: { style: `color: ${color}` } });
        nameEl.appendText(` Color #${idx + 1}`);
        new Setting(containerEl)
          .setName(nameEl)
          .setDesc(
            'This will be the border Color used in the Charts you create.'
          )
          .addButton((btn) => {
            btn.setButtonText('Change Color');
            const Picker = getPicker();
            new Picker({
              parent: btn.buttonEl,
              onDone: async (color: any) => {
                this.plugin.settings.colors[idx] = color.hex;
                await this.plugin.saveSettings();
                this.display();
              },
              popup: 'left',
              color: color,
              alpha: false,
            });
          })
          .addExtraButton((btn) => {
            btn
              .setIcon('trash')
              .setTooltip('Remove')
              .onClick(async () => {
                this.plugin.settings.colors.remove(color);
                await this.plugin.saveSettings();
                this.display();
              });
            if (this.plugin.settings.colors.length === 1) {
              btn.setDisabled(true);
            }
          })
          .addExtraButton((btn) => {
            btn
              .setIcon('reset')
              .setTooltip('Reset to default')
              .onClick(async () => {
                this.plugin.settings.colors[idx] =
                  DEFAULT_SETTINGS.colors[idx] ?? '#ffffff';
                await this.plugin.saveSettings();
                this.display();
              });
          });
      });

      new Setting(containerEl).addButton((btn) => {
        btn.setButtonText('Add Color').onClick(async () => {
          this.plugin.settings.colors.push('#ffffff');
          await this.plugin.saveSettings();
          this.display();
        });
      });
    }

    containerEl.createEl('h3', { text: 'Credits & Acknowledgments' });
    const creditsContainer = containerEl.createEl('div', { cls: 'setting-item-description' });

    const creditsIntro = creditsContainer.createEl('p');
    creditsIntro.appendText('Special thanks to the open-source libraries and projects that power InsightPage Style:');

    const creditsList = creditsContainer.createEl('ul', {
      attr: { style: 'margin-top: 8px; padding-left: 20px;' },
    });

    const addCredit = (name: string, href: string, description: string) => {
      const li = creditsList.createEl('li', { attr: { style: 'margin-bottom: 4px;' } });
      li.createEl('a', { href, text: name });
      li.appendText(` — ${description}`);
    };

    addCredit(
      'obsidian-charts',
      'https://github.com/phibr0/obsidian-charts',
      'Special thanks! Some code in the simple chart part and setting page are from here.'
    );
    addCredit(
      'Leaflet.js',
      'https://leafletjs.com/',
      'Interactive map rendering.'
    );
    addCredit(
      'abcjs',
      'https://www.abcjs.net/',
      'ABC sheet music notation rendering and interactive audio playback.'
    );
    addCredit(
      'Observable Plot',
      'https://observablehq.com/@observablehq/plot',
      'Interactive JavaScript plot rendering engine.'
    );
    addCredit(
      'D3.js',
      'https://d3js.org/',
      'Data visualization and scale utilities.'
    );
    addCredit(
      'chroma-js',
      'https://github.com/gka/chroma.js',
      'Color space conversions and palette creation.'
    );
    addCredit(
      'Vanilla Picker',
      'https://github.com/SavenokMaxim/vanilla-picker',
      'Color picker interface.'
    );
  }
}
