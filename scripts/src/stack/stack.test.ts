import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { measureCoverage, minimalEnv, runChecks, type Runner } from '../onboard/checks.ts';
import { evaluateSafetyNet } from '../onboard/gate.ts';
import { scanProject } from '../onboard/scan.ts';
import { docsGate, gatesFromCommands, resolveGates, runGate, runGates, GATES } from '../gates.ts';
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
    const root = project({ 'requirements.txt': '', 'app.py': 'x' });
    const p = scanProject(root);
    const writes: Runner = (_c, _a, cwd) => (writeFileSync(join(cwd, 'coverage.xml'), '<coverage line-rate="0.8125" branch-rate="0"></coverage>'), { status: 0, timedOut: false, output: '', ms: 1 });
    expect(measureCoverage(p, writes, undefined, null)).toBe(81.25);
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

describe('review fixes', () => {
  it('auth, permissions and security by folder are high in any language (finding 1)', () => {
    for (const f of ['auth/utils.py', 'auth/__init__.py', 'Auth/Handlers.cs', 'app/permissions/base.py', 'Permissions/Base.cs', 'src/main/java/security/Config.java', 'SecurityConfig.java', 'app/passwords.py', 'Views/Login.cshtml', 'db/schema.rb', 'Jenkinsfile', 'azure-pipelines.yml', 'scripts/src/stack/commands.ts', 'scripts/src/onboard/checks.ts']) {
      expect(classifyFile(f).level, f).toBe('alto');
    }
  });
  it('a comment after a quoted value is not part of the command (finding 3)', () => {
    expect(parseStackConfig('commands:\n  test: "pytest -q"  # run\n').commands).toEqual({ test: 'pytest -q' });
    expect(parseStackConfig("commands:\n  test: 'pytest -q'\n").commands).toEqual({ test: 'pytest -q' });
    expect(() => parseStackConfig('commands:\n  test: "pytest\n')).toThrow(/comillas/);
  });
  it('invalid stack_profile, repeated keys, block scalars and null bytes fail with the key name (findings 10, 16)', () => {
    expect(() => parseStackConfig('stack_profile: pyhton\n')).toThrow(/stack_profile/);
    expect(parseStackConfig('stack_profile: "python"\n').profile).toBe('python');
    expect(() => parseStackConfig('commands:\n  test: a\n  test: b\n')).toThrow(/repetida/);
    expect(() => parseStackConfig('commands:\n  test: |\n    pytest\n')).toThrow(/commands\.test/);
    expect(() => parseSteps('a\0b')).toThrow();
  });
  it('coverage_report must stay inside the project (audit A3)', () => {
    for (const bad of ['/etc/passwd', '../x.xml', 'a/../../x.xml', 'C:/x.xml']) expect(() => parseStackConfig(`commands:\n  coverage_report: ${bad}\n`)).toThrow(/coverage_report/);
    expect(() => parseStackConfig('commands:\n  coverage_report: coverage/*/c.xml\n')).not.toThrow();
  });
  it('forged or degenerate reports never yield a made-up number (audit A3)', () => {
    expect(parseCoverageReport('{"total":{"lines":{"pct":150}}}')).toBeNull();
    expect(parseCoverageReport('{"total":{"lines":{"pct":-5}}}')).toBeNull();
    expect(parseCobertura('<!-- <coverage line-rate="1"/> --><coverage line-rate="0.2"/>')).toBe(20);
    expect(parseCobertura('<coverage line-rate="1" lines-valid="0"/>')).toBeNull();
    expect(parseJacoco('<!-- <counter type="LINE" missed="0" covered="9"/> --><report><counter type="LINE" missed="9" covered="1"/></report>')).toBe(10);
  });
  it('with several GUID folders the newest report wins (finding 7)', async () => {
    const root = project({ 'coverage/old/c.xml': '<coverage line-rate="0.1"/>' });
    await new Promise((r) => setTimeout(r, 20));
    mkdirSync(join(root, 'coverage/new'), { recursive: true });
    writeFileSync(join(root, 'coverage/new/c.xml'), '<coverage line-rate="0.9"/>');
    expect(readFileSync(findReport(root, 'coverage/*/c.xml')!, 'utf8')).toContain('0.9');
  });
  it('a stale report is deleted before measuring, so a planted file cannot pass (audit A3)', () => {
    const root = project({ 'requirements.txt': '', 'app.py': 'x', 'coverage.xml': '<coverage line-rate="1"/>' });
    const p = scanProject(root);
    expect(measureCoverage(p, ok, undefined, { coverage: 'true' })).toBeNull(); // the command never wrote a report
    expect(existsSync(join(root, 'coverage.xml'))).toBe(false);
  });
  it('projects run with a private HOME, never the real one (audit A2)', () => {
    const root = project({ 'a.txt': '' });
    const env = minimalEnv(root);
    expect(env.HOME).toBe(join(root, '.factory-state', 'home'));
    expect(env.HOME).not.toBe(process.env.HOME);
    expect(Object.keys(env).join(' ')).not.toMatch(/TOKEN|KEY|SECRET/i);
  });
  it('the incorporation gate says how to fix coverage and tests per stack (finding 9)', () => {
    const pyNoCov = evaluateSafetyNet({ profile: scanProject(project({ 'requirements.txt': '', 'a.py': 'x', 'test_a.py': 'x' })), checks: [{ name: 'pruebas', status: 'ok', ms: 1, output: '' }], coverage: null, net: null, mapText: null, exists: () => true });
    expect(pyNoCov.problems.join(' ')).toContain('pytest-cov');
    const java = scanProject(project({ 'pom.xml': '', 'src/main/java/A.java': 'x' }));
    const j = evaluateSafetyNet({ profile: java, checks: [{ name: 'pruebas', status: 'ausente', ms: 0, output: '' }], coverage: null, net: null, mapText: null, exists: () => true });
    expect(j.problems.join(' ')).toContain('JaCoCo');
    expect(j.problems.join(' ')).toContain('commands.test');
  });
});

