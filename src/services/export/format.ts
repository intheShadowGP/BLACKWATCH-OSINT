/** HTML escaping for every string inserted into generated HTML reports. */
export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * CSV cell: neutralises spreadsheet formula injection (= + - @ TAB CR at start)
 * by prefixing a single quote, then RFC 4180 quoting.
 */
export function csvCell(v: unknown): string {
  let s = v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: Array<keyof T & string>): string {
  const head = columns.map(csvCell).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(r[c])).join(','));
  // BOM so spreadsheet tools detect UTF-8.
  return '﻿' + [head, ...body].join('\r\n');
}

/** Escapes Markdown control characters in inline text. */
export function mdEscape(s: unknown): string {
  return String(s ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/([\\`*_{}[\]()#+!|<>])/g, '\\$1');
}

/** Markdown link that only accepts http(s) URLs. */
export function mdLink(text: string, url: string | undefined): string {
  if (!url || !/^https?:\/\//i.test(url)) return mdEscape(text);
  return `[${mdEscape(text)}](<${url.replace(/[<>\s]/g, encodeURIComponent)}>)`;
}
