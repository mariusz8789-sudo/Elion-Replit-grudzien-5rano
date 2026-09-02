import type { StructuralSimilarityResult } from './structuralSimilarity';
import type { TransporterEvidenceRecord } from './transporterEvidence';

/**
 * PRECISION FALSIFICATION — "Dlaczego 3-MMC i 4-CMC mogłyby NIE mieć
 * zbieżnego profilu?" run before any comparison claim is allowed to stand.
 *
 * Same discipline as `falsification.ts`/`mechanismFalsification.ts`
 * (RUNNABLE_NOW vs REQUIRES_EXTERNAL, every check reported regardless of
 * outcome, no fabricated pass) applied to the five questions this mission
 * names explicitly. `concernFound: true` does not mean the analysis failed —
 * it means a real reason for caution exists and must not be argued away.
 */
export const PRECISION_FALSIFICATION_VERSION = '1.0.0';

export type FalsificationRunKind = 'RUNNABLE_NOW' | 'REQUIRES_EXTERNAL';

export interface PrecisionFalsificationCheck {
  checkId: string;
  kind: FalsificationRunKind;
  question: string;
  finding: string;
  concernFound: boolean;
}

export interface PrecisionFalsificationReport {
  checks: readonly PrecisionFalsificationCheck[];
  concernCount: number;
  /** The strongest claim level this evidence base can support, given every concern below. */
  maxSupportableClaim: 'STRUCTURAL_SIMILARITY' | 'NONE';
  summary: string;
}

export interface PrecisionFalsificationInput {
  compoundAName: string;
  compoundBName: string;
  transporterEvidenceA: readonly TransporterEvidenceRecord[];
  transporterEvidenceB: readonly TransporterEvidenceRecord[];
  similarity: StructuralSimilarityResult | null;
}

/**
 * Runs all five checks. None is skipped because an earlier one already found
 * a problem — the mission asks for the FULL falsification record, not the
 * first objection found.
 */
export function runPrecisionFalsification(input: PrecisionFalsificationInput): PrecisionFalsificationReport {
  const verifiedA = input.transporterEvidenceA.filter((e) => e.status === 'VERIFIED');
  const verifiedB = input.transporterEvidenceB.filter((e) => e.status === 'VERIFIED');
  const hasCompoundSpecificComparison = verifiedA.length > 0 && verifiedB.length > 0;

  const convergentProfile: PrecisionFalsificationCheck = {
    checkId: 'convergent-transporter-profile',
    kind: 'REQUIRES_EXTERNAL',
    question: `Do ${input.compoundAName} and ${input.compoundBName} actually have a verified, convergent transporter profile?`,
    finding: hasCompoundSpecificComparison
      ? `${verifiedA.length} VERIFIED transporter record(s) for ${input.compoundAName} and ${verifiedB.length} for ${input.compoundBName} exist; a real comparison is possible on those transporters only.`
      : `Cannot be assessed: no VERIFIED, compound-specific transporter evidence exists for at least one of the two compounds in this runtime. A comparison of "profiles" cannot be made from UNKNOWN/NOT_AVAILABLE/INFERRED records — only structural class membership is established.`,
    concernFound: !hasCompoundSpecificComparison,
  };

  const structuralDifferenceCanAlterActivity: PrecisionFalsificationCheck = {
    checkId: 'structural-difference-may-alter-activity',
    kind: 'RUNNABLE_NOW',
    question: `Could the real structural difference between ${input.compoundAName} and ${input.compoundBName} plausibly change their activity profile?`,
    finding: input.similarity === null || !input.similarity.available
      ? 'Cannot be assessed: structural similarity was not computed.'
      : `RUNNABLE: real computed Tanimoto similarity is ${(input.similarity.tanimoto! * 100).toFixed(1)}% (${input.similarity.band}), and the two structures do ${input.similarity.sameScaffold ? '' : 'NOT '}share a Bemis-Murcko scaffold. A ring-position or ring-substituent difference (e.g. methyl vs. halogen, meta vs. para) is a real structural change; medicinal-chemistry structure-activity principles treat substituent position and electronic character as relevant to monoamine-transporter affinity and selectivity in general — this is class-level reasoning, not a value computed for these two compounds specifically, and it must not be read as evidence the two compounds ARE different, only that assuming they are the same is unsupported.`,
    concernFound: true,
  };

  const inVitroOnly: PrecisionFalsificationCheck = {
    checkId: 'in-vitro-only-data',
    kind: 'REQUIRES_EXTERNAL',
    question: 'Is any available evidence limited to in-vitro measurements, without in-vivo or human data?',
    finding: 'Not established in this runtime: no compound-specific dataset (in-vitro or otherwise) was reachable at all for either compound, so whether an eventual dataset would be in-vitro-only cannot be answered yet.',
    concernFound: true,
  };

  const mechanismToEffectInference: PrecisionFalsificationCheck = {
    checkId: 'mechanism-to-effect-inference',
    kind: 'RUNNABLE_NOW',
    question: 'Can a transporter mechanism finding be read as a human behavioural or clinical effect here?',
    finding: 'RUNNABLE: no. No transporter-binding, transporter-inhibition, or transporter-substrate value evaluated in this analysis is treated as a human behavioural or clinical effect. Genesis has not established, and does not assert, a validated bridge from an in-vitro/computational transporter finding to a specific human effect for either compound.',
    concernFound: true,
  };

  const overinterpretationRisk: PrecisionFalsificationCheck = {
    checkId: 'overinterpretation-risk',
    kind: 'RUNNABLE_NOW',
    question: `What claim about ${input.compoundAName} vs. ${input.compoundBName} would be an overinterpretation of the current evidence?`,
    finding: `Treating "both are ring-substituted N-methyl cathinones" (a real, RDKit-confirmed structural fact) as evidence of a SIMILAR_TRANSPORTER_PROFILE or OVERLAPPING_MECHANISM claim would be an overinterpretation. The claim level actually supported by current evidence is, at most, STRUCTURAL_SIMILARITY (chemical class membership) — not any transporter-, mechanism-, function-, or clinic-level claim.`,
    concernFound: true,
  };

  const checks = [convergentProfile, structuralDifferenceCanAlterActivity, inVitroOnly, mechanismToEffectInference, overinterpretationRisk];
  const concernCount = checks.filter((c) => c.concernFound).length;

  // Three of the five checks (in-vitro-only, mechanism-to-effect, overinterpretation-risk)
  // are standing limitations that hold regardless of whether compound-specific
  // transporter data exists, so the ceiling stays at STRUCTURAL_SIMILARITY either
  // way — real, cited, compound-specific transporter evidence would only ever
  // raise a NAMED transporter claim above that ceiling, never the overall claim
  // this report is willing to make about the pair as a whole.
  return {
    checks,
    concernCount,
    maxSupportableClaim: 'STRUCTURAL_SIMILARITY',
    summary: hasCompoundSpecificComparison
      ? `${concernCount} of ${checks.length} falsification checks found a real concern. Compound-specific transporter evidence exists for both compounds on at least one transporter, but every other concern below still applies to any claim beyond that specific, cited finding.`
      : `${concernCount} of ${checks.length} falsification checks found a real concern. With no VERIFIED compound-specific transporter evidence for at least one compound, no claim stronger than STRUCTURAL_SIMILARITY is supportable from current evidence.`,
  };
}