describe('gate runner with derived gates (finding 8)', () => {
  const inDir = <T,>(root: string, fn: () => T): T => {
    const prev = process.cwd();
    process.chdir(root);
    try { return fn(); } finally { process.chdir(prev); }
  };
  it('a failing step stops the next ones and keeps the last output lines', () => {
    const root = project({ 'marker': '' });
    const node = process.execPath;
    const g = { name: 'pruebas', command: node, args: [], tier: 'completa' as const, sandbox: true, steps: [[node, ['-e', 'console.error("boom");process.exit(3)']], [node, ['-e', 'require("fs").writeFileSync("ran","1")']]] as [string, string[]][] };
    const r = inDir(root, () => runGate(g));
    expect(r.status).toBe('fallo');
    expect(r.output).toContain('boom');
    expect(existsSync(join(root, 'ran'))).toBe(false);
  });
  it('derived gates run without CI secrets in the environment (audit A1)', () => {
    process.env.FAKE_CI_TOKEN = 'supersecret';
    const root = project({ 'marker': '' });
    const node = process.execPath;
    const g = { name: 'pruebas', command: node, args: [], tier: 'completa' as const, sandbox: true, steps: [[node, ['-e', 'if (process.env.FAKE_CI_TOKEN) {console.error("LEAK");process.exit(1)}']]] as [string, string[]][] };
    expect(inDir(root, () => runGate(g)).status).toBe('ok');
    delete process.env.FAKE_CI_TOKEN;
  });
  it('without commands the gates are exactly the starter kit gates; with an empty block the test gate fails', () => {
    expect(inDir(project({ 'product.config.yaml': 'name: x\n' }), () => resolveGates())).toEqual({ gates: GATES, generic: false });
    const empty = inDir(project({ 'product.config.yaml': 'name: x\ncommands:\n' }), () => resolveGates());
    expect(empty.generic).toBe(true);
    expect(empty.gates.map((g) => g.name)).toEqual(['pruebas']);
    expect(inDir(project({ 'product.config.yaml': 'name: x\ncommands:\n' }), () => runGate(empty.gates[0]!)).status).toBe('fallo');
  });
  it('an invalid product.config.yaml is a red gate, not a crash', () => {
    const root = project({ 'product.config.yaml': 'commands:\n  test: pytest; rm -rf x\n' });
    const state = inDir(root, () => runGates({ job: 'j', statePath: join(root, 's.json'), tier: 'completa', files: [] }));
    expect(state.gates.configuracion?.status).toBe('fallo');
    expect(state.gates.configuracion?.output).toContain('commands.test');
  });
});
