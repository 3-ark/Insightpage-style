import type * as Plot from '@observablehq/plot';

import type { MarkLineConfig, TrendlineConfig } from './chartConfig';
import {
  isLogScale,
  extractMarkLines,
  buildPlotMarkLines,
  resolveAxisConfig,
} from './chartConfig';

export type { MarkLineConfig, TrendlineConfig };

export interface ScatterPoint {
  x: number;
  y: number;
  series: string;
  fill?: unknown;
  text?: string;
  r?: number;
  [key: string]: unknown;
}

type ChartConfig = Record<string, unknown>;
type DataRow = Record<string, unknown>;

interface TabularMeta {
  xCol: string;
  yCol: string;
  fillCol: string | undefined;
  textCol: string | undefined;
  rCol: string | undefined;
  hasR: boolean;
  isNumericFill: boolean;
}

interface ScatterData extends Array<ScatterPoint> {
  __tabularMeta?: TabularMeta;
}

function asChartConfig(value: unknown): ChartConfig {
  return typeof value === 'object' && value !== null ? value as ChartConfig : {};
}

function asDataRows(value: unknown): DataRow[] {
  return Array.isArray(value)
    ? value.filter((row): row is DataRow => typeof row === 'object' && row !== null && !Array.isArray(row))
    : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value.map((item: unknown) => item) : [];
}

