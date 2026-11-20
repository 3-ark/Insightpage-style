import type { App, BlockCache, MarkdownPostProcessorContext, TFile } from 'obsidian';
import {
  parseTimelineConfig,
  parseMarkdownTableRows,
  mapRawRowsToTimelineData,
  type ParsedTimelineData,
} from './timelineParser';
import { parseCsvOrTsv } from './tabularDataParser';
import { createCustomFetch, toTFile } from './customFetch';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function resolveTimelineData(
  code: string,
  ctx?: MarkdownPostProcessorContext,
  app?: App
): Promise<ParsedTimelineData> {
  const config = parseTimelineConfig(code);

  if (config.events && config.events.length > 0) {
    return {
      events: config.events,
      categories: config.categories || ['category'],
      activeCategory: config.activeCategory || config.categories?.[0] || 'category',
    };
  }

  let obsidianModule: unknown = null;
  if (typeof require === 'function') {
    try {
      obsidianModule = require('obsidian');
    } catch {
      /* ignore */
    }
  }

  const customFetch = createCustomFetch(app, obsidianModule, ctx?.sourcePath || '');

  let rawRows: Record<string, unknown>[] = [];

  if (config.data) {
    const res = await customFetch(config.data);
    const text = await res.text();

    const trimmedText = text.trim();
    if (trimmedText.startsWith('[') || trimmedText.startsWith('{')) {
      try {
        const json: unknown = JSON.parse(trimmedText);
        rawRows = Array.isArray(json)
          ? json.filter(isRecord)
          : isRecord(json) ? [json] : [];
      } catch {
        rawRows = parseCsvOrTsv(text);
      }
    } else {
      rawRows = parseCsvOrTsv(text);
    }
  } else if (config.id) {
    const rawId = config.id.trim();
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

    let targetFile: TFile | null = null;

    if (app) {
      if (fileRef) {
        if (app.metadataCache.getFirstLinkpathDest) {
          targetFile = app.metadataCache.getFirstLinkpathDest(fileRef, ctx?.sourcePath || '');
        }
        if (!targetFile && app.vault.getAbstractFileByPath) {
          targetFile = toTFile(
            app.vault.getAbstractFileByPath(fileRef.endsWith('.md') ? fileRef : `${fileRef}.md`)
          );
        }
      } else if (app.workspace) {
        targetFile = app.workspace.getActiveFile?.() || null;
        if (ctx?.sourcePath && app.vault.getAbstractFileByPath) {
          targetFile = toTFile(app.vault.getAbstractFileByPath(ctx.sourcePath)) || targetFile;
        }
      }
    }

    if (targetFile && app?.vault?.cachedRead) {
      const fullText = await app.vault.cachedRead(targetFile);

      let blockText: string;
      const fileCache = app.metadataCache.getFileCache(targetFile);

      let pos: BlockCache['position'] | undefined;
      if (fileCache?.blocks) {
        const exactBlock = fileCache.blocks[cleanId] ?? fileCache.blocks[caretId];
        if (exactBlock) {
          pos = exactBlock.position;
        } else {
          const cleanLower = cleanId.toLowerCase();
          for (const k of Object.keys(fileCache.blocks)) {
            if (k.toLowerCase() === cleanLower) {
              pos = fileCache.blocks[k].position;
              break;
            }
          }
        }
      }

      if (pos) {
        blockText = fullText.substring(pos.start.offset, pos.end.offset);
      } else {
        const lines = fullText.split(/\r?\n/);
        const blockIdx = lines.findIndex((line) => line.trim() === caretId || line.trim() === `^${cleanId}`);
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
      throw new Error(`Referenced block ID '${config.id}' not found in ${targetFile?.path ?? 'vault'}`);
    }
  }

  if (rawRows.length === 0) {
    throw new Error('Unable to resolve timeline dataset');
  }

  return mapRawRowsToTimelineData(rawRows, config.schemas);
}
