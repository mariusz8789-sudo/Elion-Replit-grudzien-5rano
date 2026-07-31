import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex16, canonicalHash, maxRelativeDiff, snapshotEnvironment } from './provenance.mjs';

describe('sha256Hex16 (unchanged legacy hash primitive)', () => {
  test('deterministic and 16 hex chars', () => {
    const h = sha256Hex16({ a: 1, b: 2 });
    assert.equal(h.length, 16);
    assert.match(h, /^[0-9a-f]{16}$/);
    assert.equal(h, sha256Hex16({ a: 1, b: 2 }));
  });
  test('is sensitive to key order (matches the pre-existing local implementations exactly)', () => {
    // Documented behavior preserved on purpose: JSON.stringify is NOT key-order-stable,
    // so this hash is only stable when callers build the object the same way each time
    // (which every existing call site does).
    assert.notEqual(sha256Hex16({ a: 1, b: 2 }), sha256Hex16({ b: 2, a: 1 }));
  });
});

describe('canonicalHash (new provenance primitive)', () => {
  test('full 64 hex chars, order-independent', () => {
    const h = canonicalHash({ a: 1, b: 2 });
    assert.equal(h.length, 64);
    assert.equal(h, canonicalHash({ b: 2, a: 1 }));
  });
  test('order-independent through nested objects and arrays', () => {
    const x = { outer: { z: 1, a: [{ q: 1, p: 2 }] } };
    const y = { outer: { a: [{ p: 2, q: 1 }], z: 1 } };
    assert.equal(canonicalHash(x), canonicalHash(y));
  });
  test('different content hashes differently', () => {
    assert.notEqual(canonicalHash({ a: 1 }), canonicalHash({ a: 2 }));
  });
});

describe('maxRelativeDiff', () => {
  test('zero for identical numeric leaves', () => {
    assert.equal(maxRelativeDiff({ a: 1, b: 2 }), maxRelativeDiff({ a: 1, b: 2 }));
    assert.equal(maxRelativeDiff({ a: 1.5 }, { a: 1.5 }), 0);
  });
  test('computes the correct relative difference for a known example', () => {
    // |1.1 - 1.0| / 1.0 = 0.1
    assert.ok(Math.abs(maxRelativeDiff({ a: 1.0 }, { a: 1.1 }) - 0.1) < 1e-9);
  });
  test('recurses into nested objects, ignores arrays and non-numeric leaves', () => {
    const a = { x: { y: 2.0 }, label: 'same', arr: [1, 2, 3] };
    const b = { x: { y: 2.0002 }, label: 'same', arr: [9, 9, 9] };
    const d = maxRelativeDiff(a, b);
    assert.ok(d > 0 && d < 0.001, `expected small positive diff, got ${d}`);
  });
  test('Infinity when nothing numeric is shared (never silently reports zero drift)', () => {
    assert.equal(maxRelativeDiff({ a: 'x' }, { a: 'y' }), Infinity);
  });
});

// snapshotEnvironment spawns the Python probe. On a host without Python it
// returns { ok: false } by design; that is a state to assert, not a red build.
const PROBE_OK = snapshotEnvironment().ok === true;

describe('snapshotEnvironment', () => {
  test('returns a stable hash for repeated probes of an unchanged runtime', { skip: PROBE_OK ? false : 'Python probe unavailable' }, () => {
    const s1 = snapshotEnvironment();
    const s2 = snapshotEnvironment();
    assert.equal(s1.ok, true);
    assert.equal(s1.hash, s2.hash, 'unchanged runtime must fingerprint identically');
    assert.equal(s1.hash.length, 64);
  });

  test('an unprobeable runtime yields no hash at all, rather than a hash of nothing', { skip: PROBE_OK ? 'Python probe works here' : false }, () => {
    const s = snapshotEnvironment();
    assert.equal(s.ok, false);
    assert.equal(s.hash, undefined, 'there is no such thing as a fingerprint of an unknown environment');
    assert.equal(s.snapshot, undefined);
    assert.ok(s.error);
  });
});
