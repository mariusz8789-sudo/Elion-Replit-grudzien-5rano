import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDiscoveryHallSequence, type HallRunView } from '../core/three/discoveryHallSequence';
import type { LowerHarmRunDetail, LowerHarmWinnerRecord, NoWinnerBlocker } from '../core/orchestrator/winnerRecord';

/**
 * D-117 — the Discovery Hall narrates the committed real run. The shot
 * builder is pure, so it is tested against artifacts/lower-harm/* exactly
 * like the other visual projections: every line it emits must be traceable
 * to a value the pipeline recorded.
 */
const ARTIFACT_DIR = new URL('../../../../artifacts/lower-harm/', import.meta.url);
const readJson = <T,>(name: string): T => JSON.parse(readFileSync(new URL(name, ARTIFACT_DIR), 'utf8')) as T;
const detail = readJson<LowerHarmRunDetail>('run-detail.json');
const record = readJson<LowerHarmWinnerRecord>('winner-record.json');
const replay = readJson<{ runA: { auditFingerprint: string; verdict: string }; stages: HallRunView['stages']; evidenceCustody: { ok: boolean; sourceId: string; hash: string; hashPolicy: string } | null }>('replay-verification.json');

const view: HallRunView = {
  mode: 'PRODUCTION',
  verdict: replay.runA.verdict,
  auditFingerprint: replay.runA.auditFingerprint,
  stages: replay.stages,
  evidenceCustody: replay.evidenceCustody === null ? null : { ok: replay.evidenceCustody.ok, sourceId: replay.evidenceCustody.sourceId, record: { artifact: { hash: replay.evidenceCustody.hash, hashPolicy: replay.evidenceCustody.hashPolicy } } },
  detail,
  winnerRecord: record,
};

describe('buildDiscoveryHallSequence', () => {
  it('produces the five shots in narrative order, each on one of the lab\'s existing camera kinds', () => {
    const shots = buildDiscoveryHallSequence(view);
    expect(shots.map((s) => s.id)).toEqual(['opening', 'evidence', 'falsification', 'gate', 'verdict']);
    expect(shots.map((s) => s.kind)).toEqual(['WIDE', 'SCIENTIFIC', 'ANOMALY', 'REPLAY', 'WIDE']);
    for (const s of shots) { expect(s.holdSeconds).toBeGreaterThan(0); expect(s.lines.length).toBeGreaterThan(0); }
  });

  it('every number on screen is the run\'s own: audit fingerprint, custody hash, observation count, G2 numbers, conjuncts, record fingerprint', () => {
    const text = buildDiscoveryHallSequence(view).flatMap((s) => [s.title, ...s.lines]).join('\n');
    expect(text).toContain(replay.runA.auditFingerprint.slice(0, 10));
    expect(text).toContain(replay.evidenceCustody!.hash.slice(0, 16));
    expect(text).toContain(`${detail.evidence.length} real observations`);
    expect(text).toContain(detail.falsification!.observableId!);
    for (const e of detail.falsification!.expectedByCandidate) expect(text).toContain(e.candidateId);
    for (const c of detail.conjuncts) expect(text).toContain(`${c.held ? 'HELD' : 'FAILED'} · ${c.criterion.toLowerCase().replace(/_/g, ' ')}`);
    expect(text).toContain(`WINNER — ${record.candidateName}`);
    expect(text).toContain(record.recordFingerprint);
    expect(text).toContain('nothing is activated by this system');
  });

  it('a NO_WINNER run ends on the blocker, never on an invented winner', () => {
    const blocker: NoWinnerBlocker = { kind: 'NO_WINNER_BLOCKER', blockedAt: 'SAFETY_GATE_REFUSE', verdict: 'NO_WINNER', failedConjuncts: [], refusedGates: [], stageNote: null, reason: 'synthetic' };
    const shots = buildDiscoveryHallSequence({ ...view, verdict: 'NO_WINNER', winnerRecord: blocker });
    const last = shots[shots.length - 1]!;
    expect(last.title).toBe('NO_WINNER');
    expect(last.lines[0]).toBe('Blocked at SAFETY_GATE_REFUSE');
    expect(last.lines.join(' ')).not.toContain('WINNER —');
  });

  it('a run without detail or custody says so on the shot instead of inventing content', () => {
    const shots = buildDiscoveryHallSequence({ mode: 'PRODUCTION', verdict: 'NO_WINNER', auditFingerprint: 'abc', stages: [], evidenceCustody: null });
    expect(shots[1]!.lines).toEqual(['Custody gate: not recorded for this run']);
    expect(shots[2]!.lines).toEqual(['No TOP2 pair reached the falsification stage']);
    expect(shots[3]!.lines).toEqual(['Winner Gate detail not available']);
    expect(shots[4]!.lines).toEqual(['No WinnerRecord was built for this run']);
  });
});
