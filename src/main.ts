import type {
  Menu,
  Editor,
  MarkdownPostProcessorContext,
  MarkdownFileInfo,
} from 'obsidian';
import {
  MarkdownView,
  Plugin,
  parseYaml,
} from 'obsidian';

import Renderer, { getPlot, getD3, setPlot, setD3 } from './chartRenderer';
import type {
  ChartPluginSettings,
} from './constants/settingsConstants';
import {
  DEFAULT_SETTINGS,
} from './constants/settingsConstants';
import { ChartSettingTab } from './ui/settingsTab';
import { CreationHelperModal } from './ui/creationHelperModal';
import { addIcons } from 'src/ui/icons';
import { chartFromTable } from 'src/chartFromTable';
import { renderError } from 'src/util';
import { processCommentCallouts } from 'src/commentCallout';
import { processSubscriptSuperscript } from 'src/subscriptSuperscript';
import { renderAbcBlock } from 'src/abcRenderer';
import { renderMapBlock, getLeaflet, setLeaflet } from 'src/mapRenderer';
import { renderTimelineBlock } from 'src/timelineRenderer';

declare global {
  interface Window {
    Plot: any;
    d3: any;
    L: any;
    Leaflet: any;
    renderChart: (data: any, el: HTMLElement) => Promise<any>;
  }
}

export default class ChartPlugin extends Plugin {
  settings!: ChartPluginSettings;
  renderer!: Renderer;

  postprocessor = async (
    content: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ) => {
    let data;
    try {
      data = await parseYaml(content.replace(/\t/g, '    '));
    } catch (error) {
      renderError(error, el);
      return;
    }
    if (!data.id) {
      if (!data || !data.type || !data.labels || !data.series) {
        renderError('Missing type, labels or series', el);
        return;
      }
    }
    if (data.bestFit === true && String(data.type ?? '').toLowerCase() === 'line' && Array.isArray(data.series) && data.series.length > 0) {
      const seriesIndex = data.bestFitNumber !== undefined && !isNaN(Number(data.bestFitNumber))
        ? Math.min(Math.max(0, Number(data.bestFitNumber)), data.series.length - 1)
        : 0;

      const targetSeries = data.series[seriesIndex];
      const rawData = targetSeries?.data ?? [];

      if (Array.isArray(rawData) && rawData.length > 0) {
        const n = rawData.length;
        const labels = Array.isArray(data.labels) ? data.labels : [];

        // Performance optimization: Single-pass linear regression calculation.
        // Check if labels form a valid numeric sequence while evaluating numerical x/y values,
        // avoiding repeated O(N) array mappings, Array.from, and labels.every passes.
        let isNumericLabels = labels.length === n;
        if (isNumericLabels) {
          for (let i = 0; i < n; i++) {
            const l = labels[i];
            if (!(typeof l === 'number' || (typeof l === 'string' && l !== '' && !isNaN(Number(l))))) {
              isNumericLabels = false;
              break;
            }
          }
        }

        const xVals = new Float64Array(n);
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

        for (let i = 0; i < n; i++) {
          const x = isNumericLabels ? Number(labels[i]) : i;
          const rawY = rawData[i];
          const y = typeof rawY === 'number' ? rawY : Number(rawY) || 0;

          xVals[i] = x;
          sumX += x;
          sumY += y;
          sumXY += x * y;
          sumX2 += x * x;
        }

        const denom = n * sumX2 - sumX * sumX;
        if (denom !== 0) {
          const slope = (n * sumXY - sumX * sumY) / denom;
          const intercept = (sumY - slope * sumX) / n;

          const fittedY = new Array(n);
          for (let i = 0; i < n; i++) {
            fittedY[i] = slope * xVals[i] + intercept;
          }

          const title = (data.bestFitTitle !== undefined && data.bestFitTitle !== 'undefined' && String(data.bestFitTitle).trim() !== '')
            ? String(data.bestFitTitle)
            : 'Line of Best Fit';

          data.series.push({
            title,
            data: fittedY,
          });
        }
      }
    }
    await this.renderer.renderFromYaml(data, el, ctx);
  };

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async onload() {
    console.log('loading plugin: insightpage-style');

    await this.loadSettings();

    this.renderer = new Renderer(this);

    // Optimize startup time and RAM: lazy-load window.Plot, window.d3, and window.L on first access
    Object.defineProperty(window, 'Plot', {
      configurable: true,
      enumerable: false,
      get: () => getPlot(),
      set: (v) => setPlot(v),
    });
    Object.defineProperty(window, 'd3', {
      configurable: true,
      enumerable: false,
      get: () => getD3(),
      set: (v) => setD3(v),
    });
    Object.defineProperty(window, 'L', {
      configurable: true,
      enumerable: false,
      get: () => getLeaflet(),
      set: (v) => setLeaflet(v),
    });
    Object.defineProperty(window, 'Leaflet', {
      configurable: true,
      enumerable: false,
      get: () => getLeaflet(),
      set: (v) => setLeaflet(v),
    });
    window.renderChart = async (data: any, el: HTMLElement) =>
      await this.renderer.renderRaw(data, el);

    this.registerMarkdownPostProcessor((el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
      processSubscriptSuperscript(el);
      processCommentCallouts(el);
    });

    this.registerMarkdownCodeBlockProcessor('chart', this.postprocessor);

    this.registerMarkdownCodeBlockProcessor(
      'advanced-chart',
      async (data: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        try {
          const parsed = JSON.parse(data);
          await this.renderer.renderRaw(parsed, el, ctx?.sourcePath ?? '');
        } catch {
          await this.renderer.renderRaw(data, el, ctx?.sourcePath ?? '');
        }
      }
    );

    const renderJsChart = async (code: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
      await this.renderer.renderRaw(code, el, ctx?.sourcePath ?? '');
    };

    this.registerMarkdownCodeBlockProcessor('plot', renderJsChart);
    this.registerMarkdownCodeBlockProcessor('observable', renderJsChart);
    this.registerMarkdownCodeBlockProcessor('js-chart', renderJsChart);

    const renderAbc = (source: string, el: HTMLElement) => {
      renderAbcBlock(source, el);
    };
    this.registerMarkdownCodeBlockProcessor('abc', renderAbc);
    this.registerMarkdownCodeBlockProcessor('abcjs', renderAbc);

    const renderMap = (source: string, el: HTMLElement) => {
      renderMapBlock(source, el);
    };
    this.registerMarkdownCodeBlockProcessor('map', renderMap);
    this.registerMarkdownCodeBlockProcessor('leaflet', renderMap);

    const renderTimeline = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
      renderTimelineBlock(source, el, ctx, this.app);
    };
    this.registerMarkdownCodeBlockProcessor('timeline', renderTimeline);
    this.registerMarkdownCodeBlockProcessor('timeline-chart', renderTimeline);
    this.registerMarkdownCodeBlockProcessor('event-timeline', renderTimeline);

