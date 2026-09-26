import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase, createUser, createProject, createJob, getJob } from './store.mjs';
import { hashPassword } from './auth.mjs';
import { detect } from './compute/rdkitAdapter.mjs';
import { availableTransformations } from './campaign/drugAdapter.mjs';
import { createCampaign, listCandidates, listEvents } from './campaign/persistence.mjs';
import { runCampaign } from './campaign/orchestrator.mjs';
import { runJob } from './compute/jobs.mjs';
import { databaseFile } from './compute/heavyJobThread.mjs';

/**
 * LIVE EXPERIMENT F0 — the campaign's own persisted stage events are observable WHILE it runs.
 *
 * With a file database the heavy job runs the SAME `runCampaign` on a worker thread, so this thread
 * can poll `campaign_events` mid-run. The result must be identical to the in-process run (same
 * engine, same seed → same candidates); the worker changes WHEN state is readable, never WHAT it is.
 */
const RDKIT = detect().available;
const maybe = RDKIT ? test : test.skip;

function seedCampaign(db) {
  const u = createUser(db, { email: `live-${Math.random()}@lab.org`, displayName: 'L', passwordHash: hashPassword('password123') });
  const p = createProject(db, { name: 'Live', ownerId: u.id });
  const tx = availableTransformations();
  const c = createCampaign(db, {
    projectId: p.id, objective: 'MPO benchmark (software validation)', domain: 'DRUG_DISCOVERY',
    budget: { maxGenerations: 3, maxGeneratedCandidates: 12 },
    stopping: { patience: 5, minImprovement: 1e-4, diversityFloor: 0.05 },
    strategy: { startingSmiles: ['c1ccccc1'], transformationWeights: Object.fromEntries(tx.map((t) => [t, 1])), parentSelection: 'pareto' },
    seed: 7,
    createdBy: u.id,
  });
  return { user: u, project: p, campaign: c };
}

describe('live campaign events (worker thread + event cursor)', () => {
  test('a :memory: database has no file, so jobs keep running in-process', () => {
    const db = openDatabase();
    assert.equal(databaseFile(db), null);
  });

  maybe('events are readable mid-run, in order, and the result equals the in-process run', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-live-'));
    const db = openDatabase(path.join(dir, 'live.db'));
    try {
      assert.equal(databaseFile(db), path.join(dir, 'live.db'));
      const { user, project, campaign } = seedCampaign(db);
      const job = createJob(db, { projectId: project.id, type: 'campaign-run', params: { campaignId: campaign.id }, createdBy: user.id });

      const snapshots = [];
      let done = false;
      const running = runJob(db, job.id).then(() => { done = true; });
      while (!done) {
        const status = getJob(db, job.id)?.status;
        if (status === 'running') snapshots.push(listEvents(db, campaign.id).length);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await running;
      assert.equal(getJob(db, job.id).status, 'completed');
      // This thread was free during the run: it observed the job as running at least once.
      assert.ok(snapshots.length > 0, 'the HTTP thread must be able to read state while the engines compute');

      const all = listEvents(db, campaign.id);
      assert.ok(all.length >= 2);
      for (let i = 1; i < all.length; i += 1) assert.ok(all[i].seq > all[i - 1].seq, 'seq is strictly increasing (insertion order)');
      const cursor = all[Math.floor(all.length / 2)].seq;
      assert.deepEqual(listEvents(db, campaign.id, { afterSeq: cursor }).map((e) => e.id), all.filter((e) => e.seq > cursor).map((e) => e.id));

      // Same campaign definition, run in-process on :memory: → the same candidates.
      const mem = openDatabase();
      const again = seedCampaign(mem);
      runCampaign(mem, again.campaign.id);
      const smiles = (d, id) => listCandidates(d, id).map((c) => `${c.generation}:${c.canonicalSmiles}:${c.status}`).sort();
      assert.deepEqual(smiles(db, campaign.id), smiles(mem, again.campaign.id));
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
