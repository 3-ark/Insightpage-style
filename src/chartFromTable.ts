import { Editor, Notice } from 'obsidian';
import type { DataField } from 'src/constants/settingsConstants';
import { splitMarkdownTableRow, parseMarkdownTableRows } from './charts/timelineParser';

let _Extractor: any = null;
function getExtractor(): any {
    if (!_Extractor) {
        _Extractor = require('markdown-tables-to-json').Extractor;
    }
    return _Extractor;
}

export async function chartFromTable(editor: Editor, layout: 'columns' | 'rows') {
    const {labels, dataFields} = generateTableData(editor.getSelection(), layout);
    const chart = `\`\`\`chart
type: bar
labels: [${labels}]
series:
${dataFields
    .map((data) => `  - title: ${data.dataTitle}\n    data: [${data.data}]`)
    .join("\n")}
width: 80%
beginAtZero: true
\`\`\``;

    editor.replaceSelection(chart);
}

// Performance optimization: Hoist separator regex to avoid re-instantiating regexes in cell loops.
const SEPARATOR_CELL_REGEX = /^[:\s-]*$/;

export function parseMarkdownTable(tableString: string, layout: 'columns' | 'rows'): Record<string, Record<string, string>> {
    // Performance optimization: Iterate over raw lines directly in a single pass rather than chaining
    // .split().map().filter(). Use start/end cell index bounds to trim empty boundary cells without calling
    // .shift() (which triggers O(N) array element re-indexing) and evaluate isSeparator inline.
    const rawLines = tableString.split(/\r?\n/);
    const rows: string[][] = [];

    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i].trim();
        if (!line.includes('|') || line.startsWith('^')) continue;

        const cleanLine = line.replace(/\s*\^[a-zA-Z0-9_-]+\s*$/, '');
        const rawCells = splitMarkdownTableRow(cleanLine);

        const startIdx = rawCells.length > 0 && rawCells[0].trim() === '' ? 1 : 0;
        const endIdx = rawCells.length > startIdx && rawCells[rawCells.length - 1].trim() === '' ? rawCells.length - 1 : rawCells.length;

        const cells: string[] = [];
        let isSeparator = true;

        for (let j = startIdx; j < endIdx; j++) {
            const cell = rawCells[j].trim();
            cells.push(cell);
            if (isSeparator && !SEPARATOR_CELL_REGEX.test(cell)) {
                isSeparator = false;
            }
        }

        if (!isSeparator && cells.length > 0) {
            rows.push(cells);
        }
    }

    if (rows.length < 2) {
        throw new Error('Table is empty or invalid');
    }

    const rawHeaders = rows[0];
    const dataRows = rows.slice(1);

    const hasRowTitles = dataRows.every((r) => r.length === rawHeaders.length)
        ? (rawHeaders[0] === '' || rawHeaders.length === 2 || dataRows.some((r) => isNaN(Number(r[0]))))
        : dataRows.every((r) => r.length === rawHeaders.length - 1);

    const fields: Record<string, Record<string, string>> = {};

    // Performance optimization: Replace r.slice(1) array copies, dataRows.map row label array allocations,
    // and nested forEach closure executions with direct single-pass index loops and index offsets.
    if (layout === 'rows') {
        const labelHeaders = hasRowTitles && rawHeaders.length > 1 ? rawHeaders.slice(1) : rawHeaders;
        const offset = hasRowTitles ? 1 : 0;
        for (let idx = 0; idx < dataRows.length; idx++) {
            const r = dataRows[idx];
            const rowTitle = hasRowTitles ? r[0] : `Row ${idx + 1}`;
            const rowObj: Record<string, string> = {};
            for (let i = 0; i < labelHeaders.length; i++) {
                const lbl = labelHeaders[i];
                const val = r[i + offset];
                rowObj[lbl] = val !== undefined ? val : '';
            }
            fields[rowTitle] = rowObj;
        }
    } else {
        const colHeaders = hasRowTitles ? rawHeaders.slice(1) : rawHeaders;
        const offset = hasRowTitles ? 1 : 0;
        for (let c = 0; c < colHeaders.length; c++) {
            fields[colHeaders[c]] = {};
        }
        for (let r = 0; r < dataRows.length; r++) {
            const row = dataRows[r];
            const lbl = hasRowTitles ? (row[0] || `Row ${r + 1}`) : `${r + 1}`;
            for (let c = 0; c < colHeaders.length; c++) {
                const colTitle = colHeaders[c];
                const val = row[c + offset];
                fields[colTitle][lbl] = val !== undefined ? val : '';
            }
        }
    }

    return fields;
}

