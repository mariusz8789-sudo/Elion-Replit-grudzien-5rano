import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as admet from './compute/admetAdapter.mjs';
import { getTool, TOOL_STATUS, _resetValidation } from './campaign/toolchain.mjs';

/**
 * ADMET + Toksyczność (ADMET-AI, Swanson i in. 2024, Bioinformatics, MIT) na
 * REALNYM zespole D-MPNN (Chemprop) wytrenowanym na TDC ADMET Benchmark Group.
 * Pomijane, gdy silnik niedostępny w runtime (BLOCKED_BY_RUNTIME = uczciwy
 * stan, nie porażka). Zdolność jest DONE tylko, gdy realny przypadek
 * referencyjny PRZECHODZI. Predykcje to MODEL_ESTIMATE — nigdy dowód
 * eksperymentalny, nigdy SAFE/NON-TOXIC/CLINICALLY SAFE.
 */
const on = admet.detect().available;
const maybe = on ? test : test.skip;

describe('ADMET-AI adapter', () => {
  maybe('detect reports a real installed version', () => {
    const d = admet.detect();
    assert.equal(d.available, true);
    assert.match(d.version, /^\d+\.\d+/);
  });

  maybe('endpoint table exposes 52 endpoints with published TDC metrics', () => {
    const r = admet.listEndpoints();
    assert.equal(r.ok, true);
    assert.equal(r.endpoints.length, 52);
    const herg = r.endpoints.find((e) => e.id === 'hERG');
    assert.ok(herg);
    assert.equal(herg.category, 'Toxicity');
    assert.equal(herg.taskType, 'classification');
    assert.ok(herg.publishedMetric === 'AUROC' && herg.publishedMetricValue > 0.5 && herg.publishedMetricValue <= 1);
    // Physicochemical descriptors carry no ML benchmark metric (they are deterministic, not learned).
    const mw = r.endpoints.find((e) => e.id === 'molecular_weight');
    assert.equal(mw.publishedMetric, null);
  });

  maybe('reference case: execution + determinism + RDKit physchem cross-check', () => {
    const r = admet.referenceCase();
    assert.equal(r.ok, true);
    assert.equal(r.pass, true, JSON.stringify(r.checks));
    assert.equal(r.checks.deterministic_repeated_call, true);
    assert.equal(r.checks.molecular_weight_ok, true);
    assert.equal(r.checks.logP_ok, true);
    assert.equal(r.nEndpoints, 52);
  });

  maybe('predict returns per-endpoint MODEL_ESTIMATEs for real molecules, in request order', () => {
    const aspirin = 'CC(=O)Oc1ccccc1C(=O)O';
    const phenol = 'c1ccccc1O';
    const r = admet.predict([phenol, aspirin]);
    assert.equal(r.ok, true);
    const p = r.predictions[phenol];
    const a = r.predictions[aspirin];
    assert.ok(p && a, 'both molecules present in the response');
    // Deterministic RDKit-computed physchem anchors (not ML) — exact literature values.
    assert.ok(Math.abs(p.molecular_weight - 94.11) < 0.1, 'phenol MW');
    assert.ok(Math.abs(a.molecular_weight - 180.16) < 0.1, 'aspirin MW');
    // Classification endpoints are probabilities in [0,1].
    for (const key of ['hERG', 'AMES', 'DILI', 'BBB_Martins']) {
      assert.ok(a[key] >= 0 && a[key] <= 1, `${key} is a probability`);
    }
  });

  maybe('rejects an oversized batch rather than silently truncating', () => {
    const many = Array.from({ length: 201 }, () => 'C');
    const r = admet.predict(many);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'invalid_input');
  });

  test('unavailable engine is an honest BLOCKED_BY_RUNTIME, never faked', () => {
    if (on) return; // to środowisko ma ADMET-AI — nic do udowodnienia
    const r = admet.referenceCase();
    assert.equal(r.ok, false);
    assert.equal(r.error, 'BLOCKED_BY_RUNTIME');
  });
});

describe('toolchain: admet + toxicity registration', () => {
  test('both entries validate against the same real reference case, never a fabricated one', () => {
    _resetValidation();
    const admetTool = getTool('admet');
    const toxTool = getTool('toxicity');
    assert.ok(admetTool && toxTool);
    if (on) {
      assert.equal(admetTool.status, TOOL_STATUS.AVAILABLE);
      assert.equal(toxTool.status, TOOL_STATUS.AVAILABLE);
      assert.ok(admetTool.validation[0].pass);
      assert.equal(admetTool.evidenceClass, 'MODEL_ESTIMATE');
      assert.equal(toxTool.evidenceClass, 'MODEL_ESTIMATE');
    } else {
      assert.equal(admetTool.status, TOOL_STATUS.BLOCKED_BY_RUNTIME);
      assert.equal(toxTool.status, TOOL_STATUS.BLOCKED_BY_RUNTIME);
    }
    // The disclaimer explicitly prohibits SAFE/NON-TOXIC framing (it names them to forbid them).
    assert.match(toxTool.assumptions, /Nigdy SAFE/);
  });
});
