/**
 * Candidate Generation Engine v2 — generation → RDKit/ADMET evaluation → deterministic ranking →
 * Discovery Dossier. Logic is exercised with injected FAKE engines (fast, no Python); a guarded
 * integration test drives the REAL RDKit + ADMET-AI engines when installed.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCandidateLibrary, evaluateCandidates, rankCandidateLibrary,
  runCandidateGenerationV2, DEFAULT_SEEDS,
  CANDIDATE_GEN_V2_VERSION, RANKING_POLICY_V2, GEN_STATUS,
} from './cognitive/candidateGenV2.mjs';
import * as rdkit from './compute/rdkitAdapter.mjs';
import * as admet from './compute/admetAdapter.mjs';

/**
 * Deterministic fake engines. transform() fans out by appending a per-transformation token, so BFS
 * grows the library predictably; descriptors/alerts/sa/admet are pure functions of the SMILES text.
 */
function fakeEngines({ rdkitOn = true, admetOn = true, transformations = ['a', 'b', 'c', 'd', 'e', 'f'] } = {}) {
  const calls = { admetPredict: 0 };
  return {
    calls,
    rdkitDetect: () => ({ available: rdkitOn }),
    admetDetect: () => ({ available: admetOn, reason: admetOn ? undefined : 'not installed' }),
    validate: (s) => ({ ok: true, canonicalSmiles: String(s) }),
    listTransformations: () => (rdkitOn ? { ok: true, transformations } : { ok: false, reason: 'BLOCKED_BY_RUNTIME' }),
    transform: (s, t) => ({ ok: true, products: [`${s}-${t}`], parentCanonical: s, transformation: t }),
    descriptors: (s) => ({ ok: true, data: { molWt: 100 + s.length, lipinskiViolations: s.length % 5, tpsa: 40 + (s.length % 100), hbd: 1, hba: 3 } }),
    alerts: (s) => ({ ok: true, alerts: s.length % 3 === 0 ? ['x'] : [], nAlerts: s.length % 3 }),
    saScore: (s) => ({ ok: true, saScore: 1 + (s.length % 9) }),
    admetPredict: (list) => { calls.admetPredict++; return { ok: true, predictions: Object.fromEntries(list.map((s) => [s, { QED: (s.length % 10) / 10, molecular_weight: 100 }])) }; },
  };
}

describe('candidateGenV2 — generation reaches the target library size', () => {
  test('generates >= 100 unique candidates deterministically from the default seeds', () => {
    const eng = fakeEngines();
    const lib = generateCandidateLibrary({ engines: eng, minCandidates: 100 });
    assert.equal(lib.ok, true);
    assert.ok(lib.candidates.length >= 100, `got ${lib.candidates.length}`);
    // all unique canonical SMILES
    assert.equal(new Set(lib.candidates.map((c) => c.canonicalSmiles)).size, lib.candidates.length);
    // seeds are present as generation 0
    assert.equal(lib.candidates.filter((c) => c.generation === 0).length, DEFAULT_SEEDS.length);
  });

  test('is reproducible — identical seeds produce the identical library (order + ids)', () => {
    const a = generateCandidateLibrary({ engines: fakeEngines(), minCandidates: 100 });
    const b = generateCandidateLibrary({ engines: fakeEngines(), minCandidates: 100 });
    assert.deepEqual(a.candidates.map((c) => c.candidateId), b.candidates.map((c) => c.candidateId));
  });

  test('respects maxCandidates as a hard cap', () => {
    const lib = generateCandidateLibrary({ engines: fakeEngines(), minCandidates: 100, maxCandidates: 60 });
    assert.ok(lib.candidates.length <= 60, `got ${lib.candidates.length}`);
  });

  test('no valid seeds → fail closed (no fabricated candidates)', () => {
    const eng = fakeEngines();
    eng.validate = () => ({ ok: false });
    const lib = generateCandidateLibrary({ engines: eng, minCandidates: 100 });
    assert.equal(lib.ok, false);
    assert.equal(lib.candidates.length, 0);
  });
});

describe('candidateGenV2 — evaluation', () => {
  test('attaches RDKit + ADMET outputs and batches ADMET (chunked, never per-candidate)', () => {
    const eng = fakeEngines();
    const lib = generateCandidateLibrary({ engines: eng, minCandidates: 100 });
    const evaluated = evaluateCandidates(lib.candidates, eng);
    assert.equal(evaluated.length, lib.candidates.length);
    // ADMET runs as chunked batches (50/call), far fewer than one-per-candidate.
    assert.equal(eng.calls.admetPredict, Math.ceil(lib.candidates.length / 50));
    assert.ok(eng.calls.admetPredict < lib.candidates.length);
    assert.ok(evaluated.every((c) => c.engineOutputs.rdkit.ok && c.engineOutputs.admet.ok));
    assert.ok(evaluated.every((c) => c.engineOutputs.admet.predictions && typeof c.engineOutputs.admet.predictions.QED === 'number'));
    assert.ok(evaluated.every((c) => c.epistemicStatus === 'COMPUTATIONAL_CANDIDATE'));
  });

  test('a blocked ADMET engine is honestly recorded, never fabricated', () => {
    const eng = fakeEngines({ admetOn: false });
    const lib = generateCandidateLibrary({ engines: eng, minCandidates: 100 });
    const evaluated = evaluateCandidates(lib.candidates, eng);
    assert.equal(eng.calls.admetPredict, 0);
    assert.ok(evaluated.every((c) => c.engineOutputs.admet.status === 'BLOCKED_BY_RUNTIME'));
  });
});

