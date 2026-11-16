import { classifyFile, type Level } from './risk.ts';

export type Mode = 'ligero' | 'completo';

// Light mode is only for small, low-risk changes: documentation, UI texts, styles.
export function chooseMode(files: string[], level: Level, forced?: Mode): Mode {
  if (forced === 'completo') return 'completo';
  if (level !== 'bajo' || files.length === 0 || files.length > 10) return 'completo';
  return files.every((f) => classifyFile(f).level === 'bajo') ? 'ligero' : 'completo';
}
