const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

// Parses a YYYY-MM-DD filter value; anything else (or an impossible date such as 2026-02-31) is ignored.
export function parseDay(value: string | undefined, endOfDay: boolean): Date | undefined {
  if (!value || !DAY.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return undefined;
  return date;
}

// Report range: the given days, or the last 30 days. A reversed range is swapped and the span is capped at one year.
export function reportRange(from: string | undefined, to: string | undefined, now: Date = new Date()): { from: Date; to: Date; fromDay: string; toDay: string } {
  let end = parseDay(to, true) ?? parseDay(now.toISOString().slice(0, 10), true)!;
  let start = parseDay(from, false) ?? new Date(parseDay(end.toISOString().slice(0, 10), false)!.getTime() - 29 * DAY_MS);
  if (start > end) [start, end] = [parseDay(end.toISOString().slice(0, 10), false)!, parseDay(start.toISOString().slice(0, 10), true)!];
  if (end.getTime() - start.getTime() > 366 * DAY_MS) start = parseDay(new Date(end.getTime() - 365 * DAY_MS).toISOString().slice(0, 10), false)!;
  return { from: start, to: end, fromDay: start.toISOString().slice(0, 10), toDay: end.toISOString().slice(0, 10) };
}
