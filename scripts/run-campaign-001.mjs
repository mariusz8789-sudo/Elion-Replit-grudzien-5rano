/**
 * ONE-COMMAND external execution of GENESIS Real Scientific Campaign #001.
 *
 *   node scripts/run-campaign-001.mjs [--out <bundleDir>] [--with-structure]
 *
 * Runs, FAIL-CLOSED at every stage:
 *   1) preflight (deps + genuine network reachability, per-source diagnostics)
 *   2) acquire genuine payloads (UniProt/ChEMBL/PubChem/Europe PMC/RCSB) → SHA-256 + provenance
 *   3) verify the VERIFIED_BUNDLE (hash/provenance/identity — bundle adapter, fail-closed)
 *   4) execute Campaign #001 on the REAL bundle → RDKit + ADMET-AI + every applicable engine
 *      → MCRE conflicts → deterministic ranking → Truth-Engine final gate → Discovery Dossier
 *
 * If genuine evidence is unavailable, it aborts (does NOT fabricate, does NOT use fixtures).
 * Docking runs ONLY if a prepared receptor is provided; otherwise it is BLOCKED_BY_RUNTIME.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBundle } from '../packages/backend/src/corpus/bundleAdapter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const BUNDLE = path.resolve(opt('--out', path.resolve(__dirname, '../campaigns/real-scientific-campaign-001/bundle')));
// PATH B — externally supplied official payloads (NO egress from this runner): the operator has
// already downloaded the OFFICIAL payloads and placed them + SUPPLIED_INPUTS.json in --supplied.
const SUPPLIED = opt('--supplied', null);
const node = process.execPath;
const run = (script, args = []) => spawnSync(node, [path.join(__dirname, script), ...args], { stdio: 'inherit' }).status ?? 1;

console.log('╔══ GENESIS CAMPAIGN #001 — ONE-COMMAND EXTERNAL EXECUTION ══╗');

if (SUPPLIED) {
  // Offline assembly from operator-supplied official payloads — no preflight, no network.
  console.log(`[mode] EXTERNALLY-SUPPLIED PAYLOADS (offline) from ${path.resolve(SUPPLIED)}`);
  if (run('build-bundle-from-supplied.mjs', ['--supplied', path.resolve(SUPPLIED), '--out', BUNDLE]) !== 0) {
    console.error('ABORT: offline bundle assembly failed closed — a supplied payload was missing/unusable/mislabelled. Nothing fabricated.');
    process.exit(2);
  }
} else {
  // 1) Preflight — fail closed.
  if (run('preflight-campaign-001.mjs') !== 0) { console.error('ABORT: preflight failed (deps or mandatory network). Nothing acquired, nothing fabricated.'); process.exit(2); }

  // 2) Acquire — the builder fails closed (exit 2) if any mandatory source is missing.
  const buildArgs = ['--out', BUNDLE, ...(argv.includes('--with-structure') ? ['--with-structure'] : [])];
  if (run('build-real-campaign-001-bundle.mjs', buildArgs) !== 0) { console.error('ABORT: acquisition failed closed — mandatory real evidence unavailable. See acquisition-diagnostics.json.'); process.exit(2); }
}

// 3) Verify the bundle (SHA-256 / provenance / identity) — fail closed.
try {
  const v = openBundle(BUNDLE).verifyAll();
  if (!v.ok) { console.error('ABORT: bundle verification FAILED:', JSON.stringify(v.results.filter((r) => !r.ok))); process.exit(2); }
  console.log(`[verify] bundle OK — ${v.results.length} entries SHA-256 verified.`);
} catch (e) { console.error('ABORT: bundle could not be opened/verified (fail closed):', e.message); process.exit(2); }

// 4) Execute the campaign on the REAL bundle → dossier.
if (run('genesis-campaign-001.mjs', ['--bundle', BUNDLE]) !== 0) { console.error('ABORT: campaign execution failed.'); process.exit(1); }

// Provenance (genuine VERIFIED_BUNDLE vs a TEST_FIXTURE self-check) is stamped in the bundle
// manifest and reflected verbatim in the dossier — the runner does not assert it.
console.log('╚══ DONE — Campaign #001 executed. Provenance = bundle manifest ingestionMode. DID GENESIS FIND A DRUG? NO. ══╝');
