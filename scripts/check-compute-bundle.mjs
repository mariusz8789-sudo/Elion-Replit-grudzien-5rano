/**
 * Straż przed rozjazdem logiki naukowej (scientific logic drift).
 *
 * Backendowy silnik obliczeniowy wykonuje `packages/backend/src/compute/core.bundle.mjs`,
 * generowany z frontendowego `serverEntry.ts`. Jeśli ktoś zmieni wzór w
 * physics.ts / *Graph.ts i NIE przegeneruje bundla, backend liczyłby po staremu.
 * Ten skrypt regeneruje bundle do pliku tymczasowego i porównuje z zatwierdzonym
 * — różnica = błąd (uruchom `npm run compute:bundle` i zacommituj). Wpinane w
 * bramkę weryfikacji, więc drift nie przejdzie niezauważony.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const committed = path.join(root, 'packages/backend/src/compute/core.bundle.mjs');
const tmp = path.join(mkdtempSync(path.join(tmpdir(), 'genesis-bundle-')), 'core.bundle.mjs');

execFileSync(
  path.join(root, 'node_modules/.bin/esbuild'),
  [
    'packages/frontend/src/core/compute/serverEntry.ts',
    '--bundle', '--format=esm', '--platform=node', '--target=node22',
    '--legal-comments=none', `--outfile=${tmp}`,
  ],
  { cwd: root },
);

const a = readFileSync(committed, 'utf8');
const b = readFileSync(tmp, 'utf8');
if (a !== b) {
  console.error('✗ DRIFT: core.bundle.mjs jest nieaktualny względem serverEntry.ts.');
  console.error('  Uruchom `npm run compute:bundle` i zacommituj wynik.');
  process.exit(1);
}
console.log('✓ core.bundle.mjs zsynchronizowany z frontendowym rdzeniem obliczeniowym.');
