import { MarkdownRenderChild, type TFile } from 'obsidian';
import { renderError } from 'src/util';
import {
  generateTableData,
  rowsToTableData,
  coerceTableRow,
} from 'src/chartFromTable';
import { parseMarkdownTableRows } from './timelineParser';
import { parseCsvOrTsv } from './tabularDataParser';
import { toTFile, createCustomFetch } from './customFetch';
import type Renderer from '../chartRenderer';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toLayout(value: unknown): 'columns' | 'rows' {
  return value === 'rows' ? 'rows' : 'columns';
}

function toStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : undefined;
}

interface TablePosition {
  start: { offset: number };
  end: { offset: number };
}

export class PlotJsRenderChild extends MarkdownRenderChild {
  code: string;
  loadPromise: Promise<void> = Promise.resolve();
  chartEl: HTMLElement | SVGElement | null = null;
  renderer: Renderer;
  ownPath: string;
  referencedFiles: Set<string> = new Set();

  constructor(
    code: string,
    el: HTMLElement,
    renderer: Renderer,
    ownPath: string
  ) {
    super(el);
    this.code = code;
    this.renderer = renderer;
    this.ownPath = ownPath;
    this.changeHandler = this.changeHandler.bind(this);
    this.reload = this.reload.bind(this);
  }

  onload() {
    this.loadPromise = this.loadAsync();
  }

  private async loadAsync() {
    try {
      this.chartEl = await this.renderer.renderRaw(
        this.code,
        this.containerEl,
        this.ownPath,
        (filePath: string) => {
          this.referencedFiles.add(filePath);
        }
      );
    } catch (error) {
      renderError(error, this.containerEl);
    }

    this.renderer.plugin.app?.metadataCache?.on?.(
      'changed',
      this.changeHandler
    );
    this.renderer.plugin.app?.workspace?.on?.('css-change', this.reload);
  }

  changeHandler = (...data: unknown[]) => {
    const file = data[0];
    if (!isRecord(file)) return;
    const path = typeof file.path === 'string' ? file.path : '';
    const basename = typeof file.basename === 'string' ? file.basename : '';
    if (
      this.referencedFiles.has(path) ||
      this.referencedFiles.has(basename) ||
      path === this.ownPath
    ) {
      this.reload();
    }
  };

  reload = () => {
    this.onunload();
    void this.onload();
  };

  onunload() {
    this.renderer.plugin.app?.metadataCache?.off?.(
      'changed',
      this.changeHandler
    );
    this.renderer.plugin.app?.workspace?.off?.('css-change', this.reload);
    if (typeof this.containerEl.empty === 'function') {
      this.containerEl.empty();
    } else if (typeof this.containerEl.replaceChildren === 'function') {
      this.containerEl.replaceChildren();
    } else {
      this.containerEl.textContent = '';
    }
    this.chartEl = null;
  }
}

export class ChartRenderChild extends MarkdownRenderChild {
  data: Record<string, unknown>;
  loadPromise: Promise<void> = Promise.resolve();
  chartEl: HTMLElement | SVGElement | null = null;
  renderer: Renderer;
  prep: unknown = null;
  ownPath: string;
  el: HTMLElement;
  referencedFiles: Set<string> = new Set();

  constructor(
    data: unknown,
    el: HTMLElement,
    renderer: Renderer,
    ownPath: string
  ) {
    super(el);
    this.el = el;
    this.data = isRecord(data) ? data : {};
    this.renderer = renderer;
    this.ownPath = ownPath;
    this.changeHandler = this.changeHandler.bind(this);
    this.reload = this.reload.bind(this);
  }

  onload() {
    this.loadPromise = this.loadAsync();
  }

