import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { measureCoverage, runChecks, type Runner } from '../onboard/checks.ts';
import { evaluateSafetyNet } from '../onboard/gate.ts';
import { scanProject } from '../onboard/scan.ts';
import { docsGate, gatesFromCommands } from '../gates.ts';
import { classifyFile } from '../risk.ts';
import { parseStackConfig, parseSteps, tokenize } from './commands.ts';
import { findReport, parseCobertura, parseCoverageReport, parseJacoco } from './coverage.ts';
import { detectStack, effectiveCommands, resolveProfile } from './profiles.ts';

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'stack-'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  return root;
}
const ok: Runner = () => ({ status: 0, timedOut: false, output: '', ms: 1 });

describe('commands block', () => {
  const config = `name: x\nstack_profile: python\ncommands:\n  install: "python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"\n  test: .venv/bin/python -m pytest -q   # fast\n  lint:\n  coverage_report: coverage.xml\nbudget:\n  cost: 1\n`;
  it('reads keys, ignores comments and empty values, and stops at the next top-level key', () => {
    const c = parseStackConfig(config);
    expect(c.profile).toBe('python');
    expect(c.commands).toEqual({ install: 'python3 -m venv .venv && .venv/bin/pip install -r requirements.txt', test: '.venv/bin/python -m pytest -q', coverage_report: 'coverage.xml' });
  });
  it('returns null commands when the block is absent', () => {
    expect(parseStackConfig('name: x\n').commands).toBeNull();
  });
  it('splits chained steps into argv without a shell, keeping quoted arguments whole', () => {
    expect(parseSteps('a b && c "d e"')).toEqual([['a', ['b']], ['c', ['d e']]]);
    expect(tokenize('dotnet test --collect:"XPlat Code Coverage"')).toEqual(['dotnet', 'test', '--collect:XPlat Code Coverage']);
  });
  it.each(['rm -rf x; echo', 'a | b', 'echo $HOME', 'a > out', 'a `b`', 'a & b', 'a && ', '"sin cerrar'])('rejects %s', (bad) => {
    expect(() => parseSteps(bad)).toThrow();
  });
  it('names the key of a bad command and rejects unknown keys', () => {
    expect(() => parseStackConfig('commands:\n  test: pytest; rm -rf /\n')).toThrow(/commands\.test/);
    expect(() => parseStackConfig('commands:\n  deploy: x\n')).toThrow(/clave desconocida/);
  });
});

describe('stack detection and defaults', () => {
  it('detects each stack by marker files', () => {
    expect(detectStack(['package.json'])).toBe('node');
    expect(detectStack(['requirements.txt', 'app/main.py'])).toBe('python');
    expect(detectStack(['pyproject.toml'])).toBe('python');
    expect(detectStack(['Shop.sln', 'Shop/Shop.csproj'])).toBe('dotnet');
    expect(detectStack(['src/App.csproj'])).toBe('dotnet');
    expect(detectStack(['pom.xml'])).toBe('jvm');
    expect(detectStack(['build.gradle.kts'])).toBe('jvm');
    expect(detectStack(['README.md'])).toBe('desconocido');
  });
  it('lets the configuration fix the profile, ignoring invalid values', () => {
    expect(resolveProfile('python', ['package.json'])).toBe('python');
    expect(resolveProfile('auto', ['pom.xml'])).toBe('jvm');
    expect(resolveProfile('cobol', ['pom.xml'])).toBe('jvm');
  });
  it('picks Maven or Gradle commands and lets declared commands win key by key', () => {
    expect(effectiveCommands('jvm', ['pom.xml'], null).test).toBe('mvn -B test');
    expect(effectiveCommands('jvm', ['build.gradle', 'gradlew'], null).test).toBe('./gradlew --no-daemon test');
    expect(effectiveCommands('python', ['requirements.txt'], { test: 'pytest -x' })).toMatchObject({ test: 'pytest -x', coverage_report: 'coverage.xml' });
  });
  it('every default command is shell-free and parseable', () => {
    for (const [stack, files] of [['python', ['requirements.txt']], ['python', ['pyproject.toml']], ['dotnet', ['a.csproj']], ['jvm', ['pom.xml']], ['jvm', ['build.gradle']]] as const) {
      for (const [key, value] of Object.entries(effectiveCommands(stack, [...files], null))) if (key !== 'coverage_report') expect(() => parseSteps(value)).not.toThrow();
    }
  });
});

