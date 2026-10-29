import {
  parseEventDate,
  parseTimelineCode,
  parseTimelineConfig,
  parseCsvOrTsv,
  parseMarkdownTableRows,
  mapRawRowsToTimelineData,
  type TimelineEvent,
  type ParsedTimelineData,
  type TimelineConfig,
} from './charts/timelineParser';
import { createCustomFetch } from './chartRenderer';
import {
  getTimeGranularity,
  createAdaptiveTickFormatter,
  formatCursorDate,
  calculateOptimalTickCount,
  preventTickOverlap,
  type TimeGranularity,
} from './lib/timeline-utils';

export {
  parseEventDate,
  parseTimelineCode,
  parseTimelineConfig,
  parseCsvOrTsv,
  parseMarkdownTableRows,
  mapRawRowsToTimelineData,
  getTimeGranularity,
  createAdaptiveTickFormatter,
  formatCursorDate,
  calculateOptimalTickCount,
  preventTickOverlap,
  type TimelineEvent,
  type ParsedTimelineData,
  type TimelineConfig,
  type TimeGranularity,
};

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

// Performance optimization: Hoist wikilink parsing regexes and HTML escape lookup maps to module scope.
// Short-circuit plain text strings without wikilink brackets ('[[') or special HTML characters to avoid
// redundant RegExp compilation, string replacements, and loop passes.
const WIKILINK_STRIP_REGEX = /\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g;
const WIKILINK_PARSE_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const HTML_ESCAPE_CHECK_REGEX = /[&<>"']/;
const HTML_ESCAPE_REPLACE_REGEX = /[&<>"']/g;
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(str: string): string {
  if (!str || !HTML_ESCAPE_CHECK_REGEX.test(str)) return str || '';
  return str.replace(HTML_ESCAPE_REPLACE_REGEX, (ch) => HTML_ESCAPE_MAP[ch] || ch);
}

export function stripWikilinks(text: string): string {
  if (typeof text !== 'string' || !text) return '';
  if (!text.includes('[[')) return text;
  return text.replace(WIKILINK_STRIP_REGEX, '$1');
}

export function parseWikilinksToHtml(text: string): string {
  if (typeof text !== 'string' || !text) return '';
  if (!text.includes('[[')) return escapeHtml(text);

  WIKILINK_PARSE_REGEX.lastIndex = 0;
  let result = '';
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = WIKILINK_PARSE_REGEX.exec(text)) !== null) {
    const textBefore = text.slice(lastIdx, match.index);
    result += escapeHtml(textBefore);

    const target = match[1].trim();
    const alias = match[2] ? match[2].trim() : target;
    const escapedTarget = escapeHtml(target);
    const escapedAlias = escapeHtml(alias);

    result += `<a class="internal-link" data-href="${escapedTarget}" href="${escapedTarget}" style="color: var(--link-color, #3b82f6); text-decoration: underline; cursor: pointer;">${escapedAlias}</a>`;
    lastIdx = WIKILINK_PARSE_REGEX.lastIndex;
  }

  result += escapeHtml(text.slice(lastIdx));
  return result;
}

// Polyfill Element.prototype.isShown if missing (Obsidian defines it on HTMLElement.prototype,
// but SVG elements inherit from Element/SVGElement, causing TypeError when e.isShown() is called).
function ensureIsShownPolyfill() {
  if (typeof Element !== 'undefined' && !('isShown' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'isShown', {
      value: function (this: Element) {
        if (typeof (HTMLElement.prototype as any)?.isShown === 'function' && this instanceof HTMLElement) {
          return (HTMLElement.prototype as any).isShown.call(this);
        }
        if (this.getAttribute && this.getAttribute('display') === 'none') return false;
        const style = (this as any).style;
        return style ? style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' : true;
      },
      configurable: true,
      writable: true,
    });
  }
}
ensureIsShownPolyfill();

let _d3: typeof import('d3') | null = null;

