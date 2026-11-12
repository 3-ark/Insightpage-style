import { MarkdownRenderChild, type TFile } from 'obsidian';
import { renderError } from 'src/util';
import {
  generateTableData,
  rowsToTableData,
  coerceTableRow,
} from 'src/chartFromTable';
import { parseMarkdownTableRows, parseCsvOrTsv } from './timelineParser';
import { toTFile, createCustomFetch } from './customFetch';
import type Renderer from '../chartRenderer';

export class PlotJsRenderChild extends MarkdownRenderChild {
  code: string;
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

  async onload() {
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
      this.changeHandler as any
    );
    this.renderer.plugin.app?.workspace?.on?.('css-change', this.reload);
  }

  changeHandler = (file?: TFile) => {
    if (!file) return;
    if (
      this.referencedFiles.has(file.path) ||
      this.referencedFiles.has(file.basename) ||
      file.path === this.ownPath
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
      this.changeHandler as any
    );
    this.renderer.plugin.app?.workspace?.off?.('css-change', this.reload);
    if (typeof (this.containerEl as any).empty === 'function') {
      (this.containerEl as any).empty();
    } else if (typeof this.containerEl.replaceChildren === 'function') {
      this.containerEl.replaceChildren();
    } else {
      this.containerEl.textContent = '';
    }
    this.chartEl = null;
  }
}

export class ChartRenderChild extends MarkdownRenderChild {
  data: any;
  chartEl: HTMLElement | SVGElement | null = null;
  renderer: Renderer;
  prep: any = null;
  ownPath: string;
  el: HTMLElement;
  referencedFiles: Set<string> = new Set();

  constructor(
    data: any,
    el: HTMLElement,
    renderer: Renderer,
    ownPath: string
  ) {
    super(el);
    this.el = el;
    this.data = data;
    this.renderer = renderer;
    this.ownPath = ownPath;
    this.changeHandler = this.changeHandler.bind(this);
    this.reload = this.reload.bind(this);
  }

  async onload() {
    try {
      const isExternalData = typeof this.data.data === 'string' && this.data.data.trim() !== '';

      if (isExternalData) {
        let obsidianModule: any = null;
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

        let rawRows: Record<string, any>[] = [];
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          try {
            const parsedJson = JSON.parse(trimmed);
            rawRows = Array.isArray(parsedJson) ? parsedJson : [parsedJson];
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
        const tableData = rowsToTableData(tableRows, this.data.layout ?? 'columns', this.data.select);

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
      } else if (this.data.id) {
        let activeFile = this.renderer.plugin.app?.workspace?.getActiveFile() ?? null;
        let activePath = activeFile ? activeFile.path : '';
        let linkDest: TFile | null = this.data.file
          ? toTFile(
              this.renderer.plugin.app?.metadataCache?.getFirstLinkpathDest(
                this.data.file,
                activePath
              )
            )
          : null;
        const fileToRead = toTFile(
          this.data.file
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

        let pos: any = undefined;

        if (fileCache?.blocks) {
          const exactBlock = fileCache.blocks[cleanId] ?? fileCache.blocks[caretId];
          if (exactBlock) {
            pos = exactBlock.position;
          } else {
            const cleanLower = cleanId.toLowerCase();
            const strippedLower = cleanLower.replace(/[-_]+/g, '');
            for (const k in fileCache.blocks) {
              const kLower = k.toLowerCase().replace(/^\^/, '');
              if (kLower === cleanLower || kLower.replace(/[-_]+/g, '') === strippedLower) {
                pos = fileCache.blocks[k]?.position;
                break;
              }
            }
          }
        }

        if (!pos && fileCache?.sections) {
          const cleanLower = cleanId.toLowerCase();
          const strippedLower = cleanLower.replace(/[-_]+/g, '');
          const sec = fileCache.sections.find(
            (pre: any) => {
              if (!pre.id) return false;
              const pId = String(pre.id).replace(/^\^/, '').toLowerCase();
              return (
                pId === cleanLower ||
                pId.replace(/[-_]+/g, '') === strippedLower ||
                pre.id === cleanId ||
                pre.id === caretId ||
                pre.id === this.data.id
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
            this.data.layout ?? 'columns',
            this.data.select
          );
        } catch {
          throw new Error('There is no table at that id and/or file');
        }

        let tableRows: any[] = [];
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
        this.changeHandler as any
      );
    }
    this.renderer.plugin.app?.workspace?.on?.('css-change', this.reload);
  }

  changeHandler = (file?: TFile) => {
    if (!file) return;
    const isTargetFile =
      (this.data.file && (file.basename === this.data.file || file.name === this.data.file)) ||
      file.path === this.ownPath ||
      this.referencedFiles.has(file.path) ||
      this.referencedFiles.has(file.basename) ||
      this.referencedFiles.has(file.name);

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
      this.changeHandler as any
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
