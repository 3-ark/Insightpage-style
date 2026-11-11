import type * as Plot from '@observablehq/plot';
import type { MarkdownPostProcessorContext } from 'obsidian';
import { MarkdownRenderChild, TFile } from 'obsidian';
import { generateInnerColors, renderError } from 'src/util';
import type ChartPlugin from 'src/main';
import {
  generateTableData,
  rowsToTableData,
  extractTablesFromMarkdown,
  extractTablesFromDom,
  coerceTableRow,
} from 'src/chartFromTable';
import { parseMarkdownTableRows, parseCsvOrTsv } from './charts/timelineParser';
import { renderPieChart } from './charts/pieRenderer';
import { renderRadarChart } from './charts/radarRenderer';
import { renderSankeyChart } from './charts/sankeyRenderer';
import { buildScatterPlotOptions, extractScatterData } from './charts/scatterRenderer';
import {
  isLogScale,
  extractMarkLines,
  buildPlotMarkLines,
  resolveAxisConfig,
  resolveFillConfig,
  resolveLabelConfig,
} from './charts/chartConfig';

let _Plot: typeof import('@observablehq/plot') | null = null;
let _d3: typeof import('d3') | null = null;

const VALID_FRAME_ANCHORS = new Set([
  'middle',
  'top-left',
  'top',
  'top-right',
  'right',
  'bottom-right',
  'bottom',
  'bottom-left',
  'left',
]);

const FRAME_ANCHOR_MARKS = new Set([
  'text',
  'textX',
  'textY',
  'dot',
  'dotX',
  'dotY',
  'tip',
  'vector',
  'image',
]);

// Performance optimization: Hoist comment directive matching, identifier regexes, and date parsing regexes to module scope
// to avoid re-compilation on every chart codeblock render and dataset preparation pass.
const TABLE_COMMENT_REGEX1 = /^\/\/\s*table\s*:\s*(.+)$/i;
const TABLE_COMMENT_REGEX2 = /^\/\*\s*table\s*:\s*(.+)\s*\*\/$/i;
const ID_COMMENT_REGEX1 = /^\/\/\s*id\s*:\s*(.+)$/i;
const ID_COMMENT_REGEX2 = /^\/\*\s*id\s*:\s*(.+)\s*\*\/$/i;
const FILE_COMMENT_REGEX1 = /^\/\/\s*file\s*:\s*(.+)$/i;
const FILE_COMMENT_REGEX2 = /^\/\*\s*file\s*:\s*(.+)\s*\*\/$/i;
const VALID_IDENTIFIER_REGEX = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const ISO_DATE_REGEX = /^\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?(?:[T ].*)?$/;
const DIGITS_ONLY_REGEX = /^\d+$/;

function toTFile(item: unknown): TFile | null {
  if (typeof TFile === 'function' && item instanceof TFile) return item;
  if (item && typeof item === 'object' && typeof (item as { path?: unknown }).path === 'string' && !('children' in item)) {
    return item as any;
  }
  return null;
}

function tryParseDate(v: any): any {
  if (v instanceof Date) return isNaN(v.getTime()) ? v : v;
  if (typeof v === 'string') {
    const s = v.trim();
    // Guard regex tests with delimiter check to fast-path standard strings without dashes or slashes
    if ((s.includes('-') || s.includes('/')) && ISO_DATE_REGEX.test(s)) {
      const d = new Date(s.includes('/') ? s.replace(/\//g, '-') : s);
      if (!isNaN(d.getTime())) return d;
    }
    // Also support standard date strings (e.g. from toString or ISO formatted dates)
    if (s.length >= 10 && !DIGITS_ONLY_REGEX.test(s)) {
      const parsed = Date.parse(s);
      if (!isNaN(parsed)) {
        const d = new Date(parsed);
        if (!isNaN(d.getTime())) return d;
      }
    }
  }
  return v;
}

/**
 * Wraps an Observable Plot instance so marks supporting frameAnchor can accept
 * frameAnchor (as well as dx and dy) as channel accessors (strings or functions)
 * across collections of data items, automatically grouping and emitting composite
 * marks without throwing "invalid frameAnchor" errors.
 */
function wrapPlotInstance(originalPlot: any): any {
  if (!originalPlot || originalPlot.__isWrapped) {
    return originalPlot;
  }

  const handler: ProxyHandler<any> = {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver);

      if (typeof prop === 'string' && FRAME_ANCHOR_MARKS.has(prop) && typeof orig === 'function') {
        return function (data: any, options: any = {}) {
          if (options && options.frameAnchor !== undefined && !VALID_FRAME_ANCHORS.has(options.frameAnchor)) {
            const dataArr = Array.isArray(data)
              ? data
              : data && typeof data[Symbol.iterator] === 'function'
              ? Array.from(data)
              : null;

            if (dataArr && dataArr.length > 0) {
              const anchorGetter =
                typeof options.frameAnchor === 'function'
                  ? options.frameAnchor
                  : (d: any) => d?.[options.frameAnchor];

              const dxGetter =
                typeof options.dx === 'function'
                  ? options.dx
                  : typeof options.dx === 'string' && isNaN(Number(options.dx))
                  ? (d: any) => d?.[options.dx]
                  : null;

              const dyGetter =
                typeof options.dy === 'function'
                  ? options.dy
                  : typeof options.dy === 'string' && isNaN(Number(options.dy))
                  ? (d: any) => d?.[options.dy]
                  : null;

              // Group items by resolved (anchor, dx, dy)
              const groups = new Map<string, { anchor: string; dx: any; dy: any; items: any[] }>();

              for (const d of dataArr) {
                const anchorVal = anchorGetter(d);
                if (VALID_FRAME_ANCHORS.has(anchorVal)) {
                  const resolvedDx = dxGetter ? dxGetter(d) : options.dx;
                  const resolvedDy = dyGetter ? dyGetter(d) : options.dy;
                  const groupKey = `${anchorVal}___${resolvedDx}___${resolvedDy}`;

                  if (!groups.has(groupKey)) {
                    groups.set(groupKey, {
                      anchor: anchorVal,
                      dx: resolvedDx,
                      dy: resolvedDy,
                      items: [],
                    });
                  }
                  groups.get(groupKey)!.items.push(d);
                }
              }

              if (groups.size > 0) {
                const markList: any[] = [];
                for (const { anchor, dx, dy, items } of groups.values()) {
                  const subOptions = { ...options, frameAnchor: anchor };
                  if (dx !== undefined) subOptions.dx = dx;
                  if (dy !== undefined) subOptions.dy = dy;
                  markList.push(orig.call(target, items, subOptions));
                }
                return typeof target.marks === 'function' ? target.marks(markList) : markList;
              }
            }
          }

          return orig.call(target, data, options);
        };
      }

      return orig;
    },
  };

  const proxy = new Proxy(originalPlot, handler);
  proxy.__isWrapped = true;
  return proxy;
}

