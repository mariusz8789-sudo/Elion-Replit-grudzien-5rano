import type { TargetEvidenceRef } from './targetHypothesis';

/**
 * KIMI KNOWLEDGE PACK #5 — GABA-A / benzodiazepine-site quantitative excerpt.
 *
 * IMPORTANT PROVENANCE LIMIT, DISCLOSED UP FRONT: this file was NOT built
 * from the actual "GENESIS_Quantitative_Pharmacology_Knowledge_Pack_v2.txt"
 * file Kimi produced. That file lives in a different AI tool's own sandbox
 * (`sandbox:///mnt/agents/output/...`), a path this session's filesystem and
 * tools cannot reach — it was never transmitted here. What WAS transmitted
 * is a prose summary pasted into the conversation ("Kluczowe ustalenia" /
 * "Najważniejsze braki danych"), which is the ONLY source for every record
 * below. Every compound/target/value/comparability tuple here is copied
 * from that literal text; nothing is inferred, estimated, or filled in from
 * training-data recall. None of these records carry a PMID or DOI, because
 * none were included in the transmitted summary — so every record is tagged
 * `validationStatus: 'NOT_EXTRACTED'`, the SAME status knowledgePack3.ts
 * uses for a value whose source identity is named but not yet independently
 * checked against the primary text. This pack is therefore weaker evidence
 * than Pack #3/#4 (which DO carry checked PMID/DOI): it should be read as
 * "a secondary report claims this", not "Genesis verified this".
 *
 * Consequently this pack does NOT claim `LITERATURE_SUPPORTED` at the same
 * confidence as a checked citation — the evidence-basis tag used when this
 * pack feeds the Mechanistic Match Score module documents the caveat inline
 * in its own rationale string, and `deriveQuantitativeComparabilityAxis` /
 * `deriveAssayComparabilityAxis` below apply an explicit, disclosed grading
 * rule to the transmitted numbers rather than asserting a grade by hand.
 */
export const KNOWLEDGE_PACK_5_VERSION = '5.0.0-transmitted-summary-excerpt';

export type Pack5ValidationStatus = 'NOT_EXTRACTED';
export type Pack5ComparabilityTier = 'HIGH' | 'MEDIUM' | 'LOW' | 'NOT_COMPARABLE' | 'UNKNOWN';
export type Pack5Direction = 'POSITIVE_MODULATOR' | 'ANTAGONIST' | 'INVERSE_AGONIST' | 'CONFLICTING' | 'UNKNOWN';

export interface KnowledgePack5Record {
  compound: string;
  referenceCompound: string;
  target: string;
  bindingSite: string | null;
  mechanism: string;
  direction: Pack5Direction;
  measurementType: 'IC50' | 'Ki' | 'QUALITATIVE' | 'NOT_AVAILABLE';
  value: string | null;
  unit: string | null;
  assay: string | null;
  species: string | null;
  naturalStatus: 'NATURAL' | 'NATURAL_PARENT' | 'SYNTHETIC';
  /** As stated BY THE SOURCE SUMMARY ITSELF (Kimi's own tier), never computed here. */
  reportedComparability: Pack5ComparabilityTier;
  /** Ratio to the named reference compound, ONLY when the summary stated one explicitly (e.g. "6x słabsze"). Never computed or inferred by Genesis. */
  reportedRatioToReference: number | null;
  pmid: null;
  doi: null;
  databaseId: null;
  conflicts: string | null;
  limitations: string;
  validationStatus: Pack5ValidationStatus;
  validationReason: string;
}

const NOT_EXTRACTED_REASON = 'Transmitted only as a prose summary line in conversation, with no PMID/DOI attached; Genesis has not independently checked this value against a primary source.';

const record = (r: Omit<KnowledgePack5Record, 'pmid' | 'doi' | 'databaseId' | 'validationStatus' | 'validationReason'>): KnowledgePack5Record => ({
  ...r,
  pmid: null,
  doi: null,
  databaseId: null,
  validationStatus: 'NOT_EXTRACTED',
  validationReason: NOT_EXTRACTED_REASON,
});

