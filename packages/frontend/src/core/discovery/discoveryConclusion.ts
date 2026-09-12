import { evaluateTwoArmRelation } from '../experimentFabric/falsificationRelation';
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

/**
 * Rozstrzygnięcie relacji należy do `experimentFabric/falsificationRelation.ts`
 * — tego samego, jedynego miejsca, z którego korzysta warstwa kontrfaktyków
 * world-model. Tutaj zostaje wyłącznie to, co jest specyficzne dla tego
 * porównania: odnalezienie metryki i kształt `DiscoveryCriterionCheck`.
 */
function checkCriterion(criterion: FalsificationCriterion, comparison: DiscoveryComparison): DiscoveryCriterionCheck {
  const metric = comparison.metrics.find((m) => m.key === criterion.metric);
  const base = {
    criterion,
    metricKey: criterion.metric,
    baseline: metric ? metric.baseline : null,
    variant: metric ? metric.variant : null,
  };
  if (!metric) {
    // Missing data is undecidable, not false. Reporting `met: false` here would
    // make a metric nobody measured look like a criterion that was tested.
    return { ...base, applicable: false, met: false, explanation: `Metryka „${criterion.metric}" nie występuje w tym porównaniu.` };
  }
  const outcome = evaluateTwoArmRelation(criterion, metric.baseline, metric.variant);
  return { ...base, applicable: outcome.applicable, met: outcome.met, explanation: outcome.explanation };
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
  /**
   * A criterion this comparison cannot settle never reaches a verdict. The
   * relation module already refuses to decide it (`applicable: false`), and the
   * honest conclusion is the one this file already has for "the evidence does
   * not reach": INSUFFICIENT_EVIDENCE — not NOT_SUPPORTED, which would announce
   * a falsification that no run produced.
   */
  if (!primary.applicable) {
    return insufficient(`kryterium prerejestrowane nie jest rozstrzygalne tym porównaniem: ${primary.explanation}`, limitations);
  }

  const supporting = (record.hypothesis.supportingCriteria ?? []).map((c) => checkCriterion(c, comparison));
  /**
   * Same rule one level down: an unsettled supporting criterion is not a failed
   * one, so it must not downgrade a supported primary. It is still reported
   * below rather than dropped — silence would be its own kind of overstatement.
   */
  const failedSupporting = supporting.filter((s) => s.applicable && !s.met);
  const unsettledSupporting = supporting.filter((s) => !s.applicable);

  const basis: string[] = [
    `model: ${record.model.modelId}@${record.model.modelVersion} (${record.model.engine})`,
    `ziarno: ${record.seed}, populacja: ${record.initialConditions.nAgents}, horyzont: ${record.initialConditions.days} dni`,
    `kontrolowana różnica: ${comparison.controlledDifference}`,
    `odtworzenie: ${replay.status}`,
    ...comparison.metrics.map(
      (m) => `${m.key}: ${m.baseline} → ${m.variant}${m.relativeDeltaPercent === null ? '' : ` (${m.relativeDeltaPercent.toFixed(1)}%)`}`,
    ),
    `kryterium prerejestrowane: ${primary.explanation}`,
    ...unsettledSupporting.map((s) => `kryterium wspierające „${s.metricKey}" nierozstrzygalne: ${s.explanation}`),
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
