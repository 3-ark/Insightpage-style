import type * as Plot from '@observablehq/plot';
import { generateInnerColors } from 'src/util';
import { renderPieChart } from './pieRenderer';
import { renderRadarChart } from './radarRenderer';
import { renderSankeyChart } from './sankeyRenderer';
import { buildScatterPlotOptions, extractScatterData } from './scatterRenderer';
import {
  isLogScale,
  extractMarkLines,
  buildPlotMarkLines,
  resolveAxisConfig,
  resolveFillConfig,
  resolveLabelConfig,
} from './chartConfig';
import { getPlot, getD3 } from './plotInstance';

export interface PreparedChart {
  plotOptions: Plot.PlotOptions | null;
  customElement?: HTMLElement | SVGElement;
  width?: string;
}

interface ChartSeries {
  title?: unknown;
  data?: unknown;
}

interface ChartYaml {
  transparency?: number;
  labels?: unknown;
  series?: unknown;
  type?: string;
  textColor?: string;
  width?: string | number;
  indexAxis?: string;
  stacked?: boolean;
  tension?: boolean;
  pointRadius?: number | string;
  radius?: number | string;
  r?: number | string;
  points?: boolean;
  dots?: boolean;
  fillOpacity?: number;
  legend?: boolean;
  options?: { legend?: boolean };
  xTicks?: number | string[];
  ticks?: number | string[];
  x?: { ticks?: number | string[] };
  scales?: { x?: { ticks?: number | string[] } };
  xDisplay?: boolean;
  beginAtZero?: boolean;
  yDisplay?: boolean;
  title?: string | number;
  chartTitle?: string | number;
  subtitle?: string | number;
  caption?: string | number;
  grid?: boolean;
  rMax?: number;
}

interface ChartDataPoint {
  x: unknown;
  y: number;
  series: string;
  index: number;
  seriesIndex: number;
}

function formatChartValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  return '';
}

function finiteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

const ISO_DATE_REGEX = /^\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?(?:[T ].*)?$/;
const DIGITS_ONLY_REGEX = /^\d+$/;
const HAS_DIGIT_REGEX = /\d/;

