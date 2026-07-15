/**
 * Active Learning (Genesis V3, Phase 5). Genesis learns from COMPLETED campaigns — never from
 * invented training data. Given the real dossiers of finished campaigns, it measures which
 * generation transformations and molecular features actually correlated with high-ranked survivors
 * (and low off-target risk), then emits a deterministic learned policy that (a) improves candidate
 * ranking, (b) biases future campaign planning (transformation weights + seed guidance), and
 * (c) prioritises compounds. Reproducible; with no completed campaigns it returns INSUFFICIENT_DATA.
 */
import * as stats from '../benchmark/stats.mjs';

export const ACTIVE_LEARNING_VERSION = 'genesis-active-learning/1';
const round = (x, d = 4) => (typeof x === 'number' && Number.isFinite(x) ? +x.toFixed(d) : x);
const RISK_NUM = { LOW: 0, MEDIUM: 1, HIGH: 2 };

/** Extract per-candidate learning features + outcomes from a campaign dossier (real outputs only). */
export function extractExperience(dossier) {
  const out = [];
  for (const c of dossier?.candidates ?? []) {
    const d = c.descriptors ?? {};
    out.push({
      campaignId: dossier.campaign?.id ?? null,
      transformation: c.provenance?.transformation ?? (c.rationale?.match(/via ([a-z-]+)/)?.[1]) ?? 'seed',
      finalScore: typeof c.finalScore === 'number' ? c.finalScore : (c.ranking?.finalScore ?? null),
      survived: c.survives === true,
      lipinskiViolations: d.lipinskiViolations ?? null,
      nAlerts: c.structuralAlerts ? c.structuralAlerts.length : (typeof c.nAlerts === 'number' ? c.nAlerts : null),
      molWt: d.molWt ?? null,
      offTargetRisk: c.offTarget?.risk ?? null,
    });
  }
  return out;
}

/**
 * Learn a policy from an array of completed campaign dossiers (or pre-extracted experience rows).
 * Returns { status, transformationWeights, featureCorrelations, planning, prioritisationPolicyVersion }.
 */
export function learnFromCampaigns(dossiersOrRows, { minSamples = 5 } = {}) {
  const rows = (dossiersOrRows ?? []).flatMap((x) => (x && x.candidates ? extractExperience(x) : (Array.isArray(x) ? x : [x]))).filter(Boolean);
  const scored = rows.filter((r) => typeof r.finalScore === 'number');
  if (scored.length < minSamples) {
    return { status: 'INSUFFICIENT_DATA', version: ACTIVE_LEARNING_VERSION, samples: scored.length, reason: `need >= ${minSamples} scored candidates from completed campaigns; have ${scored.length} (no training data fabricated)` };
  }

  // Transformation value = mean finalScore + survival rate − off-target-HIGH rate (evidence-based).
  const byTf = new Map();
  for (const r of scored) {
    const k = r.transformation ?? 'seed';
    if (!byTf.has(k)) byTf.set(k, { n: 0, scoreSum: 0, survived: 0, highRisk: 0 });
    const t = byTf.get(k); t.n++; t.scoreSum += r.finalScore; if (r.survived) t.survived++; if (r.offTargetRisk === 'HIGH') t.highRisk++;
  }
  const transformationWeights = {};
  const transformationStats = {};
  for (const [k, t] of [...byTf.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const meanScore = t.scoreSum / t.n; const survivalRate = t.survived / t.n; const highRiskRate = t.highRisk / t.n;
    transformationStats[k] = { n: t.n, meanScore: round(meanScore), survivalRate: round(survivalRate), highOffTargetRate: round(highRiskRate) };
    transformationWeights[k] = round(Math.max(0, 0.6 * meanScore + 0.4 * survivalRate - 0.3 * highRiskRate));
  }

  // Feature → outcome correlations (which descriptors track higher finalScore).
  const featureCorrelations = {};
  for (const f of ['lipinskiViolations', 'nAlerts', 'molWt', 'offTargetRiskNum']) {
    const pairs = scored.map((r) => [f === 'offTargetRiskNum' ? (RISK_NUM[r.offTargetRisk] ?? null) : r[f], r.finalScore]).filter((p) => typeof p[0] === 'number');
    featureCorrelations[f] = pairs.length >= 2 ? round(stats.pearsonR(pairs.map((p) => p[0]), pairs.map((p) => p[1]))) : null;
  }

  // Planning guidance for the NEXT campaign.
  const sortedTf = Object.entries(transformationWeights).sort((a, b) => b[1] - a[1]);
  const planning = {
    prioritiseTransformations: sortedTf.filter(([, w]) => w > 0).slice(0, 3).map(([k]) => k),
    deprioritiseTransformations: sortedTf.filter(([, w]) => w <= 0.05).map(([k]) => k),
    featureGuidance: Object.entries(featureCorrelations).filter(([, v]) => typeof v === 'number' && Math.abs(v) >= 0.2)
      .map(([f, v]) => `${f} correlates ${v >= 0 ? 'positively' : 'negatively'} with score (r=${v}) → ${v >= 0 ? 'favour' : 'penalise'}`),
  };

  return {
    status: 'COMPLETED', version: ACTIVE_LEARNING_VERSION, samples: scored.length, campaignsLearnedFrom: new Set(scored.map((r) => r.campaignId).filter(Boolean)).size,
    transformationWeights, transformationStats, featureCorrelations, planning,
    honesty: 'Learned only from real completed-campaign outcomes. No training data was invented.',
  };
}

/**
 * Re-prioritise candidates using a learned policy (improves candidate ranking / compound
 * prioritisation). Blends the base finalScore with the learned transformation weight, transparently.
 * `candidates`: [{ candidateId, finalScore, transformation }]. Returns a re-ranked list.
 */
export function prioritiseCandidates(candidates, policy, { learnedWeight = 0.25 } = {}) {
  if (!policy || policy.status !== 'COMPLETED') {
    return { status: policy?.status ?? 'INSUFFICIENT_DATA', ranking: (candidates ?? []).map((c, i) => ({ rank: i + 1, candidateId: c.candidateId, priorityScore: c.finalScore ?? 0, learnedAdjustment: 0 })) };
  }
  const ranked = (candidates ?? []).map((c) => {
    const tw = policy.transformationWeights[c.transformation ?? 'seed'] ?? 0;
    const base = typeof c.finalScore === 'number' ? c.finalScore : 0;
    const priorityScore = +((1 - learnedWeight) * base + learnedWeight * tw).toFixed(6);
    return { candidateId: c.candidateId, transformation: c.transformation ?? 'seed', baseScore: base, learnedTransformationWeight: tw, priorityScore };
  }).sort((a, b) => b.priorityScore - a.priorityScore || String(a.candidateId).localeCompare(String(b.candidateId)));
  return { status: 'COMPLETED', prioritisationPolicyVersion: ACTIVE_LEARNING_VERSION, ranking: ranked.map((r, i) => ({ rank: i + 1, ...r })) };
}
