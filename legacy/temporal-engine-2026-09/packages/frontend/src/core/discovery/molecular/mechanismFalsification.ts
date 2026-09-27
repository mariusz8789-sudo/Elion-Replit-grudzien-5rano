/**
 * MECHANISM-LEVEL FALSIFICATION — "Dlaczego ten kandydat może być zły?" first.
 *
 * This is a DIFFERENT layer from `falsification.ts` (which does margin
 * analysis on physicochemical screening criteria for a `MoleculeCandidate`
 * already inside the discovery loop). This layer runs BEFORE that, on
 * questions physicochemistry cannot answer: is the reported target even the
 * right one, does the occurrence claim hold up, is the structure trustworthy,
 * does a real toxicity model raise a signal. A candidate that fails here never
 * reaches screening at all — rejecting it there would be the RIGHT verdict
 * for the WRONG reason (a mechanism mismatch dressed up as a property miss).
 */
export const MECHANISM_FALSIFICATION_VERSION = '1.0.0';

export type MechanismCheckId =
  | 'WRONG_TARGET' | 'NO_MECHANISM_EVIDENCE' | 'INSUFFICIENT_NATURAL_PROVENANCE'
  | 'STRUCTURAL_MISMATCH' | 'TOXICITY_SIGNAL' | 'POOR_APPLICABILITY_DOMAIN';

export interface MechanismCheck {
  checkId: MechanismCheckId;
  question: string;
  finding: string;
  outcome: 'PASS' | 'FAIL' | 'NOT_EVALUATED';
}

export type MechanismVerdict =
  | 'RETAINED'
  | 'REJECTED_WRONG_TARGET'
  | 'REJECTED_NO_MECHANISM_EVIDENCE'
  | 'REJECTED_INSUFFICIENT_PROVENANCE'
  | 'REJECTED_STRUCTURAL_MISMATCH'
  | 'REJECTED_TOXICITY_SIGNAL';

export interface MechanismFalsificationReport {
  candidateKey: string;
  checks: readonly MechanismCheck[];
  verdict: MechanismVerdict;
  reason: string;
}

export interface MechanismFalsificationInput {
  candidateKey: string;
  reportedTargetFamily: string;
  /** Lower-cased keywords from the REFERENCE's resolved target — a real overlap check, not a name match. */
  referenceTargetKeywords: readonly string[];
  naturalOccurrenceCited: boolean;
  mechanismEvidenceCount: number;
  structuralStatus: 'CONFIRMED' | 'MISMATCH' | 'DECLINED' | 'ENGINE_UNAVAILABLE';
  /** Only REAL MODEL_PREDICTION probabilities reach here — never a placeholder. */
  admetToxicitySignals: readonly { endpoint: string; probability: number }[];
  admetInDomain: boolean | null;
}

/** A prediction this high on a real toxicity endpoint is a genuine caution signal, not proof of harm. */
export const TOXICITY_SIGNAL_THRESHOLD = 0.85;

/**
 * Runs every check regardless of earlier failures, so a rejected candidate's
 * FULL falsification record is visible — never just the first reason found.
 * The verdict then picks the first failing check in a fixed, meaningful
 * order: a wrong target makes every other question moot, so it is checked
 * first; a toxicity signal on an otherwise-sound candidate is checked last,
 * because it is the softest of these rejections (a prediction, not a source).
 */
