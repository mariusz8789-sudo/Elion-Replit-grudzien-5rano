/**
 * Off-Target Prediction (Genesis V3, Phase 1). Reproducible LOW/MEDIUM/HIGH liability + toxicity
 * risk from ADMET-AI panel probabilities. Fake predictions exercise the classification logic; a
 * guarded case runs it on a REAL ADMET-AI prediction. No fabricated values; missing predictions block.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { predictOffTarget, OFF_TARGET_PANEL, TOX_PANEL, RISK } from './cognitive/offTarget.mjs';
import * as admet from './compute/admetAdapter.mjs';

const clean = () => { const p = {}; for (const t of OFF_TARGET_PANEL) p[t.endpoint] = 0.05; for (const t of TOX_PANEL) p[t.endpoint] = 0.05; return p; };

describe('offTarget — classification logic', () => {
  test('a clean profile → LOW risk, selectivity 1, high confidence', () => {
    const r = predictOffTarget(clean());
    assert.equal(r.status, 'COMPLETED');
    assert.equal(r.risk, RISK.LOW);
    assert.equal(r.selectivity, 1);
    assert.ok(r.confidence > 0.8);
    assert.equal(r.epistemicStatus, 'MODEL_INFERRED');
  });

  test('one severe strong toxicity flag → HIGH risk', () => {
    const p = clean(); p.DILI = 0.92;
    const r = predictOffTarget(p);
    assert.equal(r.risk, RISK.HIGH);
    assert.equal(r.toxicityFlags.severeStrong, 1);
    assert.match(r.explanation, /liver injury/);
  });

  test('two strong off-target hits → at least MEDIUM, with named proteins', () => {
    const p = clean(); p['NR-AR'] = 0.9; p.CYP3A4_Veith = 0.85;
    const r = predictOffTarget(p);
    assert.ok(r.risk === RISK.MEDIUM || r.risk === RISK.HIGH);
    assert.equal(r.offTargetHits.strong, 2);
    assert.ok(r.offTargets.some((o) => o.gene === 'AR' && o.flag === 'STRONG'));
    assert.ok(r.selectivity < 1);
  });

  test('four strong off-target hits → HIGH risk', () => {
    const p = clean(); p['NR-AR'] = 0.9; p['NR-ER'] = 0.9; p.CYP3A4_Veith = 0.9; p.hERG = 0.9;
    assert.equal(predictOffTarget(p).risk, RISK.HIGH);
  });

  test('no predictions / irrelevant predictions → BLOCKED_BY_RESOURCES (never fabricated)', () => {
    assert.equal(predictOffTarget(null).status, 'BLOCKED_BY_RESOURCES');
    assert.equal(predictOffTarget({ molecular_weight: 180 }).status, 'BLOCKED_BY_RESOURCES');
  });

  test('every off-target panel entry maps to a named human gene/protein', () => {
    assert.ok(OFF_TARGET_PANEL.every((t) => t.gene && t.protein && t.category));
  });
});

describe('offTarget — REAL ADMET-AI integration', () => {
  (admet.detect().available ? test : test.skip)('runs on a real ADMET-AI prediction and classifies risk', () => {
    const p = admet.predict(['CC(=O)Oc1ccccc1C(=O)O']);
    assert.equal(p.ok, true);
    const r = predictOffTarget(p.predictions['CC(=O)Oc1ccccc1C(=O)O']);
    assert.equal(r.status, 'COMPLETED');
    assert.ok([RISK.LOW, RISK.MEDIUM, RISK.HIGH].includes(r.risk));
    assert.ok(r.offTargets.length >= 10, `panel scored ${r.offTargets.length}`);
    assert.equal(r.evidence.epistemicStatus, 'MODEL_INFERRED');
  });
});
