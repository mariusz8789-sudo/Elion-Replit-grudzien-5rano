import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';

/**
 * Testy routera API na żywej bazie (in-memory). Symulują pełny przepływ:
 * rejestracja → token → projekt → próby → RBAC (viewer/editor/admin) — dokładnie
 * tak, jak zadziała przez HTTP, ale bez gniazd. To dowód, że warstwa „wykonuje
 * się naprawdę", a nie jest atrapą.
 */

let db;
beforeEach(() => {
  db = openDatabase();
});

function call(method, pathname, { token, body, query } = {}) {
  return handleApi(db, { method, pathname, token, body, query });
}

function registerUser(email = 'owner@lab.org', password = 'password123') {
  const r = call('POST', '/api/auth/register', { body: { email, password } });
  assert.equal(r.status, 201, `register ${email}: ${JSON.stringify(r.body)}`);
  return r.body; // { token, user }
}

describe('auth flow', () => {
  test('register issues a token and a user', () => {
    const r = registerUser();
    assert.match(r.token, /^[0-9a-f]{64}$/);
    assert.equal(r.user.email, 'owner@lab.org');
    assert.equal(r.user.passwordHash, undefined);
  });

  test('duplicate email is rejected with 409', () => {
    registerUser();
    const r = call('POST', '/api/auth/register', { body: { email: 'owner@lab.org', password: 'password123' } });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'email_taken');
  });

  test('short password is rejected with 400', () => {
    const r = call('POST', '/api/auth/register', { body: { email: 'x@y.co', password: 'short' } });
    assert.equal(r.status, 400);
  });

  test('login succeeds with correct password, fails with wrong', () => {
    registerUser();
    const good = call('POST', '/api/auth/login', { body: { email: 'owner@lab.org', password: 'password123' } });
    assert.equal(good.status, 201);
    assert.match(good.body.token, /^[0-9a-f]{64}$/);

    const bad = call('POST', '/api/auth/login', { body: { email: 'owner@lab.org', password: 'wrong' } });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error, 'invalid_credentials');
  });

  test('login for unknown user gives the same 401 (no account enumeration)', () => {
    const r = call('POST', '/api/auth/login', { body: { email: 'ghost@lab.org', password: 'whatever12' } });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'invalid_credentials');
  });

  test('me requires a valid token; logout invalidates it', () => {
    const { token } = registerUser();
    assert.equal(call('GET', '/api/auth/me', { token }).status, 200);
    assert.equal(call('GET', '/api/auth/me').status, 401);
    call('POST', '/api/auth/logout', { token });
    assert.equal(call('GET', '/api/auth/me', { token }).status, 401);
  });
});

describe('projects require auth', () => {
  test('unauthenticated project access is 401', () => {
    assert.equal(call('GET', '/api/projects').status, 401);
    assert.equal(call('POST', '/api/projects', { body: { name: 'X' } }).status, 401);
  });

  test('owner can create and list projects', () => {
    const { token } = registerUser();
    const created = call('POST', '/api/projects', { token, body: { name: 'Reaktor termojądrowy' } });
    assert.equal(created.status, 201);
    assert.equal(created.body.project.role, 'owner');

    const list = call('GET', '/api/projects', { token });
    assert.equal(list.status, 200);
    assert.equal(list.body.projects.length, 1);
    assert.equal(list.body.projects[0].name, 'Reaktor termojądrowy');
  });

  test('project name is required', () => {
    const { token } = registerUser();
    assert.equal(call('POST', '/api/projects', { token, body: { name: '  ' } }).status, 400);
  });

  test('non-member gets 404 for someone else project (no existence leak)', () => {
    const owner = registerUser('owner@lab.org');
    const stranger = registerUser('stranger@lab.org');
    const p = call('POST', '/api/projects', { token: owner.token, body: { name: 'Prywatny' } }).body.project;
    assert.equal(call('GET', `/api/projects/${p.id}`, { token: stranger.token }).status, 404);
  });
});

