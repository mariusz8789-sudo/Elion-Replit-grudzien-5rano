import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';
import { canonicalJson, fnv1a } from './determinism.mjs';
import { RESEARCH_STATE_GENESIS_HEAD, RESEARCH_STATE_TOOL } from './agentRun.mjs';

/**
 * ENTITY-0 — Genesis Mind's research state survives a process restart. The events are the
 * frontend `ResearchStateLog`'s own (same chain rule, rebuilt here from `determinism.mjs`), stored
 * as agent-run steps, and every read re-verifies the chain instead of trusting what is on disk.
 */

function eventAfter(head, seq, type, payload) {
  const payloadFingerprint = fnv1a(canonicalJson(payload));
  const transitionFingerprint = fnv1a(canonicalJson({ prev: head, type, payloadFingerprint, seq }));
  return { seq, type, at: `t${seq}`, payload, payloadFingerprint, transitionFingerprint };
}

function chainOf(specs) {
  let head = RESEARCH_STATE_GENESIS_HEAD;
  return specs.map(([type, payload], seq) => {
    const event = eventAfter(head, seq, type, payload);
    head = event.transitionFingerprint;
    return event;
  });
}

function setup(db) {
  const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {} });
  const owner = call('POST', '/api/auth/register', { body: { email: 'mind@lab.org', password: 'password123' } }).body;
  const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'ENTITY-0' } }).body.project;
  return { call, owner, project };
}

const EVENTS = chainOf([
  ['PROBLEM_FORMALIZED', { problemId: 'kepler', problemFingerprint: 'abcd1234' }],
  ['HYPOTHESES_GENERATED', { hypotheses: ['H1', 'H2'] }],
  ['PREDICTIONS_FROZEN', { predictions: { H1: 1.5, H2: 2 } }],
  ['EVIDENCE_UPDATE', { evidenceRefs: ['EV-1'] }],
  ['NEXT_EXPERIMENT', { round: 0, continue: true, reason: 'pair not separated' }],
]);

describe('ENTITY-0 research state persistence (agent-run steps)', () => {
  test('events written before a restart are read back, in order, with a verified chain', () => {
    const dir = mkdtempSync(join(tmpdir(), 'genesis-entity0-'));
    const file = join(dir, 'genesis.db');
    try {
      let db = openDatabase(file);
      const { call, owner, project } = setup(db);
      const run = call('POST', `/api/projects/${project.id}/agent-runs`, { token: owner.token, body: { goal: 'Recover the exponent', domain: 'mind' } });
      assert.equal(run.status, 201);
      for (const event of EVENTS) {
        const r = call('POST', `/api/projects/${project.id}/agent-runs/${run.body.run.id}/research-state`, { token: owner.token, body: { event } });
        assert.equal(r.status, 201, JSON.stringify(r.body));
      }
      db.close();

      db = openDatabase(file); // the "restart": a fresh connection to the same file
      const again = handleApi(db, { method: 'GET', pathname: `/api/projects/${project.id}/agent-runs/${run.body.run.id}`, token: owner.token, body: null, query: {} });
      assert.equal(again.status, 200);
      assert.deepEqual(again.body.researchState.events, EVENTS);
      assert.equal(again.body.researchState.chain.ok, true);
      assert.equal(again.body.researchState.chain.head, EVENTS.at(-1).transitionFingerprint);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an event that does not extend the current head is refused; the same event twice is a no-op', () => {
    const db = openDatabase();
    const { call, owner, project } = setup(db);
    const runId = call('POST', `/api/projects/${project.id}/agent-runs`, { token: owner.token, body: { goal: 'g', domain: 'mind' } }).body.run.id;
    const path = `/api/projects/${project.id}/agent-runs/${runId}/research-state`;
    assert.equal(call('POST', path, { token: owner.token, body: { event: EVENTS[0] } }).status, 201);
    assert.equal(call('POST', path, { token: owner.token, body: { event: EVENTS[0] } }).status, 200, 'identical re-send is idempotent');

    const rewrite = { ...EVENTS[0], payload: { problemId: 'other' } };
    rewrite.payloadFingerprint = fnv1a(canonicalJson(rewrite.payload));
    assert.equal(call('POST', path, { token: owner.token, body: { event: rewrite } }).body.error, 'step_index_conflict', 'history is never rewritten');

    assert.equal(call('POST', path, { token: owner.token, body: { event: EVENTS[2] } }).body.error, 'step_index_conflict', 'a gap is refused');

    const forged = eventAfter('deadbeef', 1, 'HYPOTHESES_GENERATED', { hypotheses: [] });
    assert.equal(call('POST', path, { token: owner.token, body: { event: forged } }).body.error, 'chain_mismatch');

    const lying = { ...EVENTS[1], payload: { hypotheses: ['H9'] } };
    assert.equal(call('POST', path, { token: owner.token, body: { event: lying } }).body.error, 'payload_fingerprint_mismatch');
  });

  test('a tampered row is reported as a broken chain and the run accepts nothing more (fail closed)', () => {
    const db = openDatabase();
    const { call, owner, project } = setup(db);
    const runId = call('POST', `/api/projects/${project.id}/agent-runs`, { token: owner.token, body: { goal: 'g', domain: 'mind' } }).body.run.id;
    const path = `/api/projects/${project.id}/agent-runs/${runId}/research-state`;
    for (const event of EVENTS.slice(0, 3)) call('POST', path, { token: owner.token, body: { event } });

    const tampered = { ...EVENTS[1], payload: { hypotheses: ['H1', 'H2', 'H3'] } };
    db.prepare('UPDATE agent_run_steps SET observation_json = ? WHERE agent_run_id = ? AND step_index = 1 AND tool_invoked = ?')
      .run(JSON.stringify(tampered), runId, RESEARCH_STATE_TOOL);

    const read = call('GET', path, { token: owner.token });
    assert.equal(read.body.researchState.chain.ok, false);
    assert.equal(read.body.researchState.chain.brokenAt, 1);
    assert.equal(read.body.researchState.chain.reason, 'payload_fingerprint_mismatch');

    const next = call('POST', path, { token: owner.token, body: { event: EVENTS[3] } });
    assert.equal(next.status, 409);
    assert.equal(next.body.error, 'state_integrity_failure');
  });

  test('RBAC: a viewer reads but cannot append; a non-member sees nothing', () => {
    const db = openDatabase();
    const { call, owner, project } = setup(db);
    const runId = call('POST', `/api/projects/${project.id}/agent-runs`, { token: owner.token, body: { goal: 'g', domain: 'mind' } }).body.run.id;
    const viewer = call('POST', '/api/auth/register', { body: { email: 'viewer@lab.org', password: 'password123' } }).body;
    call('POST', `/api/projects/${project.id}/members`, { token: owner.token, body: { email: 'viewer@lab.org', role: 'viewer' } });
    const path = `/api/projects/${project.id}/agent-runs/${runId}/research-state`;
    assert.equal(call('GET', path, { token: viewer.token }).status, 200);
    assert.equal(call('POST', path, { token: viewer.token, body: { event: EVENTS[0] } }).status, 403);
    const stranger = call('POST', '/api/auth/register', { body: { email: 'x@lab.org', password: 'password123' } }).body;
    assert.equal(call('GET', path, { token: stranger.token }).status, 404);
  });
});
