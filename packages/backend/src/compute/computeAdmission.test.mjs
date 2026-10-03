import assert from 'node:assert/strict';
import test from 'node:test';
import { createComputeAdmission } from './computeAdmission.mjs';

test('compute admission enforces one active heavy run and releases exactly once', () => {
  const admission = createComputeAdmission({ limit: 3, maxActive: 1 });
  const first = admission.acquire('researcher-a');
  assert.equal(first.ok, true);
  assert.equal(admission.active(), 1);
  assert.deepEqual(admission.acquire('researcher-b'), { ok: false, reason: 'busy' });
  first.release();
  first.release();
  assert.equal(admission.active(), 0);
  const second = admission.acquire('researcher-b');
  assert.equal(second.ok, true);
  second.release();
});

test('compute admission rate-limits each principal independently and expires its window', () => {
  let at = 1_000;
  const admission = createComputeAdmission({ limit: 1, windowMs: 100, now: () => at });
  const first = admission.acquire('researcher-a');
  assert.equal(first.ok, true);
  first.release();
  assert.deepEqual(admission.acquire('researcher-a'), { ok: false, reason: 'rate_limited' });
  const other = admission.acquire('researcher-b');
  assert.equal(other.ok, true);
  other.release();
  at += 101;
  const afterReset = admission.acquire('researcher-a');
  assert.equal(afterReset.ok, true);
  afterReset.release();
});