function getD3(): typeof import('d3') {
  if (!_d3) {
    const loaded = require('d3');
    _d3 = loaded.default ?? loaded;
  }
  return _d3!;
}

interface ProcessedEvent extends TimelineEvent {
  id: string;
  startDate: Date;
  endDate: Date;
  isOngoing: boolean;
  categoryVal: string;
  collections: string[];
}

interface SVGGroupElementWithRefs extends SVGGElement {
  __rectBar?: SVGRectElement | null;
  __leaderLine?: SVGLineElement | null;
  __colsG?: SVGGElement | null;
  __colsGSelection?: d3.Selection<SVGGElement, any, null, undefined> | null;
}

interface SVGColsGroupElement extends SVGGElement {
  __renderedState?: {
    isCollapsed: boolean;
    color: string;
    activeCat: string;
  };
}

const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const DOWNLOAD_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x1="12" y1="15" y2="3"/></svg>`;

function formatDisplayDate(date: Date): string {
  if (!date || isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const d3 = getD3();
  if (year < 0) {
    const monthStr = d3.timeFormat('%b')(date);
    return `${monthStr} ${Math.abs(year)} BC`;
  }
  if (year < 1000) {
    const monthStr = d3.timeFormat('%b')(date);
    return `${monthStr} ${year} AD`;
  }
  return d3.timeFormat('%b %Y')(date);
}

function renderCollectionsNode(
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
  const node = colsG.node() as SVGColsGroupElement | null;
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

async function resolveTimelineData(
  code: string,
  ctx?: any,
  app?: any
): Promise<ParsedTimelineData> {
  const config = parseTimelineConfig(code);

  if (config.events && config.events.length > 0) {
    return {
      events: config.events,
      categories: config.categories || ['category'],
      activeCategory: config.activeCategory || config.categories?.[0] || 'category',
    };
  }

  let obsidianModule: any = null;
  if (typeof require === 'function') {
    try {
      obsidianModule = require('obsidian');
    } catch {}
  }

  const customFetch = createCustomFetch(app, obsidianModule, ctx?.sourcePath || '');

  let rawRows: Record<string, any>[] = [];

  if (config.data) {
    const res = await customFetch(config.data);
    const text = await res.text();

    const trimmedText = text.trim();
    if (trimmedText.startsWith('[') || trimmedText.startsWith('{')) {
      try {
        const json = JSON.parse(trimmedText);
        rawRows = Array.isArray(json) ? json : [json];
      } catch {
        rawRows = parseCsvOrTsv(text);
      }
    } else {
      rawRows = parseCsvOrTsv(text);
    }
  } else if (config.id) {
    let rawId = config.id.trim();
    let fileRef = '';
    let cleanId = rawId;

    if (rawId.includes('#')) {
      const parts = rawId.split('#');
      fileRef = parts[0].trim();
      cleanId = parts[1].trim().replace(/^\^/, '');
    } else {
      cleanId = rawId.replace(/^\^/, '');
    }
    const caretId = '^' + cleanId;

    let targetFile: any = null;

    if (app) {
      if (fileRef) {
        if (app.metadataCache?.getFirstLinkpathDest) {
          targetFile = app.metadataCache.getFirstLinkpathDest(fileRef, ctx?.sourcePath || '');
        }
        if (!targetFile && app.vault?.getAbstractFileByPath) {
          targetFile = app.vault.getAbstractFileByPath(fileRef.endsWith('.md') ? fileRef : `${fileRef}.md`);
        }
      } else if (app.workspace) {
        targetFile = app.workspace.getActiveFile?.() || null;
        if (ctx?.sourcePath && app.vault?.getAbstractFileByPath) {
          targetFile = app.vault.getAbstractFileByPath(ctx.sourcePath) || targetFile;
        }
      }
    }

    if (targetFile && app?.vault?.cachedRead) {
      const fullText = await app.vault.cachedRead(targetFile);

      let blockText = '';
      const fileCache = app.metadataCache?.getFileCache?.(targetFile);

      let pos: any = undefined;
      if (fileCache?.blocks) {
        const exactBlock = fileCache.blocks[cleanId] ?? fileCache.blocks[caretId];
        if (exactBlock) {
          pos = exactBlock.position;
        } else {
          const cleanLower = cleanId.toLowerCase();
          for (const k in fileCache.blocks) {
            if (k.toLowerCase() === cleanLower) {
              pos = fileCache.blocks[k]?.position;
              break;
            }
          }
        }
      }

      if (pos) {
        blockText = fullText.substring(pos.start.offset, pos.end.offset);
      } else {
        const lines = fullText.split(/\r?\n/);
        const blockIdx = lines.findIndex((l: string) => l.trim() === caretId || l.trim() === `^${cleanId}`);
        if (blockIdx > 0) {
          let startIdx = blockIdx - 1;
          while (startIdx >= 0 && lines[startIdx].trim().includes('|')) {
            startIdx--;
          }
          blockText = lines.slice(startIdx + 1, blockIdx + 1).join('\n');
        } else {
          blockText = fullText;
        }
      }

      rawRows = parseMarkdownTableRows(blockText);
    } else if (code.includes('|')) {
      rawRows = parseMarkdownTableRows(code);
    }

    if (rawRows.length === 0) {
      throw new Error(`Referenced block ID '${config.id}' not found in ${targetFile ? targetFile.path : 'vault'}`);
    }
  }

  if (rawRows.length === 0) {
    throw new Error('Unable to resolve timeline dataset');
  }

  return mapRawRowsToTimelineData(rawRows, config.schemas);
}

export async function renderTimelineBlockAsync(
  code: string,
  container: HTMLElement,
  ctx?: any,
  app?: any
): Promise<void> {
  ensureIsShownPolyfill();
  const wrapper = document.createElement('div');
  // Replaced backdrop-blur-md and transition-all with solid bg-card and transition-shadow
  // to prevent heavy rasterization/paint cycles during mouse interaction.
  wrapper.className = 'timeline-wrapper relative group/chart w-full my-4 p-4 rounded-xl border border-border/20 bg-card shadow-sm transition-shadow duration-200 hover:shadow-md overflow-x-auto thin-scrollbar';

  let parsedData: ParsedTimelineData;
  try {
    parsedData = await resolveTimelineData(code, ctx, app);
  } catch (err: any) {
    const errorNotice = document.createElement('div');
    errorNotice.className = 'chart-error my-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm';
    errorNotice.textContent = `Unable to render timeline chart: ${err?.message || err}`;

    const rawCode = document.createElement('pre');
    rawCode.className = 'p-3 bg-muted rounded text-xs overflow-x-auto font-mono';
    rawCode.textContent = code;

    errorNotice.appendChild(rawCode);
    container.appendChild(errorNotice);
    return;
  }

  let activeCategoryState = parsedData.activeCategory;

  const chartContainer = document.createElement('div');
  chartContainer.className = 'timeline-chart-container w-full flex flex-col justify-center items-center relative overflow-x-auto';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-label', 'Zoomable Event Timeline Chart');
  svg.className.baseVal = 'timeline-svg w-full cursor-grab active:cursor-grabbing min-h-60';

  chartContainer.appendChild(svg);
  wrapper.appendChild(chartContainer);

  const actionBtnsGroup = document.createElement('div');
  actionBtnsGroup.className = 'timeline-action-btns absolute right-3 top-3 z-10 opacity-0 group-hover/chart:opacity-100 group-focus-within/chart:opacity-100 transition-opacity duration-200 flex items-center gap-1';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'timeline-btn timeline-copy-btn p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/20 transition-colors';
  copyBtn.title = 'Copy timeline data';
  copyBtn.innerHTML = COPY_ICON;
  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      copyBtn.innerHTML = CHECK_ICON;
      setTimeout(() => { copyBtn.innerHTML = COPY_ICON; }, 1500);
    } catch {}
  });

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'timeline-btn timeline-download-btn p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/20 transition-colors';
  downloadBtn.title = 'Download SVG';
  downloadBtn.innerHTML = DOWNLOAD_ICON;
  downloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    try {
      const svgCloned = svg.cloneNode(true) as SVGElement;
      svgCloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const svgData = new XMLSerializer().serializeToString(svgCloned);
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'timeline.svg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download timeline SVG', err);
    }
  });

  actionBtnsGroup.appendChild(copyBtn);
  actionBtnsGroup.appendChild(downloadBtn);
  chartContainer.appendChild(actionBtnsGroup);

  const controlsDiv = document.createElement('div');
  controlsDiv.className = 'timeline-category-controls flex items-center gap-4 mt-3 px-2 pt-2 border-t border-border/10 text-xs font-medium text-muted-foreground select-none';

  function renderCategoryRadioGroup() {
    controlsDiv.innerHTML = '';
    if (parsedData.categories.length <= 1) {
      controlsDiv.style.display = 'none';
      return;
    }
    controlsDiv.style.display = 'flex';
    const radioGroupName = `timeline-category-${Math.random().toString(36).substr(2, 9)}`;

    parsedData.categories.forEach((catKey) => {
      const isChecked = catKey === activeCategoryState;
      const label = document.createElement('label');
      label.className = `inline-flex items-center gap-1.5 cursor-pointer transition-colors hover:text-foreground ${isChecked ? 'text-primary font-semibold' : ''}`;

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = radioGroupName;
      input.value = catKey;
      input.checked = isChecked;
      input.className = 'accent-primary cursor-pointer';

      input.addEventListener('change', () => {
        activeCategoryState = catKey;
        renderCategoryRadioGroup();
        renderChart();
      });

      const span = document.createElement('span');
      span.textContent = catKey;

      label.appendChild(input);
      label.appendChild(span);
      controlsDiv.appendChild(label);
    });
  }

  renderCategoryRadioGroup();
  wrapper.appendChild(controlsDiv);
  container.appendChild(wrapper);

  // Persistent tooltip shell with pre-built DOM elements to avoid innerHTML thrashing on hover
  let tooltip = wrapper.querySelector<HTMLDivElement>('.timeline-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'timeline-tooltip absolute opacity-0 transition-opacity duration-100 z-30 px-3 py-2 text-xs rounded-lg shadow-xl bg-popover text-popover-foreground border border-border/30 max-w-xs';
    tooltip.style.position = 'absolute';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.opacity = '0';
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    tooltip.style.willChange = 'transform, opacity';

    const ttTitleEl = document.createElement('div');
    ttTitleEl.className = 'font-bold text-sm mb-1 text-foreground tt-title';
    tooltip.appendChild(ttTitleEl);

    const ttCatEl = document.createElement('div');
    ttCatEl.className = 'text-xs font-semibold mb-1.5 tt-cat';
    ttCatEl.style.display = 'none';
    tooltip.appendChild(ttCatEl);

    const ttDateBadge = document.createElement('div');
    ttDateBadge.className = 'inline-block px-2.5 py-0.5 text-[11px] font-mono rounded-md bg-muted/60 border border-border/30 text-muted-foreground mb-1 tt-date';
    ttDateBadge.style.display = 'none';
    tooltip.appendChild(ttDateBadge);

    const ttListEl = document.createElement('div');
    ttListEl.className = 'mt-1 pt-1 border-t border-border/20 text-xs font-mono text-primary flex flex-wrap gap-1 tt-items';
    ttListEl.style.display = 'none';
    tooltip.appendChild(ttListEl);

    const ttSubEl = document.createElement('div');
    ttSubEl.className = 'text-xs text-muted-foreground mb-1 tt-sub';
    ttSubEl.style.display = 'none';
    tooltip.appendChild(ttSubEl);

    wrapper.appendChild(tooltip);
  }

  const ttTitle = tooltip.querySelector<HTMLDivElement>('.tt-title')!;
  const ttCat = tooltip.querySelector<HTMLDivElement>('.tt-cat')!;
  const ttDate = tooltip.querySelector<HTMLDivElement>('.tt-date')!;
  const ttList = tooltip.querySelector<HTMLDivElement>('.tt-items')!;
  const ttSub = tooltip.querySelector<HTMLDivElement>('.tt-sub')!;

  let hideTimeout: any = null;

  function clearHideTimeout() {
    if (hideTimeout !== null) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  }

  tooltip.addEventListener('mouseenter', () => {
    clearHideTimeout();
  });

  tooltip.addEventListener('mouseleave', () => {
    hideTooltip(false);
  });

  tooltip.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const linkEl = target?.closest('a.internal-link, [data-href]') as HTMLElement | null;
    if (linkEl) {
      e.preventDefault();
      e.stopPropagation();
      const href = linkEl.getAttribute('data-href') || linkEl.getAttribute('href');
      if (href) {
        if (app?.workspace?.openLinkText) {
          app.workspace.openLinkText(href, ctx?.sourcePath || '', false);
        } else if (typeof window !== 'undefined') {
          window.open(href, '_blank');
        }
      }
    }
  });

  interface TooltipDetails {
    categoryLabel?: string;
    categoryValue?: string;
    categoryColor?: string;
    dateRange?: string;
    items?: string[];
  }

  // Wrapper rect cache: invalidates on scroll and resize, NEVER on mouse hover/leave
  let cachedWrapperRect: DOMRect | null = null;
  const getWrapperRect = (): DOMRect => {
    if (!cachedWrapperRect) {
      cachedWrapperRect = wrapper.getBoundingClientRect();
    }
    return cachedWrapperRect;
  };

  wrapper.addEventListener('scroll', () => { cachedWrapperRect = null; }, { passive: true });
  window.addEventListener('scroll', () => { cachedWrapperRect = null; }, { passive: true, capture: true });
  window.addEventListener('resize', () => { cachedWrapperRect = null; }, { passive: true });

  let lastTooltipKey = '';
  let rafId: number | null = null;
  let pendingClientX = 0;
  let pendingClientY = 0;
  let cachedTtWidth = 200;
  let cachedTtHeight = 65;

  function updateTooltipPosition() {
    rafId = null;
    if (!tooltip) return;
    const rect = getWrapperRect();
    const ttWidth = cachedTtWidth;
    const ttHeight = cachedTtHeight;

    const viewW = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : rect.width;
    const viewH = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : rect.height;

    const minViewportX = Math.max(0, rect.left) + 10;
    const maxViewportX = Math.min(viewW, rect.right) - 10;
    const minViewportY = Math.max(0, rect.top) + 10;
    const maxViewportY = Math.min(viewH, rect.bottom) - 10;

    let targetX = pendingClientX + 12;
    let targetY = pendingClientY + 12;

    if (targetX + ttWidth > maxViewportX) {
      targetX = pendingClientX - ttWidth - 12;
    }
    if (targetY + ttHeight > maxViewportY) {
      targetY = pendingClientY - ttHeight - 12;
    }

    targetX = Math.max(minViewportX, Math.min(targetX, Math.max(minViewportX, maxViewportX - ttWidth)));
    targetY = Math.max(minViewportY, Math.min(targetY, Math.max(minViewportY, maxViewportY - ttHeight)));

    const clampX = targetX - rect.left;
    const clampY = targetY - rect.top;

    tooltip.style.transform = `translate3d(${clampX}px, ${clampY}px, 0)`;
  }

  function positionTooltip(clientX: number, clientY: number) {
    pendingClientX = clientX;
    pendingClientY = clientY;
    if (rafId === null) {
      if (typeof requestAnimationFrame !== 'undefined') {
        rafId = requestAnimationFrame(() => {
          updateTooltipPosition();
        });
        if (rafId === undefined) {
          rafId = null;
        }
      } else {
        updateTooltipPosition();
      }
    }
  }

  function showTooltip(event: MouseEvent, title: string, details?: string | TooltipDetails) {
    if (!tooltip) return;
    clearHideTimeout();

    let contentKey = title;
    if (typeof details === 'string') {
      contentKey += '::' + details;
    } else if (details) {
      contentKey += `::${details.categoryValue || ''}::${details.dateRange || ''}::${details.items?.length || 0}`;
    }

    // Only update DOM if the content has genuinely changed (avoids reflow and garbage generation)
    if (lastTooltipKey !== contentKey) {
      lastTooltipKey = contentKey;
      ttTitle.innerHTML = parseWikilinksToHtml(title);

      if (typeof details === 'object' && details !== null) {
        ttSub.style.display = 'none';

        if (details.categoryLabel && details.categoryValue) {
          ttCat.style.display = 'block';
          ttCat.style.color = details.categoryColor || 'var(--text-muted, #eab308)';
          ttCat.textContent = `${details.categoryLabel.charAt(0).toUpperCase() + details.categoryLabel.slice(1)}: ${details.categoryValue}`;
        } else {
          ttCat.style.display = 'none';
        }

        if (details.dateRange) {
          ttDate.style.display = 'inline-block';
          ttDate.textContent = details.dateRange;
        } else {
          ttDate.style.display = 'none';
        }

        if (details.items && details.items.length > 0) {
          ttList.innerHTML = '';
          details.items.forEach((it) => {
            const badge = document.createElement('span');
            badge.className = 'px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[10px]';
            badge.textContent = String(it);
            ttList.appendChild(badge);
          });
          ttList.style.display = 'flex';
        } else {
          ttList.style.display = 'none';
        }
      } else if (typeof details === 'string') {
        ttCat.style.display = 'none';
        ttDate.style.display = 'none';
        ttList.style.display = 'none';
        ttSub.style.display = 'block';
        ttSub.textContent = details;
      } else {
        ttCat.style.display = 'none';
        ttDate.style.display = 'none';
        ttList.style.display = 'none';
        ttSub.style.display = 'none';
      }

      cachedTtWidth = tooltip.offsetWidth || 200;
      cachedTtHeight = tooltip.offsetHeight || 65;
    }

    positionTooltip(event.clientX, event.clientY);
    tooltip.style.pointerEvents = 'auto';
    tooltip.style.opacity = '1';
  }

  function hideTooltip(immediate = false) {
    clearHideTimeout();
    if (immediate) {
      if (rafId !== null) {
        if (typeof cancelAnimationFrame !== 'undefined') {
          cancelAnimationFrame(rafId);
        }
        rafId = null;
      }
      // Do NOT null out cachedWrapperRect here; keep it so subsequent hovers do not force reflow!
      lastTooltipKey = '';
      if (tooltip) {
        tooltip.style.opacity = '0';
        tooltip.style.pointerEvents = 'none';
      }
    } else {
      hideTimeout = setTimeout(() => {
        hideTooltip(true);
      }, 200);
    }
  }

  const ONGOING_KEYWORDS = new Set(['present', 'now', 'current', 'today']);

  function renderChart() {
    const d3 = getD3();
    const activeCat = activeCategoryState || parsedData.categories[0] || 'category';
    const rawEvents = parsedData.events;
    const now = new Date();
    const nowTime = now.getTime();

    // Single-pass event mapping with scalar minTime/maxTime accumulation.
    let minTime = Infinity;
    let maxTime = -Infinity;

    const processedEvents: ProcessedEvent[] = rawEvents.map((evt, idx) => {
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
      const collections = Array.isArray(evt.collection) ? evt.collection : [];

      return {
        ...evt,
        id: `evt_${idx}_${startTime}`,
        startDate,
        endDate,
        isOngoing,
        categoryVal,
        collections,
      };
    });

    processedEvents.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    const hasOngoingEvent = processedEvents.some((d) => d.isOngoing);

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

    const categoryValues = Array.from(new Set(processedEvents.map((d) => d.categoryVal)));
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

    const eventIds = processedEvents.map((d) => d.id);
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

    const formatTick = (d: Date | d3.NumberValue): string => {
      const dom = activeScaleX.domain() as [Date, Date];
      const spanMs = dom && dom[0] && dom[1] ? Math.abs(dom[1].getTime() - dom[0].getTime()) : initialSpanMs;
      const ticks = activeScaleX.ticks ? activeScaleX.ticks(getOptimalTicks()) : [];
      let intervalMs = spanMs / Math.max(1, targetTicks);
      if (ticks.length >= 2) {
        intervalMs = Math.abs(ticks[1].getTime() - ticks[0].getTime());
      }
      return createAdaptiveTickFormatter(intervalMs)(d);
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

    preventTickOverlap(axisTopG.node() as SVGGElement);
    preventTickOverlap(axisBottomG.node() as SVGGElement);

    const legendHeight = 35;
    const legendY = height - legendHeight - 10;
    const legendClipId = `legend-clip-${Math.random().toString(36).substr(2, 9)}`;

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
        .attr('x', 18)
        .attr('y', 10)
        .attr('font-size', '12px')
        .attr('font-style', 'italic')
        .attr('fill', 'var(--text-muted, #475569)')
        .text(catVal);

      const textNodeEl = textNode.node() as SVGTextElement | null;
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
      .on('start', function (event) {
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

    interface EventNodeItem {
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

    const eventNodeList: EventNodeItem[] = [];

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

      nowLineNode = nowLine.node() as SVGLineElement | null;
      nowLabelNode = nowLabel.node() as SVGTextElement | null;
    }

    processedEvents.forEach((evt) => {
      const color = scaleColor(evt.categoryVal);
      const yPos = scaleY(evt.id) || 0;
      const evtG = eventsG.append('g').attr('class', 'event-group').datum(evt).style('cursor', 'pointer');

      // Removed CSS fill-opacity transition to prevent CPU rasterization thrashing
      const rectBar = evtG.append('rect')
        .attr('class', 'event-bar')
        .attr('height', eventHeight)
        .attr('fill', color)
        .attr('fill-opacity', 0.35)
        .attr('rx', 2);

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
        .attr('fill', 'var(--text-normal, #0f172a)')
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

      eventNodeList.push({
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
      });

      evtG.on('mouseenter', (event: MouseEvent) => {
        rectBarNode?.setAttribute('fill-opacity', '0.65');

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
        // High performance path: update cursor position using viewport clientX/clientY
        positionTooltip(event.clientX, event.clientY);
      })
      .on('mouseleave', () => {
        rectBarNode?.setAttribute('fill-opacity', '0.35');
        hideTooltip();
      });
    });

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

      timeAxisTop.scale(activeScaleX).ticks(currentTicks);
      timeAxisBottom.scale(activeScaleX).ticks(currentTicks);
      timeGrid.scale(activeScaleX).ticks(currentGridTicks);

      axisTopG.call(timeAxisTop);
      axisBottomG.call(timeAxisBottom);
      gridG.call(timeGrid);

      preventTickOverlap(axisTopG.node() as SVGGElement);
      preventTickOverlap(axisBottomG.node() as SVGGElement);

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
        if (typeof requestAnimationFrame !== 'undefined') {
          zoomRafId = requestAnimationFrame(() => {
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

  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => {
      renderChart();
    });
  } else {
    renderChart();
  }

}

export function renderTimelineBlock(
  code: string,
  container: HTMLElement,
  ctx?: any,
  app?: any
): void {
  renderTimelineBlockAsync(code, container, ctx, app);
}