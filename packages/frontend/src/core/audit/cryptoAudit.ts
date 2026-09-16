import { canonicalJson } from '../events/hash';
import { sha256Hex } from '../discovery/evidenceCrypto';
import type { DiscoveryRun } from '../orchestrator/contracts';
import type { LowerHarmWinnerRecord, NoWinnerBlocker } from '../orchestrator/winnerRecord';

/**
 * CRYPTOGRAPHIC AUDIT TRAIL (D-121) — a SHA-256 seal over the verdict of one
 * run (Winner Gate conjuncts, gate outcome, WinnerRecord or blocker, recipe
 * and audit fingerprints, custody hash, every stage fingerprint), chainable
 * into a ledger where each seal commits to the previous one.
 *
 * Built the way `evidenceCrypto.ts` already builds custody digests: Web
 * Crypto SHA-256 (browser and Node 22 alike) over the repo's own
 * `canonicalJson` (recursive key sort), ADDED ALONGSIDE the internal FNV
 * fingerprints — never instead of them, so every pinned fingerprint and every
 * replay MATCH stays byte-identical.
 *
 * Determinism is the contract: the sealed payload contains NO timestamp and
 * nothing the run did not produce, so the same run seals to the same digest
 * on any machine; `sealedAt` is metadata outside the hash. Changing one byte
 * of the snapshot, or of any earlier link, fails `verifyAuditSeal` /
 * `verifyAuditChain`. This module never decides anything scientific.
 */

export const AUDIT_SEAL_CONTRACT_VERSION = '1.0.0';

export interface AuditSnapshot {
  readonly contractVersion: typeof AUDIT_SEAL_CONTRACT_VERSION;
  readonly scenarioId: string | null;
  readonly mode: string;
  readonly verdict: string;
  readonly auditFingerprint: string;
  readonly recipeFingerprint: string | null;
  readonly record: { readonly kind: 'WINNER_RECORD'; readonly winnerId: string; readonly candidateName: string; readonly recordFingerprint: string; readonly gateOutcome: string; readonly gateFingerprint: string }
    | { readonly kind: 'NO_WINNER_BLOCKER'; readonly blockedAt: string; readonly reason: string }
    | null;
  readonly conjuncts: readonly { readonly criterion: string; readonly held: boolean }[];
  readonly custody: { readonly sourceId: string; readonly hash: string | null; readonly hashPolicy: string | null } | null;
  readonly stages: readonly { readonly stage: string; readonly status: string; readonly fingerprint: string }[];
}

export interface AuditSeal {
  readonly algorithm: 'sha256';
  readonly contractVersion: typeof AUDIT_SEAL_CONTRACT_VERSION;
  readonly snapshot: AuditSnapshot;
  /** SHA-256 over canonicalJson({ previousSha256, snapshot }). */
  readonly sha256: string;
  readonly previousSha256: string | null;
  readonly chainIndex: number;
  /** Metadata only — deliberately outside the hashed payload. */
  readonly sealedAt: string | null;
}

type SealableRun = DiscoveryRun & {
  readonly scenarioId?: string;
  readonly winnerRecord?: LowerHarmWinnerRecord | NoWinnerBlocker;
  readonly evidenceCustody?: { readonly sourceId: string; readonly record?: { readonly artifact: { readonly hash: string; readonly hashPolicy: string } | null } | null } | null;
  readonly detail?: { readonly conjuncts: readonly { readonly criterion: string; readonly held: boolean }[] };
};

