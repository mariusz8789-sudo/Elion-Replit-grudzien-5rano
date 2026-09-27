/**
 * BRICS proof-of-capability (Phase 2 readiness — NOT Phase 2 portfolio generation).
 *
 * Runs REAL RDKit BRICS decomposition + deterministic reconstruction over a small
 * set of clearly-identified, non-sensitive, textbook reference compounds (aspirin,
 * paracetamol, ibuprofen, benzocaine). It proves the environment can execute the
 * BRICS generation stage of the Phase 2 pipeline with:
 *   - a deterministic seed/configuration,
 *   - real RDKit BRICS (not text mutation),
 *   - canonical SMILES, duplicate removal, RDKit validity checks,
 *   - an exact SHA-256 contentHash using the repository's own `canonicalHash`
 *     primitive (packages/backend/src/provenance.mjs) — preserving provenance
 *     semantics byte-for-byte.
 *
 * HONESTY: no novelty / therapeutic value / safety / binding-affinity claim is
 * made about any generated structure. This is a software-capability proof only.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalHash } from '../packages/backend/src/provenance.mjs';

const PYTHON = process.env.GENESIS_PYTHON ?? 'python3';
const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'brics_proof_worker.py');

const config = {
  purpose: 'PHASE2_READINESS_BRICS_PROOF',
  seed: 42,
  maxProducts: 24,
  minHeavyAtoms: 6,
  maxHeavyAtoms: 40,
  referenceScaffolds: {
    aspirin: 'CC(=O)Oc1ccccc1C(=O)O',
    paracetamol: 'CC(=O)Nc1ccc(O)cc1',
    ibuprofen: 'CC(C)Cc1ccc(C(C)C(=O)O)cc1',
    benzocaine: 'CCOC(=O)c1ccc(N)cc1',
  },
};

const raw = execFileSync(PYTHON, [WORKER, JSON.stringify(config)], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
  timeout: 120_000,
});
const result = JSON.parse(raw);
if (!result.ok) {
  console.error('BRICS proof FAILED:', result.error);
  process.exit(1);
}

// contentHash over the deterministic content (config + sorted canonical products),
// using the repository's canonicalHash (sha256 over key-sorted JSON serialization).
const content = {
  config,
  engine: result.engine,
  decompositionFragments: result.fragments,
  molecules: result.molecules, // already canonical + deduped + sorted by worker
  moleculeCount: result.molecules.length,
};
const contentHash = canonicalHash(content);

const report = { ...content, contentHash };
console.log(JSON.stringify(report, null, 2));
