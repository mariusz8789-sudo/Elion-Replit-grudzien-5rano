import { describe, expect, it } from 'vitest';
import { createBlindDataset, mintFreezeToken } from '../core/agent/blindDataset';

const CUSTODY = { source: 'test-archive', url: 'https://example.test/data', sha256: 'abc123' };

describe('mintFreezeToken', () => {
  it('is deterministic for identical frozen content', () => {
    const a = mintFreezeToken(1000, { hypothesis: 'x > 0' });
    const b = mintFreezeToken(1000, { hypothesis: 'x > 0' });
    expect(a.freezeToken).toBe(b.freezeToken);
  });

  it('differs when the frozen content differs', () => {
    const a = mintFreezeToken(1000, { hypothesis: 'x > 0' });
    const b = mintFreezeToken(1000, { hypothesis: 'x < 0' });
    expect(a.freezeToken).not.toBe(b.freezeToken);
  });
});

describe('createBlindDataset — construction-time ordering guard', () => {
  it('THROWS when the freeze was minted AFTER the dataset was retrieved', () => {
    const freeze = mintFreezeToken(5000, { plan: 'x' });
    expect(() => createBlindDataset({ datasetId: 'd1', retrievedAt: 1000, data: [1, 2, 3], freeze, custody: CUSTODY })).toThrow(/A freeze must precede/);
  });

  it('THROWS when the freeze and the retrieval happen at the exact same instant (>= is a violation, not just >)', () => {
    const freeze = mintFreezeToken(1000, { plan: 'x' });
    expect(() => createBlindDataset({ datasetId: 'd1', retrievedAt: 1000, data: [1, 2, 3], freeze, custody: CUSTODY })).toThrow();
  });

  it('constructs cleanly when the freeze strictly precedes retrieval', () => {
    const freeze = mintFreezeToken(1000, { plan: 'x' });
    const ds = createBlindDataset({ datasetId: 'd1', retrievedAt: 2000, data: [1, 2, 3], freeze, custody: CUSTODY });
    expect(ds.datasetId).toBe('d1');
  });
});

describe('createBlindDataset — read-time access guard (the real access-layer enforcement)', () => {
  it('THROWS when read() is called with no valid token', () => {
    const freeze = mintFreezeToken(1000, { plan: 'x' });
    const ds = createBlindDataset({ datasetId: 'd1', retrievedAt: 2000, data: 'secret-data', freeze, custody: CUSTODY });
    expect(() => ds.read('')).toThrow(/refusing to release/);
    expect(() => ds.read('some-other-token')).toThrow(/refusing to release/);
  });

  it('THROWS when read() is called with a token minted for a DIFFERENT freeze', () => {
    const freezeA = mintFreezeToken(1000, { plan: 'A' });
    const freezeB = mintFreezeToken(1000, { plan: 'B' });
    const ds = createBlindDataset({ datasetId: 'd1', retrievedAt: 2000, data: 'secret-data', freeze: freezeA, custody: CUSTODY });
    expect(() => ds.read(freezeB.freezeToken)).toThrow(/refusing to release/);
  });

  it('releases the data ONLY when the exact matching freeze token is presented', () => {
    const freeze = mintFreezeToken(1000, { plan: 'x' });
    const ds = createBlindDataset({ datasetId: 'd1', retrievedAt: 2000, data: { value: 42 }, freeze, custody: CUSTODY });
    expect(ds.read(freeze.freezeToken)).toEqual({ value: 42 });
  });

  it('there is no way to read the data other than through .read() -- no raw data field is exposed', () => {
    const freeze = mintFreezeToken(1000, { plan: 'x' });
    const ds = createBlindDataset({ datasetId: 'd1', retrievedAt: 2000, data: 'secret-data', freeze, custody: CUSTODY });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ds as any).data).toBeUndefined();
  });
});
