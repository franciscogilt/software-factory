// Stack profiles: detection by marker files and default commands. Anything declared in `commands:` overrides these.
import type { Commands } from './commands.ts';

export type StackProfile = 'node' | 'python' | 'dotnet' | 'jvm' | 'desconocido';
export const STACK_PROFILES: StackProfile[] = ['node', 'python', 'dotnet', 'jvm', 'desconocido'];

// Marker files are matched on the repository root and one level down (solutions often live in src/ or backend/).
const shallow = (files: string[]) => files.filter((f) => f.split('/').length <= 2);
const hasAny = (files: string[], rx: RegExp) => shallow(files).some((f) => rx.test(f));

export function detectStack(files: string[]): StackProfile {
  if (files.includes('package.json')) return 'node';
  if (hasAny(files, /(^|\/)(pyproject\.toml|requirements[^/]*\.txt|setup\.py|Pipfile)$/)) return 'python';
  if (hasAny(files, /\.(sln|csproj|fsproj)$/)) return 'dotnet';
  if (hasAny(files, /(^|\/)(pom\.xml|build\.gradle|build\.gradle\.kts|settings\.gradle(\.kts)?)$/)) return 'jvm';
  if (files.some((f) => f.endsWith('package.json') && f.split('/').length <= 3)) return 'node';
  return 'desconocido';
}

export function resolveProfile(configured: string | null, files: string[]): StackProfile {
  if (configured && configured !== 'auto' && (STACK_PROFILES as string[]).includes(configured)) return configured as StackProfile;
  return detectStack(files);
}

const PY = '.venv/bin/python';

export function defaultCommands(stack: StackProfile, files: string[]): Commands {
  const has = (name: string) => files.includes(name);
  switch (stack) {
    case 'python': {
      const deps = has('requirements.txt') ? `${PY} -m pip install -r requirements.txt` : has('pyproject.toml') ? `${PY} -m pip install -e .` : `${PY} -m pip --version`;
      return {
        install: `python3 -m venv .venv && ${deps} && ${PY} -m pip install pytest pytest-cov`,
        test: `${PY} -m pytest -q`,
        coverage: `${PY} -m pytest -q --cov=. --cov-report=xml:coverage.xml`,
        coverage_report: 'coverage.xml',
      };
    }
    case 'dotnet':
      return {
        install: 'dotnet restore',
        build: 'dotnet build --no-restore',
        test: 'dotnet test --no-build',
        coverage: 'dotnet test --collect:"XPlat Code Coverage" --results-directory coverage',
        coverage_report: 'coverage/*/coverage.cobertura.xml',
      };
    case 'jvm': {
      if (has('pom.xml')) {
        return {
          install: 'mvn -B -q dependency:resolve',
          build: 'mvn -B -q -DskipTests package',
          test: 'mvn -B test',
          coverage: 'mvn -B test jacoco:report',
          coverage_report: 'target/site/jacoco/jacoco.xml',
        };
      }
      const gradle = has('gradlew') ? './gradlew' : 'gradle';
      return {
        install: `${gradle} --no-daemon dependencies`,
        build: `${gradle} --no-daemon build -x test`,
        test: `${gradle} --no-daemon test`,
        coverage: `${gradle} --no-daemon test jacocoTestReport`,
        coverage_report: 'build/reports/jacoco/test/jacocoTestReport.xml',
      };
    }
    default:
      return {}; // node keeps its script-based flow (see checks.ts); unknown has nothing to run
  }
}

// Declared commands win over defaults, key by key.
export function effectiveCommands(stack: StackProfile, files: string[], declared: Commands | null): Commands {
  return { ...defaultCommands(stack, files), ...(declared ?? {}) };
}
