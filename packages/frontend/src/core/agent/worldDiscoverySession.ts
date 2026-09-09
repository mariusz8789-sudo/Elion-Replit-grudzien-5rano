import type { ReplayVerdict } from '../matrixFoundation/replayVerdict';
import {
  buildActionComparisonEvidenceBundle,
  buildSavedWorldDiscoveryRun,
  buildWorldDiscoveryEvidenceBundle,
  listExperiments,
  replaySavedWorldDiscoveryRun,
  saveWorldDiscoveryRunToMemory,
  type SavedWorldDiscoveryReplay,
} from '../scienceMemory';
import { compareWorldActions, type CrossActionComparison } from './crossActionComparison';
import {
  runAutonomousDiscovery,
  runAutonomousDiscoveryWithEngines,
  type DiscoveryLoopInput,
  type DiscoveryLoopResult,
} from './discoveryLoop';
import { renderDiscoveryReport } from './discoveryReport';
import {
  buildWorldDiscoveryPlan,
  GENESIS_FLOOD_CATALOG,
  parseWorldDiscoveryGoal,
  resolveWorldLeverCatalog,
  type WorldGoalIntent,
  type WorldLeverCatalog,
} from './worldGoalIntent';

/**
 * ONE CALL FROM A GOAL SENTENCE TO A FINISHED SEARCH.
 *
 * The parser, the planner, the loop and the report already exist and are
 * already tested. What was missing was a single seam a UI can call without
 * knowing about any of them — because a screen that called them in sequence
 * itself would end up owning the order, the refusal handling and the
 * semantics, and would become a second place where discovery logic lives.
 *
 * So this is a seam, not a stage: it holds no scientific rule of its own. It
 * decides nothing about hypotheses, runs no physics, and invents no fallback
 * when a goal cannot be read. Every outcome below is either the planner's own
 * refusal or the loop's own result, passed through.
 */

export const WORLD_DISCOVERY_SESSION_CONTRACT_VERSION = '1.0.0';

/**
 * The result of asking Genesis to search. Deliberately a discriminated union:
 * a refusal is a real outcome with its own shape, not a `COMPLETE` with empty
 * fields, so a caller cannot render one as the other by forgetting a check.
 */
/**
 * Phrases that ask "which of these should we do", rather than "does this work".
 *
 * The two questions want different engines: a comparison ranks every declared
 * action against one control, while the discovery loop tests mechanisms one at
 * a time and can abandon or consolidate them. Routing on the goal's own wording
 * is deliberate and narrow — an unrecognised sentence goes to the loop, which
 * is the conservative default because it never claims an ordering.
 */
const COMPARISON_PHRASES: readonly string[] = [
  'available intervention',
  'available action',
  'available option',
  'available lever',
  'all interventions',
  'all actions',
  'every intervention',
  'which intervention',
  'which action',
  'compare',
  'best intervention',
  'best action',
  'rank',
  'dostępnych interwencji',
  'dostepnych interwencji',
  'dostępne interwencje',
  'dostepne interwencje',
  'wszystkie interwencje',
  'porównaj',
  'porownaj',
  'która interwencja',
  'ktora interwencja',
];

/** True when the goal asks to compare actions rather than to test one mechanism. */
export function goalAsksForComparison(goal: string): boolean {
  const text = goal.toLowerCase();
  return COMPARISON_PHRASES.some((phrase) => text.includes(phrase));
}

