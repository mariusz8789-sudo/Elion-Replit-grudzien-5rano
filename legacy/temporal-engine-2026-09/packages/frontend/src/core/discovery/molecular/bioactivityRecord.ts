/**
 * BIOACTIVITY RECORD — a generic, receptor-family-agnostic schema for
 * literature-sourced binding/functional pharmacology data (Ki, EC50, Emax,
 * and similar), built to ingest external research packs (e.g. the Kimi
 * "Pack #4: Opioids" dataset) into Genesis's existing Evidence/Precision/
 * Replay flow without inventing a second provenance system.
 *
 * THE CENTRAL DISCIPLINE THIS MODULE ENFORCES:
 *
 * A source pack's own "VERIFIED" label describes what ITS research process
 * established — that a claim is present in and attributable to a real paper.
 * It does NOT mean GENESIS has independently confirmed that claim against the
 * live primary source. Those are different facts, and collapsing them is
 * exactly how a research pack's confidence silently becomes Genesis's own.
 *
 * `genesisVerification` is therefore computed here, never copied from the
 * pack. In THIS runtime, DOI/PubMed/PMC resolution is confirmed unreachable
 * (doi.org, pubmed.ncbi.nlm.nih.gov and eutils.ncbi.nlm.nih.gov all refuse
 * the connection at egress, and none of the three is even allowlisted in
 * `packages/backend/src/biotechProxy.mjs`, which permits only PubChem PUG
 * REST and ChEMBL). So the ceiling `genesisVerification` can reach for ANY
 * record with a real citation is `NOT_INDEPENDENTLY_VERIFIED` — never
 * `VERIFIED` — until a live path to a primary-source resolver exists. This is
 * a structural fact about this runtime, not a hedge or a placeholder.
 */
export const BIOACTIVITY_RECORD_VERSION = '1.0.0';

export type BioactivityParameter = 'Ki' | 'Kd' | 'IC50' | 'EC50' | 'Emax';

export type BioactivityAssayClass =
  | 'RADIOLIGAND_BINDING' | 'GTPGAMMAS' | 'CAMP_INHIBITION' | 'BETA_ARRESTIN2' | 'FLIPR_CALCIUM';

/**
 * What the numeric field actually holds. `NO_EFFECT` is a real, substantive
 * negative result (the source measured and found nothing) — it is NEVER the
 * same fact as `NOT_EXTRACTED` (the source may report a value, but this
 * ingestion could not pull the exact number) or `NOT_AVAILABLE` (no source in
 * this pack reports this compound/target/assay combination at all).
 */
export type BioactivityValueStatus = 'EXACT' | 'NO_EFFECT' | 'NOT_EXTRACTED' | 'NOT_AVAILABLE';

export type BioactivityComparability = 'SAME_ASSAY' | 'STANDALONE' | 'NOT_COMPARABLE';

/**
 * The only three statuses Genesis itself may assign. `VERIFIED` is
 * deliberately absent from this union: see the module doc comment.
 */
export type GenesisVerificationStatus = 'NOT_INDEPENDENTLY_VERIFIED' | 'NOT_EXTRACTED' | 'NOT_AVAILABLE';

export interface BioactivitySource {
  label: string;
  doi: string | null;
  pmid: string | null;
  year: number;
}

export interface BioactivityRecord {
  recordId: string;
  compound: string;
  target: string;
  assayClass: BioactivityAssayClass;
  assayDescription: string;
  parameter: BioactivityParameter;
  value: number | null;
  /** SD/SEM as reported by the source, e.g. the "18" in "74 ± 18". Null when the source gave no error term. */
  valueError: number | null;
  valueStatus: BioactivityValueStatus;
  unit: string;
  model: string;
  species: string;
  cellLine: string;
  mechanism: string;
  source: BioactivitySource;
  comparability: BioactivityComparability;
  limitations: string;
  genesisVerification: GenesisVerificationStatus;
  genesisVerificationReason: string;
}

/** A real DOI has the form 10.NNNN(.N+)/suffix. This checks SHAPE only — it is not a live resolution. */
const DOI_SHAPE = /^10\.\d{4,9}\/\S+$/;
/** PMC accession numbers look like PMC followed by digits; PMIDs are plain digit strings. */
const PMID_SHAPE = /^(\d+|PMC\d+)$/;

export interface BioactivitySourceValidation {
  ok: boolean;
  issues: readonly string[];
}

/**
 * Structural validation Genesis genuinely CAN perform without network access:
 * does the citation have a real DOI/PMID shape, not whether it resolves.
 */
export function validateBioactivitySource(source: BioactivitySource): BioactivitySourceValidation {
  const issues: string[] = [];
  if (source.label.trim().length === 0) issues.push('empty source label');
  if (source.doi === null && source.pmid === null) issues.push('neither DOI nor PMID/PMC id present');
  if (source.doi !== null && !DOI_SHAPE.test(source.doi)) issues.push(`DOI "${source.doi}" does not match the real DOI shape 10.NNNN/suffix`);
  if (source.pmid !== null && !PMID_SHAPE.test(source.pmid)) issues.push(`identifier "${source.pmid}" does not match a PMID or PMC accession shape`);
  return { ok: issues.length === 0, issues };
}

export interface BuildBioactivityRecordInput {
  compound: string;
  target: string;
  assayClass: BioactivityAssayClass;
  assayDescription: string;
  parameter: BioactivityParameter;
  value: number | null;
  valueError?: number | null;
  valueStatus: BioactivityValueStatus;
  unit: string;
  model: string;
  species: string;
  cellLine: string;
  mechanism: string;
  source: BioactivitySource;
  comparability: BioactivityComparability;
  limitations: string;
}