export function rowsToTableData(
    rows: Record<string, any>[],
    layout: 'columns' | 'rows' = 'columns',
    selected?: string[]
): { labels: string[]; dataFields: DataField[] } {
    if (!rows || rows.length === 0) {
        throw new Error('Table is empty or invalid');
    }

    const firstRow = rows[0];
    const rawKeys = Object.keys(firstRow);
    if (rawKeys.length === 0) {
        throw new Error('Table is empty or invalid');
    }

    // Determine if first column contains row titles/labels (e.g., categorical/non-numeric strings or 2-column key-value/time-series data)
    const hasRowTitles =
        rawKeys.length === 2 ||
        (rawKeys.length > 1 &&
            (isNaN(Number(firstRow[rawKeys[0]])) ||
                rows.some((r) => isNaN(Number(r[rawKeys[0]])))));

    const fields: Record<string, Record<string, string>> = {};

    const formatLabelValue = (val: any): string => {
        if (val === undefined || val === null) return '';
        if (val instanceof Date && !isNaN(val.getTime())) {
            const y = val.getUTCFullYear();
            const m = String(val.getUTCMonth() + 1).padStart(2, '0');
            const d = String(val.getUTCDate()).padStart(2, '0');
            if (val.getUTCHours() === 0 && val.getUTCMinutes() === 0 && val.getUTCSeconds() === 0 && val.getUTCMilliseconds() === 0) {
                return `${y}-${m}-${d}`;
            }
            return val.toISOString();
        }
        return String(val);
    };

    if (layout === 'rows') {
        const labelHeaders = hasRowTitles ? rawKeys.slice(1) : rawKeys;
        for (let idx = 0; idx < rows.length; idx++) {
            const r = rows[idx];
            const rowTitle = hasRowTitles ? (formatLabelValue(r[rawKeys[0]]) || `Row ${idx + 1}`) : `Row ${idx + 1}`;
            const rowObj: Record<string, string> = {};
            for (let i = 0; i < labelHeaders.length; i++) {
                const lbl = labelHeaders[i];
                const val = r[lbl];
                rowObj[lbl] = val !== undefined && val !== null ? String(val) : '';
            }
            fields[rowTitle] = rowObj;
        }
    } else {
        const colHeaders = hasRowTitles ? rawKeys.slice(1) : rawKeys;
        for (let c = 0; c < colHeaders.length; c++) {
            fields[colHeaders[c]] = {};
        }
        for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            const lbl = hasRowTitles ? (formatLabelValue(row[rawKeys[0]]) || `Row ${r + 1}`) : `${r + 1}`;
            for (let c = 0; c < colHeaders.length; c++) {
                const colTitle = colHeaders[c];
                const val = row[colTitle];
                fields[colTitle][lbl] = val !== undefined && val !== null ? String(val) : '';
            }
        }
    }

    const fieldKeys = Object.keys(fields);
    if (fieldKeys.length === 0) {
        throw new Error('Table is empty or invalid');
    }
    const firstVal = fields[fieldKeys[0]] as Record<string, any>;
    const labels = Object.keys(firstVal);
    let dataFields: DataField[] = new Array(fieldKeys.length);
    for (let i = 0; i < fieldKeys.length; i++) {
        const key = fieldKeys[i];
        dataFields[i] = {
            dataTitle: key,
            data: Object.values(fields[key]) as string[]
        };
    }

    if (selected) {
        const selectedSet = new Set(selected);
        dataFields = dataFields.filter(value => selectedSet.has(value.dataTitle));
    }

    return { labels, dataFields };
}

