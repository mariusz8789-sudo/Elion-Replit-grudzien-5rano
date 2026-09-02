import type { MoleculeCandidate } from './types';
import type { RdkitSmartsPattern, RdkitTransport } from './rdkitTransport';

/**
 * DISCOVERY REQUIREMENTS — the question, made machine-readable.
 *
 * Until now the discovery question was prose plus a set of screening criteria.
 * Prose cannot drive a generator and cannot be checked, so a candidate could
 * never say WHY it existed or WHICH part of the question it was trying to
 * satisfy. This module makes each clause of the question a first-class object
 * that generation, filtering and reporting all read from the same source.
 *
 * FOUR REQUIREMENT KINDS, because they are checked by genuinely different
 * evidence and must not be collapsed:
 *
 *   PRESERVE_STRUCTURE  — a substructure that must survive (real SMARTS match)
 *   AVOID_STRUCTURE     — a substructure that must not appear (real SMARTS)
 *   PROPERTY_WINDOW     — a computed/predicted value must sit in a range
 *   REDUCE_VS_REFERENCE — a value must move in a stated direction relative to
 *                         the reference compound's own measured/computed value
 *
 * The last one is what makes a campaign a DESIGN campaign rather than a filter:
 * "keep the scaffold, reduce this liability" is only expressible if the
 * reference's own value is the yardstick.
 *
 * WHAT THIS MODULE WILL NOT DO: it will not invent a medicinal-chemistry
 * rationale. A candidate's `generationReason` is derived from the
 * transformation that actually produced it and the requirement that
 * transformation was selected to explore — never from a plausible-sounding
 * story about why a chemist might make it.
 */
export const DISCOVERY_REQUIREMENTS_VERSION = '1.0.0';

export type RequirementKind = 'PRESERVE_STRUCTURE' | 'AVOID_STRUCTURE' | 'PROPERTY_WINDOW' | 'REDUCE_VS_REFERENCE';

export type RequirementStatus = 'SATISFIED' | 'VIOLATED' | 'UNEVALUABLE';

export interface Requirement {
  requirementId: string;
  kind: RequirementKind;
  statement: string;
  /** Why the campaign asks for this — traced to evidence or declared as a design choice. */
  rationale: string;
  /** PRESERVE_STRUCTURE / AVOID_STRUCTURE */
  smarts?: string;
  /** PROPERTY_WINDOW / REDUCE_VS_REFERENCE */
  propertyId?: string;
  min?: number;
  max?: number;
  /** REDUCE_VS_REFERENCE: must the candidate's value fall below the reference's? */
  direction?: 'BELOW_REFERENCE' | 'ABOVE_REFERENCE';
  /** Requirements a caller declares as mandatory; a violation excludes the candidate. */
  mandatory: boolean;
}

export interface RequirementEvaluation {
  requirementId: string;
  status: RequirementStatus;
  detail: string;
}

export interface CandidateRequirementReport {
  candidateId: string;
  evaluations: readonly RequirementEvaluation[];
  satisfied: readonly string[];
  violated: readonly string[];
  unevaluable: readonly string[];
  /** True only when no MANDATORY requirement is violated. */
  admissible: boolean;
  /**
   * Why this structure exists, stated from the transformation that produced it
   * and the requirement it explores. Never a fabricated design story.
   */
  generationReason: string;
}

function numericProperty(candidate: MoleculeCandidate, propertyId: string): number | null {
  const property = candidate.properties.find((p) => p.propertyId === propertyId);
  return property !== undefined && typeof property.value === 'number' ? property.value : null;
}

/**
 * Evaluates every requirement against one candidate.
 *
 * `referenceValues` supplies the reference compound's own values, so
 * REDUCE_VS_REFERENCE is checked against a real number rather than a guess. A
 * requirement whose reference value is missing is UNEVALUABLE — never
 * silently satisfied.
 */
