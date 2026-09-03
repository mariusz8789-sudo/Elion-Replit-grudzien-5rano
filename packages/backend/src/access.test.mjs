import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';

function call(db, method, pathname, options = {}) {
  return handleApi(db, { method, pathname, token: options.token ?? null, body: options.body ?? {}, query: options.query ?? {} });
}

function setup() {
  const db = openDatabase();
  const registered = call(db, 'POST', '/api/auth/register', { body: { email: 'researcher@example.org', password: 'password123' } }).body;
  const project = call(db, 'POST', '/api/projects', { token: registered.token, body: { name: 'Genesis vertical slice' } }).body.project;
  return { db, token: registered.token, project };
}

test('project access policy is backend-enforced and auditable', () => {
  const { db, token, project } = setup();
  const initial = call(db, 'GET', `/api/projects/${project.id}/access`, { token });
  assert.equal(initial.status, 200);
  assert.equal(initial.body.accessLevel, 'RESEARCH');
  assert.equal(initial.body.canRun, true);

  const changed = call(db, 'PUT', `/api/projects/${project.id}/access`, { token, body: { level: 'RESTRICTED' } });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.accessLevel, 'RESTRICTED');

  const run = call(db, 'POST', '/api/compute/fabric/run', {
    token,
    body: { contractVersion: '1.0.0', modelId: 'chem-molecular-weight', domainId: 'chemistry', sourceText: 'access test', projectId: project.id, inputs: { formula: 'H2O' } },
  });
  assert.equal(run.status, 200);
  assert.equal(run.body.run.status, 'ok');

  const audit = call(db, 'GET', `/api/projects/${project.id}/audit`, { token });
  assert.equal(audit.status, 200);
  assert.equal(audit.body.entries.length, 2);
  assert.equal(audit.body.entries[0].action, 'scientific_run');
  assert.equal(audit.body.entries[0].workflow, 'genesis-chat-core-handoff');
});
