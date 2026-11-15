import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';
import { parseDay, reportRange } from './dates';
import { buildPdf } from './pdf';

describe('csv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(7)).toBe('7');
  });

  it('neutralizes spreadsheet formulas', () => {
    for (const evil of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx']) expect(csvCell(evil).replace(/^"/, '').startsWith("'")).toBe(true);
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csvCell('safe-text')).toBe('safe-text');
  });

  it('writes a BOM, a header and CRLF rows', () => {
    const csv = toCsv(['a', 'b'], [['1', 'x,y']]);
    expect(csv).toBe('﻿a,b\r\n1,"x,y"\r\n');
  });
});

describe('dates', () => {
  it('parses only real YYYY-MM-DD days', () => {
    expect(parseDay('2026-02-31', false)).toBeUndefined();
    expect(parseDay('2026-2-1', false)).toBeUndefined();
    expect(parseDay(undefined, false)).toBeUndefined();
    expect(parseDay('2026-02-01', true)?.toISOString()).toBe('2026-02-01T23:59:59.999Z');
  });

  it('defaults to the last 30 days, swaps reversed ranges and caps the span at a year', () => {
    const now = new Date('2026-03-31T12:00:00Z');
    expect(reportRange(undefined, undefined, now)).toMatchObject({ fromDay: '2026-03-02', toDay: '2026-03-31' });
    expect(reportRange('2026-03-10', '2026-03-01', now)).toMatchObject({ fromDay: '2026-03-01', toDay: '2026-03-10' });
    expect(reportRange('2000-01-01', '2026-03-01', now).fromDay).toBe('2025-03-01');
  });
});

describe('pdf', () => {
  it('builds a valid multi-page PDF, wrapping long lines and replacing unsupported characters', async () => {
    const lines = Array.from({ length: 120 }, (_, i) => `Línea ${i} ${'palabra '.repeat(30)} 😀 ${'x'.repeat(200)}`);
    const bytes = await buildPdf('Informe áéí', 'Del 2026-01-01 al 2026-01-31', [{ heading: 'Miembros', lines }]);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const { PDFDocument } = await import('pdf-lib');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });

  it('builds an empty report without sections', async () => {
    expect((await buildPdf('T', 'S', [])).length).toBeGreaterThan(100);
  });
});