function stringCandidates(...values: unknown[]): string[] {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function normalizeKey(str: string): string {
  return str
    .toLowerCase()
    .replace(/[²³]/g, (m) => (m === '²' ? '2' : '3'))
    .replace(/[^a-z0-9]/g, '');
}

function findMatchingColumn(candidates: string[], availableKeys: string[]): string | undefined {
  for (const c of candidates) {
    if (!c) continue;
    const direct = availableKeys.find((k) => k === c);
    if (direct) return direct;
    const lowerC = c.toLowerCase().trim();
    const caseMatch = availableKeys.find((k) => k.toLowerCase().trim() === lowerC);
    if (caseMatch) return caseMatch;
    const normC = normalizeKey(c);
    const normMatch = availableKeys.find((k) => normalizeKey(k) === normC);
    if (normMatch) return normMatch;
  }
  return undefined;
}

/**
 * Extracts and normalizes scatter data points from various schema formats:
 * - tableRows / tabular data: array of row objects mapped across columns (x, y, fill, text, r)
 * - series / datasets: [{ title, data: [[x, y], ...] | [{x, y}, ...] | [num, num, ...] }]
 * - data: [[x, y], ...] | [{x, y, series}, ...]
 * - labels-to-x mapping when data contains 1D numeric values
 */
export function extractScatterData(
  yaml: unknown,
  labels: unknown[] = []
): ScatterPoint[] {
  const config = asChartConfig(yaml);
  const scatterData: ScatterData = [];

  // Check if tabular data is provided (via tableRows or array of objects with >2 keys in yaml.data)
  const dataRows = asDataRows(config.data);
  const rows: DataRow[] | null =
    asDataRows(config.tableRows).length > 0
      ? asDataRows(config.tableRows)
      : asDataRows(config.rows).length > 0
      ? asDataRows(config.rows)
      : dataRows.length > 0 &&
        Object.keys(dataRows[0]).length > 2 &&
        !('x' in dataRows[0] && 'y' in dataRows[0] && Object.keys(dataRows[0]).length <= 3)
      ? dataRows
      : null;

  if (rows && rows.length > 0) {
    const sampleRow = rows[0];
    const availableKeys = Object.keys(sampleRow);

    // Identify which columns are primarily numeric and text
    const numericCols = availableKeys.filter((k) => {
      let count = 0;
      for (const r of rows) {
        const val = r[k];
        if (typeof val === 'number' || (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val)))) {
          count++;
        }
      }
      return count >= Math.ceil(rows.length * 0.5);
    });

    const textCols = availableKeys.filter((k) => !numericCols.includes(k));

    // Resolve X column
    const xConfig = asChartConfig(config.x);
    const explicitX =
      typeof config.x === 'string'
        ? config.x
        : xConfig.key || xConfig.field || xConfig.column || config.xField || config.xAxis;
    const xLabelCandidate = xConfig.label || config.xTitle;
    const xCol =
      findMatchingColumn(stringCandidates(explicitX, xLabelCandidate), availableKeys) ||
      (numericCols.length >= 2 ? numericCols[numericCols.length - 1] : numericCols[0]) ||
      availableKeys[0];

    // Resolve Y column
    const yConfig = asChartConfig(config.y);
    const explicitY =
      typeof config.y === 'string'
        ? config.y
        : yConfig.key || yConfig.field || yConfig.column || config.yField || config.yAxis;
    const yLabelCandidate = yConfig.label || config.yTitle;
    const yCol =
      findMatchingColumn(stringCandidates(explicitY, yLabelCandidate), availableKeys) ||
      numericCols.find((k) => k !== xCol) ||
      availableKeys.find((k) => k !== xCol) ||
      availableKeys[0];

    // Resolve Fill / Color column
    const fillConfig = asChartConfig(config.fill);
    const colorConfig = asChartConfig(config.color);
    const explicitFill =
      typeof config.fill === 'string'
        ? config.fill
        : typeof config.color === 'string'
        ? config.color
        : fillConfig.key || colorConfig.key || config.category || config.group;
    let fillCol = findMatchingColumn(stringCandidates(explicitFill), availableKeys);
    if (!fillCol) {
      // Find another numeric column (like Density) or categorical column
      fillCol = numericCols.find((k) => k !== xCol && k !== yCol);
    }

    // Resolve Text / Label column
    const textConfig = asChartConfig(config.text);
    const labelConfig = asChartConfig(config.label);
    const explicitText =
      typeof config.text === 'string'
        ? config.text
        : typeof config.label === 'string'
        ? config.label
        : textConfig.key || labelConfig.key;
    let textCol = findMatchingColumn(stringCandidates(explicitText), availableKeys);
    if (!textCol && textCols.length > 0) {
      textCol = textCols[0];
    }

    // Resolve Radius / Size column
    const explicitR =
      typeof config.r === 'string'
        ? findMatchingColumn([config.r], availableKeys)
        : typeof config.size === 'string'
        ? findMatchingColumn([config.size], availableKeys)
        : typeof config.radius === 'string'
        ? findMatchingColumn([config.radius], availableKeys)
        : undefined;

    let hasRValues = false;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rawX = r[xCol];
      const rawY = r[yCol];
      const numX = Number(rawX);
      const numY = Number(rawY);

      if (!isNaN(numX) && !isNaN(numY)) {
        const pt: ScatterPoint = {
          ...r,
          x: numX,
          y: numY,
          series: fillCol && r[fillCol] !== undefined ? String(r[fillCol]) : 'Points',
        };

        if (fillCol && r[fillCol] !== undefined) {
          pt.fill = r[fillCol];
        }
        if (textCol && r[textCol] !== undefined) {
          pt.text = String(r[textCol]);
        }
        if (explicitR && r[explicitR] !== undefined) {
          const numR = Number(r[explicitR]);
          if (!isNaN(numR)) {
            pt.r = numR;
            hasRValues = true;
          }
        }

        scatterData.push(pt);
      }
    }

    if (scatterData.length > 0) {
      scatterData.__tabularMeta = {
        xCol,
        yCol,
        fillCol,
        textCol,
        rCol: explicitR,
        hasR: hasRValues,
        isNumericFill: fillCol ? numericCols.includes(fillCol) : false,
      };
      return scatterData;
    }
  }

  const dataConfig = asChartConfig(config.data);
  const rawSeries =
    config.series ||
    config.datasets ||
    dataConfig.series ||
    dataConfig.datasets;

  if (Array.isArray(rawSeries) && rawSeries.length > 0) {
    for (let sIdx = 0; sIdx < rawSeries.length; sIdx++) {
      const s = asChartConfig(rawSeries[sIdx]);
      const seriesTitle = asString(s.title) || asString(s.label) || `Series ${sIdx + 1}`;
      const dataArr = asUnknownArray(s.data);

      for (let ptIdx = 0; ptIdx < dataArr.length; ptIdx++) {
        const pt = dataArr[ptIdx];
        if (Array.isArray(pt)) {
          // [x, y] tuple format
          const xVal = Number(pt[0]);
          const yVal = Number(pt[1]);
          if (!isNaN(xVal) && !isNaN(yVal)) {
            scatterData.push({ x: xVal, y: yVal, series: seriesTitle });
          }
        } else if (pt && typeof pt === 'object') {
          // { x, y } object format
          const ptConfig = asChartConfig(pt);
          const rawX = ptConfig.x ?? ptConfig.X ?? (labels[ptIdx] !== undefined ? labels[ptIdx] : ptIdx);
          const rawY = ptConfig.y ?? ptConfig.Y ?? ptConfig.value ?? ptConfig.val;
          const xVal = Number(rawX);
          const yVal = Number(rawY);
          if (!isNaN(xVal) && !isNaN(yVal)) {
            scatterData.push({ x: xVal, y: yVal, series: seriesTitle });
          }
        } else if (typeof pt === 'number' || (typeof pt === 'string' && !isNaN(Number(pt)))) {
          // numeric 1D value with labels mapping to x
          const rawX = labels[ptIdx] !== undefined ? Number(labels[ptIdx]) : ptIdx + 1;
          const xVal = isNaN(rawX) ? ptIdx + 1 : rawX;
          const yVal = Number(pt);
          if (!isNaN(xVal) && !isNaN(yVal)) {
            scatterData.push({ x: xVal, y: yVal, series: seriesTitle });
          }
        }
      }
    }
  } else if (Array.isArray(config.data)) {
    const dataArr = asUnknownArray(config.data);
    for (let ptIdx = 0; ptIdx < dataArr.length; ptIdx++) {
      const pt = dataArr[ptIdx];
      const ptConfig = asChartConfig(pt);
      const seriesTitle =
        asString(ptConfig.series) || asString(ptConfig.group) || asString(ptConfig.category) || 'Points';
      if (Array.isArray(pt)) {
        const xVal = Number(pt[0]);
        const yVal = Number(pt[1]);
        if (!isNaN(xVal) && !isNaN(yVal)) {
          scatterData.push({ x: xVal, y: yVal, series: seriesTitle });
        }
      } else if (pt && typeof pt === 'object') {
        const ptConfig = asChartConfig(pt);
        const xVal = Number(ptConfig.x ?? ptConfig.X ?? ptIdx);
        const yVal = Number(ptConfig.y ?? ptConfig.Y ?? ptConfig.value);
        if (!isNaN(xVal) && !isNaN(yVal)) {
          scatterData.push({ x: xVal, y: yVal, series: seriesTitle });
        }
      }
    }
  }

  return scatterData;
}