export function evaluateRequirements(
  transport: RdkitTransport,
  candidate: MoleculeCandidate,
  requirements: readonly Requirement[],
  referenceValues: Readonly<Record<string, number>>,
): CandidateRequirementReport {
  const evaluations: RequirementEvaluation[] = [];
  const smiles = candidate.structure.canonicalSmiles;

  const structural = requirements.filter((r) => r.kind === 'PRESERVE_STRUCTURE' || r.kind === 'AVOID_STRUCTURE');
  const patterns: RdkitSmartsPattern[] = structural
    .filter((r) => typeof r.smarts === 'string')
    .map((r) => ({ patternId: r.requirementId, smarts: r.smarts! }));
  const matched = smiles !== null && patterns.length > 0 ? transport.match(smiles, patterns) : null;

  for (const requirement of requirements) {
    if (requirement.kind === 'PRESERVE_STRUCTURE' || requirement.kind === 'AVOID_STRUCTURE') {
      if (matched === null || !matched.ok) {
        evaluations.push({
          requirementId: requirement.requirementId,
          status: 'UNEVALUABLE',
          detail: smiles === null
            ? 'Candidate carries no structure, so the pattern could not be tested.'
            : matched === null ? 'No SMARTS pattern was declared.' : `RDKit matching failed: ${matched.error} — ${matched.reason}.`,
        });
        continue;
      }
      const hit = matched.matches.find((m) => m.patternId === requirement.requirementId);
      if (hit === undefined || hit.matched === null) {
        evaluations.push({
          requirementId: requirement.requirementId,
          status: 'UNEVALUABLE',
          detail: `RDKit returned no usable result for this pattern (${hit?.reason ?? 'no row'}); this is not the same as the feature being absent.`,
        });
        continue;
      }
      const wantPresent = requirement.kind === 'PRESERVE_STRUCTURE';
      const ok = wantPresent ? hit.matched : !hit.matched;
      evaluations.push({
        requirementId: requirement.requirementId,
        status: ok ? 'SATISFIED' : 'VIOLATED',
        detail: ok
          ? `${wantPresent ? 'Retained' : 'Absent'} as required (${hit.count} match(es)).`
          : `${wantPresent ? 'Lost the required substructure' : 'Contains the excluded substructure'} (${hit.count} match(es)).`,
      });
      continue;
    }

    const propertyId = requirement.propertyId;
    if (propertyId === undefined) {
      evaluations.push({ requirementId: requirement.requirementId, status: 'UNEVALUABLE', detail: 'Requirement declares no property to read.' });
      continue;
    }
    const value = numericProperty(candidate, propertyId);
    if (value === null) {
      evaluations.push({
        requirementId: requirement.requirementId,
        status: 'UNEVALUABLE',
        detail: `Candidate carries no usable "${propertyId}" value; the requirement is untested, not met.`,
      });
      continue;
    }

    if (requirement.kind === 'PROPERTY_WINDOW') {
      const below = requirement.min !== undefined && value < requirement.min;
      const above = requirement.max !== undefined && value > requirement.max;
      evaluations.push({
        requirementId: requirement.requirementId,
        status: below || above ? 'VIOLATED' : 'SATISFIED',
        detail: below || above
          ? `${propertyId} = ${value}, outside the required window [${requirement.min ?? '-inf'}, ${requirement.max ?? '+inf'}].`
          : `${propertyId} = ${value}, inside the required window.`,
      });
      continue;
    }

    // REDUCE_VS_REFERENCE
    const referenceValue = referenceValues[propertyId];
    if (referenceValue === undefined || !Number.isFinite(referenceValue)) {
      evaluations.push({
        requirementId: requirement.requirementId,
        status: 'UNEVALUABLE',
        detail: `The reference compound has no "${propertyId}" value, so there is nothing to compare against. Not treated as satisfied.`,
      });
      continue;
    }
    const wantBelow = requirement.direction !== 'ABOVE_REFERENCE';
    const ok = wantBelow ? value < referenceValue : value > referenceValue;
    evaluations.push({
      requirementId: requirement.requirementId,
      status: ok ? 'SATISFIED' : 'VIOLATED',
      detail: `${propertyId} = ${value} vs reference ${referenceValue} — ${ok ? 'moved' : 'did not move'} ${wantBelow ? 'below' : 'above'} the reference.`,
    });
  }

  const satisfied = evaluations.filter((e) => e.status === 'SATISFIED').map((e) => e.requirementId);
  const violated = evaluations.filter((e) => e.status === 'VIOLATED').map((e) => e.requirementId);
  const unevaluable = evaluations.filter((e) => e.status === 'UNEVALUABLE').map((e) => e.requirementId);

  const mandatoryIds = new Set(requirements.filter((r) => r.mandatory).map((r) => r.requirementId));
  const admissible = !violated.some((id) => mandatoryIds.has(id));

  const generationReason = candidate.transformation === null
    ? 'Seed structure — the campaign reference itself, not generated.'
    : `Produced from ${candidate.parentFormula ?? 'its parent'} by the declared transformation "${candidate.transformation}". `
      + (satisfied.length > 0
        ? `It satisfies ${satisfied.join(', ')}.`
        : 'It satisfies none of the declared requirements.')
      + (violated.length > 0 ? ` It violates ${violated.join(', ')}.` : '');

  return { candidateId: candidate.candidateId, evaluations, satisfied, violated, unevaluable, admissible, generationReason };
}

export interface RequirementBatch {
  requirements: readonly Requirement[];
  reports: readonly CandidateRequirementReport[];
  admissible: readonly string[];
  inadmissible: readonly string[];
  /** Requirements no candidate satisfied — the parts of the question generation failed to address. */
  unmetByEveryCandidate: readonly string[];
  /** Requirements nothing could even evaluate — a capability gap, not a chemistry result. */
  neverEvaluable: readonly string[];
}

export function runRequirementEvaluation(
  transport: RdkitTransport,
  candidates: readonly MoleculeCandidate[],
  requirements: readonly Requirement[],
  referenceValues: Readonly<Record<string, number>>,
): RequirementBatch {
  const reports = candidates.map((c) => evaluateRequirements(transport, c, requirements, referenceValues));

  const unmet = requirements
    .filter((r) => reports.every((report) => !report.satisfied.includes(r.requirementId)))
    .map((r) => r.requirementId);
  const neverEvaluable = requirements
    .filter((r) => reports.length > 0 && reports.every((report) => report.unevaluable.includes(r.requirementId)))
    .map((r) => r.requirementId);

  return {
    requirements,
    reports,
    admissible: reports.filter((r) => r.admissible).map((r) => r.candidateId),
    inadmissible: reports.filter((r) => !r.admissible).map((r) => r.candidateId),
    unmetByEveryCandidate: unmet,
    neverEvaluable,
  };
}
