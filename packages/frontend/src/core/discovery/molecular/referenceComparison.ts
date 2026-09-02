import { buildClaim, type ClaimStrength, type EvidenceLinkedClaim } from './precisionClaimControl';
import { evaluateStructuralSimilarity, similarityStatement, type StructuralSimilarityResult } from './structuralSimilarity';
import type { RdkitTransport } from './rdkitTransport';
import type { TargetEvidenceRef } from './targetHypothesis';

/**
 * REFERENCE COMPARISON — "how does the subject compound relate to this
 * reference?", answered on FOUR SEPARATE AXES that are never merged.
 *
 * The mission's constraint is the whole design: a user naming several
 * compounds in one sentence ("mephedrone vs ketamine vs an opioid vs a
 * benzodiazepine") does NOT make those compounds mechanistically related.
 * Genesis has to work out the relationship itself, and the honest answer is
 * usually that the axes disagree — two molecules can be structurally similar
 * and mechanistically unrelated, or mechanistically related and structurally
 * nothing alike.
 *
 * So each axis is computed from its own evidence and reported on its own:
 *
 *   STRUCTURAL   — real RDKit Tanimoto/scaffold. Computed, always available.
 *   TARGET       — do the documented targets intersect at all?
 *   FUNCTIONAL   — is there a measured functional effect for BOTH compounds
 *                  that can legitimately be set side by side?
 *   MECHANISTIC  — is the mechanism of action the same kind of event?
 *
 * A high structural similarity NEVER promotes the target or functional axis,
 * and the claim this module emits is bounded by the WEAKEST axis that actually
 * carries evidence — `buildClaim` then refuses `CLINICALLY_EQUIVALENT`
 * outright, so the strongest misusable claim cannot be produced at all.
 */
export const REFERENCE_COMPARISON_VERSION = '1.0.0';

export type AxisVerdict = 'SHARED' | 'DISTINCT' | 'NOT_ESTABLISHED' | 'NOT_COMPARABLE';

/**
 * One measured datum about a compound, reduced to just what a comparison
 * needs: which assay produced it and which parameter it is. Two values are
 * only ever set side by side when BOTH of these agree — see
 * `functionalComparability`.
 */
export interface ComparableMeasurement {
  compound: string;
  target: string;
  assay: string;
  parameter: string;
  value: string;
  unit: string | null;
  model: string;
  species: string;
  source: string;
}

export interface ComparisonProfile {
  compound: string;
  /** Verified by RDKit against `expectedFormula` before any use. */
  smiles: string;
  expectedFormula: string;
  /** Documented targets, each of which must be backed by a measurement or an evidence ref. */
  targets: readonly string[];
  /** How the compound is documented to act — the KIND of molecular event. */
  mechanismClass: string;
  measurements: readonly ComparableMeasurement[];
  evidence: readonly TargetEvidenceRef[];
}

export interface AxisResult {
  axis: 'STRUCTURAL' | 'TARGET' | 'FUNCTIONAL' | 'MECHANISTIC';
  verdict: AxisVerdict;
  statement: string;
}

export interface ReferenceComparisonResult {
  subject: string;
  reference: string;
  structuralSimilarity: StructuralSimilarityResult;
  axes: readonly AxisResult[];
  sharedTargets: readonly string[];
  /**
   * Pairs of measurements that genuinely share assay AND parameter across the
   * two compounds. Empty is the common, honest case and is reported as such.
   */
  comparableMeasurementPairs: readonly { subject: ComparableMeasurement; reference: ComparableMeasurement }[];
  claim: EvidenceLinkedClaim;
  limitations: readonly string[];
}

/** Case- and whitespace-insensitive target identity. Nothing fuzzier: "DAT" and "DOR" must never collide. */
function normaliseTarget(target: string): string {
  return target.trim().toUpperCase();
}

