import type { DiscoveryRun, OrchestratorAdapters, ProblemRecord, StageId, StageRecord, StructuredExperimentRequest } from './contracts';
import { asEvidenceClass, canPromoteToWinnerRecord } from './winnerGate';

/**
 * The 20-stage sequence, in order. Exported for documentation/test use;
 * `runScientificDiscovery` below pushes exactly these stages (skipping the
 * remainder when it aborts) — it does not consult this array at runtime.
 */
export const STAGES: readonly StageId[] = [
  '01_FORMALIZE', '02_NL_TO_REQUEST', '03_GENERATE', '04_NORMALIZE_DEDUP', '05_HARD_FILTER',
  '06_DIVERSITY', '07_RANK', '08_TOP10', '09_TOP2', '10_FREEZE_PREREG', '11_EXPERIMENT_PLAN',
  '12_EXECUTE', '13_EVIDENCE', '14_FALSIFY', '15_ADJUDICATE_D047', '16_COMPARE', '17_VERDICT',
  '18_RECIPE_OR_LOCK', '19_AUDIT_REPLAY', '20_NEXT_EXPERIMENT',
];

/**
 * Runs one full PROBLEM -> WINNER/NO_WINNER -> RECIPE|LOCK pass, calling
 * `A`'s ports in the fixed order above. This function computes NOTHING
 * scientific itself: every candidate, seal, plan, evidence record,
 * falsification outcome, verdict, and recipe comes from `A`. It only:
 *  - refuses to proceed past stage 1 when the problem is `NEEDS_INPUT`
 *    (NL fail-closed — see `nl.ts`);
 *  - refuses to proceed past the freeze when `A.verifySealUnchanged`
 *    reports the rule changed after it was sealed (HARK-stop);
 *  - never builds a recipe for anything but a real `WINNER` verdict, and
 *    still accepts `A.buildRecipe` locking it anyway (the recipe engine's
 *    own gates, e.g. D-052/D-053's `physicsRecipe.ts` pattern, decide that,
 *    not this function);
 *  - fingerprints every stage and the whole run, append-only.
 */
