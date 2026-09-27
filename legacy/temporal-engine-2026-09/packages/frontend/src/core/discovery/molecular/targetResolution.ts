import type { CompoundLookupTransport } from './compoundResolver';
import {
  buildTargetHypothesis,
  unresolvedTarget,
  type TargetEvidenceRef,
  type TargetHypothesis,
} from './targetHypothesis';

/**
 * TARGET RESOLUTION — reference compound -> source-backed target(s).
 *
 * Genesis holds no bioactivity data of its own. A target is only ever
 * RESOLVED when a real external source says so, or when a caller supplies one
 * with a citation. There is no inference step, no similarity heuristic and no
 * name-based guess: "molecule looks like X, so its target is X's target" is
 * exactly the reasoning this module refuses to perform.
 *
 * Network access goes through the repository's EXISTING allowlisted proxy
 * contract (biotechProxy.mjs: PubChem PUG REST and ChEMBL only).
 */
export const TARGET_RESOLUTION_VERSION = '1.0.0';

const CHEMBL_BASE = 'https://www.ebi.ac.uk/chembl/api/data';

/** ChEMBL molecule lookup by preferred name — the allowlisted path. */
export function chemblMoleculeUrl(name: string): string {
  return `${CHEMBL_BASE}/molecule.json?pref_name__iexact=${encodeURIComponent(name)}&limit=5`;
}

/** ChEMBL mechanism-of-action records for a molecule ChEMBL id. */
export function chemblMechanismUrl(moleculeChemblId: string): string {
  return `${CHEMBL_BASE}/mechanism.json?molecule_chembl_id=${encodeURIComponent(moleculeChemblId)}&limit=20`;
}

interface ChemblMechanismRecord {
  targetChemblId: string;
  mechanismOfAction: string;
  actionType: string | null;
}

/**
 * Reads ChEMBL mechanism records. Only entries carrying BOTH a target id and a
 * stated mechanism survive; a record with one and not the other cannot support
 * a mechanism hypothesis and is dropped rather than half-used.
 */
export function readChemblMechanisms(body: unknown): ChemblMechanismRecord[] {
  if (typeof body !== 'object' || body === null) return [];
  const mechanisms = (body as { mechanisms?: unknown }).mechanisms;
  if (!Array.isArray(mechanisms)) return [];

  const out: ChemblMechanismRecord[] = [];
  for (const entry of mechanisms) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const targetChemblId = record.target_chembl_id;
    const mechanismOfAction = record.mechanism_of_action;
    if (typeof targetChemblId !== 'string' || targetChemblId.length === 0) continue;
    if (typeof mechanismOfAction !== 'string' || mechanismOfAction.length === 0) continue;
    out.push({
      targetChemblId,
      mechanismOfAction,
      actionType: typeof record.action_type === 'string' ? record.action_type : null,
    });
  }
  return out;
}

/** Reads the molecule id from a ChEMBL molecule search. */
export function readChemblMoleculeId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const molecules = (body as { molecules?: unknown }).molecules;
  if (!Array.isArray(molecules) || molecules.length === 0) return null;
  const first = molecules[0];
  if (typeof first !== 'object' || first === null) return null;
  const id = (first as Record<string, unknown>).molecule_chembl_id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export interface TargetResolutionRequest {
  /** Compound name to resolve targets for. */
  referenceCompound: string;
  /** A target the caller already knows, WITH a citation. Never invented here. */
  declaredTarget?: {
    targetId: string;
    targetName: string;
    biologicalSystem: string;
    mechanismHypothesis: string;
    evidence: readonly TargetEvidenceRef[];
  };
}

/**
 * Resolves a target hypothesis for a reference compound.
 *
 * Order of preference: a caller-declared target WITH evidence, then a real
 * ChEMBL mechanism lookup. If neither yields anything the result is explicitly
 * unresolved — never a plausible-sounding guess.
 */