export const KNOWLEDGE_PACK_5_RECORDS: readonly KnowledgePack5Record[] = [
  record({ compound: 'Amentoflavone', referenceCompound: 'alprazolam', target: 'GABA-A', bindingSite: 'benzodiazepine-related site', mechanism: 'positive modulator', direction: 'POSITIVE_MODULATOR', measurementType: 'IC50', value: '14.9', unit: 'nM', assay: '[3H]flunitrazepam displacement', species: null, naturalStatus: 'NATURAL', reportedComparability: 'HIGH', reportedRatioToReference: 6, conflicts: null, limitations: 'Source: Hypericum perforatum named as origin in the summary; no paper title/PMID/DOI transmitted.' }),
  record({ compound: 'Baicalein', referenceCompound: 'alprazolam', target: 'GABA-A', bindingSite: 'benzodiazepine-related site', mechanism: 'positive modulator', direction: 'POSITIVE_MODULATOR', measurementType: 'Ki', value: '7.5', unit: 'nM', assay: 'radioligand binding (assay name not specified in summary)', species: null, naturalStatus: 'NATURAL', reportedComparability: 'HIGH', reportedRatioToReference: 3, conflicts: null, limitations: 'Source: Scutellaria baicalensis named as origin in the summary; no paper title/PMID/DOI transmitted.' }),
  record({ compound: 'Isoliquiritigenin', referenceCompound: 'alprazolam', target: 'GABA-A', bindingSite: 'benzodiazepine-related site', mechanism: 'positive modulator', direction: 'POSITIVE_MODULATOR', measurementType: 'Ki', value: '453', unit: 'nM', assay: 'radioligand binding (assay name not specified in summary)', species: null, naturalStatus: 'NATURAL', reportedComparability: 'HIGH', reportedRatioToReference: null, conflicts: null, limitations: 'Source: Glycyrrhiza glabra named as origin in the summary; no explicit ratio-to-reference or paper identity transmitted.' }),
  record({ compound: 'Wogonin', referenceCompound: 'alprazolam', target: 'GABA-A', bindingSite: 'benzodiazepine-related site', mechanism: 'positive modulator', direction: 'POSITIVE_MODULATOR', measurementType: 'Ki', value: '2.03', unit: 'µM', assay: 'radioligand binding (assay name not specified in summary)', species: null, naturalStatus: 'NATURAL', reportedComparability: 'HIGH', reportedRatioToReference: null, conflicts: null, limitations: 'No explicit ratio-to-reference or paper identity transmitted; "HIGH comparability" as stated refers to assay/target/mechanism match, not potency closeness.' }),
  record({ compound: '6-Methylapigenin', referenceCompound: 'alprazolam', target: 'GABA-A', bindingSite: 'benzodiazepine-related site', mechanism: 'positive modulator', direction: 'POSITIVE_MODULATOR', measurementType: 'IC50', value: '0.5', unit: 'µM', assay: 'radioligand binding (assay name not specified in summary)', species: null, naturalStatus: 'NATURAL', reportedComparability: 'HIGH', reportedRatioToReference: null, conflicts: null, limitations: 'No explicit ratio-to-reference or paper identity transmitted.' }),
  record({ compound: 'Apigenin', referenceCompound: 'alprazolam', target: 'GABA-A', bindingSite: 'benzodiazepine-related site', mechanism: 'direction reported as species/assay-dependent', direction: 'CONFLICTING', measurementType: 'Ki', value: '4', unit: 'µM', assay: 'radioligand binding (assay name not specified in summary)', species: 'mouse (anxiolytic/agonist); rat (sedative/proconvulsant, described as inverse-agonist-like); in vitro (antagonist)', naturalStatus: 'NATURAL', reportedComparability: 'HIGH', reportedRatioToReference: null, conflicts: 'Summary explicitly reports THREE different functional directions for apigenin at GABA-A depending on species/system: mouse = anxiolytic (agonist-like), rat = sedative/proconvulsant (described as inverse-agonist-like), in vitro = antagonist. This is a genuine, disclosed directional conflict, not a single clean result.', limitations: 'No paper identity transmitted for any of the three reported directions.' }),
  record({ compound: 'Honokiol/Magnolol/Curcumol/Valerenic acid/Kuraridine', referenceCompound: 'alprazolam', target: 'GABA-A', bindingSite: 'non-benzodiazepine site', mechanism: 'reported to act via a site distinct from the classical benzodiazepine site', direction: 'UNKNOWN', measurementType: 'NOT_AVAILABLE', value: null, unit: null, assay: null, species: null, naturalStatus: 'NATURAL', reportedComparability: 'LOW', reportedRatioToReference: null, conflicts: null, limitations: 'Grouped record: summary states these act through non-BZD binding sites, hence LOW comparability to a benzodiazepine-site reference regardless of potency at their own site. No individual values transmitted.' }),
  record({ compound: 'Magnesium (Mg2+)', referenceCompound: 'ketamine', target: 'NMDAR', bindingSite: 'channel pore (voltage-dependent)', mechanism: 'voltage-dependent channel block', direction: 'ANTAGONIST', measurementType: 'IC50', value: '10-20', unit: 'µM', assay: 'voltage-dependent block (assay name not specified in summary)', species: null, naturalStatus: 'NATURAL', reportedComparability: 'MEDIUM', reportedRatioToReference: null, conflicts: null, limitations: 'Summary states this is the only natural organic NMDA blocker with quantitative data found; no paper identity transmitted.' }),
  record({ compound: 'Codeine', referenceCompound: 'morphine', target: 'MOR', bindingSite: null, mechanism: 'opioid receptor agonist (prodrug, requires CYP2D6 activation)', direction: 'POSITIVE_MODULATOR', measurementType: 'Ki', value: '>100 (rat); IC50 520 (human)', unit: 'nM', assay: 'radioligand binding / functional (assay name not specified in summary)', species: 'rat and human', naturalStatus: 'NATURAL', reportedComparability: 'MEDIUM', reportedRatioToReference: 80, conflicts: null, limitations: 'Reported as >80x weaker than morphine and a prodrug requiring CYP2D6 metabolism; no paper identity transmitted.' }),
  record({ compound: 'Thebaine', referenceCompound: 'morphine', target: 'MOR', bindingSite: null, mechanism: 'weak partial agonist/antagonist', direction: 'CONFLICTING', measurementType: 'Ki', value: '1000+', unit: 'nM', assay: 'radioligand binding (assay name not specified in summary)', species: null, naturalStatus: 'NATURAL', reportedComparability: 'LOW', reportedRatioToReference: null, conflicts: 'Summary describes thebaine as a weak partial agonist/antagonist (mixed/unclear direction) and notes it is convulsant.', limitations: 'No paper identity transmitted; convulsant liability noted as a safety concern, not a mechanism finding.' }),
  record({ compound: 'Salicylic acid', referenceCompound: 'ibuprofen', target: 'COX', bindingSite: null, mechanism: 'redox-mediated, NOT competitive active-site inhibition like ibuprofen', direction: 'CONFLICTING', measurementType: 'IC50', value: '36 (low AA); >720 (high AA)', unit: 'µM', assay: 'cellular COX assay (assay name not specified in summary)', species: null, naturalStatus: 'NATURAL', reportedComparability: 'LOW', reportedRatioToReference: null, conflicts: 'Summary reports IC50 shifting from 36 µM to >720 µM depending on arachidonic-acid (substrate) concentration used in the assay — a substrate-dependence conflict, not a single clean value.', limitations: 'Mechanism (redox) differs qualitatively from ibuprofen (competitive active-site inhibition); LOW comparability reflects mechanism mismatch, not just potency.' }),
  record({ compound: 'Cathinone', referenceCompound: 'MDMA/3-MMC', target: 'DAT/NET/SERT', bindingSite: null, mechanism: 'transporter-mediated uptake inhibition/release (estimated)', direction: 'POSITIVE_MODULATOR', measurementType: 'Ki', value: 'DAT 500-1000 (estimated); SERT >10000', unit: 'nM', assay: 'estimated from SAR of synthetic cathinones — summary explicitly states no direct measurement exists', species: null, naturalStatus: 'NATURAL_PARENT', reportedComparability: 'NOT_COMPARABLE', reportedRatioToReference: 100, conflicts: null, limitations: 'Summary explicitly flags these as SAR-estimated, not directly measured; not a same-assay comparison to MDMA/3-MMC.' }),
  record({ compound: 'Ephedrine', referenceCompound: 'amphetamine', target: 'DAT/NET', bindingSite: null, mechanism: 'indirect sympathomimetic (mechanism differs from direct transporter substrate action)', direction: 'CONFLICTING', measurementType: 'QUALITATIVE', value: null, unit: null, assay: null, species: null, naturalStatus: 'NATURAL', reportedComparability: 'LOW', reportedRatioToReference: 40, conflicts: 'Mechanism reported as indirect/pharmacologically distinct from amphetamine\'s direct action, in addition to being reported ~40x weaker.', limitations: 'No paper identity transmitted; no natural compound tested in an identical assay to MDMA/3-MMC was reported to exist.' }),
];