    // Defer non-critical UI setup (icons, commands, settings tab, editor menu event) until workspace is ready
    this.app.workspace.onLayoutReady(() => {
      addIcons();

      this.addSettingTab(new ChartSettingTab(this.app, this));

      this.addCommand({
        id: 'creation-helper',
        name: 'Insert new Chart',
        checkCallback: (checking: boolean) => {
          let leaf = this.app.workspace.activeLeaf;
          if (leaf && leaf.view instanceof MarkdownView) {
            if (!checking) {
              new CreationHelperModal(
                this.app,
                leaf.view,
                this.settings,
                this.renderer
              ).open();
            }
            return true;
          }
          return false;
        },
      });

      this.addCommand({
        id: 'chart-from-table-column',
        name: 'Create Chart from Table (Column oriented Layout)',
        editorCheckCallback: (
          checking: boolean,
          editor: Editor,
          ctx: MarkdownView | MarkdownFileInfo
        ) => {
          let selection = editor.getSelection();
          if (
            ctx instanceof MarkdownView &&
            selection.split('\n').length >= 3 &&
            selection.split('|').length >= 2
          ) {
            if (!checking) {
              chartFromTable(editor, 'columns');
            }
            return true;
          }
          return false;
        },
      });

      this.addCommand({
        id: 'chart-from-table-row',
        name: 'Create Chart from Table (Row oriented Layout)',
        editorCheckCallback: (
          checking: boolean,
          editor: Editor,
          ctx: MarkdownView | MarkdownFileInfo
        ) => {
          if (
            ctx instanceof MarkdownView &&
            editor.getSelection().split('\n').length >= 3 &&
            editor.getSelection().split('|').length >= 2
          ) {
            if (!checking) {
              chartFromTable(editor, 'rows');
            }
            return true;
          }
          return false;
        },
      });

      // Editor mode menu
      this.registerEvent(
        (this.app.workspace.on as any)(
          'editor-menu',
          (menu: Menu, _: Editor, view: MarkdownView) => {
            if (view && this.settings.contextMenu) {
              menu.addItem((item) => {
                item
                  .setTitle('Insert Chart')
                  .setIcon('chart')
                  .onClick((_) => {
                    new CreationHelperModal(
                      this.app,
                      view,
                      this.settings,
                      this.renderer
                    ).open();
                  });
              });
            }
          }
        )
      );
    });
  }

  onunload() {
    console.log('unloading plugin: insightpage-style');
    try {
      delete (window as any).Plot;
      delete (window as any).d3;
      delete (window as any).L;
      delete (window as any).Leaflet;
      delete (window as any).renderChart;
    } catch {
      // ignore
    }
  }
}
