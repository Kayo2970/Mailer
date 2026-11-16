/**
 * mail-merge.ts — recipient-list parsing and placeholder substitution, shared by
 * the browser (live preview, recipient table) and the server (the actual send).
 *
 * A recipient list is CSV or tab-separated text (a spreadsheet pasted straight
 * in works). With a header row, every column becomes a {{placeholder}}; without
 * one, each line is "email" or "name, email" in either order.
 */

export interface Recipient {
  email: string;
  /** Column values keyed by lower-cased column name (always includes `email`). */
  fields: Record<string, string>;
}

export interface ParsedRecipients {
  recipients: Recipient[];
  /** Placeholder names available for this list, in column order. */
  columns: string[];
  /** Lines that were skipped, with the reason (shown to the user, never silently dropped). */
  skipped: Array<{ line: number; reason: string }>;
}

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test((value || '').trim());
}

/** Escapes a CSV cell according to RFC 4180 rules. */
export function escapeCsvField(val: string): string {
  const str = val ?? '';
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Converts grid columns and rows into a clean, RFC 4180 compliant CSV string. */
export function gridToCsv(columns: string[], rows: string[][]): string {
  const cleanCols = columns.map((c) => normaliseColumn(c) || 'column');
  const validRows = rows.filter((r) => r.some((c) => (c ?? '').trim() !== ''));
  if (cleanCols.length === 0 && validRows.length === 0) return '';
  const headerLine = cleanCols.map(escapeCsvField).join(',');
  const rowLines = validRows.map((row) => {
    const padded = cleanCols.map((_, i) => row[i] ?? '');
    return padded.map(escapeCsvField).join(',');
  });
  return [headerLine, ...rowLines].join('\n');
}

/** Converts raw CSV or spreadsheet-delimited text into an editable 2D grid structure. */
export function csvToGrid(text: string): { columns: string[]; rows: string[][] } {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return {
      columns: ['email', 'name', 'company'],
      rows: [['', '', '']],
    };
  }
  const delimiter = detectDelimiter(trimmed);
  const rawRows = parseDelimited(trimmed, delimiter).map(splitAngleAddress);
  if (rawRows.length === 0) {
    return {
      columns: ['email', 'name', 'company'],
      rows: [['', '', '']],
    };
  }

  const first = rawRows[0];
  const hasHeader = !first.some(isValidEmail) && first.some((c) => /^(e-?mail|email[ _]?address|mail)$/i.test(c.trim()));

  let columns: string[];
  let dataRows: string[][];

  if (hasHeader) {
    columns = first.map((c, i) => normaliseColumn(c) || `column_${i + 1}`);
    const emailIndex = columns.findIndex((c) => /^(e-?mail|email_?address|mail)$/.test(c));
    if (emailIndex !== -1) {
      columns[emailIndex] = 'email';
    } else {
      columns.unshift('email');
    }
    dataRows = rawRows.slice(1);
  } else {
    // If no header row, inspect the first row to determine column placements
    let emailIndex = first.findIndex(isValidEmail);
    if (emailIndex === -1) emailIndex = 0;
    let named = false;
    columns = first.map((_, i) => {
      if (i === emailIndex) return 'email';
      if (!named) { named = true; return 'name'; }
      return i === 2 ? 'company' : `column_${i + 1}`;
    });
    if (!columns.includes('email')) columns[0] = 'email';
    dataRows = rawRows;
  }

  // Ensure unique column names
  const seenCols = new Set<string>();
  columns = columns.map((col, i) => {
    let name = col || `column_${i + 1}`;
    let counter = 2;
    while (seenCols.has(name)) {
      name = `${col}_${counter++}`;
    }
    seenCols.add(name);
    return name;
  });

  const numCols = Math.max(columns.length, 1);
  const rows = dataRows.map((r) => {
    const row = new Array<string>(numCols).fill('');
    for (let i = 0; i < numCols; i++) {
      row[i] = (r[i] ?? '').trim();
    }
    return row;
  });

  return {
    columns,
    rows: rows.length > 0 ? rows : [new Array(numCols).fill('')],
  };
}

