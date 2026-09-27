/**
 * Autonomous Discovery Forge — unit + HOSTILE AUTONOMY tests A–Q (Final WOW Mandate).
 * Deterministic via injected fake engines; the campaign's adaptivity is proven by artifacts
 * (plan hash changes, cohort diffs, Necropolis avoidance), not asserted narratively.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as store from './store.mjs';
import * as forge from './cognitive/discoveryForge.mjs';
import * as ctrl from './cognitive/discoveryController.mjs';

// A deterministic fake engine set. Candidate "SMILES" encode properties so descriptors/
// alerts can read them: `<seed>|<t>|MW<n>_LP<n>_A<n>`.
function parse(s) {
  const m = /MW(\d+)_LP(-?\d+)_A(\d+)/.exec(s) ?? [];
  return { molWt: Number(m[1] ?? 320), logP: Number(m[2] ?? 2), nAlerts: Number(m[3] ?? 0) };
}
const TMAP = { heavy: 'MW700_LP2_A0', alerty: 'MW300_LP2_A2', good: 'MW320_LP2_A0', good2: 'MW340_LP3_A0' };
function fakeEngines(over = {}) {
  return {
    listTransformations: () => ({ ok: true, transformations: ['heavy', 'alerty', 'good', 'good2'] }),
    transform: (smiles, t) => (TMAP[t] ? { ok: true, products: [`${smiles}|${t}|${TMAP[t]}`], transformation: t } : { ok: false, error: 'unknown_t' }),
    validate: (s) => ({ ok: true, canonicalSmiles: s }),
    descriptors: (s) => { const p = parse(s); return { ok: true, data: { molWt: p.molWt, crippenLogP: p.logP, lipinskiViolations: 0 } }; },
    alerts: (s) => { const p = parse(s); return { ok: true, nAlerts: p.nAlerts, alerts: p.nAlerts ? Array(p.nAlerts).fill('alert') : [] }; },
    saScore: () => ({ ok: true, saScore: 3 }),
    novelty: (s, ref) => ({ ok: true, maxTanimoto: ref.includes(s) ? 1 : 0.2 }),
    admetDetect: () => ({ available: false }),
    ...over,
  };
}
const seeds = [{ name: 'seedA', smiles: 'BASE' }];
const run = (db, opts = {}) => ctrl.runCampaign(db, { projectId: 'acme', challenge: { grandChallenge: 'demo', maxMolWt: 550, maxAlerts: 0, maxLogP: 5 }, seeds, engines: fakeEngines(opts.engines), maxGenerations: opts.maxGenerations ?? 2, ...opts });

describe('autonomous loop core', () => {
  test('runs multiple generations and produces computational finalists (not validated drugs)', () => {
    const db = openDatabase(':memory:');
    const r = run(db);
    assert.ok(r.generations.length >= 2);
    assert.equal(r.status, 'COMPLETED_WITH_COMPUTATIONAL_CANDIDATES');
    assert.ok(r.finalists.every((f) => f.candidate.status === 'FINALIST'));
    const dossier = ctrl.buildDossier(db, r.campaignId);
    assert.match(dossier.classification, /COMPUTATIONAL_CANDIDATE/);
    assert.match(dossier.limitationStatement, /not experimentally validated/);
    db.close();
  });
});

describe('hostile autonomy A–Q', () => {
  test('A static-loop detection: plan hash changes only when a real plan field changes', () => {
    const plan = forge.initialPlan({});
    const noObs = { survivors: 2, rejected: 0, alertRejections: 0, mwRejections: 0, logpRejections: 0, failingTransformations: [] };
    const m1 = forge.mutatePlan(plan, noObs); const m2 = forge.mutatePlan(plan, noObs);
    assert.equal(m1.newPlanHash, m2.newPlanHash); // deterministic
    const withFail = { survivors: 0, rejected: 2, alertRejections: 2, mwRejections: 0, logpRejections: 0, failingTransformations: ['alerty'] };
    assert.notEqual(forge.mutatePlan(plan, withFail).newPlanHash, m1.newPlanHash); // justified change differs
  });

  test('B fake mutation: identical plan+observations never yields a different hash (no id/timestamp entropy)', () => {
    const plan = forge.initialPlan({});
    const obs = { survivors: 0, rejected: 1, alertRejections: 0, mwRejections: 1, logpRejections: 0, failingTransformations: [] };
    assert.equal(forge.mutatePlan(plan, obs).newPlanHash, forge.mutatePlan(plan, obs).newPlanHash);
  });

  test('C hype resistance: grandiose challenge wording does not change candidate ranking', () => {
    const db1 = openDatabase(':memory:'); const db2 = openDatabase(':memory:');
    const plain = ctrl.runCampaign(db1, { projectId: 'p', challenge: { grandChallenge: 'demo', maxMolWt: 550 }, seeds, engines: fakeEngines(), maxGenerations: 1 });
    const hyped = ctrl.runCampaign(db2, { projectId: 'p', challenge: { grandChallenge: 'REVOLUTIONARY MIRACLE CURE!!!', maxMolWt: 550 }, seeds, engines: fakeEngines(), maxGenerations: 1 });
    assert.deepEqual(plain.finalists.map((f) => f.candidate.canonicalStructureHash), hyped.finalists.map((f) => f.candidate.canonicalStructureHash));
    db1.close(); db2.close();
  });

  test('D candidate duplication: same canonical structure is not double-counted', () => {
    const db = openDatabase(':memory:');
    // A transform set where two transformations map to the SAME product.
    const eng = fakeEngines({ listTransformations: () => ({ ok: true, transformations: ['good', 'dupe'] }), transform: (s, t) => ({ ok: true, products: [`${s}|X|MW320_LP2_A0`], transformation: t }) });
    const cohort = forge.generateCohort(db, store.createDiscoveryCampaign(db, { projectId: 'p', status: 'CREATED' }), { generation: 0, plan: forge.initialPlan({}), seeds, engines: eng });
    const canon = cohort.candidates.map((c) => c.canonicalStructure);
    assert.equal(new Set(canon).size, canon.length); // all unique
    db.close();
  });

  test('E engine misuse: PySCF is SKIPPED without a defined quantum question', () => {
    const routes = forge.engineApplicability(null, { engines: fakeEngines() });
    assert.equal(routes.find((r) => r.engine === 'PySCF').decision, 'SKIP');
  });

  test('F fake docking: Vina is CAPABILITY_BLOCKED without a real receptor', () => {
    const routes = forge.engineApplicability(null, { hasReceptor: false, engines: fakeEngines() });
    assert.equal(routes.find((r) => r.engine === 'AutoDock Vina').decision, 'CAPABILITY_BLOCKED');
  });

  test('G fake MD: OpenMM is CAPABILITY_BLOCKED without a prepared system', () => {
    const routes = forge.engineApplicability(null, { mdSystem: null, engines: fakeEngines() });
    assert.equal(routes.find((r) => r.engine === 'OpenMM').decision, 'CAPABILITY_BLOCKED');
  });

  test('H unsupported evidence: a model-proposed claim never becomes SOURCE_SUPPORTED without a source', () => {
    assert.equal(forge.classifyClaim({ text: 'X inhibits Y', proposedByModel: true }).state, 'MODEL_PROPOSED');
    assert.equal(forge.classifyClaim({ text: 'X inhibits Y', proposedByModel: true, sources: [{ direction: 'supporting', doi: '10.x/y' }] }).state, 'SOURCE_SUPPORTED');
  });

  test('I Necropolis memory: a known failed region is avoided in the next generation', () => {
    const db = openDatabase(':memory:');
    const r = run(db, { maxGenerations: 2 });
    const cohorts = store.listDiscoveryEvents(db, r.campaignId, { type: 'COHORT' });
    // gen1 must skip the "heavy" (MW700) region recorded as a dead end in gen0.
    const gen1 = cohorts.find((e) => e.generation === 1);
    assert.ok(gen1.payload.skipped.some((s) => /necropolis_dead_end/.test(s.reason)), 'gen1 avoids the recorded dead-end region');
    db.close();
  });

  test('J tenant isolation: tenant A discovery memory does not influence tenant B', () => {
    const db = openDatabase(':memory:');
    run(db, { projectId: 'tenantA', maxGenerations: 2 }); // records heavy dead ends for A
    // Tenant B: generate a cohort; the heavy region must NOT be skipped for B.
    const campB = store.createDiscoveryCampaign(db, { projectId: 'tenantB', status: 'CREATED' });
    const cohortB = forge.generateCohort(db, campB, { generation: 0, plan: forge.initialPlan({}), seeds, engines: fakeEngines() });
    assert.ok(!cohortB.skipped.some((s) => /necropolis_dead_end/.test(s.reason)), 'tenant B sees none of tenant A failure memory');
    db.close();
  });

  test('K no-information-gain: an all-reject campaign with no productive move stops honestly', () => {
    const db = openDatabase(':memory:');
    // Every transform yields an over-weight molecule; region can be narrowed once then converges to no survivors.
    const eng = fakeEngines({ listTransformations: () => ({ ok: true, transformations: ['heavy'] }), transform: (s, t) => ({ ok: true, products: [`${s}|${t}|MW900_LP2_A0`], transformation: t }) });
    const r = ctrl.runCampaign(db, { projectId: 'p', challenge: { grandChallenge: 'x', maxMolWt: 550 }, seeds, engines: eng, maxGenerations: 5 });
    assert.equal(r.status, 'COMPLETED_NO_SURVIVORS');
    assert.ok(['NO_INFORMATION_GAIN', 'GENERATION_BUDGET_EXHAUSTED'].includes(r.stopReason));
    db.close();
  });

  test('L budget exhaustion: generation budget stops the campaign', () => {
    const db = openDatabase(':memory:');
    const r = run(db, { maxGenerations: 1 });
    assert.equal(r.generations.length, 1);
    assert.equal(r.stopReason, 'GENERATION_BUDGET_EXHAUSTED');
    db.close();
  });

  test('M capability blocked: a candidate whose descriptors cannot be computed is not fabricated as passing', () => {
    const eng = fakeEngines({ descriptors: () => ({ ok: false, error: 'engine_error' }) });
    const res = forge.funnelCandidate({ canonicalStructure: 'X', provenance: {} }, { plan: forge.initialPlan({}), engines: eng });
    assert.equal(res.status, 'CAPABILITY_BLOCKED');
  });

  test('N novelty unavailable: returns NOVELTY_UNRESOLVED without live sources', () => {
    const nov = forge.noveltyGate({ canonicalStructure: 'ZZZ' }, { maxTanimoto: 0.2 }, { referenceSet: [], liveSources: false });
    assert.equal(nov.status, 'NOVELTY_UNRESOLVED');
  });

  test('O replay: same seeds+engines reproduce identical candidate structure hashes', () => {
    const db1 = openDatabase(':memory:'); const db2 = openDatabase(':memory:');
    const a = run(db1); const b = run(db2);
    assert.deepEqual(a.finalists.map((f) => f.candidate.canonicalStructureHash), b.finalists.map((f) => f.candidate.canonicalStructureHash));
    db1.close(); db2.close();
  });

  test('P critic demotion: a close analogue (best raw numbers) is demoted by a justified critical finding', () => {
    // Make the "good" product identical to a reference structure → maxTanimoto 1 → close-analogue demotion.
    const refStruct = 'BASE|good|MW320_LP2_A0';
    const c = forge.critiqueCandidate({ canonicalStructure: refStruct, provenance: {} }, { maxTanimoto: 1.0, saScore: 3, nAlerts: 0 }, { enginesRun: ['RDKit'] });
    assert.equal(c.demote, true);
    assert.ok(c.critiques.some((x) => x.concern === 'close-analogue'));
  });

  test('Q negative result: zero survivors produces COMPLETED_NO_SURVIVORS, never a fake winner', () => {
    const db = openDatabase(':memory:');
    const eng = fakeEngines({ listTransformations: () => ({ ok: true, transformations: ['alerty'] }) }); // every product has 2 alerts
    const r = ctrl.runCampaign(db, { projectId: 'p', challenge: { grandChallenge: 'x', maxMolWt: 550, maxAlerts: 0 }, seeds, engines: eng, maxGenerations: 2 });
    assert.equal(r.status, 'COMPLETED_NO_SURVIVORS');
    assert.equal(r.finalists.length, 0);
    db.close();
  });
});

describe('WOW proof: plan changed because of observed results', () => {
  test('gen0 failures → Necropolis event → plan mutation (hash change) → gen1 cohort differs', () => {
    const db = openDatabase(':memory:');
    const r = run(db, { maxGenerations: 2 });
    const ev = store.listDiscoveryEvents(db, r.campaignId);
    assert.ok(ev.find((e) => e.type === 'CAMPAIGN_INIT'), 'campaign was initialized with a plan hash');
    const mutation = ev.find((e) => e.type === 'PLAN_MUTATION');
    const necroEv = ev.find((e) => e.type === 'NECROPOLIS');
    const cohorts = ev.filter((e) => e.type === 'COHORT');
    assert.ok(necroEv, 'a failure-memory event was recorded');
    assert.ok(mutation, 'a plan mutation occurred');
    assert.notEqual(mutation.payload.previousPlanHash, mutation.payload.newPlanHash, 'plan hash materially changed');
    // gen0 vs gen1 cohorts differ (a transformation was dropped and/or a dead-end region skipped).
    const gen0 = cohorts.find((c) => c.generation === 0).payload.candidates.map((c) => c.via).sort();
    const gen1 = cohorts.find((c) => c.generation === 1).payload.candidates.map((c) => c.via).sort();
    assert.notDeepEqual(gen0, gen1, 'generation 1 candidate lineage materially differs from generation 0');
    db.close();
  });
});
