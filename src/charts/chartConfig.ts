
export interface MarkLineConfig {
  x?: number | string;
  y?: number | string;
  value?: number | string;
  axis?: 'x' | 'y' | 'xAxis' | 'yAxis' | string;
  label?: string;
  title?: string;
  text?: string;
  color?: string;
  stroke?: string;
  style?: 'solid' | 'dashed' | 'dotted' | string;
  strokeDasharray?: string;
  strokeWidth?: number;
  width?: number;
}

export interface TrendlineConfig {
  enabled?: boolean;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  ci?: number | boolean | null;
  fill?: string | boolean | null;
}

export interface CommonChartConfig {
  title?: string;
  subtitle?: string;
  caption?: string;
  legend: boolean;
  isXLog: boolean;
  isYLog: boolean;
  xLabel: string | null;
  yLabel: string | null;
  xDomain?: any[];
  yDomain?: any[];
  xReverse?: boolean;
  yReverse?: boolean;
  xDisplay?: boolean;
  yDisplay?: boolean;
  beginAtZero?: boolean;
  grid: boolean;
  xGrid?: boolean;
  yGrid?: boolean;
  fill: boolean | string;
  fillOpacity: number;
  markLines: MarkLineConfig[];
  trendline?: TrendlineConfig | boolean;
  showLabels?: boolean | string[] | string;
  labelFontSize?: number;
}

/**
 * Standardizes log scale detection across all chart types and DSL permutations:
 * - xLog / yLog (boolean)
 * - xScale: 'log' | 'logarithmic'
 * - xType / x.type / scales.x.type / options.scales.x.type: 'log' | 'logarithmic'
 */
export function isLogScale(yaml: any, axis: 'x' | 'y'): boolean {
  if (!yaml || typeof yaml !== 'object') return false;
  const a = axis;

  return Boolean(
    yaml[`${a}Log`] ||
    yaml[`${a}Scale`] === 'log' ||
    yaml[`${a}Scale`] === 'logarithmic' ||
    yaml[`${a}Type`] === 'log' ||
    yaml[`${a}Type`] === 'logarithmic' ||
    yaml[a]?.type === 'log' ||
    yaml[a]?.type === 'logarithmic' ||
    yaml[a]?.scale === 'log' ||
    yaml[a]?.scale === 'logarithmic' ||
    yaml[`${a}Axis`]?.type === 'log' ||
    yaml[`${a}Axis`]?.type === 'logarithmic' ||
    yaml.scales?.[a]?.type === 'log' ||
    yaml.scales?.[a]?.type === 'logarithmic' ||
    yaml.options?.scales?.[a]?.type === 'log' ||
    yaml.options?.scales?.[a]?.type === 'logarithmic' ||
    yaml.options?.[`${a}Log`] ||
    yaml.options?.[`${a}Scale`] === 'log'
  );
}

/**
 * Extracts mark line configurations supported universally across chart DSLs:
 * - markLine / markLines / markline / marklines / marks
 * - options.markLine / options.markLines
 */
export function extractMarkLines(yaml: any): MarkLineConfig[] {
  if (!yaml || typeof yaml !== 'object') return [];
  const raw =
    yaml.markLine ||
    yaml.markLines ||
    yaml.markline ||
    yaml.marklines ||
    yaml.marks ||
    yaml.options?.markLine ||
    yaml.options?.markLines;

  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const results: MarkLineConfig[] = [];

  for (const item of list) {
    if (item && typeof item === 'object') {
      results.push(item);
    }
  }
  return results;
}

/**
 * Parses and builds Plot markLine rule and label marks.
 * Compatible with numerical or categorical coordinates.
 */
