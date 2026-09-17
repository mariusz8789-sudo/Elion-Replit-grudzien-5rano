import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/crypto/canonicalJson.js';

describe('canonicalJson — deterministic, order-independent serialization', () => {
  it('sorts top-level keys regardless of insertion order', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('sorts nested object keys recursively', () => {
    const a = { outer: { z: 1, a: 2 }, x: 1 };
    const b = { x: 1, outer: { a: 2, z: 1 } };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('preserves array ORDER — arrays are not sorted, only object keys are', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalJson([{ b: 1, a: 2 }, { d: 1, c: 2 }])).toBe('[{"a":2,"b":1},{"c":2,"d":1}]');
  });

  it('handles null and every JSON primitive type', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson(false)).toBe('false');
    expect(canonicalJson(42)).toBe('42');
    expect(canonicalJson('text')).toBe('"text"');
    expect(canonicalJson({ n: null, present: true })).toBe('{"n":null,"present":true}');
  });

  it('is deterministic across repeated calls on deeply nested structures', () => {
    const value = { a: [{ z: 1, y: [1, 2, { q: 1, p: 2 }] }], b: { nested: { deep: { value: 1 } } } };
    const first = canonicalJson(value);
    const second = canonicalJson(JSON.parse(JSON.stringify(value)));
    expect(first).toBe(second);
  });

  it('rejects bigint rather than silently miscanonicalizing it', () => {
    expect(() => canonicalJson({ x: 1n })).toThrow(/bigint/);
  });

  it('rejects an undefined field rather than silently dropping it (no double-stringification surprise)', () => {
    expect(() => canonicalJson({ present: 1, missing: undefined })).toThrow(/undefined field/);
  });

  it('never double-stringifies: the output parses back to an equivalent value exactly once', () => {
    const value = { a: 1, b: [1, 2, 3], c: { d: 'text' } };
    const serialized = canonicalJson(value);
    expect(JSON.parse(serialized)).toEqual(value);
    // A second canonicalization of the ALREADY-serialized string would wrap it in quotes if this ever regressed to double-stringifying.
    expect(serialized.startsWith('"{')).toBe(false);
  });

  it('two structurally different values never canonicalize to the same string (no accidental collision in this contract)', () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: '1' }));
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});
