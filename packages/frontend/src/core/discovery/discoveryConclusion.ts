import type { FalsificationCriterion } from '../experimentFabric/scientificDiscovery';
import type {
  DiscoveryCase,
  DiscoveryComparison,
  DiscoveryConclusion,
  DiscoveryCriterionCheck,
  DiscoveryReplay,
  DiscoveryVerdict,
} from './discoveryCase';

/**
 * DISCOVERY CONCLUSION — wniosek wyprowadzony, nie napisany.
 *
 * Wniosek powstaje wyłącznie z czterech rzeczy: WYNIKU realnych przebiegów,
 * PORÓWNANIA z kontrolowaną różnicą, tożsamości MODELU i kompletności DOWODU.
 * Nie ma tu generowania tekstu „pod tezę": kryterium falsyfikacji jest
 * prerejestrowane w hipotezie, a moduł tylko sprawdza, czy realne liczby je
 * spełniają.
 *
 * Kiedy dowód nie wystarcza — porównanie zablokowane, odtworzenie nieudane,
 * metryki brak — werdykt brzmi INSUFFICIENT_EVIDENCE. Werdykt pozytywny jest
 * zawsze „w granicach protokołu i modelu", nigdy odkryciem o świecie.
 */

/** Relacje sensowne dopiero przy serii punktów, nie przy dwóch ramionach. */
const SERIES_ONLY_RELATIONS: readonly FalsificationCriterion['relation'][] = ['monotonic-increase', 'monotonic-decrease'];

function checkCriterion(criterion: FalsificationCriterion, comparison: DiscoveryComparison): DiscoveryCriterionCheck {
  const metric = comparison.metrics.find((m) => m.key === criterion.metric);
  const base = {
    criterion,
    metricKey: criterion.metric,
    baseline: metric ? metric.baseline : null,
    variant: metric ? metric.variant : null,
  };
  if (!metric) {
    return { ...base, met: false, explanation: `Metryka „${criterion.metric}" nie występuje w tym porównaniu.` };
  }
  if (SERIES_ONLY_RELATIONS.includes(criterion.relation)) {
    return {
      ...base,
      met: false,
      explanation: `Relacja „${criterion.relation}" wymaga serii punktów (sweepu), a nie porównania dwóch ramion.`,
    };
  }
  const reference = criterion.expectedValue ?? metric.baseline;
  const referenceLabel = criterion.expectedValue === undefined ? 'wartości bazowej' : String(criterion.expectedValue);
  switch (criterion.relation) {
    case 'greater-than':
      return {
        ...base,
        met: metric.variant > reference,
        explanation: `Wariant ${metric.variant} wobec ${referenceLabel} (${reference}): oczekiwano większej wartości.`,
      };
    case 'less-than':
      return {
        ...base,
        met: metric.variant < reference,
        explanation: `Wariant ${metric.variant} wobec ${referenceLabel} (${reference}): oczekiwano mniejszej wartości.`,
      };
    case 'equal-within-tolerance': {
      if (criterion.tolerance === undefined) {
        return { ...base, met: false, explanation: 'Kryterium równości wymaga prerejestrowanej tolerancji.' };
      }
      const diff = Math.abs(metric.variant - reference);
      return {
        ...base,
        met: diff <= criterion.tolerance,
        explanation: `|${metric.variant} − ${reference}| = ${diff}; tolerancja ${criterion.tolerance}.`,
      };
    }
    default:
      return { ...base, met: false, explanation: `Nieobsługiwana relacja „${criterion.relation}".` };
  }
}

function insufficient(reason: string, limitations: readonly string[]): DiscoveryConclusion {
  return {
    verdict: 'INSUFFICIENT_EVIDENCE',
    primary: null,
    supporting: [],
    basis: [reason],
    limitations,
    message: `Dowód niewystarczający: ${reason}`,
  };
}

/**
 * Wyprowadza wniosek ze sprawy. Wymaga wykonanego porównania i zweryfikowanego
 * odtworzenia — bez nich żaden werdykt merytoryczny nie zapada.
 */
export function deriveDiscoveryConclusion(
  record: DiscoveryCase,
  comparison: DiscoveryComparison | null,
  replay: DiscoveryReplay | null,
): DiscoveryConclusion {
  const limitations = record.limitations;
  if (record.notModeledReason) return insufficient(`model nie wyraża tego eksperymentu (${record.notModeledReason}).`, limitations);
  if (comparison === null) return insufficient('brak porównania.', limitations);
  if (comparison.status !== 'COMPLETED') {
    return insufficient(`porównanie zablokowane (${comparison.blockedReason ?? 'nieznany powód'}): ${comparison.message}`, limitations);
  }
  if (replay === null) return insufficient('brak odtworzenia przebiegu.', limitations);
  if (replay.status !== 'MATCH' && replay.status !== 'WITHIN_TOLERANCE') {
    return insufficient(`odtworzenie nie potwierdziło przebiegu (${replay.status}): ${replay.message}`, limitations);
  }

  const primary = checkCriterion(record.hypothesis.falsification, comparison);
  const supporting = (record.hypothesis.supportingCriteria ?? []).map((c) => checkCriterion(c, comparison));
  const failedSupporting = supporting.filter((s) => !s.met);

  const basis: string[] = [
    `model: ${record.model.modelId}@${record.model.modelVersion} (${record.model.engine})`,
    `ziarno: ${record.seed}, populacja: ${record.initialConditions.nAgents}, horyzont: ${record.initialConditions.days} dni`,
    `kontrolowana różnica: ${comparison.controlledDifference}`,
    `odtworzenie: ${replay.status}`,
    ...comparison.metrics.map(
      (m) => `${m.key}: ${m.baseline} → ${m.variant}${m.relativeDeltaPercent === null ? '' : ` (${m.relativeDeltaPercent.toFixed(1)}%)`}`,
    ),
    `kryterium prerejestrowane: ${primary.explanation}`,
  ];

  let verdict: DiscoveryVerdict;
  let message: string;
  if (!primary.met) {
    verdict = 'NOT_SUPPORTED';
    message = `Prerejestrowane kryterium nie zostało spełnione przez realne przebiegi. ${primary.explanation}`;
  } else if (failedSupporting.length > 0) {
    verdict = 'PARTIALLY_SUPPORTED';
    message = `Kryterium główne spełnione, ale ${failedSupporting.length} z ${supporting.length} kryteriów wspierających nie: ${failedSupporting.map((s) => s.metricKey).join(', ')}.`;
  } else {
    verdict = 'SUPPORTED';
    message = 'Kryterium prerejestrowane spełnione przez realne, odtworzone przebiegi — w granicach protokołu i tego modelu, bez roszczenia o świat rzeczywisty.';
  }
  return { verdict, primary, supporting, basis, limitations, message };
}
