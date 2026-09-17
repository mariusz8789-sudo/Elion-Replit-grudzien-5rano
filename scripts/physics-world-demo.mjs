#!/usr/bin/env node
/**
 * PHYSICS WORLD — integration demonstrator (docs/DECISIONS.md D-052).
 * Runs the four toy models once each with real replay verification, then
 * runs DEMO5 (the z-scaling hypothesis test) through the existing Genesis
 * Adjudication Protocol (D-047) — no second adjudication engine.
 *
 *   node scripts/physics-world-demo.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const bundleDir = mkdtempSync(path.join(tmpdir(), 'genesis-physics-world-'));
const out = path.join(bundleDir, 'physics-world.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  path.join(REPO, 'packages/frontend/src/core/physicsWorld/genesisAdapter.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${out}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const mod = await import(out);

console.log('GENESIS — PHYSICS WORLD — integration demonstrator');
console.log(`node ${process.version}\n`);

const toyDefs = [
  {
    label: 'M-TRANSPORT-001 (charged particle transport, toy)', modelId: 'M-TRANSPORT-001', observable: 'residual energy', seed: 11,
    parameters: [
      { name: 'z', value: 2, unit: 'e', min: 1, max: 10, required: true },
      { name: 'E0_MeV', value: 200, unit: 'MeV', min: 10, max: 500, required: true },
      { name: 'mat_Z', value: 13, unit: '-', min: 1, max: 92, required: true },
      { name: 'mat_A', value: 27, unit: '-', min: 1, max: 250, required: true },
      { name: 'rho_g_cm3', value: 2.7, unit: 'g/cm3', min: 0.1, max: 25, required: true },
      { name: 'thickness_cm', value: 0.5, unit: 'cm', min: 0.01, max: 10, required: true },
    ],
  },
  {
    label: 'M-ATOM-001 (diatomic Lennard-Jones bond, toy)', modelId: 'M-ATOM-001', observable: 'bond length', seed: 12,
    parameters: [
      { name: 'epsilon', value: 1, unit: 'arb', min: 0.01, max: 10, required: true },
      { name: 'sigma', value: 1, unit: 'arb', min: 0.1, max: 5, required: true },
      { name: 'r0', value: 1.1, unit: 'sigma', min: 0.8, max: 3, required: true },
      { name: 'mass', value: 1, unit: 'arb', min: 0.1, max: 100, required: true },
      { name: 'dt', value: 0.01, unit: 'arb', min: 0.0001, max: 0.1, required: true },
      { name: 'steps', value: 2000, unit: '-', min: 10, max: 100000, required: true },
    ],
  },
  {
    label: 'M-COUL-001 (Rutherford scattering cross-check, toy)', modelId: 'M-COUL-001', observable: 'scattering angle', seed: 13,
    parameters: [
      { name: 'q1q2', value: 1, unit: 'arb', min: 0.01, max: 10, required: true },
      { name: 'E', value: 1, unit: 'arb', min: 0.01, max: 100, required: true },
      { name: 'b', value: 1, unit: 'arb', min: 0.1, max: 50, required: true },
      { name: 'm', value: 1, unit: 'arb', min: 0.1, max: 100, required: true },
    ],
  },
  {
    label: 'M-HE-001 (event-detector-analysis pipeline demo, toy)', modelId: 'M-HE-001', observable: 'invariant mass', seed: 14,
    parameters: [
      { name: 'resonanceMass', value: 91.19, unit: 'GeV', min: 1, max: 1000, required: true },
      { name: 'width', value: 2.5, unit: 'GeV', min: 0.1, max: 50, required: true },
      { name: 'nEvents', value: 4000, unit: '-', min: 100, max: 1000000, required: true },
      { name: 'sigmaDetector', value: 1.5, unit: 'GeV', min: 0.01, max: 10, required: true },
    ],
  },
];

for (const [i, spec] of toyDefs.entries()) {
  const def = {
    experimentId: `DEMO${i + 1}`, problemId: 'P-DEMO', hypothesisId: 'H-DEMO',
    modelId: spec.modelId, observable: spec.observable, seed: spec.seed, toyAccepted: true,
    provenance: [{ source: 'genesis-physics-world:internal', retrievedAt: '1970-01-01T00:00:00Z' }],
    parameters: spec.parameters,
  };
  const rec = mod.runExperiment(def);
  const replayMatch = mod.replay(def, rec);
  console.log(`DEMO${i + 1} — ${spec.label}`);
  console.log(`  status: ${rec.status}  toy: ${rec.toy}`);
  console.log(`  disclosure: ${rec.disclosure}`);
  console.log(`  reproducibilityFingerprint: ${rec.reproducibilityFingerprint}  (fnv1a hex, real Genesis hash provider — see core.ts)`);
  console.log(`  replay (real re-run) matches: ${replayMatch}`);
  console.log(`  summary: ${JSON.stringify(rec.result.summary)}`);
  console.log();
}

console.log('DEMO5 — z-scaling hypothesis test, decided via D-047 (Genesis Adjudication Protocol):');
const loop = mod.demo5GenesisLoop();
for (const h of loop.hypotheses) {
  console.log(`  ${h.hypothesisId}: "${h.claim}" — held=${h.held}  ratio=${h.ratio.toFixed(4)}  ruleFingerprint=${h.ruleFingerprint}  inputFingerprint=${h.inputFingerprint}`);
}
console.log(`  verdict: ${loop.verdict}  winner: ${loop.winner ?? '(none)'}`);
console.log(`  note: ${loop.note}`);

console.log('\nOK — physics-world integration demonstrator completed.');