/** Splits delimited text into rows of fields, honouring double-quoted fields (which may contain the delimiter, quotes and line breaks). */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field.trim() === '') {
      inQuotes = true;
      field = '';
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field.trim());
  rows.push(row);
  return rows.filter((r) => r.some((f) => f !== ''));
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== '') || '';
  if (firstLine.includes('\t')) return '\t';
  if (firstLine.includes(';') && !firstLine.includes(',')) return ';';
  return ',';
}

/** "Jane Doe <jane@x.com>" → ["Jane Doe", "jane@x.com"] so the common address-book format pastes cleanly. */
function splitAngleAddress(row: string[]): string[] {
  if (row.length !== 1) return row;
  const m = /^(.*?)<([^<>]+)>$/.exec(row[0]);
  return m ? [m[1].trim().replace(/^"|"$/g, ''), m[2].trim()] : row;
}

const normaliseColumn = (name: string) => name.trim().toLowerCase().replace(/\s+/g, '_');

export function parseRecipients(text: string): ParsedRecipients {
  const rows = parseDelimited(text || '', detectDelimiter(text || '')).map(splitAngleAddress);
  const skipped: ParsedRecipients['skipped'] = [];
  if (rows.length === 0) return { recipients: [], columns: ['email'], skipped };

  // A header row is one with no e-mail address in it and at least one address-ish column name.
  const first = rows[0];
  const hasHeader = !first.some(isValidEmail) && first.some((c) => /^(e-?mail|email[ _]?address|mail)$/i.test(c.trim()));

  let columns: string[];
  let emailIndex: number;
  let dataRows: string[][];
  if (hasHeader) {
    columns = first.map((c, i) => normaliseColumn(c) || `column_${i + 1}`);
    emailIndex = columns.findIndex((c) => /^(e-?mail|email_?address|mail)$/.test(c));
    columns[emailIndex] = 'email';
    dataRows = rows.slice(1);
  } else {
    // No header: find the e-mail column from the data; the first other column is the name.
    emailIndex = first.findIndex(isValidEmail);
    if (emailIndex === -1) emailIndex = 0;
    let named = false;
    columns = first.map((_, i) => {
      if (i === emailIndex) return 'email';
      if (!named) { named = true; return 'name'; }
      return `column_${i + 1}`;
    });
    dataRows = rows;
  }

  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  dataRows.forEach((row, idx) => {
    const line = idx + (hasHeader ? 2 : 1);
    const email = (row[emailIndex] || '').trim();
    if (!isValidEmail(email)) {
      skipped.push({ line, reason: email ? `"${email}" is not a valid e-mail address` : 'no e-mail address' });
      return;
    }
    if (seen.has(email.toLowerCase())) {
      skipped.push({ line, reason: `${email} is already in the list` });
      return;
    }
    seen.add(email.toLowerCase());
    const fields: Record<string, string> = {};
    columns.forEach((col, i) => { fields[col] = (row[i] || '').trim(); });
    fields.email = email;
    recipients.push({ email, fields });
  });

  return { recipients, columns, skipped };
}

const PLACEHOLDER_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Replaces every {{column}} with that recipient's value. Unknown placeholders are left as typed so they are easy to spot. */
export function applyMailMerge(template: string, fields: Record<string, string>): string {
  return (template || '').replace(PLACEHOLDER_RE, (whole, rawName: string) => {
    const key = normaliseColumn(rawName);
    return key in fields ? fields[key] : whole;
  });
}

/** Placeholders used in the template that the recipient list has no column for. */
export function findUnknownPlaceholders(template: string, columns: string[]): string[] {
  const known = new Set(columns);
  const unknown = new Set<string>();
  for (const m of (template || '').matchAll(PLACEHOLDER_RE)) {
    const key = normaliseColumn(m[1]);
    if (!known.has(key)) unknown.add(m[1].trim());
  }
  return Array.from(unknown);
}
