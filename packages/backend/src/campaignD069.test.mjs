import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, createUser, createProject } from './store.mjs';
import { hashPassword } from './auth.mjs';
import { createCampaign } from './campaign/persistence.mjs';
import { runCampaign } from './campaign/orchestrator.mjs';
import { loadFrozenPredictionThresholds, applyPredictionHardFilters } from './campaign/predictionHardFilters.mjs';
import { assertCampaignObjectivesD069 } from './campaign/objectiveGuardD069.mjs';

/**
 * D-069 OPTION A (frozen decision: MODEL_ESTIMATE predictions are hard
 * filters applied BEFORE Pareto, never objectives). Negative-first: every
 * property this module claims is proven by a case that would fail if the
 * property did not hold.
 */

describe('predictionHardFilters — readTerm reads the REAL splitAdmetPrediction shape', () => {
  // affinity semantics: more negative kcal/mol == stronger binding, so a floor
  // on binding strength ("must bind at least as strongly as -9.0") is a MAX
  // constraint on the raw number (v must be <= -9.0), not a MIN one.
  const thresholds = { ruleFingerprint: 'fp1', terms: [{ term: 'herg', kind: 'max', value: 0.3 }, { term: 'ames', kind: 'max', value: 0.5 }, { term: 'bestAffinityKcalMol', kind: 'max', value: -9.0 }] };
  const preds = new Map([
    ['CCO', { admet: { herg: 0.9, clearance: 0.05 }, tox: { ames: 0.1 }, affinityKcalMol: -8.1 }],
    ['CCN', { admet: { herg: 0.2, clearance: 0.05 }, tox: { ames: 0.1 }, affinityKcalMol: -9.5 }],
  ]);
  const predictionsFor = (smiles) => preds.get(smiles) ?? null;

  test('rejects a candidate whose herg (admetOut, a bare number) exceeds the frozen max', () => {
    const { rejections } = applyPredictionHardFilters([{ canonicalSmiles: 'CCO' }], predictionsFor, thresholds);
    assert.equal(rejections.length, 1);
    assert.ok(rejections[0].codes.includes('herg_ABOVE_MAX'), rejections[0].codes.join(','));
  });

  test('rejects a candidate whose bestAffinityKcalMol (-8.1) is weaker (less negative) than the frozen floor (-9.0)', () => {
    const { rejections } = applyPredictionHardFilters([{ canonicalSmiles: 'CCO' }], predictionsFor, thresholds);
    assert.ok(rejections[0].codes.includes('bestAffinityKcalMol_ABOVE_MAX'), rejections[0].codes.join(','));
  });

  test('a candidate clearing every frozen term survives, UNCHANGED (same reference)', () => {
    const candidate = { canonicalSmiles: 'CCN' };
    const { survivors, rejections } = applyPredictionHardFilters([candidate], predictionsFor, thresholds);
    assert.equal(rejections.length, 0);
    assert.equal(survivors.length, 1);
    assert.equal(survivors[0], candidate); // same object, no descriptor/objectiveVector mutation
  });

  test('missing prediction entirely -> PREDICTION_MISSING, never silently admitted', () => {
    const { rejections } = applyPredictionHardFilters([{ canonicalSmiles: 'UNKNOWN' }], predictionsFor, thresholds);
    assert.deepEqual(rejections[0].codes, ['PREDICTION_MISSING']);
  });

  test('a term absent from both admet and tox maps -> TERM_MISSING:<term>, never treated as passing', () => {
    const th = { ruleFingerprint: 'fp1', terms: [{ term: 'nonexistent_endpoint', kind: 'max', value: 1 }] };
    const { rejections } = applyPredictionHardFilters([{ canonicalSmiles: 'CCO' }], predictionsFor, th);
    assert.ok(rejections[0].codes.includes('TERM_MISSING:nonexistent_endpoint'));
  });
});

describe('predictionHardFilters — thresholds are frozen via the REAL D-047 ruleFingerprint, not a second mechanism', () => {
  const dir = mkdtempSync(join(tmpdir(), 'genesis-d069-'));

  test('missing file -> RULE_NOT_FROZEN', () => {
    const r = loadFrozenPredictionThresholds(join(dir, 'does-not-exist.json'));
    assert.equal(r.ok, false);
    assert.equal(r.code, 'RULE_NOT_FROZEN');
  });

  test('unreadable/malformed JSON -> RULE_NOT_FROZEN', () => {
    const p = join(dir, 'malformed.json');
    writeFileSync(p, '{not json');
    const r = loadFrozenPredictionThresholds(p);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'RULE_NOT_FROZEN');
  });

  test('file with no ruleFingerprint -> RULE_NOT_FROZEN (never produced by a real freeze())', () => {
    const p = join(dir, 'no-fp.json');
    writeFileSync(p, JSON.stringify({ terms: [{ term: 'herg', kind: 'max', value: 0.3 }] }));
    const r = loadFrozenPredictionThresholds(p);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'RULE_NOT_FROZEN');
  });

  test('ruleFingerprint mismatch vs the caller-supplied frozen rule -> RULE_MISMATCH', () => {
    const p = join(dir, 'mismatch.json');
    writeFileSync(p, JSON.stringify({ ruleFingerprint: 'fp-old', terms: [{ term: 'herg', kind: 'max', value: 0.3 }] }));
    const r = loadFrozenPredictionThresholds(p, 'fp-new');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'RULE_MISMATCH');
  });

  test('matching ruleFingerprint -> ok, thresholds returned verbatim', () => {
    const p = join(dir, 'ok.json');
    const doc = { ruleFingerprint: 'fp-match', terms: [{ term: 'herg', kind: 'max', value: 0.3 }] };
    writeFileSync(p, JSON.stringify(doc));
    const r = loadFrozenPredictionThresholds(p, 'fp-match');
    assert.equal(r.ok, true);
    assert.deepEqual(r.thresholds.terms, doc.terms);
  });

  test('called with no expectedRuleFingerprint (caller not yet enforcing) still requires a real ruleFingerprint field', () => {
    const p = join(dir, 'ok2.json');
    writeFileSync(p, JSON.stringify({ ruleFingerprint: 'anything', terms: [{ term: 'ames', kind: 'max', value: 0.5 }] }));
    const r = loadFrozenPredictionThresholds(p);
    assert.equal(r.ok, true);
  });

  test('cleanup', () => { try { unlinkSync(join(dir, 'malformed.json')); } catch { /* best-effort */ } });
});

