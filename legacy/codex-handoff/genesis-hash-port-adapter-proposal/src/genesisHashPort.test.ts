import { describe, expect, it } from 'vitest';
import { fnv1a, canonicalJson } from '../events/hash';
import { GenesisHashPort, genesisHashPort } from './genesisHashPort';

describe('GenesisHashPort', () => {
  it('hash() delegates to the canonical fnv1a, not a private reimplementation', () => {
    expect(genesisHashPort.hash('abc')).toBe(fnv1a('abc'));
  });

  it('fingerprint() delegates to canonical fnv1a(canonicalJson(value))', () => {
    const value = { b: 2, a: 1 };
    expect(genesisHashPort.fingerprint(value)).toBe(fnv1a(canonicalJson(value)));
  });

  it('fingerprint() is key-order independent, matching canonicalJson', () => {
    expect(genesisHashPort.fingerprint({ a: 1, b: 2 })).toBe(
      genesisHashPort.fingerprint({ b: 2, a: 1 }),
    );
  });

  it('is deterministic across separate instances', () => {
    const other = new GenesisHashPort();
    expect(other.hash('genesis')).toBe(genesisHashPort.hash('genesis'));
  });
});
