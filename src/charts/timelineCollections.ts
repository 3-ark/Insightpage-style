import type { TimelineEvent } from './timelineParser';
import { formatDisplayDate } from './timelineFormatters';

export interface ProcessedEvent extends TimelineEvent {
  id: string;
  startDate: Date;
  endDate: Date;
  isOngoing: boolean;
  categoryVal: string;
  collections: string[];
}

export interface SVGColsGroupElement extends SVGGElement {
  __renderedState?: {
    isCollapsed: boolean;
    color: string;
    activeCat: string;
  };
}

export function renderCollectionsNode(
  colsG: d3.Selection<SVGGElement, any, null, undefined>,
  evt: ProcessedEvent,
  barWidth: number,
  circleRadius: number,
  eventHeight: number,
  color: string,
  activeCat: string,
  showTooltip: (event: MouseEvent, title: string, details?: any) => void,
  hideTooltip: () => void
) {
  const node: SVGColsGroupElement | null = colsG.node();
  const requiredWidth = evt.collections.length * circleRadius * 2.3;
  const isCollapsed = evt.collections.length > 1 && barWidth < requiredWidth + 10;

  if (
    node?.__renderedState &&
    node.__renderedState.isCollapsed === isCollapsed &&
    node.__renderedState.color === color &&
    node.__renderedState.activeCat === activeCat
  ) {
    return;
  }

  if (node) {
    node.__renderedState = { isCollapsed, color, activeCat };
  }

  colsG.selectAll('*').remove();

  if (isCollapsed) {
    const badgeG = colsG.append('g').attr('class', 'collection-badge-node').style('cursor', 'pointer');
    const cx = -circleRadius * 1.5;
    const cy = eventHeight / 2;

    badgeG.append('circle')
      .attr('cx', cx)
      .attr('cy', cy)
      .attr('r', Math.max(circleRadius * 1.5, 12))
      .attr('fill', 'transparent');

    badgeG.append('circle')
      .attr('class', 'visible-badge-circle')
      .attr('cx', cx)
      .attr('cy', cy)
      .attr('r', circleRadius * 1.2)
      .attr('fill', color)
      .attr('stroke', 'var(--background-primary, #ffffff)')
      .attr('stroke-width', 1.5);

    badgeG.append('text')
      .attr('x', cx)
      .attr('y', cy + 3.5)
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('font-weight', '700')
      .attr('fill', '#ffffff')
      .attr('pointer-events', 'none')
      .text(`+${evt.collections.length}`);

    badgeG
      .on('mouseenter', (event: MouseEvent) => {
        event.stopPropagation();
        badgeG.select('.visible-badge-circle')
          .attr('stroke', 'var(--text-normal, #000000)')
          .attr('stroke-width', 2);
        showTooltip(
          event,
          `${evt.collections.length} Collection Items`,
          {
            categoryLabel: activeCat,
            categoryValue: evt.categoryVal,
            categoryColor: color,
            dateRange: `${formatDisplayDate(evt.startDate)} – ${evt.isOngoing ? 'Present' : formatDisplayDate(evt.endDate)}`,
            items: evt.collections,
          }
        );
      })
      .on('mousemove', (event: MouseEvent) => {
        event.stopPropagation();
        showTooltip(
          event,
          `${evt.collections.length} Collection Items`,
          {
            categoryLabel: activeCat,
            categoryValue: evt.categoryVal,
            categoryColor: color,
            dateRange: `${formatDisplayDate(evt.startDate)} – ${evt.isOngoing ? 'Present' : formatDisplayDate(evt.endDate)}`,
            items: evt.collections,
          }
        );
      })
      .on('mouseleave', (event: MouseEvent) => {
        event.stopPropagation();
        badgeG.select('.visible-badge-circle')
          .attr('stroke', 'var(--background-primary, #ffffff)')
          .attr('stroke-width', 1.5);
        hideTooltip();
      });
  } else {
    evt.collections.forEach((colItem, cIdx) => {
      const cx = -(cIdx + 0.75) * circleRadius * 2.3;
      const cy = eventHeight / 2;

      const circleG = colsG.append('g').attr('class', 'collection-node').style('cursor', 'pointer');

      circleG.append('circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', Math.max(circleRadius + 4, 10))
        .attr('fill', 'transparent');

      circleG.append('circle')
        .attr('class', 'visible-circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', circleRadius)
        .attr('fill', color)
        .attr('stroke', 'var(--background-primary, #ffffff)')
        .attr('stroke-width', 1);

      circleG
        .on('mouseenter', (event: MouseEvent) => {
          event.stopPropagation();
          circleG.select('.visible-circle')
            .attr('stroke', 'var(--text-normal, #000000)')
            .attr('stroke-width', 2)
            .attr('r', circleRadius * 1.3);
          showTooltip(event, String(colItem), {
            categoryLabel: activeCat,
            categoryValue: evt.categoryVal,
            categoryColor: color,
            dateRange: `${formatDisplayDate(evt.startDate)} – ${evt.isOngoing ? 'Present' : formatDisplayDate(evt.endDate)}`,
          });
        })
        .on('mousemove', (event: MouseEvent) => {
          event.stopPropagation();
          showTooltip(event, String(colItem), {
            categoryLabel: activeCat,
            categoryValue: evt.categoryVal,
            categoryColor: color,
            dateRange: `${formatDisplayDate(evt.startDate)} – ${evt.isOngoing ? 'Present' : formatDisplayDate(evt.endDate)}`,
          });
        })
        .on('mouseleave', (event: MouseEvent) => {
          event.stopPropagation();
          circleG.select('.visible-circle')
            .attr('stroke', 'var(--background-primary, #ffffff)')
            .attr('stroke-width', 1)
            .attr('r', circleRadius);
          hideTooltip();
        });
    });
  }
}
