import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';

function createFixture(db) {
  const api = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {} });
  const owner = api('POST', '/api/auth/register', { body: { email: 'control@lab.org', password: 'password123' } }).body;
  const project = api('POST', '/api/projects', { token: owner.token, body: { name: 'Control proof' } }).body.project;
  const base = `/api/projects/${project.id}/research-runs`;
  const started = api('POST', base, { token: owner.token, body: { question: 'Can this run survive operator control?' } });
  return { api, owner, project, base, runId: started.body.researchRun.researchRunId };
}

describe('ResearchRun durable operator control', () => {
  test('pause → restart → resume → cancel uses one run and one verified event chain', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-run-control-'));
    const dbPath = path.join(dir, 'genesis.sqlite');
    try {
      let db = openDatabase(dbPath);
      let fixture = createFixture(db);
      const paused = await fixture.api('POST', `${fixture.base}/${fixture.runId}/pause`, {
        token: fixture.owner.token,
        body: { reason: 'Operator budget review' },
      });
      assert.equal(paused.status, 200);
      assert.equal(paused.body.researchRun.run.status, 'PAUSED');
      assert.equal(paused.body.researchRun.nextStep, 'NONE');
      assert.equal(paused.body.researchRun.researchState.chain.ok, true);
      db.close();

      db = openDatabase(dbPath);
      fixture = { ...fixture, api: (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {} }) };
      const recovered = fixture.api('GET', `${fixture.base}/${fixture.runId}`, { token: fixture.owner.token });
      assert.equal(recovered.body.researchRun.run.status, 'PAUSED');
      const resumed = await fixture.api('POST', `${fixture.base}/${fixture.runId}/resume`, { token: fixture.owner.token });
      assert.equal(resumed.status, 200);
      assert.equal(resumed.body.researchRun.run.status, 'RUNNING');
      assert.equal(resumed.body.researchRun.nextStep, 'PROPOSE_PLAN');
      const cancelled = await fixture.api('POST', `${fixture.base}/${fixture.runId}/cancel`, { token: fixture.owner.token });
      assert.equal(cancelled.status, 200);
      assert.equal(cancelled.body.researchRun.run.status, 'CANCELLED');
      assert.equal(cancelled.body.researchRun.nextStep, 'NONE');
      assert.deepEqual(
        cancelled.body.researchRun.researchState.events.filter((event) => event.type === 'RUN_CONTROLLED').map((event) => event.payload.action),
        ['PAUSE', 'RESUME', 'CANCEL'],
      );
      assert.equal(cancelled.body.researchRun.researchState.chain.ok, true);
      assert.equal((await fixture.api('POST', `${fixture.base}/${fixture.runId}/resume`, { token: fixture.owner.token })).status, 409);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