function compareTargets(subject: ComparisonProfile, reference: ComparisonProfile): { verdict: AxisVerdict; shared: string[]; statement: string } {
  if (subject.targets.length === 0 || reference.targets.length === 0) {
    return {
      verdict: 'NOT_ESTABLISHED',
      shared: [],
      statement: `No target overlap can be assessed: ${subject.targets.length === 0 ? subject.compound : reference.compound} has no documented target in the ingested evidence.`,
    };
  }

  const referenceTargets = new Set(reference.targets.map(normaliseTarget));
  const shared = subject.targets.filter((t) => referenceTargets.has(normaliseTarget(t)));

  if (shared.length > 0) {
    return {
      verdict: 'SHARED',
      shared,
      statement: `${subject.compound} and ${reference.compound} both have documented activity at ${shared.join(', ')}. Sharing a target is not sharing a mechanism, a direction of effect, or a potency.`,
    };
  }

  return {
    verdict: 'DISTINCT',
    shared: [],
    statement: `No documented target is shared. ${subject.compound} acts at ${subject.targets.join(', ')}; ${reference.compound} acts at ${reference.targets.join(', ')}. `
      + 'These are different molecular targets, so no quantitative value from one is transferable to the other.',
  };
}

/**
 * Two measurements are comparable only when the SAME assay produced the SAME
 * parameter at the SAME target. Same paper, same receptor family, or same unit
 * are all insufficient — that is exactly the conflation the ingested packs
 * document as a real source of error.
 */
function functionalComparability(
  subject: ComparisonProfile,
  reference: ComparisonProfile,
): { verdict: AxisVerdict; pairs: { subject: ComparableMeasurement; reference: ComparableMeasurement }[]; statement: string } {
  const pairs: { subject: ComparableMeasurement; reference: ComparableMeasurement }[] = [];
  for (const s of subject.measurements) {
    for (const r of reference.measurements) {
      if (normaliseTarget(s.target) === normaliseTarget(r.target) && s.assay === r.assay && s.parameter === r.parameter) {
        pairs.push({ subject: s, reference: r });
      }
    }
  }

  if (pairs.length > 0) {
    return {
      verdict: 'SHARED',
      pairs,
      statement: `${pairs.length} measurement pair(s) share target, assay and parameter and may be set side by side.`,
    };
  }

  if (subject.measurements.length === 0) {
    return {
      verdict: 'NOT_ESTABLISHED',
      pairs,
      statement: `No functional comparison is possible: the ingested evidence contains no measurement for ${subject.compound} at all.`,
    };
  }

  return {
    verdict: 'NOT_COMPARABLE',
    pairs,
    statement: `${subject.compound} has ${subject.measurements.length} measurement(s) and ${reference.compound} has ${reference.measurements.length}, but no pair shares target, assay AND parameter. `
      + 'Values measured by different assays answer different questions and are not placed side by side here.',
  };
}

function compareMechanism(subject: ComparisonProfile, reference: ComparisonProfile): AxisResult {
  const same = subject.mechanismClass.trim().toLowerCase() === reference.mechanismClass.trim().toLowerCase();
  return {
    axis: 'MECHANISTIC',
    verdict: same ? 'SHARED' : 'DISTINCT',
    statement: same
      ? `Both are documented as ${subject.mechanismClass}. The mechanism CLASS matches; this says nothing about potency, selectivity or direction at any specific target.`
      : `${subject.compound} is documented as ${subject.mechanismClass}; ${reference.compound} is documented as ${reference.mechanismClass}. These are different kinds of molecular event.`,
  };
}

/**
 * The claim is bounded by what the axes actually established, and can never
 * exceed `SAME_TARGET` here: this module has no functional-equivalence
 * evidence for any pair in this runtime, and `buildClaim` rejects
 * `CLINICALLY_EQUIVALENT` by construction.
 */
function boundedClaimStrength(targetVerdict: AxisVerdict, functionalVerdict: AxisVerdict, mechanismVerdict: AxisVerdict): ClaimStrength {
  if (targetVerdict === 'SHARED' && functionalVerdict === 'SHARED') return 'SAME_TARGET';
  if (targetVerdict === 'SHARED') return 'SAME_TARGET_FAMILY';
  if (mechanismVerdict === 'SHARED') return 'OVERLAPPING_MECHANISM';
  return 'STRUCTURAL_SIMILARITY';
}