describe('candidateGenV2 — ranking', () => {
  test('ranking is deterministic, contiguous, and sorted by finalScore desc', () => {
    const eng = fakeEngines();
    const lib = generateCandidateLibrary({ engines: eng, minCandidates: 100 });
    const ranking = rankCandidateLibrary(evaluateCandidates(lib.candidates, eng));
    assert.equal(ranking.length, lib.candidates.length);
    for (let i = 1; i < ranking.length; i++) {
      assert.ok(ranking[i - 1].finalScore >= ranking[i].finalScore, 'scores must be non-increasing');
      assert.equal(ranking[i].rank, i + 1);
      // tie-break: equal score ⇒ candidateId ascending
      if (ranking[i - 1].finalScore === ranking[i].finalScore) {
        assert.ok(ranking[i - 1].candidateId.localeCompare(ranking[i].candidateId) <= 0);
      }
    }
    assert.ok(ranking.every((r) => r.finalScore >= 0 && r.finalScore <= 1));
    assert.ok(ranking.every((r) => r.rankingPolicyVersion === RANKING_POLICY_V2));
  });
});

describe('candidateGenV2 — orchestrator + dossier', () => {
  test('full run generates >= 100, ranks, and writes an honest dossier', () => {
    const result = runCandidateGenerationV2({ engines: fakeEngines(), minCandidates: 100 });
    assert.equal(result.status, GEN_STATUS.COMPLETED_RANKED);
    assert.ok(result.candidates.length >= 100);
    assert.equal(result.ranking.length, result.candidates.length);
    const d = result.dossier;
    assert.equal(d.schema, 'genesis-discovery-dossier/2');
    assert.equal(d.engine.version, CANDIDATE_GEN_V2_VERSION);
    assert.ok(d.generation.generated >= 100);
    assert.equal(d.generation.generated, result.candidates.length);
    assert.equal(d.evaluation.rdkitEvaluated, result.candidates.length);
    assert.equal(d.evaluation.admetEvaluated, result.candidates.length);
    assert.equal(d.topCandidates.length, 10);
    assert.equal(d.didGenesisDiscoverADrug, 'NO');
    assert.ok(typeof d.dossierHash === 'string' && d.dossierHash.length >= 32);
  });

  test('the dossier hash is stable for identical inputs (reproducible)', () => {
    const a = runCandidateGenerationV2({ engines: fakeEngines(), minCandidates: 100 });
    const b = runCandidateGenerationV2({ engines: fakeEngines(), minCandidates: 100 });
    assert.equal(a.dossier.dossierHash, b.dossier.dossierHash);
  });

  test('RDKit unavailable → CAPABILITY_BLOCKED, zero candidates, no dossier fabricated', () => {
    const result = runCandidateGenerationV2({ engines: fakeEngines({ rdkitOn: false }), minCandidates: 100 });
    assert.equal(result.status, GEN_STATUS.CAPABILITY_BLOCKED);
    assert.equal(result.candidates.length, 0);
    assert.equal(result.dossier, null);
    assert.equal(result.engineMatrix.RDKit.status, 'BLOCKED_BY_RUNTIME');
  });
});

// ── Real-engine integration (guarded — runs only when RDKit + ADMET-AI are installed) ──────────────
const realRdkit = rdkit.detect().available;
const realAdmet = admet.detect().available;
describe('candidateGenV2 — REAL RDKit + ADMET-AI integration', () => {
  (realRdkit && realAdmet ? test : test.skip)('generates + evaluates + ranks a real library end-to-end', () => {
    const result = runCandidateGenerationV2({ minCandidates: 12, maxCandidates: 40 });
    assert.equal(result.status, GEN_STATUS.COMPLETED_RANKED);
    assert.ok(result.candidates.length >= 12, `got ${result.candidates.length}`);
    // real RDKit descriptors present
    assert.ok(result.candidates.every((c) => c.engineOutputs.rdkit.ok && c.engineOutputs.rdkit.descriptors));
    assert.ok(result.candidates.some((c) => typeof c.engineOutputs.rdkit.descriptors.molWt === 'number'));
    // real ADMET inference present on at least some candidates
    assert.ok(result.candidates.some((c) => c.engineOutputs.admet.ok && c.engineOutputs.admet.predictions));
    // ranking sane + dossier honest
    assert.equal(result.ranking.length, result.candidates.length);
    assert.equal(result.dossier.didGenesisDiscoverADrug, 'NO');
  });
});