describe('persistent reproducible trials + RBAC', () => {
  function setupProject() {
    const owner = registerUser('owner@lab.org');
    const p = call('POST', '/api/projects', { token: owner.token, body: { name: 'Seria prób' } }).body.project;
    return { owner, p };
  }

  test('editor+ can create a trial; it freezes provenance and auto-numbers', () => {
    const { owner, p } = setupProject();
    const r = call('POST', `/api/projects/${p.id}/trials`, {
      token: owner.token,
      body: {
        experimentId: 'nuclear-semf',
        label: 'Żelazo-56',
        params: { Z: 26, A: 56 },
        outputs: { bindingPerNucleon: 8.79 },
        status: 'baseline',
        modelVersion: 'semf-v1',
      },
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.trial.index, 1);
    assert.deepEqual(r.body.trial.params, { Z: 26, A: 56 });
    assert.equal(r.body.trial.modelVersion, 'semf-v1');
    assert.equal(r.body.trial.authorId, owner.user.id);
  });

  test('trials round-trip through GET, scoped by experiment', () => {
    const { owner, p } = setupProject();
    const mk = (experimentId) =>
      call('POST', `/api/projects/${p.id}/trials`, { token: owner.token, body: { experimentId, params: { x: 1 }, outputs: { y: 2 } } });
    mk('e1');
    mk('e1');
    mk('e2');
    assert.equal(call('GET', `/api/projects/${p.id}/trials`, { token: owner.token }).body.trials.length, 3);
    assert.equal(
      call('GET', `/api/projects/${p.id}/trials`, { token: owner.token, query: { experimentId: 'e1' } }).body.trials.length,
      2,
    );
  });

  test('invalid numeric params are stripped (no NaN/nested leaks into the datastore)', () => {
    const { owner, p } = setupProject();
    const r = call('POST', `/api/projects/${p.id}/trials`, {
      token: owner.token,
      body: { experimentId: 'e', params: { good: 1, bad: NaN, str: 'x', nested: { a: 1 } }, outputs: {} },
    });
    assert.deepEqual(r.body.trial.params, { good: 1 });
  });

  test('missing experimentId is 400', () => {
    const { owner, p } = setupProject();
    assert.equal(call('POST', `/api/projects/${p.id}/trials`, { token: owner.token, body: { params: {}, outputs: {} } }).status, 400);
  });

  test('viewer can read but NOT write trials (403)', () => {
    const { owner, p } = setupProject();
    const viewer = registerUser('viewer@lab.org');
    // owner adds viewer
    const added = call('POST', `/api/projects/${p.id}/members`, {
      token: owner.token,
      body: { email: 'viewer@lab.org', role: 'viewer' },
    });
    assert.equal(added.status, 200);

    assert.equal(call('GET', `/api/projects/${p.id}/trials`, { token: viewer.token }).status, 200);
    const write = call('POST', `/api/projects/${p.id}/trials`, { token: viewer.token, body: { experimentId: 'e', params: {}, outputs: {} } });
    assert.equal(write.status, 403);
  });

  test('editor can write; update changes only descriptive fields', () => {
    const { owner, p } = setupProject();
    const editor = registerUser('editor@lab.org');
    call('POST', `/api/projects/${p.id}/members`, { token: owner.token, body: { email: 'editor@lab.org', role: 'editor' } });
    const trial = call('POST', `/api/projects/${p.id}/trials`, {
      token: editor.token,
      body: { experimentId: 'e', params: { x: 1 }, outputs: { y: 2 }, status: 'draft' },
    }).body.trial;

    const upd = call('PATCH', `/api/projects/${p.id}/trials/${trial.id}`, {
      token: editor.token,
      body: { status: 'promising', note: 'ciekawe', params: { x: 999 } /* ignored */ },
    });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.trial.status, 'promising');
    assert.equal(upd.body.trial.note, 'ciekawe');
    assert.deepEqual(upd.body.trial.params, { x: 1 }); // frozen
  });

  test('only admin+ can manage members; editor cannot', () => {
    const { owner, p } = setupProject();
    const editor = registerUser('editor@lab.org');
    call('POST', `/api/projects/${p.id}/members`, { token: owner.token, body: { email: 'editor@lab.org', role: 'editor' } });
    const third = registerUser('third@lab.org');
    const attempt = call('POST', `/api/projects/${p.id}/members`, {
      token: editor.token,
      body: { email: 'third@lab.org', role: 'viewer' },
    });
    assert.equal(attempt.status, 403);
    assert.ok(third); // used
  });

  test('only owner can grant the owner role', () => {
    const { owner, p } = setupProject();
    const admin = registerUser('admin@lab.org');
    call('POST', `/api/projects/${p.id}/members`, { token: owner.token, body: { email: 'admin@lab.org', role: 'admin' } });
    const target = registerUser('target@lab.org');
    const attempt = call('POST', `/api/projects/${p.id}/members`, {
      token: admin.token,
      body: { email: 'target@lab.org', role: 'owner' },
    });
    assert.equal(attempt.status, 403);
    assert.ok(target);
  });

  test('deleting a trial in another project is 404 (cross-project isolation)', () => {
    const { owner, p } = setupProject();
    const trial = call('POST', `/api/projects/${p.id}/trials`, {
      token: owner.token, body: { experimentId: 'e', params: {}, outputs: {} },
    }).body.trial;
    const other = registerUser('other@lab.org');
    const op = call('POST', '/api/projects', { token: other.token, body: { name: 'Inny' } }).body.project;
    assert.equal(call('DELETE', `/api/projects/${op.id}/trials/${trial.id}`, { token: other.token }).status, 404);
  });
});
