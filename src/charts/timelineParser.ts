export interface TimelineEvent {
  start: string | number | Date;
  end?: string | number | Date;
  title: string;
  ongoing?: boolean;
  collection?: string[];
  [key: string]: any;
}

export interface TimelineSchemaMapping {
  title?: string;
  start?: string;
  end?: string;
  collection?: string[];
  categories?: string[];
}

export interface TimelineConfig {
  data?: string;
  id?: string;
  schemas?: TimelineSchemaMapping;
  events?: TimelineEvent[];
  categories?: string[];
  activeCategory?: string;
}

export interface ParsedTimelineData {
  events: TimelineEvent[];
  categories: string[];
  activeCategory: string;
}

const RESERVED_KEYS = new Set([
  'start',
  'end',
  'ongoing',
  'title',
  'collection',
  'id',
  'description',
  'url',
  'link',
  'color',
  'details',
  '_id',
]);

// Performance optimization: Hoist regular expressions to module scope so they are compiled once
// rather than re-instantiated on every parseEventDate or table/CSV parse call during timeline dataset rendering.
const BC_REGEX = /(?:^|\b)(?:BC|BCE)(?:\b|$)/i;
const BC_REPLACE_REGEX = /(?:^|\b)(?:BC|BCE)(?:\b|$)/gi;
const AD_REGEX = /(?:^|\b)(?:AD|CE)(?:\b|$)/i;
const AD_REPLACE_REGEX = /(?:^|\b)(?:AD|CE)(?:\b|$)/gi;
const INTEGER_YEAR_REGEX = /^[+-]?\d+$/;
const DIGITS_REGEX = /\b\d+\b/;
const SEPARATOR_ROW_REGEX = /^[:\s|-]*$/;
const BLOCK_REF_SUFFIX_REGEX = /\s*\^\w+\s*$/;

export function parseEventDate(val: string | number | Date | undefined, fallback: Date): Date {
  if (val === undefined || val === null || val === '') return fallback;
  if (val instanceof Date) return isNaN(val.getTime()) ? fallback : val;

  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) return fallback;
    if (Math.abs(val) <= 10000) {
      const d = new Date(0);
      d.setFullYear(val, 0, 1);
      return d;
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) return fallback;
    const year = d.getFullYear();
    if (year < -10000 || year > 3000) return fallback;
    return d;
  }

  const str = String(val).trim();
  if (str === '') return fallback;

  // Performance optimization: Check for integer year strings first to short-circuit plain numeric years
  // (e.g. "2023", "1999", "-44") before running era regexes.
  if (INTEGER_YEAR_REGEX.test(str)) {
    const num = Number(str);
    if (!isNaN(num) && Math.abs(num) <= 10000) {
      const d = new Date(0);
      d.setFullYear(num, 0, 1);
      return d;
    }
  }

  if (BC_REGEX.test(str)) {
    const cleaned = str.replace(BC_REPLACE_REGEX, '').trim();
    const yearMatch = cleaned.match(DIGITS_REGEX);
    if (yearMatch) {
      const yearNum = Math.abs(Number(yearMatch[0]));
      if (yearNum <= 10000) {
        const withoutYear = cleaned.replace(yearMatch[0], '').trim();
        let month = 0;
        let day = 1;
        if (withoutYear) {
          const testDate = new Date(`${withoutYear} 2000`);
          if (!isNaN(testDate.getTime())) {
            month = testDate.getMonth();
            day = testDate.getDate();
          }
        }
        const d = new Date(0);
        d.setFullYear(-yearNum, month, day);
        return d;
      }
    }
  }

  if (AD_REGEX.test(str)) {
    const cleaned = str.replace(AD_REPLACE_REGEX, '').trim();
    const yearMatch = cleaned.match(DIGITS_REGEX);
    if (yearMatch) {
      const yearNum = Number(yearMatch[0]);
      if (Math.abs(yearNum) <= 10000) {
        const withoutYear = cleaned.replace(yearMatch[0], '').trim();
        let month = 0;
        let day = 1;
        if (withoutYear) {
          const testDate = new Date(`${withoutYear} 2000`);
          if (!isNaN(testDate.getTime())) {
            month = testDate.getMonth();
            day = testDate.getDate();
          }
        }
        const d = new Date(0);
        d.setFullYear(yearNum, month, day);
        return d;
      }
    }
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    if (year >= -10000 && year <= 3000) {
      return parsed;
    }
  }

  return fallback;
}

