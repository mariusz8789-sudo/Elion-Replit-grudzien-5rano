import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, generateToken } from './auth.mjs';
import {
  openDatabase,
  atLeast,
  ROLE_RANK,
  createUser,
  getUserByEmail,
  getUserById,
  getPasswordHash,
  createSession,
  getUserByToken,
  deleteSession,
  purgeExpiredSessions,
  createProject,
  getProject,
  listProjectsForUser,
  getRole,
  setMember,
  listMembers,
  createTrial,
  getTrial,
  listTrials,
  updateTrial,
  deleteTrial,
} from './store.mjs';

function seedUser(db, email = 'a@lab.org') {
  return createUser(db, { email, displayName: email.split('@')[0], passwordHash: hashPassword('password123') });
}

describe('RBAC atLeast', () => {
  test('rank ordering owner > admin > editor > viewer', () => {
    assert.ok(ROLE_RANK.owner > ROLE_RANK.admin);
    assert.ok(ROLE_RANK.admin > ROLE_RANK.editor);
    assert.ok(ROLE_RANK.editor > ROLE_RANK.viewer);
  });
  test('atLeast is inclusive and directional', () => {
    assert.equal(atLeast('admin', 'editor'), true);
    assert.equal(atLeast('editor', 'editor'), true);
    assert.equal(atLeast('viewer', 'editor'), false);
    assert.equal(atLeast('nonsense', 'viewer'), false);
  });
});

describe('users', () => {
  test('creates and reads back a user without exposing the hash', () => {
    const db = openDatabase();
    const u = seedUser(db);
    assert.equal(u.email, 'a@lab.org');
    assert.equal(u.passwordHash, undefined);
    assert.deepEqual(getUserById(db, u.id), u);
    assert.equal(getUserByEmail(db, 'A@LAB.ORG').id, u.id);
  });

  test('rejects a duplicate email', () => {
    const db = openDatabase();
    seedUser(db);
    assert.throws(() => seedUser(db), /email_taken/);
  });

  test('getPasswordHash returns the stored hash for verification', () => {
    const db = openDatabase();
    const u = seedUser(db);
    assert.match(getPasswordHash(db, u.id), /^scrypt\$/);
  });
});

describe('sessions', () => {
  test('valid token resolves to its user', () => {
    const db = openDatabase();
    const u = seedUser(db);
    const token = generateToken();
    createSession(db, { userId: u.id, token, ttlMs: 60_000 });
    assert.equal(getUserByToken(db, token).id, u.id);
  });

  test('expired token resolves to null and is purged on read', () => {
    const db = openDatabase();
    const u = seedUser(db);
    const token = generateToken();
    createSession(db, { userId: u.id, token, ttlMs: -1 });
    assert.equal(getUserByToken(db, token), null);
    assert.equal(getUserByToken(db, token), null); // already deleted
  });

  test('logout deletes the session', () => {
    const db = openDatabase();
    const u = seedUser(db);
    const token = generateToken();
    createSession(db, { userId: u.id, token, ttlMs: 60_000 });
    deleteSession(db, token);
    assert.equal(getUserByToken(db, token), null);
  });

  test('purgeExpiredSessions removes only expired rows', () => {
    const db = openDatabase();
    const u = seedUser(db);
    createSession(db, { userId: u.id, token: generateToken(), ttlMs: 60_000 });
    createSession(db, { userId: u.id, token: generateToken(), ttlMs: -1 });
    assert.equal(purgeExpiredSessions(db), 1);
  });

  test('unknown/empty token is null', () => {
    const db = openDatabase();
    assert.equal(getUserByToken(db, 'nope'), null);
    assert.equal(getUserByToken(db, ''), null);
  });
});

describe('projects and RBAC', () => {
  test('creating a project makes the creator owner', () => {
    const db = openDatabase();
    const u = seedUser(db);
    const p = createProject(db, { name: 'Reaktor', ownerId: u.id });
    assert.equal(p.role, 'owner');
    assert.equal(getRole(db, p.id, u.id), 'owner');
    assert.equal(getProject(db, p.id).name, 'Reaktor');
  });

  test('listProjectsForUser returns only the user projects with roles', () => {
    const db = openDatabase();
    const a = seedUser(db, 'a@lab.org');
    const b = seedUser(db, 'b@lab.org');
    const p = createProject(db, { name: 'Wspólny', ownerId: a.id });
    createProject(db, { name: 'Prywatny B', ownerId: b.id });
    setMember(db, { projectId: p.id, userId: b.id, role: 'viewer' });

    const forA = listProjectsForUser(db, a.id);
    assert.equal(forA.length, 1);
    assert.equal(forA[0].role, 'owner');

    const forB = listProjectsForUser(db, b.id);
    assert.equal(forB.length, 2);
    assert.equal(forB.find((x) => x.id === p.id).role, 'viewer');
  });

  test('setMember upserts the role and lists members', () => {
    const db = openDatabase();
    const a = seedUser(db, 'a@lab.org');
    const b = seedUser(db, 'b@lab.org');
    const p = createProject(db, { name: 'P', ownerId: a.id });
    setMember(db, { projectId: p.id, userId: b.id, role: 'viewer' });
    setMember(db, { projectId: p.id, userId: b.id, role: 'editor' }); // upsert
    assert.equal(getRole(db, p.id, b.id), 'editor');
    const members = listMembers(db, p.id);
    assert.equal(members.length, 2);
    assert.equal(members.find((m) => m.userId === b.id).role, 'editor');
  });

  test('setMember rejects an invalid role', () => {
    const db = openDatabase();
    const a = seedUser(db);
    const p = createProject(db, { name: 'P', ownerId: a.id });
    assert.throws(() => setMember(db, { projectId: p.id, userId: a.id, role: 'god' }), /invalid_role/);
  });
});

