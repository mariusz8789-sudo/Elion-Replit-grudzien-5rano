import { canonicalJson, fnv1a } from '../../events/hash';
import { sameAssayComparable, type BioactivityConflict, type BioactivityRecord } from './bioactivityRecord';

/**
 * OPIOID RECEPTOR PROFILE — REFERENCE COMPOUND → binding → functional
 * signaling → efficacy → antagonist/negative evidence → comparability →
 * conflicts, over the ingested Pack #4 dataset (`opioidBioactivityPack4.ts`).
 *
 * Generic over the compound and the record set — nothing here is Pack #4 or
 * opioid-specific in its logic; a future pack for another receptor family can
 * reuse this unchanged as long as it produces `BioactivityRecord[]`.
 */
export const OPIOID_RECEPTOR_PROFILE_VERSION = '1.0.0';

export interface SameAssayGroupValidation {
  groupKey: string;
  recordIds: readonly string[];
  /** True only when every record claiming SAME_ASSAY in this group genuinely shares source+assayClass+parameter. */
  ok: boolean;
  issues: readonly string[];
}

export interface ReceptorProfileResult {
  compound: string;
  records: readonly BioactivityRecord[];
  byTarget: Readonly<Record<string, readonly BioactivityRecord[]>>;
  byAssayClass: Readonly<Record<string, readonly BioactivityRecord[]>>;
  negativeEvidence: readonly BioactivityRecord[];
  conflicts: readonly BioactivityConflict[];
  sameAssayValidation: readonly SameAssayGroupValidation[];
  comparabilitySummary: { sameAssay: number; standalone: number; notComparable: number };
  limitations: readonly string[];
  resultFingerprint: string;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    (groups[key(item)] ??= []).push(item);
  }
  return groups;
}

/**
 * Checks every declared SAME_ASSAY group for real internal consistency —
 * "the same paper ran several tests" is explicitly NOT sufficient (mission
 * instruction); source, assayClass AND parameter must all match. Grouped by
 * source rather than compound: the standard same-assay comparison this
 * supports is cross-compound WITHIN one paper's own panel (e.g. a
 * selectivity ratio) — see `sameAssayComparable`'s doc comment in
 * `bioactivityRecord.ts` for the full rationale, including why model/species
 * are deliberately not part of this gate.
 */
function validateSameAssayGroups(records: readonly BioactivityRecord[]): readonly SameAssayGroupValidation[] {
  const sameAssayRecords = records.filter((r) => r.comparability === 'SAME_ASSAY');
  const groups = groupBy(sameAssayRecords, (r) => `${r.source.label}::${r.assayClass}::${r.parameter}`);
  return Object.entries(groups).map(([groupKey, groupRecords]) => {
    const issues: string[] = [];
    for (let i = 1; i < groupRecords.length; i++) {
      if (!sameAssayComparable(groupRecords[0]!, groupRecords[i]!)) {
        issues.push(`${groupRecords[i]!.recordId} does not match ${groupRecords[0]!.recordId} on source/assayClass/parameter despite both being labelled SAME_ASSAY`);
      }
    }
    return { groupKey, recordIds: groupRecords.map((r) => r.recordId), ok: issues.length === 0, issues };
  });
}

export function buildOpioidReceptorProfile(
  compound: string,
  allRecords: readonly BioactivityRecord[],
  negativeEvidenceRecordIds: readonly string[],
  allConflicts: readonly BioactivityConflict[],
): ReceptorProfileResult {
  const records = allRecords.filter((r) => r.compound === compound);
  const byTarget = groupBy(records, (r) => r.target);
  const byAssayClass = groupBy(records, (r) => r.assayClass);
  const negativeEvidence = records.filter((r) => negativeEvidenceRecordIds.includes(r.recordId));
  const conflicts = allConflicts.filter((c) => c.compound === compound);
  const sameAssayValidation = validateSameAssayGroups(records);

  const comparabilitySummary = {
    sameAssay: records.filter((r) => r.comparability === 'SAME_ASSAY').length,
    standalone: records.filter((r) => r.comparability === 'STANDALONE').length,
    notComparable: records.filter((r) => r.comparability === 'NOT_COMPARABLE').length,
  };

  const notIndependentlyVerifiedCount = records.filter((r) => r.genesisVerification === 'NOT_INDEPENDENTLY_VERIFIED').length;
  const limitations: string[] = [
    `${notIndependentlyVerifiedCount} of ${records.length} record(s) for ${compound} carry a real citation but are NOT_INDEPENDENTLY_VERIFIED: doi.org/PubMed/PMC are unreachable in this runtime and are not allowlisted for live resolution.`,
    'Ki, EC50 and Emax are distinct parameters describing different pharmacological questions (affinity vs. potency vs. efficacy) and are never converted or averaged into one another here.',
    'No conclusion in this profile treats binding affinity as functional potency, an animal or heterologous-cell result as a human effect, or a cell-based functional assay as clinical efficacy.',
    conflicts.length > 0
      ? `${conflicts.length} documented conflict(s) for ${compound} are preserved as CONFLICTING, not resolved by averaging.`
      : `No documented conflict for ${compound} in this pack.`,
  ];

  const resultFingerprint = fnv1a(canonicalJson({
    v: OPIOID_RECEPTOR_PROFILE_VERSION,
    compound,
    recordIds: records.map((r) => r.recordId).sort(),
    conflictIds: conflicts.map((c) => c.conflictId).sort(),
  }));

  return { compound, records, byTarget, byAssayClass, negativeEvidence, conflicts, sameAssayValidation, comparabilitySummary, limitations, resultFingerprint };
}
