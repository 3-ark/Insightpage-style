import {
  parseEventDate,
  type ParsedTimelineData,
} from './timelineParser';
import {
  createAdaptiveTickFormatter,
  formatCursorDate,
  calculateOptimalTickCount,
  preventTickOverlap,
} from '../lib/timeline-utils';
import { stripWikilinks } from './timelineWikilinks';
import { formatDisplayDate } from './timelineFormatters';
import { renderCollectionsNode, type ProcessedEvent } from './timelineCollections';
import type { TimelineTooltipController } from './timelineTooltip';

export interface SVGGroupElementWithRefs extends SVGGElement {
  __rectBar?: SVGRectElement | null;
  __leaderLine?: SVGLineElement | null;
  __colsG?: SVGGElement | null;
  __colsGSelection?: d3.Selection<SVGGElement, any, null, undefined> | null;
}

export interface EventNodeItem {
  gNode: SVGGElement;
  evt: ProcessedEvent;
  rectBarNode: SVGRectElement;
  leaderLineNode: SVGLineElement;
  colsGNode: SVGGElement | null;
  colsGSelection: d3.Selection<SVGGElement, any, null, undefined> | null;
  yPos: number;
  color: string;
  isHidden: boolean;
  baseXStart: number;
  baseXEnd: number;
  lastIsCollapsed?: boolean;
}

const ONGOING_KEYWORDS = new Set(['present', 'now', 'current', 'today']);