export type WorldDiscoveryState =
  | { readonly kind: 'IDLE' }
  | { readonly kind: 'RUNNING'; readonly goal: string }
  | {
      readonly kind: 'REFUSED';
      readonly goal: string;
      /** The planner's own words. Never rewritten here. */
      readonly error: string;
      readonly intent: WorldGoalIntent;
    }
  | {
      readonly kind: 'COMPLETE';
      readonly goal: string;
      readonly intent: WorldGoalIntent;
      readonly result: DiscoveryLoopResult;
      /** The existing renderer's text, kept alongside the structured result. */
      readonly report: string;
    }
  | {
      /**
       * A cross-action comparison. A separate state rather than a field on
       * COMPLETE, because it answers a different question and carries a
       * different result shape — merging them would let a caller render a
       * ranking as a hypothesis search or the reverse.
       */
      readonly kind: 'COMPARISON';
      readonly goal: string;
      readonly comparison: CrossActionComparison;
    };

function isPlanError(value: DiscoveryLoopInput | { readonly error: string }): value is { readonly error: string } {
  return 'error' in value;
}

/**
 * Parses the goal, plans the search, runs it, and renders the report.
 *
 * Synchronous because every stage is: the loop forks and advances a real world
 * in-process. A caller on a UI thread should yield before calling it rather
 * than expect this to do it, which is what the panel does.
 */
export function runWorldDiscovery(
  goal: string,
  catalog: WorldLeverCatalog = GENESIS_FLOOD_CATALOG,
): Extract<WorldDiscoveryState, { kind: 'REFUSED' | 'COMPLETE' | 'COMPARISON' }> {
  // A goal asking which action to take is answered by the comparison engine;
  // anything else goes to the single-mechanism loop, which is the conservative
  // default because it never publishes an ordering.
  if (goalAsksForComparison(goal)) {
    return { kind: 'COMPARISON', goal, comparison: compareWorldActions({ goal, catalog }) };
  }

  const intent = parseWorldDiscoveryGoal(goal, catalog);
  const plan = buildWorldDiscoveryPlan(intent, catalog);
  if (isPlanError(plan)) {
    return { kind: 'REFUSED', goal, error: plan.error, intent };
  }
  const result = runAutonomousDiscovery(plan);
  return { kind: 'COMPLETE', goal, intent, result, report: renderDiscoveryReport(result) };
}

/**
 * A one-line answer for someone who will not read the whole report.
 *
 * Derived strictly from what the result already says. When nothing survived it
 * says so — picking the least-refuted mechanism to have something to show
 * would be inventing a finding the search did not make.
 */
export function summariseDiscovery(result: DiscoveryLoopResult): string {
  const tried = `${result.rounds.length} experiment${result.rounds.length === 1 ? '' : 's'}`;
  if (result.bestSupported.length === 0) {
    return `Ran ${tried}. No declared mechanism met its criterion, so this search has no answer to give — only what it ruled out.`;
  }
  const names = result.bestSupported.map((b) => b.hypothesisId).join(', ');
  return `Ran ${tried}. Held up under test, within this model: ${names}.`;
}

// ---------------------------------------------------------------------------
// Memory -> Evidence -> Replay -> next experiment.
// ---------------------------------------------------------------------------

/**
 * CLOSES THE LOOP: hypothesis -> experiment -> result -> decision -> Science
 * Memory -> Evidence Bundle -> Replay -> next experiment.
 *
 * `runWorldDiscovery` above still does exactly what it always did — nothing
 * about it changes, and every existing caller keeps working unmodified. This
 * is a second entry point for a caller that wants the FULL pipeline: it runs
 * the same search (reusing `runWorldDiscovery`'s own routing decision, not a
 * second copy of it), then does four more real things with the result:
 *
 *   1. READS Science Memory FIRST, before running anything, for hypotheses
 *      already REFUTED under the SAME (catalog, objective metric, direction)
 *      in an earlier run — and if any exist, EXCLUDES them from this run's
 *      candidate set. This is the one place behaviour actually changes
 *      because of memory: a second call with a fresh process and an empty
 *      call stack still tests fewer hypotheses than the first, because it
 *      remembers what the first one already ruled out. Never blocks
 *      execution: if every declared hypothesis was already refuted, it runs
 *      the full set again rather than testing nothing.
 *   2. Builds a real Evidence Bundle from the LIVE engines the run produced
 *      (`buildWorldDiscoveryEvidenceBundle` / `buildActionComparisonEvidenceBundle`
 *      in `scienceMemory.ts`), with a real `verifyEngine` so its own replay
 *      verdict is an actual MATCH/DRIFT, not NOT_VERIFIED.
 *   3. Persists everything — question, hypotheses, model, parameters, result,
 *      why each hypothesis stands or fell, what is still unknown, and the
 *      next experiment the dispatcher proposed — as one Science Memory
 *      record (`saveWorldDiscoveryRunToMemory`).
 *   4. REPLAYS it immediately by re-executing from the saved inputs
 *      (`replaySavedWorldDiscoveryRun`) — proving the just-saved record is
 *      actually reproducible, not merely stored.
 *
 * Nothing here computes a verdict, ranks a hypothesis, or invents a next
 * step: every one of those four operations calls a function that already
 * existed before this file did.
 */

