import type { TFile } from 'obsidian';
import { extractTablesFromMarkdown, extractTablesFromDom } from 'src/chartFromTable';
import { toTFile, createCustomFetch } from './customFetch';
import { getPlot, getD3 } from './plotInstance';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const TABLE_COMMENT_REGEX1 = /^\/\/\s*table\s*:\s*(.+)$/i;
const TABLE_COMMENT_REGEX2 = /^\/\*\s*table\s*:\s*(.+)\s*\*\/$/i;
const ID_COMMENT_REGEX1 = /^\/\/\s*id\s*:\s*(.+)$/i;
const ID_COMMENT_REGEX2 = /^\/\*\s*id\s*:\s*(.+)\s*\*\/$/i;
const FILE_COMMENT_REGEX1 = /^\/\/\s*file\s*:\s*(.+)$/i;
const FILE_COMMENT_REGEX2 = /^\/\*\s*file\s*:\s*(.+)\s*\*\/$/i;
const VALID_IDENTIFIER_REGEX = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

export function resolveToDomElement(val: any, PlotInst: any): HTMLElement | SVGElement | null {
  if (!val) return null;
  if (val instanceof HTMLElement || val instanceof SVGElement) {
    return val;
  }
  if (typeof val.plot === 'function') {
    try {
      const plotEl = val.plot();
      if (plotEl instanceof HTMLElement || plotEl instanceof SVGElement) {
        return plotEl;
      }
    } catch {
      // Ignore plot error
    }
  }
  if (Array.isArray(val) || val.marks) {
    try {
      const plotEl = PlotInst.plot(Array.isArray(val) ? { marks: val } : val);
      if (plotEl instanceof HTMLElement || plotEl instanceof SVGElement) {
        return plotEl;
      }
    } catch {
      // Ignore plot error
    }
  }
  if (typeof val.node === 'function') {
    try {
      const nodeEl = val.node();
      if (nodeEl instanceof HTMLElement || nodeEl instanceof SVGElement) {
        return nodeEl;
      }
    } catch {
      // Ignore node error
    }
  }
  return null;
}

