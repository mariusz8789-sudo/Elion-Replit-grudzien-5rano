import { runAutonomousDiscovery, type DiscoveryLoopInput, type DiscoveryLoopResult } from './discoveryLoop';
import { renderDiscoveryReport } from './discoveryReport';
import {
  buildWorldDiscoveryPlan,
  GENESIS_FLOOD_CATALOG,
  parseWorldDiscoveryGoal,
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
): Extract<WorldDiscoveryState, { kind: 'REFUSED' | 'COMPLETE' }> {
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
