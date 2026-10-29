import { Editor, Notice } from 'obsidian';
import type { DataField } from 'src/constants/settingsConstants';
import { splitMarkdownTableRow } from './charts/timelineParser';

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

        const cleanLine = line.replace(/\s*\^\w+\s*$/, '');
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
        ? (rawHeaders[0] === '' || dataRows.some((r) => isNaN(Number(r[0]))))
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

export function generateTableData(table: string, layout: 'columns' | 'rows', selected?: string[]) {
    let fields: any;
    try {
        fields = getExtractor().extractObject(table, layout, false);
    } catch (error) {
        try {
            fields = parseMarkdownTable(table, layout);
        } catch (fallbackError) {
            new Notice('Table malformed');
            throw error;
        }
    }
    if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
        try {
            fields = parseMarkdownTable(table, layout);
        } catch (e) {
            throw new Error('Table is empty or invalid');
        }
    }
    const firstVal = Object.values(fields)[0] as Record<string, any>;
    if (!firstVal || typeof firstVal !== 'object') {
        throw new Error('Table data structure is invalid');
    }
    const labels = Object.keys(firstVal);
    let dataFields: DataField[] = Object.keys(fields).map((key) => {
        return {
            dataTitle: key,
            data: Object.values(fields[key]) as string[]
        };
    });

    if (selected) {
        // Performance optimization: Precompute an O(1) Set lookup for selected titles
        // to avoid O(S * N) linear array scans across selected fields during series extraction.
        const selectedSet = new Set(selected);
        dataFields = dataFields.filter(value => selectedSet.has(value.dataTitle));
    }

    return { labels, dataFields };
}