export function buildPlotMarkLines(
  markLines: MarkLineConfig[],
  PlotInst: typeof import('@observablehq/plot')
): any[] {
  const marks: any[] = [];
  if (!markLines || markLines.length === 0) return marks;

  for (const ml of markLines) {
    if (!ml || typeof ml !== 'object') continue;

    const axisType = (ml.axis || '').toLowerCase();
    const isX = axisType.includes('x') || ml.x !== undefined;
    const rawVal = ml.value ?? (isX ? ml.x : ml.y);
    if (rawVal === undefined || rawVal === null) continue;

    // Check if numeric or categorical value
    const numVal = Number(rawVal);
    const resolvedVal = isNaN(numVal) ? rawVal : numVal;

    const strokeColor = ml.color || ml.stroke || '#dc2626';
    const strokeWidth = ml.strokeWidth || ml.width || 1.5;

    let strokeDash: string | undefined = ml.strokeDasharray;
    if (!strokeDash && ml.style) {
      const st = ml.style.toLowerCase();
      if (st === 'dashed') strokeDash = '4,4';
      else if (st === 'dotted') strokeDash = '2,2';
      else if (st === 'solid') strokeDash = undefined;
    } else if (!strokeDash) {
      strokeDash = '4,4';
    }

    const labelText = ml.label || ml.title || ml.text;

    if (isX) {
      marks.push(
        PlotInst.ruleX([resolvedVal], {
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: strokeDash,
        })
      );
      if (labelText) {
        marks.push(
          PlotInst.text([{ x: resolvedVal, label: labelText }], {
            x: 'x',
            text: 'label',
            frameAnchor: 'top',
            dy: -8,
            fill: strokeColor,
            fontSize: 11,
            fontWeight: '600',
          })
        );
      }
    } else {
      marks.push(
        PlotInst.ruleY([resolvedVal], {
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: strokeDash,
        })
      );
      if (labelText) {
        marks.push(
          PlotInst.text([{ y: resolvedVal, label: labelText }], {
            y: 'y',
            text: 'label',
            frameAnchor: 'right',
            dx: 8,
            fill: strokeColor,
            fontSize: 11,
            fontWeight: '600',
          })
        );
      }
    }
  }

  return marks;
}

/**
 * Resolves standard fill and opacity configurations across DSLs.
 */
export function resolveFillConfig(yaml: any, defaultFill: boolean | string = false): {
  fill: boolean | string;
  fillOpacity: number;
} {
  const fill =
    yaml.fill !== undefined
      ? yaml.fill
      : yaml.filled !== undefined
      ? yaml.filled
      : yaml.area !== undefined
      ? yaml.area
      : defaultFill;

  const fillOpacity =
    typeof yaml.fillOpacity === 'number'
      ? yaml.fillOpacity
      : typeof yaml.transparency === 'number'
      ? yaml.transparency
      : typeof yaml.opacity === 'number'
      ? yaml.opacity
      : 0.25;

  return { fill, fillOpacity };
}

/**
 * Resolves unified label / dataLabels configuration across chart DSLs.
 */
export function resolveLabelConfig(yaml: any): {
  showLabels: boolean;
  filterSet?: Set<string>;
  fontSize: number;
} {
  const rawLabelsConfig =
    yaml.dataLabels !== undefined
      ? yaml.dataLabels
      : yaml.showLabels !== undefined
      ? yaml.showLabels
      : yaml.labelFilter !== undefined
      ? yaml.labelFilter
      : yaml.pointLabels !== undefined
      ? yaml.pointLabels
      : yaml.labelsConfig;

  let showLabels = false;
  let filterSet: Set<string> | undefined = undefined;

  if (rawLabelsConfig === true) {
    showLabels = true;
  } else if (rawLabelsConfig === false) {
    showLabels = false;
  } else if (Array.isArray(rawLabelsConfig)) {
    showLabels = true;
    filterSet = new Set(rawLabelsConfig.map((item) => String(item).trim().toLowerCase()));
  } else if (typeof rawLabelsConfig === 'string' && rawLabelsConfig.trim() !== '') {
    showLabels = true;
    const parts = rawLabelsConfig
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    filterSet = new Set(parts);
  }

  const fontSize = typeof yaml.fontSize === 'number' ? yaml.fontSize : 10;
  return { showLabels, filterSet, fontSize };
}