export function parseYamlValue(val: string): any {
  if (!val) return '';
  const trimmed = val.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((item) => parseYamlValue(item.trim()));
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((item) => parseYamlValue(item.trim()));
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (!isNaN(Number(trimmed)) && trimmed !== '') return Number(trimmed);
  return trimmed;
}

export function parseSimpleYaml(str: string): any {
  const lines = str.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (lines.length === 0) return null;

  if (lines.some((l) => l.startsWith('- '))) {
    const items: any[] = [];
    let currentItem: any = null;
    for (const line of lines) {
      if (line.startsWith('- ')) {
        currentItem = {};
        items.push(currentItem);
        const rest = line.slice(2).trim();
        if (rest.includes(':')) {
          const colonIdx = rest.indexOf(':');
          const key = rest.slice(0, colonIdx).trim();
          const val = rest.slice(colonIdx + 1).trim();
          if (key) currentItem[key] = parseYamlValue(val);
        }
      } else if (currentItem && line.trim().includes(':')) {
        const trimmed = line.trim();
        const colonIdx = trimmed.indexOf(':');
        const key = trimmed.slice(0, colonIdx).trim();
        const val = trimmed.slice(colonIdx + 1).trim();
        if (key) currentItem[key] = parseYamlValue(val);
      }
    }
    return items.length > 0 ? items : null;
  }

  const root: any = {};
  let currentParent: any = root;
  let currentSubKey: string | null = null;

  for (const rawLine of str.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = rawLine.search(/\S/);

    if (trimmed.includes(':') && !trimmed.startsWith('- ')) {
      const colonIdx = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim();

      if (indent === 0) {
        if (val) {
          root[key] = parseYamlValue(val);
          currentParent = root;
          currentSubKey = null;
        } else {
          root[key] = {};
          currentParent = root[key];
          currentSubKey = key;
        }
      } else {
        if (val) {
          if (typeof currentParent === 'object' && !Array.isArray(currentParent)) {
            currentParent[key] = parseYamlValue(val);
          }
          currentSubKey = key;
        } else {
          if (typeof currentParent === 'object' && !Array.isArray(currentParent)) {
            currentParent[key] = [];
          }
          currentSubKey = key;
        }
      }
    } else if (trimmed.startsWith('- ')) {
      const itemVal = parseYamlValue(trimmed.slice(2).trim());
      if (currentSubKey && currentParent && Array.isArray(currentParent[currentSubKey])) {
        currentParent[currentSubKey].push(itemVal);
      } else if (Array.isArray(currentParent)) {
        currentParent.push(itemVal);
      }
    }
  }

  return Object.keys(root).length > 0 ? root : null;
}

export function safeParseYaml(str: string): any {
  try {
    const obs = require('obsidian');
    if (obs && typeof obs.parseYaml === 'function') {
      const parsed = obs.parseYaml(str);
      if (parsed !== null && parsed !== undefined && typeof parsed === 'object') return parsed;
    }
  } catch {
    // ignore
  }
  return parseSimpleYaml(str);
}

export function parseLooseObjectLiteral(code: string): any {
  let cleaned = code.trim();
  cleaned = cleaned.replace(/\bDate\.now\(\)/g, String(Date.now()));

  if (cleaned.startsWith('{{') && cleaned.endsWith('}}')) {
    cleaned = '[' + cleaned.slice(1, -1) + ']';
  }

  cleaned = cleaned.replace(/\x27([^\x27\\]*(\\.[^\x27\\]*)*)\x27/g, '"$1"');
  cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":');

  cleaned = cleaned.replace(/(:\s*)([^"'\s{},\[\]][^{},\[\]]*?)(?=\s*[,}\]])/g, (match, prefix, val) => {
    const trimmedVal = val.trim();
    if (!trimmedVal) return match;
    if (['true', 'false', 'null', 'undefined'].includes(trimmedVal)) return prefix + trimmedVal;
    if (!isNaN(Number(trimmedVal))) return prefix + trimmedVal;
    return `${prefix}"${trimmedVal}"`;
  });

  cleaned = cleaned.replace(/(\[\s*|\,\s*)([^"'\s\d\.,{\}\[\]][^{}\[\]]*?)(?=\s*[,\]])/g, (match, prefix, val) => {
    const trimmedVal = val.trim();
    if (!trimmedVal) return match;
    if (['true', 'false', 'null', 'undefined'].includes(trimmedVal)) return prefix + trimmedVal;
    if (!isNaN(Number(trimmedVal))) return prefix + trimmedVal;
    return `${prefix}"${trimmedVal}"`;
  });

  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  return JSON.parse(cleaned);
}

// Performance optimization: Iterate over raw lines directly in a single pass rather than chaining
// .split().map().filter(). Avoid regex quote stripping on every cell in favor of direct string bounds checks,
// and replace forEach row field assignment callbacks with direct index loops.
export function parseCsvOrTsv(text: string): Record<string, string>[] {
  const rawLines = text.split(/\r?\n/);
  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (trimmed.length > 0) {
      lines.push(trimmed);
    }
  }
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : ',';

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        let cell = current.trim();
        if (cell.startsWith('"') && cell.endsWith('"') && cell.length >= 2) {
          cell = cell.slice(1, -1).trim();
        }
        result.push(cell);
        current = '';
      } else {
        current += char;
      }
    }
    let cell = current.trim();
    if (cell.startsWith('"') && cell.endsWith('"') && cell.length >= 2) {
      cell = cell.slice(1, -1).trim();
    }
    result.push(cell);
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const rowObj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const h = headers[j];
      rowObj[h] = values[j] !== undefined ? values[j] : '';
    }
    rows.push(rowObj);
  }

  return rows;
}

