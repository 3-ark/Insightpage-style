const BLOCK_REGEX = /<(code|pre|script|style|svg|span[^>]*class="[^"]*math[^"]*")[^>]*>[\s\S]*?<\/\1>|<span[^>]*class="[^"]*math[^"]*"[^>]*>[\s\S]*?<\/span>/gi;
const TAG_REGEX = /<[^>]+>/g;
const SUPERSCRIPT_REGEX = /(?<![\\^])\^([^\^\r\n]+?)\^(?!\^)/g;
const SUBSCRIPT_REGEX = /(?<![\\~])~(?![~\s])([^~\r\n]+?)(?<!\s)~(?![~])/g;
const RESTORE_TAG_REGEX = /___HTML_TAG_(\d+)___/g;
const RESTORE_BLOCK_REGEX = /___PROTECTED_BLOCK_(\d+)___/g;

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
    maskedHtml = maskedHtml.replace(SUPERSCRIPT_REGEX, (_match, content) => {
      if (!content.trim()) return _match;
      return `<sup>${content}</sup>`;
    });
  }

  // 4. Process Subscript: ~content~ (single tilde, not escaped, not double tilde ~~strikethrough~~)
  if (hasSub) {
    maskedHtml = maskedHtml.replace(SUBSCRIPT_REGEX, (_match, content) => {
      if (!content.trim()) return _match;
      return `<sub>${content}</sub>`;
    });
  }

  // 5. Restore HTML tags if any were masked
  if (htmlTags.length > 0) {
    maskedHtml = maskedHtml.replace(RESTORE_TAG_REGEX, (_match, index) => {
      return htmlTags[parseInt(index, 10)] || _match;
    });
  }

  // 6. Restore protected blocks if any were masked
  if (protectedBlocks.length > 0) {
    maskedHtml = maskedHtml.replace(RESTORE_BLOCK_REGEX, (_match, index) => {
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
    container.innerHTML = transformed;
  }
}
