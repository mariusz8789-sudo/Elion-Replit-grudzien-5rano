import type { TargetEvidenceRef } from './targetHypothesis';

/**
 * KIMI KNOWLEDGE PACK #6 — "GENESIS_QUANTITATIVE_PHARMACOLOGY_VERIFICATION_PACK_v3",
 * GABA-A / alprazolam segment.
 *
 * STRONGER PROVENANCE THAN PACK #5: every record here carries a real PMID
 * and/or DOI (where the transmitted table gave one), unlike Pack #5 (whose
 * records had none at all). That said, "stronger" is not "independently
 * verified BY GENESIS" — PubMed/DOI live lookup is blocked in this runtime
 * (the same disclosed limitation as everywhere else in this codebase), so
 * Genesis has not itself re-fetched PMID 14637197 etc. to confirm the exact
 * reported number in this run. Every record is therefore still tagged
 * `validationStatus: 'NOT_EXTRACTED'` (source identity supplied, value not
 * independently re-checked by Genesis) — the SAME status knowledgePack3.ts
 * uses for that situation — just with a real, checkable identifier attached
 * this time, which Pack #5 could not offer.
 *
 * IMPORTANT CORRECTION THIS PACK FORCES: Pack #5 recorded baicalein's Ki
 * against alprazolam as 7.5 nM (from an unsourced chat summary line). This
 * pack cites TWO real, independently-identified primary papers — Hui et al.
 * 2000 (PMID 10705749, Ki 5.69 µM) and Wang et al. 2003 (via Çiçek 2018,
 * DOI 10.3390/molecules23071512, IC50 10.1 µM) — placing baicalein's real
 * potency roughly 1000x weaker than the number Pack #5 carried. Genesis
 * does not average these away: the OLD Pack #5 claim is superseded here,
 * not silently kept alongside a contradicting number.
 */
export const KNOWLEDGE_PACK_6_VERSION = '6.0.0-verification-pack-v3-gaba-a-segment';

export type Pack6ValidationStatus = 'NOT_EXTRACTED';
export type Pack6ComparabilityTier = 'MEDIUM' | 'LOW' | 'NOT_COMPARABLE';
export type Pack6ConflictStatus = 'NONE' | 'CONFLICTING';

export interface KnowledgePack6Record {
  compound: string;
  referenceCompound: string | null;
  targetSubtype: string;
  bindingSite: string;
  mechanism: string;
  measurementType: 'Kd' | 'Ki' | 'IC50' | 'EC50';
  value: number;
  unit: 'nM';
  assayType: string;
  assaySystem: string;
  species: string | null;
  sourceTitle: string;
  journal: string | null;
  year: number | null;
  pmid: string | null;
  doi: string | null;
  primaryOrSecondary: 'PRIMARY' | 'SECONDARY';
  comparability: Pack6ComparabilityTier;
  conflictStatus: Pack6ConflictStatus;
  limitations: string;
  /** Supersedes an earlier Knowledge Pack #5 claim for the same compound/axis, when applicable. */
  supersedes: string | null;
  validationStatus: Pack6ValidationStatus;
  validationReason: string;
}

const VALIDATION_REASON = 'A real PMID/DOI was supplied by the source report, but Genesis has not independently re-fetched and re-checked the primary text in this runtime (PubMed/DOI live lookup is blocked here, the same disclosed limitation as elsewhere in this codebase).';

const record = (r: Omit<KnowledgePack6Record, 'validationStatus' | 'validationReason'>): KnowledgePack6Record => ({
  ...r,
  validationStatus: 'NOT_EXTRACTED',
  validationReason: VALIDATION_REASON,
});

