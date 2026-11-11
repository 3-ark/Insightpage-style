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
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Show button in context menu')
      .setDesc('If enabled, you will see a button in your editor context menu to open the chart creator.')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.contextMenu)
          .onChange(async (val) => {
            this.plugin.settings.contextMenu = val;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl).setName('Colors').setHeading();

    new Setting(containerEl)
      .setName('Enable theme colors')
      .setDesc('If your Obsidian theme (or snippet) provides colors you can use them instead.')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.themeable)
          .onChange(async (val) => {
            this.plugin.settings.themeable = val;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    if (!this.plugin.settings.themeable) {
      const descEl = containerEl.createEl('p', { cls: 'setting-item-description' });
      descEl.append(
        'Set the Colors for your Charts. This will set the border Color and the inner Color will be the same, but with less opacity. This ensures better compatibility with Dark and Light Mode. ',
        'You can use any ',
        descEl.createEl('a', {
          href: 'https://www.w3schools.com/cssref/css_colors.asp',
          text: 'valid CSS Color.',
        })
      );

      this.plugin.settings.colors.forEach((color, idx) => {
        const nameEl = createFragment();
        nameEl.createSpan({ text: '●', attr: { style: `color: ${color}` } });
        nameEl.appendText(` Color #${idx + 1}`);

        new Setting(containerEl)
          .setName(nameEl)
          .setDesc('This will be the border Color used in the Charts you create.')
          .addButton((btn) => {
            btn.setButtonText('Change Color');
            const Picker = getPicker();
            new Picker({
              parent: btn.buttonEl,
              onDone: async (col: any) => {
                this.plugin.settings.colors[idx] = col.hex;
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
  }
}
