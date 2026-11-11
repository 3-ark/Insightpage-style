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

export function escapeHtml(str: string): string {
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

export function renderWikilinksToDom(text: string, targetEl: HTMLElement): void {
  targetEl.replaceChildren();
  if (typeof text !== 'string' || !text) return;
  if (!text.includes('[[')) {
    targetEl.appendChild(document.createTextNode(text));
    return;
  }
  WIKILINK_PARSE_REGEX.lastIndex = 0;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = WIKILINK_PARSE_REGEX.exec(text)) !== null) {
    if (match.index > lastIdx) {
      targetEl.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
    }
    const target = match[1].trim();
    const alias = match[2] ? match[2].trim() : target;
    const a = createEl('a');
    a.className = 'internal-link timeline-internal-link';
    a.setAttribute('data-href', target);
    a.setAttribute('href', target);
    a.textContent = alias;
    targetEl.appendChild(a);
    lastIdx = WIKILINK_PARSE_REGEX.lastIndex;
  }

  if (lastIdx < text.length) {
    targetEl.appendChild(document.createTextNode(text.slice(lastIdx)));
  }
}