describe('persistent reproducible trials', () => {
  function seedProject(db) {
    const u = seedUser(db);
    const p = createProject(db, { name: 'P', ownerId: u.id });
    return { u, p };
  }

  test('createTrial freezes provenance and auto-numbers per experiment', () => {
    const db = openDatabase();
    const { u, p } = seedProject(db);
    const t1 = createTrial(db, {
      projectId: p.id,
      experimentId: 'nuclear-semf',
      authorId: u.id,
      label: '',
      params: { Z: 26, A: 56 },
      outputs: { bindingPerNucleon: 8.79 },
      status: 'baseline',
      modelVersion: 'semf-v1',
    });
    assert.equal(t1.index, 1);
    assert.equal(t1.label, 'Próba 001');
    assert.deepEqual(t1.params, { Z: 26, A: 56 });
    assert.deepEqual(t1.outputs, { bindingPerNucleon: 8.79 });
    assert.equal(t1.modelVersion, 'semf-v1');
    assert.equal(t1.authorId, u.id);

    const t2 = createTrial(db, {
      projectId: p.id, experimentId: 'nuclear-semf', authorId: u.id,
      params: { Z: 28, A: 62 }, outputs: { bindingPerNucleon: 8.79 }, status: 'draft',
    });
    assert.equal(t2.index, 2);

    // Different experiment restarts numbering.
    const other = createTrial(db, {
      projectId: p.id, experimentId: 'chemistry-kinetics', authorId: u.id,
      params: { T: 300 }, outputs: { k: 1.2 }, status: 'draft',
    });
    assert.equal(other.index, 1);
  });

  test('listTrials scopes by project and optionally experiment', () => {
    const db = openDatabase();
    const { u, p } = seedProject(db);
    createTrial(db, { projectId: p.id, experimentId: 'e1', authorId: u.id, params: {}, outputs: {}, status: 'draft' });
    createTrial(db, { projectId: p.id, experimentId: 'e2', authorId: u.id, params: {}, outputs: {}, status: 'draft' });
    assert.equal(listTrials(db, p.id).length, 2);
    assert.equal(listTrials(db, p.id, 'e1').length, 1);
  });

  test('updateTrial changes only descriptive fields, not frozen science', () => {
    const db = openDatabase();
    const { u, p } = seedProject(db);
    const t = createTrial(db, { projectId: p.id, experimentId: 'e', authorId: u.id, params: { x: 1 }, outputs: { y: 2 }, status: 'draft' });
    const upd = updateTrial(db, t.id, { status: 'promising', note: 'ciekawe' });
    assert.equal(upd.status, 'promising');
    assert.equal(upd.note, 'ciekawe');
    assert.deepEqual(upd.params, { x: 1 }); // unchanged
    assert.deepEqual(upd.outputs, { y: 2 });
  });

  test('deleteTrial removes the row', () => {
    const db = openDatabase();
    const { u, p } = seedProject(db);
    const t = createTrial(db, { projectId: p.id, experimentId: 'e', authorId: u.id, params: {}, outputs: {}, status: 'draft' });
    assert.equal(deleteTrial(db, t.id), true);
    assert.equal(getTrial(db, t.id), null);
    assert.equal(deleteTrial(db, t.id), false);
  });

  test('deleting a project cascades to its trials and memberships', () => {
    const db = openDatabase();
    const { u, p } = seedProject(db);
    createTrial(db, { projectId: p.id, experimentId: 'e', authorId: u.id, params: {}, outputs: {}, status: 'draft' });
    db.prepare('DELETE FROM projects WHERE id = ?').run(p.id);
    assert.equal(listTrials(db, p.id).length, 0);
    assert.equal(getRole(db, p.id, u.id), null);
  });
});
