import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ACCOUNT_PROFILES, CAPABILITIES, DEFAULT_ACCOUNT_PROFILE, PROFILE_TABLE,
  canUseCapability, capabilitiesForProfile, capabilityDecision, normalizeAccountProfile,
} from './accountProfiles.mjs';
import { validateRegistration } from './auth.mjs';
import { openDatabase, createUser, getUserByEmail, CURRENT_SCHEMA_VERSION } from './store.mjs';
import { handleApi } from './api.mjs';

/**
 * Profil konta + bramka zdolności: czysta tabela, walidacja rejestracji,
 * migracja istniejącej bazy (v14 → v15) i egzekwowanie na trasach API.
 */

describe('gate table (accountProfiles.mjs)', () => {
  test('exactly the five profiles, in registration order, each with a Polish label and description', () => {
    assert.deepEqual([...ACCOUNT_PROFILES], ['UCZEN', 'STUDENT', 'NAUCZYCIEL', 'BADACZ', 'INSTYTUCJA']);
    for (const code of ACCOUNT_PROFILES) {
      assert.ok(PROFILE_TABLE[code].label.length > 0);
      assert.ok(PROFILE_TABLE[code].description.length > 0);
    }
    assert.equal(DEFAULT_ACCOUNT_PROFILE, 'BADACZ');
  });

  test('pupil and student learn and read, but run no engines, no drug discovery, no restricted sources', () => {
    for (const p of ['UCZEN', 'STUDENT']) {
      assert.ok(canUseCapability(p, CAPABILITIES.LEARNING));
      assert.ok(canUseCapability(p, CAPABILITIES.HUMAN_EXPLORER));
      assert.ok(canUseCapability(p, CAPABILITIES.READ_RESULTS));
      assert.equal(canUseCapability(p, CAPABILITIES.COMPUTE_RUN), false);
      assert.equal(canUseCapability(p, CAPABILITIES.DRUG_DISCOVERY), false);
      assert.equal(canUseCapability(p, CAPABILITIES.RESTRICTED_SOURCES), false);
    }
  });

  test('teacher = student + teaching; researcher = all but restricted; institution = all', () => {
    assert.deepEqual(capabilitiesForProfile('NAUCZYCIEL').sort(), [...capabilitiesForProfile('STUDENT'), CAPABILITIES.TEACHING].sort());
    const all = Object.values(CAPABILITIES).sort();
    assert.deepEqual(capabilitiesForProfile('INSTYTUCJA').sort(), all);
    assert.deepEqual(capabilitiesForProfile('BADACZ').sort(), all.filter((c) => c !== CAPABILITIES.RESTRICTED_SOURCES));
  });

  test('unknown profile fails closed', () => {
    assert.equal(normalizeAccountProfile('ADMIN'), null);
    assert.equal(normalizeAccountProfile(undefined), null);
    assert.deepEqual(capabilitiesForProfile('ADMIN'), []);
    assert.equal(canUseCapability(null, CAPABILITIES.LEARNING), false);
  });

  test('a denial carries a plain Polish reason naming the profile and who may use the area', () => {
    const d = capabilityDecision('UCZEN', CAPABILITIES.COMPUTE_RUN);
    assert.equal(d.allowed, false);
    assert.match(d.reason, /Uczeń \/ szkoła/);
    assert.match(d.reason, /Badacz \/ naukowiec/);
    assert.match(d.reason, /Firma \/ instytucja/);
    assert.deepEqual(capabilityDecision('BADACZ', CAPABILITIES.COMPUTE_RUN), { allowed: true, reason: null });
  });
});

describe('registration validates the profile server-side', () => {
  const base = { email: 'kid@school.pl', password: 'longenough1' };
  test('accepts each known profile (case-insensitive) and stores the canonical code', () => {
    for (const code of ACCOUNT_PROFILES) {
      assert.equal(validateRegistration({ ...base, accountProfile: code.toLowerCase() }).value.accountProfile, code);
    }
  });
  test('rejects an unknown profile with a Polish message', () => {
    const r = validateRegistration({ ...base, accountProfile: 'SUPERUSER' });
    assert.equal(r.ok, false);
    assert.match(r.error, /profili konta/);
  });
  test('an API client that sends no profile gets the default (same as migrated accounts)', () => {
    assert.equal(validateRegistration(base).value.accountProfile, 'BADACZ');
  });
});