export function listKnowledgePack5Records(): readonly KnowledgePack5Record[] { return KNOWLEDGE_PACK_5_RECORDS; }

/**
 * Exact, case-insensitive match on the compound name. Deliberately NOT a
 * substring match: "Apigenin" and "6-Methylapigenin" are different real
 * compounds with different records, and a substring match would silently
 * return the wrong one first (e.g. looking up "Apigenin" must never return
 * "6-Methylapigenin").
 */
export function knowledgePack5RecordsFor(compound: string): readonly KnowledgePack5Record[] {
  const wanted = compound.toLowerCase();
  return KNOWLEDGE_PACK_5_RECORDS.filter((r) => r.compound.toLowerCase() === wanted);
}

export function knowledgePack5EvidenceRefs(): readonly TargetEvidenceRef[] {
  return KNOWLEDGE_PACK_5_RECORDS.map((r) => ({
    source: 'LITERATURE',
    identifier: `kimi-summary:${r.compound}`,
    establishes: `${r.compound} vs ${r.referenceCompound}: ${r.target} ${r.measurementType}=${r.value ?? 'n/a'} ${r.unit ?? ''}; reported comparability=${r.reportedComparability}. Pack validation status: ${r.validationStatus} — ${r.validationReason}`.trim(),
  }));
}

