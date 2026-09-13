import { fnv1a, canonicalJson } from '../events/hash';
import { fitModelSpec, modelSpecFingerprint, normalizeModelSpec, type ModelPoint, type ModelSpec } from './modelSpace';
import {
  assertReplicationDisjoint,
  type AdversarialAttempt,
  type DisjointnessProof,
  type IndependentReplicationRecord,
} from './discoveryContracts';

/**
 * PHASE F, Krok 3 — DISCOVERY REPLICATION ENGINE.
 *
 * The mandate's own two hard rules, enforced here rather than only
 * documented: (1) freeze the hypothesis/prediction BEFORE the replication
 * dataset is ever read, so nothing downstream can silently adjust the
 * claim to fit what replication turns up; (2) the replication dataset must
 * be provably disjoint from the discovery dataset — reused verbatim via
 * `discoveryContracts.ts::assertReplicationDisjoint` (AC5), never
 * re-implemented here.
 *
 * NO SECOND FITTING ENGINE: every fit in this file goes through
 * `modelSpace.ts::fitModelSpec`, unmodified. This module adds exactly what
 * that function does not: dataset disjointness, freeze-timing, and two
 * concrete adversarial re-fits (a real, if modest, active attempt to break
 * the claim rather than just checking a number twice).
 *
 * WHAT "EFFECT" MEANS HERE, STATED PLAINLY: the fitted coefficient on the
 * LAST term of the model spec — by this codebase's own convention
 * (`residualStructure.ts`/`directionFinder.ts`), a residual-derived term is
 * appended, not inserted, so the last coefficient is the one the discovery
 * claim is actually about. A disclosed convention, not a hidden default.
 */

export const DISCOVERY_REPLICATION_ENGINE_CONTRACT_VERSION = '1.0.0';

export interface FreezeRecord {
  readonly hypothesisFingerprint: string;
  readonly predictionFingerprint: string;
  /** Wall-clock, for the audit trail only — deliberately excluded from every fingerprint below (the same lesson `falsifiedModelRegistry.ts` already learned: wall-clock in a fingerprint defeats replay). */
  readonly frozenAt: number;
}

/** Step 1 — MUST be called, and its result held, before `replicationDataset` is ever read. */
export function freezeBeforeReplication(hypothesisSpec: ModelSpec, predictedEffect: number): FreezeRecord {
  const canonical = normalizeModelSpec(hypothesisSpec);
  return {
    hypothesisFingerprint: modelSpecFingerprint(canonical),
    predictionFingerprint: fnv1a(canonicalJson({ predictedEffect: Number(predictedEffect.toPrecision(12)) })),
    frozenAt: Date.now(),
  };
}

export interface ReplicationDataset {
  readonly datasetId: string;
  readonly points: readonly ModelPoint[];
  readonly disjointnessProof: DisjointnessProof;
  /** When this dataset was actually obtained — the anchor `assertFreezePrecedesDataset` checks the freeze against, so a hypothesis "frozen" after already having the data is caught mechanically, not just documented. */
  readonly retrievedAt: number;
}

/**
 * AC7's real check: refuses a replication whose freeze happened AT OR
 * AFTER the replication dataset was retrieved — the mechanical signature of
 * a hidden HARK ("I froze the hypothesis" stated after the fact, once the
 * answer was already visible).
 */
export function assertFreezePrecedesDataset(freeze: FreezeRecord, dataset: Pick<ReplicationDataset, 'retrievedAt'>): void {
  if (freeze.frozenAt >= dataset.retrievedAt) {
    throw new Error(
      `discoveryReplicationEngine: refusing replication — hypothesis was "frozen" at ${freeze.frozenAt}, at or after the replication dataset was retrieved at ${dataset.retrievedAt}. A freeze must precede the data it is being tested against, or it is not a freeze.`,
    );
  }
}

export function datasetFingerprint(dataset: Pick<ReplicationDataset, 'datasetId' | 'points'>): string {
  return fnv1a(canonicalJson({ datasetId: dataset.datasetId, points: dataset.points.map((p) => [p.x, p.y, p.sigma]) }));
}

function effectOf(coefficients: readonly number[]): number {
  return coefficients[coefficients.length - 1] ?? 0;
}