export function resolveTargetHypothesis(
  request: TargetResolutionRequest,
  transport?: CompoundLookupTransport,
): TargetHypothesis {
  // 1. Caller-declared target, but ONLY when it carries real evidence.
  if (request.declaredTarget !== undefined) {
    const declared = request.declaredTarget;
    if (declared.evidence.length === 0) {
      return unresolvedTarget(
        `A target was declared for "${request.referenceCompound}" but carries no evidence reference. An undocumented assertion is not a resolution.`,
        'PARTIAL',
      );
    }
    return buildTargetHypothesis({
      targetId: declared.targetId,
      targetName: declared.targetName,
      biologicalSystem: declared.biologicalSystem,
      mechanismHypothesis: declared.mechanismHypothesis,
      status: 'RESOLVED',
      statusReason: `Declared by the caller with ${declared.evidence.length} evidence reference(s).`,
      evidence: declared.evidence,
      applicabilityDomain: `Framed for analogues of ${request.referenceCompound}; validity outside that chemical space is unestablished.`,
      requiredValidation: [
        'Confirm the target association in a primary bioactivity source rather than relying on the citation alone.',
        'Obtain an experimental 3D structure OF THIS TARGET before any docking score can describe it.',
        'Any activity claim requires a validated binding or functional assay.',
      ],
    });
  }

  // 2. Real ChEMBL lookup.
  if (transport === undefined) {
    return unresolvedTarget(
      'No bioactivity source is configured in this runtime. Genesis holds no target data of its own and does not infer targets from structure.',
      'NOT_AVAILABLE',
    );
  }

  const availability = transport.available();
  if (!availability.available) {
    return unresolvedTarget(`The bioactivity source could not be reached: ${availability.reason}`, 'BLOCKED');
  }

  const moleculeResponse = transport.fetchJson(chemblMoleculeUrl(request.referenceCompound));
  if (!moleculeResponse.ok) {
    return unresolvedTarget(`ChEMBL molecule lookup failed: ${moleculeResponse.reason}`, 'BLOCKED');
  }
  const moleculeId = readChemblMoleculeId(moleculeResponse.body);
  if (moleculeId === null) {
    return unresolvedTarget(`ChEMBL returned no molecule matching "${request.referenceCompound}".`, 'UNKNOWN');
  }

  const mechanismResponse = transport.fetchJson(chemblMechanismUrl(moleculeId));
  if (!mechanismResponse.ok) {
    return unresolvedTarget(`ChEMBL mechanism lookup failed: ${mechanismResponse.reason}`, 'BLOCKED');
  }
  const mechanisms = readChemblMechanisms(mechanismResponse.body);
  if (mechanisms.length === 0) {
    return unresolvedTarget(
      `ChEMBL holds molecule ${moleculeId} but no mechanism-of-action record for it. The compound is known; its mechanism is not established by this source.`,
      'PARTIAL',
    );
  }

  // Several mechanisms is normal and is not a failure — it is reported as
  // such rather than silently collapsed to the first row.
  const primary = mechanisms[0]!;
  const evidence: TargetEvidenceRef[] = mechanisms.map((m) => ({
    source: 'CHEMBL' as const,
    identifier: `${moleculeId} -> ${m.targetChemblId}`,
    establishes: `Reported mechanism: ${m.mechanismOfAction}${m.actionType === null ? '' : ` (${m.actionType})`}`,
  }));

  return buildTargetHypothesis({
    targetId: primary.targetChemblId,
    targetName: primary.targetChemblId,
    biologicalSystem: null,
    mechanismHypothesis: primary.mechanismOfAction,
    status: 'RESOLVED',
    statusReason: mechanisms.length === 1
      ? `Single mechanism-of-action record in ChEMBL for ${moleculeId}.`
      : `${mechanisms.length} mechanism records in ChEMBL for ${moleculeId}; the first is used as primary and the rest are retained as evidence. A compound with several mechanisms is not fully described by one.`,
    evidence,
    applicabilityDomain: `Framed for analogues of ${request.referenceCompound}; validity outside that chemical space is unestablished.`,
    requiredValidation: [
      'A reported mechanism for the REFERENCE compound is not evidence that an analogue shares it.',
      'Obtain an experimental 3D structure of this target before any docking score can describe it.',
      'Any activity claim requires a validated binding or functional assay.',
    ],
  });
}