/**
 * Builds Observable Plot options for scatter / point / scatterplot DSL specifications.
 */
export function buildScatterPlotOptions(
  yaml: unknown,
  scatterData: ScatterPoint[],
  baseColors: string[],
  gridColor: string,
  textColor: string,
  PlotInst: typeof import('@observablehq/plot')
): Plot.PlotOptions {
  const config = asChartConfig(yaml);
  const marks: Plot.Markish[] = [];

  // Detect scale type (normal or log)
  const isXLog = isLogScale(config, 'x');
  const isYLog = isLogScale(config, 'y');

  const tabularMeta = (scatterData as ScatterData).__tabularMeta ?? {
    xCol: '',
    yCol: '',
    fillCol: undefined,
    textCol: undefined,
    rCol: undefined,
    hasR: false,
    isNumericFill: false,
  };
  const isTabular = Boolean((scatterData as ScatterData).__tabularMeta);

  // Grids and Zero lines
  marks.push(
    PlotInst.gridX({ stroke: gridColor, strokeDasharray: '2,2' }),
    PlotInst.gridY({ stroke: gridColor, strokeDasharray: '2,2' }),
    PlotInst.ruleY([0], { stroke: gridColor }),
    PlotInst.ruleX([0], { stroke: gridColor })
  );

  // Scatter points (dot mark)
  const pointRadius = typeof config.radius === 'number' ? config.radius : (typeof config.r === 'number' ? config.r : 6);
  const dotStroke = typeof config.stroke === 'string' ? config.stroke : 'white';
  const dotStrokeWidth = typeof config.strokeWidth === 'number' ? config.strokeWidth : 0.75;

  const dotOptions: Plot.DotOptions = {
    x: 'x',
    y: 'y',
    r: isTabular && tabularMeta.hasR ? 'r' : pointRadius,
    tip: true,
  };

  if (isTabular) {
    if (tabularMeta.fillCol) {
      dotOptions.fill = 'fill';
    } else {
      dotOptions.fill = baseColors[0] || '#3b82f6';
    }
    dotOptions.stroke = dotStroke;
    dotOptions.strokeWidth = dotStrokeWidth;
    if (typeof config.transparency === 'number') {
      dotOptions.fillOpacity = config.transparency;
    }
  } else {
    dotOptions.fill = 'series';
    dotOptions.stroke = dotStroke;
    dotOptions.strokeWidth = dotStrokeWidth;
    dotOptions.fillOpacity = typeof config.transparency === 'number' ? config.transparency : 0.7;
  }

  marks.push(PlotInst.dot(scatterData, dotOptions));

  // Text mark for dot labels if text column is present
  // Supports boolean toggles (false to hide, true to show all) or selective filtering:
  // - labels: ["China", "India"] or "China, India"
  // - showLabels: ["Monaco", "Singapore"]
  // - labelFilter: /China|India/ or string list
  const rawLabelsConfig =
    config.labels !== undefined
      ? config.labels
      : config.showLabels !== undefined
      ? config.showLabels
      : config.labelFilter !== undefined
      ? config.labelFilter
      : config.text !== undefined
      ? config.text
      : true;

  const isLabelsDisabled =
    rawLabelsConfig === false ||
    config.labels === false ||
    config.text === false ||
    config.showLabels === false;

  const hasTextMark = isTabular && tabularMeta.textCol && !isLabelsDisabled;

  if (hasTextMark) {
    let labeledPoints = scatterData;

    // Filter points if selective labels are specified (array or string filter)
    const filterConfig =
      config.labelFilter !== undefined
        ? config.labelFilter
        : Array.isArray(config.labels) || (typeof config.labels === 'string' && config.labels.trim() !== '' && config.labels !== 'true')
        ? config.labels
        : Array.isArray(config.showLabels) || (typeof config.showLabels === 'string' && config.showLabels.trim() !== '' && config.showLabels !== 'true')
        ? config.showLabels
        : undefined;

    if (filterConfig) {
      if (Array.isArray(filterConfig)) {
        const allowed = new Set(
          filterConfig.map((item) => String(item).trim().toLowerCase())
        );
        labeledPoints = scatterData.filter(
          (pt) => pt.text && allowed.has(String(pt.text).trim().toLowerCase())
        );
      } else if (typeof filterConfig === 'string') {
        const parts = filterConfig
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        const allowed = new Set(parts);
        labeledPoints = scatterData.filter(
          (pt) => pt.text && allowed.has(String(pt.text).trim().toLowerCase())
        );
      }
    }

    const fontSize = typeof config.fontSize === 'number' ? config.fontSize : 10;
    marks.push(
      PlotInst.text(labeledPoints, {
        x: 'x',
        y: 'y',
        text: 'text',
        dy: typeof config.dy === 'number' ? config.dy : -10,
        fontSize,
      })
    );
  }

  // Trending line (Linear Regression)
  const optionsConfig = asChartConfig(config.options);
  const trendConfig: boolean | TrendlineConfig | undefined =
    (typeof config.trendline === 'boolean' || typeof config.trendline === 'object'
      ? config.trendline as boolean | TrendlineConfig
      : typeof config.trending === 'boolean' || typeof config.trending === 'object'
      ? config.trending as boolean | TrendlineConfig
      : typeof config.trend === 'boolean' || typeof config.trend === 'object'
      ? config.trend as boolean | TrendlineConfig
      : typeof config.bestFit === 'boolean' || typeof config.bestFit === 'object'
      ? config.bestFit as boolean | TrendlineConfig
      : typeof optionsConfig.trendline === 'boolean' || typeof optionsConfig.trendline === 'object'
      ? optionsConfig.trendline as boolean | TrendlineConfig
      : undefined);

  if (trendConfig) {
    const isObj = typeof trendConfig === 'object' && trendConfig !== null;
    const strokeColor =
      isObj && trendConfig.stroke
        ? trendConfig.stroke
        : isTabular
        ? '#3b82f6'
        : 'series';
    const strokeWidth = isObj && trendConfig.strokeWidth ? trendConfig.strokeWidth : 2;
    const strokeDash =
      isObj && trendConfig.strokeDasharray
        ? trendConfig.strokeDasharray
        : isObj && trendConfig.stroke
        ? undefined
        : '4,4';
    const ciVal = isObj && trendConfig.ci !== undefined ? (trendConfig.ci ? 0.95 : undefined) : undefined;
    const fillVal =
      isObj && trendConfig.fill
        ? typeof trendConfig.fill === 'string'
          ? trendConfig.fill
          : 'series'
        : null;

    marks.push(
      PlotInst.linearRegressionY(scatterData, {
        x: 'x',
        y: 'y',
        stroke: strokeColor,
        strokeWidth,
        strokeDasharray: strokeDash,
        ci: ciVal,
        fill: fillVal,
      })
    );
  }

  // Mark lines (reference rules)
  const markLineConfigs = extractMarkLines(config);
  if (markLineConfigs.length > 0) {
    marks.push(...buildPlotMarkLines(markLineConfigs, PlotInst));
  }

  const showLegend =
    config.legend !== undefined
      ? Boolean(config.legend)
      : optionsConfig.legend !== undefined
      ? Boolean(optionsConfig.legend)
      : true;

  let colorConfig: Record<string, unknown>;
  if (isTabular && tabularMeta.isNumericFill) {
    // Determine color scale type:
    // User request: Align color ruler scale with x or y scale when either is using log axis,
    // or when explicitly requested via colorScale/colorType/color.type/colorLog.
    const colorOption = asChartConfig(config.color);
    const scalesConfig = asChartConfig(config.scales);
    const scalesColor = asChartConfig(scalesConfig.color);
    const explicitColorType =
      asString(config.colorType) ||
      asString(config.colorScale) ||
      asString(colorOption.type) ||
      asString(colorOption.scale) ||
      asString(scalesColor.type);

    let colorType: string;
    if (explicitColorType) {
      colorType = explicitColorType === 'logarithmic' ? 'log' : explicitColorType;
    } else if (config.colorLog === true || config.logColor === true) {
      colorType = 'log';
    } else if (isXLog || isYLog) {
      // Auto-align with log axis
      colorType = 'log';
    } else {
      colorType = 'linear';
    }

    colorConfig = {
      type: colorType,
      scheme: asString(config.colorScheme) || asString(colorOption.scheme) || 'turbo',
      legend: showLegend,
      label: tabularMeta.fillCol,
      ...(config.colorDomain ? { domain: config.colorDomain } : {}),
      ...(colorOption.domain ? { domain: colorOption.domain } : {}),
    };
  } else {
    colorConfig = {
      range: baseColors,
      legend: showLegend,
    };
  }

  const xResolved = resolveAxisConfig(config, 'x');
  const yResolved = resolveAxisConfig(config, 'y');

  const xAxisLabel = xResolved.label ?? (isTabular ? tabularMeta.xCol : null);
  const yAxisLabel = yResolved.label ?? (isTabular ? tabularMeta.yCol : null);

  // Auto-adaptive ticks based on width
  let defaultXTicks: unknown;
  const xConfig = asChartConfig(config.x);
  const scalesConfig = asChartConfig(config.scales);
  const scalesX = asChartConfig(scalesConfig.x);
  const explicitXTicks = config.xTicks ?? config.ticks ?? xConfig.ticks ?? scalesX.ticks;
  if (explicitXTicks !== undefined) {
    defaultXTicks = explicitXTicks;
  } else {
    let estWidth = 640;
    if (typeof config.width === 'number') {
      estWidth = config.width;
    } else if (typeof config.width === 'string') {
      const pxMatch = config.width.match(/^(\d+(?:\.\d+)?)px$/);
      if (pxMatch) {
        estWidth = parseFloat(pxMatch[1]);
      } else {
        const pctMatch = config.width.match(/^(\d+(?:\.\d+)?)%$/);
        if (pctMatch) {
          estWidth = Math.round((parseFloat(pctMatch[1]) / 100) * 700);
        }
      }
    }
    defaultXTicks = Math.max(3, Math.min(12, Math.round(estWidth / 80)));
  }

  const xAxisConfig: Record<string, unknown> = {
    type: isXLog ? 'log' : 'linear',
    label: xAxisLabel,
    grid: xConfig.grid ?? true,
    domain: xResolved.domain,
    reverse: xResolved.reverse,
    ticks: defaultXTicks,
    axis: config.xDisplay === false ? null : undefined,
  };

  const yAxisConfig: Record<string, unknown> = {
    type: isYLog ? 'log' : 'linear',
    label: yAxisLabel,
    grid: asChartConfig(config.y).grid ?? true,
    domain: yResolved.domain,
    reverse: yResolved.reverse,
    zero: config.beginAtZero ?? false,
    axis: config.yDisplay === false ? null : undefined,
  };

  return {
    title: asString(config.title) ?? asString(config.chartTitle),
    subtitle: asString(config.subtitle),
    caption: asString(config.caption),
    style: {
      background: 'transparent',
      color: textColor,
    },
    color: colorConfig,
    x: xAxisConfig,
    y: yAxisConfig,
    marks,
  };
}