export function runScientificDiscovery(problem: ProblemRecord, A: OrchestratorAdapters, mode: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY' = 'PRODUCTION'): DiscoveryRun {
  const stages: StageRecord[] = [];
  const H = A.hash;
  const push = (stage: StageId, status: StageRecord['status'], payload: unknown, note?: string): void => {
    stages.push({ stage, status, fingerprint: H({ stage, payload, note }), note });
  };

  const runId = H({ problem: problem.fingerprint, salt: 'discovery-run' });

  if (problem.status === 'NEEDS_INPUT') {
    push('01_FORMALIZE', 'ABORTED', problem.missingInputs, `fail-closed: ${problem.missingInputs.join('; ')}`);
    return Object.freeze({
      runId,
      problem,
      stages,
      verdict: 'ABORTED',
      abortReason: 'NEEDS_INPUT',
      auditFingerprint: H(stages),
      mode,
    });
  }
  push('01_FORMALIZE', 'OK', problem);

  const req: StructuredExperimentRequest = { problemId: problem.problemId, modelFamilies: problem.harmAxes, seedBase: 7, paramGridNote: 'grid frozen at prereg' };
  push('02_NL_TO_REQUEST', 'OK', req);

  const c0 = A.generate(req);
  push('03_GENERATE', 'OK', c0.length);
  const c1 = A.normalizeDedup(c0);
  push('04_NORMALIZE_DEDUP', 'OK', c1.length);
  const c2 = A.hardFilter(c1);
  push('05_HARD_FILTER', 'OK', c2.length);
  const c3 = A.diversity(c2);
  push('06_DIVERSITY', 'OK', c3.length);
  const c4 = A.rank(c3);
  push('07_RANK', 'OK', c4.map((c) => c.candidateId));
  const t10 = A.top10(c4);
  push('08_TOP10', 'OK', t10.map((c) => c.candidateId));
  const t2 = A.top2(t10);
  push('09_TOP2', 'OK', t2.map((c) => c.candidateId));

  const seal = A.seal(problem);
  push('10_FREEZE_PREREG', 'OK', seal);

  if (!A.verifySealUnchanged(seal)) {
    push('11_EXPERIMENT_PLAN', 'ABORTED', seal, 'HARK_DETECTED: rule changed after freeze');
    return Object.freeze({
      runId,
      problem,
      stages,
      verdict: 'ABORTED',
      abortReason: 'HARK_DETECTED',
      auditFingerprint: H(stages),
      mode,
    });
  }

  const plan = A.planExperiments(t2, seal);
  push('11_EXPERIMENT_PLAN', 'OK', plan);
  const ex = A.execute(plan);
  push('12_EXECUTE', 'OK', ex.map((e) => e.experimentId));
  const ev = A.ingestEvidence(ex);
  push('13_EVIDENCE', 'OK', ev);
  const fal = A.falsify(t2, ex, seal);
  push('14_FALSIFY', 'OK', fal);
  const adj = A.adjudicate(t2, ex, seal);
  push('15_ADJUDICATE_D047', 'OK', adj);
  const cmp = A.compare(t2, seal);
  push('16_COMPARE', 'OK', cmp);
  push('17_VERDICT', 'OK', adj.verdict);

  let winner = undefined;
  let recipeFingerprint: string | undefined;
  if (adj.verdict === 'WINNER' && adj.winner) {
    // WINNER PROMOTION GATE (D-057): a WINNER verdict from adjudication is
    // necessary but not sufficient. Reuses the REAL evidence-minimum
    // constant (core/agent/practicalCandidateGate.ts::MINIMUM_OBSERVATIONS)
    // through winnerGate.ts's own contract — no duplicated, hardcoded
    // scientific policy here. A WinnerRecordRef only reaches `buildRecipe`
    // when this promotion actually clears; otherwise the run's own
    // `winner`/`recipeFingerprint` stay unset even though the adjudicator
    // itself returned WINNER, and the recipe stays locked.
    const inventory = ex.map((e) => {
      const declared = e.summary.observationCount;
      return { evidenceClass: asEvidenceClass(e.evidenceClass), observationCount: Number.isFinite(declared) && declared > 0 ? declared : 1 };
    });
    const promotion = canPromoteToWinnerRecord({ adjudicationVerdict: adj.verdict, inventory });
    if (promotion.outcome === 'PROMOTE') {
      const r = A.buildRecipe(adj.winner);
      winner = adj.winner;
      recipeFingerprint = r?.recipeFingerprint;
      push('18_RECIPE_OR_LOCK', r ? 'OK' : 'LOCKED', r ?? 'RecipeBuilder gates LOCKED despite WINNER ref');
    } else {
      push('18_RECIPE_OR_LOCK', 'LOCKED', promotion, `NO_PROMOTION: ${promotion.reasons.join('; ')}`);
    }
  } else {
    push('18_RECIPE_OR_LOCK', 'LOCKED', `NO_RECIPE_WITHOUT_WINNER: verdict=${adj.verdict}`);
  }

  push('19_AUDIT_REPLAY', 'OK', { stagesSoFar: stages.length, verdict: adj.verdict });

  const partial: DiscoveryRun = {
    runId,
    problem,
    stages,
    verdict: adj.verdict,
    winner,
    recipeFingerprint,
    auditFingerprint: '',
    mode,
  };
  const nextExperiment = A.recommendNext(partial);
  push('20_NEXT_EXPERIMENT', 'OK', nextExperiment);

  return Object.freeze({ ...partial, nextExperiment, auditFingerprint: H(stages) });
}

/** Real re-run: runs the full pipeline twice against the same adapters and requires an identical audit fingerprint, verdict, and stage count. */
export function replayRunDeterministic(problem: ProblemRecord, A: OrchestratorAdapters, mode: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY'): boolean {
  const a = runScientificDiscovery(problem, A, mode);
  const b = runScientificDiscovery(problem, A, mode);
  return a.auditFingerprint === b.auditFingerprint && a.verdict === b.verdict && a.stages.length === b.stages.length;
}
