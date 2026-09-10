import { describe, expect, it } from 'vitest';
import {
  buildIntegrityEnvelope, computeIntegrityHash, verifyIntegrityEnvelope,
  type ExportableRecord, type IntegrityEnvelope,
} from '../core/integrity';

describe('Integrity Envelope — (a) determinism', () => {
  it('produces the identical hash for the identical record across repeated calls', async () => {
    const record: ExportableRecord = { hypothesisId: 'hyp-1', statement: 'Temperature increases reaction rate', evidence: { count: 5, score: 0.85 } };
    const hashes = await Promise.all([1, 2, 3, 4, 5].map(() => computeIntegrityHash(record)));
    expect(new Set(hashes).size).toBe(1);
    expect(hashes[0]).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces the same hash for a shallow clone of the same record', async () => {
    const record: ExportableRecord = { id: 'r-1', value: 42, label: 'test' };
    expect(await computeIntegrityHash(record)).toBe(await computeIntegrityHash({ ...record }));
  });
});

describe('Integrity Envelope — (b) key-order independence', () => {
  it('produces the same hash for flat objects differing only in key insertion order', async () => {
    const hashes = await Promise.all([
      computeIntegrityHash({ x: 1, y: 2, z: 3 }),
      computeIntegrityHash({ z: 3, y: 2, x: 1 }),
      computeIntegrityHash({ y: 2, x: 1, z: 3 }),
    ]);
    expect(new Set(hashes).size).toBe(1);
  });

  it('produces the same hash for deeply nested objects differing only in key order, at every level', async () => {
    const a: ExportableRecord = { level1: { level2: { z: 26, a: 1, m: 13 }, beta: 2, alpha: 1 }, topB: 1, topA: 2 };
    const b: ExportableRecord = { topA: 2, topB: 1, level1: { alpha: 1, beta: 2, level2: { a: 1, m: 13, z: 26 } } };
    expect(await computeIntegrityHash(a)).toBe(await computeIntegrityHash(b));
  });

  it('produces DIFFERENT hashes when array element order differs (arrays are ordered, never sorted)', async () => {
    expect(await computeIntegrityHash({ items: [1, 2, 3] })).not.toBe(await computeIntegrityHash({ items: [3, 2, 1] }));
  });
});

