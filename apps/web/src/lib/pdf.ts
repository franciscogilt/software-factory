import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

export type PdfSection = { heading: string; lines: string[] };

// The standard PDF fonts only encode Latin-1 text (enough for Spanish and English). Anything else becomes "?"
// instead of making the export fail.
function encodable(text: string, font: PDFFont): string {
  return [...text.replace(/[\r\n\t]/g, ' ')].map((ch) => { try { font.encodeText(ch); return ch; } catch { return '?'; } }).join('');
}

export async function buildPdf(title: string, subtitle: string, sections: PdfSection[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [width, height] = [595, 842]; // A4
  const margin = 50;
  const maxWidth = width - margin * 2;
  let page = doc.addPage([width, height]);
  let y = height - margin;

  const ensure = (needed: number) => {
    if (y - needed < margin) { page = doc.addPage([width, height]); y = height - margin; }
  };
  // Breaks long lines at word boundaries (and inside very long words) so nothing runs off the page.
  const wrap = (text: string, f: PDFFont, size: number): string[] => {
    const out: string[] = [];
    let line = '';
    for (const word of encodable(text, f).split(' ')) {
      let w = word;
      while (f.widthOfTextAtSize(w, size) > maxWidth) {
        let cut = w.length - 1;
        while (cut > 1 && f.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut--;
        if (line) { out.push(line); line = ''; }
        out.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const candidate = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(candidate, size) > maxWidth) { out.push(line); line = w; } else line = candidate;
    }
    if (line) out.push(line);
    return out;
  };
  const write = (text: string, f: PDFFont, size: number, gap: number) => {
    for (const line of wrap(text, f, size)) {
      ensure(size + gap);
      y -= size;
      page.drawText(line, { x: margin, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
      y -= gap;
    }
  };

  write(title, bold, 18, 6);
  write(subtitle, font, 10, 14);
  for (const s of sections) {
    ensure(40);
    y -= 6;
    write(s.heading, bold, 13, 4);
    for (const l of s.lines) write(l, font, 10, 3);
  }
  doc.setTitle(encodable(title, font));
  return doc.save();
}
