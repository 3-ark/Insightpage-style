import { renderWikilinksToDom } from './timelineWikilinks';

export interface TooltipDetails {
  categoryLabel?: string;
  categoryValue?: string;
  categoryColor?: string;
  dateRange?: string;
  items?: string[];
}

export interface TimelineTooltipController {
  showTooltip: (event: MouseEvent, title: string, details?: string | TooltipDetails) => void;
  hideTooltip: (immediate?: boolean) => void;
  positionTooltip: (clientX: number, clientY: number) => void;
}

export function createTimelineTooltip(
  wrapper: HTMLElement,
  app?: any,
  ctx?: any
): TimelineTooltipController {
  let tooltip = wrapper.querySelector<HTMLDivElement>('.timeline-tooltip');
  let ttTitle: HTMLDivElement;
  let ttCat: HTMLDivElement;
  let ttDate: HTMLDivElement;
  let ttList: HTMLDivElement;
  let ttSub: HTMLDivElement;

  if (!tooltip) {
    tooltip = createDiv();
    tooltip.className = 'timeline-tooltip absolute opacity-0 transition-opacity duration-100 z-30 px-3 py-2 text-xs rounded-lg shadow-xl bg-popover text-popover-foreground border border-border/30 max-w-xs';
    tooltip.style.left = '0';
    tooltip.style.top = '0';
    tooltip.classList.add('timeline-tooltip-hidden');

    ttTitle = createDiv();
    ttTitle.className = 'font-bold text-sm mb-1 text-foreground tt-title';
    tooltip.appendChild(ttTitle);

    ttCat = createDiv();
    ttCat.className = 'text-xs font-semibold mb-1.5 tt-cat is-hidden';
    tooltip.appendChild(ttCat);

    ttDate = createDiv();
    ttDate.className = 'inline-block px-2.5 py-0.5 text-[11px] font-mono rounded-md bg-muted/60 border border-border/30 text-muted-foreground mb-1 tt-date is-hidden';
    tooltip.appendChild(ttDate);

    ttList = createDiv();
    ttList.className = 'mt-1 pt-1 border-t border-border/20 text-xs font-mono text-primary flex flex-wrap gap-1 tt-items is-hidden';
    tooltip.appendChild(ttList);

    ttSub = createDiv();
    ttSub.className = 'text-xs text-muted-foreground mb-1 tt-sub is-hidden';
    tooltip.appendChild(ttSub);

    wrapper.appendChild(tooltip);
  } else {
    ttTitle = tooltip.querySelector<HTMLDivElement>('.tt-title')!;
    ttCat = tooltip.querySelector<HTMLDivElement>('.tt-cat')!;
    ttDate = tooltip.querySelector<HTMLDivElement>('.tt-date')!;
    ttList = tooltip.querySelector<HTMLDivElement>('.tt-items')!;
    ttSub = tooltip.querySelector<HTMLDivElement>('.tt-sub')!;
  }

  let hideTimeout: any = null;

  function clearHideTimeout() {
    if (hideTimeout !== null) {
      window.clearTimeout(hideTimeout);
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
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame !== 'undefined') {
        rafId = window.requestAnimationFrame(() => {
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

    if (lastTooltipKey !== contentKey) {
      lastTooltipKey = contentKey;
      renderWikilinksToDom(title, ttTitle);

      if (typeof details === 'object' && details !== null) {
        ttSub.classList.add('is-hidden');

        if (details.categoryLabel && details.categoryValue) {
          ttCat.classList.remove('is-hidden');
          ttCat.style.color = details.categoryColor || 'var(--text-muted, #eab308)';
          ttCat.textContent = `${details.categoryLabel.charAt(0).toUpperCase() + details.categoryLabel.slice(1)}: ${details.categoryValue}`;
        } else {
          ttCat.classList.add('is-hidden');
        }

        if (details.dateRange) {
          ttDate.classList.remove('is-hidden');
          ttDate.textContent = details.dateRange;
        } else {
          ttDate.classList.add('is-hidden');
        }

        if (details.items && details.items.length > 0) {
          ttList.replaceChildren();
          details.items.forEach((it) => {
            const badge = createSpan();
            badge.className = 'px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[10px]';
            badge.textContent = String(it);
            ttList.appendChild(badge);
          });
          ttList.classList.remove('is-hidden');
        } else {
          ttList.classList.add('is-hidden');
        }
      } else if (typeof details === 'string') {
        ttCat.classList.add('is-hidden');
        ttDate.classList.add('is-hidden');
        ttList.classList.add('is-hidden');
        ttSub.classList.remove('is-hidden');
        ttSub.textContent = details;
      } else {
        ttCat.classList.add('is-hidden');
        ttDate.classList.add('is-hidden');
        ttList.classList.add('is-hidden');
        ttSub.classList.add('is-hidden');
      }

      cachedTtWidth = tooltip.offsetWidth || 200;
      cachedTtHeight = tooltip.offsetHeight || 65;
    }

    positionTooltip(event.clientX, event.clientY);
    tooltip.classList.remove('timeline-tooltip-hidden');
    tooltip.classList.add('timeline-tooltip-visible');
  }

  function hideTooltip(immediate = false) {
    clearHideTimeout();
    if (immediate) {
      if (rafId !== null) {
        if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame !== 'undefined') {
          window.cancelAnimationFrame(rafId);
        }
        rafId = null;
      }
      lastTooltipKey = '';
      if (tooltip) {
        tooltip.classList.remove('timeline-tooltip-visible');
        tooltip.classList.add('timeline-tooltip-hidden');
      }
    } else {
      hideTimeout = window.setTimeout(() => {
        hideTooltip(true);
      }, 200);
    }
  }

  return {
    showTooltip,
    hideTooltip,
    positionTooltip,
  };
}
