import type { BeatId, GuideFacts } from './narrationModel';

/**
 * GUIDE STATE MACHINE (D-119) — pure and deterministic. Transitions depend
 * only on the facts of the current run: RECIPE exists only for a real
 * WinnerRecord, BLOCKED only for an EXECUTION_BLOCKED result, and nothing
 * here can invent a step the run did not produce. Two modes: GUIDED (the
 * person advances; the guide waits) and TOUR (an autonomous clock advances).
 */

export type GuideState = 'IDLE' | 'INTRO' | 'ASK' | 'RUNNING' | 'BLOCKED' | 'CANDIDATES' | 'EVIDENCE' | 'FALSIFICATION' | 'GATE' | 'VERDICT' | 'RECIPE' | 'REPLAY' | 'WORLD' | 'DONE';
export type GuideMode = 'GUIDED' | 'TOUR';

export interface GuideSession {
  readonly mode: GuideMode;
  readonly state: GuideState;
  /** How many times the current beat was (re)spoken — "repeat" bumps it without a transition. */
  readonly utterance: number;
}

export type GuideEvent =
  | { readonly type: 'START'; readonly mode: GuideMode }
  | { readonly type: 'NEXT' }
  | { readonly type: 'BACK' }
  | { readonly type: 'RUN_STARTED' }
  | { readonly type: 'RUN_FINISHED' }
  | { readonly type: 'RUN_BLOCKED' }
  | { readonly type: 'REPEAT' }
  | { readonly type: 'STOP' };

export const INITIAL_SESSION: GuideSession = { mode: 'GUIDED', state: 'IDLE', utterance: 0 };

/** The linear path this run supports, computed from facts alone. */
export function pathFor(facts: GuideFacts): readonly GuideState[] {
  const head: GuideState[] = ['INTRO', 'ASK'];
  if (facts.phase === 'IDLE') return [...head];
  if (facts.phase === 'RUNNING') return [...head, 'RUNNING'];
  if (facts.phase === 'BLOCKED') return [...head, 'RUNNING', 'BLOCKED', 'DONE'];
  const tail: GuideState[] = ['RUNNING'];
  if (facts.candidatesTotal > 0) tail.push('CANDIDATES');
  if (facts.observations > 0) tail.push('EVIDENCE');
  if (facts.conjuncts.length > 0) tail.push('FALSIFICATION', 'GATE');
  tail.push('VERDICT');
  if (facts.winnerName !== null && facts.recipeFingerprint !== null) tail.push('RECIPE');
  tail.push('REPLAY', 'WORLD', 'DONE');
  return [...head, ...tail];
}

export function beatForState(state: GuideState): BeatId | null {
  switch (state) {
    case 'INTRO': return 'intro';
    case 'ASK': return 'ask';
    case 'RUNNING': return 'running';
    case 'BLOCKED': return 'blocked';
    case 'CANDIDATES': return 'candidates';
    case 'EVIDENCE': return 'evidence';
    case 'FALSIFICATION': return 'falsification';
    case 'GATE': return 'gate';
    case 'VERDICT': return 'verdict';
    case 'RECIPE': return 'recipe';
    case 'REPLAY': return 'replay';
    case 'WORLD': return 'world';
    default: return null;
  }
}

export function guideReducer(session: GuideSession, event: GuideEvent, facts: GuideFacts): GuideSession {
  const path = pathFor(facts);
  const at = path.indexOf(session.state);
  switch (event.type) {
    case 'START':
      return { mode: event.mode, state: 'INTRO', utterance: 0 };
    case 'STOP':
      return { ...session, state: 'IDLE', utterance: 0 };
    case 'REPEAT':
      return session.state === 'IDLE' ? session : { ...session, utterance: session.utterance + 1 };
    case 'RUN_STARTED':
      return session.state === 'IDLE' || session.state === 'DONE' ? session : { ...session, state: 'RUNNING', utterance: 0 };
    case 'RUN_BLOCKED':
      return session.state === 'IDLE' ? session : { ...session, state: 'BLOCKED', utterance: 0 };
    case 'RUN_FINISHED': {
      if (session.state === 'IDLE') return session;
      const next = path[path.indexOf('RUNNING') + 1] ?? 'DONE';
      return { ...session, state: next, utterance: 0 };
    }
    case 'NEXT': {
      if (session.state === 'IDLE') return session;
      if (session.state === 'DONE') return session;
      // ASK never advances on its own: the run must actually start (RUN_STARTED) — the guide cannot skip the science.
      if (session.state === 'ASK') return session;
      if (session.state === 'RUNNING' && facts.phase === 'RUNNING') return session;
      const next = at >= 0 ? (path[at + 1] ?? 'DONE') : 'DONE';
      return { ...session, state: next, utterance: 0 };
    }
    case 'BACK': {
      if (at <= 0) return session;
      return { ...session, state: path[at - 1]!, utterance: 0 };
    }
    default:
      return session;
  }
}

/** Seconds a TOUR holds a state before advancing on its own (reading time + visual). */
export function tourHoldSeconds(state: GuideState): number {
  switch (state) {
    case 'INTRO': return 7;
    case 'ASK': return 8;
    case 'RUNNING': return 6;
    case 'BLOCKED': return 8;
    case 'CANDIDATES': return 10;
    case 'EVIDENCE': return 10;
    case 'FALSIFICATION': return 10;
    case 'GATE': return 12;
    case 'VERDICT': return 10;
    case 'RECIPE': return 9;
    case 'REPLAY': return 9;
    case 'WORLD': return 5;
    default: return 0;
  }
}
