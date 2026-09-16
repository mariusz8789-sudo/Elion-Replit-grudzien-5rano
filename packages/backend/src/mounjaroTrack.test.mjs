/**
 * D-081 — negative-first tests for the Mounjaro/tirzepatide replacement track.
 *
 * The rule this file exists to enforce: every refusal must be REACHED, and
 * every acceptance must be REACHABLE. A gate nobody can trip is decoration; a
 * success branch nobody can enter is dead code dressed as a capability. So the
 * dual-target layer and the DAG are each driven down BOTH paths here, with
 * injected probes standing in for data this runtime does not have.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { normalizeActivityRows, writeActivityPin } from './campaign/activityDataset.mjs';
import { loadValidationGate } from './campaign/validationGate.mjs';
import { loadGiprValidationGate, loadGiprPin, trainGiprModel, probeGiprCapability, GIPR_GATE_PATH } from './campaign/giprQsar.mjs';
import { loadGlp1rValidationGate } from './campaign/glp1rQsar.mjs';
import { assessDualTargetAxes, rankDualTarget, dualTargetVerdict, DUAL_TARGET_OBJECTIVES, VALUE_KIND } from './campaign/dualTargetDiscovery.mjs';
import { runExperimentDag, compareDagRuns, EXPERIMENT_NODES, NODE_STATUS } from './campaign/experimentDag.mjs';

const withTempDir = (fn) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mounjaro-test-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

const AVAILABLE = { available: true, code: 'MODEL_VALIDATED', reasons: [] };
const BLOCKED = { available: false, code: 'GATE_NOT_MET', reasons: ['model missed its frozen gate'] };

describe('D-081 GIPR track — fail-closed, gate frozen before data', () => {
  it('the GIPR gate is frozen, self-consistent, and NOT weaker than the GLP-1R gate', () => {
    const gipr = loadGiprValidationGate();
    const glp1r = loadGlp1rValidationGate();
    assert.equal(gipr.ok, true);
    assert.equal(glp1r.ok, true);
    // Scarcer data is NOT a licence for a lower bar — the exact move D-069/D-074/D-077 forbid.
    assert.ok(gipr.gate.MIN_TRAIN >= glp1r.gate.MIN_TRAIN);
    assert.ok(gipr.gate.MIN_TEST >= glp1r.gate.MIN_TEST);
    assert.ok(gipr.gate.MAX_MAE <= glp1r.gate.MAX_MAE);
    assert.ok(gipr.gate.MIN_R2 >= glp1r.gate.MIN_R2);
  });

  it('negative: a gate edited without re-freezing is GATE_TAMPERED, never silently honoured', () => {
    withTempDir((dir) => {
      const p = path.join(dir, 'gate.json');
      writeFileSync(p, JSON.stringify({ ruleFingerprint: 'deadbeefdeadbeef', gate: { MAX_MAE: 99 } }), 'utf8');
      const r = loadValidationGate(p, { targetLabel: 'GIPR' });
      assert.equal(r.ok, false);
      assert.equal(r.code, 'GATE_TAMPERED');
    });
  });

  it('negative: a missing gate file blocks rather than falling back to a default gate', () => {
    withTempDir((dir) => {
      const r = loadValidationGate(path.join(dir, 'nope.json'), { targetLabel: 'GIPR' });
      assert.equal(r.code, 'GATE_NOT_FROZEN');
    });
  });

  it('the real GIPR pin loads and re-verifies its own sha256 (D-081a: 233 human rows arrived)', () => {
    const pin = loadGiprPin();
    assert.equal(pin.ok, true);
    assert.equal(pin.n, 233);
    // Custody is re-checked on every read, not trusted from pin time.
    assert.match(pin.contentSha256, /^[0-9a-f]{64}$/);
    assert.ok(pin.rows.every((r) => r.targetOrganism === 'Homo sapiens'));
  });

  it('negative: where there genuinely is no pin, the loader still says PIN_MISSING rather than returning an empty dataset', () => {
    withTempDir((dir) => {
      const r = loadGiprPin({ jsonPath: path.join(dir, 'nope.json'), metaPath: path.join(dir, 'nope.meta.json') });
      assert.equal(r.ok, false);
      assert.equal(r.code, 'PIN_MISSING');
      assert.match(r.reason, /GIPR/);
    });
  });

  it('negative: a tiny GIPR pin is refused as INSUFFICIENT_DATA — the frozen gate is NOT relaxed to fit it', () => {
    withTempDir((dir) => {
      const jsonPath = path.join(dir, 'giprActivity.json');
      const metaPath = path.join(dir, 'giprActivity.meta.json');
      const raw = [{
        target_organism: 'Homo sapiens', target_chembl_id: 'CHEMBL_X', canonical_smiles: 'CCO',
        standard_type: 'EC50', standard_value: '10', standard_units: 'nM',
        assay_chembl_id: 'A1', sourceUrl: 'https://example.invalid/a1',
      }];
      const { rows } = normalizeActivityRows(raw, { canonicalize: (s) => s });
      assert.equal(rows.length, 1);
      writeActivityPin(rows, { jsonPath, metaPath });
      const r = trainGiprModel({
        pinOpts: { jsonPath, metaPath },
        batchFn: () => ({ ok: true, results: [{ ok: true, bits: new Array(512).fill(0), scaffold: 'S1' }] }),
        descriptorFn: () => ({ ok: true, results: [{ ok: true, data: {} }] }),
      });
      assert.equal(r.ok, false);
      // Either the featuriser or the size check refuses; both are fail-closed and neither invents a model.
      assert.ok(['INSUFFICIENT_DATA', 'FEATURISATION_FAILED', 'RDKIT_UNAVAILABLE'].includes(r.code), `unexpected code ${r.code}`);
    });
  });

  it('negative: GIPR normalization drops non-human rows and censored values, exactly as GLP-1R does', () => {
    const rat = normalizeActivityRows([{ target_organism: 'Rattus norvegicus', canonical_smiles: 'CCO', standard_type: 'EC50', standard_value: '10', standard_units: 'nM', assay_chembl_id: 'A', sourceUrl: 'u' }], { canonicalize: (s) => s });
    assert.equal(rat.kept, 0);
    assert.equal(rat.dropped.nonHuman, 1);
    const censored = normalizeActivityRows([{ target_organism: 'Homo sapiens', canonical_smiles: 'CCO', standard_type: 'EC50', standard_value: '>100', standard_units: 'nM', assay_chembl_id: 'A', sourceUrl: 'u' }], { canonicalize: (s) => s });
    assert.equal(censored.kept, 0);
    assert.equal(censored.dropped.missingValue, 1);
  });

  it('the GIPR capability is COMPUTED from a real training attempt — and with real data it now fails on SIZE, not absence', () => {
    const cap = probeGiprCapability();
    assert.equal(cap.available, false);
    // The code moved from PIN_MISSING to INSUFFICIENT_DATA when 233 real rows
    // arrived. That transition is the whole point of computing the capability
    // instead of asserting it, and this test is what detected it.
    assert.equal(cap.code, 'INSUFFICIENT_DATA');
    // 146 of a required 150. Pinned here so that closing the gap by relaxing
    // the gate — rather than by adding compounds — fails this test.
    assert.match(cap.reasons[0], /nTrain=146 \(gate requires >= 150\)/);
    assert.match(cap.reasons[0], /NOT relaxed/);
    assert.equal(cap.gateFingerprint, loadGiprValidationGate(GIPR_GATE_PATH).ruleFingerprint);
  });
});

describe('D-081 dual-target layer — both paths reachable', () => {
  it('declares its objectives explicitly and never as one scalar sum', () => {
    const ids = DUAL_TARGET_OBJECTIVES.map((o) => o.id);
    assert.ok(ids.includes('GLP1R_ACTIVITY') && ids.includes('GIPR_ACTIVITY'));
    // Each objective keeps its own direction; there is no combined "score" objective.
    assert.ok(DUAL_TARGET_OBJECTIVES.every((o) => o.direction === 'maximize' || o.direction === 'minimize'));
    assert.ok(!ids.some((id) => /SCORE|TOTAL|COMBINED|SUM/i.test(id)));
  });

  it('negative: one receptor axis missing -> MECHANISM_INCOMPLETE and NO ranking at all', () => {
    const a = assessDualTargetAxes({ glp1rProbe: () => AVAILABLE, giprProbe: () => BLOCKED, priorArtSearched: true });
    assert.equal(a.status, 'MECHANISM_INCOMPLETE');
    assert.equal(a.mechanismComplete, false);
    const r = rankDualTarget([{ id: 'c1', objectives: {} }], a);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'MECHANISM_INCOMPLETE');
    assert.equal(dualTargetVerdict(a, r).outcome, 'NO_DUAL_TARGET_CANDIDATE');
  });

  it('negative: an unsearched prior-art axis blocks even when both receptors are available', () => {
    const a = assessDualTargetAxes({ glp1rProbe: () => AVAILABLE, giprProbe: () => AVAILABLE, priorArtSearched: false });
    assert.equal(a.mechanismComplete, true);
    assert.equal(a.status, 'MECHANISM_INCOMPLETE');
    assert.ok(a.blockers.some((b) => b.code === 'PRIOR_ART_UNVERIFIABLE'));
  });

  it('POSITIVE: with both receptors available and prior art searched, ranking really runs — this branch is not dead code', () => {
    const a = assessDualTargetAxes({ glp1rProbe: () => AVAILABLE, giprProbe: () => AVAILABLE, priorArtSearched: true });
    assert.equal(a.status, 'JOINT_COMPARISON_POSSIBLE');
    const mk = (id, glp1r, gipr, liab, feas, nov) => ({ id, objectives: {
      GLP1R_ACTIVITY: { value: glp1r, kind: VALUE_KIND.MODEL_ESTIMATE },
      GIPR_ACTIVITY: { value: gipr, kind: VALUE_KIND.MODEL_ESTIMATE },
      LIABILITY_BURDEN: { value: liab, kind: VALUE_KIND.COMPUTED_PROPERTY },
      STRUCTURAL_FEASIBILITY: { value: feas, kind: VALUE_KIND.COMPUTED_PROPERTY },
      NOVELTY: { value: nov, kind: VALUE_KIND.COMPUTED_PROPERTY },
    } });
    const dominated = mk('weak', 6, 6, 5, 1, 0);
    const strong = mk('strong', 9, 9, 0, 0, 1);
    const r = rankDualTarget([dominated, strong], a);
    assert.equal(r.ok, true);
    assert.deepEqual(r.front.map((c) => c.id), ['strong']);
    // Even a clean front is NOT a winner.
    assert.equal(dualTargetVerdict(a, r).ceiling, 'DUAL_TARGET_MODEL_ESTIMATE');
    assert.match(r.note, /NOT a verdict/);
  });

  it('negative: an axis mixing a MEASURED value with a MODEL_ESTIMATE is refused, not averaged', () => {
    const a = assessDualTargetAxes({ glp1rProbe: () => AVAILABLE, giprProbe: () => AVAILABLE, priorArtSearched: true });
    const base = { LIABILITY_BURDEN: { value: 0, kind: VALUE_KIND.COMPUTED_PROPERTY }, STRUCTURAL_FEASIBILITY: { value: 0, kind: VALUE_KIND.COMPUTED_PROPERTY }, NOVELTY: { value: 1, kind: VALUE_KIND.COMPUTED_PROPERTY }, GIPR_ACTIVITY: { value: 8, kind: VALUE_KIND.MODEL_ESTIMATE } };
    const r = rankDualTarget([
      { id: 'measured', objectives: { ...base, GLP1R_ACTIVITY: { value: 9, kind: VALUE_KIND.MEASURED } } },
      { id: 'predicted', objectives: { ...base, GLP1R_ACTIVITY: { value: 9, kind: VALUE_KIND.MODEL_ESTIMATE } } },
    ], a);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'MIXED_VALUE_KINDS');
  });

  it('negative: an empty candidate set is NO_CANDIDATES, never an empty front reported as success', () => {
    const a = assessDualTargetAxes({ glp1rProbe: () => AVAILABLE, giprProbe: () => AVAILABLE, priorArtSearched: true });
    assert.equal(rankDualTarget([], a).code, 'NO_CANDIDATES');
  });
});

describe('D-081 experiment DAG — blocking, determinism, replay', () => {
  const candidate = { id: 'C1', canonicalSmiles: 'CCO' };
  const pass = (result) => () => ({ ok: true, result, modelVersion: 'v1', ruleFingerprint: 'rf1' });
  const allPorts = {
    structureValidity: pass(1), glp1rActivity: pass(2), giprActivity: pass(3), receptorBalance: pass(4),
    admet: pass(5), liabilities: pass(6), novelty: pass(7), robustness: pass(8), counterfactual: pass(9),
  };

  it('declares all ten experiments with real dependencies', () => {
    assert.equal(EXPERIMENT_NODES.length, 10);
    assert.deepEqual(EXPERIMENT_NODES.map((n) => n.id), ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10']);
    assert.ok(EXPERIMENT_NODES.find((n) => n.id === 'E4').dependsOn.includes('E2'));
    assert.ok(EXPERIMENT_NODES.find((n) => n.id === 'E4').dependsOn.includes('E3'));
  });

  it('negative: an unwired port is BLOCKED and its dependents are SKIPPED_UPSTREAM_BLOCKED, never omitted', () => {
    const r = runExperimentDag(candidate, {});
    assert.equal(r.nodes.length, 10);
    assert.equal(r.nodes.find((n) => n.nodeId === 'E1').code, 'PORT_NOT_WIRED');
    const e2 = r.nodes.find((n) => n.nodeId === 'E2');
    assert.equal(e2.status, NODE_STATUS.SKIPPED_UPSTREAM_BLOCKED);
    assert.match(e2.reasons[0], /NOT counted as passing/);
    assert.equal(r.complete, false);
  });

  it('negative: a port that throws becomes a BLOCKED node instead of aborting the graph', () => {
    const r = runExperimentDag(candidate, { ...allPorts, admet: () => { throw new Error('engine exploded'); } });
    const e5 = r.nodes.find((n) => n.nodeId === 'E5');
    assert.equal(e5.status, NODE_STATUS.BLOCKED);
    assert.equal(e5.code, 'PORT_THREW');
    assert.equal(r.nodes.length, 10);
  });

  it('POSITIVE: with every port wired the DAG completes and replays identically', () => {
    const r = runExperimentDag(candidate, allPorts);
    assert.equal(r.complete, true);
    assert.equal(r.nodes.find((n) => n.nodeId === 'E10').code, 'REPRODUCED');
    assert.equal(compareDagRuns(r, runExperimentDag(candidate, allPorts)).verdict, 'MATCH');
  });

  it('negative: a non-deterministic port is CAUGHT by E10 rather than passing quietly', () => {
    let i = 0;
    const r = runExperimentDag(candidate, { ...allPorts, admet: () => ({ ok: true, result: i++ }) });
    assert.equal(r.nodes.find((n) => n.nodeId === 'E10').code, 'REPLAY_MISMATCH');
    assert.equal(r.complete, false);
  });

  it('negative: disabling replay does not produce a reproducible run — it produces a run with no replay evidence', () => {
    const r = runExperimentDag(candidate, allPorts, { replay: false });
    const e10 = r.nodes.find((n) => n.nodeId === 'E10');
    assert.equal(e10.status, NODE_STATUS.BLOCKED);
    assert.equal(e10.code, 'REPLAY_NOT_REQUESTED');
    assert.equal(r.complete, false);
  });

  it('every node carries an input hash, a run id and a node fingerprint', () => {
    const r = runExperimentDag(candidate, allPorts);
    assert.ok(r.nodes.every((n) => n.inputHash && n.runId && n.nodeFingerprint));
    // runId is derived, not a timestamp: the same inputs give the same id.
    assert.equal(runExperimentDag(candidate, allPorts).runId, r.runId);
    assert.notEqual(runExperimentDag({ id: 'C2', canonicalSmiles: 'CCC' }, allPorts).runId, r.runId);
  });
});