export interface WorldDiscoveryMemoryUse {
  readonly skippedHypothesisIds: readonly string[];
  readonly reason: string;
}

export interface WorldDiscoveryEvidenceSummary {
  readonly bundleId: string;
  readonly scientificContentFingerprint: string;
  readonly replayVerdict: ReplayVerdict;
  readonly replayMessage: string;
}

export type WorldDiscoveryRememberedState =
  | Extract<WorldDiscoveryState, { kind: 'REFUSED' }>
  | (Extract<WorldDiscoveryState, { kind: 'COMPLETE' }> & {
      readonly memory: WorldDiscoveryMemoryUse | null;
      readonly evidence: WorldDiscoveryEvidenceSummary;
      readonly replay: SavedWorldDiscoveryReplay;
      readonly savedExperimentId: string;
    })
  | (Extract<WorldDiscoveryState, { kind: 'COMPARISON' }> & {
      /** Comparisons always run every declared action against the control, so memory never excludes a candidate here. */
      readonly memory: null;
      readonly evidence: WorldDiscoveryEvidenceSummary;
      readonly replay: SavedWorldDiscoveryReplay;
      readonly savedExperimentId: string;
    });

/**
 * Hypotheses this catalog's objective has already refuted, read from real
 * prior Science Memory records — never from the run currently executing.
 * Scoped to the SAME (catalog, metric, direction): a mechanism refuted for
 * "minimise peak depth" says nothing about "maximise flooded area".
 *
 * Exported so `discoveryOrchestrator.ts` can consult the SAME memory this
 * session already narrows on, without a second implementation of the match
 * rule drifting from this one.
 */
export function priorRefutedHypothesisIds(
  catalogId: string,
  metric: string,
  direction: 'minimize' | 'maximize',
): ReadonlySet<string> {
  const refuted = new Set<string>();
  for (const experiment of listExperiments()) {
    const record = experiment.worldDiscovery;
    if (!record || record.resultKind !== 'HYPOTHESIS_LOOP' || record.loopResult === undefined) continue;
    if (record.catalogId !== catalogId || record.objectiveMetric !== metric || record.objectiveDirection !== direction) continue;
    for (const belief of record.loopResult.beliefs) if (belief.status === 'REFUTED') refuted.add(belief.hypothesisId);
  }
  return refuted;
}

/** Exported so `discoveryOrchestrator.ts`'s own "AndRemember" persistence reuses this projection rather than a second one. */
export function evidenceSummary(bundle: { bundleId: string; scientificContentFingerprint: string; replay: { verdict: ReplayVerdict; message: string } }): WorldDiscoveryEvidenceSummary {
  return {
    bundleId: bundle.bundleId,
    scientificContentFingerprint: bundle.scientificContentFingerprint,
    replayVerdict: bundle.replay.verdict,
    replayMessage: bundle.replay.message,
  };
}

