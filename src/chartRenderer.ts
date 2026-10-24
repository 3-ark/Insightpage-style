import type * as Plot from '@observablehq/plot';
import type * as d3 from 'd3';
import type { MarkdownPostProcessorContext, TFile } from 'obsidian';
import { MarkdownRenderChild } from 'obsidian';
import { generateInnerColors, renderError } from 'src/util';
import type ChartPlugin from 'src/main';
import { generateTableData } from 'src/chartFromTable';
import { renderPieChart } from './charts/pieRenderer';
import { renderRadarChart } from './charts/radarRenderer';
import { renderSankeyChart } from './charts/sankeyRenderer';

let _Plot: typeof import('@observablehq/plot') | null = null;
let _d3: typeof import('d3') | null = null;

export function getPlot(): typeof import('@observablehq/plot') {
  if (!_Plot) {
    const loaded = require('@observablehq/plot');
    _Plot = loaded.default ?? loaded;
  }
  return _Plot!;
}

export function setPlot(val: any): void {
  _Plot = val;
}

export function getD3(): typeof import('d3') {
  if (!_d3) {
    const loaded = require('d3');
    _d3 = loaded.default ?? loaded;
  }
  return _d3!;
}

export function setD3(val: any): void {
  _d3 = val;
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export interface PreparedChart {
  plotOptions: Plot.PlotOptions | null;
  customElement?: HTMLElement | SVGElement;
  width?: string;
}

export function createCustomFetch(app: any, obsidianModule: any, sourcePath: string = '') {
  return async function customFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlString =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : (input as Request).url;

    if (/^https?:\/\//i.test(urlString)) {
      if (obsidianModule && typeof obsidianModule.requestUrl === 'function') {
        try {
          const reqOptions: any = { url: urlString };
          if (init) {
            if (init.method) reqOptions.method = init.method;
            if (init.headers) reqOptions.headers = init.headers;
            if (init.body) reqOptions.body = init.body;
          }
          const res = await obsidianModule.requestUrl(reqOptions);
          return new Response(res.arrayBuffer || res.text, {
            status: res.status,
            headers: res.headers,
          });
        } catch {
          // Fallback if requestUrl fails
        }
      }
      if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
        return window.fetch(input, init);
      }
    }

    // Local vault relative path
    const normalizedPath = urlString.replace(/^\.?\//, '');
    let file: TFile | null = null;

    if (app?.vault) {
      if (typeof app.vault.getAbstractFileByPath === 'function') {
        file = app.vault.getAbstractFileByPath(normalizedPath) as TFile;
      }
      if (!file && app.metadataCache && typeof app.metadataCache.getFirstLinkpathDest === 'function') {
        file = app.metadataCache.getFirstLinkpathDest(normalizedPath, sourcePath) as TFile;
      }

      if (file) {
        if (typeof app.vault.readBinary === 'function') {
          const buffer = await app.vault.readBinary(file);
          return new Response(buffer, { status: 200, statusText: 'OK' });
        }
        if (typeof app.vault.read === 'function') {
          const text = await app.vault.read(file);
          return new Response(text, { status: 200, statusText: 'OK' });
        }
      }

      if (app.vault.adapter) {
        try {
          if (typeof app.vault.adapter.readBinary === 'function') {
            const buffer = await app.vault.adapter.readBinary(normalizedPath);
            return new Response(buffer, { status: 200, statusText: 'OK' });
          }
          if (typeof app.vault.adapter.read === 'function') {
            const text = await app.vault.adapter.read(normalizedPath);
            return new Response(text, { status: 200, statusText: 'OK' });
          }
        } catch {
          // Adapter read failed
        }
      }
    }

    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      return window.fetch(input, init);
    }

    throw new TypeError(`Failed to fetch local vault file: ${urlString}`);
  };
}

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
    if (!yaml || typeof yaml !== 'object') {
      return { plotOptions: null, width: '100%' };
    }

    const computedStyle = getComputedStyle(el);

    const colors: string[] = [];
    if (this.plugin.settings.themeable || themeColors) {
      let i = 1;
      while (true) {
        let color = computedStyle.getPropertyValue(`--chart-color-${i}`);
        if (color) {
          colors.push(color.trim());
          i++;
        } else {
          break;
        }
      }
    }
    const baseColors = colors.length
      ? colors
      : this.plugin.settings.colors.map((c) => c.trim());

    const transparency = yaml.transparency ?? 0.25;
    const innerColors = generateInnerColors(baseColors, transparency);

    const labels: any[] = yaml.labels ?? [];
    const rawSeries: any[] = yaml.series ?? [];

    const dataPoints: Array<{
      x: any;
      y: number;
      series: string;
      index: number;
      seriesIndex: number;
    }> = [];

    for (let i = 0; i < rawSeries.length; i++) {
      const s = rawSeries[i];
      const seriesTitle = s.title ?? `Series ${i + 1}`;
      const seriesData = s.data ?? [];
      for (let j = 0; j < seriesData.length; j++) {
        const xVal = labels[j] !== undefined ? labels[j] : j;
        const val = seriesData[j];
        const numVal = typeof val === 'number' ? val : Number(val);
        const yVal = isNaN(numVal) ? 0 : numVal;
        dataPoints.push({
          x: xVal,
          y: yVal,
          series: seriesTitle,
          index: j,
          seriesIndex: i,
        });
      }
    }

    const type = String(yaml.type ?? 'bar').trim().toLowerCase();
    const gridColor =
      computedStyle.getPropertyValue('--background-modifier-border') ||
      '#e0e0e0';
    const textColor =
      yaml.textColor ||
      computedStyle.getPropertyValue('--text-muted') ||
      'currentColor';

    const widthStr = yaml.width ? String(yaml.width) : '100%';

    // Custom SVG rendering for Pie / Doughnut / Donut
    if (type === 'pie' || type === 'doughnut' || type === 'donut') {
      return renderPieChart(yaml, dataPoints, labels, baseColors, gridColor, textColor, widthStr, getD3);
    }

    // Custom SVG rendering for Radar / PolarArea
    if (type === 'radar' || type === 'polararea' || type === 'polar_area') {
      return renderRadarChart(yaml, dataPoints, labels, baseColors, innerColors, gridColor, textColor, widthStr, getD3);
    }

    // Custom SVG rendering for Sankey
    if (type === 'sankey') {
      return renderSankeyChart(yaml, rawSeries, baseColors, textColor, widthStr);
    }

    // Standard Plot marks for Bar and Line charts with interactivity (tip: true)
    const marks: any[] = [];
    const isHorizontal = yaml.indexAxis === 'y';
    const isStacked = yaml.stacked === true;
    const curve = yaml.tension ? 'catmull-rom' : 'linear';

    const PlotInst = getPlot();

    if (type === 'line') {
      if (yaml.fill) {
        marks.push(
          PlotInst.areaY(dataPoints, {
            x: 'x',
            y: 'y',
            fill: 'series',
            fillOpacity: yaml.transparency ?? 0.25,
            curve,
          })
        );
      }
      marks.push(
        PlotInst.lineY(dataPoints, {
          x: 'x',
          y: 'y',
          stroke: 'series',
          curve,
          strokeWidth: 2,
        })
      );
      marks.push(
        PlotInst.dot(dataPoints, {
          x: 'x',
          y: 'y',
          fill: 'series',
          r: 4,
          tip: true,
          title: (d: any) => `${d.series}\n${d.x}: ${d.y}`,
        })
      );
    } else {
      // Default / Bar
      if (isHorizontal) {
        if (isStacked) {
          marks.push(
            PlotInst.barX(dataPoints, {
              x: 'y',
              y: 'x',
              fill: 'series',
              tip: true,
              title: (d: any) => `${d.series}\n${d.x}: ${d.y}`,
            })
          );
        } else {
          marks.push(
            PlotInst.barX(dataPoints, {
              y: 'series',
              x: 'y',
              fy: 'x',
              fill: 'series',
              tip: true,
              title: (d: any) => `${d.series}\n${d.x}: ${d.y}`,
            })
          );
        }
      } else {
        if (isStacked) {
          marks.push(
            PlotInst.barY(dataPoints, {
              x: 'x',
              y: 'y',
              fill: 'series',
              tip: true,
              title: (d: any) => `${d.series}\n${d.x}: ${d.y}`,
            })
          );
        } else {
          marks.push(
            PlotInst.barY(dataPoints, {
              x: 'series',
              y: 'y',
              fx: 'x',
              fill: 'series',
              tip: true,
              title: (d: any) => `${d.series}\n${d.x}: ${d.y}`,
            })
          );
        }
      }
    }

    // Legend
    const colorScale: Plot.ScaleOptions = {
      legend: yaml.legend !== false,
      range: baseColors,
    };

    const xOptions: Plot.ScaleOptions = {
      label: yaml.xTitle ?? null,
      domain: yaml.xMin !== undefined && yaml.xMax !== undefined ? [yaml.xMin, yaml.xMax] : undefined,
      reverse: yaml.xReverse,
      axis: yaml.xDisplay === false ? null : undefined,
    };

    const yOptions: Plot.ScaleOptions = {
      label: yaml.yTitle ?? null,
      domain: yaml.yMin !== undefined && yaml.yMax !== undefined ? [yaml.yMin, yaml.yMax] : undefined,
      reverse: yaml.yReverse,
      zero: yaml.beginAtZero ?? true,
      axis: yaml.yDisplay === false ? null : undefined,
    };

    const plotOptions: Plot.PlotOptions = {
      style: {
        background: 'transparent',
        color: textColor,
      },
      grid: true,
      x: xOptions,
      y: yOptions,
      color: colorScale,
      marks,
    };

    return { plotOptions, width: widthStr };
  }

  async renderRaw(data: any, el: HTMLElement, sourcePath: string = ''): Promise<HTMLElement | SVGElement | null> {
    if (typeof (el as any).empty === 'function') {
      (el as any).empty();
    } else {
      el.innerHTML = '';
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
          data.customElement.style.width = data.width;
          data.customElement.style.margin = 'auto';
        }
        el.appendChild(data.customElement);
        return data.customElement;
      }

      // 3. Prepared plot options from datasetPrep
      if (data.plotOptions) {
        const plotEl = getPlot().plot(data.plotOptions);
        if (data.width) {
          plotEl.style.width = data.width;
          plotEl.style.margin = 'auto';
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
        let code = data.trim();

        // Strip code fences if present in the string
        if (code.startsWith('```')) {
          code = code.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '').trim();
        }

        let obsidianModule: any = {};
        if (typeof require === 'function') {
          try {
            obsidianModule = require('obsidian');
          } catch {
            // Fallback if obsidian module not present
          }
        }

        const customFetch = createCustomFetch(this.plugin.app, obsidianModule, sourcePath);

        const PlotInst = getPlot();
        const d3Inst = getD3();

        let fn = new AsyncFunction('Plot', 'd3', 'el', 'container', 'app', 'obsidian', 'fetch', code);
        let result = await fn(PlotInst, d3Inst, el, el, this.plugin.app, obsidianModule, customFetch);

        // If result is undefined, try auto-prefixing 'return ' to statements backwards
        if (result === undefined) {
          const lines = code.split('\n');
          for (let i = lines.length - 1; i >= 0; i--) {
            const lineTrimmed = lines[i].trim();
            if (!lineTrimmed || lineTrimmed.startsWith('//')) continue;
            if (lineTrimmed.startsWith('return')) break;

            const copy = [...lines];
            copy[i] = 'return ' + copy[i];
            try {
              const fn2 = new AsyncFunction('Plot', 'd3', 'el', 'container', 'app', 'obsidian', 'fetch', copy.join('\n'));
              const res2 = await fn2(PlotInst, d3Inst, el, el, this.plugin.app, obsidianModule, customFetch);
              if (res2 !== undefined) {
                result = res2;
                break;
              }
            } catch (e) {
              // Ignore syntax error and try previous line
            }
          }
        }

        let domElement: HTMLElement | SVGElement | null = null;

        if (result instanceof HTMLElement || result instanceof SVGElement) {
          domElement = result;
        } else if (result && typeof result.plot === 'function') {
          try {
            const plotEl = result.plot();
            if (plotEl instanceof HTMLElement || plotEl instanceof SVGElement) {
              domElement = plotEl;
            }
          } catch (e) {
            // Ignore plot error
          }
        } else if (result && (Array.isArray(result) || result.marks)) {
          try {
            const plotEl = PlotInst.plot(Array.isArray(result) ? { marks: result } : result);
            if (plotEl instanceof HTMLElement || plotEl instanceof SVGElement) {
              domElement = plotEl;
            }
          } catch (e) {
            // Ignore plot error
          }
        } else if (result && typeof result.node === 'function') {
          try {
            const nodeEl = result.node();
            if (nodeEl instanceof HTMLElement || nodeEl instanceof SVGElement) {
              domElement = nodeEl;
            }
          } catch (e) {
            // Ignore node error
          }
        }

        if (domElement) {
          el.appendChild(domElement);
          return domElement;
        }
        return null;
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
}

