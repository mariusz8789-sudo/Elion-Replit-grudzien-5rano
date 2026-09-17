import { canonicalJson, fnv1a } from '../events/hash';

/**
 * TrialRegistry (Phase G, G6.1) — the append-only record of EVERY attempt a
 * run made, so that a multiplicity correction can be computed from what was
 * actually tried rather than from a number someone typed.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT falsifiedModelRegistry.ts. That registry
 * (core/agent/falsifiedModelRegistry.ts) records only models that reached
 * FALSIFIED_WITHIN_PROTOCOL — a verdict store, deliberately narrow, and
 * nothing reads its cardinality. The failure mode this module addresses is
 * the opposite one: a run that screens 2671 candidates, scans dozens of
 * column pairs and abandons several branches, then reports a p-value as if
 * one test had been performed. The number of attempts is the thing that must
 * not be forgettable, so recording an attempt is the only way to have made
 * one, and `correctForMultiplicity` refuses to take a hand-passed count.
 *
 * THREE ASSERTIONS, ALL MACHINE-ENFORCED (they throw; nothing is silently
 * tolerated):
 *   1. An attempt without a subject or without a reason is rejected outright
 *      — an attempt nobody can audit is not a recorded attempt.
 *   2. `assertRegistryComplete` throws in BOTH directions: fewer records than
 *      attempts is the silent-skip failure, more is the double-count failure.
 *   3. `correctForMultiplicity` throws on an empty count rather than
 *      returning the nominal alpha, because "no correction" and "correction
 *      over zero trials" are different claims.
 *
 * WALL CLOCK IS EXCLUDED FROM THE FINGERPRINT. `recordedAt` is optional,
 * supplied by the caller (never read from the system clock in here), and
 * omitted from `registryFingerprint` so that two runs of the same process
 * replay identically. Append order is carried by `ordinal`, which is
 * deterministic.
 */

export const TRIAL_REGISTRY_CONTRACT_VERSION = '1.0.0';

export type TrialKind =
  | 'HYPOTHESIS'
  | 'MODEL_PROPOSAL'
  | 'CANDIDATE_EVALUATION'
  | 'FALSIFICATION_ATTACK'
  | 'CORRELATION_PAIR'
  | 'ABANDONED_BRANCH';

export type TrialOutcome = 'SURVIVED' | 'ELIMINATED' | 'ABANDONED' | 'INCONCLUSIVE';

export interface TrialInput {
  readonly kind: TrialKind;
  /** What was tried: a molecule id, a hypothesis id, a column pair, a branch name. */
  readonly subject: string;
  readonly stage: string;
  readonly outcome: TrialOutcome;
  /** Why it ended this way. Required — an unexplained attempt is rejected. */
  readonly reason: string;
  /** Optional caller-supplied time. Recorded for audit, EXCLUDED from the fingerprint. */
  readonly recordedAt?: number;
}

export interface TrialRecord {
  readonly trialId: string;
  readonly ordinal: number;
  readonly kind: TrialKind;
  readonly subject: string;
  readonly subjectFingerprint: string;
  readonly stage: string;
  readonly outcome: TrialOutcome;
  readonly reason: string;
  readonly recordedAt: number | null;
}

export interface TrialRegistry {
  readonly registryId: string;
  /** Private in practice: append through `recordTrial`, read through `listTrials`. */
  readonly entries: TrialRecord[];
}

export function createTrialRegistry(registryId: string): TrialRegistry {
  return { registryId, entries: [] };
}

export function recordTrial(registry: TrialRegistry, input: TrialInput): TrialRecord {
  if (input.subject.trim() === '') {
    throw new Error('TrialRegistry: a trial must name its subject — an anonymous attempt cannot be audited.');
  }
  if (input.reason.trim() === '') {
    throw new Error('TrialRegistry: a trial must carry a reason — an unexplained attempt is not a recorded attempt.');
  }
  const ordinal = registry.entries.length + 1;
  const subjectFingerprint = fnv1a(canonicalJson({ kind: input.kind, subject: input.subject }));
  const record: TrialRecord = {
    trialId: fnv1a(canonicalJson({ registryId: registry.registryId, ordinal, kind: input.kind, subject: input.subject, stage: input.stage })),
    ordinal,
    kind: input.kind,
    subject: input.subject,
    subjectFingerprint,
    stage: input.stage,
    outcome: input.outcome,
    reason: input.reason,
    recordedAt: input.recordedAt ?? null,
  };
  registry.entries.push(record);
  return record;
}

/** A copy — the registry is append-only, so a caller can never splice history out of it. */
export function listTrials(registry: TrialRegistry): readonly TrialRecord[] {
  return [...registry.entries];
}

export function countTrials(registry: TrialRegistry, kinds?: readonly TrialKind[]): number {
  if (kinds === undefined) return registry.entries.length;
  const wanted = new Set(kinds);
  return registry.entries.filter((e) => wanted.has(e.kind)).length;
}

export interface RegistryCompleteness {
  readonly expectedAttempts: number;
  readonly recordedTrials: number;
  readonly complete: boolean;
}

/**
 * Throws in BOTH directions. A run that attempted more than it recorded has
 * lost attempts; a run that recorded more than it attempted is double-counting
 * and would over-correct its own alpha. Neither is a warning.
 */
export function assertRegistryComplete(registry: TrialRegistry, expectedAttempts: number): RegistryCompleteness {
  const recordedTrials = registry.entries.length;
  if (recordedTrials !== expectedAttempts) {
    throw new Error(
      `TrialRegistry "${registry.registryId}" is incomplete: the process reports ${expectedAttempts} attempt(s) but recorded ${recordedTrials}. `
      + (recordedTrials < expectedAttempts
        ? 'Attempts were made without being recorded — every multiplicity correction computed from this registry would be too weak.'
        : 'More trials were recorded than attempted — the correction would be too strong and the audit trail does not match the run.'),
    );
  }
  return { expectedAttempts, recordedTrials, complete: true };
}

export interface MultiplicityCorrection {
  readonly method: 'BONFERRONI';
  readonly nominalAlpha: number;
  readonly trialsCounted: number;
  readonly correctedAlpha: number;
  readonly countedKinds: readonly TrialKind[] | 'ALL';
}

/**
 * Takes the registry, never a count. Passing a number would reintroduce
 * exactly the failure this module exists to prevent.
 */
export function correctForMultiplicity(
  registry: TrialRegistry,
  nominalAlpha: number,
  kinds?: readonly TrialKind[],
): MultiplicityCorrection {
  const trialsCounted = countTrials(registry, kinds);
  if (trialsCounted === 0) {
    throw new Error(
      `TrialRegistry "${registry.registryId}": no trial of the requested kind was recorded, so there is nothing to correct for. `
      + 'Returning the nominal alpha here would claim "one test was performed", which is a different claim from "no test was performed".',
    );
  }
  return {
    method: 'BONFERRONI',
    nominalAlpha,
    trialsCounted,
    correctedAlpha: nominalAlpha / trialsCounted,
    countedKinds: kinds ?? 'ALL',
  };
}

/** Over the recorded attempts only — `recordedAt` is deliberately excluded so replay is stable. */
export function registryFingerprint(registry: TrialRegistry): string {
  return fnv1a(canonicalJson({
    contractVersion: TRIAL_REGISTRY_CONTRACT_VERSION,
    registryId: registry.registryId,
    entries: registry.entries.map((e) => ({
      ordinal: e.ordinal, kind: e.kind, subject: e.subject, stage: e.stage, outcome: e.outcome, reason: e.reason,
    })),
  }));
}
