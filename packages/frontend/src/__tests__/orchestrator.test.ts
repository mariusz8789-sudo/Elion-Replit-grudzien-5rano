import { describe, expect, it } from 'vitest';
import { canonicalJson, fnv1a } from '../core/events/hash';
import { runScientificDiscovery, replayRunDeterministic } from '../core/orchestrator/orchestrator';
import { parseProblem } from '../core/orchestrator/nl';
import type { Candidate, OrchestratorAdapters, ProblemRecord, Verdict, WinnerRecordRef } from '../core/orchestrator/contracts';

/**
 * GENESIS RESEARCH ORCHESTRATOR — vitest port of the source bundle's
 * `orchestratorTests()` (docs/DECISIONS.md D-055). Negative-first, with
 * SYNTHETIC adapters only — this file never calls any real Genesis
 * ranking/adjudication/falsification module, matching the orchestrator's
 * own "sequencing only" contract.
 */

const H = (v: unknown): string => fnv1a(canonicalJson(v));

function toyCandidates(n: number): readonly Candidate[] {
  return Array.from({ length: n }, (_, i) => ({
    candidateId: `C${i}`,
    mechanismClass: `M${i % 6}`,
    score: 1 - i * 0.03,
    riskGrade: i % 4 === 0 ? 'VETO' : 'LOW',
    evidenceRefs: [`r${i}`],
  }));
}

const WINNER_REF: WinnerRecordRef = {
  winnerId: 'W1',
  verdict: 'WINNER',
  conjunctionOk: true,
  fingerprints: { g: '1', r: '1', e: '1', v: '1', a: '1' },
};

function mkAdapters(verdict: Verdict, opts: { readonly hark?: boolean; readonly recipeNull?: boolean; readonly weakEvidence?: boolean } = {}): OrchestratorAdapters {
  return {
    generate: () => toyCandidates(24),
    normalizeDedup: (cs) => cs.slice(0, 20),
    hardFilter: (cs) => cs.filter((c) => c.riskGrade !== 'VETO'),
    diversity: (cs) => cs,
    rank: (cs) => [...cs].sort((a, b) => b.score - a.score),
    top10: (cs) => cs.slice(0, 10),
    top2: (cs) => cs.slice(0, 2),
    seal: (p) => ({ decisionRule: 'frozen', falsificationCriteria: 'frozen', evidenceMinimum: p.evidenceMinimum, comparisonRule: 'frozen', sealFingerprint: H(p), sealedAt: '1970' }),
    verifySealUnchanged: () => !opts.hark,
    planExperiments: (t2) => t2.map((c) => `exp-${c.candidateId}`),
    // Winner Promotion Gate (D-057) needs real evidence behind a WINNER verdict to
    // actually promote: by default this fixture supplies enough (DIRECT_RANDOMISED,
    // 3+ observations) to clear core/agent/practicalCandidateGate.ts's real
    // MINIMUM_OBSERVATIONS. `weakEvidence` reverts to the old thin (2x1,
    // SYNTHETIC_TEST_ONLY) shape to exercise NO_PROMOTION despite a WINNER verdict.
    execute: (plan) => plan.map((p, i) => ({
      experimentId: p,
      evidenceClass: opts.weakEvidence ? 'SYNTHETIC_TEST_ONLY' : 'DIRECT_RANDOMISED',
      summary: { v: 1, observationCount: opts.weakEvidence ? 1 : (i === 0 ? 2 : 1) },
    })),
    ingestEvidence: (ex) => ex.map((_, i) => ({ ref: `e${i}`, provenance: 'synthetic' })),
    falsify: (t2) => ({ survived: t2.map(() => true), note: 'synthetic' }),
    adjudicate: () => (verdict === 'WINNER' ? { verdict, winner: WINNER_REF } : { verdict }),
    compare: () => 'synthetic-comparison',
    buildRecipe: (w) => (opts.recipeNull ? null : { recipeFingerprint: H(w) }),
    recommendNext: (r) => `next: ${r.verdict}`,
    hash: H,
  };
}

const goodProblem = (): ProblemRecord =>
  parseProblem(
    'P1',
    {
      text: 'Find a strategy with a better benefit-risk profile at preserved efficacy.',
      objectives: [
        { metric: 'efficacy_delta_pp', direction: 'maximize', floor: -0.1 },
        { metric: 'severe_ae_rr', direction: 'minimize' },
      ],
      constraints: ['legal', 'feasible'],
      harmAxes: ['safety', 'dependence'],
      evidenceMinimum: '>=1 DIRECT_RCT',
    },
    H,
  );

describe('parseProblem — NL fail-closed', () => {
  it('a vague NL input with no objectives/evidenceMinimum ⇒ NEEDS_INPUT', () => {
    const vague = parseProblem('P0', { text: 'find something better' }, H);
    expect(vague.status).toBe('NEEDS_INPUT');
    expect(vague.missingInputs.length).toBeGreaterThan(0);
  });

  it('a fully specified NL input ⇒ FORMALIZED', () => {
    expect(goodProblem().status).toBe('FORMALIZED');
  });
});

