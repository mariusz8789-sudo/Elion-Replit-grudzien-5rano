import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openDatabase, createUser, createProject } from './store.mjs';
import { hashPassword } from './auth.mjs';
import { createCampaign, listCandidates } from './campaign/persistence.mjs';
import { runCampaign } from './campaign/orchestrator.mjs';
import { createLiabilityPredictionSource, LIABILITY_TERMS } from './campaign/molecularLiabilities.mjs';
import { applyPredictionHardFilters, loadFrozenPredictionThresholds } from './campaign/predictionHardFilters.mjs';
import { tirzepatideBaseline, efficacyAxis, loadPinnedCandidates } from './campaign/tirzepatideBaseline.mjs';
import {
  runMolecularMission, comparableAxes, decide, nextAction, assessNovelty,
  falsifyRun, missionObjective, probeCapabilities,
} from './campaign/molecularMission.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';

/**
 * D-074 GENESIS-MOL-01 — negative-first. Every property is proven by a case
 * that would fail if the property did not hold. The load-bearing ones are the
 * ones that make a fake winner impossible.
 */

const SRC = path.dirname(fileURLToPath(import.meta.url));
const THRESHOLDS = join(SRC, 'campaign/frozen-prediction-thresholds.json');
const RULE_FP = '28505cb769d5554f';
const RDKIT = rdkitDetect().available;
const skipNoRdkit = { skip: RDKIT ? false : 'RDKit unavailable in this runtime' };

function setup() {
  const db = openDatabase(':memory:');
  const owner = createUser(db, { email: `d074-${Math.random()}@lab.org`, displayName: 'Owner', passwordHash: hashPassword('x') });
  const project = createProject(db, { ownerId: owner.id, name: 'mol01' });
  return { db, project };
}

const MISSION_ARGS = {
  seeds: ['c1ccccc1', 'Oc1ccccc1', 'Nc1ccccc1', 'Cc1ccccc1'],
  seedProvenance: 'documented non-novel reference chemicals — NOT target-derived',
  thresholdsPath: THRESHOLDS,
  expectedRuleFingerprint: RULE_FP,
  budget: { maxGenerations: 2, maxGeneratedCandidates: 24 },
};

// ---------------------------------------------------------------------------
describe('the frozen rule is real and cannot be swapped silently', () => {
  test('a thresholds file whose ruleFingerprint does not match the expected one FAILS CLOSED', () => {
    const dir = mkdtempSync(join(tmpdir(), 'd074-'));
    const p = join(dir, 't.json');
    writeFileSync(p, JSON.stringify({ ruleFingerprint: 'tampered', terms: [{ term: 'qed', kind: 'min', value: 0 }] }));
    const r = loadFrozenPredictionThresholds(p, RULE_FP);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'RULE_MISMATCH');
  });

  test('a missing thresholds file FAILS CLOSED — never "no filter"', () => {
    const r = loadFrozenPredictionThresholds(join(tmpdir(), 'absent-d074.json'), RULE_FP);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'RULE_NOT_FROZEN');
  });

  test('the committed rule loads and carries exactly the three published terms', () => {
    const r = loadFrozenPredictionThresholds(THRESHOLDS, RULE_FP);
    assert.equal(r.ok, true);
    assert.deepEqual(r.thresholds.terms.map((t) => t.term).sort(), ['lipinskiViolations', 'structuralAlertCount', 'veberPass']);
    assert.equal(r.thresholds.evidenceClass, 'COMPUTATIONAL');
  });

  test('QED is deliberately NOT a gate term — an arbitrary cut-off would be a fake success threshold', () => {
    const r = loadFrozenPredictionThresholds(THRESHOLDS, RULE_FP);
    assert.ok(!r.thresholds.terms.some((t) => t.term === 'qed'));
  });
});