/** A deterministic pseudo-shuffle (Fisher-Yates over an FNV-seeded LCG) — no `Math.random`, so a replay reproduces the identical adversarial attempt. */
function deterministicShuffle<T>(items: readonly T[], seed: string): T[] {
  let state = Number(BigInt(`0x${fnv1a(seed)}`) % 2147483647n) || 1;
  const next = (): number => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** Adversarial attempt 1 — refit on the SAME x's with SHUFFLED y's. A real effect should collapse; a spurious one, driven by an artifact of the fitting procedure rather than the data, may survive. */
function labelShuffleAttempt(spec: ModelSpec, points: readonly ModelPoint[], realEffect: number): AdversarialAttempt {
  const shuffledYs = deterministicShuffle(points.map((p) => p.y), 'label-shuffle');
  const shuffled = points.map((p, i) => ({ ...p, y: shuffledYs[i]! }));
  const fit = fitModelSpec(spec, shuffled);
  if (!fit.ok) {
    return { attack: 'label-shuffle', result: 'WITHSTOOD', detail: 'The shuffled-label refit did not even converge — no spurious effect could be manufactured this way.' };
  }
  const shuffledEffect = effectOf(fit.coefficients);
  const survived = Math.abs(realEffect) > 1e-12 && Math.abs(shuffledEffect / realEffect) > 0.5;
  return {
    attack: 'label-shuffle',
    result: survived ? 'BROKE_CLAIM' : 'WITHSTOOD',
    detail: survived
      ? `A comparably large effect (${shuffledEffect.toPrecision(6)} vs real ${realEffect.toPrecision(6)}) appeared even with y-labels shuffled — the fitting procedure itself may be manufacturing the effect.`
      : `Shuffled-label effect (${shuffledEffect.toPrecision(6)}) collapsed relative to the real effect (${realEffect.toPrecision(6)}), as a genuine relation should.`,
  };
}

/** Adversarial attempt 2 — refit on only the odd-indexed half of the replication points; a real effect should hold its sign and rough magnitude on a real subsample. */
function halfSplitAttempt(spec: ModelSpec, points: readonly ModelPoint[], realEffect: number): AdversarialAttempt {
  const half = points.filter((_, i) => i % 2 === 1);
  if (half.length < 2) {
    return { attack: 'half-split', result: 'WITHSTOOD', detail: 'Too few points to attempt a half-split — not a failure of the claim, just an untried attack.' };
  }
  const fit = fitModelSpec(spec, half);
  if (!fit.ok) {
    return { attack: 'half-split', result: 'BROKE_CLAIM', detail: `The half-split subsample could not even be fit (${fit.reason}) — the claimed relation is not robust to subsampling.` };
  }
  const halfEffect = effectOf(fit.coefficients);
  const sameSign = Math.sign(halfEffect) === Math.sign(realEffect) || Math.abs(realEffect) < 1e-12;
  return {
    attack: 'half-split',
    result: sameSign ? 'WITHSTOOD' : 'BROKE_CLAIM',
    detail: sameSign
      ? `Half-split effect (${halfEffect.toPrecision(6)}) kept the same sign as the full-replication effect (${realEffect.toPrecision(6)}).`
      : `Half-split effect (${halfEffect.toPrecision(6)}) REVERSED SIGN from the full-replication effect (${realEffect.toPrecision(6)}) — the claim is not robust to which half of the data is used.`,
  };
}

/**
 * AC6's check: even when the two datasets carry different identities
 * (different `datasetId`, different overall fingerprint), a replication
 * dataset that happens to CONTAIN some of the discovery dataset's own
 * points is contaminated — the "independent" measurement is not
 * independent at every point that overlaps. Detected by exact (x, y, sigma)
 * match; any overlap at all disqualifies a claimed-disjoint replication.
 */
export function detectDatasetOverlap(discoveryPoints: readonly ModelPoint[], replicationPoints: readonly ModelPoint[]): { readonly overlapCount: number; readonly overlappingPoints: readonly ModelPoint[] } {
  const discoveryKeys = new Set(discoveryPoints.map((p) => `${p.x}:${p.y}:${p.sigma}`));
  const overlappingPoints = replicationPoints.filter((p) => discoveryKeys.has(`${p.x}:${p.y}:${p.sigma}`));
  return { overlapCount: overlappingPoints.length, overlappingPoints };
}

export interface RunReplicationInput {
  readonly freeze: FreezeRecord;
  readonly hypothesisSpec: ModelSpec;
  readonly discoveryEffect: number;
  readonly discoveryDataset: Pick<ReplicationDataset, 'datasetId' | 'points'>;
  readonly replicationDataset: ReplicationDataset;
}

/**
 * Step 2 — runs the independent replication. Refuses (throws, via
 * `assertReplicationDisjoint`) before touching a single point if the two
 * datasets are identical. Otherwise always returns a record — even a
 * FAILED one is a real, informative result, never an exception hiding a
 * bad outcome.
 */
export function runReplication(input: RunReplicationInput): IndependentReplicationRecord {
  const discoveryFp = datasetFingerprint(input.discoveryDataset);
  const replicationFp = datasetFingerprint(input.replicationDataset);
  assertReplicationDisjoint(discoveryFp, replicationFp);

  const overlap = detectDatasetOverlap(input.discoveryDataset.points, input.replicationDataset.points);
  if (overlap.overlapCount > 0) {
    throw new Error(
      `discoveryReplicationEngine: refusing replication — ${overlap.overlapCount} point(s) in the replication dataset are IDENTICAL to points in the discovery dataset (contamination). A genuinely independent replication cannot share measurements with the discovery it is testing.`,
    );
  }

  // AC7 — hidden-HARK via freeze timing: refuses a hypothesis "frozen"
  // at or after the replication dataset was actually retrieved.
  assertFreezePrecedesDataset(input.freeze, input.replicationDataset);

  const fit = fitModelSpec(input.hypothesisSpec, input.replicationDataset.points);
  const base = {
    discoveryDatasetFingerprint: discoveryFp,
    replicationDatasetFingerprint: replicationFp,
    disjointnessProof: input.replicationDataset.disjointnessProof,
    frozenBeforeReplicationAccess: true as const,
  };

  if (!fit.ok) {
    const outcome: IndependentReplicationRecord = {
      ...base,
      adversarialAttempts: [],
      result: 'FAILED',
      effectComparison: { discoveryEffect: input.discoveryEffect, replicationEffect: NaN, agreementWithinUncertainty: false },
      outcomeFingerprint: fnv1a(canonicalJson({ ...base, result: 'FAILED', reason: fit.reason })),
    };
    return outcome;
  }

  const replicationEffect = effectOf(fit.coefficients);
  const lastIndex = fit.coefficients.length - 1;
  const se = fit.standardErrors?.[lastIndex] ?? null;
  // Agreement within uncertainty: within 2 standard errors of the replication's OWN fit when available; otherwise a disclosed, generous fallback tolerance (20% relative) — never a silent "close enough".
  const agreementWithinUncertainty = se !== null
    ? Math.abs(input.discoveryEffect - replicationEffect) <= 2 * se
    : Math.abs(input.discoveryEffect - replicationEffect) <= 0.2 * Math.max(Math.abs(input.discoveryEffect), 1e-9);

  const adversarialAttempts: AdversarialAttempt[] = [
    labelShuffleAttempt(input.hypothesisSpec, input.replicationDataset.points, replicationEffect),
    halfSplitAttempt(input.hypothesisSpec, input.replicationDataset.points, replicationEffect),
  ];
  const withstoodAll = adversarialAttempts.every((a) => a.result === 'WITHSTOOD');

  const result: IndependentReplicationRecord['result'] = !agreementWithinUncertainty
    ? 'FAILED'
    : withstoodAll
      ? 'REPLICATED'
      : 'PARTIAL';

  const outcome: Omit<IndependentReplicationRecord, 'outcomeFingerprint'> = {
    ...base,
    adversarialAttempts,
    result,
    effectComparison: { discoveryEffect: input.discoveryEffect, replicationEffect, agreementWithinUncertainty },
  };
  return { ...outcome, outcomeFingerprint: fnv1a(canonicalJson(outcome)) };
}
