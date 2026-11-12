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
import {
  getTimeGranularity,
  createAdaptiveTickFormatter,
  formatCursorDate,
  calculateOptimalTickCount,
  preventTickOverlap,
  type TimeGranularity,
} from './lib/timeline-utils';
import {
  stripWikilinks,
  parseWikilinksToHtml,
  renderWikilinksToDom,
} from './charts/timelineWikilinks';
import {
  formatTimelineTick,
} from './charts/timelineFormatters';
import {
  createTlDownloadIcon,
  setTlButtonIcon,
} from './charts/timelineIcons';
import { resolveTimelineData } from './charts/timelineDataResolver';
import { createTimelineTooltip } from './charts/timelineTooltip';
import { renderTimelineD3Chart } from './charts/timelineD3Renderer';

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
  stripWikilinks,
  parseWikilinksToHtml,
  renderWikilinksToDom,
  formatTimelineTick,
  type TimelineEvent,
  type ParsedTimelineData,
  type TimelineConfig,
  type TimeGranularity,
};

// Polyfill Element.prototype.isShown if missing (Obsidian defines it on HTMLElement.prototype,
// but SVG elements inherit from Element/SVGElement, causing TypeError when e.isShown() is called).
function ensureIsShownPolyfill() {
  if (typeof Element !== 'undefined' && !('isShown' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'isShown', {
      value: function (this: Element) {
        const Ctor = this.ownerDocument?.defaultView?.HTMLElement || (typeof HTMLElement !== 'undefined' ? HTMLElement : null);
        const isHtml = typeof (this as any).instanceOf === 'function' && Ctor
          ? (this as any).instanceOf(Ctor)
          : (typeof HTMLElement !== 'undefined' && (this as any).constructor?.name === 'HTMLElement');
        if (typeof (HTMLElement.prototype as any)?.isShown === 'function' && isHtml) {
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

export async function renderTimelineBlockAsync(
  code: string,
  container: HTMLElement,
  ctx?: any,
  app?: any
): Promise<void> {
  ensureIsShownPolyfill();
  const wrapper = createDiv();
  wrapper.className = 'timeline-wrapper relative group/chart w-full my-4 p-4 rounded-xl border border-border/20 bg-card shadow-sm transition-shadow duration-200 hover:shadow-md overflow-x-auto thin-scrollbar';

  let parsedData: ParsedTimelineData;
  try {
    parsedData = await resolveTimelineData(code, ctx, app);
  } catch (err: any) {
    const errorNotice = createDiv();
    errorNotice.className = 'chart-error my-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm';
    errorNotice.textContent = `Unable to render timeline chart: ${err?.message || err}`;

    const rawCode = createEl('pre');
    rawCode.className = 'p-3 bg-muted rounded text-xs overflow-x-auto font-mono';
    rawCode.textContent = code;

    errorNotice.appendChild(rawCode);
    container.appendChild(errorNotice);
    return;
  }

  let activeCategoryState = parsedData.activeCategory;

  const chartContainer = createDiv();
  chartContainer.className = 'timeline-chart-container w-full flex flex-col justify-center items-center relative overflow-x-auto';

  const svg = createSvg('svg');
  svg.setAttribute('aria-label', 'Zoomable Event Timeline Chart');
  svg.setAttribute('class', 'timeline-svg w-full cursor-grab active:cursor-grabbing min-h-60');

  chartContainer.appendChild(svg);
  wrapper.appendChild(chartContainer);

  const actionBtnsGroup = createDiv();
  actionBtnsGroup.className = 'timeline-action-btns absolute right-3 top-3 z-10 opacity-0 group-hover/chart:opacity-100 group-focus-within/chart:opacity-100 transition-opacity duration-200 flex items-center gap-1';

  const downloadBtn = createEl('button');
  downloadBtn.className = 'timeline-btn timeline-download-btn p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/20 transition-colors';
  downloadBtn.title = 'Download SVG';
  setTlButtonIcon(downloadBtn, createTlDownloadIcon());
  downloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    try {
      const svgCloned = svg.cloneNode(true) as SVGElement;
      svgCloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const svgData = new XMLSerializer().serializeToString(svgCloned);
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = createEl('a');
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

  actionBtnsGroup.appendChild(downloadBtn);
  chartContainer.appendChild(actionBtnsGroup);

  const controlsDiv = createDiv();
  controlsDiv.className = 'timeline-category-controls flex items-center gap-4 mt-3 px-2 pt-2 border-t border-border/10 text-xs font-medium text-muted-foreground select-none';

  function renderCategoryRadioGroup() {
    controlsDiv.replaceChildren();
    if (parsedData.categories.length <= 1) {
      controlsDiv.classList.add('is-hidden');
      return;
    }
    controlsDiv.classList.remove('is-hidden');
    const radioGroupName = `timeline-category-${Math.random().toString(36).slice(2, 11)}`;

    parsedData.categories.forEach((catKey) => {
      const isChecked = catKey === activeCategoryState;
      const label = createEl('label');
      label.className = `inline-flex items-center gap-1.5 cursor-pointer transition-colors hover:text-foreground ${isChecked ? 'text-primary font-semibold' : ''}`;

      const input = createEl('input');
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

      const span = createSpan();
      span.textContent = catKey;

      label.appendChild(input);
      label.appendChild(span);
      controlsDiv.appendChild(label);
    });
  }

  renderCategoryRadioGroup();
  wrapper.appendChild(controlsDiv);
  container.appendChild(wrapper);

  const tooltipCtrl = createTimelineTooltip(wrapper, app, ctx);

  function renderChart() {
    const d3 = getD3();
    renderTimelineD3Chart(
      svg,
      wrapper,
      container,
      parsedData,
      activeCategoryState,
      d3,
      tooltipCtrl
    );
  }

  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame !== 'undefined') {
    window.requestAnimationFrame(() => {
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
  void renderTimelineBlockAsync(code, container, ctx, app);
}
