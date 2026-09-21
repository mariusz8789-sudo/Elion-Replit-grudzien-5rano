import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildNarration, beatById, factsFromRun, IDLE_FACTS, type GuideFacts } from '../core/guide/narrationModel';
import { guideReducer, INITIAL_SESSION, pathFor, beatForState, tourHoldSeconds, type GuideSession } from '../core/guide/guideMachine';
import type { LowerHarmRunDetail, LowerHarmWinnerRecord } from '../core/orchestrator/winnerRecord';
import type { RunResult } from '../core/orchestrator/govLowerHarmDiscovery';

/**
 * D-119 — the guide never says what the run does not confirm. The model is
 * tested against the committed real-run artifact (artifacts/lower-harm/*):
 * numbers in sentences must be the artifact's numbers, a WINNER beat needs
 * a real WinnerRecord, and a blocker is narrated as a blocker.
 */
const ARTIFACT_DIR = new URL('../../../../artifacts/lower-harm/', import.meta.url);
const readJson = <T,>(name: string): T => JSON.parse(readFileSync(new URL(name, ARTIFACT_DIR), 'utf8')) as T;
const detail = readJson<LowerHarmRunDetail>('run-detail.json');
const record = readJson<LowerHarmWinnerRecord>('winner-record.json');
const replayArtifact = readJson<{ runA: { auditFingerprint: string; verdict: string; recipeFingerprint: string }; stages: RunResult['stages']; evidenceCustody: { ok: boolean; sourceId: string; hash: string; hashPolicy: string } }>('replay-verification.json');

const runLike = (over: Partial<RunResult> = {}): RunResult => ({
  kind: 'RUN', verdict: 'WINNER', mode: 'PRODUCTION', auditFingerprint: replayArtifact.runA.auditFingerprint, recipeFingerprint: replayArtifact.runA.recipeFingerprint,
  stages: replayArtifact.stages, detail, winnerRecord: record,
  evidenceCustody: { ok: true, sourceId: replayArtifact.evidenceCustody.sourceId, record: { artifact: { hash: replayArtifact.evidenceCustody.hash, hashPolicy: 'sha256' } } },
  ...over,
} as unknown as RunResult);

describe('factsFromRun', () => {
  it('projects the real WINNER run onto facts that match the artifact exactly', () => {
    const f = factsFromRun(runLike(), { ok: true } as never);
    expect(f.phase).toBe('DONE');
    expect(f.candidatesTotal).toBe(detail.candidates.length);
    expect(f.candidatesCleared).toBe(detail.candidates.filter((c) => c.qualifies).length);
    expect(f.observations).toBe(detail.evidence.length);
    expect(f.winnerName).toBe(record.candidateName);
    expect(f.conjuncts.every((c) => c.held)).toBe(true);
    expect(f.gateOutcome).toBe('REQUIRES_HUMAN_APPROVAL');
    expect(f.replay).toBe('MATCH');
    expect(f.custodyHash).toBe(replayArtifact.evidenceCustody.hash);
  });
  it('a blocked execution is a BLOCKED phase with the code, never a verdict', () => {
    const f = factsFromRun({ kind: 'EXECUTION_BLOCKED', code: 'CUSTODY', error: 'drift', fingerprint: 'x' } as never, null);
    expect(f.phase).toBe('BLOCKED');
    expect(f.executionBlocked).toContain('CUSTODY');
    expect(f.verdict).toBeNull();
  });
  it('a run in flight is RUNNING with no numbers to speak yet', () => {
    expect(factsFromRun(null, null, true).phase).toBe('RUNNING');
    expect(factsFromRun(null, null)).toEqual(IDLE_FACTS);
  });
});

