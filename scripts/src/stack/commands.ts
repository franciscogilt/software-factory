// Per-project commands: the `commands:` block of product.config.yaml. Commands are never run through a shell.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROFILE_VALUES = ['auto', 'node', 'python', 'dotnet', 'jvm', 'desconocido'];
export const COMMAND_KEYS = ['install', 'build', 'typecheck', 'lint', 'test', 'coverage', 'coverage_report', 'dev'] as const;
export type CommandKey = (typeof COMMAND_KEYS)[number];
export type Commands = Partial<Record<CommandKey, string>>;
export type Step = [command: string, args: string[]];

// "&&" is split out before tokenizing, so any "&" left over is a shell operator.
const SHELL_META = /[;|<>$`\\&\n\r\0]/;

// Splits one step into argv honouring simple single and double quotes. Throws on anything a shell would interpret.
export function tokenize(step: string): string[] {
  const text = step.trim();
  if (text === '') throw new Error('paso vacío');
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let started = false;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started || cur) out.push(cur);
      cur = '';
      started = false;
    } else if (SHELL_META.test(ch)) {
      throw new Error(`carácter no permitido "${ch}" (los comandos no pasan por un shell; encadena pasos con " && ")`);
    } else {
      cur += ch;
      started = true;
    }
  }
  if (quote) throw new Error('comillas sin cerrar');
  if (started || cur) out.push(cur);
  return out;
}

// "a b && c d" -> [[a,[b]],[c,[d]]]. Quoted "&&" would not survive the split, which is deliberate: keep steps simple.
export function parseSteps(value: string): Step[] {
  return value.split('&&').map((s) => {
    const argv = tokenize(s);
    return [argv[0]!, argv.slice(1)] as Step;
  });
}

export interface ProductStack {
  profile: string | null; // value of stack_profile, null when absent
  commands: Commands | null; // null when the block is absent
}

// Minimal reader for the one block we need: no YAML dependency (every library needs a justification in the PR).
export function parseStackConfig(text: string): ProductStack {
  const rawProfile = /^stack_profile:[ \t]*(.*?)[ \t]*$/m.exec(text)?.[1]?.replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '');
  if (rawProfile !== undefined && rawProfile !== '' && ![...PROFILE_VALUES].includes(rawProfile)) {
    throw new Error(`stack_profile: valor no válido "${rawProfile}" (usar ${PROFILE_VALUES.join(' | ')})`);
  }
  const profile = rawProfile || null;
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^commands:\s*(#.*)?$/.test(l));
  if (start < 0) return { profile, commands: null };
  const commands: Commands = {};
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (!/^\s+\S/.test(line)) break; // block ends at the next top-level key
    const m = /^\s+([a-z_]+):\s*(.*?)\s*$/.exec(line);
    if (m && /^[|>][+-]?$/.test(m[2]!)) throw new Error(`commands.${m[1]}: no se admiten bloques "|" o ">"; usar una sola línea con " && "`);
    if (!m) throw new Error(`commands: línea no válida "${line.trim()}"`);
    const key = m[1] as CommandKey;
    if (!COMMAND_KEYS.includes(key)) throw new Error(`commands: clave desconocida "${m[1]}"`);
    // Drop a trailing YAML comment: after the closing quote for quoted values, after whitespace otherwise.
    const raw = m[2]!;
    const quoted = /^(["'])(.*?)\1(?:\s+#.*)?$/.exec(raw);
    const value = quoted ? quoted[2]! : raw.replace(/\s+#.*$/, '');
    if (/^["']/.test(value) !== false && quoted === null && /^["']/.test(raw)) throw new Error(`commands.${key}: comillas sin cerrar`);
    if (key in commands) throw new Error(`commands.${key}: clave repetida`);
    if (value !== '') commands[key] = value;
  }
  validateCommands(commands);
  return { profile, commands };
}

// Fail early and name the key: a bad command must never reach execution.
export function validateCommands(commands: Commands): void {
  for (const [key, value] of Object.entries(commands)) {
    if (key === 'coverage_report') {
      // A path inside the project: absolute paths and ".." would let a project point at any file on the machine.
      if (value.startsWith('/') || /^[A-Za-z]:/.test(value) || value.split('/').includes('..') || value.includes('\0')) throw new Error('commands.coverage_report: debe ser una ruta relativa dentro del proyecto (sin ".." ni ruta absoluta)');
      continue;
    }
    try {
      parseSteps(value);
    } catch (e) {
      throw new Error(`commands.${key}: ${(e as Error).message}`);
    }
  }
}

export function readStackConfig(root: string): ProductStack {
  const p = join(root, 'product.config.yaml');
  return existsSync(p) ? parseStackConfig(readFileSync(p, 'utf8')) : { profile: null, commands: null };
}
