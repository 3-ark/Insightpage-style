import type { MarkdownPostProcessorContext } from 'obsidian';
import { renderError } from 'src/util';
import type ChartPlugin from 'src/main';
import { createCustomFetch, toTFile } from './charts/customFetch';
import { getPlot, getD3, setPlot, setD3, wrapPlotInstance } from './charts/plotInstance';
import { prepareChartDataset, tryParseDate, type PreparedChart } from './charts/barLineRenderer';
import { executePlotJs, resolveToDomElement } from './charts/plotJsRunner';
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
    yaml: any,
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
    data: any,
    el: HTMLElement,
    sourcePath: string = '',
    onFileReferenced?: (filePath: string) => void
  ): Promise<HTMLElement | SVGElement | null> {
    if (typeof (el as any).empty === 'function') {
      (el as any).empty();
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

      // 2. Custom Element from datasetPrep
      if (data.customElement instanceof HTMLElement || data.customElement instanceof SVGElement) {
        if (data.width) {
          data.customElement.classList.add('chart-centered');
          data.customElement.style.width = data.width;
        }
        el.appendChild(data.customElement);
        return data.customElement;
      }

      // 3. Prepared plot options from datasetPrep
      if (data.plotOptions) {
        const plotEl = getPlot().plot(data.plotOptions);
        if (data.width) {
          plotEl.classList.add('chart-centered');
          plotEl.style.width = data.width;
        }
        el.appendChild(plotEl);
        return plotEl;
      }

      // 4. Raw Plot options directly passed
      if (data.marks && Array.isArray(data.marks)) {
        const plotEl = getPlot().plot(data);
        el.appendChild(plotEl);
        return plotEl;
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

      // 6. Legacy / Raw spec object conversion
      if (data.type || data.chartOptions || (data.data && data.data.labels)) {
        const rawYaml = data.chartOptions ? data.chartOptions : data;
        if (rawYaml.data && rawYaml.data.labels && rawYaml.data.datasets) {
          const labels = rawYaml.data.labels;
          const series = rawYaml.data.datasets.map((ds: any) => ({
            title: ds.label ?? '',
            data: ds.data ?? [],
          }));
          const convertedYaml = {
            type: rawYaml.type ?? 'bar',
            labels,
            series,
            ...rawYaml.options,
          };
          const prep = await this.datasetPrep(convertedYaml, el);
          return await this.renderRaw(prep, el, sourcePath);
        }
      }

      return null;
    } catch (error) {
      renderError(error, el);
      return null;
    }
  }

  async renderFromYaml(
    yaml: any,
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
