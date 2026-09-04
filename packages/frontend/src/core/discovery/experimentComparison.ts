import { DISCOVERY_METRIC_KEYS } from './discoveryExecution';
import type { DiscoveryCase, DiscoveryMetricDelta } from './discoveryCase';
import type { StoredEvidence } from './evidenceStore';

/**
 * RUN COMPARISON — between two independently SAVED experiments, not between
 * the two arms of one DiscoveryCase (that comparison already exists as
 * DiscoveryCase.comparison and is untouched). Reuses the same metric key
 * list (DISCOVERY_METRIC_KEYS) and the same delta shape (DiscoveryMetricDelta)
 * the existing comparison already uses — no new metrics invented here.
 */

export type ExperimentComparisonStatus = 'COMPARABLE' | 'BLOCKED';

export type ExperimentBlockReason =
  | 'SEED_MISMATCH'
  | 'SCENARIO_MISMATCH'
  | 'POPULATION_MISMATCH'
  | 'ARM_NOT_EXECUTED';

export interface ExperimentComparison {
  status: ExperimentComparisonStatus;
  blockedReason?: ExperimentBlockReason;
  inputDifferences: readonly string[];
  /** Present only when status is COMPARABLE — one delta list per matching arm role. */
  resultDeltas: Readonly<Record<'baseline' | 'variant', readonly DiscoveryMetricDelta[]>> | null;
  sameInputFingerprint: boolean;
  sameResultFingerprint: boolean;
  /**
   * MATCH only means "same inputs, same results" — the same meaning replay
   * already uses. When inputs differ, these are two different experiments,
   * not a replay check, so this is explicitly NOT_COMPARABLE rather than a
   * forced MATCH/DRIFT label.
   */
  matchStatus: 'MATCH' | 'DRIFT' | 'NOT_COMPARABLE';
  message: string;
}

function delta(key: string, a: number, b: number): DiscoveryMetricDelta {
  return { key, baseline: a, variant: b, absoluteDelta: b - a, relativeDeltaPercent: a === 0 ? null : ((b - a) / a) * 100 };
}

function armDeltas(a: DiscoveryCase['arms'][number], b: DiscoveryCase['arms'][number]): readonly DiscoveryMetricDelta[] | null {
  if (a.summary === null || b.summary === null) return null;
  return DISCOVERY_METRIC_KEYS.map((key) => delta(key, a.summary![key], b.summary![key]));
}

export function compareStoredExperiments(a: StoredEvidence, b: StoredEvidence): ExperimentComparison {
  const rA = a.record;
  const rB = b.record;
  const inputDifferences: string[] = [];
  if (rA.seed !== rB.seed) inputDifferences.push(`seed: ${rA.seed} → ${rB.seed}`);
  if (rA.scenarios.baseline !== rB.scenarios.baseline || rA.scenarios.variant !== rB.scenarios.variant) {
    inputDifferences.push(`scenariusze: ${rA.scenarios.baseline}/${rA.scenarios.variant} → ${rB.scenarios.baseline}/${rB.scenarios.variant}`);
  }
  if (rA.initialConditions.nAgents !== rB.initialConditions.nAgents) inputDifferences.push(`populacja: ${rA.initialConditions.nAgents} → ${rB.initialConditions.nAgents}`);
  if (rA.initialConditions.days !== rB.initialConditions.days) inputDifferences.push(`dni: ${rA.initialConditions.days} → ${rB.initialConditions.days}`);
  if (rA.model.modelVersion !== rB.model.modelVersion) inputDifferences.push(`model: ${rA.model.modelVersion} → ${rB.model.modelVersion}`);
  if (a.codeCommitHash !== b.codeCommitHash) inputDifferences.push(`commit: ${a.codeCommitHash.slice(0, 12)} → ${b.codeCommitHash.slice(0, 12)}`);

  const sameInputFingerprint = rA.inputFingerprint === rB.inputFingerprint;
  const sameResultFingerprint = rA.runFingerprint !== null && rA.runFingerprint === rB.runFingerprint;

  if (rA.seed !== rB.seed) {
    return blocked('SEED_MISMATCH', 'Różne ziarna — wyniki nie są porównywalne jako odtworzenie tego samego przebiegu.', inputDifferences, sameInputFingerprint, sameResultFingerprint);
  }
  if (rA.scenarios.baseline !== rB.scenarios.baseline || rA.scenarios.variant !== rB.scenarios.variant) {
    return blocked('SCENARIO_MISMATCH', 'Różne scenariusze — porównanie metryk nie ma wspólnego odniesienia.', inputDifferences, sameInputFingerprint, sameResultFingerprint);
  }
  if (rA.initialConditions.nAgents !== rB.initialConditions.nAgents) {
    return blocked('POPULATION_MISMATCH', 'Różna liczność populacji.', inputDifferences, sameInputFingerprint, sameResultFingerprint);
  }
  if (rA.arms.length !== 2 || rB.arms.length !== 2 || rA.arms.some((arm) => arm.summary === null) || rB.arms.some((arm) => arm.summary === null)) {
    return blocked('ARM_NOT_EXECUTED', 'Co najmniej jedno ramię nie ma wyniku do porównania.', inputDifferences, sameInputFingerprint, sameResultFingerprint);
  }

  const baselineDeltas = armDeltas(rA.arms[0], rB.arms[0]);
  const variantDeltas = armDeltas(rA.arms[1], rB.arms[1]);
  const matchStatus: ExperimentComparison['matchStatus'] = !sameInputFingerprint ? 'NOT_COMPARABLE' : sameResultFingerprint ? 'MATCH' : 'DRIFT';

  return {
    status: 'COMPARABLE',
    inputDifferences,
    resultDeltas: { baseline: baselineDeltas ?? [], variant: variantDeltas ?? [] },
    sameInputFingerprint,
    sameResultFingerprint,
    matchStatus,
    message: matchStatus === 'MATCH'
      ? 'Te same wejścia, te same wyniki.'
      : matchStatus === 'DRIFT'
        ? 'Te same wejścia, różne wyniki — sprawdź determinizm.'
        : `Różne wejścia (${inputDifferences.join('; ')}) — to dwa różne eksperymenty, nie weryfikacja odtwarzalności jednego.`,
  };
}

function blocked(
  reason: ExperimentBlockReason,
  message: string,
  inputDifferences: readonly string[],
  sameInputFingerprint: boolean,
  sameResultFingerprint: boolean,
): ExperimentComparison {
  return {
    status: 'BLOCKED',
    blockedReason: reason,
    inputDifferences,
    resultDeltas: null,
    sameInputFingerprint,
    sameResultFingerprint,
    matchStatus: 'NOT_COMPARABLE',
    message,
  };
}