// Performance optimization: Single-pass line iteration rather than chained .split().map().filter().
// Use start/end cell index bounds to trim boundary cells without calling .shift() (which triggers O(N) element re-indexing),
// detect separator rows with direct SEPARATOR_ROW_REGEX.test(line) checks, and replace forEach row field callbacks with direct loops.
export function parseMarkdownTableRows(tableText: string): Record<string, string>[] {
  const rawLines = tableText.split(/\r?\n/);
  const rows: string[][] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line.includes('|') || line.startsWith('^') || SEPARATOR_ROW_REGEX.test(line)) continue;

    const cleanLine = line.replace(BLOCK_REF_SUFFIX_REGEX, '');
    const rawCells = cleanLine.split('|');

    const startIdx = rawCells.length > 0 && rawCells[0].trim() === '' ? 1 : 0;
    const endIdx = rawCells.length > startIdx && rawCells[rawCells.length - 1].trim() === '' ? rawCells.length - 1 : rawCells.length;

    const cells: string[] = [];
    for (let j = startIdx; j < endIdx; j++) {
      cells.push(rawCells[j].trim());
    }

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  if (rows.length < 2) return [];

  const headerCells = rows[0];
  const resultRows: Record<string, string>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const rowObj: Record<string, string> = {};
    for (let j = 0; j < headerCells.length; j++) {
      const h = headerCells[j];
      rowObj[h] = cells[j] !== undefined ? cells[j] : '';
    }
    resultRows.push(rowObj);
  }

  return resultRows;
}

export function mapRawRowsToTimelineData(
  rows: Record<string, any>[],
  schema?: TimelineSchemaMapping
): ParsedTimelineData {
  if (!rows || rows.length === 0) {
    throw new Error('Dataset is empty');
  }

  const sampleRow = rows[0];
  const keys = Object.keys(sampleRow);

  const findKey = (target?: string) => {
    if (!target) return undefined;
    const lowerTarget = target.trim().toLowerCase();
    return keys.find((k) => k.trim().toLowerCase() === lowerTarget);
  };

  const titleKey = findKey(schema?.title) || keys.find((k) => ['title', 'civilization', 'name', 'label', 'event'].includes(k.toLowerCase())) || keys[0];
  const startKey = findKey(schema?.start) || keys.find((k) => ['start', 'startdate', 'begin', 'year'].includes(k.toLowerCase())) || keys[1] || keys[0];
  const endKey = findKey(schema?.end) || keys.find((k) => ['end', 'enddate', 'finish'].includes(k.toLowerCase()));

  const schemaCollections = schema?.collection ? schema.collection.map(findKey).filter((k): k is string => Boolean(k)) : [];
  const collectionKeys = schemaCollections.length > 0
    ? schemaCollections
    : keys.filter((k) => ['collection', 'startlabel', 'endlabel', 'tags', 'tag'].includes(k.toLowerCase()));

  const collectionKeysSet = new Set(collectionKeys);

  const schemaCategories = schema?.categories ? schema.categories.map(findKey).filter((k): k is string => Boolean(k)) : [];
  const categoryKeys = schemaCategories.length > 0
    ? schemaCategories
    : keys.filter((k) => !RESERVED_KEYS.has(k.toLowerCase()) && k !== titleKey && k !== startKey && k !== endKey && !collectionKeysSet.has(k));

  const categoryKeysSet = new Set(categoryKeys);

  // Performance optimization: Pre-compute O(1) Sets for collection and category keys outside row iteration.
  // Replaces nested linear array searches (!collectionKeys.includes(k)) with O(1) Set lookups per row property.
  const events: TimelineEvent[] = rows.map((row) => {
    const title = String(row[titleKey] ?? '').trim();
    const start = row[startKey] !== undefined ? row[startKey] : '';
    const end = endKey && row[endKey] !== undefined ? row[endKey] : undefined;

    const collections: string[] = [];
    collectionKeys.forEach((colKey) => {
      const val = row[colKey];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        if (Array.isArray(val)) {
          val.forEach((item) => collections.push(String(item)));
        } else {
          const str = String(val).trim();
          if (str) collections.push(str);
        }
      }
    });

    const evtObj: TimelineEvent = {
      title: title || 'Untitled Event',
      start,
      end,
      collection: collections,
    };

    categoryKeys.forEach((catKey) => {
      if (row[catKey] !== undefined) {
        evtObj[catKey] = row[catKey];
      }
    });

    const rowKeys = Object.keys(row);
    for (let i = 0; i < rowKeys.length; i++) {
      const k = rowKeys[i];
      if (k !== titleKey && k !== startKey && k !== endKey && !collectionKeysSet.has(k) && !categoryKeysSet.has(k)) {
        evtObj[k] = row[k];
      }
    }

    return evtObj;
  });

  const categories = schema?.categories && schema.categories.length > 0
    ? schema.categories
    : (categoryKeys.length > 0 ? categoryKeys : ['category']);

  return {
    events,
    categories,
    activeCategory: categories[0],
  };
}

