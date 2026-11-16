// Fast-path plain CSV/TSV lines and parse quoted fields when needed.
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

  let commaCount = 0;
  let tabCount = 0;
  let inHeaderQuotes = false;
  for (let i = 0; i < lines[0].length; i++) {
    const char = lines[0][i];
    if (char === '"') {
      if (inHeaderQuotes && lines[0][i + 1] === '"') {
        i++;
      } else {
        inHeaderQuotes = !inHeaderQuotes;
      }
    } else if (!inHeaderQuotes && char === ',') {
      commaCount++;
    } else if (!inHeaderQuotes && char === '\t') {
      tabCount++;
    }
  }
  const delimiter = tabCount > commaCount ? '\t' : ',';

  const parseLine = (line: string): string[] => {
    if (!line.includes('"')) {
      const parts = line.split(delimiter);
      for (let k = 0; k < parts.length; k++) {
        parts[k] = parts[k].trim();
      }
      return parts;
    }

    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const numHeaders = headers.length;
  const numRows = lines.length - 1;
  const rows: Record<string, string>[] = new Array(numRows);

  for (let i = 0; i < numRows; i++) {
    const values = parseLine(lines[i + 1]);
    const rowObj: Record<string, string> = {};
    for (let j = 0; j < numHeaders; j++) {
      rowObj[headers[j]] = values[j] !== undefined ? values[j] : '';
    }
    rows[i] = rowObj;
  }

  return rows;
}
