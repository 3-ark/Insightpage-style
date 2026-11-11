import {
  DEFAULT_SETTINGS,
} from './../constants/settingsConstants';
import {
  App,
  PluginSettingTab,
  Setting,
  type SettingDefinitionItem,
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

  refresh(): void {
    if (typeof (this as any).update === 'function') {
      (this as any).update();
    }
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const definitions: SettingDefinitionItem[] = [
      {
        name: 'Show button in context menu',
        desc: 'If enabled, you will see a button in your editor context menu to open the chart creator.',
        control: {
          type: 'toggle',
          key: 'contextMenu',
        },
      },
      {
        type: 'group',
        heading: 'Colors',
        items: [
          {
            name: 'Enable theme colors',
            desc: 'If your Obsidian theme (or snippet) provides colors you can use them instead.',
            control: {
              type: 'toggle',
              key: 'themeable',
            },
          },
          {
            name: 'Chart colors',
            desc: 'Set the colors for your charts. Border and inner colors are derived from these swatches.',
            visible: () => !this.plugin.settings.themeable,
            render: (setting: Setting) => {
              const { plugin } = this;
              const containerEl = setting.settingEl;
              containerEl.empty();

              const desc = containerEl.createEl('p', { cls: 'setting-item-description' });
              desc.append(
                'Set the Colors for your Charts. This will set the border Color and the inner Color will be the same, but with less opacity. This ensures better compatibility with Dark and Light Mode. ',
                'You can use any ',
                desc.createEl('a', {
                  href: 'https://www.w3schools.com/cssref/css_colors.asp',
                  text: 'valid CSS Color.',
                })
              );

              plugin.settings.colors.forEach((color, idx) => {
                const nameEl = createFragment();
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
                      onDone: async (col: any) => {
                        this.plugin.settings.colors[idx] = col.hex;
                        await this.plugin.saveSettings();
                        this.refresh();
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
                        this.refresh();
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
                        this.refresh();
                      });
                  });
              });

              new Setting(containerEl).addButton((btn) => {
                btn.setButtonText('Add Color').onClick(async () => {
                  this.plugin.settings.colors.push('#ffffff');
                  await this.plugin.saveSettings();
                  this.refresh();
                });
              });
            },
          },
        ],
      },
    ];

    return definitions;
  }
}