/**
 * Maps the SOURCE'S OWN stated comparability tier onto the Mechanistic Match
 * Score's assayMatch axis grade. This is a direct, documented, one-to-one
 * mapping of a value already asserted by the source summary — Genesis does
 * not compute or upgrade this tier itself:
 *   HIGH            -> PARTIAL  (same assay/target/mechanism family reported, but the
 *                                 underlying paper was never independently checked, so
 *                                 this stops short of a full MATCH)
 *   MEDIUM          -> PARTIAL
 *   LOW             -> MISMATCH (reported as a different binding site or mechanism)
 *   NOT_COMPARABLE  -> MISMATCH
 *   UNKNOWN         -> UNKNOWN  (no axis upgrade — falls back to the pre-ingestion state)
 */
export function deriveAssayComparabilityGrade(tier: Pack5ComparabilityTier): 'MATCH' | 'PARTIAL' | 'MISMATCH' | 'UNKNOWN' {
  switch (tier) {
    case 'HIGH':
    case 'MEDIUM':
      return 'PARTIAL';
    case 'LOW':
    case 'NOT_COMPARABLE':
      return 'MISMATCH';
    case 'UNKNOWN':
      return 'UNKNOWN';
  }
}

/**
 * Grades quantitative comparability ONLY from a ratio-to-reference the
 * source summary stated EXPLICITLY (e.g. "6x słabsze") — never a ratio
 * Genesis computed itself from an absolute value, since no independently
 * confirmed reference-compound potency exists in this runtime to divide by.
 * Threshold is disclosed, not hidden: within one order of magnitude (<=10x)
 * -> PARTIAL; beyond that -> MISMATCH; no explicit ratio given -> UNKNOWN.
 */
export function deriveQuantitativeComparabilityGrade(reportedRatioToReference: number | null): 'PARTIAL' | 'MISMATCH' | 'UNKNOWN' {
  if (reportedRatioToReference === null) return 'UNKNOWN';
  return reportedRatioToReference <= 10 ? 'PARTIAL' : 'MISMATCH';
}

export function knowledgePack5Fingerprint(): string {
  return KNOWLEDGE_PACK_5_RECORDS.map((r) => `${r.compound}|${r.target}|${r.measurementType}|${r.value}|${r.reportedComparability}|${r.reportedRatioToReference}`).sort().join('~');
}
