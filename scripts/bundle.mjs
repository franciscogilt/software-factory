// Bundles a TypeScript entry point and everything it imports into one JavaScript file, so a runtime image needs only
// Node: no package manager, no node_modules, no TypeScript runner. Run from the package that owns the entry:
//   cd packages/db && node ../../scripts/bundle.mjs src/migrate.ts /out/migrate.mjs
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const [entry, outfile] = process.argv.slice(2);
if (!entry || !outfile) {
  console.error('usage: node bundle.mjs <entry.ts> <outfile.mjs>');
  process.exit(2);
}

// esbuild is a dev dependency of the calling package, so resolve it from the current directory.
const esbuildPath = createRequire(`${process.cwd()}/`).resolve('esbuild');
const esbuild = await import(pathToFileURL(esbuildPath).href);
const { build } = esbuild.build ? esbuild : esbuild.default;

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  logLevel: 'info',
  // Some dependencies are CommonJS and call require() for Node built-ins; ESM output needs this shim.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