export function parseTimelineConfig(code: string): TimelineConfig {
  let cleaned = code.trim();

  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '').trim();
  }

  let dataPath: string | undefined;
  let blockId: string | undefined;
  let schemaMap: TimelineSchemaMapping | undefined;

  let yamlParsed: any = null;
  try {
    yamlParsed = safeParseYaml(cleaned);
  } catch {}

  if (yamlParsed && typeof yamlParsed === 'object' && (yamlParsed.data || yamlParsed.id || yamlParsed.events || yamlParsed.schemas || yamlParsed.schema)) {
    if (yamlParsed.data) {
      dataPath = String(yamlParsed.data).trim().replace(/^[\["'`\s]+|[\]"'`\s]+$/g, '');
    }
    if (yamlParsed.id) {
      blockId = String(yamlParsed.id).trim().replace(/^[\["'`\s]+|[\]"'`\s]+$/g, '').replace(/^\^/, '');
    }
    const s = yamlParsed.schemas || yamlParsed.schema;
    if (s && typeof s === 'object') {
      schemaMap = {};
      if (s.title) schemaMap.title = String(s.title);
      if (s.start) schemaMap.start = String(s.start);
      if (s.end) schemaMap.end = String(s.end);
      if (Array.isArray(s.collection)) schemaMap.collection = s.collection.map((i: any) => String(i).replace(/^- /, '').trim());
      else if (typeof s.collection === 'string') schemaMap.collection = [s.collection.trim()];
      if (Array.isArray(s.categories)) schemaMap.categories = s.categories.map((i: any) => String(i).replace(/^- /, '').trim());
      else if (typeof s.categories === 'string') schemaMap.categories = [s.categories.trim()];
    }
  }

  if (!dataPath) {
    const dataMatch = cleaned.match(/\bdata\s*[:=]\s*([^\n]+)/i);
    if (dataMatch) {
      dataPath = dataMatch[1].trim().replace(/^[\["'`\s]+|[\]"'`\s]+$/g, '');
    }
  }

  if (!blockId) {
    const idMatch = cleaned.match(/\bid\s*[:=]\s*([^\n]+)/i);
    if (idMatch) {
      blockId = idMatch[1].trim().replace(/^[\["'`\s]+|[\]"'`\s]+$/g, '').replace(/^\^/, '');
    }
  }

  if (!schemaMap) {
    const parseSchemasBlock = (text: string): TimelineSchemaMapping => {
      const mapping: TimelineSchemaMapping = {};

      const titleMatch = text.match(/\btitle\s*[:=]\s*["']?([^"'\n,\]\}]+)["']?/i);
      if (titleMatch) mapping.title = titleMatch[1].trim();

      const startMatch = text.match(/\bstart\s*[:=]\s*["']?([^"'\n,\]\}]+)["']?/i);
      if (startMatch) mapping.start = startMatch[1].trim();

      const endMatch = text.match(/\bend\s*[:=]\s*["']?([^"'\n,\]\}]+)["']?/i);
      if (endMatch) mapping.end = endMatch[1].trim();

      const collectionMatch = text.match(/\bcollection\s*[:=]\s*[\{\[]?([^\}\]\n]+)[\}\]]?/i);
      if (collectionMatch) {
        mapping.collection = collectionMatch[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '').replace(/^- /, '')).filter(Boolean);
      }

      const categoriesMatch = text.match(/\bcategories\s*[:=]\s*[\{\[]?([^\}\]\n]+)[\}\]]?/i);
      if (categoriesMatch) {
        mapping.categories = categoriesMatch[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '').replace(/^- /, '')).filter(Boolean);
      }

      return mapping;
    };

    const schemasMatch = cleaned.match(/\b(schemas?)\s*[:=]\s*\[([\s\S]*?)\]/i);
    if (schemasMatch) {
      schemaMap = parseSchemasBlock(schemasMatch[2]);
    }
  }

  if (dataPath || blockId) {
    return {
      data: dataPath,
      id: blockId,
      schemas: schemaMap,
    };
  }

  const parsedData = parseTimelineCode(cleaned);
  return {
    events: parsedData.events,
    categories: parsedData.categories,
    activeCategory: parsedData.activeCategory,
  };
}

export function parseTimelineCode(code: string): ParsedTimelineData {
  let cleaned = code.trim();

  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '').trim();
  }
  cleaned = cleaned.replace(/^(const|let|var)\s+\w+\s*=\s*/, '').replace(/;?\s*$/, '').trim();
  cleaned = cleaned.replace(/\bDate\.now\(\)/g, String(Date.now()));

  let rawParsed: any = null;

  try {
    rawParsed = JSON.parse(cleaned);
  } catch {}

  if (!rawParsed) {
    let wrapped = cleaned;
    if (wrapped.startsWith('{{') && wrapped.endsWith('}}')) {
      wrapped = '[' + wrapped.slice(2, -2) + ']';
    } else if (
      wrapped.startsWith('{') &&
      wrapped.endsWith('}') &&
      !/\b(events|data|yourData)\s*:/i.test(wrapped)
    ) {
      wrapped = '[' + wrapped + ']';
    }
    try {
      rawParsed = JSON.parse(wrapped);
    } catch {}
  }

  const isBracketed = cleaned.startsWith('{') || cleaned.startsWith('[') || cleaned.startsWith('{{');
  if (!rawParsed && isBracketed) {
    try {
      rawParsed = parseLooseObjectLiteral(cleaned);
    } catch {}
  }

  if (!rawParsed) {
    rawParsed = safeParseYaml(cleaned);
  }

  if (!rawParsed || typeof rawParsed !== 'object') {
    try {
      rawParsed = parseLooseObjectLiteral(cleaned);
    } catch {}
  }

  if (!rawParsed || typeof rawParsed !== 'object') {
    throw new Error('Invalid JSON or YAML timeline data format');
  }

  let eventsArr: TimelineEvent[] = [];
  let userCategories: string[] | undefined;
  let userActiveCategory: string | undefined;

  if (Array.isArray(rawParsed)) {
    eventsArr = rawParsed.flat().filter((item) => item && typeof item === 'object');
  } else if (typeof rawParsed === 'object' && rawParsed !== null) {
    if (Array.isArray(rawParsed.events)) eventsArr = rawParsed.events;
    else if (Array.isArray(rawParsed.data)) eventsArr = rawParsed.data;
    else if (Array.isArray(rawParsed.yourData)) eventsArr = rawParsed.yourData;
    else eventsArr = [rawParsed];

    if (Array.isArray(rawParsed.categories)) {
      userCategories = rawParsed.categories.map(String);
    }
    if (typeof rawParsed.activeCategory === 'string') {
      userActiveCategory = rawParsed.activeCategory;
    }
  }

  if (!Array.isArray(eventsArr) || eventsArr.length === 0) {
    throw new Error('No valid timeline events found in data');
  }

  const discoveredCategoriesSet = new Set<string>();
  eventsArr.forEach((evt) => {
    if (evt && typeof evt === 'object') {
      Object.keys(evt).forEach((key) => {
        if (!RESERVED_KEYS.has(key)) {
          const val = evt[key];
          if (typeof val === 'string' || typeof val === 'number') {
            discoveredCategoriesSet.add(key);
          }
        }
      });
    }
  });

  const categories = userCategories && userCategories.length > 0
    ? userCategories
    : Array.from(discoveredCategoriesSet);

  if (categories.length === 0) {
    categories.push('category');
  }

  const activeCategory = userActiveCategory && categories.includes(userActiveCategory)
    ? userActiveCategory
    : categories[0];

  return {
    events: eventsArr,
    categories,
    activeCategory,
  };
}