export function renderTimelineD3Chart(
  svg: SVGSVGElement,
  wrapper: HTMLElement,
  container: HTMLElement,
  parsedData: ParsedTimelineData,
  activeCategoryState: string,
  d3: typeof import('d3'),
  tooltipCtrl: TimelineTooltipController
): void {
  const { showTooltip, hideTooltip, positionTooltip } = tooltipCtrl;
  const activeCat = activeCategoryState || parsedData.categories[0] || 'category';
  const rawEvents = parsedData.events;
  const now = new Date();
  const nowTime = now.getTime();

  let minTime = Infinity;
  let maxTime = -Infinity;
  let hasOngoingEvent = false;

  const numEvents = rawEvents.length;
  const processedEvents: ProcessedEvent[] = new Array(numEvents);
  const categoryValuesSet = new Set<string>();

  for (let idx = 0; idx < numEvents; idx++) {
    const evt = rawEvents[idx];
    let startDate = parseEventDate(evt.start, now);

    const endVal = evt.end;
    let isOngoing = evt.ongoing === true;
    if (!isOngoing) {
      if (typeof endVal === 'string') {
        isOngoing = ONGOING_KEYWORDS.has(endVal.trim().toLowerCase());
      } else if (typeof endVal === 'number') {
        isOngoing = Math.abs(endVal - nowTime) < 86400000;
      }
    }
    if (isOngoing) {
      hasOngoingEvent = true;
    }

    let endDate: Date;
    if (isOngoing) {
      endDate = now;
    } else if (endVal !== undefined && endVal !== null && endVal !== '') {
      endDate = parseEventDate(endVal, startDate);
    } else {
      endDate = startDate;
    }

    if (!isOngoing && endDate < startDate) {
      const temp = startDate;
      startDate = endDate;
      endDate = temp;
    }
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();

    if (startTime < minTime) minTime = startTime;
    if (endTime > maxTime) maxTime = endTime;

    const categoryVal = String(evt[activeCat] ?? 'default');
    categoryValuesSet.add(categoryVal);
    const collections = Array.isArray(evt.collection) ? evt.collection : [];

    processedEvents[idx] = {
      ...evt,
      id: `evt_${idx}_${startTime}`,
      startDate,
      endDate,
      isOngoing,
      categoryVal,
      collections,
    };
  }

  processedEvents.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  const containerWidth = wrapper.getBoundingClientRect().width || 760;
  const width = Math.max(containerWidth, 380);
  const height = Math.max(340, processedEvents.length * 44 + 120);

  const margin = { top: 52, right: 30, bottom: 85, left: 20 };
  const padding = { top: 28, right: 0, bottom: 0, left: 0 };

  const innerWidth = width - margin.left - margin.right - padding.left - padding.right;
  const innerHeight = height - margin.top - margin.bottom - padding.top - padding.bottom;

  const compStyle = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(container) : null;
  const isDarkMode = (typeof document !== 'undefined' && document.body && document.body.classList.contains('theme-dark')) ||
    compStyle?.getPropertyValue('--background-primary')?.trim().startsWith('#2') ||
    false;

  const d3Svg = d3.select(svg);
  d3Svg.selectAll('*').remove();

  d3Svg
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('width', '100%')
    .attr('height', height)
    .style('max-width', '100%')
    .style('height', 'auto')
    .style('user-select', 'none')
    .style('font-family', 'var(--font-interface, var(--font-text, sans-serif))');

  const categoryValues = Array.from(categoryValuesSet);
  const colorPalette = isDarkMode
    ? ['#60a5fa', '#f59e0b', '#f87171', '#34d399', '#a78bfa', '#fbbf24', '#38bdf8', '#c084fc']
    : (d3.schemeTableau10 || ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7']);

  const scaleColor = d3.scaleOrdinal<string>().domain(categoryValues).range(colorPalette);

  const minDate = isFinite(minTime) ? new Date(minTime) : new Date('2013-01-01');
  const maxDate = isFinite(maxTime) ? new Date(maxTime) : new Date('2027-01-01');

  const timeSpan = maxDate.getTime() - minDate.getTime();
  const domainBuffer = Math.max(timeSpan * 0.05, 86400000 * 30);
  const dateExtent: [Date, Date] = [
    new Date(minDate.getTime() - domainBuffer),
    new Date(maxDate.getTime() + domainBuffer),
  ];

  const timeScale = d3.scaleTime().domain(dateExtent).range([0, innerWidth]).nice();

  const eventIds: string[] = new Array(numEvents);
  for (let idx = 0; idx < numEvents; idx++) {
    eventIds[idx] = processedEvents[idx].id;
  }
  const scaleY = d3.scaleBand().domain(eventIds).range([0, innerHeight]).padding(0.28);

  const eventHeight = scaleY.bandwidth() * 0.65;
  const circleRadius = Math.max(3.5, eventHeight * 0.32);

  let activeScaleX = timeScale;
  let initialSpanMs = dateExtent[1].getTime() - dateExtent[0].getTime();

  const getOptimalTicks = () => {
    const dom = activeScaleX.domain() as [Date, Date];
    const spanMs = dom && dom[0] && dom[1] ? Math.abs(dom[1].getTime() - dom[0].getTime()) : initialSpanMs;
    return calculateOptimalTickCount(innerWidth, spanMs);
  };

  const targetTicks = getOptimalTicks();
  const gridTicks = Math.max(targetTicks * 2, Math.floor(innerWidth / 45));

  let activeTickFormatter: (d: Date | d3.NumberValue) => string = () => '';
  const updateActiveTickFormatter = (ticksCount: number) => {
    const dom = activeScaleX.domain() as [Date, Date];
    const spanMs = dom && dom[0] && dom[1] ? Math.abs(dom[1].getTime() - dom[0].getTime()) : initialSpanMs;
    const ticks = activeScaleX.ticks ? activeScaleX.ticks(ticksCount) : [];
    let intervalMs = spanMs / Math.max(1, ticksCount);
    if (ticks.length >= 2) {
      intervalMs = Math.abs(ticks[1].getTime() - ticks[0].getTime());
    }
    activeTickFormatter = createAdaptiveTickFormatter(intervalMs);
  };

  updateActiveTickFormatter(targetTicks);
  const formatTick = (d: Date | d3.NumberValue): string => {
    return activeTickFormatter(d);
  };

  const chartG = d3Svg.append('g').attr('class', 'chart-main');

  const gridG = chartG.append('g').attr('class', 'grid x').attr('transform', `translate(${margin.left},${margin.top + padding.top})`);
  const eventsG = chartG.append('g').attr('class', 'events').attr('transform', `translate(${margin.left},${margin.top + padding.top})`);
  const axisTopG = chartG.append('g').attr('class', 'axis x axis-top').attr('transform', `translate(${margin.left},${margin.top})`);
  const axisBottomG = chartG.append('g').attr('class', 'axis x axis-bottom').attr('transform', `translate(${margin.left},${margin.top + innerHeight + padding.top + 10})`);

  const timeAxisTop = d3.axisTop(timeScale).ticks(targetTicks).tickFormat(formatTick).tickSize(6);
  const timeAxisBottom = d3.axisBottom(timeScale).ticks(targetTicks).tickFormat(formatTick).tickSize(6);
  const timeGrid = d3.axisTop(timeScale).ticks(gridTicks).tickFormat(() => '').tickSize(-innerHeight - padding.top - 10);

  axisTopG.call(timeAxisTop);
  axisBottomG.call(timeAxisBottom);
  gridG.call(timeGrid);
  gridG.select('.domain').attr('display', 'none');

  preventTickOverlap(axisTopG.node());
  preventTickOverlap(axisBottomG.node());

  const legendHeight = 35;
  const legendY = height - legendHeight - 10;
  const legendClipId = `legend-clip-${Math.random().toString(36).slice(2, 11)}`;

  const defs = d3Svg.append('defs');
  defs.append('clipPath')
    .attr('id', legendClipId)
    .append('rect')
    .attr('x', margin.left)
    .attr('y', 0)
    .attr('width', innerWidth)
    .attr('height', legendHeight + 20);

  const legendG = d3Svg.append('g')
    .attr('class', 'legend')
    .attr('transform', `translate(0, ${legendY})`)
    .attr('clip-path', `url(#${legendClipId})`);

  const legendContentG = legendG.append('g')
    .attr('class', 'legend-content')
    .style('cursor', 'grab');

  let currentLegendOffsetX = margin.left;
  legendContentG.attr('transform', `translate(${currentLegendOffsetX}, 0)`);

  let legendX = 0;
  categoryValues.forEach((catVal) => {
    const color = scaleColor(catVal);
    const itemG = legendContentG.append('g').attr('transform', `translate(${legendX}, 0)`);

    itemG.append('rect')
      .attr('width', 12)
      .attr('height', 12)
      .attr('rx', 2)
      .attr('fill', color);

    const textNode = itemG.append('text')
      .attr('class', 'legend-text')
      .attr('x', 18)
      .attr('y', 10)
      .attr('font-size', '12px')
      .attr('font-style', 'italic')
      .attr('fill', 'var(--text-muted, #64748b)')
      .text(catVal);

    const textNodeEl = textNode.node();
    const measured = typeof textNodeEl?.getComputedTextLength === 'function' ? textNodeEl.getComputedTextLength() : 0;
    const textWidth = measured > 0 ? measured : catVal.length * 7.5;

    legendX += textWidth + 32;
  });

  const totalLegendWidth = legendX;
  const maxLegendDragOffset = margin.left;
  const minLegendDragOffset = totalLegendWidth > innerWidth
    ? margin.left - (totalLegendWidth - innerWidth)
    : margin.left;

  const dragBehavior = d3.drag<SVGGElement, unknown>()
    .on('start', function () {
      d3.select(this).style('cursor', 'grabbing');
    })
    .on('drag', function (event) {
      currentLegendOffsetX += event.dx;
      currentLegendOffsetX = Math.max(minLegendDragOffset, Math.min(maxLegendDragOffset, currentLegendOffsetX));
      d3.select(this).attr('transform', `translate(${currentLegendOffsetX}, 0)`);
    })
    .on('end', function () {
      d3.select(this).style('cursor', 'grab');
    });

  if (totalLegendWidth > innerWidth) {
    legendContentG.call(dragBehavior);
  }

  const eventNodeList: EventNodeItem[] = new Array(numEvents);

  let nowG: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  let nowLineNode: SVGLineElement | null = null;
  let nowLabelNode: SVGTextElement | null = null;

  if (hasOngoingEvent) {
    nowG = chartG.append('g').attr('class', 'now-indicator');

    const nowLine = nowG.append('line')
      .attr('class', 'now-line')
      .attr('y1', margin.top - 18)
      .attr('y2', margin.top + innerHeight + padding.top + 10)
      .attr('stroke', '#d97706')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '3,3');

    const nowLabel = nowG.append('text')
      .attr('class', 'now-label')
      .attr('y', margin.top - 24)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('font-weight', '700')
      .attr('fill', '#d97706')
      .text('Today');

    nowLineNode = nowLine.node();
    nowLabelNode = nowLabel.node();
  }

  // High-performance needle cursor indicator
  const needleG = chartG.append('g')
    .attr('class', 'needle-indicator')
    .style('pointer-events', 'none')
    .style('display', 'none');

  needleG.append('line')
    .attr('class', 'needle-line')
    .attr('y1', margin.top - 24)
    .attr('y2', margin.top + innerHeight + padding.top + 12)
    .attr('stroke', '#f97316')
    .attr('stroke-width', 1.5);

  const needleBadgeG = needleG.append('g').attr('class', 'needle-badge');

  const needleBadgeRect = needleBadgeG.append('rect')
    .attr('class', 'needle-badge-rect')
    .attr('y', margin.top - 38)
    .attr('height', 22)
    .attr('rx', 5)
    .attr('fill', '#f97316')
    .attr('stroke', '#c2410c')
    .attr('stroke-width', 1);

  const needleBadgeText = needleBadgeG.append('text')
    .attr('class', 'needle-badge-text')
    .attr('y', margin.top - 23)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px')
    .attr('font-weight', '700')
    .attr('font-family', 'monospace')
    .attr('fill', '#ffffff');

  let rafNeedleId: number | null = null;
  let lastNeedleText = '';

  const updateNeedle = (mouseX: number) => {
    rafNeedleId = null;
    const xPos = mouseX - margin.left;
    if (xPos < 0 || xPos > innerWidth || svg.classList.contains('is-zooming')) {
      needleG.style('display', 'none');
      return;
    }

    const cursorDate = activeScaleX.invert(xPos);
    const dom = activeScaleX.domain() as [Date, Date];
    const durationMs = dom && dom[0] && dom[1] ? Math.abs(dom[1].getTime() - dom[0].getTime()) : initialSpanMs;
    const dateStr = formatCursorDate(cursorDate, durationMs);

    const needleBadgeRectNode = needleBadgeRect.node();
    const needleBadgeTextNode = needleBadgeText.node();
    const needleGNode = needleG.node();
    const needleBadgeGNode = needleBadgeG.node();

    if (needleGNode) {
      needleG.style('display', null);
      needleGNode.setAttribute('transform', `translate(${margin.left + xPos}, 0)`);
    }

    if (dateStr !== lastNeedleText) {
      lastNeedleText = dateStr;
      if (needleBadgeTextNode) {
        needleBadgeTextNode.textContent = dateStr;
        const measuredWidth = typeof needleBadgeTextNode.getComputedTextLength === 'function' ? needleBadgeTextNode.getComputedTextLength() : 0;
        const textWidth = measuredWidth > 0 ? measuredWidth : dateStr.length * 7;
        const badgeWidth = textWidth + 16;

        if (needleBadgeRectNode) {
          needleBadgeRectNode.setAttribute('x', String(-badgeWidth / 2));
          needleBadgeRectNode.setAttribute('width', String(badgeWidth));
        }

        if (needleBadgeGNode) {
          const totalX = margin.left + xPos;
          let badgeOffset = 0;
          if (totalX - badgeWidth / 2 < 5) {
            badgeOffset = 5 - (totalX - badgeWidth / 2);
          } else if (totalX + badgeWidth / 2 > width - 5) {
            badgeOffset = (width - 5) - (totalX + badgeWidth / 2);
          }
          needleBadgeGNode.setAttribute('transform', `translate(${badgeOffset}, 0)`);
        }
      }
    } else if (needleBadgeGNode && needleBadgeRectNode) {
      const badgeWidth = parseFloat(needleBadgeRectNode.getAttribute('width') || '100');
      const totalX = margin.left + xPos;
      let badgeOffset = 0;
      if (totalX - badgeWidth / 2 < 5) {
        badgeOffset = 5 - (totalX - badgeWidth / 2);
      } else if (totalX + badgeWidth / 2 > width - 5) {
        badgeOffset = (width - 5) - (totalX + badgeWidth / 2);
      }
      needleBadgeGNode.setAttribute('transform', `translate(${badgeOffset}, 0)`);
    }
  };

  d3Svg
    .on('mousemove.needle', (event: MouseEvent) => {
      const [ptX] = d3.pointer(event, svg);
      if (rafNeedleId === null) {
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame !== 'undefined') {
          rafNeedleId = window.requestAnimationFrame(() => updateNeedle(ptX));
        } else {
          updateNeedle(ptX);
        }
      }
    })
    .on('mouseleave.needle', () => {
      if (rafNeedleId !== null) {
        if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame !== 'undefined') {
          window.cancelAnimationFrame(rafNeedleId);
        }
        rafNeedleId = null;
      }
      needleG.style('display', 'none');
    });

  for (let evtIdx = 0; evtIdx < numEvents; evtIdx++) {
    const evt = processedEvents[evtIdx];
    const color = scaleColor(evt.categoryVal);
    const yPos = scaleY(evt.id) || 0;
    const evtG = eventsG.append('g').attr('class', 'event-group').datum(evt).style('cursor', 'pointer');

    const rectBar = evtG.append('rect')
      .attr('class', 'event-bar')
      .attr('height', eventHeight)
      .attr('fill', color)
      .attr('fill-opacity', 0.4)
      .attr('rx', 3);

    const leaderLine = evtG.append('line')
      .attr('class', 'leader')
      .attr('y1', 0)
      .attr('y2', eventHeight)
      .attr('stroke', color)
      .attr('stroke-width', 2.5);

    evtG.append('text')
      .attr('class', 'event-label')
      .attr('x', 0)
      .attr('y', -6)
      .attr('text-anchor', 'start')
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .attr('fill', 'var(--text-normal, #222222)')
      .text(stripWikilinks(evt.title));

    let colsGSelection: d3.Selection<SVGGElement, any, null, undefined> | null = null;
    if (evt.collections.length > 0) {
      colsGSelection = evtG.append('g').attr('class', 'collections') as any;
    }

    const gNode = evtG.node() as SVGGElement;
    const rectBarNode = rectBar.node() as SVGRectElement;
    const leaderLineNode = leaderLine.node() as SVGLineElement;
    const colsGNode = colsGSelection ? (colsGSelection.node() as SVGGElement) : null;

    const groupWithRefs = gNode as SVGGroupElementWithRefs;
    groupWithRefs.__rectBar = rectBarNode;
    groupWithRefs.__leaderLine = leaderLineNode;
    groupWithRefs.__colsG = colsGNode;
    groupWithRefs.__colsGSelection = colsGSelection;

    const baseXStart = timeScale(evt.startDate);
    const baseXEnd = timeScale(evt.endDate);
    const initialBarWidth = Math.max(3, baseXEnd - baseXStart);

    let initialIsCollapsed: boolean | undefined = undefined;
    if (evt.collections.length > 0 && colsGNode && colsGSelection) {
      colsGNode.setAttribute('transform', `translate(${initialBarWidth}, 0)`);
      const requiredWidth = evt.collections.length * circleRadius * 2.3;
      initialIsCollapsed = evt.collections.length > 1 && initialBarWidth < requiredWidth + 10;
      renderCollectionsNode(
        colsGSelection,
        evt,
        initialBarWidth,
        circleRadius,
        eventHeight,
        color,
        activeCat,
        showTooltip,
        hideTooltip
      );
    }

    eventNodeList[evtIdx] = {
      gNode,
      evt,
      rectBarNode,
      leaderLineNode,
      colsGNode,
      colsGSelection,
      yPos,
      color,
      isHidden: false,
      baseXStart,
      baseXEnd,
      lastIsCollapsed: initialIsCollapsed,
    };

    evtG.on('mouseenter', (event: MouseEvent) => {
      rectBarNode?.setAttribute('fill-opacity', '0.7');

      const startStr = formatDisplayDate(evt.startDate);
      const endStr = evt.isOngoing ? 'Present' : formatDisplayDate(evt.endDate);
      showTooltip(event, evt.title, {
        categoryLabel: activeCat,
        categoryValue: evt.categoryVal,
        categoryColor: color,
        dateRange: `${startStr} – ${endStr}`,
      });
    })
    .on('mousemove', (event: MouseEvent) => {
      positionTooltip(event.clientX, event.clientY);
    })
    .on('mouseleave', () => {
      rectBarNode?.setAttribute('fill-opacity', '0.4');
      hideTooltip();
    });
  }

  let zoomRafId: number | null = null;
  let pendingTransform: d3.ZoomTransform | null = null;
  let lastK = -1;
  let isNowVisible = true;
  const baseNowX = hasOngoingEvent ? timeScale(now) : 0;

  const performZoomUpdate = (transform: d3.ZoomTransform) => {
    zoomRafId = null;
    const k = transform.k;
    const tx = transform.x;
    const isKChanged = Math.abs(k - lastK) > 1e-6;
    lastK = k;

    activeScaleX = transform.rescaleX(timeScale);
    const currentTicks = getOptimalTicks();
    const currentGridTicks = Math.max(currentTicks * 2, Math.floor(innerWidth / 45));

    updateActiveTickFormatter(currentTicks);

    timeAxisTop.scale(activeScaleX).ticks(currentTicks);
    timeAxisBottom.scale(activeScaleX).ticks(currentTicks);
    timeGrid.scale(activeScaleX).ticks(currentGridTicks);

    axisTopG.call(timeAxisTop);
    axisBottomG.call(timeAxisBottom);
    gridG.call(timeGrid);

    preventTickOverlap(axisTopG.node());
    preventTickOverlap(axisBottomG.node());

    if (nowG && nowLineNode && nowLabelNode) {
      const nowX = k * baseNowX + tx;
      if (nowX >= 0 && nowX <= innerWidth) {
        if (!isNowVisible) {
          nowG.attr('display', null);
          isNowVisible = true;
        }
        const targetXStr = String(margin.left + nowX);
        nowLineNode.setAttribute('x1', targetXStr);
        nowLineNode.setAttribute('x2', targetXStr);
        nowLabelNode.setAttribute('x', targetXStr);
      } else {
        if (isNowVisible) {
          nowG.attr('display', 'none');
          isNowVisible = false;
        }
      }
    }

    for (let i = 0; i < eventNodeList.length; i++) {
      const item = eventNodeList[i];
      const evt = item.evt;

      const xStart = k * item.baseXStart + tx;
      const xEnd = k * item.baseXEnd + tx;

      if (xEnd < -50 || xStart > innerWidth + 50) {
        if (!item.isHidden) {
          item.gNode.setAttribute('display', 'none');
          item.isHidden = true;
        }
        continue;
      }

      if (item.isHidden) {
        item.gNode.removeAttribute('display');
        item.isHidden = false;
      }

      item.gNode.setAttribute('transform', `translate(${xStart},${item.yPos})`);

      if (isKChanged) {
        const barWidth = Math.max(3, xEnd - xStart);
        const barWidthStr = String(barWidth);
        item.rectBarNode.setAttribute('width', barWidthStr);
        item.leaderLineNode.setAttribute('x1', barWidthStr);
        item.leaderLineNode.setAttribute('x2', barWidthStr);

        if (evt.collections.length > 0 && item.colsGNode && item.colsGSelection) {
          item.colsGNode.setAttribute('transform', `translate(${barWidth}, 0)`);
          const requiredWidth = evt.collections.length * circleRadius * 2.3;
          const isCollapsed = evt.collections.length > 1 && barWidth < requiredWidth + 10;
          if (item.lastIsCollapsed !== isCollapsed) {
            item.lastIsCollapsed = isCollapsed;
            renderCollectionsNode(item.colsGSelection, evt, barWidth, circleRadius, eventHeight, item.color, activeCat, showTooltip, hideTooltip);
          }
        }
      }
    }
  };

  const updateZoom = (transform: d3.ZoomTransform) => {
    pendingTransform = transform;
    if (zoomRafId === null) {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame !== 'undefined') {
        zoomRafId = window.requestAnimationFrame(() => {
          const t = pendingTransform;
          zoomRafId = null;
          pendingTransform = null;
          if (t) performZoomUpdate(t);
        });
      } else {
        performZoomUpdate(transform);
      }
    }
  };

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .extent([[0, 0], [width, height]])
    .scaleExtent([0.2, 12])
    .on('start', () => {
      svg.classList.add('is-zooming');
      eventsG.style('pointer-events', 'none');
      needleG.style('display', 'none');
      hideTooltip(true);
    })
    .on('zoom', ({ transform }) => {
      updateZoom(transform);
    })
    .on('end', () => {
      svg.classList.remove('is-zooming');
      eventsG.style('pointer-events', null);
    });

  d3Svg.call(zoom);
  updateZoom(d3.zoomIdentity);
}
