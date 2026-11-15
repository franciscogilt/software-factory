// Cells that start with = + - @ (or tab/CR) are run as formulas by Excel and Sheets. Prefixing an apostrophe
// keeps them as text, so a hostile name or action can never execute when an admin opens the export.
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// UTF-8 with a byte-order mark so Excel shows accents correctly; CRLF line ends as RFC 4180 asks.
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
