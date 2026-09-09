import { reduceObjectiveTrajectory } from '../worldModel/discovery/objectiveTrajectory';
import { AT_HORIZON } from '../experimentFabric/objectiveReducer';
import type { ObjectiveReducer } from '../experimentFabric/objectiveReducer';
import type { WorldGraph } from '../worldModel/ecs/worldGraph';
import { TemporalBranchRegistry, TemporalEngine, type TemporalUpdater } from '../worldModel/temporal/temporalEngine';

/**
 * MECHANISM INTERACTION — what `discoveryLoop.ts` cannot ask today: does
 * applying two independently-`SUPPORTED` mechanisms TOGETHER move the
 * objective by the sum of their separate effects, or does combining them
 * change the answer?
 *
 * `AUTONOMOUS_DISCOVERY_ROADMAP.md`'s "P6, live discrimination for MECHANISM"
 * section named this as the honest next experiment when two MECHANISM
 * hypotheses about DIFFERENT levers both survive — they are not rivals to
 * discriminate between the way two PARAMETER claims about one hidden value
 * are, they are two independent findings, and the informative question is
 * whether they compose. This module is the measurement half of that design,
 * built and checked against a real fixture before being written, not derived
 * in the abstract.
 *
 * ## The finding this exists to report, not assume
 *
 * `genesis-backup-generator`'s `h:fuel-efficiency` and `h:load-shedding` were
 * measured (`mechanismInteraction.test.ts`) on the real solver
 * (`fuelRateLPerHr = loadKw × specificFuelConsumptionLPerKwh` —
 * `domains/electricalGenerator.ts`): at strength 0.5 each independently adds
 * 22.92 L and 29.33 L of remaining fuel over baseline 40.0 L. A caller that
 * ASSUMED additivity would predict 40.0 + 22.92 + 29.33 = 92.25 L for both
 * together. The REAL joint arm reads 87.67 L — 4.58 L (5.0%) below the naive
 * sum. This is not noise: `fuelRateLPerHr` multiplies the two factors, so
 * cutting both at once compounds their fractional reductions on the RATE, and
 * the fuel efficiency lever's absolute saving is smaller when the load it is
 * multiplying is already reduced. A real, mechanistic, sub-additive
 * interaction — exactly why this module refuses to assume additivity and
 * measures instead.
 *
 * ## Not a third loop, not a change to `discoveryLoop.ts`
 *
 * `runJointIntervention` reuses exactly the primitives `discoveryLoop.ts`
 * already uses for a single-mechanism arm — `TemporalEngine.forkBranch`,
 * `reduceObjectiveTrajectory` — the only new step is applying TWO hypotheses'
 * `apply` functions inside one fork's mutation callback instead of one.
 * `assessJointIntervention` is a pure classifier over already-measured
 * numbers, the same discipline `competingModels.ts` and `modelSufficiency.ts`
 * use: it invents nothing and runs nothing itself.
 *
 * This module is NOT wired into `discoveryLoop.ts`'s round loop. Per the
 * roadmap's own guardrail, auto-triggering a joint arm whenever two
 * hypotheses are simultaneously `SUPPORTED` is a real control-flow decision
 * (when, for which pairs, at which strength) that belongs to whoever owns
 * that loop — this module proves the measurement and the classification are
 * sound on a real fixture first, the same order `competingModels.ts` and
 * `worldParameterCalibration.ts` were each built and proven standalone before
 * any orchestrator wiring.
 */

export const MECHANISM_INTERACTION_CONTRACT_VERSION = '1.0.0';

export type MechanismInteractionKind = 'ADDITIVE' | 'SUB_ADDITIVE' | 'SUPER_ADDITIVE' | 'INCONCLUSIVE';

export interface JointInterventionAssessment {
  readonly contractVersion: string;
  readonly baseline: number;
  readonly effectA: number;
  readonly effectB: number;
  /** What the two effects would sum to if the mechanisms were independent. Never assumed true — see `interaction`. */
  readonly naiveAdditivePrediction: number;
  /** What the joint arm actually measured. */
  readonly jointObserved: number;
  /** `(jointObserved - naiveAdditivePrediction)`, in the metric's own units — signed, so the direction of the interaction is never lost. */
  readonly deviation: number;
  /** `deviation` as a fraction of the combined effect size, so a tolerance band can be declared in relative terms. Null when both effects are exactly zero (nothing to divide by, and nothing to be additive or not about). */
  readonly relativeDeviation: number | null;
  readonly interaction: MechanismInteractionKind;
  readonly reason: string;
}

/**
 * Classifies an ALREADY-MEASURED joint intervention against the naive
 * additive prediction from two already-measured individual effects.
 *
 * `tolerance` plays the same role `agreementTolerance` plays throughout this
 * codebase (`SystemUnderStudy`, `WorldParameterSystem`): a declared band, not
 * a statistical test this repository has no methodology to justify. Within
 * the band, the two mechanisms are reported as additive; outside it, the
 * SIGN of the deviation says which way they interact.
 */