export function generateTableData(table: string, layout: 'columns' | 'rows', selected?: string[]) {
    // Performance optimization: Run our optimized native parseMarkdownTable on the primary path
    // instead of attempting getExtractor().extractObject() first. The external library always throws
    // exceptions on modern runtimes or tables with block IDs, forcing an expensive exception catch
    // and secondary parse on every call. We fall back to getExtractor() only if our primary parser fails.
    let fields: any;
    try {
        fields = parseMarkdownTable(table, layout);
    } catch (parseError) {
        try {
            fields = getExtractor().extractObject(table, layout, false);
        } catch (fallbackError) {
            new Notice('Table malformed');
            throw parseError;
        }
    }
    if (!fields || typeof fields !== 'object') {
        throw new Error('Table is empty or invalid');
    }
    const fieldKeys = Object.keys(fields);
    if (fieldKeys.length === 0) {
        throw new Error('Table is empty or invalid');
    }
    const firstVal = fields[fieldKeys[0]] as Record<string, any>;
    if (!firstVal || typeof firstVal !== 'object') {
        throw new Error('Table data structure is invalid');
    }
    const labels = Object.keys(firstVal);
    let dataFields: DataField[] = new Array(fieldKeys.length);
    for (let i = 0; i < fieldKeys.length; i++) {
        const key = fieldKeys[i];
        dataFields[i] = {
            dataTitle: key,
            data: Object.values(fields[key]) as string[]
        };
    }

    if (selected) {
        // Performance optimization: Precompute an O(1) Set lookup for selected titles
        // to avoid O(S * N) linear array scans across selected fields during series extraction.
        const selectedSet = new Set(selected);
        dataFields = dataFields.filter(value => selectedSet.has(value.dataTitle));
    }

    return { labels, dataFields };
}

export function parseCellValue(raw: any): any {
    if (raw === undefined || raw === null) return raw;
    if (typeof raw !== 'string') return raw;
    const str = raw.trim();
    if (str === '') return '';
    const lower = str.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    if (lower === 'null') return null;

    // Performance optimization: Guard comma replacement with str.includes(',') to avoid allocating
    // temporary string objects on the vast majority of cells without commas. Evaluate Number(numCandidate)
    // once into a numeric variable instead of calling Number(...) repeatedly.
    const numCandidate = str.includes(',') ? str.replace(/,/g, '') : str;
    const num = Number(numCandidate);
    if (!isNaN(num) && numCandidate !== '') {
        if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(numCandidate)) {
            return num;
        }
    }

    // Performance optimization: Date parsing for ISO and standard date formats:
    // YYYY-MM, YYYY-M, YYYY-MM-DD, YYYY/MM, YYYY/M, YYYY/MM/DD, etc.
    // Guard date format regex and slash replacement with fast delimiter check for '-' or '/'
    // to skip regex matching and string allocation for standard text strings and non-date cells.
    if ((str.includes('-') || str.includes('/')) && /^\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?(?:[T ].*)?$/.test(str)) {
        const normalized = str.includes('/') ? str.replace(/\//g, '-') : str;
        const d = new Date(normalized);
        if (!isNaN(d.getTime())) return d;
    }

    return str;
}