export function compareToReference(
  transport: RdkitTransport,
  subject: ComparisonProfile,
  reference: ComparisonProfile,
): ReferenceComparisonResult {
  const structuralSimilarity = evaluateStructuralSimilarity(transport, subject.smiles, reference.smiles);
  const targets = compareTargets(subject, reference);
  const functional = functionalComparability(subject, reference);
  const mechanism = compareMechanism(subject, reference);

  const axes: AxisResult[] = [
    {
      axis: 'STRUCTURAL',
      // Structural similarity is a measurement, not a relationship verdict —
      // it is reported as computed and never upgraded into shared biology.
      verdict: structuralSimilarity.available ? 'SHARED' : 'NOT_ESTABLISHED',
      statement: similarityStatement(structuralSimilarity),
    },
    { axis: 'TARGET', verdict: targets.verdict, statement: targets.statement },
    { axis: 'FUNCTIONAL', verdict: functional.verdict, statement: functional.statement },
    mechanism,
  ];

  const strength = boundedClaimStrength(targets.verdict, functional.verdict, mechanism.verdict);
  const claim = buildClaim({
    claimId: `cmp_${subject.compound}_${reference.compound}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    statement: `Relationship of ${subject.compound} to ${reference.compound}, stated at the strongest level the evidence supports: ${strength}.`,
    strength,
    evidence: [...subject.evidence, ...reference.evidence],
    evidenceType: subject.evidence.length + reference.evidence.length > 0 ? 'LITERATURE' : 'STRUCTURAL_COMPUTATION',
    completedComputationalChecks: structuralSimilarity.available ? ['RDKIT_SIMILARITY'] : [],
    limitation: [
      `This claim does NOT establish that ${subject.compound} and ${reference.compound} produce the same effect, are interchangeable, or carry comparable risk.`,
      functional.verdict === 'SHARED'
        ? 'Functional values that share assay and parameter are shown side by side, but they remain measurements in a specific system, not clinical effects.'
        : 'No functional value from one compound has been transferred to the other.',
    ].join(' '),
  });

  return {
    subject: subject.compound,
    reference: reference.compound,
    structuralSimilarity,
    axes,
    sharedTargets: targets.shared,
    comparableMeasurementPairs: functional.pairs,
    claim,
    limitations: [
      'Structural, target, functional and mechanistic similarity are four different questions and are reported separately here; agreement on one axis is not evidence for another.',
      'No value measured for one compound is converted into a value for the other, in either direction.',
      'Binding affinity is not read as functional potency, and no cell or animal measurement is read as a human clinical effect.',
    ],
  };
}

export interface ReferenceComparisonSet {
  subject: string;
  comparisons: readonly ReferenceComparisonResult[];
  /** References the subject shares no documented target with — the honest majority case. */
  unrelatedReferences: readonly string[];
  summary: string;
}

export function compareToReferences(
  transport: RdkitTransport,
  subject: ComparisonProfile,
  references: readonly ComparisonProfile[],
): ReferenceComparisonSet {
  const comparisons = references.map((reference) => compareToReference(transport, subject, reference));
  const unrelated = comparisons.filter((c) => c.sharedTargets.length === 0).map((c) => c.reference);

  return {
    subject: subject.compound,
    comparisons,
    unrelatedReferences: unrelated,
    summary: unrelated.length === comparisons.length
      ? `${subject.compound} shares no documented molecular target with any of the ${comparisons.length} reference compound(s) examined. They were compared because they were named together, and the comparison itself is the finding: these are pharmacologically distinct.`
      : `${subject.compound} shares a documented target with ${comparisons.length - unrelated.length} of ${comparisons.length} reference compound(s); the remaining ${unrelated.length} are pharmacologically distinct.`,
  };
}