export function tryParseDate(v: unknown): unknown {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const s = v.trim();
    // Guard regex tests with delimiter check to fast-path standard strings without dashes or slashes
    if ((s.includes('-') || s.includes('/')) && ISO_DATE_REGEX.test(s)) {
      const d = new Date(s.includes('/') ? s.replace(/\//g, '-') : s);
      if (!isNaN(d.getTime())) return d;
    }
    // Also support standard date strings (e.g. from toString or ISO formatted dates).
    // Performance optimization: Guard Date.parse(s) with HAS_DIGIT_REGEX. Any valid date format
    // (ISO, RFC2822, "12 May 2023", etc.) must contain at least one digit. Skipping Date.parse()
    // on long categorical non-date text strings (e.g. "United States of America") provides a ~4.7x speedup.
    if (s.length >= 10 && HAS_DIGIT_REGEX.test(s) && !DIGITS_ONLY_REGEX.test(s)) {
      const parsed = Date.parse(s);
      if (!isNaN(parsed)) {
        const d = new Date(parsed);
        if (!isNaN(d.getTime())) return d;
      }
    }
  }
  return v;
}

export function prepareChartDataset(
  yamlValue: unknown,
  el: HTMLElement,
  settings: { themeable: boolean; colors: string[] },
  themeColors = false
): PreparedChart {
  if (!yamlValue || typeof yamlValue !== 'object') {
    return { plotOptions: null, width: '100%' };
  }
  const yaml = yamlValue as ChartYaml;

  const computedStyle = getComputedStyle(el);

  const colors: string[] = [];
  if (settings.themeable || themeColors) {
    let i = 1;
    while (true) {
      const color = computedStyle.getPropertyValue(`--chart-color-${i}`);
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
    : settings.colors.map((c) => c.trim());

  const transparency = typeof yaml.transparency === 'number' ? yaml.transparency : 0.25;
  const innerColors = generateInnerColors(baseColors, transparency);

  const rawLabels = yaml.labels;
  const labels: unknown[] = Array.isArray(rawLabels) ? rawLabels : [];
  const rawSeries: ChartSeries[] = Array.isArray(yaml.series)
    ? (yaml.series as ChartSeries[])
    : [];

  // Performance optimization: Pre-allocate parsedLabels and track hasDateLabels in a single pass.
  // This avoids redundant tryParseDate calls and eliminates subsequent labels.some() and labels.every() passes.
  const numLabels = labels.length;
  const parsedLabels: unknown[] = new Array<unknown>(numLabels);
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
    const rawData: unknown = rawSeries[i]?.data;
    if (Array.isArray(rawData)) {
      totalPoints += rawData.length;
    }
  }

  const dataPoints: ChartDataPoint[] = [];
  dataPoints.length = totalPoints;
  let dpIdx = 0;

  for (let i = 0; i < rawSeries.length; i++) {
    const s = rawSeries[i];
    const seriesTitle = typeof s.title === 'string' ? s.title : `Series ${i + 1}`;
    const rawSeriesData: unknown = s.data;
    const seriesData: unknown[] = Array.isArray(rawSeriesData) ? (rawSeriesData as unknown[]) : [];
    const sLen = seriesData.length;
    for (let j = 0; j < sLen; j++) {
      // Since parsedLabels[j] was already parsed during the label pre-pass, avoid redundant tryParseDate calls
      const xVal = j < numLabels ? parsedLabels[j] : j;
      const val = seriesData[j];
      const yVal = typeof val === 'boolean'
        ? (val ? 1 : 0)
        : finiteNumber(val);
      dataPoints[dpIdx++] = {
        x: xVal,
        y: yVal,
        series: seriesTitle,
        index: j,
        seriesIndex: i,
      };
    }
  }

  const type = (typeof yaml.type === 'string' ? yaml.type : 'bar').trim().toLowerCase();
  const gridColor =
    computedStyle.getPropertyValue('--background-modifier-border') ||
    '#e0e0e0';
  const textColor =
    (typeof yaml.textColor === 'string' ? yaml.textColor : '') ||
    computedStyle.getPropertyValue('--text-muted') ||
    'currentColor';

  const widthStr = typeof yaml.width === 'string'
    ? yaml.width
    : typeof yaml.width === 'number'
      ? String(yaml.width)
      : '100%';

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
  const marks: Plot.Markish[] = [];
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
        strokeWidth: 1.5,
      })
    );
    // Resolve line dot radius and visibility. For dense series (> 30 data points),
    // default radius to 0 (or micro-dot) so dense points do not cluster into an unreadable mess,
    // while preserving tooltip interactivity. Allow explicit user control via pointRadius / radius / r / points / dots.
    let pointRadius = 4;
    if (yaml.pointRadius !== undefined) {
      pointRadius = finiteNumber(yaml.pointRadius, 4);
    } else if (yaml.radius !== undefined) {
      pointRadius = finiteNumber(yaml.radius, 4);
    } else if (yaml.r !== undefined) {
      pointRadius = finiteNumber(yaml.r, 4);
    } else if (yaml.points === false || yaml.dots === false) {
      pointRadius = 0;
    } else if (sortedLineData.length > 30) {
      pointRadius = 0;
    }
    pointRadius = Math.max(0, pointRadius);

    marks.push(
      PlotInst.dot(sortedLineData, {
        x: 'x',
        y: 'y',
        fill: 'series',
        stroke: pointRadius === 0 ? 'none' : 'white',
        strokeWidth: pointRadius === 0 ? 0 : 0.75,
        r: pointRadius,
        tip: true,
        title: (d: ChartDataPoint) => `${d.series}\n${formatChartValue(d.x)}: ${d.y}`,
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
          text: (d: ChartDataPoint) => `${d.y}`,
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
            fillOpacity: resolvedFillOpacity,
            tip: true,
            title: (d: ChartDataPoint) => `${d.series}\n${formatChartValue(d.x)}: ${d.y}`,
          })
        );
      } else {
        marks.push(
          PlotInst.barX(dataPoints, {
            y: 'series',
            x: 'y',
            fy: 'x',
            fill: 'series',
            fillOpacity: resolvedFillOpacity,
            tip: true,
            title: (d: ChartDataPoint) => `${d.series}\n${formatChartValue(d.x)}: ${d.y}`,
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
            text: (d: ChartDataPoint) => `${d.y}`,
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
            fillOpacity: resolvedFillOpacity,
            tip: true,
            title: (d: ChartDataPoint) => `${d.series}\n${formatChartValue(d.x)}: ${d.y}`,
          })
        );
      } else {
        marks.push(
          PlotInst.barY(dataPoints, {
            x: 'series',
            y: 'y',
            fx: 'x',
            fill: 'series',
            fillOpacity: resolvedFillOpacity,
            tip: true,
            title: (d: ChartDataPoint) => `${d.series}\n${formatChartValue(d.x)}: ${d.y}`,
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
            text: (d: ChartDataPoint) => `${d.y}`,
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
  let defaultXTicks: number | string[] | undefined;
  const explicitXTicks = yaml.xTicks ?? yaml.ticks ?? yaml.x?.ticks ?? yaml.scales?.x?.ticks;

  if (explicitXTicks !== undefined) {
    if (typeof explicitXTicks === 'number') {
      defaultXTicks = explicitXTicks;
    } else if (Array.isArray(explicitXTicks)) {
      defaultXTicks = explicitXTicks.filter(
        (tick): tick is string => typeof tick === 'string'
      );
    }
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
  const isGroupedBar = type === 'bar' && !isStacked && rawSeries.length > 1;

  let resolvedXDomain = xResolved.domain;
  let resolvedYDomain = yResolved.domain;
  let resolvedFxDomain: unknown[] | undefined = undefined;
  let resolvedFyDomain: unknown[] | undefined = undefined;

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
    zero: typeof yaml.beginAtZero === 'boolean' ? yaml.beginAtZero : !isYLog,
    axis: yaml.yDisplay === false || yResolved.axis === null ? null : undefined,
  };

  const fxOptions: Plot.ScaleOptions | undefined = resolvedFxDomain
    ? { domain: resolvedFxDomain }
    : undefined;

  const fyOptions: Plot.ScaleOptions | undefined = resolvedFyDomain
    ? { domain: resolvedFyDomain }
    : undefined;

  const plotOptions: Plot.PlotOptions = {
    title: yaml.title !== undefined ? String(yaml.title) : yaml.chartTitle !== undefined ? String(yaml.chartTitle) : undefined,
    subtitle: yaml.subtitle !== undefined ? String(yaml.subtitle) : undefined,
    caption: yaml.caption !== undefined ? String(yaml.caption) : undefined,
    style: {
      background: 'transparent',
      color: textColor,
    },
    grid: typeof yaml.grid === 'boolean' ? yaml.grid : true,
    x: xOptions,
    y: yOptions,
    ...(fxOptions ? { fx: fxOptions } : {}),
    ...(fyOptions ? { fy: fyOptions } : {}),
    color: colorScale,
    marks,
  };

  return { plotOptions, width: widthStr };
}
