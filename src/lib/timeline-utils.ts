import * as d3 from 'd3';

export type TimeGranularity = 'second' | 'minute' | 'hour' | 'day' | 'month' | 'year';

/**
 * Determines appropriate time granularity based on visible range duration in milliseconds
 */
export function getTimeGranularity(durationMs: number): TimeGranularity {
  const seconds = durationMs / 1000;
  const minutes = seconds / 60;
  const hours = minutes / 60;
  const days = hours / 24;

  if (seconds < 60) return 'second';
  if (minutes < 60) return 'minute';
  if (hours < 24) return 'hour';
  if (days < 30) return 'day';
  if (days < 365) return 'month';
  return 'year';
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatEraYear(year: number): string {
  if (year < 0) {
    return `${Math.abs(year)} BC`;
  }
  if (year < 1000) {
    return `${year} AD`;
  }
  return String(year);
}

/**
 * Returns an adaptive tick label formatter for d3 time axes based on time range scale
 */
export function createAdaptiveTickFormatter(
  timeRangeMs: number,
  customFormatters?: Partial<Record<TimeGranularity, string>>
): (d: Date | d3.NumberValue) => string {
  const granularity = getTimeGranularity(timeRangeMs);

  return (d: Date | d3.NumberValue): string => {
    const dateVal = d instanceof Date ? d : new Date(Number(d));
    if (isNaN(dateVal.getTime())) return '';

    const eraYear = formatEraYear(dateVal.getFullYear());

    if (customFormatters && customFormatters[granularity]) {
      const fmtStr = customFormatters[granularity]!;
      return d3.timeFormat(fmtStr)(dateVal).replace('%ERA_YEAR%', eraYear);
    }

    switch (granularity) {
      case 'second': {
        const monthStr = MONTH_NAMES[dateVal.getMonth()];
        const day = dateVal.getDate();
        const h = String(dateVal.getHours()).padStart(2, '0');
        const m = String(dateVal.getMinutes()).padStart(2, '0');
        const s = String(dateVal.getSeconds()).padStart(2, '0');
        return `${monthStr} ${day}, ${h}:${m}:${s}`;
      }
      case 'minute':
      case 'hour': {
        const monthStr = MONTH_NAMES[dateVal.getMonth()];
        const day = dateVal.getDate();
        const h = String(dateVal.getHours()).padStart(2, '0');
        const m = String(dateVal.getMinutes()).padStart(2, '0');
        return `${monthStr} ${day}, ${h}:${m}`;
      }
      case 'day': {
        const monthStr = MONTH_NAMES[dateVal.getMonth()];
        const day = dateVal.getDate();
        return `${monthStr} ${day}, ${eraYear}`;
      }
      case 'month': {
        const monthStr = MONTH_NAMES[dateVal.getMonth()];
        return `${monthStr} ${eraYear}`;
      }
      case 'year':
      default: {
        return eraYear;
      }
    }
  };
}

/**
 * Formats precise cursor date/time badges based on zoom scale granularity
 */
export function formatCursorDate(date: Date, durationMs: number): string {
  if (!date || isNaN(date.getTime())) return '';
  const granularity = getTimeGranularity(durationMs);
  const eraYear = formatEraYear(date.getFullYear());

  switch (granularity) {
    case 'second': {
      const monthStr = MONTH_NAMES[date.getMonth()];
      const day = date.getDate();
      const h = String(date.getHours()).padStart(2, '0');
      const m = String(date.getMinutes()).padStart(2, '0');
      const s = String(date.getSeconds()).padStart(2, '0');
      return `${monthStr} ${day}, ${eraYear} ${h}:${m}:${s}`;
    }
    case 'minute':
    case 'hour': {
      const monthStr = MONTH_NAMES[date.getMonth()];
      const day = date.getDate();
      const h = String(date.getHours()).padStart(2, '0');
      const m = String(date.getMinutes()).padStart(2, '0');
      return `${monthStr} ${day}, ${eraYear} ${h}:${m}`;
    }
    case 'day':
    case 'month':
    case 'year':
    default: {
      const monthStr = MONTH_NAMES[date.getMonth()];
      const day = date.getDate();
      return `${monthStr} ${day}, ${eraYear}`;
    }
  }
}

/**
 * Calculates optimal target tick count based on available inner width and visible time duration
 */
export function calculateOptimalTickCount(innerWidth: number, durationMs: number): number {
  const granularity = getTimeGranularity(durationMs);
  let minPxPerTick = 80;

  switch (granularity) {
    case 'second':
    case 'minute':
    case 'hour':
      minPxPerTick = 140;
      break;
    case 'day':
      minPxPerTick = 130;
      break;
    case 'month':
      minPxPerTick = 105;
      break;
    case 'year':
    default:
      minPxPerTick = 80;
      break;
  }

  return Math.max(3, Math.floor(innerWidth / minPxPerTick));
}

/**
 * Post-processes rendered D3 axis SVG group to hide overlapping tick labels
 */
// Performance optimization: Cache text measurement on text element property (_cachedWidth)
// and check text content (_cachedText) to eliminate getComputedTextLength() layout thrashing
// on continuous zoom/pan animation ticks. Iterate DOM nodes directly in single-pass index loop
// without intermediate heap array allocations and redundant sort calls.
export function preventTickOverlap(axisGNode: SVGGElement | null, minGapPx = 12): void {
  if (!axisGNode) return;
  const tickNodes = axisGNode.querySelectorAll<SVGGElement>('.tick');
  if (!tickNodes || tickNodes.length === 0) return;

  let lastRight = -Infinity;

  for (let i = 0; i < tickNodes.length; i++) {
    const el = tickNodes[i];
    const transformAttr = el.getAttribute('transform') || '';
    const match = /translate\(\s*([-\d.]+)/.exec(transformAttr);
    if (!match) continue;
    const x = parseFloat(match[1]);
    if (isNaN(x)) continue;

    const textEl = el.querySelector('text');
    if (!textEl) continue;

    const text = textEl.textContent || '';
    let width = (textEl as any)._cachedWidth as number | undefined;

    if (width === undefined || (textEl as any)._cachedText !== text) {
      width = 0;
      if (typeof (textEl as any).getComputedTextLength === 'function') {
        try {
          width = (textEl as any).getComputedTextLength();
        } catch {
          /* ignore */
        }
      }
      if (!width || width <= 0) {
        width = text.length * 7.5;
      }
      (textEl as any)._cachedText = text;
      (textEl as any)._cachedWidth = width;
    }

    const left = x - width / 2;
    const right = x + width / 2;

    if (left < lastRight + minGapPx) {
      el.style.display = 'none';
    } else {
      el.style.display = '';
      lastRight = right;
    }
  }
}
