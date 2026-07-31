/**
 * Adaptacyjny silnik „następnego eksperymentu" (P5) — RDZEŃ RÓŻNICUJĄCY.
 *
 * Po każdej wykonanej generacji analizuje REALNE dane kampanii (front Pareto,
 * hiperobjętość, różnorodność, skuteczność transformacji, odrzucenia, budżet) i
 * wybiera następny eksperyment obliczeniowy. To reguły deterministyczne oparte
 * na dowodach — NIE uczenie się, NIE AGI. Zwrócona `newStrategy` MUSI realnie
 * zmienić kolejną generację (inne wagi transformacji / inny dobór rodziców).
 */

export const DECISIONS = {
  EXPLOIT_PROMISING_REGION: 'EXPLOIT_PROMISING_REGION',
  INCREASE_DIVERSITY: 'INCREASE_DIVERSITY',
  CHANGE_TRANSFORMATION_WEIGHTS: 'CHANGE_TRANSFORMATION_WEIGHTS',
  DISABLE_LOW_VALUE_TRANSFORMATION: 'DISABLE_LOW_VALUE_TRANSFORMATION',
  INCREASE_HIGH_VALUE_TRANSFORMATION: 'INCREASE_HIGH_VALUE_TRANSFORMATION',
  STOP_OBJECTIVE_REACHED: 'STOP_OBJECTIVE_REACHED',
  STOP_NO_IMPROVEMENT: 'STOP_NO_IMPROVEMENT',
  STOP_RESOURCE_LIMIT: 'STOP_RESOURCE_LIMIT',
};

const STOP_SET = new Set([DECISIONS.STOP_OBJECTIVE_REACHED, DECISIONS.STOP_NO_IMPROVEMENT, DECISIONS.STOP_RESOURCE_LIMIT]);
export const isStop = (d) => STOP_SET.has(d);

/**
 * @param ctx {
 *   generation, strategy {transformationWeights, parentSelection},
 *   metrics {paretoSize, hypervolume, bestScalar, diversity, transformationStats, rejections, retainedCount},
 *   history [{hypervolume,bestScalar}...],  budget, stopping
 * }
 * @returns { decision, params, purpose, newStrategy }
 */
export function analyzeAndDecide(ctx) {
  const { generation, strategy, metrics, history, budget, stopping } = ctx;
  const weights = { ...strategy.transformationWeights };

  // ---- Warunki stopu (jawne) ----
  if (stopping.objectiveThreshold !== undefined && metrics.bestScalar !== null && metrics.bestScalar <= stopping.objectiveThreshold) {
    return stop(DECISIONS.STOP_OBJECTIVE_REACHED, strategy, `Osiągnięto próg celu (bestScalar ${metrics.bestScalar.toFixed(4)} ≤ ${stopping.objectiveThreshold}).`);
  }
  if (budget.maxGenerations !== undefined && generation >= budget.maxGenerations) {
    return stop(DECISIONS.STOP_RESOURCE_LIMIT, strategy, `Limit generacji (${budget.maxGenerations}).`);
  }
  // Stagnacja: brak poprawy hiperobjętości przez `patience` generacji.
  const patience = stopping.patience ?? 2;
  const minImp = stopping.minImprovement ?? 1e-4;
  if (history.length >= patience) {
    const recent = history.slice(-patience - 1);
    const improved = recent.length >= 2 && (recent[recent.length - 1].hypervolume - recent[0].hypervolume) > minImp;
    if (!improved) {
      return stop(DECISIONS.STOP_NO_IMPROVEMENT, strategy, `Brak poprawy hiperobjętości > ${minImp} przez ${patience} generacji.`);
    }
  }

  // ---- Adaptacja (kolejność priorytetów) ----
  const stats = metrics.transformationStats ?? {};

  // 1) Wyłącz transformację o zerowej skuteczności (po min. próbach).
  for (const [t, s] of Object.entries(stats)) {
    if (weights[t] > 0 && s.attempts >= 2 && s.successes === 0) {
      weights[t] = 0;
      return decide(DECISIONS.DISABLE_LOW_VALUE_TRANSFORMATION,
        { transformation: t, successRate: 0 },
        { ...strategy, transformationWeights: weights },
        `Transformacja „${t}" nie dała żadnych ważnych produktów w ${s.attempts} próbach — wyłączona.`);
    }
  }

  // 2) Za mała różnorodność → zwiększ eksplorację (włącz wszystko, dobór różnorodny).
  const diversityFloor = stopping.diversityFloor ?? 0.15;
  if (metrics.diversity !== null && metrics.diversity < diversityFloor) {
    for (const t of Object.keys(weights)) weights[t] = 1;
    return decide(DECISIONS.INCREASE_DIVERSITY,
      { diversity: metrics.diversity, floor: diversityFloor },
      { ...strategy, transformationWeights: weights, parentSelection: 'diverse' },
      `Różnorodność ${metrics.diversity?.toFixed(3)} < ${diversityFloor} — zwiększam eksplorację i dobieram rodziców różnorodnie.`);
  }

  // 3) Front się poprawił → eksploatuj: wzmocnij transformacje, które trafiły na Pareto.
  const improvedNow = history.length >= 2 && (metrics.hypervolume - history[history.length - 2].hypervolume) > minImp;
  const paretoContribs = Object.entries(stats).filter(([, s]) => (s.paretoContrib ?? 0) > 0).map(([t]) => t);
  if (improvedNow && paretoContribs.length > 0) {
    for (const t of paretoContribs) weights[t] = Math.min((weights[t] || 1) + 1, 3);
    return decide(DECISIONS.INCREASE_HIGH_VALUE_TRANSFORMATION,
      { transformations: paretoContribs },
      { ...strategy, transformationWeights: weights, parentSelection: 'pareto' },
      `Front Pareto poprawiony — wzmacniam transformacje trafiające na front: ${paretoContribs.join(', ')}.`);
  }

  // 4) Domyślnie: rebalans wag po skuteczności (delikatna zmiana wykonania).
  for (const [t, s] of Object.entries(stats)) {
    if (weights[t] > 0) {
      const rate = s.attempts > 0 ? s.successes / s.attempts : 0;
      weights[t] = rate >= 0.5 ? 2 : 1;
    }
  }
  return decide(DECISIONS.CHANGE_TRANSFORMATION_WEIGHTS,
    { rebalancedBy: 'success-rate' },
    { ...strategy, transformationWeights: weights, parentSelection: 'pareto' },
    'Rebalans wag transformacji wg skuteczności; eksploatacja frontu.');
}

function decide(decision, params, newStrategy, purpose) {
  return { decision, params, newStrategy, purpose };
}
function stop(decision, strategy, purpose) {
  return { decision, params: {}, newStrategy: strategy, purpose };
}