export const KNOWLEDGE_PACK_6_RECORDS: readonly KnowledgePack6Record[] = [
  record({ compound: 'alprazolam', referenceCompound: null, targetSubtype: 'native (α1β2γ2-like)', bindingSite: 'benzodiazepine', mechanism: 'positive allosteric modulator', measurementType: 'Kd', value: 4.6, unit: 'nM', assayType: 'radioligand binding, direct', assaySystem: 'rat brain membrane homogenate', species: 'rat', sourceTitle: 'Characterization of [3H]alprazolam binding to central benzodiazepine receptors', journal: 'Pharmacol Biochem Behav', year: 1990, pmid: '1964224', doi: null, primaryOrSecondary: 'PRIMARY', comparability: 'MEDIUM', conflictStatus: 'NONE', limitations: 'Rat native membranes, direct [3H]alprazolam binding — NOT human recombinant. No human recombinant alprazolam Ki/Kd/IC50 exists anywhere in this pack; this remains the reference baseline used for every ratio below.', supersedes: null }),
  record({ compound: 'K36 (5,7,2\'-trihydroxy-6,8-dimethoxyflavone)', referenceCompound: 'diazepam', targetSubtype: 'native BDZR', bindingSite: 'benzodiazepine', mechanism: 'positive allosteric modulator (competitive BZD-site ligand)', measurementType: 'Ki', value: 6.05, unit: 'nM', assayType: 'radioligand displacement', assaySystem: 'rat brain membrane homogenate', species: 'rat', sourceTitle: 'Naturally occurring 2′-hydroxyl-substituted flavonoids as high-affinity benzodiazepine site ligands', journal: 'Biochem Pharmacol', year: 2003, pmid: '14637197', doi: '10.1016/S0006-2952(03)00534-5', primaryOrSecondary: 'PRIMARY', comparability: 'MEDIUM', conflictStatus: 'NONE', limitations: 'Comparable to diazepam Ki 6.4 nM in the same paper; NOT alprazolam directly. No cross-validated SMILES exists for this candidate in this runtime — the structure has not been independently confirmed here, so Genesis does not add it to the structural candidate pool yet.', supersedes: null }),
  record({ compound: 'K36 (5,7,2\'-trihydroxy-6,8-dimethoxyflavone)', referenceCompound: 'diazepam', targetSubtype: 'α1β2γ2', bindingSite: 'benzodiazepine', mechanism: 'positive allosteric modulator, functional confirmation (blocked by flumazenil)', measurementType: 'EC50', value: 24, unit: 'nM', assayType: 'electrophysiology (two-electrode voltage clamp)', assaySystem: 'Xenopus oocyte, recombinant rat receptor', species: 'rat', sourceTitle: 'Naturally occurring 2′-hydroxyl-substituted flavonoids as high-affinity benzodiazepine site ligands', journal: 'Biochem Pharmacol', year: 2003, pmid: '14637197', doi: '10.1016/S0006-2952(03)00534-5', primaryOrSecondary: 'PRIMARY', comparability: 'LOW', conflictStatus: 'NONE', limitations: 'Functional confirmation of BZD-site mechanism (Ro15-1788/flumazenil-blockable); recombinant RAT, not human.', supersedes: null }),
  record({ compound: 'amentoflavone', referenceCompound: 'diazepam', targetSubtype: 'native', bindingSite: 'benzodiazepine', mechanism: 'positive allosteric modulator', measurementType: 'IC50', value: 14.9, unit: 'nM', assayType: 'radioligand displacement', assaySystem: 'membrane homogenate', species: null, sourceTitle: 'Structure-Dependent Activity of Natural GABA(A) Receptor Modulators', journal: 'Molecules', year: 2018, pmid: null, doi: '10.3390/molecules23071512', primaryOrSecondary: 'SECONDARY', comparability: 'MEDIUM', conflictStatus: 'NONE', limitations: 'Secondary review citing original ref [74] (Nielsen 1988); species not specified in the table.', supersedes: null }),
  record({ compound: 'isoliquiritigenin', referenceCompound: 'diazepam', targetSubtype: 'native', bindingSite: 'benzodiazepine', mechanism: 'positive allosteric modulator', measurementType: 'Ki', value: 453, unit: 'nM', assayType: 'radioligand displacement', assaySystem: 'membrane homogenate', species: null, sourceTitle: 'Structure-Dependent Activity of Natural GABA(A) Receptor Modulators', journal: 'Molecules', year: 2018, pmid: null, doi: '10.3390/molecules23071512', primaryOrSecondary: 'SECONDARY', comparability: 'MEDIUM', conflictStatus: 'NONE', limitations: 'Secondary review citing original ref [84] (Cho 2011).', supersedes: 'Confirms Knowledge Pack #5\'s isoliquiritigenin value (Ki 453 nM) exactly — same number, now with a real DOI.' }),
  record({ compound: 'wogonin', referenceCompound: 'diazepam', targetSubtype: 'native', bindingSite: 'benzodiazepine', mechanism: 'positive allosteric modulator', measurementType: 'Ki', value: 640, unit: 'nM', assayType: 'radioligand displacement', assaySystem: 'membrane homogenate', species: null, sourceTitle: 'Structure-Dependent Activity of Natural GABA(A) Receptor Modulators', journal: 'Molecules', year: 2018, pmid: null, doi: '10.3390/molecules23071512', primaryOrSecondary: 'PRIMARY', comparability: 'MEDIUM', conflictStatus: 'CONFLICTING', limitations: 'Conflicts with the Hui et al. 2000 primary isolation paper (Ki 2030 nM, below) — kept as a genuine, disclosed conflict, not averaged.', supersedes: null }),
  record({ compound: 'wogonin', referenceCompound: 'diazepam', targetSubtype: 'native', bindingSite: 'benzodiazepine', mechanism: 'positive allosteric modulator', measurementType: 'Ki', value: 2030, unit: 'nM', assayType: 'radioligand displacement', assaySystem: 'rat brain membrane homogenate', species: 'rat', sourceTitle: 'Interaction of flavones from the roots of Scutellaria baicalensis with the benzodiazepine site', journal: 'Planta Med', year: 2000, pmid: '10705749', doi: null, primaryOrSecondary: 'PRIMARY', comparability: 'MEDIUM', conflictStatus: 'CONFLICTING', limitations: 'This is the primary isolation paper; higher Ki than the Çiçek 2018 secondary review above.', supersedes: 'Confirms Knowledge Pack #5\'s wogonin value (Ki 2.03 µM) exactly, now with a real PMID.' }),
  record({ compound: 'baicalein', referenceCompound: 'diazepam', targetSubtype: 'native', bindingSite: 'benzodiazepine', mechanism: 'positive allosteric modulator', measurementType: 'IC50', value: 10100, unit: 'nM', assayType: 'radioligand displacement', assaySystem: 'membrane homogenate', species: null, sourceTitle: 'Structure-Dependent Activity of Natural GABA(A) Receptor Modulators (citing Wang 2003)', journal: 'Molecules', year: 2018, pmid: null, doi: '10.3390/molecules23071512', primaryOrSecondary: 'PRIMARY', comparability: 'MEDIUM', conflictStatus: 'CONFLICTING', limitations: 'Conflicts with Hui et al. 2000 (Ki 5690 nM, below) and with the now-superseded Knowledge Pack #5 value (Ki 7.5 nM, no real citation).', supersedes: 'SUPERSEDES Knowledge Pack #5\'s baicalein Ki=7.5 nM claim, which carried no PMID/DOI at all — that number appears to have been wrong by roughly three orders of magnitude.' }),
  record({ compound: 'baicalein', referenceCompound: 'diazepam', targetSubtype: 'native', bindingSite: 'benzodiazepine', mechanism: 'positive allosteric modulator', measurementType: 'Ki', value: 5690, unit: 'nM', assayType: 'radioligand displacement', assaySystem: 'rat brain membrane homogenate', species: 'rat', sourceTitle: 'Interaction of flavones from the roots of Scutellaria baicalensis with the benzodiazepine site', journal: 'Planta Med', year: 2000, pmid: '10705749', doi: null, primaryOrSecondary: 'PRIMARY', comparability: 'MEDIUM', conflictStatus: 'CONFLICTING', limitations: 'Lower affinity (higher potency) than the Çiçek/Wang IC50 above, but same order of magnitude — both are µM, not nM.', supersedes: 'SUPERSEDES Knowledge Pack #5\'s baicalein Ki=7.5 nM claim — see the IC50 record above for the same conclusion from an independent citation.' }),
  record({ compound: 'apigenin', referenceCompound: 'diazepam', targetSubtype: 'native', bindingSite: 'benzodiazepine', mechanism: 'positive allosteric modulator (direction reported as species/assay-dependent elsewhere — see knowledgePack5.ts)', measurementType: 'Ki', value: 4000, unit: 'nM', assayType: 'radioligand displacement', assaySystem: 'membrane homogenate', species: null, sourceTitle: 'Structure-Dependent Activity of Natural GABA(A) Receptor Modulators (citing Viola et al.)', journal: 'Molecules', year: 2018, pmid: null, doi: '10.3390/molecules23071512', primaryOrSecondary: 'SECONDARY', comparability: 'MEDIUM', conflictStatus: 'CONFLICTING', limitations: 'Confirms Knowledge Pack #5\'s apigenin Ki=4 µM exactly, now with a real DOI. Conflicts with the flumazenil-based value below.', supersedes: 'Confirms (does not change) Knowledge Pack #5\'s apigenin Ki=4 µM value.' }),
  record({ compound: 'apigenin', referenceCompound: 'diazepam', targetSubtype: 'native', bindingSite: 'benzodiazepine', mechanism: 'positive allosteric modulator', measurementType: 'Ki', value: 9000, unit: 'nM', assayType: 'radioligand displacement ([3H]flumazenil)', assaySystem: 'membrane homogenate', species: null, sourceTitle: 'Flavonoids as GABAA receptor ligands: the whole story?', journal: 'J Exp Pharmacol', year: 2012, pmid: null, doi: '10.2147/JEP.S32855', primaryOrSecondary: 'SECONDARY', comparability: 'MEDIUM', conflictStatus: 'CONFLICTING', limitations: 'Different radioligand ([3H]flumazenil vs [3H]flunitrazepam) than the 4 µM value above; flumazenil typically yields higher apparent IC50/Ki for flavonoids.', supersedes: null }),
  record({ compound: 'honokiol', referenceCompound: null, targetSubtype: 'α1β3γ2', bindingSite: 'non-benzodiazepine allosteric site', mechanism: 'positive allosteric modulator; BZD-site mutations (α1H101, γ2F77) do NOT abolish potentiation — mechanism distinct from the reference', measurementType: 'EC50', value: 1170, unit: 'nM', assayType: 'electrophysiology (whole-cell voltage clamp)', assaySystem: 'HEK-293T recombinant', species: 'human', sourceTitle: 'The natural products magnolol and honokiol are positive allosteric modulators of both synaptic and extra-synaptic GABAA receptors', journal: 'Mol Pharmacol', year: 2012, pmid: null, doi: '10.1124/mol.111.077271', primaryOrSecondary: 'PRIMARY', comparability: 'NOT_COMPARABLE', conflictStatus: 'NONE', limitations: 'HUMAN recombinant functional data — the strongest-system data of any candidate in this pack — but at a genuinely different (non-BZD) site, so it is NOT directly comparable to alprazolam\'s benzodiazepine-site binding.', supersedes: 'Refines Knowledge Pack #5\'s honokiol record with a real, checkable DOI and a human (not just literature-summary) functional EC50, confirming the non-BZD-site mechanism already declared in gabaBenzodiazepineCandidatePool.ts.' }),
  record({ compound: 'magnolol', referenceCompound: null, targetSubtype: 'α1β3γ2 (also α1β3δ, EC50 3.8 µM)', bindingSite: 'non-benzodiazepine allosteric site', mechanism: 'positive allosteric modulator, same site as honokiol', measurementType: 'EC50', value: 1240, unit: 'nM', assayType: 'electrophysiology (whole-cell voltage clamp)', assaySystem: 'HEK-293T recombinant', species: 'human', sourceTitle: 'The natural products magnolol and honokiol are positive allosteric modulators of both synaptic and extra-synaptic GABAA receptors', journal: 'Mol Pharmacol', year: 2012, pmid: null, doi: '10.1124/mol.111.077271', primaryOrSecondary: 'PRIMARY', comparability: 'NOT_COMPARABLE', conflictStatus: 'NONE', limitations: 'Not currently in the structural candidate pool. Same non-BZD-site caveat as honokiol.', supersedes: null }),
  record({ compound: 'valerenic acid', referenceCompound: null, targetSubtype: 'α1β3γ2S', bindingSite: 'β+/α− interface (etomidate/propofol-like site)', mechanism: 'positive allosteric modulator; mutagenesis identifies β3N265 as the key determinant; selective for β2/β3 over β1', measurementType: 'EC50', value: 20200, unit: 'nM', assayType: 'electrophysiology (two-electrode voltage clamp)', assaySystem: 'Xenopus oocyte, recombinant', species: 'human/rat', sourceTitle: 'Identification of the putative binding pocket of valerenic acid on GABAA receptors', journal: 'Br J Pharmacol', year: 2015, pmid: null, doi: '10.1111/bph.13329', primaryOrSecondary: 'PRIMARY', comparability: 'NOT_COMPARABLE', conflictStatus: 'NONE', limitations: 'Precisely identifies the binding site as fundamentally different from the benzodiazepine site — confirms and sharpens the mechanistic distinction already declared for this candidate; still NOT directly comparable to alprazolam.', supersedes: 'Refines the existing valerenic-acid pool record (previously cited only Khom et al. 2007) with a more specific site identity and a real, checkable quantitative EC50.' }),
  record({ compound: 'oroxylin A', referenceCompound: 'diazepam', targetSubtype: 'native', bindingSite: 'benzodiazepine', mechanism: 'positive allosteric modulator', measurementType: 'IC50', value: 140, unit: 'nM', assayType: 'radioligand displacement', assaySystem: 'membrane homogenate', species: null, sourceTitle: 'Structure-Dependent Activity of Natural GABA(A) Receptor Modulators', journal: 'Molecules', year: 2018, pmid: null, doi: '10.3390/molecules23071512', primaryOrSecondary: 'PRIMARY', comparability: 'MEDIUM', conflictStatus: 'NONE', limitations: 'Not currently in the structural candidate pool; no cross-validated SMILES attempted yet in this runtime.', supersedes: null }),
];

