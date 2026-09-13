import { canonicalJson, fnv1a } from '../events/hash';

/**
 * PredictionRegistry (Phase G, Proof Ladder P5 — "Prospective Prediction").
 *
 * WHY THIS IS GENUINELY NEW (confirmed by audit). The closest existing
 * mechanism, `discoveryReplicationEngine.ts::assertFreezePrecedesDataset`,
 * checks ONE specific ordering (hypothesis-freeze before a replication
 * dataset is retrieved) inside one pipeline function — it is not a general,
 * append-only store of predictions that anything else can register into or
 * check an outcome against. `differentiatingExperimentGenerator.ts` freezes a
 * decision rule by construction (no `observedValue` parameter exists to leak
 * into it), which is a different guarantee again — structural, not a stored
 * record with an enforced ordering check callable later. This module is the
 * first place a prediction is registered as data, with its own ordering
 * assertion, independent of any one pipeline.
 *
 * WHAT IT REFUSES, ON PURPOSE:
 *  - An empty `claim`, or an interval with `low > high` — a registered
 *    prediction that cannot even be read back is not evidence.
 *  - `discriminatesAgainst` empty — mirrors G2's own
 *    `differentiatingExperimentGenerator.ts` discipline: a prediction that
 *    does not distinguish this claim from at least one named alternative is
 *    trivially satisfiable and proves nothing (Proof Ladder §6 in the
 *    design package this implements: "a prediction must discriminate vs >=1
 *    competing hypothesis, or it is TRIVIAL").
 *  - Re-registering the same `predictionId` — a prediction is frozen once;
 *    "editing" it after the fact is exactly the HARKing this whole session's
 *    discipline exists to prevent.
 *  - Checking an outcome against a `predictionId` that was never registered —
 *    there is no such thing as a retroactive prediction.
 *
 * The fingerprint deliberately EXCLUDES `frozenAt` (wall-clock, like every
 * other fingerprint in this codebase) — two predictions with identical
 * scientific content registered at different real times still fingerprint
 * identically, so replay does not depend on when the test happened to run.
 * `frozenAt` is still stored and is exactly the field the ordering check
 * compares against the observation's own timestamp.
 */

export const PREDICTION_REGISTRY_CONTRACT_VERSION = '1.0.0';

export interface PredictionInterval {
  readonly low: number;
  readonly high: number;
}

export interface PredictionInput {
  readonly predictionId: string;
  readonly claim: string;
  readonly value: number;
  readonly interval: PredictionInterval;
  /** Ids of >=1 competing hypothesis/model this prediction would distinguish this claim from. Never empty. */
  readonly discriminatesAgainst: readonly string[];
  /** Caller-supplied — never read from the system clock inside this module. */
  readonly frozenAt: number;
}

export interface RegisteredPrediction extends PredictionInput {
  readonly fingerprint: string;
}

export interface PredictionRegistry {
  readonly registryId: string;
  readonly entries: RegisteredPrediction[];
}

export function createPredictionRegistry(registryId: string): PredictionRegistry {
  return { registryId, entries: [] };
}

function fingerprintOf(input: PredictionInput): string {
  return fnv1a(canonicalJson({
    predictionId: input.predictionId, claim: input.claim, value: input.value,
    interval: input.interval, discriminatesAgainst: [...input.discriminatesAgainst].sort(),
  }));
}

export function registerPrediction(registry: PredictionRegistry, input: PredictionInput): RegisteredPrediction {
  if (input.claim.trim() === '') {
    throw new Error('predictionRegistry: a prediction must state its claim — an unlabelled number is not a registered prediction.');
  }
  if (input.interval.low > input.interval.high) {
    throw new Error(`predictionRegistry: interval [${input.interval.low}, ${input.interval.high}] has low > high.`);
  }
  if (input.discriminatesAgainst.length === 0) {
    throw new Error('predictionRegistry: discriminatesAgainst is empty — a prediction that distinguishes this claim from no named alternative is trivially satisfiable and proves nothing.');
  }
  if (registry.entries.some((e) => e.predictionId === input.predictionId)) {
    throw new Error(`predictionRegistry: "${input.predictionId}" is already registered — a prediction is frozen once; register a new id instead of editing this one.`);
  }
  const entry: RegisteredPrediction = { ...input, fingerprint: fingerprintOf(input) };
  registry.entries.push(entry);
  return entry;
}

export function listPredictions(registry: PredictionRegistry): readonly RegisteredPrediction[] {
  return [...registry.entries];
}

export interface PredictionOutcome {
  readonly predictionId: string;
  readonly observedAt: number;
  readonly observedValue: number;
}

export type PredictionOrderingVerdict = 'FROZEN_BEFORE_OBSERVED' | 'VIOLATED';

export interface PredictionCheck {
  readonly prediction: RegisteredPrediction;
  readonly outcome: PredictionOutcome;
  readonly ordering: PredictionOrderingVerdict;
  readonly withinInterval: boolean;
}

/**
 * The P5 gate itself: was this specific prediction frozen strictly before the
 * observation it is being checked against? Throws if no prediction with this
 * id was ever registered — there is nothing to check an outcome against.
 */
export function checkPredictionOrdering(registry: PredictionRegistry, outcome: PredictionOutcome): PredictionCheck {
  const prediction = registry.entries.find((e) => e.predictionId === outcome.predictionId);
  if (prediction === undefined) {
    throw new Error(`predictionRegistry: no prediction "${outcome.predictionId}" was ever registered — an outcome cannot be checked against a prediction that does not exist.`);
  }
  const ordering: PredictionOrderingVerdict = prediction.frozenAt < outcome.observedAt ? 'FROZEN_BEFORE_OBSERVED' : 'VIOLATED';
  const withinInterval = outcome.observedValue >= prediction.interval.low && outcome.observedValue <= prediction.interval.high;
  return { prediction, outcome, ordering, withinInterval };
}

export function registryFingerprint(registry: PredictionRegistry): string {
  return fnv1a(canonicalJson({
    contractVersion: PREDICTION_REGISTRY_CONTRACT_VERSION,
    registryId: registry.registryId,
    entries: registry.entries.map((e) => ({ predictionId: e.predictionId, fingerprint: e.fingerprint })),
  }));
}
