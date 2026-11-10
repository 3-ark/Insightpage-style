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
  fill?: any;
  text?: string;
  r?: number;
  [key: string]: any;
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
  yaml: any,
  labels: any[] = []
): ScatterPoint[] {
  const scatterData: ScatterPoint[] = [];

  // Check if tabular data is provided (via tableRows or array of objects with >2 keys in yaml.data)
  const rows: any[] | null =
    Array.isArray(yaml.tableRows) && yaml.tableRows.length > 0
      ? yaml.tableRows
      : Array.isArray(yaml.rows) && yaml.rows.length > 0
      ? yaml.rows
      : Array.isArray(yaml.data) &&
        yaml.data.length > 0 &&
        yaml.data[0] &&
        typeof yaml.data[0] === 'object' &&
        !Array.isArray(yaml.data[0]) &&
        Object.keys(yaml.data[0]).length > 2 &&
        !('x' in yaml.data[0] && 'y' in yaml.data[0] && Object.keys(yaml.data[0]).length <= 3)
      ? yaml.data
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
    const explicitX =
      typeof yaml.x === 'string'
        ? yaml.x
        : yaml.x?.key || yaml.x?.field || yaml.x?.column || yaml.xField || yaml.xAxis;
    const xLabelCandidate = yaml.x?.label || yaml.xTitle;
    const xCol =
      findMatchingColumn([explicitX, xLabelCandidate].filter(Boolean), availableKeys) ||
      (numericCols.length >= 2 ? numericCols[numericCols.length - 1] : numericCols[0]) ||
      availableKeys[0];

    // Resolve Y column
    const explicitY =
      typeof yaml.y === 'string'
        ? yaml.y
        : yaml.y?.key || yaml.y?.field || yaml.y?.column || yaml.yField || yaml.yAxis;
    const yLabelCandidate = yaml.y?.label || yaml.yTitle;
    const yCol =
      findMatchingColumn([explicitY, yLabelCandidate].filter(Boolean), availableKeys) ||
      numericCols.find((k) => k !== xCol) ||
      availableKeys.find((k) => k !== xCol) ||
      availableKeys[0];

    // Resolve Fill / Color column
    const explicitFill =
      typeof yaml.fill === 'string'
        ? yaml.fill
        : typeof yaml.color === 'string'
        ? yaml.color
        : yaml.fill?.key || yaml.color?.key || yaml.category || yaml.group;
    let fillCol = findMatchingColumn([explicitFill].filter(Boolean), availableKeys);
    if (!fillCol) {
      // Find another numeric column (like Density) or categorical column
      fillCol = numericCols.find((k) => k !== xCol && k !== yCol);
    }

    // Resolve Text / Label column
    const explicitText =
      typeof yaml.text === 'string'
        ? yaml.text
        : typeof yaml.label === 'string'
        ? yaml.label
        : yaml.text?.key || yaml.label?.key;
    let textCol = findMatchingColumn([explicitText].filter(Boolean), availableKeys);
    if (!textCol && textCols.length > 0) {
      textCol = textCols[0];
    }

    // Resolve Radius / Size column
    const explicitR =
      typeof yaml.r === 'string'
        ? findMatchingColumn([yaml.r], availableKeys)
        : typeof yaml.size === 'string'
        ? findMatchingColumn([yaml.size], availableKeys)
        : typeof yaml.radius === 'string'
        ? findMatchingColumn([yaml.radius], availableKeys)
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
      (scatterData as any).__tabularMeta = {
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

  const rawSeries =
    yaml.series ||
    yaml.datasets ||
    yaml.data?.series ||
    yaml.data?.datasets;

  if (Array.isArray(rawSeries) && rawSeries.length > 0) {
    for (let sIdx = 0; sIdx < rawSeries.length; sIdx++) {
      const s = rawSeries[sIdx];
      if (!s || typeof s !== 'object') continue;
      const seriesTitle = s.title || s.label || `Series ${sIdx + 1}`;
      const dataArr = Array.isArray(s.data) ? s.data : [];

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
          const rawX = pt.x ?? pt.X ?? (labels[ptIdx] !== undefined ? labels[ptIdx] : ptIdx);
          const rawY = pt.y ?? pt.Y ?? pt.value ?? pt.val;
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
  } else if (Array.isArray(yaml.data)) {
    for (let ptIdx = 0; ptIdx < yaml.data.length; ptIdx++) {
      const pt = yaml.data[ptIdx];
      const seriesTitle = pt?.series || pt?.group || pt?.category || 'Points';
      if (Array.isArray(pt)) {
        const xVal = Number(pt[0]);
        const yVal = Number(pt[1]);
        if (!isNaN(xVal) && !isNaN(yVal)) {
          scatterData.push({ x: xVal, y: yVal, series: seriesTitle });
        }
      } else if (pt && typeof pt === 'object') {
        const xVal = Number(pt.x ?? pt.X ?? ptIdx);
        const yVal = Number(pt.y ?? pt.Y ?? pt.value);
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
  yaml: any,
  scatterData: ScatterPoint[],
  baseColors: string[],
  gridColor: string,
  textColor: string,
  PlotInst: typeof import('@observablehq/plot')
): Plot.PlotOptions {
  const marks: any[] = [];

  // Detect scale type (normal or log)
  const isXLog = isLogScale(yaml, 'x');
  const isYLog = isLogScale(yaml, 'y');

  const tabularMeta = (scatterData as any)?.__tabularMeta;
  const isTabular = Boolean(tabularMeta);

  // Grids and Zero lines
  marks.push(
    PlotInst.gridX({ stroke: gridColor, strokeDasharray: '2,2' }),
    PlotInst.gridY({ stroke: gridColor, strokeDasharray: '2,2' }),
    PlotInst.ruleY([0], { stroke: gridColor }),
    PlotInst.ruleX([0], { stroke: gridColor })
  );

  // Scatter points (dot mark)
  const pointRadius = typeof yaml.radius === 'number' ? yaml.radius : (typeof yaml.r === 'number' ? yaml.r : 6);
  const dotStroke = yaml.stroke !== undefined ? yaml.stroke : 'white';
  const dotStrokeWidth = typeof yaml.strokeWidth === 'number' ? yaml.strokeWidth : 0.75;

  const dotOptions: any = {
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
    if (yaml.transparency !== undefined) {
      dotOptions.fillOpacity = yaml.transparency;
    }
  } else {
    dotOptions.fill = 'series';
    dotOptions.stroke = dotStroke;
    dotOptions.strokeWidth = dotStrokeWidth;
    dotOptions.fillOpacity = yaml.transparency ?? 0.7;
  }

  marks.push(PlotInst.dot(scatterData, dotOptions));

  // Text mark for dot labels if text column is present
  // Supports boolean toggles (false to hide, true to show all) or selective filtering:
  // - labels: ["China", "India"] or "China, India"
  // - showLabels: ["Monaco", "Singapore"]
  // - labelFilter: /China|India/ or string list
  const rawLabelsConfig =
    yaml.labels !== undefined
      ? yaml.labels
      : yaml.showLabels !== undefined
      ? yaml.showLabels
      : yaml.labelFilter !== undefined
      ? yaml.labelFilter
      : yaml.text !== undefined
      ? yaml.text
      : true;

  const isLabelsDisabled =
    rawLabelsConfig === false ||
    yaml.labels === false ||
    yaml.text === false ||
    yaml.showLabels === false;

  const hasTextMark = isTabular && tabularMeta.textCol && !isLabelsDisabled;

  if (hasTextMark) {
    let labeledPoints = scatterData;

    // Filter points if selective labels are specified (array or string filter)
    const filterConfig =
      yaml.labelFilter !== undefined
        ? yaml.labelFilter
        : Array.isArray(yaml.labels) || (typeof yaml.labels === 'string' && yaml.labels.trim() !== '' && yaml.labels !== 'true')
        ? yaml.labels
        : Array.isArray(yaml.showLabels) || (typeof yaml.showLabels === 'string' && yaml.showLabels.trim() !== '' && yaml.showLabels !== 'true')
        ? yaml.showLabels
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

    const fontSize = typeof yaml.fontSize === 'number' ? yaml.fontSize : 10;
    marks.push(
      PlotInst.text(labeledPoints, {
        x: 'x',
        y: 'y',
        text: 'text',
        dy: yaml.dy ?? -10,
        fontSize,
      })
    );
  }

  // Trending line (Linear Regression)
  const trendConfig: boolean | TrendlineConfig | undefined =
    yaml.trendline ??
    yaml.trending ??
    yaml.trend ??
    yaml.bestFit ??
    yaml.options?.trendline;

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
    const ciVal = isObj && trendConfig.ci !== undefined ? (trendConfig.ci ? 0.95 : null) : null;
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
        ci: ciVal as any,
        fill: fillVal as any,
      })
    );
  }

  // Mark lines (reference rules)
  const markLineConfigs = extractMarkLines(yaml);
  if (markLineConfigs.length > 0) {
    marks.push(...buildPlotMarkLines(markLineConfigs, PlotInst));
  }

  const showLegend =
    yaml.legend !== undefined
      ? Boolean(yaml.legend)
      : yaml.options?.legend !== undefined
      ? Boolean(yaml.options.legend)
      : true;

  let colorConfig: any;
  if (isTabular && tabularMeta.isNumericFill) {
    // Determine color scale type:
    // User request: Align color ruler scale with x or y scale when either is using log axis,
    // or when explicitly requested via colorScale/colorType/color.type/colorLog.
    const explicitColorType =
      yaml.colorType ||
      yaml.colorScale ||
      yaml.color?.type ||
      yaml.color?.scale ||
      yaml.scales?.color?.type;

    let colorType: string;
    if (explicitColorType) {
      colorType = explicitColorType === 'logarithmic' ? 'log' : explicitColorType;
    } else if (yaml.colorLog === true || yaml.logColor === true) {
      colorType = 'log';
    } else if (isXLog || isYLog) {
      // Auto-align with log axis
      colorType = 'log';
    } else {
      colorType = 'linear';
    }

    colorConfig = {
      type: colorType,
      scheme: yaml.colorScheme || yaml.color?.scheme || 'turbo',
      legend: showLegend,
      label: tabularMeta.fillCol,
      ...(yaml.colorDomain ? { domain: yaml.colorDomain } : {}),
      ...(yaml.color?.domain ? { domain: yaml.color.domain } : {}),
    };
  } else {
    colorConfig = {
      range: baseColors,
      legend: showLegend,
    };
  }

  const xResolved = resolveAxisConfig(yaml, 'x');
  const yResolved = resolveAxisConfig(yaml, 'y');

  const xAxisLabel = xResolved.label ?? (isTabular ? tabularMeta.xCol : null);
  const yAxisLabel = yResolved.label ?? (isTabular ? tabularMeta.yCol : null);

  // Auto-adaptive ticks based on width
  let defaultXTicks: any = undefined;
  const explicitXTicks = yaml.xTicks ?? yaml.ticks ?? yaml.x?.ticks ?? yaml.scales?.x?.ticks;
  if (explicitXTicks !== undefined) {
    defaultXTicks = explicitXTicks;
  } else {
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
    defaultXTicks = Math.max(3, Math.min(12, Math.round(estWidth / 80)));
  }

  const xAxisConfig: any = {
    type: isXLog ? 'log' : 'linear',
    label: xAxisLabel,
    grid: yaml.x?.grid ?? true,
    domain: xResolved.domain,
    reverse: xResolved.reverse,
    ticks: defaultXTicks,
    axis: yaml.xDisplay === false ? null : undefined,
  };

  const yAxisConfig: any = {
    type: isYLog ? 'log' : 'linear',
    label: yAxisLabel,
    grid: yaml.y?.grid ?? true,
    domain: yResolved.domain,
    reverse: yResolved.reverse,
    zero: yaml.beginAtZero ?? false,
    axis: yaml.yDisplay === false ? null : undefined,
  };

  return {
    title: yaml.title ?? yaml.chartTitle ?? undefined,
    subtitle: yaml.subtitle ?? undefined,
    caption: yaml.caption ?? undefined,
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