describe('scanProject on other stacks', () => {
  it('reads a Python project: language, tests, framework, migrations', () => {
    const p = scanProject(project({ 'requirements.txt': 'fastapi==0.1\nsqlalchemy', 'app/main.py': 'x', 'app/auth.py': 'x', 'tests/test_main.py': 'x', 'alembic/versions/001_init.py': 'x' }));
    expect(p.stack).toBe('python');
    expect(p.languages.python).toBe(4);
    expect(p.testFiles).toBe(1);
    expect(p.testRunner).toBe('pytest');
    expect(p.frameworks).toEqual(expect.arrayContaining(['fastapi', 'sqlalchemy']));
    expect(p.migrations).toEqual(['alembic/versions/001_init.py']);
    expect(Object.keys(p.criticalCandidates)).toContain('autenticacion');
  });
  it('reads a .NET project', () => {
    const p = scanProject(project({ 'Shop.sln': '', 'Shop/Shop.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web"/>', 'Shop/Program.cs': 'x', 'Shop.Tests/OrderTests.cs': 'x', 'obj/x.cs': 'ignored' }));
    expect(p.stack).toBe('dotnet');
    expect(p.testFiles).toBe(1);
    expect(p.sourceFiles).toBe(1);
    expect(p.testRunner).toBe('dotnet-test');
    expect(p.frameworks).toContain('aspnetcore');
  });
  it('reads a Java project and ignores target/', () => {
    const p = scanProject(project({ 'pom.xml': '<artifactId>spring-boot-starter</artifactId>', 'src/main/java/App.java': 'x', 'src/test/java/AppTest.java': 'x', 'target/classes/A.java': 'ignored' }));
    expect(p.stack).toBe('jvm');
    expect(p.testFiles).toBe(1);
    expect(p.sourceFiles).toBe(1);
    expect(p.testRunner).toBe('junit');
    expect(p.frameworks).toContain('spring-boot');
  });
  it('flags a Python project without tests', () => {
    const p = scanProject(project({ 'requirements.txt': '', 'app.py': 'x' }));
    expect(p.testRunner).toBe('none');
    expect(p.testFiles).toBe(0);
  });
});

describe('runChecks / measureCoverage with other stacks', () => {
  const py = scanProject(project({ 'requirements.txt': '', 'app.py': 'x', 'test_app.py': 'x' }));
  it('runs the Python defaults step by step and stops a check at its first failing step', () => {
    const calls: string[] = [];
    const r = runChecks(py, (c, a) => (calls.push(`${c} ${a.join(' ')}`), { status: 0, timedOut: false, output: '', ms: 1 }), undefined, null);
    expect(calls[0]).toBe('python3 -m venv .venv');
    expect(calls).toContain('.venv/bin/python -m pytest -q');
    expect(Object.fromEntries(r.map((c) => [c.name, c.status]))).toMatchObject({ instalacion: 'ok', pruebas: 'ok', compilacion: 'ausente' });

    const seen: string[] = [];
    const bad = runChecks(py, (c, a) => (seen.push(c), a.includes('venv') ? { status: 1, timedOut: false, output: 'sin venv', ms: 1 } : { status: 0, timedOut: false, output: '', ms: 1 }), undefined, null);
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatchObject({ name: 'instalacion', status: 'fallo' });
    expect(bad[0]!.output).toContain('sin venv');
    expect(seen).toHaveLength(1); // the rest of the chain never ran
  });
  it('declared commands override defaults', () => {
    const calls: string[] = [];
    runChecks(py, (c, a) => (calls.push(`${c} ${a.join(' ')}`), { status: 0, timedOut: false, output: '', ms: 1 }), undefined, { test: 'tox -q' });
    expect(calls).toContain('tox -q');
  });
  it('coverage runs the stack command and reads its report; failing command or missing report is null', () => {
    const root = project({ 'requirements.txt': '', 'app.py': 'x', 'coverage.xml': '<coverage line-rate="0.8125" branch-rate="0"></coverage>' });
    const p = scanProject(root);
    expect(measureCoverage(p, ok, undefined, null)).toBe(81.25);
    expect(measureCoverage(p, () => ({ status: 1, timedOut: false, output: '', ms: 1 }), undefined, null)).toBeNull();
    expect(measureCoverage(scanProject(project({ 'requirements.txt': '', 'app.py': 'x' })), ok, undefined, null)).toBeNull();
  });
  it('the safety net accepts a Python project like a Node one', () => {
    const checks = runChecks(py, ok, undefined, null);
    const r = evaluateSafetyNet({ profile: py, checks, coverage: 90, net: { flows: {} }, mapText: null, exists: () => true });
    expect(r.problems.join(' ')).not.toContain('sin red de seguridad');
    expect(r.problems.join(' ')).not.toContain('script "test"');
  });
});

