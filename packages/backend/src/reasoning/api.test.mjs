import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, createSession } from '../store.mjs';
import { handleApi } from '../api.mjs';
import { resolveTenant, personalTenant, PERSONAL_PREFIX } from './tenancy.mjs';
import { listEvidence } from './store.mjs';

/**
 * /api/reasoning — the surface over the reasoning core.
 *
 * Two properties are load-bearing and both are tested by trying to break them:
 *
 *  1. The graph is readable without an account. A visiting expert who arrives
 *     from a cold email must be able to see the claim before deciding whether
 *     to argue with it; requiring registration to look is the friction that
 *     kills recruitment.
 *  2. Nothing else is. Every write and every tenant-scoped read resolves the
 *     tenant through one function that refuses rather than guesses.
 *
 * There is also a test asserting an endpoint DOES NOT EXIST — a client must not
 * be able to post an artifact, because artifacts are what the platform
 * concluded, and a posted one would be reviewed as though Genesis had produced
 * it.
 */

let db;
let alice;
let bob;
let aliceToken;
let bobToken;

const call = (method, pathname, { token = null, body = {}, query = {} } = {}) =>
  handleApi(db, { method, pathname, token, body, query });

function login(email) {
  const user = createUser(db, { email, displayName: email.split('@')[0], passwordHash: 'x' });
  // Sessions store a hash of the token, never the token — createSession is the
  // only correct way to make one, and reaching into the table would test a
  // fiction.
  const token = `tok-${user.id}`;
  createSession(db, { userId: user.id, token, ttlMs: 60 * 60 * 1000 });
  return { user, token };
}

const VALID_EVIDENCE = {
  interventionId: 'senolytics', hallmarkId: 'cellular-senescence',
  tier: 'rodent', outcome: 'lifespan', direction: 'increase',
  citation: 'doi:10.1000/fixture-study', system: 'C57BL/6 mouse',
  replicated: true, randomised: true, blinded: false, preregistered: false,
  sampleSize: 40, readoutKind: 'direct',
};

beforeEach(() => {
  db = openDatabase(':memory:');
  const a = login('alice@example.org');
  const b = login('bob@example.org');
  alice = a.user; aliceToken = a.token; bob = b.user; bobToken = b.token;
});

describe('the curated graph is public', () => {
  test('GET /api/reasoning/graph needs no token', () => {
    const r = call('GET', '/api/reasoning/graph');
    assert.equal(r.status, 200);
    assert.ok(r.body.nodes.length > 0);
    assert.ok(r.body.edges.length > 0);
    assert.match(r.body.snapshot.id, /^[0-9a-f]{64}$/);
  });

  test('repeated requests do not create a new snapshot', () => {
    // Seeding runs on every request. If it were not idempotent, every page load
    // would supersede the graph and orphan every review filed before it.
    const first = call('GET', '/api/reasoning/graph').body.snapshot.id;
    const second = call('GET', '/api/reasoning/graph').body.snapshot.id;
    assert.equal(first, second);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reasoning_snapshots').get().n, 1);
  });

  test('orphan reviews are public too', () => {
    const r = call('GET', '/api/reasoning/graph/orphans');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.orphans, []);
  });
});

describe('everything else requires identity', () => {
  test('listing evidence without a token is refused', () => {
    assert.equal(call('GET', '/api/reasoning/evidence').status, 401);
  });

  test('posting evidence without a token is refused', () => {
    assert.equal(call('POST', '/api/reasoning/evidence', { body: VALID_EVIDENCE }).status, 401);
  });
});

