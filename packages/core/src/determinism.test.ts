import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { canonicalJson, fnv1a, fnv1aUint, mulberry32, sha256Hex, stableHash } from './determinism.js';
// @ts-expect-error — plain .mjs module without types
import * as backend from '../../backend/src/determinism.mjs';

describe('one canonical JSON', () => {
  it('sorts keys by UTF-16 code unit at every level, never by locale', () => {
    // localeCompare would put "a" before "B" and "a_b" before "aB"; code-unit order does the opposite.
    expect(canonicalJson({ a: 1, B: 2, aB: 3, a_b: 4 })).toBe('{"B":2,"a":1,"aB":3,"a_b":4}');
    expect(canonicalJson({ z: { y: 1, x: [{ b: 1, a: 2 }] } })).toBe('{"z":{"x":[{"a":2,"b":1}],"y":1}}');
  });

  it('has JSON semantics: undefined keys dropped, undefined in arrays → null, toJSON honoured', () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson([undefined, 1])).toBe('[null,1]');
    expect(canonicalJson({ at: new Date(0) })).toBe('{"at":"1970-01-01T00:00:00.000Z"}');
    expect(canonicalJson(undefined)).toBe('null');
  });

  it('a JSON round-trip does not change the hash (the old stableStringify broke this with undefined)', () => {
    const inMemory = { claim: 'x', note: undefined, nested: { k: 1 } };
    expect(stableHash(inMemory)).toBe(stableHash(JSON.parse(JSON.stringify(inMemory))));
  });

  it('is byte-identical to the backend twin (packages/backend/src/determinism.mjs)', () => {
    const samples = [{ b: 1, a: [3, { d: null, c: 'ż' }] }, { Z: 1, a: 2, _: 3 }, [1, 'x', true, null], { at: new Date(1) }];
    for (const s of samples) expect(canonicalJson(s)).toBe(backend.canonicalJson(s));
    expect(fnv1a('Genesis')).toBe(backend.fnv1a('Genesis'));
    expect(sha256Hex('zażółć')).toBe(backend.sha256Hex('zażółć'));
  });
});

describe('one FNV-1a, one SHA-256, one PRNG', () => {
  it('FNV-1a 32-bit reference values', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
    expect(fnv1aUint('a')).toBe(0xe40c292c);
  });

  it('SHA-256 equals node:crypto', () => {
    for (const t of ['', 'abc', 'zażółć gęślą jaźń', 'x'.repeat(1000)]) expect(sha256Hex(t)).toBe(createHash('sha256').update(t, 'utf8').digest('hex'));
  });

  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(42); const b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(0)()).toBe(0.26642920868471265);
  });
});