export function assessJointIntervention(params: {
  readonly baseline: number;
  readonly effectA: number;
  readonly effectB: number;
  readonly jointObserved: number;
  readonly tolerance: number;
}): JointInterventionAssessment {
  const { baseline, effectA, effectB, jointObserved, tolerance } = params;
  const naiveAdditivePrediction = baseline + effectA + effectB;
  const deviation = jointObserved - naiveAdditivePrediction;
  const combinedEffectSize = Math.abs(effectA) + Math.abs(effectB);
  const relativeDeviation = combinedEffectSize > 0 ? deviation / combinedEffectSize : null;

  if (relativeDeviation === null) {
    return {
      contractVersion: MECHANISM_INTERACTION_CONTRACT_VERSION,
      baseline, effectA, effectB, naiveAdditivePrediction, jointObserved, deviation, relativeDeviation,
      interaction: 'INCONCLUSIVE',
      reason: 'Both individual effects are exactly zero, so there is no combined effect size to judge additivity against.',
    };
  }

  const interaction: MechanismInteractionKind =
    Math.abs(relativeDeviation) <= tolerance
      ? 'ADDITIVE'
      : relativeDeviation < 0
        ? 'SUB_ADDITIVE'
        : 'SUPER_ADDITIVE';

  const reason = interaction === 'ADDITIVE'
    ? `Joint arm read ${jointObserved}, within ±${tolerance * 100}% of the naive additive prediction ${naiveAdditivePrediction} — these two mechanisms compose independently within the declared band.`
    : interaction === 'SUB_ADDITIVE'
      ? `Joint arm read ${jointObserved}, ${Math.abs(deviation)} (${(Math.abs(relativeDeviation) * 100).toFixed(1)}%) BELOW the naive additive prediction ${naiveAdditivePrediction} — applying both together moves the objective LESS than the sum of applying each alone. The mechanisms are not independent: at least part of what each one changes overlaps with what the other changes.`
      : `Joint arm read ${jointObserved}, ${Math.abs(deviation)} (${(Math.abs(relativeDeviation) * 100).toFixed(1)}%) ABOVE the naive additive prediction ${naiveAdditivePrediction} — applying both together moves the objective MORE than the sum of applying each alone, a real synergy between the two declared mechanisms.`;

  return {
    contractVersion: MECHANISM_INTERACTION_CONTRACT_VERSION,
    baseline, effectA, effectB, naiveAdditivePrediction, jointObserved, deviation, relativeDeviation, interaction, reason,
  };
}

/**
 * Runs the ONE genuinely new measurement this module needs: a fork that
 * applies BOTH hypotheses' mechanisms together, at the same strength each was
 * individually tested at. Every other primitive here — `TemporalEngine`,
 * `forkBranch`, `reduceObjectiveTrajectory` — is exactly what
 * `discoveryLoop.ts` already uses for a single-mechanism arm.
 *
 * Callers get the baseline back too (read at the same horizon), so a caller
 * can build `effectA`/`effectB` from its own already-run single-mechanism
 * rounds without re-deriving what "effect" means here.
 */
export function runJointIntervention(input: {
  readonly buildWorld: () => { readonly graph: WorldGraph; readonly updater: TemporalUpdater };
  readonly decisionAtTick: number;
  readonly horizonTick: number;
  readonly dt: number;
  readonly entityId: string;
  readonly metric: string;
  readonly reducer?: ObjectiveReducer;
  readonly applyA: (graph: WorldGraph, strength: number) => void;
  readonly applyB: (graph: WorldGraph, strength: number) => void;
  readonly strength: number;
}): { readonly baseline: number | null; readonly jointObserved: number | null } {
  const reducer = input.reducer ?? AT_HORIZON;
  const world = input.buildWorld();
  const registry = new TemporalBranchRegistry();
  const baseline = new TemporalEngine(world.graph, { registry, label: 'baseline' });
  for (let tick = 0; tick < input.horizonTick; tick++) baseline.advance(input.dt, world.updater);

  const joint = baseline.forkBranch(input.decisionAtTick, `joint@${input.strength}`, (graph) => {
    input.applyA(graph, input.strength);
    input.applyB(graph, input.strength);
  });
  for (let tick = input.decisionAtTick; tick < input.horizonTick; tick++) joint.advance(input.dt, world.updater);

  return {
    baseline: reduceObjectiveTrajectory(baseline, input.entityId, input.metric, reducer, 0, input.horizonTick).value,
    jointObserved: reduceObjectiveTrajectory(joint, input.entityId, input.metric, reducer, input.decisionAtTick, input.horizonTick).value,
  };
}
