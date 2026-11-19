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
    Plot?: typeof import('@observablehq/plot');
    d3?: typeof import('d3');
    L?: typeof import('leaflet');
    Leaflet?: typeof import('leaflet');
    renderChart?: (data: unknown, el: HTMLElement) => Promise<HTMLElement | SVGElement | null>;
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
    let rawParsed: unknown;
    try {
      rawParsed = await parseYaml(content.replace(/\t/g, '    '));
    } catch (error) {
      renderError(error, el);
      return;
    }
    const data = (typeof rawParsed === 'object' && rawParsed !== null ? rawParsed : {}) as Record<string, unknown>;
    const hasExternalData = typeof data.data === 'string' && data.data.trim() !== '';
    if (!data.id && !hasExternalData) {
      const typeStr = typeof data.type === 'string' ? data.type : '';
      const chartType = typeStr.toLowerCase().trim().replace(/[-_\s]/g, '');
      const isScatter = ['scatter', 'point', 'points', 'scatterplot'].includes(chartType);
      const isSankey = chartType === 'sankey';

      if (!typeStr) {
        renderError('Missing chart type', el);
        return;
      }

      if (isScatter) {
        const hasSeries = (Array.isArray(data.series) && data.series.length > 0) ||
                          (Array.isArray(data.datasets) && data.datasets.length > 0);
        const hasData = Array.isArray(data.data) && data.data.length > 0;
        if (!hasSeries && !hasData) {
          renderError('Scatter chart requires series or data', el);
          return;
        }
      } else if (isSankey) {
        const hasFlows = Array.isArray(data.links) || Array.isArray(data.flows) || Array.isArray(data.series);
        if (!hasFlows) {
          renderError('Missing links or series for sankey diagram', el);
          return;
        }
      } else if (!data.labels || !data.series) {
        renderError('Missing type, labels or series', el);
        return;
      }
    }
    const typeStr = typeof data.type === 'string' ? data.type : '';
    if (data.bestFit === true && typeStr.toLowerCase() === 'line' && Array.isArray(data.series) && data.series.length > 0) {
      const seriesList = data.series as Array<Record<string, unknown>>;
      const seriesIndex = data.bestFitNumber !== undefined && !isNaN(Number(data.bestFitNumber))
        ? Math.min(Math.max(0, Number(data.bestFitNumber)), seriesList.length - 1)
        : 0;

      const targetSeries = seriesList[seriesIndex];
      const rawData = Array.isArray(targetSeries?.data) ? (targetSeries.data as unknown[]) : [];

      if (rawData.length > 0) {
        const n = rawData.length;
        const labels = Array.isArray(data.labels) ? (data.labels as unknown[]) : [];

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

          const bestFitTitleStr = typeof data.bestFitTitle === 'string' ? data.bestFitTitle : '';
          const title = (bestFitTitleStr.trim() !== '' && bestFitTitleStr !== 'undefined')
            ? bestFitTitleStr
            : 'Line of Best Fit';

          seriesList.push({
            title,
            data: fittedY,
          });
        }
      }
    }
    await this.renderer.renderFromYaml(data, el, ctx);
  };

  async loadSettings() {
    const loadedData = (await this.loadData()) as Partial<ChartPluginSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async onload() {
    await this.loadSettings();

    this.renderer = new Renderer(this);

    // Optimize startup time and RAM: lazy-load window.Plot, window.d3, and window.L on first access
    Object.defineProperty(window, 'Plot', {
      configurable: true,
      enumerable: false,
      get: () => getPlot(),
      set: (v: typeof import('@observablehq/plot')) => setPlot(v),
    });
    Object.defineProperty(window, 'd3', {
      configurable: true,
      enumerable: false,
      get: () => getD3(),
      set: (v: typeof import('d3')) => setD3(v),
    });
    Object.defineProperty(window, 'L', {
      configurable: true,
      enumerable: false,
      get: () => getLeaflet(),
      set: (v: typeof import('leaflet')) => setLeaflet(v),
    });
    Object.defineProperty(window, 'Leaflet', {
      configurable: true,
      enumerable: false,
      get: () => getLeaflet(),
      set: (v: typeof import('leaflet')) => setLeaflet(v),
    });
    window.renderChart = async (data: unknown, el: HTMLElement) =>
      await this.renderer.renderRaw(data, el);

    this.registerMarkdownPostProcessor((el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
      processSubscriptSuperscript(el);
      processCommentCallouts(el);
    });

    this.registerMarkdownCodeBlockProcessor('chart', this.postprocessor);
    this.registerMarkdownCodeBlockProcessor('scatter', this.postprocessor);
    this.registerMarkdownCodeBlockProcessor('scatterplot', this.postprocessor);

    this.registerMarkdownCodeBlockProcessor(
      'advanced-chart',
      async (data: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        try {
          const parsed = JSON.parse(data) as unknown;
          await this.renderer.renderRaw(parsed, el, ctx?.sourcePath ?? '');
        } catch {
          await this.renderer.renderRaw(data, el, ctx?.sourcePath ?? '');
        }
      }
    );

    const renderJsChart = async (code: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
      await this.renderer.renderPlotJs(code, el, ctx);
    };

    this.registerMarkdownCodeBlockProcessor('plot', renderJsChart);
    this.registerMarkdownCodeBlockProcessor('observable', renderJsChart);
    this.registerMarkdownCodeBlockProcessor('observableplot', renderJsChart);

    const renderAbc = (source: string, el: HTMLElement) => {
      renderAbcBlock(source, el);
    };
    this.registerMarkdownCodeBlockProcessor('abc', renderAbc);
    this.registerMarkdownCodeBlockProcessor('abcjs', renderAbc);

    const renderMap = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
      renderMapBlock(source, el, ctx);
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
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (view) {
            if (!checking) {
              new CreationHelperModal(
                this.app,
                view,
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
          const selection = editor.getSelection();
          if (
            ctx instanceof MarkdownView &&
            selection.split('\n').length >= 3 &&
            selection.split('|').length >= 2
          ) {
            if (!checking) {
              void chartFromTable(editor, 'columns');
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
              void chartFromTable(editor, 'rows');
            }
            return true;
          }
          return false;
        },
      });

      // Editor mode menu
      this.registerEvent(
        this.app.workspace.on(
          'editor-menu',
          (menu: Menu, _: Editor, view: MarkdownView | MarkdownFileInfo) => {
            if (view instanceof MarkdownView && this.settings.contextMenu) {
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
    try {
      Reflect.deleteProperty(window, 'Plot');
      Reflect.deleteProperty(window, 'd3');
      Reflect.deleteProperty(window, 'L');
      Reflect.deleteProperty(window, 'Leaflet');
      Reflect.deleteProperty(window, 'renderChart');
    } catch {
      // ignore
    }
  }
}