/**
 * Resolves universal axis configurations (labels, domain, reverse, display, log type).
 */
export function resolveAxisConfig(yaml: any, axis: 'x' | 'y') {
  const isX = axis === 'x';
  const isLog = isLogScale(yaml, axis);

  const axisRaw = yaml[axis];
  const axisIsString = typeof axisRaw === 'string';

  const label =
    (isX ? yaml.xTitle : yaml.yTitle) ??
    (axisIsString ? axisRaw : (axisRaw?.label ?? axisRaw?.title)) ??
    yaml.scales?.[axis]?.label ??
    yaml.options?.scales?.[axis]?.label ??
    yaml.options?.scales?.[axis]?.title ??
    null;

  const minVal = isX ? yaml.xMin : yaml.yMin;
  const maxVal = isX ? yaml.xMax : yaml.yMax;
  const domain =
    minVal !== undefined && maxVal !== undefined
      ? [minVal, maxVal]
      : (!axisIsString ? axisRaw?.domain : undefined) ?? yaml.scales?.[axis]?.domain;

  const reverse = isX ? yaml.xReverse ?? (!axisIsString ? axisRaw?.reverse : undefined) : yaml.yReverse ?? (!axisIsString ? axisRaw?.reverse : undefined);

  const display =
    (isX ? yaml.xDisplay : yaml.yDisplay) ??
    (!axisIsString ? (axisRaw?.display ?? axisRaw?.visible) : undefined) ??
    yaml.scales?.[axis]?.display;

  const grid =
    (!axisIsString ? axisRaw?.grid : undefined) ??
    yaml.scales?.[axis]?.grid ??
    yaml.grid ??
    true;

  return {
    type: isLog ? 'log' : undefined,
    label,
    domain,
    reverse: Boolean(reverse),
    axis: display === false ? null : undefined,
    grid: Boolean(grid),
  };
}

/**
 * Extracts and unifies common chart DSL configurations into a structured representation.
 */
export function parseCommonChartConfig(yaml: any): CommonChartConfig {
  if (!yaml || typeof yaml !== 'object') {
    return {
      legend: true,
      isXLog: false,
      isYLog: false,
      xLabel: null,
      yLabel: null,
      grid: true,
      fill: false,
      fillOpacity: 0.25,
      markLines: [],
    };
  }

  const title = yaml.title ?? yaml.chartTitle ?? undefined;
  const subtitle = yaml.subtitle ?? undefined;
  const caption = yaml.caption ?? undefined;

  const legend =
    yaml.legend !== undefined
      ? Boolean(yaml.legend)
      : yaml.options?.legend !== undefined
      ? Boolean(yaml.options.legend)
      : true;

  const isXLog = isLogScale(yaml, 'x');
  const isYLog = isLogScale(yaml, 'y');

  const xCfg = resolveAxisConfig(yaml, 'x');
  const yCfg = resolveAxisConfig(yaml, 'y');

  const { fill, fillOpacity } = resolveFillConfig(yaml);
  const markLines = extractMarkLines(yaml);

  const trendline =
    yaml.trendline ??
    yaml.trending ??
    yaml.trend ??
    yaml.bestFit ??
    yaml.options?.trendline;

  const { showLabels, fontSize: labelFontSize } = resolveLabelConfig(yaml);

  return {
    title,
    subtitle,
    caption,
    legend,
    isXLog,
    isYLog,
    xLabel: xCfg.label,
    yLabel: yCfg.label,
    xDomain: xCfg.domain,
    yDomain: yCfg.domain,
    xReverse: xCfg.reverse,
    yReverse: yCfg.reverse,
    xDisplay: xCfg.axis !== null,
    yDisplay: yCfg.axis !== null,
    beginAtZero: yaml.beginAtZero,
    grid: yaml.grid !== false,
    xGrid: xCfg.grid,
    yGrid: yCfg.grid,
    fill,
    fillOpacity,
    markLines,
    trendline,
    showLabels,
    labelFontSize,
  };
}
