import { fnv1a, canonicalJson } from '../events/hash';
import type { CampaignResult } from '../agent/discoveryCampaign';
import type { ModelFit, ModelSpec } from '../agent/modelSpace';
import { linearCoefficientFor } from './discoveryBenchAdapter';
import type { BenchmarkCase, BenchmarkCaseResult, CaseOutcome } from './types';

/**
 * DISCOVERYBENCH SCORER — reads Genesis's two REAL, already-computed facets
 * (Facet A: `fitModelSpec` on the full declared covariate set; Facet B:
 * `runDiscoveryCampaign`'s own autonomous search) and judges each frozen
 * case's `expected` rule against them. Produces no number DiscoveryBench's
 * own `discovery_eval.py` would recognise as its official HMS — that metric
 * needs a private LLM API this sandbox does not have (see
 * `discoveryBenchManifest.ts::OFFICIAL_HMS_METRIC_STATUS`). Every field here
 * is instead a disclosed, rule-based, fully replayable substitute over the
 * SAME real gold text.
 *
 * `reasoningValidity` measures INCLUSION consistency only, not sign
 * agreement: Facet B's own `Discovery.winningModel` exposes a rendered
 * formula and fingerprint, not a raw coefficient array, so recovering a
 * per-variable SIGN out of it would mean re-parsing rendered text — a real
 * risk of a wrong parse standing in for a real number. Whether the
 * autonomous search's own winning model INCLUDES the variable at all is a
 * substring check on that same formula and carries no such risk; this
 * function says exactly that, and nothing more, about what it checked.
 */

const T_STAT_SIGNIFICANCE_THRESHOLD = 1.96; // normal-approximation 5% two-sided threshold; disclosed, not a fitted/tuned value.

function includesVariable(formula: string | null, variable: string): boolean {
  return formula !== null && formula.includes(variable);
}

export function scoreEvolutionFishCase(
  benchmarkCase: BenchmarkCase,
  facetASpec: ModelSpec,
  facetA: ModelFit,
  facetB: CampaignResult,
): BenchmarkCaseResult {
  const runFingerprint = fnv1a(canonicalJson({
    caseFingerprint: benchmarkCase.fingerprint,
    facetAOk: facetA.ok,
    facetACoefficients: facetA.ok ? facetA.coefficients : null,
    facetBCampaignFingerprint: facetB.campaignFingerprint,
  }));

  if (!facetA.ok) {
    // Genesis's own fitting engine refused this fit — an honest UNKNOWN, never coerced to a false claim.
    return {
      caseId: benchmarkCase.caseId,
      outcome: 'UNKNOWN',
      taskSuccess: false,
      scientificCorrectness: null,
      reasoningValidity: null,
      evidenceUse: 'Facet A (fitModelSpec on the full declared covariate set) refused to fit.',
      falsificationBehavior: null,
      rationale: `fitModelSpec refused: ${facetA.reason}`,
      runFingerprint,
    };
  }

  const winningFormula = facetB.discovery.winningModel?.formula ?? null;
  const evidence: string[] = [`Facet A fit on ${facetA.coefficients.length} coefficients over the full declared covariate set (real 460-row CSV).`];
  const rationale: string[] = [];
  let scientificCorrectness = true;
  let reasoningValidity = true;
  let anyMissing = false;

  const checkClaim = (variable: string, expectedSign: 'POSITIVE' | 'NEGATIVE', claimedCoefficient: number | null): void => {
    const found = linearCoefficientFor(facetASpec, facetA, variable);
    if (found === null) {
      anyMissing = true;
      rationale.push(`${variable}: not present in the fitted model's own terms (should not happen for the full covariate spec) — treated as UNKNOWN, not FAIL.`);
      return;
    }
    const actualSign = found.coefficient > 0 ? 'POSITIVE' : found.coefficient < 0 ? 'NEGATIVE' : 'ZERO';
    const signMatch = actualSign === expectedSign;
    scientificCorrectness = scientificCorrectness && signMatch;
    const magnitudeNote = claimedCoefficient === null
      ? ''
      : ` (claimed ${claimedCoefficient}, relative difference ${(Math.abs((found.coefficient - claimedCoefficient) / claimedCoefficient) * 100).toFixed(2)}%)`;
    rationale.push(`${variable}: Genesis fit coefficient ${found.coefficient.toPrecision(6)}${magnitudeNote} — sign ${actualSign}, gold claims ${expectedSign} → ${signMatch ? 'MATCH' : 'MISMATCH'}.`);
    const included = includesVariable(winningFormula, variable);
    reasoningValidity = reasoningValidity && included;
    rationale.push(`${variable}: autonomous campaign's own winning model (${winningFormula ?? 'none — no fittable model'}) ${included ? 'INCLUDES' : 'DOES NOT include'} this variable, consistent with a real (non-null) predictor claim: ${included ? 'CONSISTENT' : 'INCONSISTENT'}.`);
  };

  if (benchmarkCase.expected.kind === 'COEFFICIENT_SIGN') {
    for (const claim of benchmarkCase.expected.claims) checkClaim(claim.variable, claim.sign, claim.claimedCoefficient);
  } else {
    const variable = benchmarkCase.expected.variable;
    const found = linearCoefficientFor(facetASpec, facetA, variable);
    if (found === null || found.standardError === null) {
      anyMissing = true;
      rationale.push(`${variable}: standard error unavailable (degenerate fit) — cannot judge significance; UNKNOWN, not FAIL.`);
    } else {
      const tStat = found.coefficient / found.standardError;
      const notSignificant = Math.abs(tStat) < T_STAT_SIGNIFICANCE_THRESHOLD;
      scientificCorrectness = scientificCorrectness && notSignificant;
      rationale.push(`${variable}: |t| = ${Math.abs(tStat).toFixed(3)} (coefficient ${found.coefficient.toPrecision(4)} / SE ${found.standardError.toPrecision(4)}), threshold ${T_STAT_SIGNIFICANCE_THRESHOLD} → ${notSignificant ? 'NOT significant, matching gold' : 'appears significant, contradicting gold\'s null claim'}.`);
      const included = includesVariable(winningFormula, variable);
      reasoningValidity = reasoningValidity && !included; // gold says this variable does NOT matter; a consistent autonomous search would drop it.
      rationale.push(`${variable}: autonomous campaign's winning model (${winningFormula ?? 'none'}) ${included ? 'includes' : 'excludes'} this variable — ${included ? 'INCONSISTENT' : 'CONSISTENT'} with gold's null claim.`);
    }
  }

  const outcome: CaseOutcome = anyMissing ? 'UNKNOWN' : scientificCorrectness ? 'CORRECT' : 'INCORRECT';
  return {
    caseId: benchmarkCase.caseId,
    outcome,
    taskSuccess: true,
    scientificCorrectness: anyMissing ? null : scientificCorrectness,
    reasoningValidity: anyMissing ? null : reasoningValidity,
    evidenceUse: evidence.join(' '),
    falsificationBehavior: `Autonomous campaign stopped with ${facetB.stopReason} after ${facetB.rounds.length} round(s); anti-HARK intact every round: ${facetB.rounds.every((r) => r.antiHarking.intact)}.`,
    rationale: rationale.join(' '),
    runFingerprint,
  };
}