  private async loadAsync() {
    try {
      const isExternalData = typeof this.data.data === 'string' && this.data.data.trim() !== '';

      if (isExternalData) {
        let obsidianModule: unknown = null;
        if (typeof require === 'function') {
          try {
            obsidianModule = require('obsidian');
          } catch {
            /* ignore */
          }
        }

        const app = this.renderer.plugin.app;
        const customFetch = createCustomFetch(app, obsidianModule, this.ownPath);

        const rawDataPath = String(this.data.data).trim().replace(/^[["'`\s]+|[\]"'`\s]+$/g, '');
        const cleanPath = rawDataPath.replace(/\\/g, '/').replace(/^\.?\//, '');
        this.referencedFiles.add(cleanPath);
        if (cleanPath.endsWith('.csv') || cleanPath.endsWith('.tsv') || cleanPath.endsWith('.json')) {
          const baseName = cleanPath.substring(cleanPath.lastIndexOf('/') + 1);
          this.referencedFiles.add(baseName);
          const noExt = baseName.replace(/\.[^/.]+$/, '');
          this.referencedFiles.add(noExt);
        }

        const res = await customFetch(cleanPath);
        const text = await res.text();
        const trimmed = text.trim();

        let rawRows: Record<string, unknown>[] = [];
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          try {
            const parsedJson: unknown = JSON.parse(trimmed) as unknown;
            rawRows = Array.isArray(parsedJson)
              ? parsedJson.filter(isRecord)
              : isRecord(parsedJson) ? [parsedJson] : [];
          } catch {
            rawRows = parseCsvOrTsv(text);
          }
        } else {
          rawRows = parseCsvOrTsv(text);
        }

        if (rawRows.length === 0) {
          throw new Error(`External data at '${rawDataPath}' is empty or invalid`);
        }

        const tableRows = rawRows.map(coerceTableRow);
        const tableData = rowsToTableData(
          tableRows,
          toLayout(this.data.layout),
          toStringArray(this.data.select)
        );

        const mergedYaml = {
          ...this.data,
          labels: this.data.labels ?? tableData.labels,
          tableRows,
          series: this.data.series ?? tableData.dataFields.map((df) => ({
            title: df.dataTitle,
            data: df.data,
          })),
        };

        this.data = mergedYaml;
        const updatedPrep = await this.renderer.datasetPrep(mergedYaml, this.el);
        this.chartEl = await this.renderer.renderRaw(updatedPrep, this.containerEl, this.ownPath);
      } else if (typeof this.data.id === 'string' && this.data.id) {
        const activeFile = this.renderer.plugin.app?.workspace?.getActiveFile() ?? null;
        const activePath = activeFile ? activeFile.path : '';
        const dataFile = typeof this.data.file === 'string' ? this.data.file : undefined;
        const linkDest: TFile | null = dataFile
          ? toTFile(
              this.renderer.plugin.app?.metadataCache?.getFirstLinkpathDest(
                dataFile,
                activePath
              )
            )
          : null;
        const fileToRead = toTFile(
          dataFile
            ? linkDest
            : this.renderer.plugin.app?.vault?.getAbstractFileByPath(
                this.ownPath
              ) ?? activeFile
        );

        if (!fileToRead) {
          throw new Error('Invalid id and/or file');
        }

        const fileCache =
          fileToRead ? (this.renderer.plugin.app?.metadataCache?.getFileCache(fileToRead) ?? null) : null;

        const cleanId = String(this.data.id).replace(/^\^/, '');
        const caretId = '^' + cleanId;

        let pos: TablePosition | undefined;

        if (fileCache?.blocks) {
          const blocks = fileCache.blocks as Record<string, { position: TablePosition }>;
          const exactBlock = blocks[cleanId] ?? blocks[caretId];
          if (exactBlock) {
            pos = exactBlock.position;
          } else {
            const cleanLower = cleanId.toLowerCase();
            const strippedLower = cleanLower.replace(/[-_]+/g, '');
            for (const k in blocks) {
              const kLower = k.toLowerCase().replace(/^\^/, '');
              if (kLower === cleanLower || kLower.replace(/[-_]+/g, '') === strippedLower) {
                pos = blocks[k]?.position;
                break;
              }
            }
          }
        }

        if (!pos && fileCache?.sections) {
          const cleanLower = cleanId.toLowerCase();
          const strippedLower = cleanLower.replace(/[-_]+/g, '');
          const sections = fileCache.sections as Array<{ id?: unknown; position: TablePosition }>;
          const sec = sections.find(
            (pre) => {
              if (pre.id === undefined) return false;
              const rawId = typeof pre.id === 'string' || typeof pre.id === 'number'
                ? String(pre.id)
                : '';
              const pId = rawId.replace(/^\^/, '').toLowerCase();
              return (
                pId === cleanLower ||
                pId.replace(/[-_]+/g, '') === strippedLower ||
                rawId === cleanId ||
                rawId === caretId ||
                rawId === String(this.data.id)
              );
            }
          );
          if (sec) {
            pos = sec.position;
          }
        }

        const fullNoteText = await this.renderer.plugin.app.vault.cachedRead(fileToRead);
        let tableString = '';

        if (pos && pos.start && pos.end) {
          tableString = fullNoteText.substring(pos.start.offset, pos.end.offset);
        } else {
          // Fallback: search note text lines for matching block ID tag (^cleanId or inline)
          const lines = fullNoteText.split(/\r?\n/);
          const cleanLower = cleanId.toLowerCase();
          const strippedLower = cleanLower.replace(/[-_]+/g, '');

          let blockLineIdx = -1;
          for (let i = 0; i < lines.length; i++) {
            const l = lines[i].trim();
            const caretMatch = l.match(/\^([a-zA-Z0-9_-]+)\s*$/);
            if (caretMatch) {
              const matchedId = caretMatch[1].toLowerCase();
              if (matchedId === cleanLower || matchedId.replace(/[-_]+/g, '') === strippedLower) {
                blockLineIdx = i;
                break;
              }
            }
          }

          if (blockLineIdx >= 0) {
            let startIdx = blockLineIdx;
            if (lines[blockLineIdx].trim().startsWith('^')) {
              startIdx = blockLineIdx - 1;
            }
            while (startIdx >= 0 && lines[startIdx].trim().includes('|')) {
              startIdx--;
            }
            tableString = lines.slice(startIdx + 1, blockLineIdx + 1).join('\n');
          }
        }

        if (!tableString || !tableString.includes('|')) {
          throw new Error('Invalid id and/or file');
        }

        let tableData;
        try {
          tableData = generateTableData(
            tableString,
            toLayout(this.data.layout),
            toStringArray(this.data.select)
          );
        } catch {
          throw new Error('There is no table at that id and/or file');
        }

        let tableRows: Record<string, unknown>[] = [];
        try {
          const rawRows = parseMarkdownTableRows(tableString);
          if (rawRows.length > 0) {
            tableRows = rawRows.map(coerceTableRow);
          }
        } catch {
          // ignore row extraction errors and fallback to series/labels
        }

        const mergedYaml = {
          ...this.data,
          labels: tableData.labels,
          tableRows,
          series: tableData.dataFields.map((df) => ({
            title: df.dataTitle,
            data: df.data,
          })),
        };

        const updatedPrep = await this.renderer.datasetPrep(mergedYaml, this.el);
        this.prep = updatedPrep;
        this.chartEl = await this.renderer.renderRaw(updatedPrep, this.containerEl, this.ownPath);
      } else {
        const preparedData = await this.renderer.datasetPrep(this.data, this.el);
        this.prep = preparedData;
        this.chartEl = await this.renderer.renderRaw(preparedData, this.containerEl, this.ownPath);
      }
    } catch (error) {
      renderError(error, this.el);
    }

    if (this.data.id || (typeof this.data.data === 'string' && this.data.data.trim() !== '')) {
      this.renderer.plugin.app?.metadataCache?.on?.(
        'changed',
        this.changeHandler
      );
    }
    this.renderer.plugin.app?.workspace?.on?.('css-change', this.reload);
  }

  changeHandler = (...data: unknown[]) => {
    const file = data[0];
    if (!isRecord(file)) return;
    const path = typeof file.path === 'string' ? file.path : '';
    const basename = typeof file.basename === 'string' ? file.basename : '';
    const name = typeof file.name === 'string' ? file.name : '';
    const isTargetFile =
      (this.data.file && (basename === this.data.file || name === this.data.file)) ||
      path === this.ownPath ||
      this.referencedFiles.has(path) ||
      this.referencedFiles.has(basename) ||
      this.referencedFiles.has(name);

    if (isTargetFile) {
      this.reload();
    }
  };

  reload = () => {
    this.onunload();
    void this.onload();
  };

  onunload() {
    this.renderer.plugin.app?.metadataCache?.off?.(
      'changed',
      this.changeHandler
    );
    this.renderer.plugin.app?.workspace?.off?.('css-change', this.reload);
    if (typeof this.el.empty === 'function') {
      this.el.empty();
    } else if (typeof this.el.replaceChildren === 'function') {
      this.el.replaceChildren();
    } else {
      this.el.textContent = '';
    }
    this.chartEl = null;
  }
}
