export function getOrCreateTooltip(container: HTMLElement): HTMLElement {
  // Performance optimization: Cache tooltip element reference on the container object
  // to avoid repeated querySelector(':scope > .chart-plot-tooltip') DOM scans when binding
  // tooltips across many chart elements (pie slices, radar vertices, Sankey flow paths).
  let tooltip = (container as any)._chartTooltip as HTMLElement | undefined;
  if (!tooltip || !container.contains(tooltip)) {
    tooltip = (container.querySelector(':scope > .chart-plot-tooltip') as HTMLElement) || undefined;
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'chart-plot-tooltip';
      tooltip.style.position = 'absolute';
      tooltip.style.pointerEvents = 'none';
      tooltip.style.display = 'none';
      tooltip.style.zIndex = '1000';
      tooltip.style.padding = '6px 10px';
      tooltip.style.fontSize = '12px';
      tooltip.style.fontFamily = 'var(--font-interface, var(--font-text, sans-serif))';
      tooltip.style.lineHeight = '1.4';
      tooltip.style.borderRadius = '4px';
      tooltip.style.backgroundColor = 'var(--background-secondary, #f8f8f8)';
      tooltip.style.color = 'var(--text-normal, #222222)';
      tooltip.style.border = '1px solid var(--background-modifier-border, rgba(128, 128, 128, 0.35))';
      tooltip.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.25)';
      tooltip.style.whiteSpace = 'pre-wrap';
      tooltip.style.transition = 'opacity 0.1s ease-in-out';
      tooltip.style.opacity = '0';

      const currentPos = container.style.position || (container.isConnected ? getComputedStyle(container).position : '');
      if (!currentPos || currentPos === 'static') {
        container.style.position = 'relative';
      }
      container.appendChild(tooltip);
    }
    (container as any)._chartTooltip = tooltip;
  }
  return tooltip;
}

export function bindPlotStyleTooltip(
  targetEl: SVGElement,
  container: HTMLElement,
  getTooltipText: () => string
) {
  const tooltip = getOrCreateTooltip(container);

  // Performance optimization: Cache container rect and tooltip dimensions on hover
  // to avoid forced synchronous layout reflows (getBoundingClientRect / offsetWidth)
  // on every mousemove tick during chart interactions.
  let cachedRect: DOMRect | null = null;
  let cachedWidth = 0;
  let cachedHeight = 0;

  const positionTooltip = (e: MouseEvent) => {
    if (!cachedRect) {
      cachedRect = container.getBoundingClientRect();
      cachedWidth = tooltip.offsetWidth;
      cachedHeight = tooltip.offsetHeight;
    }

    const x = e.clientX - cachedRect.left;
    const y = e.clientY - cachedRect.top;

    let left = x + 12;
    let top = y + 12;

    if (left + cachedWidth > cachedRect.width - 8) {
      left = x - cachedWidth - 12;
    }
    if (top + cachedHeight > cachedRect.height - 8) {
      top = y - cachedHeight - 12;
    }

    if (left < 4) left = 4;
    if (top < 4) top = 4;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  targetEl.addEventListener('mouseenter', (e: MouseEvent) => {
    const text = getTooltipText();
    if (!text) return;
    tooltip.textContent = text;
    tooltip.style.display = 'block';
    cachedRect = container.getBoundingClientRect();
    cachedWidth = tooltip.offsetWidth;
    cachedHeight = tooltip.offsetHeight;
    requestAnimationFrame(() => {
      tooltip.style.opacity = '1';
    });
    positionTooltip(e);
  });

  targetEl.addEventListener('mousemove', positionTooltip);

  targetEl.addEventListener('mouseleave', () => {
    cachedRect = null;
    tooltip.style.opacity = '0';
    tooltip.style.display = 'none';
  });
}