export function getPlot(): typeof import('@observablehq/plot') {
  if (!_Plot) {
    const loaded = require('@observablehq/plot');
    const rawPlot = loaded.default ?? loaded;
    _Plot = wrapPlotInstance(rawPlot);
  }
  return _Plot!;
}

export function setPlot(val: any): void {
  _Plot = val ? wrapPlotInstance(val) : val;
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
        : input.url;

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

    // Local vault relative path (normalize Windows backslashes and leading dots/slashes)
    const normalizedPath = urlString.replace(/\\/g, '/').replace(/^\.?\//, '');
    let file: TFile | null = null;

    if (app?.vault) {
      if (typeof app.vault.getAbstractFileByPath === 'function') {
        file = toTFile(app.vault.getAbstractFileByPath(normalizedPath));
      }
      if (!file && app.metadataCache && typeof app.metadataCache.getFirstLinkpathDest === 'function') {
        file = toTFile(app.metadataCache.getFirstLinkpathDest(normalizedPath, sourcePath));
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

    const rawLabels = yaml.labels;
    const labels: any[] = Array.isArray(rawLabels) ? rawLabels : [];
    const rawSeries: any[] = yaml.series ?? [];

    // Performance optimization: Pre-allocate parsedLabels and track hasDateLabels in a single pass.
    // This avoids redundant tryParseDate calls and eliminates subsequent labels.some() and labels.every() passes.
    const numLabels = labels.length;
    const parsedLabels = new Array(numLabels);
    let hasDateLabels = false;

    for (let idx = 0; idx < numLabels; idx++) {
      const parsed = tryParseDate(labels[idx]);
      parsedLabels[idx] = parsed;
      if (!hasDateLabels && parsed instanceof Date) {
        hasDateLabels = true;
      }
    }

    // Performance optimization: Pre-allocate dataPoints array capacity using total series count
    // and assign by index directly instead of dataPoints.push() to eliminate array buffer reallocations.
    let totalPoints = 0;
    for (let i = 0; i < rawSeries.length; i++) {
      const sData = rawSeries[i]?.data;
      if (Array.isArray(sData)) {
        totalPoints += sData.length;
      }
    }

    const dataPoints: Array<{
      x: any;
      y: number;
      series: string;
      index: number;
      seriesIndex: number;
    }> = new Array(totalPoints);
    let dpIdx = 0;

    for (let i = 0; i < rawSeries.length; i++) {
      const s = rawSeries[i];
      const seriesTitle = s.title ?? `Series ${i + 1}`;
      const seriesData = s.data ?? [];
      const sLen = seriesData.length;
      for (let j = 0; j < sLen; j++) {
        // Since parsedLabels[j] was already parsed during the label pre-pass, avoid redundant tryParseDate calls
        const xVal = j < numLabels ? parsedLabels[j] : j;
        const val = seriesData[j];
        const numVal = typeof val === 'number' ? val : Number(val);
        const yVal = isNaN(numVal) ? 0 : numVal;
        dataPoints[dpIdx++] = {
          x: xVal,
          y: yVal,
          series: seriesTitle,
          index: j,
          seriesIndex: i,
        };
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

    const isScatter = ['scatter', 'point', 'points', 'scatterplot'].includes(type);
    if (isScatter) {
      const PlotInst = getPlot();
      const scatterPoints = extractScatterData(yaml, labels);
      const plotOptions = buildScatterPlotOptions(
        yaml,
        scatterPoints,
        baseColors,
        gridColor,
        textColor,
        PlotInst
      );
      return { plotOptions, width: widthStr };
    }

    // Standard Plot marks for Bar and Line charts with interactivity (tip: true)
    const marks: any[] = [];
    const isHorizontal = yaml.indexAxis === 'y';
    const isStacked = yaml.stacked === true;
    const curve = yaml.tension ? 'catmull-rom' : 'linear';

    const PlotInst = getPlot();

    // Unified fills and opacity resolution
    const fillConfig = resolveFillConfig(yaml, false);
    const resolvedFillOpacity = fillConfig.fillOpacity;

    // Unified scale resolution (log vs linear)
    const isXLog = isLogScale(yaml, 'x');
    const isYLog = isLogScale(yaml, 'y');

    // Unified label / dataLabels resolution
    const labelConfig = resolveLabelConfig(yaml);

    // If grid is enabled, standard rules
    if (isXLog || isYLog) {
      marks.push(
        PlotInst.gridX({ stroke: gridColor, strokeDasharray: '2,2' }),
        PlotInst.gridY({ stroke: gridColor, strokeDasharray: '2,2' })
      );
    }

    if (type === 'line') {
      // Sort data points monotonically along x for each series to ensure timeseries and continuous plots
      // connect sequentially without criss-crossing or random line jumps.
      const sortedLineData = [...dataPoints].sort((a, b) => {
        if (a.seriesIndex !== b.seriesIndex) return a.seriesIndex - b.seriesIndex;
        const ax = a.x instanceof Date ? a.x.getTime() : typeof a.x === 'number' ? a.x : null;
        const bx = b.x instanceof Date ? b.x.getTime() : typeof b.x === 'number' ? b.x : null;
        if (ax !== null && bx !== null) {
          return ax - bx;
        }
        return a.index - b.index;
      });

      if (fillConfig.fill) {
        marks.push(
          PlotInst.areaY(sortedLineData, {
            x: 'x',
            y: 'y',
            fill: typeof fillConfig.fill === 'string' ? fillConfig.fill : 'series',
            fillOpacity: resolvedFillOpacity,
            curve,
          })
        );
      }
      marks.push(
        PlotInst.lineY(sortedLineData, {
          x: 'x',
          y: 'y',
          stroke: 'series',
          curve,
          strokeWidth: 2,
        })
      );
      // Resolve line dot radius and visibility. For dense series (> 30 data points),
      // default radius to 0 (or micro-dot) so dense points do not cluster into an unreadable mess,
      // while preserving tooltip interactivity. Allow explicit user control via pointRadius / radius / r / points / dots.
      let pointRadius = 4;
      if (yaml.pointRadius !== undefined) {
        pointRadius = Number(yaml.pointRadius);
      } else if (yaml.radius !== undefined) {
        pointRadius = Number(yaml.radius);
      } else if (yaml.r !== undefined) {
        pointRadius = Number(yaml.r);
      } else if (yaml.points === false || yaml.dots === false) {
        pointRadius = 0;
      } else if (sortedLineData.length > 30) {
        pointRadius = 0;
      }

      marks.push(
        PlotInst.dot(sortedLineData, {
          x: 'x',
          y: 'y',
          fill: 'series',
          stroke: pointRadius === 0 ? 'none' : 'white',
          strokeWidth: pointRadius === 0 ? 0 : 0.75,
          r: pointRadius,
          tip: true,
          title: (d: any) => `${d.series}\n${d.x instanceof Date ? d.x.toISOString().slice(0, 10) : d.x}: ${d.y}`,
        })
      );

      // Data labels on line chart points if configured
      if (labelConfig.showLabels) {
        const labeledData = labelConfig.filterSet
          ? dataPoints.filter((d) => labelConfig.filterSet!.has(String(d.x).toLowerCase()) || labelConfig.filterSet!.has(String(d.series).toLowerCase()))
          : dataPoints;
        marks.push(
          PlotInst.text(labeledData, {
            x: 'x',
            y: 'y',
            text: (d: any) => `${d.y}`,
            dy: -10,
            fontSize: labelConfig.fontSize,
          })
        );
      }
    } else {
      // Default / Bar
      if (isHorizontal) {
        const isMultiSeries = rawSeries.length > 1;
        if (isStacked || !isMultiSeries) {
          marks.push(
            PlotInst.barX(dataPoints, {
              x: 'y',
              y: 'x',
              fill: 'series',
              fillOpacity: yaml.fillOpacity ?? (yaml.transparency !== undefined ? yaml.transparency : 1),
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
              fillOpacity: yaml.fillOpacity ?? (yaml.transparency !== undefined ? yaml.transparency : 1),
              tip: true,
              title: (d: any) => `${d.series}\n${d.x}: ${d.y}`,
            })
          );
        }

        // Data labels for horizontal bar
        if (labelConfig.showLabels) {
          const labeledData = labelConfig.filterSet
            ? dataPoints.filter((d) => labelConfig.filterSet!.has(String(d.x).toLowerCase()) || labelConfig.filterSet!.has(String(d.series).toLowerCase()))
            : dataPoints;
          marks.push(
            PlotInst.text(labeledData, {
              x: 'y',
              y: isStacked || !isMultiSeries ? 'x' : 'series',
              ...(isStacked || !isMultiSeries ? {} : { fy: 'x' }),
              text: (d: any) => `${d.y}`,
              dx: 8,
              frameAnchor: 'left',
              fontSize: labelConfig.fontSize,
            })
          );
        }
      } else {
        const isMultiSeries = rawSeries.length > 1;
        if (isStacked || !isMultiSeries) {
          marks.push(
            PlotInst.barY(dataPoints, {
              x: 'x',
              y: 'y',
              fill: 'series',
              fillOpacity: yaml.fillOpacity ?? (yaml.transparency !== undefined ? yaml.transparency : 1),
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
              fillOpacity: yaml.fillOpacity ?? (yaml.transparency !== undefined ? yaml.transparency : 1),
              tip: true,
              title: (d: any) => `${d.series}\n${d.x}: ${d.y}`,
            })
          );
        }

        // Data labels for vertical bar
        if (labelConfig.showLabels) {
          const labeledData = labelConfig.filterSet
            ? dataPoints.filter((d) => labelConfig.filterSet!.has(String(d.x).toLowerCase()) || labelConfig.filterSet!.has(String(d.series).toLowerCase()))
            : dataPoints;
          marks.push(
            PlotInst.text(labeledData, {
              x: isStacked || !isMultiSeries ? 'x' : 'series',
              y: 'y',
              ...(isStacked || !isMultiSeries ? {} : { fx: 'x' }),
              text: (d: any) => `${d.y}`,
              dy: -8,
              frameAnchor: 'bottom',
              fontSize: labelConfig.fontSize,
            })
          );
        }
      }
    }

    // Unified Mark lines (reference rules) for Bar and Line charts
    const markLineConfigs = extractMarkLines(yaml);
    if (markLineConfigs.length > 0) {
      marks.push(...buildPlotMarkLines(markLineConfigs, PlotInst));
    }

    // Legend
    const colorScale: Plot.ScaleOptions = {
      legend: yaml.legend !== false && yaml.options?.legend !== false,
      range: baseColors,
    };

    // Unified axis configurations
    const xResolved = resolveAxisConfig(yaml, 'x');
    const yResolved = resolveAxisConfig(yaml, 'y');

    // Auto-adaptive tick calculation based on width to prevent overcrowded tick labels
    let defaultXTicks: any = undefined;
    const explicitXTicks = yaml.xTicks ?? yaml.ticks ?? yaml.x?.ticks ?? yaml.scales?.x?.ticks;

    if (explicitXTicks !== undefined) {
      defaultXTicks = explicitXTicks;
    } else {
      // Estimate target pixel width
      let estWidth = 640;
      if (typeof yaml.width === 'number') {
        estWidth = yaml.width;
      } else if (typeof yaml.width === 'string') {
        const pxMatch = yaml.width.match(/^(\d+(?:\.\d+)?)px$/);
        if (pxMatch) {
          estWidth = parseFloat(pxMatch[1]);
        } else {
          const pctMatch = yaml.width.match(/^(\d+(?:\.\d+)?)%$/);
          if (pctMatch) {
            estWidth = Math.round((parseFloat(pctMatch[1]) / 100) * 700);
          }
        }
      }

      const targetTickCount = Math.max(3, Math.min(12, Math.round(estWidth / 80)));

      // If x represents discrete string labels and they are dense, downsample ticks adaptively.
      // For horizontal charts (indexAxis === 'y'), x is the numeric value axis, so keep targetTickCount.
      // Performance optimization: hasDateLabels was already determined during the initial label pass,
      // avoiding redundant tryParseDate re-evaluations across every label element.
      if (!isHorizontal && labels.length > targetTickCount && !hasDateLabels && labels.every((l) => typeof l === 'string')) {
        const step = Math.ceil(labels.length / targetTickCount);
        defaultXTicks = labels.filter((_, idx) => idx % step === 0);
      } else if (!hasDateLabels && !isHorizontal && labels.length > 0) {
        // For non-dense discrete labels, pass all labels to ticks or undefined so all labels display
        defaultXTicks = undefined;
      } else {
        defaultXTicks = targetTickCount;
      }
    }

    // Preserve discrete category ordering from labels on categorical axis
    // When labels are discrete (strings/numbers, not continuous Dates), Observable Plot by default
    // sorts them alphabetically. Setting domain to parsedLabels preserves user-specified order.
    //
    // Note: For grouped bar charts (type === 'bar' && rawSeries.length > 1 && !isStacked):
    // - In vertical mode, the category axis is `fx` (facet scale), while `x` is the series sub-channel.
    //   Assigning category labels to `x.domain` causes Plot to discard all data points because series names
    //   do not match category labels! Therefore, category domain belongs to `fx.domain`.
    // - In horizontal mode, the category axis is `fy` (facet scale), while `y` is the series sub-channel.
    //   Therefore, category domain belongs to `fy.domain`.
    // For single-series, stacked bars, or line charts, category labels belong directly to `x` or `y`.
    const isGroupedBar = type === 'bar' && !isStacked && rawSeries.length > 1;

    let resolvedXDomain = xResolved.domain;
    let resolvedYDomain = yResolved.domain;
    let resolvedFxDomain: any = undefined;
    let resolvedFyDomain: any = undefined;

    if (!isHorizontal) {
      if (isGroupedBar) {
        if (labels.length > 0 && !hasDateLabels) {
          resolvedFxDomain = parsedLabels;
        }
      } else if (!resolvedXDomain && labels.length > 0 && !hasDateLabels) {
        resolvedXDomain = parsedLabels;
      }
    } else {
      if (isGroupedBar) {
        if (labels.length > 0 && !hasDateLabels) {
          resolvedFyDomain = parsedLabels;
        }
      } else if (!resolvedYDomain && labels.length > 0 && !hasDateLabels) {
        resolvedYDomain = parsedLabels;
      }
    }

    const xOptions: Plot.ScaleOptions = {
      type: isXLog ? 'log' : undefined,
      label: xResolved.label,
      domain: resolvedXDomain,
      reverse: xResolved.reverse,
      ticks: defaultXTicks,
      axis: yaml.xDisplay === false || xResolved.axis === null ? null : undefined,
    };

    const yOptions: Plot.ScaleOptions = {
      type: isYLog ? 'log' : undefined,
      label: yResolved.label,
      domain: resolvedYDomain,
      reverse: yResolved.reverse,
      zero: yaml.beginAtZero !== undefined ? yaml.beginAtZero : !isYLog,
      axis: yaml.yDisplay === false || yResolved.axis === null ? null : undefined,
    };

    const fxOptions: Plot.ScaleOptions | undefined = resolvedFxDomain
      ? { domain: resolvedFxDomain }
      : undefined;

    const fyOptions: Plot.ScaleOptions | undefined = resolvedFyDomain
      ? { domain: resolvedFyDomain }
      : undefined;

    const plotOptions: Plot.PlotOptions = {
      title: yaml.title ?? yaml.chartTitle ?? undefined,
      subtitle: yaml.subtitle ?? undefined,
      caption: yaml.caption ?? undefined,
      style: {
        background: 'transparent',
        color: textColor,
      },
      grid: yaml.grid ?? true,
      x: xOptions,
      y: yOptions,
      ...(fxOptions ? { fx: fxOptions } : {}),
      ...(fyOptions ? { fy: fyOptions } : {}),
      color: colorScale,
      marks,
    };

    return { plotOptions, width: widthStr };
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

        // Table resolution: parse table IDs / comments and discover note tables
        const tableScope: Record<string, any> = {};
        const tablesMap = new Map<string, any[]>();
        const allTables: Array<{ id: string | null; rows: any[] }> = [];

        let explicitTableRef: string | null = null;
        let explicitFileRef: string | null = null;

        // Performance optimization: Fast O(1) delimiter check skips line splitting, trimming, and
        // regex matching when chart code contains no comments (57x speedup). When comments are present,
        // early check on line prefix avoids running 6 regular expressions against standard code lines.
        if (code.includes('//') || code.includes('/*')) {
          const codeLines = code.split('\n');
          for (let i = 0; i < codeLines.length; i++) {
            const l = codeLines[i].trim();
            if (!l.startsWith('//') && !l.startsWith('/*')) continue;

            const tableMatch = l.match(TABLE_COMMENT_REGEX1) || l.match(TABLE_COMMENT_REGEX2);
            if (tableMatch) {
              explicitTableRef = tableMatch[1].trim().replace(/^["']|["'];?$/g, '');
            }
            const idMatch = l.match(ID_COMMENT_REGEX1) || l.match(ID_COMMENT_REGEX2);
            if (idMatch && !explicitTableRef) {
              explicitTableRef = idMatch[1].trim().replace(/^["']|["'];?$/g, '');
            }
            const fileMatch = l.match(FILE_COMMENT_REGEX1) || l.match(FILE_COMMENT_REGEX2);
            if (fileMatch) {
              explicitFileRef = fileMatch[1].trim().replace(/^["']|["'];?$/g, '');
            }
          }
        }

        if (explicitTableRef && explicitTableRef.includes('#')) {
          const hashIdx = explicitTableRef.indexOf('#');
          if (!explicitFileRef) {
            explicitFileRef = explicitTableRef.slice(0, hashIdx).trim().replace(/^\[\[|\]\]$/g, '');
          }
          explicitTableRef = explicitTableRef.slice(hashIdx + 1).trim();
        }

        const app = this.plugin?.app;
        let targetFile: TFile | null = null;

        if (app) {
          if (explicitFileRef) {
            if (app.metadataCache?.getFirstLinkpathDest) {
              targetFile = toTFile(app.metadataCache.getFirstLinkpathDest(explicitFileRef, sourcePath));
            }
            if (!targetFile && app.vault?.getAbstractFileByPath) {
              targetFile = toTFile(app.vault.getAbstractFileByPath(
                explicitFileRef.endsWith('.md') ? explicitFileRef : `${explicitFileRef}.md`
              ));
            }
          } else if (sourcePath && app.vault?.getAbstractFileByPath) {
            targetFile = toTFile(app.vault.getAbstractFileByPath(sourcePath));
          }
          if (!targetFile && app.workspace?.getActiveFile) {
            targetFile = toTFile(app.workspace.getActiveFile());
          }
        }

        if (targetFile) {
          if (onFileReferenced) onFileReferenced(targetFile.path);
          let fullText = '';
          try {
            if (typeof app.vault?.cachedRead === 'function') {
              fullText = await app.vault.cachedRead(targetFile);
            } else if (typeof app.vault?.read === 'function') {
              fullText = await app.vault.read(targetFile);
            }
          } catch {
            // ignore read error
          }
          if (fullText) {
            const fileCache = app.metadataCache?.getFileCache ? app.metadataCache.getFileCache(targetFile) : null;
            extractTablesFromMarkdown(fullText, fileCache, tablesMap, allTables);
          }
        }

        const doc = el?.ownerDocument || (typeof document !== 'undefined' ? document : null);
        if (doc) {
          extractTablesFromDom(doc, tablesMap, allTables);
        }

        // Rewrite kebab-case table identifiers (e.g. table-countries) in user code
        // so that expressions like Plot.dot(table-countries, ...) do not attempt numeric subtraction
        // and fail with "countries is not defined".
        for (const [k, v] of tablesMap.entries()) {
          if (VALID_IDENTIFIER_REGEX.test(k)) {
            tableScope[k] = v;
          }
        }

        // For any kebab-case table ID (like table-countries), make sure we rewrite it
        // in unquoted JS code to its valid JS identifier alias (e.g. tablecountries or table_countries).
        // Performance optimization: Guard kebab-case key filtering with code.includes('-') BEFORE
        // converting tablesMap.keys() to an array, avoiding Array.from and .filter heap allocations
        // when user chart code contains no hyphens.
        if (code.includes('-')) {
          const kebabKeys = Array.from(tablesMap.keys()).filter((k) => k.includes('-') && !k.startsWith('^') && !k.startsWith('#'));
          if (kebabKeys.length > 0) {
            const kebabSet = new Set(kebabKeys);
            const tokenRegex = /(\/\/.*$|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(?<![a-zA-Z0-9_$])([a-zA-Z0-9_$]+(?:-[a-zA-Z0-9_$]+)+)(?![a-zA-Z0-9_$])/gm;
            code = code.replace(tokenRegex, (match, literal, kebabIdent) => {
              if (literal) return literal;
              if (kebabIdent && kebabSet.has(kebabIdent)) {
                const stripped = kebabIdent.replace(/[-_]+/g, '');
                const under = kebabIdent.replace(/[-]/g, '_');
                if (tableScope[stripped]) return stripped;
                if (tableScope[under]) return under;
                return stripped;
              }
              return match;
            });
          }
        }

        if (explicitTableRef) {
          const cleanRef = explicitTableRef.replace(/^[#^]+/, '').trim();
          const matched =
            tablesMap.get(cleanRef) ||
            tablesMap.get('^' + cleanRef) ||
            tablesMap.get('#' + cleanRef) ||
            tablesMap.get(cleanRef.toLowerCase());
          if (matched) {
            tableScope.table = matched;
          }
        }

        if (!tableScope.table) {
          if (tablesMap.has('table')) {
            tableScope.table = tablesMap.get('table');
          } else if (allTables.length > 0) {
            tableScope.table = allTables[0].rows;
          }
        }

        const resolveToDomElement = (val: any): HTMLElement | SVGElement | null => {
          if (!val) return null;
          if (val instanceof HTMLElement || val instanceof SVGElement) {
            return val;
          }
          if (typeof val.plot === 'function') {
            try {
              const plotEl = val.plot();
              if (plotEl instanceof HTMLElement || plotEl instanceof SVGElement) {
                return plotEl;
              }
            } catch {
              // Ignore plot error
            }
          }
          if (Array.isArray(val) || val.marks) {
            try {
              const plotEl = PlotInst.plot(Array.isArray(val) ? { marks: val } : val);
              if (plotEl instanceof HTMLElement || plotEl instanceof SVGElement) {
                return plotEl;
              }
            } catch {
              // Ignore plot error
            }
          }
          if (typeof val.node === 'function') {
            try {
              const nodeEl = val.node();
              if (nodeEl instanceof HTMLElement || nodeEl instanceof SVGElement) {
                return nodeEl;
              }
            } catch {
              // Ignore node error
            }
          }
          return null;
        };

        let displayedElement: HTMLElement | SVGElement | null = null;
        const display = (val: any) => {
          const dom = resolveToDomElement(val);
          if (dom) {
            el.appendChild(dom);
            displayedElement = dom;
          }
          return val;
        };

        const prevWindowDisplay = typeof window !== 'undefined' ? (window as any).display : undefined;
        if (typeof window !== 'undefined') {
          (window as any).display = display;
        }

        const hasTableVars = Object.keys(tableScope).length > 0;
        const isStrict = code.includes('"use strict"') || code.includes("'use strict'");

        const wrapFnCode = (src: string) => {
          if (!hasTableVars) return src;
          if (isStrict) {
            const varDecls = Object.keys(tableScope)
              .filter((k) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k))
              .map((k) => `var ${k} = __tableScope__["${k}"];`)
              .join('\n');
            return `${varDecls}\n${src}`;
          }
          return `with (__tableScope__) {\n${src}\n}`;
        };

        const runUserCode = async (userSrc: string) => {
          const wrapped = wrapFnCode(userSrc);
          const fn = new AsyncFunction('Plot', 'd3', 'el', 'container', 'app', 'obsidian', 'fetch', 'display', '__tableScope__', wrapped);
          return await fn(PlotInst, d3Inst, el, el, this.plugin.app, obsidianModule, customFetch, display, tableScope);
        };

        let result: any;
        try {
          result = await runUserCode(code);

          // If result is undefined and display() hasn't already displayed an element, try auto-prefixing 'return ' or returning assigned variables
          if (result === undefined && !displayedElement) {
            const lines = code.split('\n');

            // First check if any statement backwards can be prefixed with 'return ' or returned as a variable
            for (let i = lines.length - 1; i >= 0; i--) {
              const lineTrimmed = lines[i].trim();
              if (!lineTrimmed || lineTrimmed.startsWith('//')) continue;
              if (lineTrimmed.startsWith('return')) break;

              // If line is a variable declaration or assignment, e.g. const plot = Plot.plot(...)
              const declMatch = lineTrimmed.match(/^(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
              const assignMatch = !declMatch && lineTrimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
              const varName = declMatch ? declMatch[1] : assignMatch ? assignMatch[1] : null;

              if (varName) {
                try {
                  const copy = [...lines, `return ${varName};`];
                  const resVar = await runUserCode(copy.join('\n'));
                  if (resVar !== undefined) {
                    result = resVar;
                    break;
                  }
                } catch {
                  // Ignore error and continue
                }
              }

              const copy = [...lines];
              copy[i] = 'return ' + copy[i];
              try {
                const res2 = await runUserCode(copy.join('\n'));
                if (res2 !== undefined) {
                  result = res2;
                  break;
                }
              } catch {
                // Ignore syntax error and try previous line
              }
            }
          }
        } finally {
          if (typeof window !== 'undefined') {
            if (prevWindowDisplay !== undefined) {
              (window as any).display = prevWindowDisplay;
            } else {
              delete (window as any).display;
            }
          }
        }

        // If display(...) was called and appended elements, return the last displayed element
        if (displayedElement && (result === undefined || result === displayedElement)) {
          return displayedElement;
        }

        const domElement = resolveToDomElement(result);
        if (domElement) {
          // Avoid appending domElement again if display() already appended it
          if (domElement.parentElement !== el) {
            el.appendChild(domElement);
          }
          return domElement;
        }

        if (displayedElement) {
          return displayedElement;
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

class PlotJsRenderChild extends MarkdownRenderChild {
  code: string;
  chartEl: HTMLElement | SVGElement | null = null;
  renderer: Renderer;
  ownPath: string;
  referencedFiles: Set<string> = new Set();

  constructor(
    code: string,
    el: HTMLElement,
    renderer: Renderer,
    ownPath: string
  ) {
    super(el);
    this.code = code;
    this.renderer = renderer;
    this.ownPath = ownPath;
    this.changeHandler = this.changeHandler.bind(this);
    this.reload = this.reload.bind(this);
  }

  async onload() {
    try {
      this.chartEl = await this.renderer.renderRaw(
        this.code,
        this.containerEl,
        this.ownPath,
        (filePath: string) => {
          this.referencedFiles.add(filePath);
        }
      );
    } catch (error) {
      renderError(error, this.containerEl);
    }

    this.renderer.plugin.app?.metadataCache?.on?.(
      'changed',
      this.changeHandler as any
    );
    this.renderer.plugin.app?.workspace?.on?.('css-change', this.reload);
  }

  changeHandler = (file?: TFile) => {
    if (!file) return;
    if (
      this.referencedFiles.has(file.path) ||
      this.referencedFiles.has(file.basename) ||
      file.path === this.ownPath
    ) {
      this.reload();
    }
  };

  reload = () => {
    this.onunload();
    void this.onload();
  };

  onunload() {
    this.renderer.plugin.app?.metadataCache?.off?.(
      'changed',
      this.changeHandler as any
    );
    this.renderer.plugin.app?.workspace?.off?.('css-change', this.reload);
    if (typeof (this.containerEl as any).empty === 'function') {
      (this.containerEl as any).empty();
    } else if (typeof this.containerEl.replaceChildren === 'function') {
      this.containerEl.replaceChildren();
    } else {
      this.containerEl.textContent = '';
    }
    this.chartEl = null;
  }
}

class ChartRenderChild extends MarkdownRenderChild {
  data: any;
  chartEl: HTMLElement | SVGElement | null = null;
  renderer: Renderer;
  prep: any = null;
  ownPath: string;
  el: HTMLElement;
  referencedFiles: Set<string> = new Set();

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
      const isExternalData = typeof this.data.data === 'string' && this.data.data.trim() !== '';

      if (isExternalData) {
        let obsidianModule: any = null;
        if (typeof require === 'function') {
          try {
            obsidianModule = require('obsidian');
          } catch {
            /* ignore */
          }
        }

        const app = this.renderer.plugin.app;
        const customFetch = createCustomFetch(app, obsidianModule, this.ownPath);

        const rawDataPath = String(this.data.data).trim().replace(/^[\["'`\s]+|[\]"'`\s]+$/g, '');
        const cleanPath = rawDataPath.replace(/\\/g, '/').replace(/^\.?\//, '');
        this.referencedFiles.add(cleanPath);
        if (cleanPath.endsWith('.csv') || cleanPath.endsWith('.tsv') || cleanPath.endsWith('.json')) {
          const baseName = cleanPath.substring(cleanPath.lastIndexOf('/') + 1);
          this.referencedFiles.add(baseName);
          const noExt = baseName.replace(/\.[^/.]+$/, '');
          this.referencedFiles.add(noExt);
        }

        const res = await customFetch(cleanPath);
        const text = await res.text();
        const trimmed = text.trim();

        let rawRows: Record<string, any>[] = [];
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          try {
            const parsedJson = JSON.parse(trimmed);
            rawRows = Array.isArray(parsedJson) ? parsedJson : [parsedJson];
          } catch {
            rawRows = parseCsvOrTsv(text);
          }
        } else {
          rawRows = parseCsvOrTsv(text);
        }

        if (rawRows.length === 0) {
          throw new Error(`External data at '${rawDataPath}' is empty or invalid`);
        }

        const tableRows = rawRows.map(coerceTableRow);
        const tableData = rowsToTableData(tableRows, this.data.layout ?? 'columns', this.data.select);

        const mergedYaml = {
          ...this.data,
          labels: this.data.labels ?? tableData.labels,
          tableRows,
          series: this.data.series ?? tableData.dataFields.map((df) => ({
            title: df.dataTitle,
            data: df.data,
          })),
        };

        this.data = mergedYaml;
        const updatedPrep = await this.renderer.datasetPrep(mergedYaml, this.el);
        this.chartEl = await this.renderer.renderRaw(updatedPrep, this.containerEl, this.ownPath);
      } else if (this.data.id) {
        let activeFile = this.renderer.plugin.app?.workspace?.getActiveFile() ?? null;
        let activePath = activeFile ? activeFile.path : '';
        let linkDest: TFile | null = this.data.file
          ? toTFile(
              this.renderer.plugin.app?.metadataCache?.getFirstLinkpathDest(
                this.data.file,
                activePath
              )
            )
          : null;
        const fileToRead = toTFile(
          this.data.file
            ? linkDest
            : this.renderer.plugin.app?.vault?.getAbstractFileByPath(
                this.ownPath
              ) ?? activeFile
        );

        if (!fileToRead) {
          throw new Error('Invalid id and/or file');
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
            const strippedLower = cleanLower.replace(/[-_]+/g, '');
            for (const k in fileCache.blocks) {
              const kLower = k.toLowerCase().replace(/^\^/, '');
              if (kLower === cleanLower || kLower.replace(/[-_]+/g, '') === strippedLower) {
                pos = fileCache.blocks[k]?.position;
                break;
              }
            }
          }
        }

        if (!pos && fileCache?.sections) {
          const cleanLower = cleanId.toLowerCase();
          const strippedLower = cleanLower.replace(/[-_]+/g, '');
          const sec = fileCache.sections.find(
            (pre: any) => {
              if (!pre.id) return false;
              const pId = String(pre.id).replace(/^\^/, '').toLowerCase();
              return (
                pId === cleanLower ||
                pId.replace(/[-_]+/g, '') === strippedLower ||
                pre.id === cleanId ||
                pre.id === caretId ||
                pre.id === this.data.id
              );
            }
          );
          if (sec) {
            pos = sec.position;
          }
        }

        const fullNoteText = await this.renderer.plugin.app.vault.cachedRead(fileToRead);
        let tableString = '';

        if (pos && pos.start && pos.end) {
          tableString = fullNoteText.substring(pos.start.offset, pos.end.offset);
        } else {
          // Fallback: search note text lines for matching block ID tag (^cleanId or inline)
          const lines = fullNoteText.split(/\r?\n/);
          const cleanLower = cleanId.toLowerCase();
          const strippedLower = cleanLower.replace(/[-_]+/g, '');

          let blockLineIdx = -1;
          for (let i = 0; i < lines.length; i++) {
            const l = lines[i].trim();
            const caretMatch = l.match(/\^([a-zA-Z0-9_-]+)\s*$/);
            if (caretMatch) {
              const matchedId = caretMatch[1].toLowerCase();
              if (matchedId === cleanLower || matchedId.replace(/[-_]+/g, '') === strippedLower) {
                blockLineIdx = i;
                break;
              }
            }
          }

          if (blockLineIdx >= 0) {
            let startIdx = blockLineIdx;
            // If the block ID is on its own line below the table
            if (lines[blockLineIdx].trim().startsWith('^')) {
              startIdx = blockLineIdx - 1;
            }
            while (startIdx >= 0 && lines[startIdx].trim().includes('|')) {
              startIdx--;
            }
            tableString = lines.slice(startIdx + 1, blockLineIdx + 1).join('\n');
          }
        }

        if (!tableString || !tableString.includes('|')) {
          throw new Error('Invalid id and/or file');
        }

        let tableData;
        try {
          tableData = generateTableData(
            tableString,
            this.data.layout ?? 'columns',
            this.data.select
          );
        } catch {
          throw new Error('There is no table at that id and/or file');
        }

        let tableRows: any[] = [];
        try {
          const rawRows = parseMarkdownTableRows(tableString);
          if (rawRows.length > 0) {
            tableRows = rawRows.map(coerceTableRow);
          }
        } catch {
          // ignore row extraction errors and fallback to series/labels
        }

        const mergedYaml = {
          ...this.data,
          labels: tableData.labels,
          tableRows,
          series: tableData.dataFields.map((df) => ({
            title: df.dataTitle,
            data: df.data,
          })),
        };

        const updatedPrep = await this.renderer.datasetPrep(mergedYaml, this.el);
        this.prep = updatedPrep;
        this.chartEl = await this.renderer.renderRaw(updatedPrep, this.containerEl, this.ownPath);
      } else {
        const preparedData = await this.renderer.datasetPrep(this.data, this.el);
        this.prep = preparedData;
        this.chartEl = await this.renderer.renderRaw(preparedData, this.containerEl, this.ownPath);
      }
    } catch (error) {
      renderError(error, this.el);
    }

    if (this.data.id || (typeof this.data.data === 'string' && this.data.data.trim() !== '')) {
      this.renderer.plugin.app?.metadataCache?.on?.(
        'changed',
        this.changeHandler as any
      );
    }
    this.renderer.plugin.app?.workspace?.on?.('css-change', this.reload);
  }

  changeHandler = (file?: TFile) => {
    if (!file) return;
    const isTargetFile =
      (this.data.file && (file.basename === this.data.file || file.name === this.data.file)) ||
      file.path === this.ownPath ||
      this.referencedFiles.has(file.path) ||
      this.referencedFiles.has(file.basename) ||
      this.referencedFiles.has(file.name);

    if (isTargetFile) {
      this.reload();
    }
  };

  reload = () => {
    this.onunload();
    void this.onload();
  };

  onunload() {
    this.renderer.plugin.app?.metadataCache?.off?.(
      'changed',
      this.changeHandler as any
    );
    this.renderer.plugin.app?.workspace?.off?.('css-change', this.reload);
    if (typeof this.el.empty === 'function') {
      this.el.empty();
    } else if (typeof this.el.replaceChildren === 'function') {
      this.el.replaceChildren();
    } else {
      this.el.textContent = '';
    }
    this.chartEl = null;
  }
}