// ---------------------------------------------------------------------------
describe('liability source is real, deterministic, and fails closed on bad input', skipNoRdkit, () => {
  test('a known toxicophore is rejected and a clean molecule survives the SAME rule', () => {
    const rule = loadFrozenPredictionThresholds(THRESHOLDS, RULE_FP);
    const src = createLiabilityPredictionSource();
    const { survivors, rejections } = applyPredictionHardFilters(
      [{ canonicalSmiles: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C' }, { canonicalSmiles: 'O=[N+]([O-])c1ccc(N=Nc2ccccc2)cc1' }],
      src.predictionsFor, rule.thresholds,
    );
    assert.equal(survivors.length, 1, 'caffeine survives');
    assert.equal(rejections.length, 1, 'the azo/nitro compound does not');
    assert.ok(rejections[0].codes.includes('structuralAlertCount_ABOVE_MAX'));
  });

  test('an unparseable structure becomes an explicit PREDICTION_MISSING rejection, never a silent pass', () => {
    const rule = loadFrozenPredictionThresholds(THRESHOLDS, RULE_FP);
    const src = createLiabilityPredictionSource();
    const { survivors, rejections } = applyPredictionHardFilters(
      [{ canonicalSmiles: 'this-is-not-a-molecule' }], src.predictionsFor, rule.thresholds,
    );
    assert.equal(survivors.length, 0);
    assert.deepEqual(rejections[0].codes, ['PREDICTION_MISSING']);
  });

  test('the same structure yields the identical panel twice (determinism)', () => {
    const a = createLiabilityPredictionSource().predictionsFor('CC(=O)Oc1ccccc1C(=O)O');
    const b = createLiabilityPredictionSource().predictionsFor('CC(=O)Oc1ccccc1C(=O)O');
    assert.deepEqual(a.liab, b.liab);
  });

  test('liability terms are COMPUTATIONAL and are never labelled MODEL_ESTIMATE', () => {
    const p = createLiabilityPredictionSource().predictionsFor('c1ccccc1');
    assert.equal(p.evidenceClass, 'COMPUTATIONAL');
    assert.notEqual(p.evidenceClass, 'MODEL_ESTIMATE');
  });
});

// ---------------------------------------------------------------------------
describe('the gate actually changes the campaign, and only via rejection', skipNoRdkit, () => {
  test('enabling the gate rejects candidates the ungated run retained, and never invents new ones', () => {
    const { db, project } = setup();
    const mk = (gate) => {
      const c = createCampaign(db, {
        projectId: project.id, objective: 'gate-effect', domain: 'DRUG_DISCOVERY', objectiveVector: [], constraints: [],
        strategy: {
          startingSmiles: ['Nc1ccccc1', 'c1ccccc1'], transformationWeights: { 'add-methyl': 1 }, parentSelection: 'pareto',
          ...(gate ? { predictionGate: { enabled: true, thresholdsPath: THRESHOLDS, expectedRuleFingerprint: RULE_FP } } : {}),
        },
        budget: { maxGenerations: 1, maxGeneratedCandidates: 12 },
      });
      runCampaign(db, c.id);
      return listCandidates(db, c.id);
    };
    const off = mk(false);
    const on = mk(true);
    const retainedOff = off.filter((c) => c.status === 'retained').length;
    const retainedOn = on.filter((c) => c.status === 'retained').length;
    assert.ok(retainedOn < retainedOff, `gate must reduce retained (${retainedOn} vs ${retainedOff})`);
    assert.ok(on.some((c) => (c.rejectedReason ?? '').startsWith('prediction:')), 'at least one prediction rejection is recorded');
  });

  test('an enabled gate with a missing rule file aborts the campaign instead of running unfiltered', () => {
    const { db, project } = setup();
    const c = createCampaign(db, {
      projectId: project.id, objective: 'failclosed', domain: 'DRUG_DISCOVERY', objectiveVector: [], constraints: [],
      strategy: {
        startingSmiles: ['c1ccccc1'], transformationWeights: { 'add-methyl': 1 }, parentSelection: 'pareto',
        predictionGate: { enabled: true, thresholdsPath: join(tmpdir(), 'nope-d074.json'), expectedRuleFingerprint: RULE_FP },
      },
      budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
    });
    assert.throws(() => runCampaign(db, c.id), /FAIL_CLOSED\[RULE_NOT_FROZEN\]/);
  });

  test('a gate term may never be used as an optimisation objective (D-069 Option A holds)', () => {
    const { db, project } = setup();
    const c = createCampaign(db, {
      projectId: project.id, objective: 'goodhart', domain: 'DRUG_DISCOVERY',
      objectiveVector: [
        { id: 'qed', targetProperty: 'qed', target: 1, scale: 1 },
        { id: 'alerts', targetProperty: 'structuralAlertCount', target: 0, scale: 1 },
      ],
      constraints: [],
      strategy: { startingSmiles: ['c1ccccc1'], transformationWeights: { 'add-methyl': 1 }, parentSelection: 'pareto' },
      budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
    });
    assert.throws(() => runCampaign(db, c.id), /FAIL_CLOSED\[OBJECTIVE_IS_PREDICTION_TERM\]/);
  });

  test('every liability term is registered with the objective guard', () => {
    assert.ok(LIABILITY_TERMS.includes('structuralAlertCount'));
    assert.ok(LIABILITY_TERMS.includes('qed'));
  });
});

// ---------------------------------------------------------------------------
describe('the baseline is real, verified, and carries its own limits', () => {
  test('the pinned bytes verify against the hash meta.json itself recorded', () => {
    const r = loadPinnedCandidates();
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.contentSha256.length, 64);
  });

  test('the baseline is the REAL tirzepatide record with real measured potencies', () => {
    const r = tirzepatideBaseline();
    assert.equal(r.ok, true);
    assert.equal(r.baseline.chemblId, 'CHEMBL4297839');
    assert.equal(r.baseline.name, 'TIRZEPATIDE');
    assert.equal(r.baseline.measuredPotencyNM.glp1r, 0.77);
    assert.equal(r.baseline.measuredPotencyNM.gipr, 0.03);
  });

  test('the baseline declares it has NO structure — nothing may silently substitute one', () => {
    const r = tirzepatideBaseline();
    assert.equal(r.baseline.structureAvailable, false);
    assert.ok(r.baseline.structureAbsentReason.length > 0);
  });

  test('the efficacy axis reports UNAVAILABLE as data, with the reasons that would close it', () => {
    const e = efficacyAxis();
    assert.equal(e.available, false);
    assert.equal(e.code, 'EFFICACY_AXIS_UNAVAILABLE');
    assert.ok(e.reasons.length >= 2);
    assert.ok(e.whatWouldCloseIt.length >= 1);
  });
});

// ---------------------------------------------------------------------------
describe('the verdict cannot be faked', () => {
  test('with no comparable axis, decide() refuses a candidate no matter how clean the run is', () => {
    const axes = comparableAxes(
      { measuredPotencyNM: { glp1r: 0.77 }, structureAvailable: false },
      { rdkit: true, activityPredictor: false, priorArtSearch: false },
    );
    assert.equal(axes.disjoint, true);
    const perfect = { probes: [], allPassed: true, failed: [], unresolved: [] };
    const novelty = { priorArt: { status: 'SEARCHED' }, structural: {}, lineage: {} };
    const d = decide({ axes, falsification: perfect, novelty, efficacy: { available: true, code: 'X', reasons: ['x'] } });
    assert.equal(d.outcome, 'NO_WINNER');
    assert.ok(d.blockers.some((b) => b.code === 'NO_COMPARABLE_AXIS'));
  });

  test('a shared axis + clean run + searched prior art is the ONLY path to a candidate — proving NO_WINNER is earned, not hardcoded', () => {
    const axes = comparableAxes(
      { measuredPotencyNM: { glp1r: 0.77 }, structureAvailable: true },
      { rdkit: true, activityPredictor: true, priorArtSearch: true },
    );
    assert.equal(axes.disjoint, false);
    const d = decide({
      axes,
      falsification: { probes: [], allPassed: true, failed: [], unresolved: [] },
      novelty: { priorArt: { status: 'SEARCHED' }, structural: {}, lineage: {} },
      efficacy: { available: true, code: 'OK', reasons: ['available'] },
    });
    assert.equal(d.outcome, 'COMPUTATIONAL_CANDIDATE');
  });

  test('unsearched prior art always blocks promotion — absence of a hit is never novelty', () => {
    const axes = comparableAxes(
      { measuredPotencyNM: { glp1r: 0.77 }, structureAvailable: true },
      { rdkit: true, activityPredictor: true, priorArtSearch: false },
    );
    const d = decide({
      axes,
      falsification: { probes: [], allPassed: true, failed: [], unresolved: [] },
      novelty: { priorArt: { status: 'NO_ACCESS', basis: 'unreachable' }, structural: {}, lineage: {} },
      efficacy: { available: true, code: 'OK', reasons: ['available'] },
    });
    assert.equal(d.outcome, 'NO_WINNER');
    assert.ok(d.blockers.some((b) => b.code === 'PRIOR_ART_UNVERIFIABLE'));
  });

  test('a failed decisive probe blocks promotion', () => {
    const axes = comparableAxes({ measuredPotencyNM: { glp1r: 1 }, structureAvailable: true }, { rdkit: true, activityPredictor: true, priorArtSearch: true });
    const d = decide({
      axes,
      falsification: { probes: [], allPassed: false, failed: ['NO_DUPLICATE_RETAINED'], unresolved: [] },
      novelty: { priorArt: { status: 'SEARCHED' }, structural: {}, lineage: {} },
      efficacy: { available: true, code: 'OK', reasons: ['x'] },
    });
    assert.equal(d.outcome, 'NO_WINNER');
  });

  test('every decision carries an explicit claim boundary that forbids a clinical reading', () => {
    const axes = comparableAxes({ measuredPotencyNM: { glp1r: 1 }, structureAvailable: false }, { rdkit: true, activityPredictor: false, priorArtSearch: false });
    const d = decide({ axes, falsification: { probes: [], allPassed: true, failed: [], unresolved: [] }, novelty: { priorArt: { status: 'NO_ACCESS' } }, efficacy: efficacyAxis() });
    assert.match(d.claimBoundary, /not a clinical finding/i);
    assert.match(d.claimBoundary, /nothing here may be described as a tirzepatide replacement/i);
  });
});

// ---------------------------------------------------------------------------
describe('novelty is three separate questions, never one word', () => {
  test('prior art with no search is NO_ACCESS, not "novel"', () => {
    const n = assessNovelty([{ status: 'retained', generation: 0, canonicalSmiles: 'c1ccccc1' }], { priorArtSearch: false });
    assert.equal(n.priorArt.status, 'NO_ACCESS');
    assert.equal(n.priorArt.searched, false);
  });

  test('structural novelty is explicitly scoped to this corpus only', () => {
    const n = assessNovelty(
      [{ status: 'retained', generation: 0, canonicalSmiles: 'c1ccccc1' }, { status: 'retained', generation: 1, canonicalSmiles: 'Cc1ccccc1', parentSmiles: 'c1ccccc1', transformation: 'add-methyl' }],
      { priorArtSearch: false },
    );
    assert.equal(n.structural.derivedFromSeeds, 1);
    assert.match(n.structural.basis, /within this campaign only/);
  });

  test('a derived candidate with no recorded parent makes lineage INCOMPLETE', () => {
    const n = assessNovelty(
      [{ status: 'retained', generation: 0, canonicalSmiles: 'c1ccccc1' }, { status: 'retained', generation: 1, canonicalSmiles: 'Cc1ccccc1' }],
      { priorArtSearch: false },
    );
    assert.equal(n.lineage.status, 'INCOMPLETE');
  });
});

// ---------------------------------------------------------------------------
describe('falsification probes are computed, and UNRESOLVED is never reported as PASS', () => {
  test('a duplicate in the retained set is caught', () => {
    const f = falsifyRun({ startingSmiles: [] }, [
      { status: 'retained', canonicalSmiles: 'c1ccccc1', objectiveVector: {} },
      { status: 'retained', canonicalSmiles: 'c1ccccc1', objectiveVector: {} },
    ], { terms: [] });
    assert.ok(f.failed.includes('NO_DUPLICATE_RETAINED'));
  });

  test('a gate that never bit is UNRESOLVED, not PASS — inertness and permissiveness are not the same claim', () => {
    const f = falsifyRun({ startingSmiles: ['c1ccccc1'] }, [
      { status: 'retained', canonicalSmiles: 'c1ccccc1', objectiveVector: {} },
      { status: 'retained', canonicalSmiles: 'Cc1ccccc1', parentSmiles: 'c1ccccc1', transformation: 'add-methyl', objectiveVector: {} },
    ], { terms: [] });
    assert.ok(f.unresolved.includes('LIABILITY_GATE_ACTUALLY_BIT'));
    assert.ok(!f.probes.find((p) => p.probe === 'LIABILITY_GATE_ACTUALLY_BIT' && p.result === 'PASS'));
  });

  test('a gate term appearing in an objective vector is caught as a Goodhart leak', () => {
    const f = falsifyRun({ startingSmiles: [] }, [
      { status: 'retained', canonicalSmiles: 'c1ccccc1', objectiveVector: { qed: 0.5 } },
    ], { terms: [{ term: 'qed', kind: 'min', value: 0.1 }] });
    assert.ok(f.failed.includes('NO_GATE_TERM_IN_OBJECTIVE'));
  });
});

// ---------------------------------------------------------------------------
describe('the next action is computed from the real blocker set, not scripted', () => {
  test('it selects the action clearing the most OPEN blockers, and names them', () => {
    const d = { blockers: [{ code: 'NO_COMPARABLE_AXIS' }, { code: 'EFFICACY_AXIS_UNAVAILABLE' }, { code: 'PRIOR_ART_UNVERIFIABLE' }] };
    const p = nextAction(d);
    assert.equal(p.actionId, 'OBTAIN_BASELINE_AND_ACTIVE_STRUCTURES');
    assert.match(p.rationale, /clears 2 of 3/);
  });

  test('with only a prior-art blocker open it switches to the prior-art action — proving it is not a fixed answer', () => {
    const p = nextAction({ blockers: [{ code: 'PRIOR_ART_UNVERIFIABLE' }] });
    assert.equal(p.actionId, 'ENABLE_PRIOR_ART_SEARCH');
  });

  test('with no blockers it recommends nothing rather than inventing work', () => {
    const p = nextAction({ blockers: [] });
    assert.equal(p.actionId, null);
  });

  test('a stop condition is always stated', () => {
    assert.match(nextAction({ blockers: [] }).stopCondition, /stop when/i);
  });
});

// ---------------------------------------------------------------------------
describe('mission inputs are mandatory — it will not invent a starting population', () => {
  test('no seeds => refused', () => {
    const { db, project } = setup();
    const r = runMolecularMission(db, { ...MISSION_ARGS, projectId: project.id, seeds: [] });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'SEEDS_REQUIRED');
  });

  test('seeds without stated provenance => refused', () => {
    const { db, project } = setup();
    const r = runMolecularMission(db, { ...MISSION_ARGS, projectId: project.id, seedProvenance: '' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'SEED_PROVENANCE_REQUIRED');
  });

  test('a mismatched frozen rule => refused before any candidate is generated', () => {
    const { db, project } = setup();
    const r = runMolecularMission(db, { ...MISSION_ARGS, projectId: project.id, expectedRuleFingerprint: 'wrong' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'RULE_MISMATCH');
  });
});

// ---------------------------------------------------------------------------
describe('GENESIS-MOL-01 end to end on the real engines', skipNoRdkit, () => {
  test('the mission runs, earns NO_WINNER, and names every blocker', () => {
    const { db, project } = setup();
    const r = runMolecularMission(db, { ...MISSION_ARGS, projectId: project.id });
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.decision.outcome, 'NO_WINNER');
    const codes = r.decision.blockers.map((b) => b.code);
    assert.ok(codes.includes('NO_COMPARABLE_AXIS'));
    assert.ok(codes.includes('EFFICACY_AXIS_UNAVAILABLE'));
    assert.ok(codes.includes('PRIOR_ART_UNVERIFIABLE'));
  });

  test('real candidates were generated beyond the seed set, with real lineage', () => {
    const { db, project } = setup();
    const r = runMolecularMission(db, { ...MISSION_ARGS, projectId: project.id });
    assert.ok(r.summary.totalGenerated > MISSION_ARGS.seeds.length);
    assert.equal(r.novelty.lineage.status, 'FULLY_TRACED');
    assert.ok(r.novelty.structural.derivedFromSeeds > 0);
  });

  test('the recipe fingerprint is deterministic across two independent runs', () => {
    const a = setup();
    const b = setup();
    const r1 = runMolecularMission(a.db, { ...MISSION_ARGS, projectId: a.project.id });
    const r2 = runMolecularMission(b.db, { ...MISSION_ARGS, projectId: b.project.id });
    assert.equal(r1.recipe.recipeFingerprint, r2.recipe.recipeFingerprint);
  });

  test('the recipe body contains no timestamp, no wall-clock and no random id', () => {
    const { db, project } = setup();
    const r = runMolecularMission(db, { ...MISSION_ARGS, projectId: project.id });
    const body = JSON.stringify(r.recipe);
    assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(body), 'no ISO timestamp in the recipe');
    assert.ok(!/"(createdAt|updatedAt|retrievedAt|ranAt)"/.test(body), 'no clock field in the recipe');
  });

  test('the recipe carries baseline, frozen rule, engines, falsification, novelty, decision and next action', () => {
    const { db, project } = setup();
    const r = runMolecularMission(db, { ...MISSION_ARGS, projectId: project.id });
    for (const k of ['baseline', 'seeds', 'seedProvenance', 'frozenRule', 'engines', 'paretoFront', 'comparableAxes', 'falsification', 'novelty', 'decision', 'nextAction', 'limitations', 'reproducibilityInstructions']) {
      assert.ok(k in r.recipe, `recipe is missing ${k}`);
    }
    assert.equal(r.recipe.frozenRule.ruleFingerprint, RULE_FP);
  });

  test('every Pareto candidate carries a real structure-derived identity', () => {
    const { db, project } = setup();
    const r = runMolecularMission(db, { ...MISSION_ARGS, projectId: project.id });
    assert.ok(r.recipe.paretoFront.length > 0);
    for (const c of r.recipe.paretoFront) {
      assert.match(c.inchiKey ?? '', /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/, `bad InChIKey for ${c.canonicalSmiles}`);
    }
  });

  test('the objective was frozen before the search and is fingerprinted', () => {
    const o = missionObjective();
    assert.equal(o.objectiveFingerprint.length, 16);
    assert.ok(o.requiredAxes.some((a) => a.axis === 'TARGET_RELEVANT_ACTIVITY' && a.decisive));
  });

  test('capability probe reports the real runtime, and never claims an activity predictor', () => {
    const c = probeCapabilities();
    assert.equal(c.activityPredictor, false);
    assert.equal(c.rdkit, RDKIT);
  });
});
