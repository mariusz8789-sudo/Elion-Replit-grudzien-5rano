import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runGovLowerHarmDiscovery } from '../core/orchestrator/govLowerHarmDiscovery';
import type { LowerHarmWinnerRecord, NoWinnerBlocker } from '../core/orchestrator/winnerRecord';
import { auditSnapshotOf, verifyAuditChain, verifyAuditSeal, type AuditSeal } from '../core/audit/cryptoAudit';
import { canonicalJson } from '../core/events/hash';

/**
 * D-116 — the COMMITTED artifact (artifacts/lower-harm/*, written by
 * `npm run winner-record:emit`) is locked to a LIVE run of the real
 * pipeline. If data, a pin, a rule, or a weight ever moves the result, this
 * test fails until someone deliberately re-emits the artifact — the artifact
 * can never silently go stale, and it can never be edited by hand into a
 * different outcome than the pipeline produces.
 */
const ARTIFACT_DIR = new URL('../../../../artifacts/lower-harm/', import.meta.url);
const readJson = <T,>(name: string): T => JSON.parse(readFileSync(new URL(name, ARTIFACT_DIR), 'utf8')) as T;

describe('D-116 committed WinnerRecord artifact matches a live PRODUCTION run', () => {
  it('winner-record.json reproduces the live run field-for-field on every replay-stable field', async () => {
    const pinned = readJson<LowerHarmWinnerRecord | NoWinnerBlocker>('winner-record.json');
    const live = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    expect(live.kind).toBe('RUN');
    if (live.kind !== 'RUN') return;
    expect(live.winnerRecord?.kind).toBe(pinned.kind);
    if (pinned.kind !== 'WINNER_RECORD' || live.winnerRecord?.kind !== 'WINNER_RECORD') {
      // A NO_WINNER pin must match a NO_WINNER live run at the same blocker — never one hiding the other.
      expect(JSON.stringify(live.winnerRecord)).toBe(JSON.stringify(pinned));
      return;
    }
    const w = live.winnerRecord;
    expect(w.recordFingerprint).toBe(pinned.recordFingerprint);
    expect(w.winnerId).toBe(pinned.winnerId);
    expect(w.candidateName).toBe(pinned.candidateName);
    expect(w.fingerprints).toEqual(pinned.fingerprints);
    expect(w.conjuncts).toEqual(pinned.conjuncts);
    expect(w.gate.outcome).toBe(pinned.gate.outcome);
    expect(w.gate.fingerprint).toBe(pinned.gate.fingerprint);
    expect(w.evidenceRefs).toEqual(pinned.evidenceRefs);
    expect(w.recipe).toEqual(pinned.recipe);
    expect(w.evidenceCustody?.hash).toBe(pinned.evidenceCustody?.hash);
    expect(w.disclosures).toEqual(pinned.disclosures);
  });

  it('research-recipe.json is exactly the recipe the live run built (same recipeFingerprint, same identifiers)', async () => {
    const pinned = readJson<LowerHarmWinnerRecord['recipe']>('research-recipe.json');
    const live = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    if (live.kind !== 'RUN' || live.winnerRecord?.kind !== 'WINNER_RECORD') throw new Error('expected a live WinnerRecord');
    expect(live.winnerRecord.recipe.recipeFingerprint).toBe(pinned.recipeFingerprint);
    expect(live.recipeFingerprint).toBe(pinned.recipeFingerprint);
    expect(live.winnerRecord.recipe).toEqual(pinned);
    expect(pinned.conceptualSynthesisRoute.startsWith('CONCEPTUAL ONLY')).toBe(true);
  });

  it('replay-verification.json records a MATCH whose fingerprints equal the live run', async () => {
    const pinned = readJson<{ verdict: string; runA: { auditFingerprint: string; recipeFingerprint: string | null; winnerId: string | null }; runB: { auditFingerprint: string } }>('replay-verification.json');
    expect(pinned.verdict).toBe('MATCH');
    expect(pinned.runA.auditFingerprint).toBe(pinned.runB.auditFingerprint);
    const live = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    if (live.kind !== 'RUN') throw new Error('expected RUN');
    expect(live.auditFingerprint).toBe(pinned.runA.auditFingerprint);
    expect(live.recipeFingerprint ?? null).toBe(pinned.runA.recipeFingerprint);
    expect(live.winner?.winnerId ?? null).toBe(pinned.runA.winnerId);
  });

  it('audit-seal.json verifies, is chained in audit-chain.json, and commits to exactly what a live run produces (D-121)', async () => {
    const seal = readJson<AuditSeal>('audit-seal.json');
    const chain = readJson<AuditSeal[]>('audit-chain.json');
    expect((await verifyAuditSeal(seal)).ok).toBe(true);
    const chainCheck = await verifyAuditChain(chain);
    expect(chainCheck.ok).toBe(true);
    expect(chain[chain.length - 1]?.sha256).toBe(seal.sha256);
    const live = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    if (live.kind !== 'RUN') throw new Error('expected RUN');
    expect(canonicalJson(auditSnapshotOf({ ...live, scenarioId: 'GOV-DRUG-DISCOVERY-E2E-02-LOWER-HARM' }))).toBe(canonicalJson(seal.snapshot));
    expect(live.auditSeal?.snapshot.auditFingerprint).toBe(seal.snapshot.auditFingerprint);
  });
});