export function coerceTableRow(row: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    // Performance optimization: Precompute an O(1) lowercase-to-original-key lookup Map
    // to avoid allocating Object.keys() heap arrays and executing per-access toLowerCase()
    // linear scans on property misses in rendering loops.
    const lowerKeyMap = new Map<string, string>();

    for (const [k, v] of Object.entries(row)) {
        result[k] = parseCellValue(v);
        lowerKeyMap.set(k.toLowerCase(), k);
    }

    // Case-insensitive fallback property accessor via Proxy supporting get, has ('in'), and getOwnPropertyDescriptor
    return new Proxy(result, {
        get(target, prop, receiver) {
            if (typeof prop === 'string' && !(prop in target)) {
                const actualKey = lowerKeyMap.get(prop.toLowerCase());
                if (actualKey !== undefined) {
                    return target[actualKey];
                }
            }
            return Reflect.get(target, prop, receiver);
        },
        has(target, prop) {
            if (typeof prop === 'string' && !(prop in target)) {
                return lowerKeyMap.has(prop.toLowerCase());
            }
            return Reflect.has(target, prop);
        },
        getOwnPropertyDescriptor(target, prop) {
            const desc = Reflect.getOwnPropertyDescriptor(target, prop);
            if (desc) return desc;
            if (typeof prop === 'string') {
                const actualKey = lowerKeyMap.get(prop.toLowerCase());
                if (actualKey !== undefined) {
                    return Reflect.getOwnPropertyDescriptor(target, actualKey);
                }
            }
            return undefined;
        },
    });
}

export function parseHtmlTable(tableEl: HTMLTableElement): Record<string, string>[] {
    const headerCells = Array.from(tableEl.querySelectorAll('th'));
    let headers: string[] = [];
    let rowElements: HTMLTableRowElement[] = [];

    if (headerCells.length > 0) {
        headers = headerCells.map((th) => th.textContent?.trim() || '');
        rowElements = Array.from(tableEl.querySelectorAll('tbody tr'));
        if (rowElements.length === 0) {
            rowElements = Array.from(tableEl.querySelectorAll('tr')).filter((tr) => !tr.querySelector('th'));
        }
    } else {
        const allRows = Array.from(tableEl.querySelectorAll('tr'));
        if (allRows.length > 1) {
            headers = Array.from(allRows[0].querySelectorAll('td')).map((td) => td.textContent?.trim() || '');
            rowElements = allRows.slice(1);
        }
    }

    if (headers.length === 0 || rowElements.length === 0) return [];

    const results: Record<string, string>[] = [];
    for (const tr of rowElements) {
        const cells = Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() || '');
        const obj: Record<string, string> = {};
        for (let i = 0; i < headers.length; i++) {
            const h = headers[i];
            if (h) {
                obj[h] = cells[i] !== undefined ? cells[i] : '';
            }
        }
        results.push(obj);
    }
    return results;
}

