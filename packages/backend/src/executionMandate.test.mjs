/**
 * D-083 — tests for the ten-point execution mandate.
 *
 * Every one of these encodes a defect that was FOUND, not imagined: two by
 * probing my own code (null and NaN in the Pareto ranking), one from the
 * reviewer's reading of a candidate package (missing pin passing as OK), one
 * by running a confirmatory split on real data and watching it collapse.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pinEntry, buildPinManifest, verifyPinManifest, mergePins } from './campaign/pinManifest.mjs';
import { tanimoto, clusterSplit, clusterSplitViability, generalizationFlag, CLUSTER_TANIMOTO_THRESHOLD } from './campaign/clusterSplit.mjs';
import { assessDualTargetAxes, rankDualTarget, VALUE_KIND } from './campaign/dualTargetDiscovery.mjs';
import { bricsRecombine, detect } from './compute/rdkitAdapter.mjs';
import { generateRecombinationProposals } from './campaign/drugAdapter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const rd = detect();
const SHA = (c) => c.repeat(64);

describe('#6 global provenance — a MISSING pin must fail, not pass', () => {
  const entry = (id, role, sha) => pinEntry({ pinId: id, role, target: 'CHEMBL1', species: 'Homo sapiens', normalizedSha256: sha, rows: 10, source: 's', license: 'l', retrievedAt: 'r' });

  it('THE REVIEWER BUG: a declared pin that did not load is FAIL_CLOSED', () => {
    // The reviewed implementation filtered on `loaded[id] !== undefined && ...`,
    // so an absent pin matched nothing and the whole manifest reported ok.
    const m = buildPinManifest([entry('gipr', 'base', SHA('a'))]);
    const r = verifyPinManifest(m, {});
    assert.equal(r.ok, false);
    assert.deepEqual(r.missing, ['gipr']);
    assert.match(r.reasons[0], /PIN_MISSING/);
  });

  it('a present pin whose bytes drifted is FAIL_CLOSED, with both hashes named', () => {
    const m = buildPinManifest([entry('p', 'base', SHA('a'))]);
    const r = verifyPinManifest(m, { p: SHA('b') });
    assert.equal(r.ok, false);
    assert.equal(r.drifted[0].pinId, 'p');
    assert.match(r.reasons[0], /PIN_DRIFT/);
  });

  it('an EMPTY manifest fails — verifying nothing is not verification', () => {
    assert.equal(verifyPinManifest(buildPinManifest([]), {}).ok, false);
  });

  it('a required role with no verified pin fails even when other pins verify', () => {
    const m = buildPinManifest([entry('ext', 'extension', SHA('a'))], { requiredRoles: ['base'] });
    const r = verifyPinManifest(m, { ext: SHA('a') });
    assert.equal(r.ok, false);
    assert.ok(r.reasons.some((x) => x.includes('REQUIRED_ROLE_UNVERIFIED')));
  });

  it('POSITIVE: every declared pin present and matching passes', () => {
    const m = buildPinManifest([entry('p', 'base', SHA('a'))]);
    assert.equal(verifyPinManifest(m, { p: SHA('a') }).ok, true);
  });

  it('negative: a non-human or malformed pin is refused at construction', () => {
    assert.throws(() => pinEntry({ pinId: 'x', role: 'base', target: 'T', species: 'Rattus norvegicus', normalizedSha256: SHA('a') }), /NON_HUMAN_PIN/);
    assert.throws(() => pinEntry({ pinId: 'x', role: 'base', target: 'T', species: 'Homo sapiens', normalizedSha256: 'short' }), /PIN_HASH_MALFORMED/);
    assert.throws(() => pinEntry({ pinId: 'x', role: 'nope', target: 'T', species: 'Homo sapiens', normalizedSha256: SHA('a') }), /UNKNOWN_PIN_ROLE/);
  });

  it('cross-pin duplicates are merged once, keeping both provenances', () => {
    const row = { canonicalSmiles: 'CCO', assayId: 'A1', standardType: 'EC50', pActivity: 7 };
    const m = mergePins({ p1: [row], p2: [row] });
    assert.equal(m.rows.length, 1);
    assert.equal(m.duplicatesRemoved, 1);
    assert.deepEqual(m.rows[0].sourcePins, ['p1', 'p2']);
  });
});

describe('#5 Pareto null handling — missing data is not a score of zero', () => {
  const A = { available: true, code: 'OK', reasons: [] };
  const assessment = assessDualTargetAxes({ glp1rProbe: () => A, giprProbe: () => A, priorArtSearched: true });
  const cand = (id, v) => ({ id, objectives: {
    GLP1R_ACTIVITY: { value: v, kind: VALUE_KIND.MODEL_ESTIMATE },
    GIPR_ACTIVITY: { value: 8, kind: VALUE_KIND.MODEL_ESTIMATE },
    LIABILITY_BURDEN: { value: 0, kind: VALUE_KIND.COMPUTED_PROPERTY },
    STRUCTURAL_FEASIBILITY: { value: 0, kind: VALUE_KIND.COMPUTED_PROPERTY },
    NOVELTY: { value: 1, kind: VALUE_KIND.COMPUTED_PROPERTY },
  } });

  it('FOUND BY PROBING: null was Number(null)=0, a silent measurement of zero — now refused', () => {
    const r = rankDualTarget([cand('nullish', null), cand('real', 5)], assessment);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'NON_FINITE_AXIS_VALUE');
    assert.match(r.reasons[0], /never a score of zero/);
  });

  it('FOUND BY PROBING: NaN was never dominated and entered the front unbeaten — now refused', () => {
    const r = rankDualTarget([cand('nan', NaN), cand('real', 5)], assessment);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'NON_FINITE_AXIS_VALUE');
  });

  it('Infinity and a numeric string are refused too', () => {
    assert.equal(rankDualTarget([cand('inf', Infinity), cand('r', 5)], assessment).code, 'NON_FINITE_AXIS_VALUE');
    assert.equal(rankDualTarget([cand('str', '7'), cand('r', 5)], assessment).code, 'NON_FINITE_AXIS_VALUE');
  });

  it('POSITIVE: all-finite candidates rank, and the dominated one is excluded', () => {
    const r = rankDualTarget([cand('weak', 3), cand('strong', 9)], assessment);
    assert.equal(r.ok, true);
    assert.deepEqual(r.front.map((c) => c.id), ['strong']);
  });
});

describe('#7 confirmatory cluster split — and its own honesty guard', () => {
  it('tanimoto is exact and refuses ragged input rather than comparing garbage', () => {
    assert.equal(tanimoto([1, 1, 0, 0], [1, 1, 0, 0]), 1);
    assert.equal(tanimoto([1, 0], [0, 1]), 0);
    assert.equal(tanimoto([1, 1, 0], [1, 0, 0]), 0.5);
    assert.throws(() => tanimoto([1, 0], [1, 0, 0]), /BITVECTOR_SHAPE/);
  });

  it('whole clusters move together, so near-identical molecules cannot straddle train/test', () => {
    const s = clusterSplit([
      { id: 'a', bits: [1, 1, 0, 0] }, { id: 'b', bits: [1, 1, 0, 0] }, { id: 'c', bits: [0, 0, 1, 1] },
    ]);
    assert.equal(s.clusters, 2);
    const bucketOf = (id) => (s.train.includes(id) ? 'train' : s.calib.includes(id) ? 'calib' : 'test');
    assert.equal(bucketOf('a'), bucketOf('b'));
    assert.equal(clusterSplit([{ id: 'a', bits: [1, 1, 0, 0] }, { id: 'b', bits: [1, 1, 0, 0] }, { id: 'c', bits: [0, 0, 1, 1] }]).fingerprint, s.fingerprint);
  });

  it('MEASURED ON REAL DATA: a degenerate split is UNMEASURED, never a finding', () => {
    // On the real GLP-1R pin this clustering produced 9 clusters with one
    // holding 217 of 287 molecules, train=51 against a frozen MIN_TRAIN of
    // 150, and an MAE of 26.2. Reporting GENERALIZATION_OVERESTIMATED from
    // that would be an impressive-looking, meaningless result.
    const degenerate = { train: new Array(51).fill('x'), calib: [], test: new Array(226).fill('y'), largestCluster: 217 };
    const v = clusterSplitViability(degenerate, { minTrain: 150, minTest: 40, totalItems: 287 });
    assert.equal(v.viable, false);
    assert.ok(v.reasons.some((r) => r.includes('MIN_TRAIN')));
    assert.ok(v.reasons.some((r) => r.includes('degenerate')));
    assert.equal(generalizationFlag(1.0425, 26.1988, 0.3, v).flag, 'UNMEASURED');
  });

  it('a viable split does produce a verdict in both directions', () => {
    const viable = { viable: true, reasons: [] };
    assert.equal(generalizationFlag(1.0, 1.5, 0.3, viable).flag, 'GENERALIZATION_OVERESTIMATED');
    assert.equal(generalizationFlag(1.0, 1.1, 0.3, viable).flag, 'CONSISTENT');
  });

  it('the confirmatory split never returns a gate decision — only a reader-facing flag', () => {
    const f = generalizationFlag(1.0, 1.5, 0.3, { viable: true, reasons: [] });
    assert.match(f.note, /DOES NOT CHANGE THE GATE/);
    assert.equal(CLUSTER_TANIMOTO_THRESHOLD, 0.35);
  });
});

describe('#4 no manual PROMOTE, #1 no duplicate engine, #2 real BRICS', () => {
  it('canPromoteToWinnerRecord is the ONLY place a PROMOTE outcome is constructed', () => {
    const gateSrc = readFileSync(path.join(HERE, '../../frontend/src/core/orchestrator/winnerGate.ts'), 'utf8');
    // The gate derives it from an empty reason list; it is never assigned literally.
    assert.match(gateSrc, /reasons\.length === 0 \? 'PROMOTE' : 'NO_PROMOTION'/);
    const recipeSrc = readFileSync(path.join(HERE, '../../frontend/src/core/discovery/molecular/mounjaroResearchRecipe.ts'), 'utf8');
    // The recipe builder only READS the outcome; it must never mint one.
    assert.ok(!/outcome:\s*'PROMOTE'/.test(recipeSrc), 'recipe builder must not construct a PROMOTE outcome');
    assert.match(recipeSrc, /canPromoteToWinnerRecord\(/);
  });

  it('the candidate generator delegates to the REAL BRICS engine, not string concatenation', () => {
    const adapterSrc = readFileSync(path.join(HERE, 'campaign/drugAdapter.mjs'), 'utf8');
    assert.match(adapterSrc, /bricsRecombine\(/);
    const workerSrc = readFileSync(path.join(HERE, 'compute/rdkit_worker.py'), 'utf8');
    assert.match(workerSrc, /BRICS\.BRICSDecompose/);
    assert.match(workerSrc, /BRICSBuild/);
  });

  it('REAL RDKit: BRICS recombination returns parseable products, not concatenated strings', { skip: !rd.available }, () => {
    const r = bricsRecombine(['CC(=O)Nc1ccc(O)cc1', 'CCOc1ccc(CNC(=O)C2CC2)cc1'], { maxProducts: 3 });
    assert.equal(r.ok, true);
    assert.ok(r.products.length > 0);
    // A string-concat generator would emit the two parents glued together.
    for (const p of r.products) {
      assert.ok(!p.includes('CC(=O)Nc1ccc(O)cc1CCOc1ccc'), 'product looks like naive concatenation');
    }
  });

  it('REAL RDKit: every generated proposal carries real lineage and re-validates', { skip: !rd.available }, () => {
    const out = generateRecombinationProposals(['CC(=O)Nc1ccc(O)cc1', 'O=C(N)c1ccc(OC)cc1', 'CCOc1ccc(CNC(=O)C2CC2)cc1'], { maxPairs: 2, maxProductsPerPair: 2 });
    assert.ok(out.proposals.length > 0);
    assert.ok(out.proposals.every((p) => p.transformation === 'brics-recombination' && typeof p.canonicalSmiles === 'string' && p.canonicalSmiles.length > 0));
    assert.ok(out.proposals.every((p) => typeof p.parentSmiles === 'string'));
  });
});