export function runWorldDiscoveryAndRemember(
  goal: string,
  catalogId: string = GENESIS_FLOOD_CATALOG.catalogId,
): WorldDiscoveryRememberedState {
  const catalog = resolveWorldLeverCatalog(catalogId) ?? GENESIS_FLOOD_CATALOG;

  if (goalAsksForComparison(goal)) {
    const comparison = compareWorldActions({ goal, catalog });
    const bundle = buildActionComparisonEvidenceBundle(catalog, comparison, goal);
    const evidence = evidenceSummary(bundle);
    const saved = buildSavedWorldDiscoveryRun({
      resultKind: 'ACTION_COMPARISON',
      goal,
      catalogId: catalog.catalogId,
      worldId: catalog.worldId,
      domainId: catalog.domainId,
      objectiveMetric: comparison.objective?.metric ?? null,
      objectiveDirection: comparison.objective?.direction ?? null,
      comparisonResult: comparison,
      evidence,
      resumedFromMemory: null,
    });
    const savedExperiment = saveWorldDiscoveryRunToMemory(saved);
    const replay = replaySavedWorldDiscoveryRun(savedExperiment);
    return { kind: 'COMPARISON', goal, comparison, memory: null, evidence, replay, savedExperimentId: savedExperiment.id };
  }

  const intent = parseWorldDiscoveryGoal(goal, catalog);
  const plan = buildWorldDiscoveryPlan(intent, catalog);
  if (isPlanError(plan)) {
    return { kind: 'REFUSED', goal, error: plan.error, intent };
  }

  // MEMORY, applied before the run: exclude what this world's objective has already refuted.
  const priorRefuted = priorRefutedHypothesisIds(catalog.catalogId, intent.objectiveMetric!, intent.direction!);
  const alreadyRefutedHere = plan.hypotheses.filter((h) => priorRefuted.has(h.hypothesisId));
  let hypothesesToRun = plan.hypotheses;
  let resumedFromMemory: WorldDiscoveryMemoryUse | null = null;
  if (alreadyRefutedHere.length > 0) {
    const remaining = plan.hypotheses.filter((h) => !priorRefuted.has(h.hypothesisId));
    if (remaining.length > 0) {
      hypothesesToRun = remaining;
      resumedFromMemory = {
        skippedHypothesisIds: alreadyRefutedHere.map((h) => h.hypothesisId),
        reason: `Skipped ${alreadyRefutedHere.map((h) => h.hypothesisId).join(', ')}: already refuted for "${intent.direction} ${intent.objectiveMetric}" in an earlier run on this world, so this run tests only what is still open.`,
      };
    } else {
      resumedFromMemory = {
        skippedHypothesisIds: [],
        reason: `Every declared hypothesis for "${intent.direction} ${intent.objectiveMetric}" was already refuted in an earlier run; running the full declared set again rather than testing nothing.`,
      };
    }
  }

  const execution = runAutonomousDiscoveryWithEngines({ ...plan, hypotheses: hypothesesToRun });
  const bundle = buildWorldDiscoveryEvidenceBundle(catalog, execution, goal);
  const evidence = evidenceSummary(bundle);
  const saved = buildSavedWorldDiscoveryRun({
    resultKind: 'HYPOTHESIS_LOOP',
    goal,
    catalogId: catalog.catalogId,
    worldId: catalog.worldId,
    domainId: catalog.domainId,
    objectiveMetric: intent.objectiveMetric,
    objectiveDirection: intent.direction,
    loopResult: execution.result,
    evidence,
    resumedFromMemory,
  });
  const savedExperiment = saveWorldDiscoveryRunToMemory(saved);
  const replay = replaySavedWorldDiscoveryRun(savedExperiment);
  return {
    kind: 'COMPLETE',
    goal,
    intent,
    result: execution.result,
    report: renderDiscoveryReport(execution.result),
    memory: resumedFromMemory,
    evidence,
    replay,
    savedExperimentId: savedExperiment.id,
  };
}
