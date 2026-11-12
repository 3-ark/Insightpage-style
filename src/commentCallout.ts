const EMOJI_REGEX = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\u2B50|\u2705|\u274C|\u26A0)/u;

export function extractEmojiAndContent(rawText: string): { emoji: string; content: string } {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { emoji: '💬', content: '' };
  }
  const match = trimmed.match(EMOJI_REGEX);
  if (match) {
    const emoji = match[0];
    const content = trimmed.slice(emoji.length).trim();
    return { emoji, content: content || emoji };
  }
  return { emoji: '💬', content: trimmed };
}

export function extractEmojiAndTitle(rawText: string): { emoji: string; title: string } {
  const { emoji, content } = extractEmojiAndContent(rawText);
  return { emoji, title: content };
}

function parseSafeHtmlFragment(rawHtml: string, doc?: Document): DocumentFragment | null {
  if (!rawHtml) return null;
  let obsidian: any;
  try {
    obsidian = require('obsidian');
  } catch {
    /* ignore */
  }
  if (obsidian && typeof obsidian.sanitizeHTMLToDom === 'function') {
    return obsidian.sanitizeHTMLToDom(rawHtml);
  }
  const documentObj = doc || (typeof document !== 'undefined' ? document : null);
  if (!documentObj) return null;
  const parser = new (documentObj.defaultView?.DOMParser || DOMParser)();
  const parsed = parser.parseFromString(rawHtml, 'text/html');
  const fragment = typeof createFragment === 'function' ? createFragment() : documentObj.createRange().createContextualFragment('');
  while (parsed.body.firstChild) {
    fragment.appendChild(parsed.body.firstChild);
  }
  return fragment;
}

function setHtmlSafely(targetEl: HTMLElement, rawHtml: string): void {
  targetEl.replaceChildren();
  const fragment = parseSafeHtmlFragment(rawHtml, targetEl.ownerDocument);
  if (fragment) {
    targetEl.appendChild(fragment);
  }
}

export function bindPopoverToTrigger(triggerBtn: HTMLButtonElement, content: string, emoji: string) {
  let popoverEl: HTMLElement | null = null;
  let outsideClickListener: ((e: MouseEvent) => void) | null = null;
  let escKeyListener: ((e: KeyboardEvent) => void) | null = null;
  let repositionListener: (() => void) | null = null;

  const closePopover = () => {
    if (popoverEl && popoverEl.parentNode) {
      popoverEl.parentNode.removeChild(popoverEl);
      popoverEl = null;
    }
    if (outsideClickListener) {
      document.removeEventListener('click', outsideClickListener, true);
      outsideClickListener = null;
    }
    if (escKeyListener) {
      document.removeEventListener('keydown', escKeyListener, true);
      escKeyListener = null;
    }
    if (repositionListener) {
      window.removeEventListener('scroll', repositionListener, true);
      window.removeEventListener('resize', repositionListener);
      repositionListener = null;
    }
  };

  const positionPopover = (popover: HTMLElement, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const popoverWidth = 260;

    let left = rect.left + rect.width / 2 - popoverWidth / 2;

    if (left < 10) left = 10;
    if (left + popoverWidth > window.innerWidth - 10) {
      left = window.innerWidth - popoverWidth - 10;
    }

    popover.style.left = `${left}px`;

    document.body.appendChild(popover);
    const popoverHeight = popover.offsetHeight;

    let top = rect.top - popoverHeight - 8;
    if (rect.top - popoverHeight - 8 < 10) {
      top = rect.bottom + 8;
    }

    popover.style.top = `${top}px`;
  };

  const openPopover = () => {
    if (popoverEl) {
      closePopover();
      return;
    }

    popoverEl = createDiv();
    popoverEl.className = 'comment-callout-popover';

    const popoverContent = createDiv();
    popoverContent.className = 'comment-callout-popover-content';

    const body = createDiv();
    body.className = 'comment-callout-popover-body thin-scrollbar';
    setHtmlSafely(body, content);
    popoverContent.appendChild(body);

    popoverEl.appendChild(popoverContent);

    positionPopover(popoverEl, triggerBtn);
    repositionListener = () => {
      if (popoverEl) {
        positionPopover(popoverEl, triggerBtn);
      }
    };
    window.addEventListener('scroll', repositionListener, true);
    window.addEventListener('resize', repositionListener);

    outsideClickListener = (e: MouseEvent) => {
      if (
        popoverEl &&
        !popoverEl.contains(e.target as Node) &&
        !triggerBtn.contains(e.target as Node)
      ) {
        closePopover();
      }
    };

    escKeyListener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePopover();
      }
    };

    window.setTimeout(() => {
      if (outsideClickListener) {
        document.addEventListener('click', outsideClickListener, true);
      }
      if (escKeyListener) {
        document.addEventListener('keydown', escKeyListener, true);
      }
    }, 10);
  };

  triggerBtn.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });

  triggerBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openPopover();
  });
}