class ChartRenderChild extends MarkdownRenderChild {
  data: any;
  chartEl: HTMLElement | SVGElement | null = null;
  renderer: Renderer;
  ownPath: string;
  el: HTMLElement;

  constructor(
    data: any,
    el: HTMLElement,
    renderer: Renderer,
    ownPath: string
  ) {
    super(el);
    this.el = el;
    this.data = data;
    this.renderer = renderer;
    this.ownPath = ownPath;
    this.changeHandler = this.changeHandler.bind(this);
    this.reload = this.reload.bind(this);
  }

  async onload() {
    try {
      if (this.data.id) {
        let activeFile = this.renderer.plugin.app?.workspace?.getActiveFile() ?? null;
        let activePath = activeFile ? activeFile.path : '';
        let linkDest: TFile | null = this.data.file
          ? (this.renderer.plugin.app?.metadataCache?.getFirstLinkpathDest(
              this.data.file,
              activePath
            ) ?? null)
          : null;
        const fileToRead = (this.data.file
          ? linkDest
          : this.renderer.plugin.app?.vault?.getAbstractFileByPath(
              this.ownPath
            ) ?? activeFile) as TFile | null;

        if (!fileToRead) {
          throw 'Invalid id and/or file';
        }

        const fileCache =
          fileToRead ? (this.renderer.plugin.app?.metadataCache?.getFileCache(fileToRead) ?? null) : null;

        const cleanId = String(this.data.id).replace(/^\^/, '');
        const caretId = '^' + cleanId;

        let pos: any = undefined;

        if (fileCache?.blocks) {
          const exactBlock = fileCache.blocks[cleanId] ?? fileCache.blocks[caretId];
          if (exactBlock) {
            pos = exactBlock.position;
          } else {
            const cleanLower = cleanId.toLowerCase();
            for (const k in fileCache.blocks) {
              if (k.toLowerCase() === cleanLower) {
                pos = fileCache.blocks[k]?.position;
                break;
              }
            }
          }
        }

        if (!pos && fileCache?.sections) {
          const cleanLower = cleanId.toLowerCase();
          const sec = fileCache.sections.find(
            (pre: any) =>
              pre.id === cleanId ||
              pre.id === caretId ||
              pre.id === this.data.id ||
              (pre.id && pre.id.toLowerCase() === cleanLower)
          );
          if (sec) {
            pos = sec.position;
          }
        }

        if (!pos) {
          throw 'Invalid id and/or file';
        }

        const tableString = (
          await this.renderer.plugin.app.vault.cachedRead(fileToRead)
        ).substring(pos.start.offset, pos.end.offset);

        let tableData;
        try {
          tableData = generateTableData(
            tableString,
            this.data.layout ?? 'columns',
            this.data.select
          );
        } catch (error) {
          throw 'There is no table at that id and/or file';
        }

        const mergedYaml = {
          ...this.data,
          labels: tableData.labels,
          series: tableData.dataFields.map((df) => ({
            title: df.dataTitle,
            data: df.data,
          })),
        };

        const updatedPrep = await this.renderer.datasetPrep(mergedYaml, this.el);
        this.chartEl = await this.renderer.renderRaw(updatedPrep, this.containerEl, this.ownPath);
      } else {
        const preparedData = await this.renderer.datasetPrep(this.data, this.el);
        this.chartEl = await this.renderer.renderRaw(preparedData, this.containerEl, this.ownPath);
      }
    } catch (error) {
      renderError(error, this.el);
    }

    if (this.data.id) {
      this.renderer.plugin.app.metadataCache.on(
        'changed',
        this.changeHandler as any
      );
    }
    this.renderer.plugin.app.workspace.on('css-change', this.reload);
  }

  changeHandler(file?: TFile) {
    if (!file) return;
    if (
      this.data.file
        ? file.basename === this.data.file || file.name === this.data.file
        : file.path === this.ownPath
    ) {
      this.reload();
    }
  }

  reload() {
    this.onunload();
    this.onload();
  }

  onunload() {
    this.renderer.plugin.app?.metadataCache?.off(
      'changed',
      this.changeHandler as any
    );
    this.renderer.plugin.app?.workspace?.off('css-change', this.reload);
    if (typeof this.el.empty === 'function') {
      this.el.empty();
    } else {
      this.el.innerHTML = '';
    }
    this.chartEl = null;
  }
}
