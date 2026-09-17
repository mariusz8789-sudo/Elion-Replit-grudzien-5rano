import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, createProject, listScienceRunsForCandidate } from './store.mjs';
import { hashPassword } from './auth.mjs';
import { detect } from './compute/rdkitAdapter.mjs';
import { createCampaign, listCandidates } from './campaign/persistence.mjs';
import { runCampaign } from './campaign/orchestrator.mjs';
import { replayScienceRun, VERDICT } from './campaign/verify.mjs';

/**
 * REPLAY GAP CLOSED (docs/DECISIONS.md D-069 follow-up). Before this: the
 * campaign's own RDKit descriptor runs were persisted to the general-purpose
 * `runs` table (no `capability`, no `campaign_id`/`candidate_id` linkage) and
 * were INVISIBLE to `verify.mjs`'s `replayScienceRun`/`getScienceRun`, which
 * query the disjoint `science_runs` table. `getScienceRun` against one of the
 * campaign's real `runIds` returned `null` -- not even `REPLAY_UNSUPPORTED`.
 * These tests prove the real fix: a real candidate's REAL `candidateId` is
 * bound to a REAL `science_runs` row, and re-running the SAME RDKit call
 * reproduces it bit-exactly.
 */
const RDKIT = detect().available;
const maybe = RDKIT ? test : test.skip;

function setup() {
  const db = openDatabase(':memory:');
  const owner = createUser(db, { email: `replay-${Math.random()}@lab.org`, displayName: 'Owner', passwordHash: hashPassword('x') });
  const project = createProject(db, { ownerId: owner.id, name: 'p' });
  return { db, project };
}

describe('campaign descriptor runs are REAL science_runs rows, bound to the REAL candidateId', () => {
  maybe('a minimal real campaign persists a science_runs row for each retained candidate, with the real candidateId', () => {
    const { db, project } = setup();
    const campaign = createCampaign(db, {
      projectId: project.id, objective: 'x', domain: 'chem', objectiveVector: [], constraints: [],
      strategy: { startingSmiles: ['c1ccccc1'], transformationWeights: { 'add-methyl': 1 }, parentSelection: 'pareto' },
      budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
    });
    runCampaign(db, campaign.id);

    const candidates = listCandidates(db, campaign.id).filter((c) => c.status === 'retained');
    assert.ok(candidates.length > 0, 'the campaign must have retained at least one real candidate to prove anything');

    for (const c of candidates) {
      const runs = listScienceRunsForCandidate(db, c.id);
      assert.equal(runs.length, 1, `candidate ${c.id} must have exactly one bound science_runs row`);
      const run = runs[0];
      // The real binding this gap was about: NOT null, the actual candidate id.
      assert.equal(run.candidateId, c.id);
      assert.equal(run.campaignId, campaign.id);
      assert.equal(run.capability, 'molecular-descriptors');
      assert.equal(run.evidenceClass, 'COMPUTATIONAL'); // exact deterministic chemistry, not a MODEL_ESTIMATE prediction
      assert.equal(run.inputs.smiles, c.canonicalSmiles);
      assert.deepEqual(run.outputs, c.descriptors); // same real computation describeAsRun already made, not re-derived
      assert.ok(run.inputHash && run.outputHash, 'hashes must be real, not omitted');
      assert.ok(run.engine && run.engine.length > 0, 'engine must be the real RDKit engine string, not null');
    }
  });

  maybe('a rejected candidate (RDKit failure) leaves NO science_runs row -- no real computation, no fabricated one', () => {
    const { db, project } = setup();
    const campaign = createCampaign(db, {
      projectId: project.id, objective: 'x', domain: 'chem', objectiveVector: [], constraints: [],
      strategy: { startingSmiles: ['not-a-real-smiles!!!'], transformationWeights: {}, parentSelection: 'pareto' },
      budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
    });
    runCampaign(db, campaign.id);
    const candidates = listCandidates(db, campaign.id);
    for (const c of candidates) {
      assert.equal(listScienceRunsForCandidate(db, c.id).length, 0);
    }
  });

  maybe('the real REPLAYERS entry re-runs the SAME RDKit call and verdicts MATCH', () => {
    const { db, project } = setup();
    const campaign = createCampaign(db, {
      projectId: project.id, objective: 'x', domain: 'chem', objectiveVector: [], constraints: [],
      strategy: { startingSmiles: ['c1ccccc1'], transformationWeights: { 'add-methyl': 1 }, parentSelection: 'pareto' },
      budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
    });
    runCampaign(db, campaign.id);

    const candidate = listCandidates(db, campaign.id).find((c) => c.status === 'retained');
    assert.ok(candidate, 'need at least one retained candidate');
    const [run] = listScienceRunsForCandidate(db, candidate.id);
    assert.ok(run, 'candidate must have a bound science_runs row (proven by the prior test)');

    const replay = replayScienceRun(db, run.id);
    assert.equal(replay.ok, true);
    // This is the actual gap: before the fix, getScienceRun(db, run.id) with
    // a real campaign runId returned null (run_not_found) -- it never even
    // reached a verdict. Now it does, and the verdict is MATCH: the same
    // deterministic RDKit call reproduces the exact same outputs.
    assert.equal(replay.verdict, VERDICT.MATCH, JSON.stringify(replay.detail ?? replay));
  });

  maybe('replay is deterministic across two independent replays of the same run', () => {
    const { db, project } = setup();
    const campaign = createCampaign(db, {
      projectId: project.id, objective: 'x', domain: 'chem', objectiveVector: [], constraints: [],
      strategy: { startingSmiles: ['CCO'], transformationWeights: { 'add-methyl': 1 }, parentSelection: 'pareto' },
      budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
    });
    runCampaign(db, campaign.id);
    const candidate = listCandidates(db, campaign.id).find((c) => c.status === 'retained');
    assert.ok(candidate);
    const [run] = listScienceRunsForCandidate(db, candidate.id);
    const a = replayScienceRun(db, run.id);
    const b = replayScienceRun(db, run.id);
    assert.equal(a.verdict, VERDICT.MATCH);
    assert.equal(b.verdict, VERDICT.MATCH);
  });
});