describe('objectiveGuardD069 — closes the "set it in the database" escape hatch', () => {
  test('an objective whose targetProperty names a real prediction term -> OBJECTIVE_IS_PREDICTION_TERM', () => {
    const r = assertCampaignObjectivesD069(
      [{ id: 'a', targetProperty: 'herg', target: 0.1, scale: 1 }, { id: 'b', targetProperty: 'molWt', target: 350, scale: 100 }],
      ['herg', 'ames'],
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 'OBJECTIVE_IS_PREDICTION_TERM');
    assert.match(r.reason, /herg/);
  });

  test('3 objectives -> OBJECTIVE_COUNT_NOT_TWO (hypervolume2D reads p[0],p[1] only)', () => {
    const r = assertCampaignObjectivesD069(
      [{ targetProperty: 'a' }, { targetProperty: 'b' }, { targetProperty: 'c' }],
      [],
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 'OBJECTIVE_COUNT_NOT_TWO');
  });

  test('1 objective -> OBJECTIVE_COUNT_NOT_TWO (this is the REAL escape hatch: apiCampaign.test.mjs P-NL-0 persists a 1-objective campaign)', () => {
    const r = assertCampaignObjectivesD069([{ targetProperty: 'crippenLogP' }], []);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'OBJECTIVE_COUNT_NOT_TWO');
  });

  test('empty objectives (falls back to DEFAULT_OBJECTIVES at the call site) -> OBJECTIVE_COUNT_NOT_TWO on its own, by design the caller never passes [] through this guard', () => {
    const r = assertCampaignObjectivesD069([], []);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'OBJECTIVE_COUNT_NOT_TWO');
  });

  test('the real DEFAULT_OBJECTIVES shape (2 terms, logP/MW) passes', () => {
    const r = assertCampaignObjectivesD069(
      [{ id: 'logp-distance', targetProperty: 'crippenLogP', target: 2.5, scale: 1 }, { id: 'mw-distance', targetProperty: 'molWt', target: 350, scale: 100 }],
      ['herg', 'ames'],
    );
    assert.equal(r.ok, true);
  });
});

describe('objectiveGuardD069 — wired as the REAL caller in runCampaign (not orphaned)', () => {
  function setup() {
    const db = openDatabase(':memory:');
    const owner = createUser(db, { email: `d069-${Math.random()}@lab.org`, displayName: 'Owner', passwordHash: hashPassword('x') });
    const project = createProject(db, { ownerId: owner.id, name: 'p' });
    return { db, project };
  }

  test('a campaign persisted with exactly 1 objective FAILS CLOSED at runCampaign, not silently at Pareto', () => {
    const { db, project } = setup();
    const campaign = createCampaign(db, {
      projectId: project.id, objective: 'x', domain: 'chem',
      objectiveVector: [{ id: 'logp-distance', targetProperty: 'crippenLogP', target: 1.0, scale: 1 }],
      constraints: [],
    });
    assert.throws(() => runCampaign(db, campaign.id), /FAIL_CLOSED\[OBJECTIVE_COUNT_NOT_TWO\]/);
  });

  test('a campaign with a 3rd objective (would silently truncate hypervolume2D) FAILS CLOSED', () => {
    const { db, project } = setup();
    const campaign = createCampaign(db, {
      projectId: project.id, objective: 'x', domain: 'chem',
      objectiveVector: [
        { id: 'a', targetProperty: 'crippenLogP', target: 1, scale: 1 },
        { id: 'b', targetProperty: 'molWt', target: 350, scale: 100 },
        { id: 'c', targetProperty: 'tpsa', target: 60, scale: 1 },
      ],
      constraints: [],
    });
    assert.throws(() => runCampaign(db, campaign.id), /FAIL_CLOSED\[OBJECTIVE_COUNT_NOT_TWO\]/);
  });

  test('the real default 2-objective profile (no objectiveVector set) is NOT rejected by the guard -- a real campaign runs to a real stop condition', () => {
    const { db, project } = setup();
    const campaign = createCampaign(db, {
      projectId: project.id, objective: 'x', domain: 'chem', objectiveVector: [], constraints: [],
      strategy: { startingSmiles: ['c1ccccc1'], transformationWeights: { 'add-methyl': 1 }, parentSelection: 'pareto' },
      budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
    });
    // If the guard wrongly rejected DEFAULT_OBJECTIVES this would throw FAIL_CLOSED[OBJECTIVE_COUNT_NOT_TWO]
    // before a single candidate is generated -- it does not, and the campaign proceeds to a real stop reason.
    const summary = runCampaign(db, campaign.id);
    assert.ok(typeof summary.stopReason === 'string' && summary.stopReason.length > 0, JSON.stringify(summary));
  });
});