describe('schema migration v15: users.account_profile', () => {
  test('an existing v14 database gains the column; existing users become BADACZ; reopening is idempotent', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-profile-mig-'));
    const file = path.join(dir, 'genesis.db');
    try {
      // Build a real current DB, then strip it back to the v14 shape (no account_profile column).
      const fresh = openDatabase(file);
      createUser(fresh, { email: 'old@lab.org', displayName: 'Old', passwordHash: 'scrypt$x$y' });
      fresh.close();
      const raw = new DatabaseSync(file);
      raw.exec('ALTER TABLE users DROP COLUMN account_profile');
      raw.exec('PRAGMA user_version = 14');
      assert.equal(raw.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'account_profile'), false);
      raw.close();

      const migrated = openDatabase(file);
      assert.equal(migrated.prepare('PRAGMA user_version').get().user_version, CURRENT_SCHEMA_VERSION);
      assert.equal(CURRENT_SCHEMA_VERSION, 15);
      assert.equal(getUserByEmail(migrated, 'old@lab.org').accountProfile, 'BADACZ');
      assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
      // The CHECK constraint refuses an unknown profile written behind the API's back.
      assert.throws(() => migrated.prepare("UPDATE users SET account_profile = 'ROOT'").run(), /CHECK/);
      migrated.close();

      const again = openDatabase(file);
      assert.equal(again.prepare('PRAGMA table_info(users)').all().filter((c) => c.name === 'account_profile').length, 1);
      assert.equal(getUserByEmail(again, 'old@lab.org').accountProfile, 'BADACZ');
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('createUser stores the chosen profile and refuses an unknown one', () => {
    const db = openDatabase();
    assert.equal(createUser(db, { email: 'u@s.pl', displayName: 'U', passwordHash: 'h', accountProfile: 'UCZEN' }).accountProfile, 'UCZEN');
    assert.equal(getUserByEmail(db, 'u@s.pl').accountProfile, 'UCZEN');
    assert.throws(() => createUser(db, { email: 'v@s.pl', displayName: 'V', passwordHash: 'h', accountProfile: 'X' }), /invalid_account_profile/);
    db.close();
  });
});

describe('API enforcement of the gate', () => {
  let db;
  beforeEach(() => { db = openDatabase(); });
  const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body });
  const register = (email, accountProfile) => {
    const r = call('POST', '/api/auth/register', { body: { email, password: 'password123', displayName: email.split('@')[0], accountProfile } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const lorentz = { modelId: 'sr-lorentz', inputs: { velocityFraction: 0.8 } };

  test('register → me returns the profile; login returns it too', () => {
    const { token, user } = register('pupil@school.pl', 'UCZEN');
    assert.equal(user.accountProfile, 'UCZEN');
    assert.equal(call('GET', '/api/auth/me', { token }).body.user.accountProfile, 'UCZEN');
    const login = call('POST', '/api/auth/login', { body: { email: 'pupil@school.pl', password: 'password123' } });
    assert.equal(login.body.user.accountProfile, 'UCZEN');
  });

  test('an unknown profile at registration is a 400', () => {
    const r = call('POST', '/api/auth/register', { body: { email: 'x@y.pl', password: 'password123', accountProfile: 'GOD' } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'invalid_registration');
  });

  test('compute engine runs: pupil and student get 403 with a Polish reason; researcher runs', () => {
    for (const profile of ['UCZEN', 'STUDENT', 'NAUCZYCIEL']) {
      const { token } = register(`${profile.toLowerCase()}@s.pl`, profile);
      for (const [p, body] of [['/api/compute/run', lorentz], ['/api/compute/fabric/run', { contractVersion: '1.0.0', ...lorentz }], ['/api/compute/qm/singlepoint', {}], ['/api/compute/admet/predict', { smiles: ['C'] }], ['/api/quantum/run', {}]]) {
        const r = call('POST', p, { token, body });
        assert.equal(r.status, 403, `${profile} ${p}`);
        assert.equal(r.body.error, 'profile_capability_denied');
        assert.equal(r.body.capability, 'compute_run');
        assert.match(r.body.message, /Twój profil/);
      }
    }
    const { token } = register('res@lab.org', 'BADACZ');
    const r = call('POST', '/api/compute/run', { token, body: lorentz });
    assert.equal(r.status, 200);
    assert.equal(r.body.run.status, 'ok');
  });

  test('anonymous public compute keeps working as before (local-first labs)', () => {
    assert.equal(call('POST', '/api/compute/run', { body: lorentz }).status, 200);
  });

  test('reading endpoints stay open to a pupil', () => {
    const { token } = register('pupil@school.pl', 'UCZEN');
    assert.equal(call('GET', '/api/compute/models', { token }).status, 200);
    const project = call('POST', '/api/projects', { token, body: { name: 'Klasa 7b' } });
    assert.equal(project.status, 201);
    const id = project.body.project.id;
    assert.equal(call('GET', `/api/projects/${id}/campaigns`, { token }).status, 200);
    assert.equal(call('GET', `/api/projects/${id}/targets`, { token }).status, 200);
  });

  test('drug discovery writes: pupil 403, researcher allowed', () => {
    const pupil = register('pupil@school.pl', 'UCZEN');
    const pid = call('POST', '/api/projects', { token: pupil.token, body: { name: 'P' } }).body.project.id;
    for (const seg of ['targets', 'campaigns', 'jobs', 'research-intake']) {
      const r = call('POST', `/api/projects/${pid}/${seg}`, { token: pupil.token, body: { name: 'EGFR' } });
      assert.equal(r.status, 403, seg);
      assert.equal(r.body.capability, 'drug_discovery');
    }
    const res = register('res@lab.org', 'BADACZ');
    const rid = call('POST', '/api/projects', { token: res.token, body: { name: 'R' } }).body.project.id;
    assert.equal(call('POST', `/api/projects/${rid}/targets`, { token: res.token, body: { name: 'EGFR' } }).status, 201);
  });

  test('RESTRICTED sources: researcher is refused, institution is allowed', () => {
    const res = register('res@lab.org', 'BADACZ');
    const rid = call('POST', '/api/projects', { token: res.token, body: { name: 'R' } }).body.project.id;
    const setRestricted = call('PUT', `/api/projects/${rid}/access`, { token: res.token, body: { level: 'RESTRICTED' } });
    assert.equal(setRestricted.status, 403);
    assert.equal(setRestricted.body.capability, 'restricted_sources');
    const ra = call('GET', `/api/projects/${rid}/research-access`, { token: res.token });
    assert.equal(ra.body.sources.find((s) => s.access === 'RESTRICTED').profileAllowed, false);

    const inst = register('inst@corp.pl', 'INSTYTUCJA');
    const iid = call('POST', '/api/projects', { token: inst.token, body: { name: 'I' } }).body.project.id;
    assert.equal(call('PUT', `/api/projects/${iid}/access`, { token: inst.token, body: { level: 'RESTRICTED' } }).status, 200);
    assert.equal(call('GET', `/api/projects/${iid}/targets`, { token: inst.token }).status, 200);
    assert.equal(call('GET', `/api/projects/${iid}/research-access`, { token: inst.token }).body.sources.find((s) => s.access === 'RESTRICTED').profileAllowed, true);

    // A researcher added to the institution's RESTRICTED project sees its policy, but not its content.
    assert.equal(call('POST', `/api/projects/${iid}/members`, { token: inst.token, body: { email: 'res@lab.org', role: 'editor' } }).status, 200);
    assert.equal(call('GET', `/api/projects/${iid}/access`, { token: res.token }).status, 200);
    const denied = call('GET', `/api/projects/${iid}/targets`, { token: res.token });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.capability, 'restricted_sources');
    const run = call('POST', '/api/compute/fabric/run', { token: res.token, body: { contractVersion: '1.0.0', ...lorentz, projectId: iid } });
    assert.equal(run.status, 403);
    assert.equal(run.body.capability, 'restricted_sources');
  });
});
