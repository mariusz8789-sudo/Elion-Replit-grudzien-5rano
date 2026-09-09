import type { PanelState } from './WorldDiscoveryPanel';

/**
 * REUSABLE DISCOVERY NARRATIVE — pure functions reading the real result any domain's
 * `<WorldDiscoveryPanel onResult={...} />` already produces. Every Genesis screen that embeds the
 * generic Discovery Loop (Cell Lab today; a future neuron-circuit or any other lever-catalogue
 * domain) can drive its own CONCLUSION/NEXT EXPERIMENT narrative from these two functions instead
 * of re-deriving a second verdict — there is exactly one place a hypothesis's real status is looked
 * up, never computed twice.
 */

export interface NarrativeConclusion {
  readonly verdict: 'SUPPORTED' | 'FALSIFIED';
  readonly text: string;
}

/**
 * Reads the SAME verdict the real Discovery Loop reached for `hypothesisId`, never a second one
 * computed here. `hypothesisId` is the exact id the embedding domain's own lever catalogue declares
 * (e.g. `h:mitogen`) — this function does no prefixing or guessing, only a lookup.
 */
export function conclusionFor(result: PanelState | null, hypothesisId: string): NarrativeConclusion | null {
  if (!result || result.kind !== 'COMPLETE') return null;
  const supported = result.result.bestSupported.find((b) => b.hypothesisId === hypothesisId);
  if (supported) return { verdict: 'SUPPORTED', text: `${supported.confidence}. ${supported.reason}` };
  const falsified = result.result.failedHypotheses.find((b) => b.hypothesisId === hypothesisId);
  if (falsified) return { verdict: 'FALSIFIED', text: `${falsified.confidence}. ${falsified.reason}` };
  return null;
}

/**
 * The real "what remains unknown" the search itself reported, when one exists — never a fabricated
 * next step. Only falls back to a plain UI affordance when Genesis's own search left nothing
 * outstanding to name.
 */
export function nextExperimentFor(result: PanelState | null): string {
  if (!result || result.kind !== 'COMPLETE') {
    return 'Run a Discovery search (left panel) to let Genesis choose a real next experiment.';
  }
  if (result.result.unresolvedQuestions.length > 0) return result.result.unresolvedQuestions[0]!;
  return 'Try a different substance or dose above, then run Discovery again to test another mechanism.';
}