export function falsifyCandidateMechanism(input: MechanismFalsificationInput): MechanismFalsificationReport {
  const targetLower = input.reportedTargetFamily.toLowerCase();
  const targetMatches = input.referenceTargetKeywords.some((k) => targetLower.includes(k.toLowerCase()));
  const wrongTarget: MechanismCheck = {
    checkId: 'WRONG_TARGET',
    question: `Does the candidate's own reported target family ("${input.reportedTargetFamily}") overlap the reference's resolved target?`,
    finding: targetMatches
      ? `Overlaps on: ${input.referenceTargetKeywords.filter((k) => targetLower.includes(k.toLowerCase())).join(', ')}.`
      : `No overlap with the reference's resolved target keywords (${input.referenceTargetKeywords.join(', ')}). This candidate's own literature points at a different mechanism.`,
    outcome: targetMatches ? 'PASS' : 'FAIL',
  };

  const hasMechanismEvidence = input.mechanismEvidenceCount > 0;
  const noMechanismEvidence: MechanismCheck = {
    checkId: 'NO_MECHANISM_EVIDENCE',
    question: 'Does the candidate carry ANY independent literature evidence for a mechanism at all?',
    finding: hasMechanismEvidence ? `${input.mechanismEvidenceCount} mechanism evidence reference(s) present.` : 'No mechanism evidence reference was supplied for this candidate.',
    outcome: hasMechanismEvidence ? 'PASS' : 'FAIL',
  };

  const insufficientProvenance: MechanismCheck = {
    checkId: 'INSUFFICIENT_NATURAL_PROVENANCE',
    question: 'Is the natural-occurrence claim backed by a citation, not just an assertion?',
    finding: input.naturalOccurrenceCited ? 'Occurrence is cited.' : 'Occurrence is asserted without a citation this pipeline can check.',
    outcome: input.naturalOccurrenceCited ? 'PASS' : 'FAIL',
  };

  const structuralMismatch: MechanismCheck = {
    checkId: 'STRUCTURAL_MISMATCH',
    question: 'If a structure was supplied, does it re-derive the composition its own literature claims?',
    finding: input.structuralStatus === 'MISMATCH'
      ? 'RDKit-derived formula did not match the expected formula: the stored structure cannot be trusted.'
      : input.structuralStatus === 'CONFIRMED' ? 'Structure confirmed by real RDKit re-derivation.'
        : input.structuralStatus === 'DECLINED' ? 'No structure was supplied (declared capability gap); this check does not apply.'
          : 'RDKit was unavailable to re-derive the structure in this run.',
    outcome: input.structuralStatus === 'MISMATCH' ? 'FAIL' : input.structuralStatus === 'CONFIRMED' ? 'PASS' : 'NOT_EVALUATED',
  };

  const signals = input.admetToxicitySignals.filter((s) => s.probability >= TOXICITY_SIGNAL_THRESHOLD);
  const toxicitySignal: MechanismCheck = {
    checkId: 'TOXICITY_SIGNAL',
    question: `Does any REAL ADMET-AI toxicity endpoint predict a probability >= ${TOXICITY_SIGNAL_THRESHOLD}?`,
    finding: signals.length > 0
      ? `${signals.map((s) => `${s.endpoint}=${s.probability.toFixed(2)}`).join(', ')} (MODEL_PREDICTION, not a measurement).`
      : input.admetToxicitySignals.length === 0 ? 'No ADMET toxicity predictions were available for this candidate.' : 'No endpoint reached the caution threshold.',
    outcome: signals.length > 0 ? 'FAIL' : 'PASS',
  };

  const poorDomain: MechanismCheck = {
    checkId: 'POOR_APPLICABILITY_DOMAIN',
    question: 'Is the candidate inside the ADMET model\'s applicability domain?',
    finding: input.admetInDomain === null ? 'Applicability domain was not evaluated (no structure to evaluate it against).' : input.admetInDomain ? 'Inside the declared domain.' : 'Outside the declared domain; any ADMET prediction for this candidate is unreliable regardless of its value.',
    outcome: input.admetInDomain === null ? 'NOT_EVALUATED' : input.admetInDomain ? 'PASS' : 'FAIL',
  };

  const checks = [wrongTarget, noMechanismEvidence, insufficientProvenance, structuralMismatch, poorDomain, toxicitySignal];

  let verdict: MechanismVerdict = 'RETAINED';
  let reason = 'No mechanism-level falsification check failed with the evidence available.';
  if (wrongTarget.outcome === 'FAIL') { verdict = 'REJECTED_WRONG_TARGET'; reason = wrongTarget.finding; }
  else if (noMechanismEvidence.outcome === 'FAIL') { verdict = 'REJECTED_NO_MECHANISM_EVIDENCE'; reason = noMechanismEvidence.finding; }
  else if (insufficientProvenance.outcome === 'FAIL') { verdict = 'REJECTED_INSUFFICIENT_PROVENANCE'; reason = insufficientProvenance.finding; }
  else if (structuralMismatch.outcome === 'FAIL') { verdict = 'REJECTED_STRUCTURAL_MISMATCH'; reason = structuralMismatch.finding; }
  else if (toxicitySignal.outcome === 'FAIL') { verdict = 'REJECTED_TOXICITY_SIGNAL'; reason = toxicitySignal.finding; }

  return { candidateKey: input.candidateKey, checks, verdict, reason };
}