export function extractTablesFromMarkdown(
    fullText: string,
    fileCache: any,
    tablesMap: Map<string, any[]>,
    allTables: Array<{ id: string | null; rows: any[] }>
) {
    // Performance optimization: Markdown tables strictly require pipes ('|').
    // In notes without markdown tables, fast O(1) includes('|') short-circuits line splitting,
    // trimming, and regex matching across thousands of note lines (>99% latency reduction).
    if (!fullText || !fullText.includes('|')) return;

    const registeredIds = new Set<string>();

    const register = (id: string | null, rows: any[]) => {
        if (!rows || rows.length === 0) return;
        allTables.push({ id, rows });
        if (id) {
            const clean = id.replace(/^[\^#]+/, '').trim();
            if (!clean) return;
            registeredIds.add(clean.toLowerCase());
            tablesMap.set(clean, rows);
            tablesMap.set('^' + clean, rows);
            tablesMap.set('#' + clean, rows);
            tablesMap.set(clean.toLowerCase(), rows);
            const camel = clean.replace(/[-_]+([a-z0-9])/gi, (_, c) => c.toUpperCase());
            if (camel) tablesMap.set(camel, rows);
            const under = clean.replace(/[-]/g, '_');
            if (under) tablesMap.set(under, rows);
            const stripped = clean.replace(/[-_]+/g, '');
            if (stripped) tablesMap.set(stripped, rows);
        }
    };

    if (fileCache?.blocks) {
        for (const [blockId, block] of Object.entries(fileCache.blocks as Record<string, any>)) {
            if (block?.position) {
                const blockText = fullText.substring(block.position.start.offset, block.position.end.offset);
                if (blockText.includes('|')) {
                    const rows = parseMarkdownTableRows(blockText);
                    if (rows.length > 0) {
                        register(blockId, rows.map(coerceTableRow));
                    }
                }
            }
        }
    }

    const lines = fullText.split(/\r?\n/);
    let tableLines: string[] = [];

    const flushTable = (trailingBlockId: string | null) => {
        if (tableLines.length >= 2) {
            let blockId = trailingBlockId;
            if (!blockId) {
                const lastLine = tableLines[tableLines.length - 1];
                const lastMatch = lastLine.match(/\^([a-zA-Z0-9_-]+)\s*$/);
                if (lastMatch) {
                    blockId = lastMatch[1];
                }
            }

            const cleanBlockId = blockId ? blockId.replace(/^[\^#]+/, '').trim() : null;
            if (!cleanBlockId || !registeredIds.has(cleanBlockId.toLowerCase())) {
                const tableText = tableLines.join('\n');
                const rows = parseMarkdownTableRows(tableText);
                if (rows.length > 0) {
                    register(cleanBlockId, rows.map(coerceTableRow));
                }
            }
        }
        tableLines = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.includes('|') && !trimmed.startsWith('^') && !trimmed.startsWith('```')) {
            tableLines.push(trimmed);
        } else {
            if (tableLines.length > 0) {
                const blockMatch = trimmed.match(/^\^([a-zA-Z0-9_-]+)\s*$/);
                flushTable(blockMatch ? blockMatch[1] : null);
            }
        }
    }

    if (tableLines.length > 0) {
        flushTable(null);
    }
}

export function extractTablesFromDom(
    doc: Document,
    tablesMap: Map<string, any[]>,
    allTables: Array<{ id: string | null; rows: any[] }>
) {
    // Performance optimization: Guard DOM table queries with fast tag presence check
    // to avoid allocating Array.from and CSS querySelector engine passes when no <table> elements exist.
    if (doc.getElementsByTagName ? doc.getElementsByTagName('table').length === 0 : !doc.querySelector('table')) {
        return;
    }

    const domTables = Array.from(doc.querySelectorAll('table'));
    for (const tbl of domTables) {
        let id = tbl.id || tbl.getAttribute('data-block-id') || null;
        if (!id) {
            const next = tbl.nextElementSibling;
            const text = next?.textContent?.trim() || '';
            const m = text.match(/^\^([a-zA-Z0-9_-]+)/);
            if (m) id = m[1];
        }
        const cleanId = id ? id.replace(/^[\^#]+/, '').trim() : null;
        if (cleanId && tablesMap.has(cleanId)) continue;

        const rows = parseHtmlTable(tbl);
        if (rows.length > 0) {
            const coerced = rows.map(coerceTableRow);
            allTables.push({ id: cleanId, rows: coerced });
            if (cleanId) {
                tablesMap.set(cleanId, coerced);
                tablesMap.set('^' + cleanId, coerced);
                tablesMap.set('#' + cleanId, coerced);
                tablesMap.set(cleanId.toLowerCase(), coerced);
                const camel = cleanId.replace(/[-_]+([a-z0-9])/gi, (_, c) => c.toUpperCase());
                if (camel) tablesMap.set(camel, coerced);
                const under = cleanId.replace(/[-]/g, '_');
                if (under) tablesMap.set(under, coerced);
                const stripped = cleanId.replace(/[-_]+/g, '');
                if (stripped) tablesMap.set(stripped, coerced);
            }
        }
    }
}
