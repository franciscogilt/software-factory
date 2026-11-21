// Line coverage from the three report formats we support. null always means "not measured", never a guess.
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const round = (n: number) => Math.round(n * 100) / 100;

export function parseSummaryJson(text: string): number | null {
  try {
    const pct = (JSON.parse(text) as { total?: { lines?: { pct?: number } } }).total?.lines?.pct;
    return typeof pct === 'number' && Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : null;
  } catch {
    return null;
  }
}

// Cobertura XML (coverage.py, coverlet): <coverage line-rate="0.85" ...>
const stripComments = (xml: string) => xml.replace(/<!--[\s\S]*?-->/g, '');

export function parseCobertura(raw: string): number | null {
  const text = stripComments(raw);
  const root = /<coverage\b[^>]*>/.exec(text)?.[0];
  if (root && /\blines-valid="0"/.test(root)) return null; // nothing measurable is not 100%
  const rate = root ? /\bline-rate="([\d.]+)"/.exec(root)?.[1] : undefined;
  if (rate === undefined) return null;
  const n = Number(rate);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? round(n * 100) : null;
}

// JaCoCo XML: the last report-level <counter type="LINE" missed=".." covered=".."/> belongs to the whole report.
export function parseJacoco(raw: string): number | null {
  const text = stripComments(raw);
  const counters = [...text.matchAll(/<counter\s+type="LINE"\s+missed="(\d+)"\s+covered="(\d+)"\s*\/>/g)];
  const last = counters.at(-1);
  if (!last) return null;
  const missed = Number(last[1]);
  const covered = Number(last[2]);
  return missed + covered === 0 ? null : round((covered / (missed + covered)) * 100);
}

export function parseCoverageReport(text: string): number | null {
  const t = text.trimStart();
  if (t.startsWith('{')) return parseSummaryJson(text);
  if (/<report\b/.test(t)) return parseJacoco(text);
  if (/<coverage\b/.test(t)) return parseCobertura(text);
  return null;
}

// Report path (inside the project) with optional "*" segments, e.g. coverage/*/coverage.cobertura.xml (dotnet writes a GUID folder).
export function findReport(root: string, pattern: string): string | null {
  const parts = pattern.split('/').filter(Boolean);
  let candidates = [root];
  for (const [i, part] of parts.entries()) {
    const last = i === parts.length - 1;
    const next: string[] = [];
    for (const dir of candidates) {
      if (part === '*') {
        if (!existsSync(dir)) continue;
        for (const e of readdirSync(dir, { withFileTypes: true })) if (last ? e.isFile() : e.isDirectory()) next.push(join(dir, e.name));
      } else {
        next.push(join(dir, part));
      }
    }
    candidates = next;
  }
  // Several matches (one GUID folder per `dotnet test` run): the most recent report wins, never an arbitrary one.
  const found = candidates.filter((c) => existsSync(c)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return found[0] ?? null;
}

// Remove reports left by earlier runs so a stale or planted file can never be mistaken for this run's measurement.
export function clearReports(root: string, pattern: string): void {
  for (let i = 0; i < 50; i += 1) {
    const file = findReport(root, pattern);
    if (!file || !file.startsWith(root)) return;
    try { unlinkSync(file); } catch { return; }
  }
}

export function readCoverage(root: string, pattern: string): number | null {
  const file = findReport(root, pattern);
  if (!file) return null;
  try {
    return parseCoverageReport(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
