// Fails when a production dependency has a license we have not approved. Strong copyleft (GPL, AGPL, SSPL) and
// unknown licenses are blocked unless listed in EXCEPTIONS with the reason. Run: node scripts/check-licenses.mjs
import { execFileSync } from 'node:child_process';

const ALLOWED = new Set(['MIT', 'MIT-0', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Unlicense', 'CC0-1.0', 'BlueOak-1.0.0', 'Python-2.0', '(MIT AND Zlib)', '(MIT OR CC0-1.0)', '(BSD-2-Clause OR MIT OR Apache-2.0)']);

// Reviewed one by one. Add an entry only with a written reason.
const EXCEPTIONS = {
  '@img/sharp-libvips-linux-x64': 'LGPL-3.0: native library loaded dynamically by sharp (Next image optimization); not modified or statically linked.',
  '@img/sharp-libvips-linuxmusl-x64': 'LGPL-3.0: same as above, musl build used in the Alpine image.',
  'caniuse-lite': 'CC-BY-4.0: browser-support data, attribution only.',
  'thirty-two': 'License field is missing but the package ships the MIT license text (checked).',
};

const json = JSON.parse(execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const problems = [];
for (const [license, packages] of Object.entries(json)) {
  if (ALLOWED.has(license)) continue;
  for (const pkg of packages) {
    if (!EXCEPTIONS[pkg.name]) problems.push(`${pkg.name}@${pkg.versions.join(',')}: ${license}`);
  }
}
if (problems.length > 0) {
  console.error('Unapproved licenses in production dependencies:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log(`Licenses ok (${Object.values(json).flat().length} packages checked).`);
