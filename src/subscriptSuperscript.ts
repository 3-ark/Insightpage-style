import { Decoration, ViewPlugin } from '@codemirror/view';
import type { Range } from '@codemirror/state';
import type { DecorationSet, EditorView, ViewUpdate } from '@codemirror/view';
import { sanitizeHTMLToDom } from 'obsidian';

const BLOCK_REGEX = /<(code|pre|script|style|svg|span[^>]*class="[^"]*math[^"]*")[^>]*>[\s\S]*?<\/\1>|<span[^>]*class="[^"]*math[^"]*"[^>]*>[\s\S]*?<\/span>/gi;
const TAG_REGEX = /<[^>]+>/g;
const SUPERSCRIPT_REGEX = /(^|[^\\])\^([^^\r\n]+?)\^(?!\^)/g;
const SUBSCRIPT_REGEX = /(^|[^\\~])~(?!~)([^~\r\n]+?)~(?!~)/g;
const RESTORE_TAG_REGEX = /___HTML_TAG_(\d+)___/g;
const RESTORE_BLOCK_REGEX = /___PROTECTED_BLOCK_(\d+)___/g;

export interface ScriptDecorationRange {
  from: number;
  to: number;
  tokenFrom: number;
  tokenTo: number;
  markerRanges: Array<[number, number]>;
  tagName: 'sub' | 'sup';
}

export function findSubscriptSuperscriptRanges(source: string): ScriptDecorationRange[] {
  const ranges: ScriptDecorationRange[] = [];
  let fencedCode: { marker: string; length: number } | undefined;
  let lineOffset = 0;

  for (const line of source.split('\n')) {
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fencedCode) {
      if (
        fence &&
        fence[1][0] === fencedCode.marker &&
        fence[1].length >= fencedCode.length &&
        new RegExp(`^ {0,3}${fencedCode.marker}{${fencedCode.length},}\\s*$`).test(line)
      ) {
        fencedCode = undefined;
      }
      lineOffset += line.length + 1;
      continue;
    }

    if (fence) {
      fencedCode = { marker: fence[1][0], length: fence[1].length };
      lineOffset += line.length + 1;
      continue;
    }

    const inlineCodeRanges: Array<[number, number]> = [];
    const inlineCodePattern = /(`+)(.*?)\1/g;
    let inlineCodeMatch: RegExpExecArray | null;
    while ((inlineCodeMatch = inlineCodePattern.exec(line)) !== null) {
      let slashCount = 0;
      for (let i = inlineCodeMatch.index - 1; i >= 0 && line[i] === '\\'; i--) {
        slashCount++;
      }
      if (slashCount % 2 === 0) {
        inlineCodeRanges.push([
          inlineCodeMatch.index,
          inlineCodeMatch.index + inlineCodeMatch[0].length,
        ]);
      }
    }

    const addRanges = (pattern: RegExp, tagName: ScriptDecorationRange['tagName']) => {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        const content = match[2];
        if (
          !content.trim() ||
          (tagName === 'sub' && (content.startsWith(' ') || content.endsWith(' ')))
        ) {
          continue;
        }

        const from = match.index + match[1].length + 1;
        const to = from + content.length;
        if (inlineCodeRanges.some(([codeFrom, codeTo]) => from < codeTo && to > codeFrom)) {
          continue;
        }
        const tokenFrom = lineOffset + from - 1;
        const tokenTo = lineOffset + to + 1;
        ranges.push({
          from: lineOffset + from,
          to: lineOffset + to,
          tokenFrom,
          tokenTo,
          markerRanges: [
            [tokenFrom, tokenFrom + 1],
            [lineOffset + to, tokenTo],
          ],
          tagName,
        });
      }
    };

    addRanges(new RegExp(SUPERSCRIPT_REGEX), 'sup');
    addRanges(new RegExp(SUBSCRIPT_REGEX), 'sub');
    lineOffset += line.length + 1;
  }

  return ranges.sort((a, b) => a.from - b.from || a.to - b.to);
}

function getEditorDecorations(view: EditorView): DecorationSet {
  const selection = view.state.selection;
  const ranges: Range<Decoration>[] = [];
  for (const script of findSubscriptSuperscriptRanges(view.state.doc.toString())) {
    const mark = script.tagName === 'sub'
      ? Decoration.mark({
        tagName: 'span',
        attributes: {
          class: 'cm-ip-subscript',
          style: 'vertical-align: -0.25em; font-size: 0.75em; line-height: 0;',
        },
      })
      : Decoration.mark({ tagName: 'sup' });
    ranges.push(mark.range(script.from, script.to));
    const isActive = selection.ranges.some(
      (range) => range.from <= script.tokenTo && range.to >= script.tokenFrom
    );
    if (!isActive) {
      for (const [from, to] of script.markerRanges) {
        ranges.push(Decoration.replace({}).range(from, to));
      }
    }
  }
  return Decoration.set(ranges, true);
}

export const subscriptSuperscriptEditorExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = getEditorDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = getEditorDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

export function transformSubscriptSuperscriptHtml(html: string): string {
  if (!html || (!html.includes('^') && !html.includes('~'))) {
    return html;
  }

  // Performance optimization: Superscript (^content^) and subscript (~content~) syntax require at least
  // two caret or two tilde characters to match. If fewer exist, return early without expensive DOM tag masking.
  const firstCaret = html.indexOf('^');
  const hasSuper = firstCaret !== -1 && html.indexOf('^', firstCaret + 1) !== -1;

  const firstTilde = html.indexOf('~');
  const hasSub = firstTilde !== -1 && html.indexOf('~', firstTilde + 1) !== -1;

  if (!hasSuper && !hasSub) {
    return html;
  }

  // Performance optimization: Check for HTML markup ('<') before running regexes to mask HTML tags and protected blocks.
  // When processing plain text nodes or string content without tags, skipping BLOCK_REGEX and TAG_REGEX eliminates
  // expensive global regex scans, object allocations, and restoration Passes.
  const hasHtml = html.includes('<');

  let maskedHtml = html;
  const protectedBlocks: string[] = [];
  const htmlTags: string[] = [];

  if (hasHtml) {
    // 1. Protect pre, code, script, style, and math blocks
    maskedHtml = maskedHtml.replace(BLOCK_REGEX, (match) => {
      const placeholder = `___PROTECTED_BLOCK_${protectedBlocks.length}___`;
      protectedBlocks.push(match);
      return placeholder;
    });

    // 2. Protect HTML tags so carets/tildes inside attributes are untouched
    maskedHtml = maskedHtml.replace(TAG_REGEX, (match) => {
      const placeholder = `___HTML_TAG_${htmlTags.length}___`;
      htmlTags.push(match);
      return placeholder;
    });
  }

  // 3. Process Superscript: ^content^ (not escaped, not empty, not whitespace-only)
  if (hasSuper) {
    maskedHtml = maskedHtml.replace(SUPERSCRIPT_REGEX, (_match: string, prefix: string, content: string) => {
      if (prefix === '^' || !content.trim()) return _match;
      return `${prefix}<sup>${content}</sup>`;
    });
  }

  // 4. Process Subscript: ~content~ (single tilde, not escaped, not double tilde ~~strikethrough~~)
  if (hasSub) {
    maskedHtml = maskedHtml.replace(SUBSCRIPT_REGEX, (_match: string, prefix: string, content: string) => {
      if (prefix === '~' || !content.trim() || content.startsWith(' ') || content.endsWith(' ')) return _match;
      return `${prefix}<sub>${content}</sub>`;
    });
  }

  // 5. Restore HTML tags if any were masked
  if (htmlTags.length > 0) {
    maskedHtml = maskedHtml.replace(RESTORE_TAG_REGEX, (_match: string, index: string) => {
      return htmlTags[parseInt(index, 10)] || _match;
    });
  }

  // 6. Restore protected blocks if any were masked
  if (protectedBlocks.length > 0) {
    maskedHtml = maskedHtml.replace(RESTORE_BLOCK_REGEX, (_match: string, index: string) => {
      return protectedBlocks[parseInt(index, 10)] || _match;
    });
  }

  return maskedHtml;
}

export function processSubscriptSuperscript(container: HTMLElement): void {
  if (!container) return;

  const text = container.textContent;
  if (!text) return;

  // Performance optimization: Superscript (^content^) and subscript (~content~) syntax require at least
  // two caret or two tilde characters in the text content. Fast O(1) indexOf checks short-circuit
  // reading container.innerHTML (which forces DOM subtree HTML serialization) when delimiter pairs do not exist.
  const firstCaret = text.indexOf('^');
  const hasSuper = firstCaret !== -1 && text.indexOf('^', firstCaret + 1) !== -1;

  const firstTilde = text.indexOf('~');
  const hasSub = firstTilde !== -1 && text.indexOf('~', firstTilde + 1) !== -1;

  if (!hasSuper && !hasSub) {
    return;
  }

  // Performance optimization: Read innerHTML once and guard against unneeded DOM reassignment.
  // Re-assigning innerHTML destroys all child DOM nodes and forces layout re-calculation.
  const html = container.innerHTML;
  const transformed = transformSubscriptSuperscriptHtml(html);
  if (transformed !== html) {
    container.replaceChildren();
    if (typeof sanitizeHTMLToDom === 'function') {
      container.appendChild(sanitizeHTMLToDom(transformed));
    } else {
      const parser = new (container.ownerDocument?.defaultView?.DOMParser || DOMParser)();
      const parsed = parser.parseFromString(transformed, 'text/html');
      while (parsed.body.firstChild) {
        container.appendChild(parsed.body.firstChild);
      }
    }
  }
}
