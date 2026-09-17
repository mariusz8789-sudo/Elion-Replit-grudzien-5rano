import { evaluateTwoArmRelation } from '../experimentFabric/falsificationRelation';
import type { FalsificationCriterion } from '../experimentFabric/scientificDiscovery';
import { assessTautology, type TautologyAssessment, type TautologyComponent } from '../agent/tautologyGate';
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
function checkCriterion(
  criterion: FalsificationCriterion,
  comparison: DiscoveryComparison,
  classificationByMetric: ReadonlyMap<string, TautologyComponentAssessmentClassification>,
): DiscoveryCriterionCheck {
  const metric = comparison.metrics.find((m) => m.key === criterion.metric);
  const tautologyClassification = classificationByMetric.get(criterion.metric) ?? null;
  const base = {
    criterion,
    metricKey: criterion.metric,
    baseline: metric ? metric.baseline : null,
    variant: metric ? metric.variant : null,
    tautologyClassification,
  };
  if (!metric) {
    // Missing data is undecidable, not false. Reporting `met: false` here would
    // make a metric nobody measured look like a criterion that was tested.
    return { ...base, applicable: false, met: false, explanation: `Metryka „${criterion.metric}" nie występuje w tym porównaniu.` };
  }
  const outcome = evaluateTwoArmRelation(criterion, metric.baseline, metric.variant);
  return { ...base, applicable: outcome.applicable, met: outcome.met, explanation: outcome.explanation };
}

function insufficient(
  reason: string,
  limitations: readonly string[],
  tautologyAssessment: TautologyAssessment | null = null,
): DiscoveryConclusion {
  return {
    verdict: 'INSUFFICIENT_EVIDENCE',
    primary: null,
    supporting: [],
    basis: [reason],
    limitations,
    message: `Dowód niewystarczający: ${reason}`,
    tautologyAssessment,
  };
}

type TautologyComponentAssessmentClassification = 'CONSISTENCY_CHECK' | 'EMPIRICAL_TEST' | 'UNTESTABLE';

/**
 * Reuse istniejącej Bramki Tautologii — zero drugiej bramki. Zbiera WSZYSTKIE
 * `DiscoveryHypothesis.observableDerivations` zadeklarowane dla tej sprawy w
 * JEDNĄ listę `TautologyComponent[]` (klucz Recordu staje się `componentId`)
 * i woła `assessTautology` RAZ, na całości naraz — dokładnie tak `MIXED_TEST`
 * (C6) powstaje: część zadeklarowanych metryk klasyfikuje się jako
 * `CONSISTENCY_CHECK`, część jako `EMPIRICAL_TEST`, gate agreguje to samo,
 * bez pomagania mu z zewnątrz.
 */
function assessDeclaredDerivations(record: DiscoveryCase): TautologyAssessment | null {
  const derivations = record.hypothesis.observableDerivations;
  if (!derivations || Object.keys(derivations).length === 0) return null;
  const components: TautologyComponent[] = Object.entries(derivations).map(([metricKey, derivation]) => ({
    componentId: metricKey,
    ...derivation,
  }));
  return assessTautology(components);
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

  // Reuse istniejącej Bramki Tautologii, RAZ, nad wszystkimi zadeklarowanymi
  // metrykami naraz — patrz `assessDeclaredDerivations`'s own doc. `null` gdy
  // `record.hypothesis.observableDerivations` nigdy nie zostało zadeklarowane:
  // każdy istniejący `DiscoveryCase` zachowuje się dokładnie jak dotąd.
  const tautologyAssessment = assessDeclaredDerivations(record);
  const classificationByMetric = new Map(
    (tautologyAssessment?.components ?? []).map((c) => [c.componentId, c.classification] as const),
  );

  const primary = checkCriterion(record.hypothesis.falsification, comparison, classificationByMetric);
  /**
   * A criterion this comparison cannot settle never reaches a verdict. The
   * relation module already refuses to decide it (`applicable: false`), and the
   * honest conclusion is the one this file already has for "the evidence does
   * not reach": INSUFFICIENT_EVIDENCE — not NOT_SUPPORTED, which would announce
   * a falsification that no run produced.
   */
  if (!primary.applicable) {
    return insufficient(`kryterium prerejestrowane nie jest rozstrzygalne tym porównaniem: ${primary.explanation}`, limitations, tautologyAssessment);
  }
  /**
   * Tautology Gate boundary — mirrors `inquiryLoop.ts`'s `evidenceCeiling`
   * exactly, generalized from a numeric magnitude cap to this module's own
   * categorical verdict: a CONSISTENCY_CHECK/UNTESTABLE primary criterion
   * cannot move the verdict in EITHER direction, `met` or not — being met by
   * construction is not evidence, and reporting NOT_SUPPORTED for a broken
   * invariant would misreport a validity problem as a scientific falsification.
   * Reused as-is; no second gate, no re-derivation of the rule.
   */
  if (primary.tautologyClassification === 'CONSISTENCY_CHECK' || primary.tautologyClassification === 'UNTESTABLE') {
    return insufficient(
      `kryterium prerejestrowane sklasyfikowane przez Tautology Gate jako ${primary.tautologyClassification} — spełnienie (met=${primary.met}) nie niesie informacji dowodowej: ${primary.explanation}`,
      limitations,
      tautologyAssessment,
    );
  }

  const supporting = (record.hypothesis.supportingCriteria ?? []).map((c) => checkCriterion(c, comparison, classificationByMetric));
  const isTautologicallyInert = (s: DiscoveryCriterionCheck) =>
    s.tautologyClassification === 'CONSISTENCY_CHECK' || s.tautologyClassification === 'UNTESTABLE';
  /**
   * Same rule one level down: an unsettled supporting criterion is not a failed
   * one, so it must not downgrade a supported primary. It is still reported
   * below rather than dropped — silence would be its own kind of overstatement.
   * A tautologically inert supporting criterion is excluded the same way,
   * whether it happened to come out `met` or not — see the primary check above.
   */
  const failedSupporting = supporting.filter((s) => s.applicable && !s.met && !isTautologicallyInert(s));
  const unsettledSupporting = supporting.filter((s) => !s.applicable);
  const inertSupporting = supporting.filter((s) => s.applicable && isTautologicallyInert(s));

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
    ...inertSupporting.map(
      (s) => `kryterium wspierające „${s.metricKey}" wykluczone z wniosku przez Tautology Gate (${s.tautologyClassification}, met=${s.met}): ${s.explanation}`,
    ),
    ...(tautologyAssessment
      ? [`Tautology Gate: ${tautologyAssessment.classification} (${tautologyAssessment.components.map((c) => `${c.componentId}=${c.classification}`).join(', ')}).`]
      : []),
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
  return { verdict, primary, supporting, basis, limitations, message, tautologyAssessment };
}