export function findBalancedCmtMatches(
  text: string
): Array<{ fullMatch: string; rawContent: string; startIndex: number; endIndex: number }> {
  const matches: Array<{ fullMatch: string; rawContent: string; startIndex: number; endIndex: number }> = [];
  if (!text || !text.includes('::cmt')) return matches;

  let searchIndex = 0;
  while (searchIndex < text.length) {
    const matchStart = text.indexOf('::cmt', searchIndex);
    if (matchStart === -1) break;

    let index = matchStart + 5;
    while (index < text.length && (text[index] === ' ' || text[index] === '\t')) {
      index++;
    }

    if (index >= text.length) {
      searchIndex = matchStart + 5;
      continue;
    }

    const openChar = text[index];
    let closeChar = '';
    if (openChar === '[') {
      closeChar = ']';
    } else if (openChar === '{') {
      closeChar = '}';
    } else {
      searchIndex = matchStart + 5;
      continue;
    }

    const contentStart = index + 1;
    let depth = 1;
    let currentIndex = contentStart;

    while (currentIndex < text.length && depth > 0) {
      const char = text[currentIndex];
      if (char === openChar) {
        depth++;
      } else if (char === closeChar) {
        depth--;
      }
      if (depth === 0) {
        break;
      }
      currentIndex++;
    }

    if (depth === 0) {
      const rawContent = text.slice(contentStart, currentIndex);
      const fullMatch = text.slice(matchStart, currentIndex + 1);
      matches.push({
        fullMatch,
        rawContent,
        startIndex: matchStart,
        endIndex: currentIndex + 1,
      });
      searchIndex = currentIndex + 1;
    } else {
      searchIndex = matchStart + 5;
    }
  }

  return matches;
}

export function createCommentElement(rawContent: string): HTMLElement {
  const { emoji, content } = extractEmojiAndContent(rawContent);

  const wrapper = createSpan();
  wrapper.className = 'callout comment-callout-wrapper';
  wrapper.setAttribute('data-callout', 'comment');
  wrapper.setAttribute('data-comment-processed', 'true');

  const containerSpan = createSpan();
  containerSpan.className = 'comment-callout-container';

  // Print element
  const printSpan = createSpan();
  printSpan.className = 'comment-callout-print';

  const printEmoji = createSpan();
  printEmoji.className = 'comment-callout-emoji';
  printEmoji.textContent = emoji;
  printSpan.appendChild(printEmoji);

  const printBody = createSpan();
  printBody.className = 'comment-callout-print-body';
  setHtmlSafely(printBody, ' ' + content);
  printSpan.appendChild(printBody);

  containerSpan.appendChild(printSpan);

  // Screen element (trigger button)
  const screenSpan = createSpan();
  screenSpan.className = 'comment-callout-screen';

  const triggerBtn = createEl('button');
  triggerBtn.className = 'comment-callout-trigger';
  triggerBtn.setAttribute('role', 'button');
  triggerBtn.setAttribute('type', 'button');
  triggerBtn.setAttribute('aria-label', 'view comment');

  const emojiSpan = createSpan();
  emojiSpan.className = 'comment-callout-emoji';
  emojiSpan.textContent = emoji;
  triggerBtn.appendChild(emojiSpan);

  screenSpan.appendChild(triggerBtn);
  containerSpan.appendChild(screenSpan);
  wrapper.appendChild(containerSpan);

  bindPopoverToTrigger(triggerBtn, content, emoji);

  return wrapper;
}