describe('runScientificDiscovery — fail-closed, HARK-stop, recipe gate', () => {
  it('NEEDS_INPUT problem aborts at stage 1, never reaches generation', () => {
    const vague = parseProblem('P0', { text: 'find something better' }, H);
    const run = runScientificDiscovery(vague, mkAdapters('NO_WINNER'));
    expect(run.verdict).toBe('ABORTED');
    expect(run.abortReason).toBe('NEEDS_INPUT');
    expect(run.stages[0]!.status).toBe('ABORTED');
    expect(run.stages.length).toBe(1);
  });

  it('NO_WINNER ⇒ recipe LOCKED, no fingerprint', () => {
    const run = runScientificDiscovery(goodProblem(), mkAdapters('NO_WINNER'));
    expect(run.verdict).toBe('NO_WINNER');
    expect(run.stages.find((s) => s.stage === '18_RECIPE_OR_LOCK')?.status).toBe('LOCKED');
    expect(run.recipeFingerprint).toBeUndefined();
  });

  it('CONFLICTING_EVIDENCE ⇒ recipe LOCKED', () => {
    const run = runScientificDiscovery(goodProblem(), mkAdapters('CONFLICTING_EVIDENCE'));
    expect(run.verdict).toBe('CONFLICTING_EVIDENCE');
    expect(run.stages.find((s) => s.stage === '18_RECIPE_OR_LOCK')?.status).toBe('LOCKED');
  });

  it('WINNER with sufficient real evidence ⇒ promotion gate PROMOTEs, RecipeBuilder called, recipe fingerprint present, all 20 stages logged', () => {
    const run = runScientificDiscovery(goodProblem(), mkAdapters('WINNER'));
    expect(run.verdict).toBe('WINNER');
    expect(run.winner).toBeDefined();
    expect(run.recipeFingerprint).toBeDefined();
    expect(run.stages.length).toBe(20);
  });

  it('WINNER verdict but insufficient observations ⇒ D-057 promotion gate refuses, recipe stays LOCKED and no winner is exposed (adjudication alone is never sufficient)', () => {
    const run = runScientificDiscovery(goodProblem(), mkAdapters('WINNER', { weakEvidence: true }));
    expect(run.verdict).toBe('WINNER');
    expect(run.winner).toBeUndefined();
    expect(run.recipeFingerprint).toBeUndefined();
    expect(run.stages.find((s) => s.stage === '18_RECIPE_OR_LOCK')?.status).toBe('LOCKED');
    expect(run.stages.find((s) => s.stage === '18_RECIPE_OR_LOCK')?.note).toMatch(/NO_PROMOTION/);
  });

  it('RecipeBuilder\'s own internal gates can still LOCK a WINNER ref (never bypassed)', () => {
    const run = runScientificDiscovery(goodProblem(), mkAdapters('WINNER', { recipeNull: true }));
    expect(run.stages.find((s) => s.stage === '18_RECIPE_OR_LOCK')?.status).toBe('LOCKED');
    expect(run.recipeFingerprint).toBeUndefined();
  });

  it('a rule changed after freeze ⇒ HARK_DETECTED abort, never a silent continue', () => {
    const run = runScientificDiscovery(goodProblem(), mkAdapters('WINNER', { hark: true }));
    expect(run.verdict).toBe('ABORTED');
    expect(run.abortReason).toBe('HARK_DETECTED');
    expect(run.stages.find((s) => s.stage === '11_EXPERIMENT_PLAN')?.status).toBe('ABORTED');
  });

  it('full-run replay is deterministic (identical audit fingerprint, verdict, stage count)', () => {
    expect(replayRunDeterministic(goodProblem(), mkAdapters('NO_WINNER'), 'SYNTHETIC_TEST_ONLY')).toBe(true);
  });

  it('every stage and the whole run carry non-empty fingerprints (append-only audit)', () => {
    const run = runScientificDiscovery(goodProblem(), mkAdapters('NO_WINNER'));
    expect(run.stages.every((s) => s.fingerprint.length > 0)).toBe(true);
    expect(run.auditFingerprint.length).toBeGreaterThan(0);
  });

  it('the run is frozen (immutable)', () => {
    const run = runScientificDiscovery(goodProblem(), mkAdapters('NO_WINNER'));
    expect(Object.isFrozen(run)).toBe(true);
  });

  it('mode is carried through unchanged (PRODUCTION vs SYNTHETIC_TEST_ONLY)', () => {
    const run = runScientificDiscovery(goodProblem(), mkAdapters('NO_WINNER'), 'SYNTHETIC_TEST_ONLY');
    expect(run.mode).toBe('SYNTHETIC_TEST_ONLY');
  });
});