describe('buildNarration — numbers come from facts, never from templates', () => {
  const facts = factsFromRun(runLike(), { ok: true } as never);

  it('speaks the artifact\'s own counts, names and verdict at every level and in both languages', () => {
    for (const level of ['EXPLORER', 'SCIENTIST', 'AUDITOR'] as const) {
      for (const lang of ['pl', 'en'] as const) {
        const beats = buildNarration(facts, { level, lang });
        expect(beats.map((b) => b.id)).toEqual(['intro', 'ask', 'running', 'candidates', 'evidence', 'falsification', 'gate', 'verdict', 'recipe', 'replay', 'world']);
        expect(beatById(beats, 'candidates')!.text).toContain(`${detail.candidates.length}`);
        expect(beatById(beats, 'evidence')!.text).toContain(`${detail.evidence.length}`);
        expect(beatById(beats, 'verdict')!.text).toContain(record.candidateName);
        expect(beatById(beats, 'gate')!.text).toContain(`${detail.conjuncts.length}`);
        for (const b of beats) { expect(b.text.length).toBeGreaterThan(10); expect(b.plain.length).toBeGreaterThan(10); }
      }
    }
  });

  it('changing a fact changes the sentence — proof the number is interpolated', () => {
    const altered: GuideFacts = { ...facts, candidatesTotal: 7, candidatesCleared: 3 };
    const text = beatById(buildNarration(altered, { level: 'EXPLORER', lang: 'pl' }), 'candidates')!.text;
    expect(text).toContain('7');
    expect(text).toContain('3');
    expect(text).not.toContain(`${detail.candidates.length} kandydatów`);
  });

  it('levels add detail without changing facts: AUDITOR names fingerprints, EXPLORER does not', () => {
    const explorer = beatById(buildNarration(facts, { level: 'EXPLORER', lang: 'pl' }), 'running')!.text;
    const auditor = beatById(buildNarration(facts, { level: 'AUDITOR', lang: 'pl' }), 'running')!.text;
    expect(auditor).toContain(replayArtifact.runA.auditFingerprint.slice(0, 8));
    expect(explorer).not.toContain(replayArtifact.runA.auditFingerprint.slice(0, 8));
    expect(auditor.startsWith(explorer.split('.')[0]!)).toBe(true);
  });

  it('a NO_WINNER run has no recipe beat and names its blocker; the winner sentence never appears', () => {
    const blocked: GuideFacts = { ...facts, verdict: 'NO_WINNER', winnerName: null, winnerId: null, blockedAt: 'SAFETY_GATE_REFUSE', blockedReason: 'synthetic', recipeFingerprint: null };
    const beats = buildNarration(blocked, { level: 'SCIENTIST', lang: 'pl' });
    expect(beats.some((b) => b.id === 'recipe')).toBe(false);
    const verdict = beatById(beats, 'verdict')!;
    expect(verdict.text).toContain('nie znalazł');
    expect(verdict.text).toContain('SAFETY_GATE_REFUSE');
    expect(verdict.text).not.toContain(record.candidateName);
  });

  it('a WINNER beat cannot be built without a WinnerRecord even if the verdict string says WINNER', () => {
    const lying: GuideFacts = { ...facts, winnerName: null, winnerId: null, recipeFingerprint: null };
    const beats = buildNarration(lying, { level: 'EXPLORER', lang: 'en' });
    expect(beatById(beats, 'verdict')!.text).not.toContain('found a candidate');
    expect(beats.some((b) => b.id === 'recipe')).toBe(false);
  });

  it('blocked execution narrates only intro, ask and the blocker', () => {
    const f = factsFromRun({ kind: 'EXECUTION_BLOCKED', code: 'CUSTODY', error: 'drift', fingerprint: 'x' } as never, null);
    const beats = buildNarration(f, { level: 'EXPLORER', lang: 'pl' });
    expect(beats.map((b) => b.id)).toEqual(['intro', 'ask', 'blocked']);
    expect(beatById(beats, 'blocked')!.text).toContain('CUSTODY');
  });

  it('the running beat exists while the run is in flight, with no counts', () => {
    const beats = buildNarration(factsFromRun(null, null, true), { level: 'EXPLORER', lang: 'en' });
    expect(beats.map((b) => b.id)).toEqual(['intro', 'ask', 'running']);
    expect(beatById(beats, 'running')!.text).not.toMatch(/\d/);
  });

  it('replay DRIFT is spoken as distrust, never as MATCH', () => {
    const drift: GuideFacts = { ...facts, replay: 'DRIFT' };
    const text = beatById(buildNarration(drift, { level: 'EXPLORER', lang: 'en' }), 'replay')!.text;
    expect(text).toContain('does not match');
    expect(text).not.toContain('matches');
  });
});

