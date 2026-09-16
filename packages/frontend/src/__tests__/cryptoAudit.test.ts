import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { AUDIT_SEAL_CONTRACT_VERSION, auditSnapshotOf, sealAuditSnapshot, sealRun, verifyAuditChain, verifyAuditSeal, type AuditSeal } from '../core/audit/cryptoAudit';
import { appendToLedger, loadLedger, verifyLedger, type StorageLike } from '../core/audit/auditLedger';
import { runGovLowerHarmDiscovery } from '../core/orchestrator/govLowerHarmDiscovery';
import type { LowerHarmRunDetail, LowerHarmWinnerRecord } from '../core/orchestrator/winnerRecord';
import type { RunResult } from '../core/orchestrator/govLowerHarmDiscovery';

/**
 * D-121 — the seal is deterministic, tamper-evident and chainable; it commits
 * to exactly what the run produced and to nothing else (no timestamp inside).
 */
const ARTIFACT_DIR = new URL('../../../../artifacts/lower-harm/', import.meta.url);
const readJson = <T,>(name: string): T => JSON.parse(readFileSync(new URL(name, ARTIFACT_DIR), 'utf8')) as T;
const detail = readJson<LowerHarmRunDetail>('run-detail.json');
const record = readJson<LowerHarmWinnerRecord>('winner-record.json');
const replay = readJson<{ runA: { auditFingerprint: string; verdict: string; recipeFingerprint: string }; stages: RunResult['stages']; evidenceCustody: { ok: boolean; sourceId: string; hash: string; hashPolicy: string } }>('replay-verification.json');

const runLike = (): RunResult => ({
  kind: 'RUN', verdict: replay.runA.verdict, mode: 'PRODUCTION', auditFingerprint: replay.runA.auditFingerprint, recipeFingerprint: replay.runA.recipeFingerprint,
  stages: replay.stages, detail, winnerRecord: record,
  evidenceCustody: { ok: true, sourceId: replay.evidenceCustody.sourceId, record: { artifact: { hash: replay.evidenceCustody.hash, hashPolicy: replay.evidenceCustody.hashPolicy } } },
} as unknown as RunResult);

function memoryStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}

describe('auditSnapshotOf', () => {
  it('commits to the verdict, record, fingerprints, gate, custody hash and every stage — and to nothing time-dependent', () => {
    const snap = auditSnapshotOf(runLike());
    expect(snap.contractVersion).toBe(AUDIT_SEAL_CONTRACT_VERSION);
    expect(snap.verdict).toBe('WINNER');
    expect(snap.record?.kind).toBe('WINNER_RECORD');
    if (snap.record?.kind === 'WINNER_RECORD') { expect(snap.record.winnerId).toBe(record.winnerId); expect(snap.record.recordFingerprint).toBe(record.recordFingerprint); expect(snap.record.gateOutcome).toBe('REQUIRES_HUMAN_APPROVAL'); }
    expect(snap.auditFingerprint).toBe(replay.runA.auditFingerprint);
    expect(snap.custody?.hash).toBe(replay.evidenceCustody.hash);
    expect(snap.stages.length).toBe(20);
    expect(JSON.stringify(snap)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe('sealAuditSnapshot / verifyAuditSeal', () => {
  it('is deterministic (same snapshot → same 64-hex digest) and sealedAt never changes the digest', async () => {
    const snap = auditSnapshotOf(runLike());
    const a = await sealAuditSnapshot(snap, null, null);
    const b = await sealAuditSnapshot(snap, null, '2026-09-16T00:00:00.000Z');
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.sha256).toBe(b.sha256);
    expect((await verifyAuditSeal(a)).ok).toBe(true);
  });

  it('detects a single-field tamper of the sealed content and a forged digest', async () => {
    const seal = await sealRun(runLike());
    const tampered: AuditSeal = { ...seal, snapshot: { ...seal.snapshot, verdict: 'NO_WINNER' } };
    expect((await verifyAuditSeal(tampered)).ok).toBe(false);
    const forged: AuditSeal = { ...seal, sha256: 'f'.repeat(64) };
    expect((await verifyAuditSeal(forged)).ok).toBe(false);
    const stageTamper: AuditSeal = { ...seal, snapshot: { ...seal.snapshot, stages: seal.snapshot.stages.map((s, i) => (i === 9 ? { ...s, fingerprint: '00000000' } : s)) } };
    expect((await verifyAuditSeal(stageTamper)).ok).toBe(false);
  });

  it('a live PRODUCTION run seals to the same digest twice, and the seal rides on the run result', async () => {
    const first = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    const second = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    if (first.kind !== 'RUN' || second.kind !== 'RUN') throw new Error('expected RUN');
    expect(first.auditSeal?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.auditSeal?.sha256).toBe(second.auditSeal?.sha256);
    expect((await verifyAuditSeal(first.auditSeal!)).ok).toBe(true);
    expect(first.auditSeal!.snapshot.auditFingerprint).toBe(first.auditFingerprint);
  });
});

describe('verifyAuditChain / ledger', () => {
  it('chains seals so that altering any earlier link breaks every later verification', async () => {
    const snap = auditSnapshotOf(runLike());
    const s0 = await sealAuditSnapshot(snap, null);
    const s1 = await sealAuditSnapshot({ ...snap, verdict: 'NO_WINNER', record: { kind: 'NO_WINNER_BLOCKER', blockedAt: 'SAFETY_GATE_REFUSE', reason: 'x' } }, s0);
    const s2 = await sealAuditSnapshot(snap, s1);
    expect((await verifyAuditChain([s0, s1, s2])).ok).toBe(true);
    expect(s2.chainIndex).toBe(2);
    const broken = await verifyAuditChain([s0, { ...s1, snapshot: { ...s1.snapshot, verdict: 'WINNER' } }, s2]);
    expect(broken.ok).toBe(false); expect(broken.brokenAt).toBe(1);
    const relinked = await verifyAuditChain([s0, s2]);
    expect(relinked.ok).toBe(false); expect(relinked.brokenAt).toBe(1);
  });

  it('the ledger appends chained seals to storage and verifies them; a corrupted ledger is reported, not reset', async () => {
    const storage = memoryStorage();
    const snap = auditSnapshotOf(runLike());
    const a = await appendToLedger(storage, snap, () => '2026-09-16T10:00:00.000Z');
    const b = await appendToLedger(storage, snap, () => '2026-09-16T10:05:00.000Z');
    expect(a.length).toBe(1); expect(b.length).toBe(2);
    expect(b.seal.previousSha256).toBe(a.seal.sha256);
    expect(b.seal.sealedAt).toBe('2026-09-16T10:05:00.000Z');
    expect((await verifyLedger(storage)).ok).toBe(true);
    const seals = loadLedger(storage) as AuditSeal[];
    storage.data['genesis.auditLedger.v1'] = JSON.stringify([{ ...seals[0], snapshot: { ...seals[0]!.snapshot, verdict: 'NO_WINNER' } }, seals[1]]);
    const v = await verifyLedger(storage);
    expect(v.ok).toBe(false); expect(v.brokenAt).toBe(0);
    expect(loadLedger(storage).length).toBe(2);
  });
});
