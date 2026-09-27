import type { MoleculeCandidate } from './types';
import type { RdkitSmartsPattern, RdkitTransport } from './rdkitTransport';

/**
 * MECHANISM PREREQUISITE FILTER — target/mechanism screening for candidates
 * that were GENERATED rather than looked up.
 *
 * THE PROBLEM THIS SOLVES, STATED HONESTLY:
 *
 * The rest of this engine filters candidates on literature evidence
 * (`mechanismFalsification.ts`). That is the right test for a curated pool,
 * where every candidate is a real compound with its own papers. It is the
 * WRONG test for a generated structure: a molecule enumerated ten seconds ago
 * has no literature by construction, so an evidence-based filter would reject
 * the entire batch for a reason that says nothing about the chemistry.
 *
 * So this module tests something Genesis can actually establish: whether a
 * candidate satisfies the NECESSARY STRUCTURAL CONDITIONS for the reference
 * compound's mechanism to be extrapolable to it at all.
 *
 * THE LOGIC IS ONE-DIRECTIONAL, AND THAT IS THE ENTIRE POINT:
 *
 *   FAILING a prerequisite is informative. If the mechanism the reference is
 *   documented to use depends on a structural feature, a candidate lacking
 *   that feature cannot be assumed to share the mechanism. That is a real,
 *   defensible EXCLUSION.
 *
 *   PASSING every prerequisite is NOT informative about activity. It means
 *   only "not excluded on these grounds". It is never evidence of binding,
 *   affinity, potency or efficacy, and the verdict vocabulary here refuses to
 *   let it read as such: the positive outcome is literally called
 *   `NOT_EXCLUDED`, and every report carries `standing`, which states that
 *   actual target affinity is REQUIRES_EXPERIMENT.
 *
 * Nothing in this module produces a number that could be mistaken for an
 * affinity, and nothing ranks candidates.
 */
export const MECHANISM_PREREQUISITE_VERSION = '1.0.0';

/**
 * A structural feature the reference compound's documented mechanism is
 * attributed to. `rationale` must say WHY the feature is necessary, and
 * `evidenceRef` must name what supports that — a prerequisite with no stated
 * basis is a guess wearing a filter's clothing.
 */
export interface PharmacophorePrerequisite {
  prerequisiteId: string;
  smarts: string;
  requirement: 'REQUIRED' | 'FORBIDDEN';
  rationale: string;
  evidenceRef: string;
}

/**
 * A physicochemical condition the mechanism requires in order to be
 * expressible at all — e.g. a central mechanism requires CNS exposure. Bounds
 * are inclusive. `propertyId` is read from the candidate's own properties, so
 * only values a real engine computed are ever tested.
 */
export interface ExposurePrerequisite {
  prerequisiteId: string;
  propertyId: string;
  min?: number;
  max?: number;
  rationale: string;
  evidenceRef: string;
}

export interface MechanismPrerequisiteSet {
  /** The compound whose mechanism these prerequisites are derived from. */
  referenceCompound: string;
  /** The mechanism being extrapolated, named. */
  mechanism: string;
  pharmacophore: readonly PharmacophorePrerequisite[];
  exposure: readonly ExposurePrerequisite[];
}

export type PrerequisiteCheckStatus = 'MET' | 'FAILED' | 'UNEVALUABLE';

export interface PrerequisiteCheck {
  prerequisiteId: string;
  status: PrerequisiteCheckStatus;
  detail: string;
}

/**
 * `NOT_EXCLUDED` deliberately does not say "retained as active", "hit", or
 * "target-positive". `UNEVALUABLE` is reserved for candidates the engine could
 * not test at all — never collapsed into either of the other two, because
 * "could not check" and "checked and passed" are different facts.
 */
export type MechanismPrerequisiteVerdict = 'NOT_EXCLUDED' | 'EXCLUDED' | 'UNEVALUABLE';

export interface MechanismPrerequisiteReport {
  candidateId: string;
  verdict: MechanismPrerequisiteVerdict;
  checks: readonly PrerequisiteCheck[];
  /** Populated only for EXCLUDED — the specific prerequisites that failed. */
  exclusionReasons: readonly string[];
  /** Always present, for every verdict including NOT_EXCLUDED. */
  standing: string;
}

const STANDING =
  'NOT_EXCLUDED means only that no declared structural or exposure prerequisite ruled this candidate out. '
  + 'It is not evidence of binding, affinity, potency or efficacy at any target. '
  + 'Actual target affinity for this candidate is REQUIRES_EXPERIMENT: no assay has been run on it, and no engine in this runtime can predict it.';

function numericProperty(candidate: MoleculeCandidate, propertyId: string): { value: number | null; status: string } {
  const property = candidate.properties.find((p) => p.propertyId === propertyId);
  if (property === undefined) return { value: null, status: 'ABSENT' };
  return { value: typeof property.value === 'number' ? property.value : null, status: property.status };
}

function checkExposure(candidate: MoleculeCandidate, prerequisite: ExposurePrerequisite): PrerequisiteCheck {
  const { value, status } = numericProperty(candidate, prerequisite.propertyId);
  if (value === null) {
    return {
      prerequisiteId: prerequisite.prerequisiteId,
      status: 'UNEVALUABLE',
      detail: `Candidate carries no usable "${prerequisite.propertyId}" value (property status ${status}); the prerequisite is untested, not satisfied.`,
    };
  }

  const belowMin = prerequisite.min !== undefined && value < prerequisite.min;
  const aboveMax = prerequisite.max !== undefined && value > prerequisite.max;
  if (belowMin || aboveMax) {
    const bound = belowMin ? `below the minimum ${prerequisite.min}` : `above the maximum ${prerequisite.max}`;
    return {
      prerequisiteId: prerequisite.prerequisiteId,
      status: 'FAILED',
      detail: `${prerequisite.propertyId} = ${value}, ${bound}. ${prerequisite.rationale} (${prerequisite.evidenceRef})`,
    };
  }

  return {
    prerequisiteId: prerequisite.prerequisiteId,
    status: 'MET',
    detail: `${prerequisite.propertyId} = ${value}, within the declared range.`,
  };
}

