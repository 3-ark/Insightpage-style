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
        const monthStr = d3.timeFormat('%b')(dateVal);
        const day = dateVal.getDate();
        const timeStr = d3.timeFormat('%H:%M:%S')(dateVal);
        return `${monthStr} ${day}, ${timeStr}`;
      }
      case 'minute': {
        const monthStr = d3.timeFormat('%b')(dateVal);
        const day = dateVal.getDate();
        const timeStr = d3.timeFormat('%H:%M')(dateVal);
        return `${monthStr} ${day}, ${timeStr}`;
      }
      case 'hour': {
        const monthStr = d3.timeFormat('%b')(dateVal);
        const day = dateVal.getDate();
        const timeStr = d3.timeFormat('%H:%M')(dateVal);
        return `${monthStr} ${day}, ${timeStr}`;
      }
      case 'day': {
        const monthStr = d3.timeFormat('%b')(dateVal);
        const day = dateVal.getDate();
        return `${monthStr} ${day}, ${eraYear}`;
      }
      case 'month': {
        const monthStr = d3.timeFormat('%b')(dateVal);
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
      const monthStr = d3.timeFormat('%b')(date);
      const day = date.getDate();
      const timeStr = d3.timeFormat('%H:%M:%S')(date);
      return `${monthStr} ${day}, ${eraYear} ${timeStr}`;
    }
    case 'minute':
    case 'hour': {
      const monthStr = d3.timeFormat('%b')(date);
      const day = date.getDate();
      const timeStr = d3.timeFormat('%H:%M')(date);
      return `${monthStr} ${day}, ${eraYear} ${timeStr}`;
    }
    case 'day': {
      const monthStr = d3.timeFormat('%b')(date);
      const day = date.getDate();
      return `${monthStr} ${day}, ${eraYear}`;
    }
    case 'month': {
      const monthStr = d3.timeFormat('%b')(date);
      return `${monthStr} ${eraYear}`;
    }
    case 'year':
    default: {
      return eraYear;
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
export function preventTickOverlap(axisGNode: SVGGElement | null, minGapPx = 12): void {
  if (!axisGNode) return;
  const tickNodes = axisGNode.querySelectorAll<SVGGElement>('.tick');
  if (!tickNodes || tickNodes.length === 0) return;

  const ticks: { el: SVGGElement; x: number; width: number }[] = [];

  tickNodes.forEach((el) => {
    const transformAttr = el.getAttribute('transform') || '';
    const match = /translate\(\s*([-\d.]+)/.exec(transformAttr);
    const x = match ? parseFloat(match[1]) : NaN;
    if (isNaN(x)) return;

    const textEl = el.querySelector('text');
    if (!textEl) return;

    const text = textEl.textContent || '';
    let width = 0;
    if (typeof (textEl as any).getComputedTextLength === 'function') {
      try {
        width = (textEl as any).getComputedTextLength();
      } catch {}
    }
    if (!width || width <= 0) {
      width = text.length * 7.5;
    }

    ticks.push({ el, x, width });
  });

  ticks.sort((a, b) => a.x - b.x);

  let lastRight = -Infinity;

  ticks.forEach(({ el, x, width }) => {
    const left = x - width / 2;
    const right = x + width / 2;

    if (left < lastRight + minGapPx) {
      el.style.display = 'none';
    } else {
      el.style.display = '';
      lastRight = right;
    }
  });
}
