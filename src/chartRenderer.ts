import type { MarkdownPostProcessorContext } from 'obsidian';
import { renderError } from 'src/util';
import type ChartPlugin from 'src/main';
import { createCustomFetch, toTFile } from './charts/customFetch';
import { getPlot, getD3, setPlot, setD3, wrapPlotInstance } from './charts/plotInstance';
import { prepareChartDataset, tryParseDate, type PreparedChart } from './charts/barLineRenderer';
import { executePlotJs } from './charts/plotJsRunner';
import { PlotJsRenderChild, ChartRenderChild } from './charts/chartRenderChild';

export {
  getPlot,
  setPlot,
  getD3,
  setD3,
  createCustomFetch,
  toTFile,
  wrapPlotInstance,
  tryParseDate,
  type PreparedChart,
};

export default class Renderer {
  plugin: ChartPlugin;

  constructor(plugin: ChartPlugin) {
    this.plugin = plugin;
  }

  async datasetPrep(
    yaml: unknown,
    el: HTMLElement,
    themeColors = false
  ): Promise<PreparedChart> {
    return prepareChartDataset(
      yaml,
      el,
      this.plugin.settings,
      themeColors
    );
  }

  async renderRaw(
    data: unknown,
    el: HTMLElement,
    sourcePath: string = '',
    onFileReferenced?: (filePath: string) => void
  ): Promise<HTMLElement | SVGElement | null> {
    if (typeof el.empty === 'function') {
      el.empty();
    } else if (typeof el.replaceChildren === 'function') {
      el.replaceChildren();
    } else {
      el.textContent = '';
    }

    if (!data) return null;

    try {
      // 1. Pre-rendered DOM / SVG element
      if (data instanceof HTMLElement || data instanceof SVGElement) {
        el.appendChild(data);
        return data;
      }

      // Check for object with potential PreparedChart / Plot options / Legacy properties
      if (typeof data === 'object') {
        const dataObj = data as Record<string, unknown>;

        // 2. Custom Element from datasetPrep
        if (dataObj.customElement instanceof HTMLElement || dataObj.customElement instanceof SVGElement) {
          const customEl = dataObj.customElement;
          if (typeof dataObj.width === 'string') {
            customEl.classList.add('chart-centered');
            customEl.style.width = dataObj.width;
          }
          el.appendChild(customEl);
          return customEl;
        }

        // 3. Prepared plot options from datasetPrep
        if (dataObj.plotOptions && typeof dataObj.plotOptions === 'object') {
          const plotEl = getPlot().plot(dataObj.plotOptions);
          if (typeof dataObj.width === 'string') {
            plotEl.classList.add('chart-centered');
            plotEl.style.width = dataObj.width;
          }
          el.appendChild(plotEl);
          return plotEl;
        }

        // 4. Raw Plot options directly passed
        if (Array.isArray(dataObj.marks)) {
          const plotEl = getPlot().plot(dataObj);
          el.appendChild(plotEl);
          return plotEl;
        }

        // 6. Legacy / Raw spec object conversion
        const rawYaml = (typeof dataObj.chartOptions === 'object' && dataObj.chartOptions !== null
          ? dataObj.chartOptions
          : dataObj) as Record<string, unknown>;

        const dataSub = typeof rawYaml.data === 'object' && rawYaml.data !== null
          ? (rawYaml.data as Record<string, unknown>)
          : null;

        if (dataSub && Array.isArray(dataSub.labels) && Array.isArray(dataSub.datasets)) {
          const labels = dataSub.labels;
          const series = dataSub.datasets.map((ds: unknown) => {
            const dsObj = typeof ds === 'object' && ds !== null ? (ds as Record<string, unknown>) : {};
            return {
              title: typeof dsObj.label === 'string' ? dsObj.label : '',
              data: Array.isArray(dsObj.data) ? dsObj.data : [],
            };
          });
          const optionsObj = typeof rawYaml.options === 'object' && rawYaml.options !== null
            ? (rawYaml.options as Record<string, unknown>)
            : {};
          const convertedYaml = {
            type: typeof rawYaml.type === 'string' ? rawYaml.type : 'bar',
            labels,
            series,
            ...optionsObj,
          };
          const prep = await this.datasetPrep(convertedYaml, el);
          return await this.renderRaw(prep, el, sourcePath);
        }
      }

      // 5. JavaScript code string execution (supports async/await and auto-return of last expression)
      if (typeof data === 'string') {
        return await executePlotJs(
          data,
          el,
          this.plugin?.app,
          sourcePath,
          onFileReferenced
        );
      }

      return null;
    } catch (error) {
      renderError(error, el);
      return null;
    }
  }

  async renderFromYaml(
    yaml: unknown,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ) {
    this.plugin.app.workspace.onLayoutReady(() =>
      ctx.addChild(new ChartRenderChild(yaml, el, this, ctx.sourcePath))
    );
  }

  async renderPlotJs(
    code: string,
    el: HTMLElement,
    ctx?: MarkdownPostProcessorContext
  ) {
    if (ctx && typeof ctx.addChild === 'function') {
      this.plugin.app.workspace.onLayoutReady(() =>
        ctx.addChild(new PlotJsRenderChild(code, el, this, ctx.sourcePath || ''))
      );
    } else {
      await this.renderRaw(code, el, ctx?.sourcePath ?? '');
    }
  }
}