/** Projects a finished run onto the facts the seal commits to. Pure. */
export function auditSnapshotOf(run: SealableRun): AuditSnapshot {
  const r = run.winnerRecord;
  const custody = run.evidenceCustody ?? null;
  return {
    contractVersion: AUDIT_SEAL_CONTRACT_VERSION,
    scenarioId: r?.kind === 'WINNER_RECORD' ? r.scenarioId : (run.scenarioId ?? null),
    mode: run.mode,
    verdict: run.verdict,
    auditFingerprint: run.auditFingerprint,
    recipeFingerprint: run.recipeFingerprint ?? null,
    record: r === undefined ? null
      : r.kind === 'WINNER_RECORD'
        ? { kind: 'WINNER_RECORD', winnerId: r.winnerId, candidateName: r.candidateName, recordFingerprint: r.recordFingerprint, gateOutcome: r.gate.outcome, gateFingerprint: r.gate.fingerprint }
        : { kind: 'NO_WINNER_BLOCKER', blockedAt: r.blockedAt, reason: r.reason },
    conjuncts: (r?.kind === 'WINNER_RECORD' ? r.conjuncts : run.detail?.conjuncts ?? []).map((c) => ({ criterion: c.criterion, held: c.held })),
    custody: custody === null ? null : { sourceId: custody.sourceId, hash: custody.record?.artifact?.hash ?? null, hashPolicy: custody.record?.artifact?.hashPolicy ?? null },
    stages: run.stages.map((s) => ({ stage: s.stage, status: s.status, fingerprint: s.fingerprint })),
  };
}

function sealPayload(snapshot: AuditSnapshot, previousSha256: string | null): string {
  return canonicalJson({ previousSha256, snapshot });
}

/** Seals a snapshot; `previous` chains it (the new seal commits to the previous digest). */
export async function sealAuditSnapshot(snapshot: AuditSnapshot, previous: AuditSeal | null = null, sealedAt: string | null = null): Promise<AuditSeal> {
  const previousSha256 = previous === null ? null : previous.sha256;
  const sha256 = await sha256Hex(sealPayload(snapshot, previousSha256));
  return Object.freeze({
    algorithm: 'sha256',
    contractVersion: AUDIT_SEAL_CONTRACT_VERSION,
    snapshot,
    sha256,
    previousSha256,
    chainIndex: previous === null ? 0 : previous.chainIndex + 1,
    sealedAt,
  });
}

/** Convenience: seal a finished run directly. */
export async function sealRun(run: SealableRun, previous: AuditSeal | null = null, sealedAt: string | null = null): Promise<AuditSeal> {
  return sealAuditSnapshot(auditSnapshotOf(run), previous, sealedAt);
}

export interface AuditVerification { readonly ok: boolean; readonly reason: string | null; }

/** Recomputes the digest from the seal's own snapshot and previous link. */
export async function verifyAuditSeal(seal: AuditSeal): Promise<AuditVerification> {
  if (seal.algorithm !== 'sha256') return { ok: false, reason: `unsupported algorithm ${String(seal.algorithm)}` };
  if (seal.contractVersion !== AUDIT_SEAL_CONTRACT_VERSION) return { ok: false, reason: `unsupported contract version ${String(seal.contractVersion)}` };
  const expected = await sha256Hex(sealPayload(seal.snapshot, seal.previousSha256));
  return expected === seal.sha256 ? { ok: true, reason: null } : { ok: false, reason: 'digest does not match the sealed content' };
}

export interface ChainVerification extends AuditVerification { readonly brokenAt: number | null; readonly length: number; }

/** Every seal must verify and link to the one before it (index 0 links to nothing). */
export async function verifyAuditChain(seals: readonly AuditSeal[]): Promise<ChainVerification> {
  for (let i = 0; i < seals.length; i++) {
    const s = seals[i]!;
    const own = await verifyAuditSeal(s);
    if (!own.ok) return { ok: false, reason: own.reason, brokenAt: i, length: seals.length };
    if (s.chainIndex !== i) return { ok: false, reason: `chainIndex ${s.chainIndex} at position ${i}`, brokenAt: i, length: seals.length };
    const expectedPrev = i === 0 ? null : seals[i - 1]!.sha256;
    if (s.previousSha256 !== expectedPrev) return { ok: false, reason: 'previous link does not match the preceding seal', brokenAt: i, length: seals.length };
  }
  return { ok: true, reason: null, brokenAt: null, length: seals.length };
}