describe('coverage parsers', () => {
  it('Cobertura XML (coverage.py, coverlet)', () => {
    expect(parseCobertura('<?xml version="1.0"?><coverage version="7" line-rate="0.5" branch-rate="0.1"><packages/></coverage>')).toBe(50);
    expect(parseCobertura('<coverage branch-rate="0.1"/>')).toBeNull();
    expect(parseCobertura('<coverage line-rate="abc"/>')).toBeNull();
    expect(parseCobertura('<coverage line-rate="7"/>')).toBeNull();
  });
  it('JaCoCo XML uses the report-level LINE counter (the last one)', () => {
    const xml = '<report name="x"><package><counter type="LINE" missed="50" covered="50"/></package><counter type="INSTRUCTION" missed="1" covered="9"/><counter type="LINE" missed="10" covered="30"/></report>';
    expect(parseJacoco(xml)).toBe(75);
    expect(parseJacoco('<report><counter type="LINE" missed="0" covered="0"/></report>')).toBeNull();
    expect(parseJacoco('<report/>')).toBeNull();
  });
  it('detects the format and never invents a number', () => {
    expect(parseCoverageReport('{"total":{"lines":{"pct":88.5}}}')).toBe(88.5);
    expect(parseCoverageReport('<report><counter type="LINE" missed="1" covered="3"/></report>')).toBe(75);
    expect(parseCoverageReport('<coverage line-rate="1"/>')).toBe(100);
    expect(parseCoverageReport('basura')).toBeNull();
    expect(parseCoverageReport('{ roto')).toBeNull();
  });
  it('finds reports behind a * folder (dotnet writes a GUID folder)', () => {
    const root = project({ 'coverage/3f2a/coverage.cobertura.xml': '<coverage line-rate="0.9"/>' });
    expect(findReport(root, 'coverage/*/coverage.cobertura.xml')).toContain('3f2a');
    expect(findReport(root, 'nada/*/x.xml')).toBeNull();
  });
});

describe('derived gates', () => {
  it('builds gates from commands and keeps the quick/full split', () => {
    const g = gatesFromCommands({ build: 'dotnet build', lint: 'dotnet format --verify-no-changes', test: 'dotnet test' });
    expect(g.map((x) => [x.name, x.tier])).toEqual([['compilacion', 'rapida'], ['linter', 'rapida'], ['pruebas', 'completa']]);
  });
  it('a product without a test command gets a gate that fails, never a silent green', () => {
    const g = gatesFromCommands({ build: 'make' });
    expect(g.find((x) => x.name === 'pruebas')?.command).toBe(process.execPath);
  });
  it('docs gate in generic mode covers any language and ignores tests', () => {
    expect(docsGate(['app/orders.py'], true).ok).toBe(false);
    expect(docsGate(['src/Orders.cs'], true).ok).toBe(false);
    expect(docsGate(['src/main/java/Orders.java'], true).ok).toBe(false);
    expect(docsGate(['tests/test_orders.py', 'src/test/java/OrdersTest.java', 'Shop.Tests/OrderTests.cs'], true).ok).toBe(true);
    expect(docsGate(['app/orders.py', 'docs/modules/orders.md'], true).ok).toBe(true);
    expect(docsGate(['app/orders.py'], false).ok).toBe(true); // kit layout unchanged
  });
});

describe('risk for other stacks', () => {
  it.each([
    'alembic/versions/0002_add.py', 'Shop/Migrations/20240101_Init.cs', 'db/migrate/20240101_x.rb', 'src/main/resources/db/migration/V2__x.sql',
    'app/auth/login.py', 'src/main/java/AuthService.java', 'Shop/PermissionGuard.cs', 'app/rbac.py', 'product.config.yaml',
    'app/payments/charge.py', 'Shop/BillingService.cs',
  ])('%s is high', (f) => expect(classifyFile(f).level).toBe('alto'));
  it.each(['requirements.txt', 'pyproject.toml', 'Shop/Shop.csproj', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'go.mod'])('%s is at least medium', (f) =>
    expect(classifyFile(f).level).not.toBe('bajo'));
  it('keeps ordinary code medium and docs low', () => {
    expect(classifyFile('app/orders.py').level).toBe('medio');
    expect(classifyFile('docs/modules/x.md').level).toBe('bajo');
  });
});
