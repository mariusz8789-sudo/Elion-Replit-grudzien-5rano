import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';
import { FINDING_STATUS } from './security/dependencyAudit.mjs';

/**
 * /api/security/dependency-audit przez router API (żywa baza in-memory).
 * Wywołuje realny `npm audit --json` na tym repo — ten sam wybór co
 * dependencyAudit.test.mjs (runDependencyAudit): asercje na kształt i
 * uczciwość mapowania, nigdy na "dokładnie N realnych CVE dzisiaj".
 */

let db;
beforeEach(() => { db = openDatabase(); });
const call = (method, pathname, o = {}) => handleApi(db, { method, pathname, token: o.token, body: o.body, query: o.query });
function reg(email) {
  return call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body;
}

describe('security API', () => {
  test('requires a valid token — unlike the public /compute/environment probe', () => {
    const r = call('GET', '/api/security/dependency-audit');
    assert.equal(r.status, 401);
  });

  test('any logged-in user gets a real, well-formed audit result', () => {
    const { token } = reg('scientist@lab.org');
    const r = call('GET', '/api/security/dependency-audit', { token });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.findings));
    for (const finding of r.body.findings) assert.equal(finding.status, FINDING_STATUS.SUSPECTED);
    assert.equal(r.body.summary.total, r.body.findings.length);
    assert.ok(typeof r.body.auditedAt === 'number');
  });

  test('a second call within the cache window returns the same auditedAt (no re-run)', () => {
    const { token } = reg('scientist2@lab.org');
    const first = call('GET', '/api/security/dependency-audit', { token });
    const second = call('GET', '/api/security/dependency-audit', { token });
    assert.equal(second.body.auditedAt, first.body.auditedAt);
  });
});
