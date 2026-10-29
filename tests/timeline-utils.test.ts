import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  getTimeGranularity,
  createAdaptiveTickFormatter,
  formatCursorDate,
  calculateOptimalTickCount,
  preventTickOverlap,
} from '../src/lib/timeline-utils';

test('getTimeGranularity determines correct granularity based on duration in ms', () => {
  assert.equal(getTimeGranularity(30 * 1000), 'second');
  assert.equal(getTimeGranularity(10 * 60 * 1000), 'minute');
  assert.equal(getTimeGranularity(5 * 3600 * 1000), 'hour');
  assert.equal(getTimeGranularity(10 * 86400 * 1000), 'day');
  assert.equal(getTimeGranularity(120 * 86400 * 1000), 'month');
  assert.equal(getTimeGranularity(500 * 86400 * 1000), 'year');
});

test('createAdaptiveTickFormatter formats dates accurately across granularities and BC/AD eras', () => {
  const d = new Date('2023-05-15T14:30:45');

  // Second granularity
  const fmtSecond = createAdaptiveTickFormatter(30 * 1000);
  assert.equal(fmtSecond(d), 'May 15, 14:30:45');

  // Minute/hour granularity
  const fmtHour = createAdaptiveTickFormatter(5 * 3600 * 1000);
  assert.equal(fmtHour(d), 'May 15, 14:30');

  // Day granularity
  const fmtDay = createAdaptiveTickFormatter(10 * 86400 * 1000);
  assert.equal(fmtDay(d), 'May 15, 2023');

  // Month granularity
  const fmtMonth = createAdaptiveTickFormatter(100 * 86400 * 1000);
  assert.equal(fmtMonth(d), 'May 2023');

  // Year granularity
  const fmtYear = createAdaptiveTickFormatter(500 * 86400 * 1000);
  assert.equal(fmtYear(d), '2023');

  // BC era year
  const bcDate = new Date(-500, 4, 15);
  bcDate.setFullYear(-500);
  const fmtBc = createAdaptiveTickFormatter(500 * 86400 * 1000);
  assert.equal(fmtBc(bcDate), '500 BC');

  // AD era year (< 1000)
  const adDate = new Date(800, 4, 15);
  adDate.setFullYear(800);
  assert.equal(fmtBc(adDate), '800 AD');
});

test('formatCursorDate returns precise date badges based on duration granularity', () => {
  const d = new Date('2023-05-15T14:30:45');

  assert.equal(formatCursorDate(d, 30 * 1000), 'May 15, 2023 14:30:45');
  assert.equal(formatCursorDate(d, 5 * 3600 * 1000), 'May 15, 2023 14:30');
  assert.equal(formatCursorDate(d, 10 * 86400 * 1000), 'May 15, 2023');
  assert.equal(formatCursorDate(d, 100 * 86400 * 1000), 'May 2023');
  assert.equal(formatCursorDate(d, 500 * 86400 * 1000), '2023');
});

test('calculateOptimalTickCount calculates density based on width and granularity', () => {
  const innerWidth = 800;
  // Second granularity (minPxPerTick = 140) -> floor(800 / 140) = 5
  assert.equal(calculateOptimalTickCount(innerWidth, 30 * 1000), 5);

  // Year granularity (minPxPerTick = 80) -> floor(800 / 80) = 10
  assert.equal(calculateOptimalTickCount(innerWidth, 500 * 86400 * 1000), 10);
});

test('preventTickOverlap hides overlapping tick label elements', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><svg><g id="axis"></g></svg></body></html>');
  const axisG = dom.window.document.getElementById('axis') as unknown as SVGGElement;

  // Add 3 tick elements where tick 1 and tick 2 overlap
  axisG.innerHTML = `
    <g class="tick" transform="translate(10, 0)"><text>May 15, 2023</text></g>
    <g class="tick" transform="translate(25, 0)"><text>May 16, 2023</text></g>
    <g class="tick" transform="translate(150, 0)"><text>May 17, 2023</text></g>
  `;

  preventTickOverlap(axisG, 12);

  const ticks = axisG.querySelectorAll<SVGGElement>('.tick');
  assert.equal(ticks[0].style.display, '', 'First tick should be visible');
  assert.equal(ticks[1].style.display, 'none', 'Second tick should be hidden due to overlap');
  assert.equal(ticks[2].style.display, '', 'Third tick should be visible');
});
