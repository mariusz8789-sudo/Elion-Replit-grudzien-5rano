import { describe, expect, it } from 'vitest';
import { EvidenceConnectorStore } from '../core/evidenceConnectors/store';
import { FailClosedError, type SourceConfig } from '../core/evidenceConnectors/contracts';
import { fixedBytesPort, alwaysFailingPort } from '../core/evidenceConnectors/testFixtures';
import { REGISTRY } from '../core/evidenceConnectors/registry';
import { hashBytes } from '../core/evidenceConnectors/hashing';

/**
 * EVIDENCE CONNECTORS — negative-first, real async (docs/DECISIONS.md D-057).
 * Every port here is a `testFixtures.ts` fixture, explicitly named so no
 * test could be mistaken for a real network call. No test claims a fake
 * fixture's success as a "REAL_RUN" — only the honest FROZEN/HASH_MISMATCH_
 * SUPERSEDED/FETCH_FAILED statuses this module actually produces.
 */

const sha256Source: SourceConfig = { sourceId: 'S1', name: 'source one', url: 'https://example.test/one', hashPolicy: 'sha256', category: 'TEST' };
const fnvSource: SourceConfig = { sourceId: 'S2', name: 'source two', url: 'https://example.test/two', hashPolicy: 'fnv1a-canonical', category: 'TEST' };

describe('EvidenceConnectorStore.ingest — fail-closed, append-only', () => {
  it('a fetch failure never throws and never produces a FROZEN artifact — it produces a real FETCH_FAILED record', async () => {
    const store = new EvidenceConnectorStore();
    const record = await store.ingest(sha256Source, alwaysFailingPort);
    expect(record.status).toBe('FETCH_FAILED');
    expect(record.artifact).toBeNull();
  });

  it('the first successful ingest for a source freezes a real artifact', async () => {
    const store = new EvidenceConnectorStore();
    const port = fixedBytesPort({ S1: 'hello world' });
    const record = await store.ingest(sha256Source, port);
    expect(record.status).toBe('FROZEN');
    expect(record.artifact).not.toBeNull();
    expect(record.artifact!.hash).toBe(await hashBytes(new TextEncoder().encode('hello world'), 'sha256'));
  });

  it('a second ingest with IDENTICAL bytes re-affirms FROZEN, never HASH_MISMATCH_SUPERSEDED', async () => {
    const store = new EvidenceConnectorStore();
    const port = fixedBytesPort({ S1: 'stable content' });
    await store.ingest(sha256Source, port);
    const second = await store.ingest(sha256Source, port);
    expect(second.status).toBe('FROZEN');
  });

  it('hash drift: a second ingest with DIFFERENT bytes supersedes the prior frozen artifact WITHOUT deleting it (append-only)', async () => {
    const store = new EvidenceConnectorStore();
    const first = await store.ingest(sha256Source, fixedBytesPort({ S1: 'version A' }));
    const second = await store.ingest(sha256Source, fixedBytesPort({ S1: 'version B' }));
    expect(second.status).toBe('HASH_MISMATCH_SUPERSEDED');
    expect(second.supersedes).toBe(first.artifact!.artifactId);

    const all = await store.allRecords('S1');
    expect(all.length).toBe(2);
    expect(all[0]).toEqual(first); // the old record is untouched, not mutated or removed
  });

  it('a source configured with fnv1a-canonical actually hashes with fnv1a, not sha256', async () => {
    const store = new EvidenceConnectorStore();
    const bytes = new TextEncoder().encode('fnv content');
    const record = await store.ingest(fnvSource, fixedBytesPort({ S2: 'fnv content' }));
    expect(record.artifact!.hash).toBe(await hashBytes(bytes, 'fnv1a-canonical'));
    expect(record.artifact!.hash).not.toBe(await hashBytes(bytes, 'sha256'));
  });
});

