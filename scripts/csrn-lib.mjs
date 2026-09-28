/**
 * Shared loader for the CSRN key scripts (csrn-keygen.mjs, csrn-sign.mjs): bundles
 * the existing CSRN package and the Reviewer Room's certificate builder
 * (packages/frontend/src/core/reviewer/redockCertificate.ts) with esbuild, the same
 * way the other demonstrators bundle TypeScript, so the scripts sign exactly what
 * the browser verifies. No cryptography lives here.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_KEY_PATH = path.join(REPO, 'docs/keys/genesis-csrn-signing-key.json');
export const WELL_KNOWN_PATH = path.join(REPO, 'packages/frontend/public/.well-known/genesis-csrn-key.json');

export async function loadCsrn() {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-csrn-'));
  const entry = path.join(dir, 'entry.ts');
  writeFileSync(entry, [
    `export * from ${JSON.stringify(path.join(REPO, 'packages/csrn/src/index.ts'))};`,
    `export * from ${JSON.stringify(path.join(REPO, 'packages/frontend/src/core/reviewer/redockCertificate.ts'))};`,
  ].join('\n'));
  const out = path.join(dir, 'csrn.mjs');
  execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
    entry, '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${out}`,
  ], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
  return import(out);
}

/** The production private key must never be created or used in CI. */
export function refuseInCi(script) {
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    console.error(`${script}: refusing to run in CI. The Genesis signing key is generated and used only on the owner's own machine.`);
    process.exit(2);
  }
}

/** A private key file inside the repository could be committed by accident. */
export function assertOutsideRepo(file, script) {
  const rel = path.relative(REPO, path.resolve(file));
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    console.error(`${script}: ${file} is inside the repository. Keep the private key outside it (for example ~/genesis-csrn-private.jwk).`);
    process.exit(2);
  }
}

export function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
