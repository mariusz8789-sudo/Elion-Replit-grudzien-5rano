import { canonicalJson } from '../events/hash';
import type { ReplayState } from '../world/scientificWorldState';
import type { TemporalEngine } from '../worldModel/temporal/temporalEngine';
import { collectScalars } from '../worldModel/bridge/worldFrameState';

/**
 * LOOKING GLASS — REPLAY VERIFICATION FOR A LIVE C3 ENGINE.
 *
 * There is no saved-artifact protocol for `core/worldModel/*` sessions yet
 * (unlike `scenarioCounterfactual.ts`'s `replaySavedScenarioCounterfactual`),
 * so "replay" cannot mean "reload a saved run and rerun it". What it CAN
 * mean, honestly, today: does independently rebuilding the same declared
 * construction and re-executing it through the same real solver reproduce
 * the same scalars? A closed-form, deterministic solver (no RNG anywhere in
 * `chemistryKinetics.ts` or `hydraulicsPumpPipe.ts`) should always answer
 * yes — but MATCH is reported only because this function actually checked,
 * never assumed from "the solver has no randomness" alone. A real DRIFT
 * here would mean a real bug, and would be reported as one.
 *
 * Shared by every `core/worldModel/*`-backed Looking Glass session so this
 * check is written once, not once per domain.
 */
export function verifiedReplayAt(
  primaryEngine: TemporalEngine,
  primaryEntityId: string,
  verifyEngine: TemporalEngine,
  verifyEntityId: string,
  tick: number,
): ReplayState {
  const primary = collectScalars(primaryEngine.graph.getEntity(primaryEntityId));
  const verify = collectScalars(verifyEngine.graph.getEntity(verifyEntityId));
  const match = canonicalJson(primary) === canonicalJson(verify);
  return {
    status: match ? 'MATCH' : 'DRIFT',
    message: match
      ? `Independently rebuilt (same construction, same solver) and re-executed to tick ${tick}; scalars matched exactly.`
      : `Independently rebuilt run diverged from the original at tick ${tick} — this is a real reproducibility failure, not reported as a match.`,
  };
}
