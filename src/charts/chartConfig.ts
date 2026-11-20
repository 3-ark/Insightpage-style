
export interface MarkLineConfig {
  x?: number | string;
  y?: number | string;
  value?: number | string;
  axis?: 'x' | 'y' | 'xAxis' | 'yAxis' | (string & {});
  label?: string;
  title?: string;
  text?: string;
  color?: string;
  stroke?: string;
  style?: 'solid' | 'dashed' | 'dotted' | (string & {});
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
  xDomain?: unknown[];
  yDomain?: unknown[];
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

type ChartDsl = Record<string, unknown>;

function asChartDsl(value: unknown): ChartDsl | null {
  return value && typeof value === 'object' ? value as ChartDsl : null;
}

/**
 * Standardizes log scale detection across all chart types and DSL permutations:
 * - xLog / yLog (boolean)
 * - xScale: 'log' | 'logarithmic'
 * - xType / x.type / scales.x.type / options.scales.x.type: 'log' | 'logarithmic'
 */
export function isLogScale(yaml: unknown, axis: 'x' | 'y'): boolean {
  const config = asChartDsl(yaml);
  if (!config) return false;
  const a = axis;
  const axisConfig = asChartDsl(config[a]);
  const axisLabel = asChartDsl(config[`${a}Axis`]);
  const scales = asChartDsl(config.scales);
  const scaleConfig = scales ? asChartDsl(scales[a]) : null;
  const options = asChartDsl(config.options);
  const optionScales = options ? asChartDsl(options.scales) : null;
  const optionScaleConfig = optionScales ? asChartDsl(optionScales[a]) : null;

  return Boolean(
    config[`${a}Log`] ||
    config[`${a}Scale`] === 'log' ||
    config[`${a}Scale`] === 'logarithmic' ||
    config[`${a}Type`] === 'log' ||
    config[`${a}Type`] === 'logarithmic' ||
    axisConfig?.type === 'log' ||
    axisConfig?.type === 'logarithmic' ||
    axisConfig?.scale === 'log' ||
    axisConfig?.scale === 'logarithmic' ||
    axisLabel?.type === 'log' ||
    axisLabel?.type === 'logarithmic' ||
    scaleConfig?.type === 'log' ||
    scaleConfig?.type === 'logarithmic' ||
    optionScaleConfig?.type === 'log' ||
    optionScaleConfig?.type === 'logarithmic' ||
    options?.[`${a}Log`] ||
    options?.[`${a}Scale`] === 'log'
  );
}

/**
 * Extracts mark line configurations supported universally across chart DSLs:
 * - markLine / markLines / markline / marklines / marks
 * - options.markLine / options.markLines
 */
export function extractMarkLines(yaml: unknown): MarkLineConfig[] {
  const config = asChartDsl(yaml);
  if (!config) return [];
  const options = asChartDsl(config.options);
  const raw =
    config.markLine ||
    config.markLines ||
    config.markline ||
    config.marklines ||
    config.marks ||
    options?.markLine ||
    options?.markLines;

  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const results: MarkLineConfig[] = [];

  for (const item of list) {
    if (item && typeof item === 'object') {
      results.push(item as MarkLineConfig);
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
): Array<import('@observablehq/plot').RenderableMark> {
  const marks: Array<import('@observablehq/plot').RenderableMark> = [];
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
export function resolveFillConfig(yaml: unknown, defaultFill: boolean | string = false): {
  fill: boolean | string;
  fillOpacity: number;
} {
  const config = asChartDsl(yaml) ?? {};
  const fill =
    config.fill !== undefined
      ? (typeof config.fill === 'boolean' || typeof config.fill === 'string' ? config.fill : defaultFill)
      : config.filled !== undefined
      ? (typeof config.filled === 'boolean' || typeof config.filled === 'string' ? config.filled : defaultFill)
      : config.area !== undefined
      ? (typeof config.area === 'boolean' || typeof config.area === 'string' ? config.area : defaultFill)
      : defaultFill;

  const rawFillOpacity =
    typeof config.fillOpacity === 'number'
      ? config.fillOpacity
      : typeof config.transparency === 'number'
      ? config.transparency
      : typeof config.opacity === 'number'
      ? config.opacity
      : 0.25;
  const fillOpacity = Number.isFinite(rawFillOpacity)
    ? Math.max(0, Math.min(1, rawFillOpacity))
    : 0.25;

  return { fill, fillOpacity };
}

/**
 * Resolves unified label / dataLabels configuration across chart DSLs.
 */
export function resolveLabelConfig(yaml: unknown): {
  showLabels: boolean;
  filterSet?: Set<string>;
  fontSize: number;
} {
  const config = asChartDsl(yaml) ?? {};
  const rawLabelsConfig =
    config.dataLabels !== undefined
      ? config.dataLabels
      : config.showLabels !== undefined
      ? config.showLabels
      : config.labelFilter !== undefined
      ? config.labelFilter
      : config.pointLabels !== undefined
      ? config.pointLabels
      : config.labelsConfig;

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

  const fontSize = typeof config.fontSize === 'number' ? config.fontSize : 10;
  return { showLabels, filterSet, fontSize };
}

/**
 * Resolves universal axis configurations (labels, domain, reverse, display, log type).
 */
export function resolveAxisConfig(yaml: unknown, axis: 'x' | 'y') {
  const config = asChartDsl(yaml) ?? {};
  const isX = axis === 'x';
  const isLog = isLogScale(yaml, axis);

  const axisRaw = config[axis];
  const axisIsString = typeof axisRaw === 'string';
  const axisConfig = asChartDsl(axisRaw);
  const scales = asChartDsl(config.scales);
  const scaleConfig = scales ? asChartDsl(scales[axis]) : null;
  const options = asChartDsl(config.options);
  const optionScales = options ? asChartDsl(options.scales) : null;
  const optionScaleConfig = optionScales ? asChartDsl(optionScales[axis]) : null;

  const labelCandidate =
    (isX ? config.xTitle : config.yTitle) ??
    (axisIsString ? axisRaw : (axisConfig?.label ?? axisConfig?.title)) ??
    scaleConfig?.label ??
    optionScaleConfig?.label ??
    optionScaleConfig?.title ??
    null;
  const label = typeof labelCandidate === 'string' ? labelCandidate : null;

  const minVal = isX ? config.xMin : config.yMin;
  const maxVal = isX ? config.xMax : config.yMax;
  const domain =
    minVal !== undefined && maxVal !== undefined
      ? [minVal, maxVal]
      : (!axisIsString ? axisConfig?.domain : undefined) ?? scaleConfig?.domain;
  const domainArray = Array.isArray(domain) ? domain : undefined;

  const reverse = isX
    ? config.xReverse ?? (!axisIsString ? axisConfig?.reverse : undefined)
    : config.yReverse ?? (!axisIsString ? axisConfig?.reverse : undefined);

  const display =
    (isX ? config.xDisplay : config.yDisplay) ??
    (!axisIsString ? (axisConfig?.display ?? axisConfig?.visible) : undefined) ??
    scaleConfig?.display;

  const grid =
    (!axisIsString ? axisConfig?.grid : undefined) ??
    scaleConfig?.grid ??
    config.grid ??
    true;

  return {
    type: isLog ? 'log' : undefined,
    label,
    domain: domainArray,
    reverse: Boolean(reverse),
    axis: display === false ? null : undefined,
    grid: Boolean(grid),
  };
}

/**
 * Extracts and unifies common chart DSL configurations into a structured representation.
 */
export function parseCommonChartConfig(yaml: unknown): CommonChartConfig {
  const config = asChartDsl(yaml);
  if (!config) {
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

  const title = typeof (config.title ?? config.chartTitle) === 'string'
    ? (config.title ?? config.chartTitle) as string
    : undefined;
  const subtitle = typeof config.subtitle === 'string' ? config.subtitle : undefined;
  const caption = typeof config.caption === 'string' ? config.caption : undefined;
  const options = asChartDsl(config.options);

  const legend =
    config.legend !== undefined
      ? Boolean(config.legend)
      : options?.legend !== undefined
      ? Boolean(options.legend)
      : true;

  const isXLog = isLogScale(yaml, 'x');
  const isYLog = isLogScale(yaml, 'y');

  const xCfg = resolveAxisConfig(yaml, 'x');
  const yCfg = resolveAxisConfig(yaml, 'y');

  const { fill, fillOpacity } = resolveFillConfig(yaml);
  const markLines = extractMarkLines(yaml);

  const trendline =
    config.trendline ??
    config.trending ??
    config.trend ??
    config.bestFit ??
    options?.trendline;
  const trendlineConfig =
    typeof trendline === 'boolean' || (trendline && typeof trendline === 'object')
      ? trendline as TrendlineConfig | boolean
      : undefined;

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
    beginAtZero: typeof config.beginAtZero === 'boolean' ? config.beginAtZero : undefined,
    grid: config.grid !== false,
    xGrid: xCfg.grid,
    yGrid: yCfg.grid,
    fill,
    fillOpacity,
    markLines,
    trendline: trendlineConfig,
    showLabels,
    labelFontSize,
  };
}