export function transformCommentHtml(html: string): string {
  if (!html || !html.includes('::cmt')) {
    return html;
  }
  const fragment = parseSafeHtmlFragment(html);
  if (!fragment) return html;
  const tempDiv = createDiv();
  tempDiv.appendChild(fragment);
  processCommentCallouts(tempDiv);
  return tempDiv.innerHTML;
}

const EXCLUDED_TAGS = new Set(['CODE', 'PRE', 'SCRIPT', 'STYLE', 'SVG', 'TEXTAREA']);

export function processCommentCallouts(container: HTMLElement): void {
  if (!container) return;

  // Performance optimization: Avoid serializing container.innerHTML or running querySelectorAll
  // subtree scans on early returns. Fast class checks short-circuit legacy callout scans.
  const textContent = container.textContent || '';
  const hasInlineCmt = textContent.includes('::cmt');

  const hasCalloutClass =
    (container.classList && container.classList.contains('callout')) ||
    container.getElementsByClassName('callout').length > 0;

  const legacyCalloutList = hasCalloutClass
    ? container.querySelectorAll<HTMLElement>('.callout[data-callout="comment"]')
    : null;
  const hasLegacyCallouts = !!(legacyCalloutList && legacyCalloutList.length > 0);

  if (!hasInlineCmt && !hasLegacyCallouts) {
    return;
  }

  // 1. Process legacy callout blocks if present
  if (hasLegacyCallouts && legacyCalloutList) {
    legacyCalloutList.forEach((calloutEl) => {
      if (calloutEl.getAttribute('data-comment-processed') === 'true') {
        return;
      }
      const titleEl = calloutEl.querySelector('.callout-title-inner') || calloutEl.querySelector('.callout-title');
      const contentEl = calloutEl.querySelector('.callout-content');
      const rawText = ((titleEl?.innerHTML || titleEl?.textContent || '') + ' ' + (contentEl?.innerHTML || contentEl?.textContent || '')).trim();

      const newCommentEl = createCommentElement(rawText);
      calloutEl.replaceWith(newCommentEl);
    });
  }

  // 2. Process inline ::cmt[...] text and HTML structures
  if (hasInlineCmt) {
    const isExcluded = (el: Element): boolean => {
      const tag = el.tagName.toUpperCase();
      if (EXCLUDED_TAGS.has(tag)) return true;
      if (el.closest('code, pre, script, style, svg, .math, .comment-callout-wrapper')) return true;
      return false;
    };

    const getDepth = (el: Element): number => {
      let depth = 0;
      let p = el.parentElement;
      while (p && p !== container) {
        depth++;
        p = p.parentElement;
      }
      return depth;
    };

    // Performance optimization: Short-circuit with textContent check BEFORE running isExcluded (closest checks)
    // or reading innerHTML (DOM subtree serialization). Precalculate depth to avoid O(N log N) depth lookups.
    // When the container has no child elements (e.g. plain text leaf), skip querySelectorAll('*') entirely.
    const candidatesWithDepth: Array<{ el: HTMLElement; depth: number }> = [];
    if (container.children.length > 0) {
      const allEls = container.querySelectorAll<HTMLElement>('*');
      allEls.forEach((el) => {
        if (el.textContent && el.textContent.includes('::cmt')) {
          if (!isExcluded(el)) {
            candidatesWithDepth.push({ el, depth: getDepth(el) });
          }
        }
      });
    }

    if (
      candidatesWithDepth.length === 0 &&
      !isExcluded(container)
    ) {
      candidatesWithDepth.push({ el: container, depth: getDepth(container) });
    }

    // Sort candidates deepest in DOM tree first using precalculated depth
    candidatesWithDepth.sort((a, b) => b.depth - a.depth);
    const candidates = candidatesWithDepth.map((c) => c.el);

    for (const parentEl of candidates) {
      if (!parentEl.textContent || !parentEl.textContent.includes('::cmt')) continue;

      const SHOW_TEXT = typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4;
      const FILTER_ACCEPT = typeof NodeFilter !== 'undefined' ? NodeFilter.FILTER_ACCEPT : 1;
      const FILTER_REJECT = typeof NodeFilter !== 'undefined' ? NodeFilter.FILTER_REJECT : 2;

      const walker = document.createTreeWalker(parentEl, SHOW_TEXT, {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent || isExcluded(parent)) return FILTER_REJECT;
          return FILTER_ACCEPT;
        },
      });
      const textNodes: Text[] = [];
      let currentNode: Node | null;
      while ((currentNode = walker.nextNode())) {
        textNodes.push(currentNode as Text);
      }

      for (const node of textNodes) {
        const text = node.nodeValue;
        if (!text || !text.includes('::cmt')) continue;
        const matches = findBalancedCmtMatches(text);
        if (matches.length === 0) continue;

        const pNode = node.parentNode;
        if (!pNode) continue;

        const fragment = createFragment();
        let lastIdx = 0;
        for (const m of matches) {
          if (m.startIndex > lastIdx) {
            fragment.appendChild(document.createTextNode(text.slice(lastIdx, m.startIndex)));
          }
          const commentEl = createCommentElement(m.rawContent);
          fragment.appendChild(commentEl);
          lastIdx = m.endIndex;
        }
        if (lastIdx < text.length) {
          fragment.appendChild(document.createTextNode(text.slice(lastIdx)));
        }
        pNode.replaceChild(fragment, node);
      }

      // Performance optimization: Check parentEl.textContent first before reading parentEl.innerHTML.
      // If textNodes replacement already replaced all ::cmt occurrences in text nodes, parentEl.textContent
      // no longer contains '::cmt', avoiding expensive DOM innerHTML serialization.
      // Furthermore, guard tempCheck DOM tree construction with parentEl.querySelector; if no excluded
      // elements exist, parentEl.innerHTML already proves ::cmt is in non-excluded content.
      if (parentEl.textContent && parentEl.textContent.includes('::cmt') && parentEl.innerHTML.includes('::cmt')) {
        let hasValidMatchInHtml = false;
        const hasExcludedChildren = !!parentEl.querySelector('code, pre, script, style, svg, .math, .comment-callout-wrapper');

        if (!hasExcludedChildren) {
          hasValidMatchInHtml = true;
        } else {
          const tempCheck = parentEl.cloneNode(true) as HTMLElement;
          tempCheck.querySelectorAll('code, pre, script, style, svg, .math, .comment-callout-wrapper').forEach((excluded) => {
            excluded.textContent = '';
          });
          hasValidMatchInHtml = (tempCheck.textContent || '').includes('::cmt');
        }

        if (hasValidMatchInHtml) {
          const htmlContent = parentEl.innerHTML;
          const matches = findBalancedCmtMatches(htmlContent);
          if (matches.length > 0) {
            const fragment = createFragment();
            let lastIdx = 0;
            for (const m of matches) {
              if (m.startIndex > lastIdx) {
                const sliceFrag = parseSafeHtmlFragment(htmlContent.slice(lastIdx, m.startIndex), parentEl.ownerDocument);
                if (sliceFrag) {
                  fragment.appendChild(sliceFrag);
                }
              }
              const commentEl = createCommentElement(m.rawContent);
              fragment.appendChild(commentEl);
              lastIdx = m.endIndex;
            }
            if (lastIdx < htmlContent.length) {
              const sliceFrag = parseSafeHtmlFragment(htmlContent.slice(lastIdx), parentEl.ownerDocument);
              if (sliceFrag) {
                fragment.appendChild(sliceFrag);
              }
            }
            parentEl.replaceChildren(fragment);
          }
        }
      }
    }
  }
}