/**
 * Runs the prerequisite set against one candidate.
 *
 * A candidate with no structure is UNEVALUABLE rather than excluded — the
 * engine failed, the chemistry did not.
 */
export function checkMechanismPrerequisites(
  transport: RdkitTransport,
  candidate: MoleculeCandidate,
  prerequisites: MechanismPrerequisiteSet,
): MechanismPrerequisiteReport {
  const smiles = candidate.structure.canonicalSmiles;
  const checks: PrerequisiteCheck[] = [];

  if (smiles === null) {
    return {
      candidateId: candidate.candidateId,
      verdict: 'UNEVALUABLE',
      checks: [],
      exclusionReasons: [],
      standing: `${STANDING} This candidate carries no structure, so no prerequisite could be tested at all.`,
    };
  }

  const patterns: RdkitSmartsPattern[] = prerequisites.pharmacophore.map((p) => ({ patternId: p.prerequisiteId, smarts: p.smarts }));
  const matched = patterns.length > 0 ? transport.match(smiles, patterns) : null;

  for (const prerequisite of prerequisites.pharmacophore) {
    if (matched === null || !matched.ok) {
      checks.push({
        prerequisiteId: prerequisite.prerequisiteId,
        status: 'UNEVALUABLE',
        detail: matched === null ? 'No pharmacophore pattern was declared.' : `RDKit substructure matching failed: ${matched.error} — ${matched.reason}.`,
      });
      continue;
    }

    const hit = matched.matches.find((m) => m.patternId === prerequisite.prerequisiteId);
    if (hit === undefined || hit.matched === null) {
      checks.push({
        prerequisiteId: prerequisite.prerequisiteId,
        status: 'UNEVALUABLE',
        detail: `RDKit returned no usable result for this pattern (${hit?.reason ?? 'no row returned'}); absence of a result is not absence of the feature.`,
      });
      continue;
    }

    const satisfied = prerequisite.requirement === 'REQUIRED' ? hit.matched : !hit.matched;
    checks.push({
      prerequisiteId: prerequisite.prerequisiteId,
      status: satisfied ? 'MET' : 'FAILED',
      detail: satisfied
        ? `${prerequisite.requirement === 'REQUIRED' ? 'Present' : 'Absent'} as required (${hit.count} match(es)).`
        : `${prerequisite.requirement === 'REQUIRED' ? 'Missing' : 'Present but forbidden'}. ${prerequisite.rationale} (${prerequisite.evidenceRef})`,
    });
  }

  for (const prerequisite of prerequisites.exposure) {
    checks.push(checkExposure(candidate, prerequisite));
  }

  const failed = checks.filter((c) => c.status === 'FAILED');
  if (failed.length > 0) {
    return {
      candidateId: candidate.candidateId,
      verdict: 'EXCLUDED',
      checks,
      exclusionReasons: failed.map((c) => `${c.prerequisiteId}: ${c.detail}`),
      standing: STANDING,
    };
  }

  // Nothing failed, but if nothing could be tested either, that is not a pass.
  const evaluated = checks.filter((c) => c.status === 'MET');
  if (evaluated.length === 0) {
    return {
      candidateId: candidate.candidateId,
      verdict: 'UNEVALUABLE',
      checks,
      exclusionReasons: [],
      standing: `${STANDING} No prerequisite could be evaluated for this candidate, so it is untested rather than cleared.`,
    };
  }

  return { candidateId: candidate.candidateId, verdict: 'NOT_EXCLUDED', checks, exclusionReasons: [], standing: STANDING };
}

export interface MechanismPrerequisiteBatch {
  prerequisites: MechanismPrerequisiteSet;
  reports: readonly MechanismPrerequisiteReport[];
  notExcluded: readonly string[];
  excluded: readonly string[];
  unevaluable: readonly string[];
  /** What this whole stage did and did not establish, for the dossier. */
  limitations: readonly string[];
}

export function runMechanismPrerequisites(
  transport: RdkitTransport,
  candidates: readonly MoleculeCandidate[],
  prerequisites: MechanismPrerequisiteSet,
): MechanismPrerequisiteBatch {
  const reports = candidates.map((candidate) => checkMechanismPrerequisites(transport, candidate, prerequisites));

  return {
    prerequisites,
    reports,
    notExcluded: reports.filter((r) => r.verdict === 'NOT_EXCLUDED').map((r) => r.candidateId),
    excluded: reports.filter((r) => r.verdict === 'EXCLUDED').map((r) => r.candidateId),
    unevaluable: reports.filter((r) => r.verdict === 'UNEVALUABLE').map((r) => r.candidateId),
    limitations: [
      `Prerequisites are derived from ${prerequisites.referenceCompound}'s documented ${prerequisites.mechanism}. They are NECESSARY conditions for that mechanism to be extrapolable, never sufficient ones.`,
      'No candidate that passed this stage has been shown to bind, activate or inhibit any target. Every retained candidate\'s affinity is REQUIRES_EXPERIMENT.',
      'A candidate excluded here is excluded from THIS mechanism hypothesis only. It is not a claim that the candidate is inactive at every target, nor that it is unsafe.',
    ],
  };
}
