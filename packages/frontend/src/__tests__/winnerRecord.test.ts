import { describe, expect, it } from 'vitest';
import { runGovLowerHarmDiscovery, replayGovLowerHarmDiscovery } from '../core/orchestrator/govLowerHarmDiscovery';
import { runGovE2E01Discovery } from '../core/orchestrator/govE2E01Discovery';
import { buildLowerHarmWinnerRecord } from '../core/orchestrator/winnerRecord';
import { canonicalJson, fnv1a } from '../core/events/hash';

/**
 * D-116 — WinnerRecord / Research Recipe as first-class, replay-verified
 * outputs of the real LOWER-HARM run. Every assertion here reads what the
 * real, unmodified pipeline produced; nothing is constructed by hand except
 * the negative cases that prove the blocker path is real.
 */
describe('D-116 WinnerRecord — projection of the real PRODUCTION run', () => {
  it('the real run carries a complete WinnerRecord whose fingerprints match the run itself', async () => {
    const r = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    expect(r.kind).toBe('RUN');
    if (r.kind !== 'RUN') return;
    expect(r.detail).toBeDefined();
    expect(r.winnerRecord?.kind).toBe('WINNER_RECORD');
    if (r.winnerRecord?.kind !== 'WINNER_RECORD') return;
    const w = r.winnerRecord;
    expect(w.winnerId).toBe(r.winner?.winnerId);
    expect(w.verdict).toBe('WINNER');
    expect(w.conjunctionOk).toBe(true);
    expect(w.conjuncts.map((c) => c.criterion)).toEqual(['G2_SEPARATES_TOP2', 'AGREES_WITH_PRE_EXPERIMENT_RANK', 'FAVOURED_CANDIDATE_PASSES_SAFETY_GATE']);
    expect(w.conjuncts.every((c) => c.held)).toBe(true);
    expect(w.fingerprints.recipeFingerprint).toBe(r.recipeFingerprint);
    expect(w.fingerprints.auditFingerprint).toBe(r.auditFingerprint);
    expect(w.fingerprints.runFingerprint).toBe(r.winner?.fingerprints.runFingerprint);
    expect(w.fingerprints.preregistrationFingerprint).toBe(r.winner?.fingerprints.preregistrationFingerprint);
    expect(w.recipe.recipeFingerprint).toBe(r.recipeFingerprint);
    expect(w.recipe.winnerRecordRef).toBe(w.winnerId);
    expect(w.observationCount).toBeGreaterThanOrEqual(3);
    expect(w.evidenceRefs.every((ref) => ref.startsWith('ctgov:NCT'))).toBe(true);
    expect(w.recipe.identifiers).toEqual([w.winnerId, ...w.evidence.map((e) => e.nctId)]);
    expect(w.disclosures.length).toBeGreaterThan(0);
    expect(Object.isFrozen(w)).toBe(true);
  });

  it('the governance gate outcome is recorded verbatim — a population-level intervention is REQUIRES_HUMAN_APPROVAL, never ACTIVATE', async () => {
    const r = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    if (r.kind !== 'RUN' || r.winnerRecord?.kind !== 'WINNER_RECORD') throw new Error('expected a WinnerRecord');
    expect(r.winnerRecord.gate.outcome).toBe('REQUIRES_HUMAN_APPROVAL');
    expect(r.winnerRecord.gate.failures).toEqual([]);
    expect(r.winnerRecord.gate.requiresCapability).toBe('candidate.activate');
    expect(r.winnerRecord.fingerprints.gateFingerprint).toBe(r.winnerRecord.gate.fingerprint);
  });

  it('the runner-up is disclosed with its own real refusal, not dropped', async () => {
    const r = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    if (r.kind !== 'RUN' || r.winnerRecord?.kind !== 'WINNER_RECORD') throw new Error('expected a WinnerRecord');
    expect(r.winnerRecord.runnerUp).not.toBeNull();
    expect(r.winnerRecord.runnerUp?.candidateId).not.toBe(r.winnerRecord.winnerId);
    expect(r.detail?.gateDecisions.length).toBe(2);
  });

  it('evidence custody on the record is FROZEN with the real sha256 of the pinned bytes', async () => {
    const r = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    if (r.kind !== 'RUN' || r.winnerRecord?.kind !== 'WINNER_RECORD') throw new Error('expected a WinnerRecord');
    expect(r.winnerRecord.evidenceCustody?.status).toBe('FROZEN');
    expect(r.winnerRecord.evidenceCustody?.hashPolicy).toBe('sha256');
    expect(r.winnerRecord.evidenceCustody?.hash).toBe(r.evidenceCustody?.record?.artifact?.hash);
  });

  it('the candidate space lists every ranked candidate with a real elimination reason for each non-qualifier, and the TOP2 are flagged', async () => {
    const r = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    if (r.kind !== 'RUN' || r.detail === undefined) throw new Error('expected detail');
    const d = r.detail;
    expect(d.candidates.length).toBeGreaterThanOrEqual(10);
    expect(d.candidates.filter((c) => !c.qualifies).every((c) => c.eliminationReason !== null && c.eliminationReason.length > 0)).toBe(true);
    expect(d.candidates.filter((c) => c.inTop2).map((c) => c.candidateId).sort()).toEqual([...d.top2Ids].sort());
    expect(d.top2Ids.length).toBe(2);
    expect(d.falsification?.outcome).toBe('EXPERIMENT_SELECTED');
    expect(d.falsification?.expectedByCandidate.map((e) => e.candidateId).sort()).toEqual([...d.top2Ids].sort());
  });

  it('is byte-stable across two independent runs (recordFingerprint), and its own fingerprint is recomputable from its content', async () => {
    const { ok, first, second } = await replayGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    expect(ok).toBe(true);
    if (first.kind !== 'RUN' || second.kind !== 'RUN') throw new Error('expected RUN');
    if (first.winnerRecord?.kind !== 'WINNER_RECORD' || second.winnerRecord?.kind !== 'WINNER_RECORD') throw new Error('expected WinnerRecord');
    expect(first.winnerRecord.recordFingerprint).toBe(second.winnerRecord.recordFingerprint);
    const { recordFingerprint, evidenceCustody, ...stable } = first.winnerRecord;
    const recomputed = fnv1a(canonicalJson({ ...stable, evidenceCustody: evidenceCustody === null ? null : { sourceId: evidenceCustody.sourceId, hash: evidenceCustody.hash, hashPolicy: evidenceCustody.hashPolicy, status: evidenceCustody.status } }));
    expect(recomputed).toBe(recordFingerprint);
  });

  it('the projection never changes the orchestrator\'s own audit trail (auditFingerprint = hash of the 20 stage records, as before)', async () => {
    const r = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    if (r.kind !== 'RUN') throw new Error('expected RUN');
    expect(r.auditFingerprint).toBe(fnv1a(canonicalJson(r.stages)));
    expect(r.stages.length).toBe(20);
  });

  it('SYNTHETIC_TEST_ONLY also yields a WinnerRecord, with custody honestly null and a SYNTH- winner id', async () => {
    const r = await runGovLowerHarmDiscovery({ mode: 'SYNTHETIC_TEST_ONLY' });
    if (r.kind !== 'RUN') throw new Error('expected RUN');
    expect(r.winnerRecord?.kind).toBe('WINNER_RECORD');
    if (r.winnerRecord?.kind !== 'WINNER_RECORD') return;
    expect(r.winnerRecord.mode).toBe('SYNTHETIC_TEST_ONLY');
    expect(r.winnerRecord.evidenceCustody).toBeNull();
    expect(r.winnerRecord.winnerId.startsWith('SYNTH-')).toBe(true);
  });

  it('E2E01 (a different domain, real NO_WINNER) carries no LOWER-HARM projection and no WinnerRecord', async () => {
    const r = await runGovE2E01Discovery({ mode: 'PRODUCTION' });
    if (r.kind !== 'RUN') throw new Error('expected RUN');
    expect('winnerRecord' in r ? r.winnerRecord : undefined).toBeUndefined();
  });
});