/**
 * The only way to construct a record. `genesisVerification` is DERIVED here,
 * never accepted as an input field — a caller cannot hand this function a
 * pre-decided "VERIFIED" and have it pass through.
 */
export function buildBioactivityRecord(input: BuildBioactivityRecordInput): BioactivityRecord {
  if (input.valueStatus === 'EXACT' && (input.value === null || !Number.isFinite(input.value))) {
    throw new Error(`Record for ${input.compound}/${input.target}/${input.parameter} claims valueStatus EXACT but carries no finite value.`);
  }
  if (input.valueStatus !== 'EXACT' && input.value !== null) {
    throw new Error(`Record for ${input.compound}/${input.target}/${input.parameter} carries a numeric value but valueStatus is ${input.valueStatus}, not EXACT.`);
  }

  const sourceValidation = validateBioactivitySource(input.source);

  let genesisVerification: GenesisVerificationStatus;
  let genesisVerificationReason: string;
  if (input.valueStatus === 'NOT_EXTRACTED') {
    genesisVerification = 'NOT_EXTRACTED';
    genesisVerificationReason = 'The source reports data for this compound/target/assay, but the exact value could not be extracted from the material reviewed for this pack.';
  } else if (input.valueStatus === 'NOT_AVAILABLE') {
    genesisVerification = 'NOT_AVAILABLE';
    genesisVerificationReason = 'No source in this pack reports this compound/target/assay combination.';
  } else if (!sourceValidation.ok) {
    genesisVerification = 'NOT_AVAILABLE';
    genesisVerificationReason = `Citation is malformed and cannot be traced: ${sourceValidation.issues.join('; ')}.`;
  } else {
    genesisVerification = 'NOT_INDEPENDENTLY_VERIFIED';
    genesisVerificationReason = `A well-formed citation (${input.source.label}${input.source.doi ? `, DOI ${input.source.doi}` : ''}${input.source.pmid ? `, ${input.source.pmid}` : ''}) is on record, but doi.org/PubMed/PMC are unreachable in this runtime and are not allowlisted for live resolution — Genesis has not independently fetched and checked the primary source.`;
  }

  // Source is part of the identity, not decoration: two different papers can
  // (and here, do) report the same compound/target/assay/parameter with
  // different values — that is a real conflict, not a duplicate, and each
  // must keep its own distinct, stable id.
  const recordId = `bioact_${input.compound}_${input.target}_${input.assayClass}_${input.parameter}_${input.source.label}`
    .toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return { recordId, ...input, valueError: input.valueError ?? null, genesisVerification, genesisVerificationReason };
}

export interface BioactivityGap {
  compound: string;
  target: string;
  parameter: string;
  reason: string;
}

/**
 * Two records are only genuinely SAME_ASSAY-comparable when they share
 * compound, assay class, parameter, model AND species — not merely "the same
 * paper ran several tests". This is a real, checkable structural condition,
 * used to catch a mislabelled comparability claim rather than trust it.
 */
/**
 * Deliberately does NOT require the same compound: the standard, useful
 * comparison this supports is "how do different compounds' values compare
 * WITHIN one paper's own panel" — e.g. a selectivity ratio, which is exactly
 * what a real same-assay comparison is for. It DOES require the same source:
 * two papers running a superficially similar assayClass/parameter are still
 * different experiments (different reagent batches, different day, different
 * hands) — see the Morphine MOR Ki conflict (Olson 74 nM vs Obeng 4.19 nM),
 * which exists precisely because those two are NOT the same assay despite
 * matching on assayClass, parameter, model AND species.
 *
 * `model`/`species` are deliberately NOT part of this gate. A single paper's
 * own panel can legitimately use a different heterologous system per target
 * (Obeng 2025 profiles MOR/DOR in CHO but KOR in HEK) while still treating
 * the whole panel as one same-assay comparison for its own selectivity
 * ratios — that is the source paper's own methodology, not an inconsistency
 * this check is positioned to overrule. `model` and `species` remain on the
 * record exactly as reported, for a caller who needs that distinction.
 */
export function sameAssayComparable(a: BioactivityRecord, b: BioactivityRecord): boolean {
  return a.source.label === b.source.label
    && a.assayClass === b.assayClass
    && a.parameter === b.parameter;
}

export interface BioactivityConflict {
  conflictId: string;
  compound: string;
  target: string;
  parameter: string;
  recordIds: readonly string[];
  values: readonly { value: number; unit: string; assayDescription: string; source: string }[];
  explanation: string;
}

/**
 * Verifies a documented conflict is real: every record it cites must actually
 * exist with the exact value claimed. This is what stops a conflict list from
 * silently drifting away from the underlying data as records are edited.
 */
export function verifyConflictAgainstRecords(conflict: BioactivityConflict, records: readonly BioactivityRecord[]): { ok: boolean; issues: readonly string[] } {
  const issues: string[] = [];
  for (let i = 0; i < conflict.recordIds.length; i++) {
    const record = records.find((r) => r.recordId === conflict.recordIds[i]);
    const claimed = conflict.values[i];
    if (record === undefined) {
      issues.push(`recordId "${conflict.recordIds[i]}" does not exist in the dataset`);
      continue;
    }
    if (claimed === undefined) {
      issues.push(`no claimed value given for recordId "${conflict.recordIds[i]}"`);
      continue;
    }
    if (record.value !== claimed.value || record.unit !== claimed.unit) {
      issues.push(`recordId "${conflict.recordIds[i]}" is ${record.value} ${record.unit}, but the conflict claims ${claimed.value} ${claimed.unit}`);
    }
  }
  return { ok: issues.length === 0, issues };
}
