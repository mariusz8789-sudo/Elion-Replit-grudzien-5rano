import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase, createUser, createProject } from './store.mjs';
import { hashPassword } from './auth.mjs';
import {
  AGENT_RUN_STATUS, createAgentRun, getAgentRun, listAgentRuns, updateAgentRunStatus,
  addAgentStep, listAgentSteps,
} from './agentRun.mjs';

function setup(db) {
  const u = createUser(db, { email: 'agent@lab.org', displayName: 'A', passwordHash: hashPassword('password123') });
  const p = createProject(db, { name: 'AgentRuns', ownerId: u.id });
  return { user: u, project: p };
}

describe('AgentRun — a real, resumable multi-step agent investigation', () => {
  test('createAgentRun starts RUNNING with no final answer yet', () => {
    const db = openDatabase(':memory:');
    const { project, user } = setup(db);
    const run = createAgentRun(db, { projectId: project.id, goal: 'investigate flood risk to the hospital', domain: 'WORLD_MODEL', createdBy: user.id });
    assert.equal(run.status, AGENT_RUN_STATUS.RUNNING);
    assert.equal(run.final, null);
    assert.equal(run.goal, 'investigate flood risk to the hospital');
    assert.equal(run.domain, 'WORLD_MODEL');
  });

  test('addAgentStep is append-only — steps accumulate in order, none overwritten', () => {
    const db = openDatabase(':memory:');
    const { project } = setup(db);
    const run = createAgentRun(db, { projectId: project.id, goal: 'g', domain: 'WORLD_MODEL' });

    addAgentStep(db, {
      agentRunId: run.id, stepIndex: 0, hypothesis: { criterion: 'H1' }, toolInvoked: 'runRainfallIntensityCounterfactual',
      capability: 'RUN_EXPERIMENT', branchId: 'branch-1', observation: { tripped: true },
      falsificationVerdict: { status: 'MATCH' }, retryCount: 0, nextAction: { kind: 'CONTINUE' }, provenanceEventIds: ['evt-1'],
    });
    addAgentStep(db, {
      agentRunId: run.id, stepIndex: 1, hypothesis: { criterion: 'H2' }, toolInvoked: 'triggerPumpFailure',
      capability: 'FORK_BRANCH', retryCount: 0, nextAction: { kind: 'STOP' }, provenanceEventIds: [],
    });

    const steps = listAgentSteps(db, run.id);
    assert.equal(steps.length, 2);
    assert.equal(steps[0].stepIndex, 0);
    assert.equal(steps[0].toolInvoked, 'runRainfallIntensityCounterfactual');
    assert.deepEqual(steps[0].hypothesis, { criterion: 'H1' });
    assert.deepEqual(steps[0].observation, { tripped: true });
    assert.deepEqual(steps[0].falsificationVerdict, { status: 'MATCH' });
    assert.deepEqual(steps[0].provenanceEventIds, ['evt-1']);
    assert.equal(steps[1].stepIndex, 1);
    assert.equal(steps[1].branchId, null); // never supplied for this step — null, not fabricated
  });

  test('updateAgentRunStatus moves a run to a real terminal state with its final answer', () => {
    const db = openDatabase(':memory:');
    const { project } = setup(db);
    const run = createAgentRun(db, { projectId: project.id, goal: 'g', domain: 'WORLD_MODEL' });
    const resolved = updateAgentRunStatus(db, run.id, AGENT_RUN_STATUS.RESOLVED, { ranking: ['optionA'] });
    assert.equal(resolved.status, 'RESOLVED');
    assert.deepEqual(resolved.final, { ranking: ['optionA'] });
  });

  test('rejects a bogus status string rather than silently persisting it', () => {
    const db = openDatabase(':memory:');
    const { project } = setup(db);
    const run = createAgentRun(db, { projectId: project.id, goal: 'g', domain: 'WORLD_MODEL' });
    assert.throws(() => updateAgentRunStatus(db, run.id, 'MADE_UP_STATUS'), /invalid_agent_run_status/);
  });

  test('listAgentRuns scopes to the project and orders newest-first', () => {
    const db = openDatabase(':memory:');
    const { project } = setup(db);
    const a = createAgentRun(db, { projectId: project.id, goal: 'first', domain: 'WORLD_MODEL' });
    const b = createAgentRun(db, { projectId: project.id, goal: 'second', domain: 'WORLD_MODEL' });
    const ids = listAgentRuns(db, project.id).map((r) => r.id);
    assert.deepEqual(ids, [b.id, a.id]);
  });

  test('getAgentRun for an unknown id is null, never fabricated', () => {
    const db = openDatabase(':memory:');
    assert.equal(getAgentRun(db, 'nonexistent'), null);
  });
});

describe('AgentRun persistence survives a real process restart (same discipline as world-snapshot persistence)', () => {
  test('write a run + steps, close the DB handle, reopen on the same file, read back byte-identical', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-agent-run-store-'));
    const dbPath = path.join(dir, 'genesis.db');
    try {
      let db = openDatabase(dbPath);
      const { project } = setup(db);
      const run = createAgentRun(db, { projectId: project.id, goal: 'restart-goal', domain: 'WORLD_MODEL', budget: { maxSteps: 5 } });
      addAgentStep(db, {
        agentRunId: run.id, stepIndex: 0, hypothesis: { criterion: 'H1' }, toolInvoked: 'runRainfallIntensityCounterfactual',
        capability: 'RUN_EXPERIMENT', branchId: 'branch-1', observation: { tripped: true }, retryCount: 0,
        nextAction: { kind: 'CONTINUE' }, provenanceEventIds: ['evt-1'],
      });
      updateAgentRunStatus(db, run.id, AGENT_RUN_STATUS.RUNNING);
      db.close();
      db = undefined;

      // SIMULATED RESTART: a completely fresh handle on the same file.
      const restarted = openDatabase(dbPath);
      const reloaded = getAgentRun(restarted, run.id);
      assert.ok(reloaded, 'run must be readable after reopening the database file');
      assert.equal(reloaded.goal, 'restart-goal');
      assert.deepEqual(reloaded.budget, { maxSteps: 5 });
      assert.equal(reloaded.status, 'RUNNING');

      const steps = listAgentSteps(restarted, run.id);
      assert.equal(steps.length, 1);
      assert.equal(steps[0].toolInvoked, 'runRainfallIntensityCounterfactual');
      assert.deepEqual(steps[0].observation, { tripped: true });

      // A step added AFTER "restart", and a resolution, persist too, through the same handle.
      addAgentStep(restarted, {
        agentRunId: run.id, stepIndex: 1, hypothesis: {}, toolInvoked: 'evaluateDecision',
        capability: 'RUN_EXPERIMENT', retryCount: 0, nextAction: { kind: 'STOP' }, provenanceEventIds: [],
      });
      updateAgentRunStatus(restarted, run.id, AGENT_RUN_STATUS.RESOLVED, { ranking: ['optionA'] });
      restarted.close();

      const thirdHandle = openDatabase(dbPath);
      const final = getAgentRun(thirdHandle, run.id);
      assert.equal(final.status, 'RESOLVED');
      assert.deepEqual(final.final, { ranking: ['optionA'] });
      assert.equal(listAgentSteps(thirdHandle, run.id).length, 2);
      thirdHandle.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