describe('guideMachine — transitions follow the facts', () => {
  const facts = factsFromRun(runLike(), { ok: true } as never);

  it('the WINNER path includes RECIPE, the NO_WINNER path does not, a blocked run goes to BLOCKED', () => {
    expect(pathFor(facts)).toEqual(['INTRO', 'ASK', 'RUNNING', 'CANDIDATES', 'EVIDENCE', 'FALSIFICATION', 'GATE', 'VERDICT', 'RECIPE', 'REPLAY', 'WORLD', 'DONE']);
    expect(pathFor({ ...facts, winnerName: null, recipeFingerprint: null })).not.toContain('RECIPE');
    expect(pathFor(factsFromRun({ kind: 'EXECUTION_BLOCKED', code: 'X', error: 'e', fingerprint: 'f' } as never, null))).toEqual(['INTRO', 'ASK', 'RUNNING', 'BLOCKED', 'DONE']);
  });

  it('ASK never advances by itself — only a real RUN_STARTED moves the guide on', () => {
    let s = guideReducer(INITIAL_SESSION, { type: 'START', mode: 'GUIDED' }, IDLE_FACTS);
    s = guideReducer(s, { type: 'NEXT' }, IDLE_FACTS);
    expect(s.state).toBe('ASK');
    s = guideReducer(s, { type: 'NEXT' }, IDLE_FACTS);
    expect(s.state).toBe('ASK');
    s = guideReducer(s, { type: 'RUN_STARTED' }, factsFromRun(null, null, true));
    expect(s.state).toBe('RUNNING');
    s = guideReducer(s, { type: 'NEXT' }, factsFromRun(null, null, true));
    expect(s.state).toBe('RUNNING'); // still computing: nothing to narrate yet
    s = guideReducer(s, { type: 'RUN_FINISHED' }, facts);
    expect(s.state).toBe('CANDIDATES');
  });

  it('RUN_FINISHED lands on the first narrated step even when RUNNING was never observed (the pipeline can finish within one frame)', () => {
    const s = guideReducer({ ...INITIAL_SESSION, state: 'ASK' }, { type: 'RUN_FINISHED' }, facts);
    expect(s.state).toBe('CANDIDATES');
    const blocked = guideReducer({ ...INITIAL_SESSION, state: 'ASK' }, { type: 'RUN_BLOCKED' }, IDLE_FACTS);
    expect(blocked.state).toBe('BLOCKED');
  });

  it('walks the whole WINNER path with NEXT, BACK returns, REPEAT bumps the utterance only, STOP resets', () => {
    let s: GuideSession = { ...INITIAL_SESSION, state: 'CANDIDATES' };
    const seen: string[] = [];
    for (let i = 0; i < 12 && s.state !== 'DONE'; i++) { seen.push(s.state); s = guideReducer(s, { type: 'NEXT' }, facts); }
    expect(seen).toEqual(['CANDIDATES', 'EVIDENCE', 'FALSIFICATION', 'GATE', 'VERDICT', 'RECIPE', 'REPLAY', 'WORLD']);
    const back = guideReducer({ ...INITIAL_SESSION, state: 'GATE' }, { type: 'BACK' }, facts);
    expect(back.state).toBe('FALSIFICATION');
    const rep = guideReducer({ ...INITIAL_SESSION, state: 'GATE' }, { type: 'REPEAT' }, facts);
    expect(rep.state).toBe('GATE'); expect(rep.utterance).toBe(1);
    expect(guideReducer(rep, { type: 'STOP' }, facts).state).toBe('IDLE');
  });

  it('every narrated state maps to a beat and has a positive tour hold', () => {
    for (const st of pathFor(facts)) {
      if (st === 'DONE') continue;
      expect(beatForState(st)).not.toBeNull();
      expect(tourHoldSeconds(st)).toBeGreaterThan(0);
    }
  });
});
