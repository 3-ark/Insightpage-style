export function getOrCreateTooltip(container: HTMLElement): HTMLElement {
  // Performance optimization: Cache tooltip element reference on the container object
  // to avoid repeated querySelector(':scope > .chart-plot-tooltip') DOM scans when binding
  // tooltips across many chart elements (pie slices, radar vertices, Sankey flow paths).
  let tooltip = (container as any)._chartTooltip as HTMLElement | undefined;
  if (!tooltip || !container.contains(tooltip)) {
    tooltip = (container.querySelector(':scope > .chart-plot-tooltip') as HTMLElement) || undefined;
    if (!tooltip) {
      tooltip = createDiv({ cls: 'chart-plot-tooltip' });

      const currentPos = container.style.position || (container.isConnected ? getComputedStyle(container).position : '');
      if (!currentPos || currentPos === 'static') {
        container.classList.add('chart-relative-container');
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
    tooltip.classList.add('is-visible');
    cachedRect = container.getBoundingClientRect();
    cachedWidth = tooltip.offsetWidth;
    cachedHeight = tooltip.offsetHeight;
    positionTooltip(e);
  });

  targetEl.addEventListener('mousemove', positionTooltip);

  targetEl.addEventListener('mouseleave', () => {
    cachedRect = null;
    tooltip.classList.remove('is-visible');
  });
}