describe('Integrity Envelope — (c) tamper detection', () => {
  it('detects a one-character change in a string value', async () => {
    const original: ExportableRecord = { id: 'exp-123', result: 'success' };
    const envelope = await buildIntegrityEnvelope(original, new Date().toISOString());
    expect((await verifyIntegrityEnvelope(envelope)).valid).toBe(true);

    const tampered: IntegrityEnvelope = { ...envelope, record: { ...original, result: 'succesx' } };
    const result = await verifyIntegrityEnvelope(tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Hash mismatch');
  });

  it('detects a field added, a field removed, and a value changed after export', async () => {
    const original: ExportableRecord = { id: 'exp-1', value: 100, extra: 'data' };
    const envelope = await buildIntegrityEnvelope(original, new Date().toISOString());

    expect((await verifyIntegrityEnvelope({ ...envelope, record: { ...original, injected: true } })).valid).toBe(false);
    const { extra: _removed, ...stripped } = original;
    expect((await verifyIntegrityEnvelope({ ...envelope, record: stripped })).valid).toBe(false);
    expect((await verifyIntegrityEnvelope({ ...envelope, record: { ...original, value: 999 } })).valid).toBe(false);
  });

  it('detects tampering even when the attacker re-orders keys to try to hide it', async () => {
    const original: ExportableRecord = { a: 1, b: 2, c: 3 };
    const envelope = await buildIntegrityEnvelope(original, new Date().toISOString());
    const tampered: IntegrityEnvelope = { ...envelope, record: { c: 3, a: 999, b: 2 } };
    expect((await verifyIntegrityEnvelope(tampered)).valid).toBe(false);
  });
});

describe('Integrity Envelope — (d) nested structure affects the hash', () => {
  it('detects a change at arbitrary nesting depth', async () => {
    const original: ExportableRecord = { level1: { level2: { level3: { level4: { value: 'deep' } } } } };
    const envelope = await buildIntegrityEnvelope(original, new Date().toISOString());
    const tampered: IntegrityEnvelope = { ...envelope, record: { level1: { level2: { level3: { level4: { value: 'changed' } } } } } };
    expect((await verifyIntegrityEnvelope(tampered)).valid).toBe(false);
  });

  it('detects a change to one element of an object nested inside an array', async () => {
    const original: ExportableRecord = { experiments: [{ id: 'e1', value: 10 }, { id: 'e2', value: 20 }] };
    const envelope = await buildIntegrityEnvelope(original, new Date().toISOString());
    const tampered: IntegrityEnvelope = { ...envelope, record: { experiments: [{ id: 'e1', value: 10 }, { id: 'e2', value: 999 }] } };
    expect((await verifyIntegrityEnvelope(tampered)).valid).toBe(false);
  });
});

describe('Integrity Envelope — normalization matches what actually gets downloaded', () => {
  it('a record with undefined-valued fields verifies cleanly after a real JSON round-trip (no false DRIFT)', async () => {
    // The exact failure mode this guards against: without normalizing before
    // hashing, {a: undefined} would hash as though "a" were present (null),
    // but JSON.stringify (what the real download does) DROPS the key
    // entirely — so re-opening the downloaded file would recompute a
    // different hash and falsely report tampering on an untouched file.
    const original = { id: 'exp-1', maybeField: undefined, value: 42 } as unknown as ExportableRecord;
    const envelope = await buildIntegrityEnvelope(original, new Date().toISOString());

    // Simulate the real download -> reopen cycle: serialize, then parse back.
    const downloaded = JSON.parse(JSON.stringify(envelope)) as IntegrityEnvelope;
    const result = await verifyIntegrityEnvelope(downloaded);
    expect(result.valid).toBe(true);
  });

  it('normalizes Date objects the same way JSON.stringify does, rather than silently dropping them', async () => {
    const date = new Date('2026-09-10T12:00:00.000Z');
    const withDate: ExportableRecord = { recordedAt: date };
    const withEquivalentString: ExportableRecord = { recordedAt: date.toISOString() };
    expect(await computeIntegrityHash(withDate)).toBe(await computeIntegrityHash(withEquivalentString));
  });
});

describe('Integrity Envelope — build and structural validation', () => {
  it('builds a well-formed envelope carrying an explicit non-signature disclaimer', async () => {
    const record: ExportableRecord = { id: 'test-123', value: 42 };
    const exportedAt = '2026-09-10T12:00:00.000Z';
    const envelope = await buildIntegrityEnvelope(record, exportedAt);
    expect(envelope.record).toBe(record);
    expect(envelope.exportedAt).toBe(exportedAt);
    expect(envelope.integrityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(envelope.verificationInstructions).toContain('NOT a cryptographic signature');
    expect(envelope.verificationInstructions).toContain('SHA-256');
  });

  it('rejects an envelope with a malformed hash', async () => {
    const envelope: IntegrityEnvelope = { record: { test: 'data' }, integrityHash: 'not-a-hash', exportedAt: new Date().toISOString(), verificationInstructions: '' };
    const result = await verifyIntegrityEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Invalid envelope');
  });

  it('rejects an envelope with no record', async () => {
    const envelope = { record: null, integrityHash: 'a'.repeat(64), exportedAt: '', verificationInstructions: '' } as unknown as IntegrityEnvelope;
    expect((await verifyIntegrityEnvelope(envelope)).valid).toBe(false);
  });
});

describe('Integrity Envelope — edge cases', () => {
  it('handles null values, empty objects, and empty arrays without throwing', async () => {
    await expect(computeIntegrityHash({ value: null, nested: { inner: null } })).resolves.toMatch(/^[a-f0-9]{64}$/);
    const emptyObjHash = await computeIntegrityHash({});
    const emptyArrHash = await computeIntegrityHash({ items: [] });
    expect(emptyObjHash).not.toBe(emptyArrHash);
  });

  it('handles unicode text', async () => {
    await expect(computeIntegrityHash({ text: 'Unicode: 你好 世界 🌍 αβγδ' })).resolves.toMatch(/^[a-f0-9]{64}$/);
  });
});
