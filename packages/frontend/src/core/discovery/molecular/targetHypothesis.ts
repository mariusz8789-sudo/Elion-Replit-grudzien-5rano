import { canonicalJson, fnv1a } from '../../events/hash';

/**
 * TARGET / MECHANISM HYPOTHESIS.
 *
 * The step this contract exists to make honest is the jump from "I generated a
 * molecule" to "I have computational grounds that it may act on a specific
 * target". That jump has two independent preconditions, and conflating them is
 * the central failure mode:
 *
 *   1. Do we KNOW what the target is?          -> TargetResolutionStatus
 *   2. Is the structure we can dock into THE   -> ReceptorRelevance
 *      target we hypothesised?
 *
 * Both must hold before a docking score may be called a target affinity.
 *
 * A real, high-quality docking run against a real protein that is NOT the
 * hypothesised target produces a perfectly plausible kcal/mol which answers a
 * different question entirely. Nothing in the number reveals this. It is
 * therefore recorded structurally, not in prose.
 */
export const TARGET_HYPOTHESIS_VERSION = '1.0.0';

export type TargetResolutionStatus =
  /** A named target backed by a real source. */
  | 'RESOLVED'
  /** Some target information exists but is incomplete or contested. */
  | 'PARTIAL'
  /** No target could be established. Genesis does not guess one. */
  | 'UNKNOWN'
  /** No resolution was attempted because no source is configured. */
  | 'NOT_AVAILABLE'
  /** A source exists but could not be reached. */
  | 'BLOCKED';

/**
 * How the docking receptor relates to the hypothesised target. This is the
 * distinction that decides whether a docking score means anything about
 * mechanism.
 */
export type ReceptorRelevance =
  /** The receptor IS the hypothesised target, backed by a source. */
  | 'MECHANISTICALLY_IMPLICATED'
  /** A real protein structure, but NOT the hypothesised target. Docking
   *  against it exercises the method; it says nothing about mechanism. */
  | 'STRUCTURAL_PROXY'
  /** Not a protein at all — a small molecule standing in for a receptor. */
  | 'SMALL_MOLECULE_STANDIN'
  /** No receptor structure available. */
  | 'NONE';

export interface TargetEvidenceRef {
  /** Where this came from. Genesis never fabricates a reference. */
  source: 'CHEMBL' | 'PUBCHEM' | 'PDB' | 'UNIPROT' | 'LITERATURE' | 'USER_SUPPLIED';
  identifier: string;
  /** What this reference actually establishes — usually an association, not a mechanism. */
  establishes: string;
}

export interface TargetHypothesis {
  hypothesisId: string;
  /** Target name/id when resolved; null when not. Never invented. */
  targetId: string | null;
  targetName: string | null;
  /** Biological system the target sits in, when stated by a source. */
  biologicalSystem: string | null;
  /** The mechanism being hypothesised, in words. Explicitly a hypothesis. */
  mechanismHypothesis: string | null;
  status: TargetResolutionStatus;
  /** Why the status is what it is — always populated for non-RESOLVED. */
  statusReason: string;
  evidence: readonly TargetEvidenceRef[];
  /** Chemical space this hypothesis was framed for. */
  applicabilityDomain: string;
  /** What would have to be done to raise the status. */
  requiredValidation: readonly string[];
  fingerprint: string;
}

export interface ReceptorStructure {
  /** Identifier of the structure itself (e.g. a PDB id). */
  structureId: string;
  /** Prepared rigid receptor in PDBQT. */
  pdbqt: string;
  /** Docking box centre, in the structure's own coordinates. */
  center: readonly [number, number, number];
  boxSize: readonly [number, number, number];
  relevance: ReceptorRelevance;
  /** Where the structure came from. Never blank. */
  provenance: string;
  /**
   * Required whenever relevance is STRUCTURAL_PROXY: states plainly what the
   * structure is and what it is not, so the caveat travels with the data.
   */
  proxyCaveat: string | null;
}

export function targetHypothesisFingerprint(input: Omit<TargetHypothesis, 'hypothesisId' | 'fingerprint'>): string {
  return fnv1a(canonicalJson({
    v: TARGET_HYPOTHESIS_VERSION,
    targetId: input.targetId,
    targetName: input.targetName,
    mechanism: input.mechanismHypothesis,
    status: input.status,
    evidence: input.evidence.map((e) => [e.source, e.identifier]).sort(),
  }));
}

export function buildTargetHypothesis(input: Omit<TargetHypothesis, 'hypothesisId' | 'fingerprint'>): TargetHypothesis {
  const fingerprint = targetHypothesisFingerprint(input);
  return { ...input, hypothesisId: `target_${fingerprint}`, fingerprint };
}

/** An explicitly unresolved hypothesis. Used whenever no source could answer. */
export function unresolvedTarget(reason: string, status: TargetResolutionStatus = 'UNKNOWN'): TargetHypothesis {
  return buildTargetHypothesis({
    targetId: null,
    targetName: null,
    biologicalSystem: null,
    mechanismHypothesis: null,
    status,
    statusReason: reason,
    evidence: [],
    applicabilityDomain: 'Not established: no target was resolved.',
    requiredValidation: [
      'Resolve the target against a real bioactivity source (ChEMBL, PubChem BioAssay) or supply one with a citation.',
      'Obtain an experimental 3D structure of that target before any docking score can describe it.',
    ],
  });
}

/**
 * THE GATE. Whether a docking score computed against `receptor` may be reported
 * as a target affinity for `hypothesis`.
 *
 * Both conditions are required, and the failure reasons are kept distinct
 * because they are fixed differently: an unresolved target needs bioactivity
 * data, a proxy receptor needs the right structure.
 */
export function affinityIsAboutTarget(
  hypothesis: TargetHypothesis,
  receptor: ReceptorStructure | null,
): { meaningful: boolean; reason: string } {
  if (receptor === null) {
    return { meaningful: false, reason: 'No receptor structure is available, so nothing was docked.' };
  }
  if (hypothesis.status !== 'RESOLVED') {
    return {
      meaningful: false,
      reason: `The target is ${hypothesis.status} (${hypothesis.statusReason}). A docking score cannot be an affinity FOR a target that has not been established.`,
    };
  }
  if (receptor.relevance !== 'MECHANISTICALLY_IMPLICATED') {
    return {
      meaningful: false,
      reason: receptor.relevance === 'STRUCTURAL_PROXY'
        ? `The docked structure (${receptor.structureId}) is a real protein but NOT the hypothesised target. The score is a real computation against the wrong protein and says nothing about this mechanism.`
        : `The docked structure is ${receptor.relevance}, not the hypothesised target.`,
    };
  }
  return { meaningful: true, reason: '' };
}

/**
 * The one sanctioned way to describe a prioritised candidate. It never claims
 * the candidate acts like a reference compound, only that it was ranked
 * against the same stated hypothesis by computation.
 */
export function prioritisationStatement(hypothesis: TargetHypothesis, affinityMeaningful: boolean): string {
  if (!affinityMeaningful) {
    return 'Candidate was computationally prioritised on physicochemical and predicted properties only. No target-related computation supports this ranking, and no mechanism is claimed.';
  }
  return `Candidate was computationally prioritised against the resolved target hypothesis "${hypothesis.targetName ?? hypothesis.targetId}". This is a computational prioritisation, not evidence of activity; it has not been experimentally validated.`;
}