describe('D-116 NoWinnerBlocker — the exact stopping point is named, never a softened result', () => {
  it('a NO_WINNER verdict with a failed conjunct is blocked at ADJUDICATION_CONJUNCT', async () => {
    const r = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    if (r.kind !== 'RUN' || r.detail === undefined) throw new Error('expected RUN');
    const detail = { ...r.detail, conjuncts: r.detail.conjuncts.map((c, i) => (i === 1 ? { ...c, held: false } : c)) };
    const run = { ...r, verdict: 'NO_WINNER' as const, winner: undefined, recipeFingerprint: undefined };
    const b = buildLowerHarmWinnerRecord(run, detail, r.evidenceCustody);
    expect(b.kind).toBe('NO_WINNER_BLOCKER');
    if (b.kind !== 'NO_WINNER_BLOCKER') return;
    expect(b.blockedAt).toBe('ADJUDICATION_CONJUNCT');
    expect(b.failedConjuncts.map((c) => c.criterion)).toEqual(['AGREES_WITH_PRE_EXPERIMENT_RANK']);
  });

  it('a WINNER verdict that the promotion gate did not clear (no run.winner) is blocked at PROMOTION_GATE', async () => {
    const r = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    if (r.kind !== 'RUN' || r.detail === undefined) throw new Error('expected RUN');
    const b = buildLowerHarmWinnerRecord({ ...r, winner: undefined }, r.detail, r.evidenceCustody);
    expect(b.kind).toBe('NO_WINNER_BLOCKER');
    if (b.kind === 'NO_WINNER_BLOCKER') expect(b.blockedAt).toBe('PROMOTION_GATE');
  });

  it('a recipe whose fingerprint does not match the run is blocked at RECIPE_LOCKED — a record is never built over a mismatched recipe', async () => {
    const r = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    if (r.kind !== 'RUN' || r.detail === undefined) throw new Error('expected RUN');
    const b = buildLowerHarmWinnerRecord({ ...r, recipeFingerprint: 'deadbeef' }, r.detail, r.evidenceCustody);
    expect(b.kind).toBe('NO_WINNER_BLOCKER');
    if (b.kind === 'NO_WINNER_BLOCKER') expect(b.blockedAt).toBe('RECIPE_LOCKED');
  });

  it('a favoured candidate whose gate REFUSEs is blocked at SAFETY_GATE_REFUSE', async () => {
    const r = await runGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
    if (r.kind !== 'RUN' || r.detail === undefined || r.winner === undefined) throw new Error('expected RUN');
    const detail = { ...r.detail, gateDecisions: r.detail.gateDecisions.map((g) => (g.candidateId === r.winner?.winnerId ? { ...g, outcome: 'REFUSE' as const } : g)) };
    const b = buildLowerHarmWinnerRecord(r, detail, r.evidenceCustody);
    expect(b.kind).toBe('NO_WINNER_BLOCKER');
    if (b.kind === 'NO_WINNER_BLOCKER') expect(b.blockedAt).toBe('SAFETY_GATE_REFUSE');
  });
});