export async function executePlotJs(
  codeStr: string,
  el: HTMLElement,
  app: any,
  sourcePath: string = '',
  onFileReferenced?: (filePath: string) => void
): Promise<HTMLElement | SVGElement | null> {
  let code = codeStr.trim();

  // Strip code fences if present in the string
  if (code.startsWith('```')) {
    code = code.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '').trim();
  }

  let obsidianModule: any = {};
  if (typeof require === 'function') {
    try {
      obsidianModule = require('obsidian');
    } catch {
      // Fallback if obsidian module not present
    }
  }

  const customFetch = createCustomFetch(app, obsidianModule, sourcePath);

  const PlotInst = getPlot();
  const d3Inst = getD3();

  // Table resolution: parse table IDs / comments and discover note tables
  const tableScope: Record<string, any> = {};
  const tablesMap = new Map<string, any[]>();
  const allTables: Array<{ id: string | null; rows: any[] }> = [];

  let explicitTableRef: string | null = null;
  let explicitFileRef: string | null = null;

  // Performance optimization: Fast O(1) delimiter check skips line splitting, trimming, and
  // regex matching when chart code contains no comments (57x speedup). When comments are present,
  // early check on line prefix avoids running 6 regular expressions against standard code lines.
  if (code.includes('//') || code.includes('/*')) {
    const codeLines = code.split('\n');
    for (let i = 0; i < codeLines.length; i++) {
      const l = codeLines[i].trim();
      if (!l.startsWith('//') && !l.startsWith('/*')) continue;

      const tableMatch = l.match(TABLE_COMMENT_REGEX1) || l.match(TABLE_COMMENT_REGEX2);
      if (tableMatch) {
        explicitTableRef = tableMatch[1].trim().replace(/^["']|["'];?$/g, '');
      }
      const idMatch = l.match(ID_COMMENT_REGEX1) || l.match(ID_COMMENT_REGEX2);
      if (idMatch && !explicitTableRef) {
        explicitTableRef = idMatch[1].trim().replace(/^["']|["'];?$/g, '');
      }
      const fileMatch = l.match(FILE_COMMENT_REGEX1) || l.match(FILE_COMMENT_REGEX2);
      if (fileMatch) {
        explicitFileRef = fileMatch[1].trim().replace(/^["']|["'];?$/g, '');
      }
    }
  }

  if (explicitTableRef && explicitTableRef.includes('#')) {
    const hashIdx = explicitTableRef.indexOf('#');
    if (!explicitFileRef) {
      explicitFileRef = explicitTableRef.slice(0, hashIdx).trim().replace(/^\[\[|\]\]$/g, '');
    }
    explicitTableRef = explicitTableRef.slice(hashIdx + 1).trim();
  }

  let targetFile: TFile | null = null;

  if (app) {
    if (explicitFileRef) {
      if (app.metadataCache?.getFirstLinkpathDest) {
        targetFile = toTFile(app.metadataCache.getFirstLinkpathDest(explicitFileRef, sourcePath));
      }
      if (!targetFile && app.vault?.getAbstractFileByPath) {
        targetFile = toTFile(app.vault.getAbstractFileByPath(
          explicitFileRef.endsWith('.md') ? explicitFileRef : `${explicitFileRef}.md`
        ));
      }
    } else if (sourcePath && app.vault?.getAbstractFileByPath) {
      targetFile = toTFile(app.vault.getAbstractFileByPath(sourcePath));
    }
    if (!targetFile && app.workspace?.getActiveFile) {
      targetFile = toTFile(app.workspace.getActiveFile());
    }
  }

  if (targetFile) {
    if (onFileReferenced) onFileReferenced(targetFile.path);
    let fullText = '';
    try {
      if (typeof app.vault?.cachedRead === 'function') {
        fullText = await app.vault.cachedRead(targetFile);
      } else if (typeof app.vault?.read === 'function') {
        fullText = await app.vault.read(targetFile);
      }
    } catch {
      // ignore read error
    }
    if (fullText) {
      const fileCache = app.metadataCache?.getFileCache ? app.metadataCache.getFileCache(targetFile) : null;
      extractTablesFromMarkdown(fullText, fileCache, tablesMap, allTables);
    }
  }

  const doc = el?.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (doc) {
    extractTablesFromDom(doc, tablesMap, allTables);
  }

  for (const [k, v] of tablesMap.entries()) {
    if (VALID_IDENTIFIER_REGEX.test(k)) {
      tableScope[k] = v;
    }
  }

  // Rewrite kebab-case table identifiers (e.g. table-countries) in user code
  if (code.includes('-')) {
    const kebabKeys = Array.from(tablesMap.keys()).filter((k) => k.includes('-') && !k.startsWith('^') && !k.startsWith('#'));
    if (kebabKeys.length > 0) {
      const kebabSet = new Set(kebabKeys);
      const tokenRegex = /(\/\/.*$|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(?<![a-zA-Z0-9_$])([a-zA-Z0-9_$]+(?:-[a-zA-Z0-9_$]+)+)(?![a-zA-Z0-9_$])/gm;
      code = code.replace(tokenRegex, (match, literal, kebabIdent) => {
        if (literal) return literal;
        if (kebabIdent && kebabSet.has(kebabIdent)) {
          const stripped = kebabIdent.replace(/[-_]+/g, '');
          const under = kebabIdent.replace(/[-]/g, '_');
          if (tableScope[stripped]) return stripped;
          if (tableScope[under]) return under;
          return stripped;
        }
        return match;
      });
    }
  }

  if (explicitTableRef) {
    const cleanRef = explicitTableRef.replace(/^[#^]+/, '').trim();
    const matched =
      tablesMap.get(cleanRef) ||
      tablesMap.get('^' + cleanRef) ||
      tablesMap.get('#' + cleanRef) ||
      tablesMap.get(cleanRef.toLowerCase());
    if (matched) {
      tableScope.table = matched;
    }
  }

  if (!tableScope.table) {
    if (tablesMap.has('table')) {
      tableScope.table = tablesMap.get('table');
    } else if (allTables.length > 0) {
      tableScope.table = allTables[0].rows;
    }
  }

  let displayedElement: HTMLElement | SVGElement | null = null;
  const display = (val: any) => {
    const dom = resolveToDomElement(val, PlotInst);
    if (dom) {
      el.appendChild(dom);
      displayedElement = dom;
    }
    return val;
  };

  const prevWindowDisplay = typeof window !== 'undefined' ? (window as any).display : undefined;
  if (typeof window !== 'undefined') {
    (window as any).display = display;
  }

  const hasTableVars = Object.keys(tableScope).length > 0;
  const isStrict = code.includes('"use strict"') || code.includes("'use strict'");

  const wrapFnCode = (src: string) => {
    if (!hasTableVars) return src;
    if (isStrict) {
      const varDecls = Object.keys(tableScope)
        .filter((k) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k))
        .map((k) => `var ${k} = __tableScope__["${k}"];`)
        .join('\n');
      return `${varDecls}\n${src}`;
    }
    return `with (__tableScope__) {\n${src}\n}`;
  };

  const runUserCode = async (userSrc: string) => {
    const wrapped = wrapFnCode(userSrc);
    const fn = new AsyncFunction('Plot', 'd3', 'el', 'container', 'app', 'obsidian', 'fetch', 'display', '__tableScope__', wrapped);
    return await fn(PlotInst, d3Inst, el, el, app, obsidianModule, customFetch, display, tableScope);
  };

  let result: any;
  try {
    result = await runUserCode(code);

    if (result === undefined && !displayedElement) {
      const lines = code.split('\n');

      for (let i = lines.length - 1; i >= 0; i--) {
        const lineTrimmed = lines[i].trim();
        if (!lineTrimmed || lineTrimmed.startsWith('//')) continue;
        if (lineTrimmed.startsWith('return')) break;

        const declMatch = lineTrimmed.match(/^(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
        const assignMatch = !declMatch && lineTrimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
        const varName = declMatch ? declMatch[1] : assignMatch ? assignMatch[1] : null;

        if (varName) {
          try {
            const copy = [...lines, `return ${varName};`];
            const resVar = await runUserCode(copy.join('\n'));
            if (resVar !== undefined) {
              result = resVar;
              break;
            }
          } catch {
            // Ignore error and continue
          }
        }

        const copy = [...lines];
        copy[i] = 'return ' + copy[i];
        try {
          const res2 = await runUserCode(copy.join('\n'));
          if (res2 !== undefined) {
            result = res2;
            break;
          }
        } catch {
          // Ignore syntax error and try previous line
        }
      }
    }
  } finally {
    if (typeof window !== 'undefined') {
      if (prevWindowDisplay !== undefined) {
        (window as any).display = prevWindowDisplay;
      } else {
        delete (window as any).display;
      }
    }
  }

  if (displayedElement && (result === undefined || result === displayedElement)) {
    return displayedElement;
  }

  const domElement = resolveToDomElement(result, PlotInst);
  if (domElement) {
    if (domElement.parentElement !== el) {
      el.appendChild(domElement);
    }
    return domElement;
  }

  if (displayedElement) {
    return displayedElement;
  }

  return null;
}