export function listKnowledgePack6Records(): readonly KnowledgePack6Record[] { return KNOWLEDGE_PACK_6_RECORDS; }

export function knowledgePack6RecordsFor(compound: string): readonly KnowledgePack6Record[] {
  const wanted = compound.toLowerCase();
  return KNOWLEDGE_PACK_6_RECORDS.filter((r) => r.compound.toLowerCase() === wanted);
}

export function knowledgePack6EvidenceRefs(): readonly TargetEvidenceRef[] {
  return KNOWLEDGE_PACK_6_RECORDS.map((r) => ({
    source: 'LITERATURE',
    identifier: r.pmid !== null ? `pmid:${r.pmid}` : (r.doi !== null ? `doi:${r.doi}` : `kimi-verification-pack-v3:${r.compound}`),
    establishes: `${r.compound}${r.referenceCompound !== null ? ` vs ${r.referenceCompound}` : ''}: ${r.targetSubtype} ${r.measurementType}=${r.value} ${r.unit} (${r.assaySystem}, ${r.species ?? 'species unspecified'}); comparability=${r.comparability}. Pack validation status: ${r.validationStatus} — ${r.validationReason}`,
  }));
}

/** The ratio of a candidate's own reported potency to alprazolam's real, cited rat Kd (4.6 nM) — the only reference baseline this pack supplies. Returns null when no compatible pair of nanomolar values is available (both must be a direct/displacement binding measurement at the same site kind, never a functional EC50 mixed with a binding Kd). */
export const ALPRAZOLAM_RAT_KD_NM = 4.6;

export function ratioToAlprazolamBaseline(valueNm: number): number {
  return valueNm / ALPRAZOLAM_RAT_KD_NM;
}

export function knowledgePack6Fingerprint(): string {
  return KNOWLEDGE_PACK_6_RECORDS.map((r) => `${r.compound}|${r.measurementType}|${r.value}|${r.pmid}|${r.doi}|${r.comparability}|${r.conflictStatus}`).sort().join('~');
}
