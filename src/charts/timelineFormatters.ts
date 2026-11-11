import { createAdaptiveTickFormatter } from '../lib/timeline-utils';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDisplayDate(date: Date): string {
  if (!date || isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const monthStr = MONTH_NAMES[date.getMonth()];
  if (year < 0) {
    return `${monthStr} ${Math.abs(year)} BC`;
  }
  if (year < 1000) {
    return `${monthStr} ${year} AD`;
  }
  return `${monthStr} ${year}`;
}

export function formatTimelineTick(
  d: Date | d3.NumberValue,
  domain?: [Date, Date],
  tickIntervalMs?: number
): string {
  const dateVal = d instanceof Date ? d : new Date(Number(d));
  if (isNaN(dateVal.getTime())) return '';

  let intervalMs = tickIntervalMs;
  if ((intervalMs === undefined || isNaN(intervalMs)) && domain && domain[0] && domain[1]) {
    const spanMs = Math.abs(domain[1].getTime() - domain[0].getTime());
    if (!isNaN(spanMs)) {
      intervalMs = spanMs / 6;
    }
  }

  if (!intervalMs || isNaN(intervalMs)) {
    const year = dateVal.getFullYear();
    if (year < 0) return `${Math.abs(year)} BC`;
    if (year < 1000) return `${year} AD`;
    return String(year);
  }

  const formatter = createAdaptiveTickFormatter(intervalMs);
  return formatter(dateVal);
}