describe('evidence is graded on the server', () => {
  test('a valid record is graded, stored and returned with both axes', () => {
    // The grade is computed here with the same pure function the browser uses.
    // A client-supplied grade would be a number with no rule behind it.
    const r = call('POST', '/api/reasoning/evidence', { token: aliceToken, body: VALID_EVIDENCE });
    assert.equal(r.status, 201);
    assert.ok(r.body.grade.strength > 0);
    assert.ok(r.body.grade.humanRelevance > 0);
    assert.notEqual(r.body.grade.strength, r.body.grade.humanRelevance,
      'a rodent lifespan study must not score the same on both axes');
    assert.equal(r.body.evidence.strength, r.body.grade.strength);
  });

  test('a client cannot dictate its own grade', () => {
    const r = call('POST', '/api/reasoning/evidence', {
      token: aliceToken, body: { ...VALID_EVIDENCE, strength: 100, humanRelevance: 100 },
    });
    assert.equal(r.status, 201);
    assert.notEqual(r.body.evidence.strength, 100);
    assert.notEqual(r.body.evidence.human_relevance, 100);
  });

  test('an uncited record is refused before it is stored', () => {
    const r = call('POST', '/api/reasoning/evidence', { token: aliceToken, body: { ...VALID_EVIDENCE, citation: '' } });
    assert.equal(r.status, 400);
    assert.match(r.body.message ?? r.body.error ?? '', /citation|uncited/i);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM evidence_records').get().n, 0);
  });

  test('retiring removes it from the live list but not from the record', () => {
    const created = call('POST', '/api/reasoning/evidence', { token: aliceToken, body: VALID_EVIDENCE }).body.evidence;
    assert.equal(call('DELETE', `/api/reasoning/evidence/${created.id}`, { token: aliceToken }).status, 200);
    assert.equal(call('GET', '/api/reasoning/evidence', { token: aliceToken }).body.evidence.length, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM evidence_records').get().n, 1);
  });
});

describe('tenant isolation', () => {
  test("one user cannot read another's evidence", () => {
    call('POST', '/api/reasoning/evidence', { token: aliceToken, body: VALID_EVIDENCE });
        assert.equal(call('GET', '/api/reasoning/evidence', { token: aliceToken }).body.evidence.length, 1);
    assert.equal(call('GET', '/api/reasoning/evidence', { token: bobToken }).body.evidence.length, 0);
  });

  test("one user cannot retire another's evidence", () => {
    const created = call('POST', '/api/reasoning/evidence', { token: aliceToken, body: VALID_EVIDENCE }).body.evidence;
    assert.equal(call('DELETE', `/api/reasoning/evidence/${created.id}`, { token: bobToken }).status, 404);
    assert.equal(listEvidence(db, personalTenant(alice.id)).length, 1);
  });

  test('a personal tenant cannot be addressed by name', () => {
    // Your own is reached by omitting the field. Accepting a name here would be
    // a second path to the same rows, and second paths are where isolation bugs
    // live.
    const r = call('GET', '/api/reasoning/evidence', {
      token: aliceToken, query: { projectId: personalTenant(bob.id) },
    });
    assert.equal(r.status, 403);
  });

  test('a project NAMED like a personal tenant cannot be used to reach one', () => {
    // The attack the prefix guard actually exists for, and the reason the test
    // above is not sufficient on its own: it passes even with the guard removed,
    // because a personal-tenant string normally matches no membership row.
    //
    // Here it does. Alice creates a project whose id is literally Bob's personal
    // tenant and adds herself to it. Membership now checks out, so without the
    // prefix guard resolveTenant would hand her `user:<bob>` and every query
    // would faithfully return Bob's private evidence.
    call('POST', '/api/reasoning/evidence', { token: bobToken, body: VALID_EVIDENCE });
    assert.equal(listEvidence(db, personalTenant(bob.id)).length, 1);

    const collision = personalTenant(bob.id);
    db.prepare('INSERT INTO projects (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)')
      .run(collision, 'Innocent looking project', alice.id, 1);
    db.prepare('INSERT INTO memberships (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
      .run(collision, alice.id, 'owner', 1);

    const r = call('GET', '/api/reasoning/evidence', { token: aliceToken, query: { projectId: collision } });
    assert.equal(r.status, 403, 'membership must not be enough to reach a namespace reserved for personal tenants');
    assert.equal(r.body.evidence, undefined);
  });

  test('a project the caller is not a member of is refused', () => {
    db.prepare('INSERT INTO projects (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)')
      .run('proj-1', 'Bob only', bob.id, 1);
    db.prepare('INSERT INTO memberships (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
      .run('proj-1', bob.id, 'owner', 1);
    const r = call('GET', '/api/reasoning/evidence', { token: aliceToken, query: { projectId: 'proj-1' } });
    assert.equal(r.status, 403);
  });

  test('a non-existent project and a forbidden one give the same answer', () => {
    // Distinguishing them would leak the project list.
    db.prepare('INSERT INTO projects (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)')
      .run('proj-1', 'Bob only', bob.id, 1);
    db.prepare('INSERT INTO memberships (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
      .run('proj-1', bob.id, 'owner', 1);
    const forbidden = call('GET', '/api/reasoning/evidence', { token: aliceToken, query: { projectId: 'proj-1' } });
    const missing = call('GET', '/api/reasoning/evidence', { token: aliceToken, query: { projectId: 'no-such-project' } });
    assert.equal(forbidden.status, missing.status);
    assert.deepEqual(forbidden.body, missing.body);
  });

  test('a member of a shared project reaches its evidence', () => {
    db.prepare('INSERT INTO projects (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)')
      .run('proj-2', 'Shared', alice.id, 1);
    for (const u of [alice, bob]) {
      db.prepare('INSERT INTO memberships (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
        .run('proj-2', u.id, 'member', 1);
    }
    call('POST', '/api/reasoning/evidence', { token: aliceToken, body: { ...VALID_EVIDENCE, projectId: 'proj-2' } });
    const seen = call('GET', '/api/reasoning/evidence', { token: bobToken, query: { projectId: 'proj-2' } });
    assert.equal(seen.body.evidence.length, 1);
    // And it did NOT land in Alice's personal tenant.
    assert.equal(call('GET', '/api/reasoning/evidence', { token: aliceToken }).body.evidence.length, 0);
  });
});

describe('resolveTenant refuses rather than guesses', () => {
  test('no user at all', () => {
    assert.equal(resolveTenant(db, null).ok, false);
    assert.equal(resolveTenant(db, null).status, 401);
  });

  test('an omitted project means the personal tenant', () => {
    const r = resolveTenant(db, alice);
    assert.equal(r.ok, true);
    assert.ok(r.projectId.startsWith(PERSONAL_PREFIX));
  });

  test('an empty string is an omission, not a project named ""', () => {
    assert.equal(resolveTenant(db, alice, '').projectId, personalTenant(alice.id));
  });
});

describe('artifacts are read-only over HTTP', () => {
  test('there is no endpoint that accepts an artifact from a client', () => {
    // Artifacts are what the platform concluded. A posted one would enter the
    // record and be reviewed as though Genesis had produced it.
    for (const path of ['/api/reasoning/artifacts', '/api/reasoning/artifact']) {
      const r = call('POST', path, { token: aliceToken, body: { kind: 'forged', body: {} } });
      assert.equal(r.status, 404, `${path} must not accept a POST`);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reasoning_artifacts').get().n, 0);
  });

  test('listing artifacts is tenant-scoped and starts empty', () => {
    const r = call('GET', '/api/reasoning/artifacts', { token: aliceToken });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.artifacts, []);
  });
});