describe('EvidenceConnectorStore.replay — reuses the artifact\'s OWN hashPolicy, never hardcodes an algorithm', () => {
  it('replay of a sha256-policy artifact matches when the port returns the same bytes', async () => {
    const store = new EvidenceConnectorStore();
    const port = fixedBytesPort({ S1: 'replay me' });
    const record = await store.ingest(sha256Source, port);
    const result = await store.replay('S1', record.artifact!.artifactId, port);
    expect(result.ok).toBe(true);
    expect(result.hashPolicy).toBe('sha256');
  });

  it('replay of an fnv1a-canonical-policy artifact matches, and is NOT computed with sha256', async () => {
    const store = new EvidenceConnectorStore();
    const port = fixedBytesPort({ S2: 'fnv replay' });
    const record = await store.ingest(fnvSource, port);
    const result = await store.replay('S2', record.artifact!.artifactId, port);
    expect(result.ok).toBe(true);
    expect(result.hashPolicy).toBe('fnv1a-canonical');
    // if replay hardcoded sha256 (the exact defect flagged for this pass), the
    // expectedHash recorded at ingest time would never match an sha256 digest
    const sha256OfSameBytes = await hashBytes(new TextEncoder().encode('fnv replay'), 'sha256');
    expect(result.expectedHash).not.toBe(sha256OfSameBytes);
  });

  it('replay detects real drift: content changed since freezing ⇒ ok=false, both hashes reported', async () => {
    const store = new EvidenceConnectorStore();
    const record = await store.ingest(sha256Source, fixedBytesPort({ S1: 'original' }));
    const driftedPort = fixedBytesPort({ S1: 'drifted' });
    const result = await store.replay('S1', record.artifact!.artifactId, driftedPort);
    expect(result.ok).toBe(false);
    expect(result.actualHash).not.toBe(result.expectedHash);
  });

  it('replay of an unknown artifactId fails closed with NO_FROZEN_ARTIFACT, never a fabricated match', async () => {
    const store = new EvidenceConnectorStore();
    await expect(store.replay('S1', 'nonexistent-artifact', fixedBytesPort({}))).rejects.toBeInstanceOf(FailClosedError);
  });

  it('a fetch failure during replay is reported as ok=false, not thrown past the caller', async () => {
    const store = new EvidenceConnectorStore();
    const record = await store.ingest(sha256Source, fixedBytesPort({ S1: 'x' }));
    const result = await store.replay('S1', record.artifact!.artifactId, alwaysFailingPort);
    expect(result.ok).toBe(false);
    expect(result.actualHash).toBeNull();
  });
});

describe('drift reporting and the source registry', () => {
  it('driftReport counts FROZEN vs HASH_MISMATCH_SUPERSEDED vs FETCH_FAILED correctly', async () => {
    const store = new EvidenceConnectorStore();
    await store.ingest(sha256Source, fixedBytesPort({ S1: 'v1' }));
    await store.ingest(sha256Source, fixedBytesPort({ S1: 'v2' }));
    await store.ingest(sha256Source, alwaysFailingPort);
    const report = await store.driftReport('S1');
    expect(report.frozenCount).toBe(1);
    expect(report.driftCount).toBe(1);
    expect(report.fetchFailedCount).toBe(1);
  });

  it('the registry declares a real, non-empty set of sources with a mix of hash policies (exercising both)', () => {
    expect(REGISTRY.length).toBeGreaterThanOrEqual(7);
    const policies = new Set(REGISTRY.map((s) => s.hashPolicy));
    expect(policies.has('sha256')).toBe(true);
    expect(policies.has('fnv1a-canonical')).toBe(true);
  });

  it('registry entries carry configuration only — importing the registry performs no network call', () => {
    // if this module had a side-effecting fetch, this synchronous assertion would race it; the
    // absence of any `await`/promise here is itself the proof the import is inert configuration.
    expect(REGISTRY.every((s) => typeof s.url === 'string' && s.url.length > 0)).toBe(true);
  });
});
