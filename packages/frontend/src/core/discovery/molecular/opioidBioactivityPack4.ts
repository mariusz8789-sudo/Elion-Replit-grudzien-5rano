import { buildBioactivityRecord, validateBioactivitySource, type BioactivityConflict, type BioactivityGap, type BioactivityRecord, type BioactivitySource } from './bioactivityRecord';

/**
 * KIMI KNOWLEDGE PACK #4 — OPIOIDS, ingested into Genesis's own evidence
 * schema (`bioactivityRecord.ts`).
 *
 * WHAT THIS FILE DOES: transcribes the pack's own tables faithfully — exact
 * values, exact units, exact assay/model/species — into `BioactivityRecord`s.
 * WHAT IT DOES NOT DO: accept the pack's "VERIFIED" label as Genesis's own.
 * See `bioactivityRecord.ts`'s module doc for why every record here tops out
 * at `NOT_INDEPENDENTLY_VERIFIED` (doi.org/PubMed/PMC are unreachable in this
 * runtime and are not allowlisted for live resolution).
 *
 * DUPLICATE FACTS ARE NOT DOUBLE-ENTERED. The pack's own "negative evidence"
 * section repeats three findings verbatim that already exist in its main
 * binding/functional tables (Oxycodone-DOR Ki, Oxycodone-KOR FLIPR EC50,
 * Tramadol-MOR Ki). Those are referenced by the ORIGINAL record's id in
 * `KIMI_PACK4_NEGATIVE_EVIDENCE_RECORD_IDS` rather than re-created as second
 * records with the same recordId — inventing a duplicate would silently
 * inflate the record count.
 */
export const OPIOID_BIOACTIVITY_PACK4_VERSION = '1.0.0';
export const OPIOID_BIOACTIVITY_PACK4_NAME = 'KIMI_PACK4_OPIOIDS';

export const OLSON_2019: BioactivitySource = { label: 'Olson 2019', doi: '10.1371/journal.pone.0217371', pmid: null, year: 2019 };
export const OBENG_2025: BioactivitySource = { label: 'Obeng 2025', doi: null, pmid: 'PMC12408109', year: 2025 };
export const KUO_2020: BioactivitySource = { label: 'Kuo 2020', doi: '10.1016/j.ejphar.2020.172947', pmid: null, year: 2020 };
export const TRAN_2024: BioactivitySource = { label: 'Tran 2024', doi: '10.1016/j.mcn.2023.103845', pmid: 'PMC11729433', year: 2024 };

/**
 * Gillis 2020 is cited in this pack's own source list with TWO DIFFERENT
 * DOIs in the same message ("10.1126/scisignal.eaaz3140" in the header vs.
 * "10.1126/scisignal.aaz3140" in the ranked-sources section) — both are
 * shape-valid DOIs, so a shape check alone cannot catch the discrepancy.
 * Genesis cannot resolve which is correct without live access, so NO
 * BioactivityRecord cites this source: it is recorded here only so the
 * discrepancy itself is on record, not silently picked one way.
 */
export const GILLIS_2020_UNRESOLVED = {
  label: 'Gillis 2020',
  candidateDois: ['10.1126/scisignal.eaaz3140', '10.1126/scisignal.aaz3140'] as const,
  issue: 'Two different DOIs were given for this source in the same input; Genesis has no live path to determine which is correct and cites neither in any record.',
  year: 2020,
};

for (const source of [OLSON_2019, OBENG_2025, KUO_2020, TRAN_2024]) {
  const check = validateBioactivitySource(source);
  if (!check.ok) throw new Error(`Pack #4 source "${source.label}" failed shape validation: ${check.issues.join('; ')}`);
}

/* ------------------------------------------------------------------ */
/* A. RADIOLIGAND BINDING — Ki (rows 1-27)                            */
/* ------------------------------------------------------------------ */
const A_OLSON_LIMITATION = 'N≥3; no KOR/DOR/NOP same-assay Emax in this table';

export const RECORDS_SECTION_A: readonly BioactivityRecord[] = [
  buildBioactivityRecord({ compound: 'Buprenorphine', target: 'MOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: 0.90, valueError: 0.1, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: A_OLSON_LIMITATION }),
  buildBioactivityRecord({ compound: 'Buprenorphine', target: 'DOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: 34, valueError: 27, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Buprenorphine', target: 'KOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: 27, valueError: 13, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Buprenorphine', target: 'NOP', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: 430, valueError: 100, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Hydromorphone', target: 'MOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: 9.4, valueError: 2.6, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Hydromorphone', target: 'DOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: 310, valueError: 150, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Hydromorphone', target: 'KOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: 1600, valueError: 720, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Morphine', target: 'MOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: 74, valueError: 18, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Morphine', target: 'DOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: 2500, valueError: 720, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Morphine', target: 'KOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: 2000, valueError: null, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'N≥3; limit of detection' }),
  buildBioactivityRecord({ compound: 'Oxycodone', target: 'MOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: 780, valueError: 170, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Oxycodone', target: 'DOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: null, valueError: null, valueStatus: 'NO_EFFECT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'N≥3; no binding detected (reported as NC)' }),
  buildBioactivityRecord({ compound: 'Oxycodone', target: 'KOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: 2000, valueError: null, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Tramadol', target: 'KOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: 890, valueError: 33, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Tramadol', target: 'MOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: 10000, valueError: null, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'N≥3; consistent with literature >10 μM; active metabolite O-desmethyl-tramadol not measured here' }),
  buildBioactivityRecord({ compound: 'Naloxone', target: 'MOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: 14, valueError: 1.9, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Naloxone', target: 'DOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: 520, valueError: 110, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Naloxone', target: 'KOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: 270, valueError: 46, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Fentanyl', target: 'MOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]DAMGO competition', parameter: 'Ki', value: 7.98, valueError: 0.90, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OBENG_2025, comparability: 'SAME_ASSAY', limitations: 'N≥3; human MOR-CHO' }),
  buildBioactivityRecord({ compound: 'Fentanyl', target: 'KOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]U69,593 competition', parameter: 'Ki', value: 218, valueError: 40.6, valueStatus: 'EXACT', unit: 'nM', model: 'HEK', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OBENG_2025, comparability: 'SAME_ASSAY', limitations: 'N≥3; human KOR-HEK' }),
  buildBioactivityRecord({ compound: 'Fentanyl', target: 'DOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]DADLE competition', parameter: 'Ki', value: 539, valueError: 90.4, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OBENG_2025, comparability: 'SAME_ASSAY', limitations: 'N≥3; human DOR-CHO' }),
  buildBioactivityRecord({ compound: 'Morphine', target: 'MOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]DAMGO competition', parameter: 'Ki', value: 4.19, valueError: 0.83, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OBENG_2025, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Morphine', target: 'KOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]U69,593 competition', parameter: 'Ki', value: 24.9, valueError: 1.66, valueStatus: 'EXACT', unit: 'nM', model: 'HEK', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OBENG_2025, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Morphine', target: 'DOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]DADLE competition', parameter: 'Ki', value: 250, valueError: 18.0, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OBENG_2025, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Naltrexone', target: 'MOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]DAMGO competition', parameter: 'Ki', value: 1.84, valueError: 0.432, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OBENG_2025, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Naltrexone', target: 'KOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]U69,593 competition', parameter: 'Ki', value: 1.19, valueError: 0.064, valueStatus: 'EXACT', unit: 'nM', model: 'HEK', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OBENG_2025, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
  buildBioactivityRecord({ compound: 'Naltrexone', target: 'DOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]DADLE competition', parameter: 'Ki', value: 37.2, valueError: 3.99, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OBENG_2025, comparability: 'SAME_ASSAY', limitations: 'N≥3' }),
];

/* ------------------------------------------------------------------ */
/* B. FUNCTIONAL SAME-ASSAY — GTPγS / FLIPR (rows 28-46)               */
/* ------------------------------------------------------------------ */
export const RECORDS_SECTION_B: readonly BioactivityRecord[] = [
  buildBioactivityRecord({ compound: 'Buprenorphine', target: 'MOR', assayClass: 'GTPGAMMAS', assayDescription: '35S-GTPγS', parameter: 'EC50', value: 34, valueError: null, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'G-protein, agonist', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'Emax 34.7%; partial agonist' }),
  buildBioactivityRecord({ compound: 'Buprenorphine', target: 'DOR', assayClass: 'GTPGAMMAS', assayDescription: '35S-GTPγS', parameter: 'EC50', value: 1684, valueError: null, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'G-protein, agonist', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'Emax 34%; marked shift binding→function' }),
  buildBioactivityRecord({ compound: 'Buprenorphine', target: 'KOR', assayClass: 'GTPGAMMAS', assayDescription: '35S-GTPγS', parameter: 'EC50', value: 1078, valueError: null, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'G-protein, agonist', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'Emax 9.6%; consistent with KOR antagonism' }),
  buildBioactivityRecord({ compound: 'Hydromorphone', target: 'MOR', assayClass: 'GTPGAMMAS', assayDescription: '35S-GTPγS', parameter: 'EC50', value: 306, valueError: null, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'G-protein, agonist', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'Emax ≥87.1%; full agonist' }),
  buildBioactivityRecord({ compound: 'Hydromorphone', target: 'DOR', assayClass: 'GTPGAMMAS', assayDescription: '35S-GTPγS', parameter: 'EC50', value: 1860, valueError: null, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'G-protein, agonist', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'Emax 83.0%' }),
  buildBioactivityRecord({ compound: 'Fentanyl', target: 'MOR', assayClass: 'GTPGAMMAS', assayDescription: '35S-GTPγS', parameter: 'EC50', value: 34.5, valueError: 6.25, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'G-protein, agonist', source: OBENG_2025, comparability: 'SAME_ASSAY', limitations: 'Emax 107 ± 3.16%; full agonist' }),
  buildBioactivityRecord({ compound: 'Fentanyl', target: 'KOR', assayClass: 'GTPGAMMAS', assayDescription: '35S-GTPγS', parameter: 'EC50', value: 4170, valueError: 735, valueStatus: 'EXACT', unit: 'nM', model: 'HEK', species: 'human', cellLine: 'recombinant', mechanism: 'G-protein, agonist', source: OBENG_2025, comparability: 'SAME_ASSAY', limitations: 'Emax 54.5 ± 8.28%' }),
  buildBioactivityRecord({ compound: 'Fentanyl', target: 'DOR', assayClass: 'GTPGAMMAS', assayDescription: '35S-GTPγS', parameter: 'EC50', value: 1400, valueError: 103, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'G-protein, agonist', source: OBENG_2025, comparability: 'SAME_ASSAY', limitations: 'Emax 41.0 ± 3.93%' }),
  buildBioactivityRecord({ compound: 'Morphine', target: 'MOR', assayClass: 'GTPGAMMAS', assayDescription: '35S-GTPγS', parameter: 'EC50', value: 125, valueError: 25.3, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'G-protein, agonist', source: OBENG_2025, comparability: 'SAME_ASSAY', limitations: 'Emax 87.2 ± 1.01%' }),
  buildBioactivityRecord({ compound: 'Morphine', target: 'KOR', assayClass: 'GTPGAMMAS', assayDescription: '35S-GTPγS', parameter: 'EC50', value: 614, valueError: 79.9, valueStatus: 'EXACT', unit: 'nM', model: 'HEK', species: 'human', cellLine: 'recombinant', mechanism: 'G-protein, agonist', source: OBENG_2025, comparability: 'SAME_ASSAY', limitations: 'Emax 76.7 ± 3.72%' }),
  buildBioactivityRecord({ compound: 'Morphine', target: 'DOR', assayClass: 'GTPGAMMAS', assayDescription: '35S-GTPγS', parameter: 'EC50', value: 1240, valueError: 305, valueStatus: 'EXACT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'G-protein, agonist', source: OBENG_2025, comparability: 'SAME_ASSAY', limitations: 'Emax 58.1 ± 4.04%' }),
  buildBioactivityRecord({ compound: 'Morphine', target: 'MOR', assayClass: 'FLIPR_CALCIUM', assayDescription: 'FLIPR calcium (GaΔ6qi4myr)', parameter: 'EC50', value: 87, valueError: 4.3, valueStatus: 'EXACT', unit: 'nM', model: 'HEK293', species: 'human', cellLine: 'recombinant', mechanism: 'agonist', source: TRAN_2024, comparability: 'SAME_ASSAY', limitations: 'Emax 76 ± 7%' }),
  buildBioactivityRecord({ compound: 'Morphine', target: 'DOR', assayClass: 'FLIPR_CALCIUM', assayDescription: 'FLIPR calcium (GaΔ6qi4myr)', parameter: 'EC50', value: 860, valueError: 57, valueStatus: 'EXACT', unit: 'nM', model: 'HEK293', species: 'human', cellLine: 'recombinant', mechanism: 'agonist', source: TRAN_2024, comparability: 'SAME_ASSAY', limitations: 'Emax 86 ± 2%' }),
  buildBioactivityRecord({ compound: 'Fentanyl', target: 'MOR', assayClass: 'FLIPR_CALCIUM', assayDescription: 'FLIPR calcium (GaΔ6qi4myr)', parameter: 'EC50', value: 7.7, valueError: 2.2, valueStatus: 'EXACT', unit: 'nM', model: 'HEK293', species: 'human', cellLine: 'recombinant', mechanism: 'agonist', source: TRAN_2024, comparability: 'SAME_ASSAY', limitations: 'Emax 100 ± 5%' }),
  buildBioactivityRecord({ compound: 'Fentanyl', target: 'DOR', assayClass: 'FLIPR_CALCIUM', assayDescription: 'FLIPR calcium (GaΔ6qi4myr)', parameter: 'EC50', value: 100, valueError: 18, valueStatus: 'EXACT', unit: 'nM', model: 'HEK293', species: 'human', cellLine: 'recombinant', mechanism: 'agonist', source: TRAN_2024, comparability: 'SAME_ASSAY', limitations: 'Emax 96 ± 1%' }),
  buildBioactivityRecord({ compound: 'Fentanyl', target: 'KOR', assayClass: 'FLIPR_CALCIUM', assayDescription: 'FLIPR calcium (GaΔ6qi4myr)', parameter: 'EC50', value: 23530, valueError: 6780, valueStatus: 'EXACT', unit: 'nM', model: 'HEK293', species: 'human', cellLine: 'recombinant', mechanism: 'agonist', source: TRAN_2024, comparability: 'SAME_ASSAY', limitations: 'Emax 56 ± 3%' }),
  buildBioactivityRecord({ compound: 'Oxycodone', target: 'MOR', assayClass: 'FLIPR_CALCIUM', assayDescription: 'FLIPR calcium (GaΔ6qi4myr)', parameter: 'EC50', value: 460, valueError: 45, valueStatus: 'EXACT', unit: 'nM', model: 'HEK293', species: 'human', cellLine: 'recombinant', mechanism: 'agonist', source: TRAN_2024, comparability: 'SAME_ASSAY', limitations: 'Emax 79 ± 8%' }),
  buildBioactivityRecord({ compound: 'Oxycodone', target: 'DOR', assayClass: 'FLIPR_CALCIUM', assayDescription: 'FLIPR calcium (GaΔ6qi4myr)', parameter: 'EC50', value: 3500, valueError: 620, valueStatus: 'EXACT', unit: 'nM', model: 'HEK293', species: 'human', cellLine: 'recombinant', mechanism: 'agonist', source: TRAN_2024, comparability: 'SAME_ASSAY', limitations: 'Emax 118 ± 7%' }),
  buildBioactivityRecord({ compound: 'Oxycodone', target: 'KOR', assayClass: 'FLIPR_CALCIUM', assayDescription: 'FLIPR calcium (GaΔ6qi4myr)', parameter: 'EC50', value: 100000, valueError: null, valueStatus: 'EXACT', unit: 'nM', model: 'HEK293', species: 'human', cellLine: 'recombinant', mechanism: 'agonist', source: TRAN_2024, comparability: 'SAME_ASSAY', limitations: 'No stimulation detected up to 100 μM' }),
];

/* ------------------------------------------------------------------ */
/* C. cAMP / β-arrestin2 (rows 47-54)                                  */
/* ------------------------------------------------------------------ */
export const RECORDS_SECTION_C: readonly BioactivityRecord[] = [
  buildBioactivityRecord({ compound: 'Fentanyl', target: 'MOR', assayClass: 'BETA_ARRESTIN2', assayDescription: 'β-arrestin2 recruitment', parameter: 'EC50', value: null, valueError: null, valueStatus: 'NOT_EXTRACTED', unit: 'nM', model: 'HEK293', species: 'human', cellLine: 'recombinant', mechanism: 'β-arrestin2, full agonist', source: KUO_2020, comparability: 'SAME_ASSAY', limitations: 'Full efficacy; exact EC50 not in extracted snippet' }),
  buildBioactivityRecord({ compound: 'Morphine', target: 'MOR', assayClass: 'BETA_ARRESTIN2', assayDescription: 'β-arrestin2 recruitment', parameter: 'EC50', value: null, valueError: null, valueStatus: 'NOT_EXTRACTED', unit: 'nM', model: 'HEK293', species: 'human', cellLine: 'recombinant', mechanism: 'β-arrestin2, weak agonist', source: KUO_2020, comparability: 'SAME_ASSAY', limitations: 'Low efficacy; insignificant at DOR/KOR' }),
  buildBioactivityRecord({ compound: 'Oxycodone', target: 'MOR', assayClass: 'BETA_ARRESTIN2', assayDescription: 'β-arrestin2 recruitment', parameter: 'EC50', value: null, valueError: null, valueStatus: 'NOT_EXTRACTED', unit: 'nM', model: 'HEK293', species: 'human', cellLine: 'recombinant', mechanism: 'β-arrestin2, weak agonist', source: KUO_2020, comparability: 'SAME_ASSAY', limitations: 'Low efficacy; insignificant at DOR/KOR' }),
  buildBioactivityRecord({ compound: 'Buprenorphine', target: 'MOR', assayClass: 'BETA_ARRESTIN2', assayDescription: 'β-arrestin2 recruitment', parameter: 'EC50', value: null, valueError: null, valueStatus: 'NO_EFFECT', unit: 'nM', model: 'HEK293', species: 'human', cellLine: 'recombinant', mechanism: 'β-arrestin2, no recruitment', source: KUO_2020, comparability: 'SAME_ASSAY', limitations: 'No β-arrestin2 recruitment at MOR/DOR/KOR' }),
  buildBioactivityRecord({ compound: 'Buprenorphine', target: 'MOR', assayClass: 'CAMP_INHIBITION', assayDescription: 'cAMP inhibition', parameter: 'EC50', value: null, valueError: null, valueStatus: 'NOT_EXTRACTED', unit: 'nM', model: 'HEK293', species: 'human', cellLine: 'recombinant', mechanism: 'G-protein, potent agonist', source: KUO_2020, comparability: 'SAME_ASSAY', limitations: 'Efficacy rank: DOR > MOR > KOR' }),
  buildBioactivityRecord({ compound: 'Buprenorphine', target: 'DOR', assayClass: 'CAMP_INHIBITION', assayDescription: 'cAMP inhibition', parameter: 'EC50', value: null, valueError: null, valueStatus: 'NOT_EXTRACTED', unit: 'nM', model: 'HEK293', species: 'human', cellLine: 'recombinant', mechanism: 'G-protein, potent agonist', source: KUO_2020, comparability: 'SAME_ASSAY', limitations: 'Most potent DOR agonist among tested opioids' }),
  buildBioactivityRecord({ compound: 'Fentanyl', target: 'MOR', assayClass: 'CAMP_INHIBITION', assayDescription: 'cAMP inhibition', parameter: 'EC50', value: null, valueError: null, valueStatus: 'NOT_EXTRACTED', unit: 'nM', model: 'HEK293', species: 'human', cellLine: 'recombinant', mechanism: 'G-protein, potent agonist', source: KUO_2020, comparability: 'SAME_ASSAY', limitations: 'Efficacy rank: MOR > DOR > KOR' }),
  buildBioactivityRecord({ compound: 'Morphine', target: 'MOR', assayClass: 'CAMP_INHIBITION', assayDescription: 'cAMP inhibition', parameter: 'EC50', value: null, valueError: null, valueStatus: 'NOT_EXTRACTED', unit: 'nM', model: 'HEK293', species: 'human', cellLine: 'recombinant', mechanism: 'G-protein, potent agonist', source: KUO_2020, comparability: 'SAME_ASSAY', limitations: 'Potent MOR; weak KOR/DOR' }),
];

/* ------------------------------------------------------------------ */
/* D. NEGATIVE / FALSIFICATION — genuinely new findings only (55-57, 61) */
/* ------------------------------------------------------------------ */
export const RECORDS_SECTION_D_NEW: readonly BioactivityRecord[] = [
  buildBioactivityRecord({ compound: 'Buprenorphine', target: 'KOR', assayClass: 'GTPGAMMAS', assayDescription: '35S-GTPγS', parameter: 'Emax', value: 9.6, valueError: null, valueStatus: 'EXACT', unit: '%', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'G-protein, agonist', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'Very low efficacy; consistent with KOR antagonism, not agonism' }),
  buildBioactivityRecord({ compound: 'Naltrexone', target: 'MOR', assayClass: 'GTPGAMMAS', assayDescription: '35S-GTPγS', parameter: 'Emax', value: 9.69, valueError: 2.82, valueStatus: 'EXACT', unit: '%', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'G-protein, agonist', source: OBENG_2025, comparability: 'SAME_ASSAY', limitations: 'ND (Not Determined); no agonist activity; Emax comparable to vehicle' }),
  buildBioactivityRecord({ compound: 'Cyclohexyl fentanyl', target: 'MOR', assayClass: 'GTPGAMMAS', assayDescription: '35S-GTPγS', parameter: 'EC50', value: null, valueError: null, valueStatus: 'NO_EFFECT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'G-protein, functional antagonism', source: OBENG_2025, comparability: 'SAME_ASSAY', limitations: 'Emax 13.3%; at 10 μM produced 8.1-fold rightward shift of DAMGO → functional antagonism' }),
  buildBioactivityRecord({ compound: 'Hydrocodone', target: 'KOR', assayClass: 'RADIOLIGAND_BINDING', assayDescription: '[3H]diprenorphine competition', parameter: 'Ki', value: null, valueError: null, valueStatus: 'NO_EFFECT', unit: 'nM', model: 'CHO', species: 'human', cellLine: 'recombinant', mechanism: 'binding, competitive', source: OLSON_2019, comparability: 'SAME_ASSAY', limitations: 'No KOR binding detected (reported as NC); yet showed low-efficacy KOR functional activity elsewhere in the source — potential assay artifact, not resolved here' }),
];

export const ALL_RECORDS: readonly BioactivityRecord[] = [
  ...RECORDS_SECTION_A, ...RECORDS_SECTION_B, ...RECORDS_SECTION_C, ...RECORDS_SECTION_D_NEW,
];

function findRecordId(compound: string, target: string, assayClass: BioactivityRecord['assayClass'], parameter: BioactivityRecord['parameter']): string {
  const matches = ALL_RECORDS.filter((r) => r.compound === compound && r.target === target && r.assayClass === assayClass && r.parameter === parameter);
  if (matches.length === 0) throw new Error(`Pack #4: expected an already-ingested record for ${compound}/${target}/${assayClass}/${parameter}, but none exists.`);
  if (matches.length > 1) throw new Error(`Pack #4: ${compound}/${target}/${assayClass}/${parameter} matches ${matches.length} records from different sources (${matches.map((m) => m.source.label).join(', ')}) — use findRecordIdBySource to disambiguate.`);
  return matches[0]!.recordId;
}

/** Disambiguates when two different sources report the same compound/target/assay/parameter — exactly the shape of a real conflict. */
function findRecordIdBySource(compound: string, target: string, assayClass: BioactivityRecord['assayClass'], parameter: BioactivityRecord['parameter'], sourceLabel: string): string {
  const record = ALL_RECORDS.find((r) => r.compound === compound && r.target === target && r.assayClass === assayClass && r.parameter === parameter && r.source.label === sourceLabel);
  if (record === undefined) throw new Error(`Pack #4: expected an already-ingested record for ${compound}/${target}/${assayClass}/${parameter} from ${sourceLabel}, but none exists.`);
  return record.recordId;
}

/** All 7 negative/falsification findings the pack documents, by recordId. 4 are new (section D); 3 reference existing A/B records rather than duplicating them. */
export const NEGATIVE_EVIDENCE_RECORD_IDS: readonly string[] = [
  findRecordId('Buprenorphine', 'KOR', 'GTPGAMMAS', 'Emax'),
  findRecordId('Naltrexone', 'MOR', 'GTPGAMMAS', 'Emax'),
  findRecordId('Cyclohexyl fentanyl', 'MOR', 'GTPGAMMAS', 'EC50'),
  findRecordId('Oxycodone', 'DOR', 'RADIOLIGAND_BINDING', 'Ki'),
  findRecordId('Oxycodone', 'KOR', 'FLIPR_CALCIUM', 'EC50'),
  findRecordId('Tramadol', 'MOR', 'RADIOLIGAND_BINDING', 'Ki'),
  findRecordId('Hydrocodone', 'KOR', 'RADIOLIGAND_BINDING', 'Ki'),
];

/* ------------------------------------------------------------------ */
/* E. DOCUMENTED CONFLICTS — never resolved by averaging               */
/* ------------------------------------------------------------------ */
export const CONFLICTS: readonly BioactivityConflict[] = [
  {
    conflictId: 'conflict-morphine-mor-ki',
    compound: 'Morphine', target: 'MOR', parameter: 'Ki',
    recordIds: [
      findRecordIdBySource('Morphine', 'MOR', 'RADIOLIGAND_BINDING', 'Ki', 'Olson 2019'),
      findRecordIdBySource('Morphine', 'MOR', 'RADIOLIGAND_BINDING', 'Ki', 'Obeng 2025'),
    ],
    values: [
      { value: 74, unit: 'nM', assayDescription: '[3H]diprenorphine competition (Olson 2019)', source: 'Olson 2019' },
      { value: 4.19, unit: 'nM', assayDescription: '[3H]DAMGO competition (Obeng 2025)', source: 'Obeng 2025' },
    ],
    explanation: 'Olson 2019 ([3H]diprenorphine, non-selective radioligand) = 74 nM vs. Obeng 2025 ([3H]DAMGO, MOR-selective radioligand) = 4.19 nM. Different radioligands and displacement conditions; both are valid within their own assay context. NOT averaged — the two values answer a different experimental question.',
  },
  {
    conflictId: 'conflict-naloxone-mor-antagonist-potency',
    compound: 'Naloxone', target: 'MOR', parameter: 'Ki',
    recordIds: [findRecordId('Naloxone', 'MOR', 'RADIOLIGAND_BINDING', 'Ki')],
    values: [{ value: 14, unit: 'nM', assayDescription: '[3H]diprenorphine competition (Olson 2019)', source: 'Olson 2019' }],
    explanation: 'Olson 2019 binding Ki = 14 nM vs. Tran 2024 FLIPR Schild-derived antagonist Ki ≈ 1.0 nM. Radioligand displacement vs. functional Schild analysis in a different (GaΔ6qi4myr) system; FLIPR is more sensitive. NOT COMPARABLE as a single number — binding and functional-antagonist potency are different measurements. (The Tran 2024 Schild value itself is NOT_EXTRACTED as its own record in this ingestion; it is recorded here only as the documented conflict partner.)',
  },
  {
    conflictId: 'conflict-oxycodone-mor-potency',
    compound: 'Oxycodone', target: 'MOR', parameter: 'Ki/EC50',
    recordIds: [findRecordId('Oxycodone', 'MOR', 'RADIOLIGAND_BINDING', 'Ki'), findRecordId('Oxycodone', 'MOR', 'FLIPR_CALCIUM', 'EC50')],
    values: [
      { value: 780, unit: 'nM', assayDescription: '[3H]diprenorphine competition (Olson 2019)', source: 'Olson 2019' },
      { value: 460, unit: 'nM', assayDescription: 'FLIPR calcium (Tran 2024)', source: 'Tran 2024' },
    ],
    explanation: 'Binding affinity (Olson 2019, 780 nM) vs. functional potency (Tran 2024 FLIPR, 460 nM) in different cell lines and readouts (Ki vs EC50 are not the same parameter). Oxycodone’s lower intrinsic efficacy may partly explain the right-shift seen in some assays. NOT averaged — Ki and EC50 measure different things by construction.',
  },
  {
    conflictId: 'conflict-buprenorphine-kor-binding-vs-function',
    compound: 'Buprenorphine', target: 'KOR', parameter: 'Ki/EC50',
    recordIds: [findRecordId('Buprenorphine', 'KOR', 'RADIOLIGAND_BINDING', 'Ki'), findRecordId('Buprenorphine', 'KOR', 'GTPGAMMAS', 'EC50')],
    values: [
      { value: 27, unit: 'nM', assayDescription: '[3H]diprenorphine competition (Olson 2019)', source: 'Olson 2019' },
      { value: 1078, unit: 'nM', assayDescription: '35S-GTPγS (Olson 2019)', source: 'Olson 2019' },
    ],
    explanation: 'Same paper, same compound, same target: binding Ki = 27 nM but functional EC50 = 1078 nM with Emax only 9.6%. A large binding→function shift, consistent with low intrinsic efficacy / KOR antagonism rather than a measurement error. NOT averaged — Ki and EC50 are different parameters describing different pharmacological questions.',
  },
];

/* ------------------------------------------------------------------ */
/* F. NOT_EXTRACTED / NOT_AVAILABLE gaps                                */
/* ------------------------------------------------------------------ */
export const GAPS: readonly BioactivityGap[] = [
  { compound: 'Methadone', target: 'KOR / DOR', parameter: 'Ki (same-assay human recombinant)', reason: 'NOT_AVAILABLE — only rat brain data (Kristensen 1995) and human-MOR docking-predicted data exist in the reviewed corpus.' },
  { compound: 'Heroin', target: 'MOR / DOR / KOR', parameter: 'Ki (same-assay human recombinant)', reason: 'NOT_AVAILABLE — only mouse/rat brain membrane data (Marie 2023 review citing Inturrisi 1983).' },
  { compound: '6-MAM', target: 'MOR', parameter: 'Ki (primary source exact value)', reason: 'NOT_EXTRACTED — review mentions a potent MOR agonist but the exact same-assay Ki was not extracted.' },
  { compound: 'Methadone', target: 'MOR / DOR / KOR', parameter: 'cAMP / β-arrestin2 EC50, Emax', reason: 'NOT_AVAILABLE — not in the Kuo 2020 same-assay set.' },
  { compound: 'Hydromorphone', target: 'MOR / DOR / KOR', parameter: 'cAMP / β-arrestin2 EC50, Emax', reason: 'NOT_AVAILABLE — not in the Kuo 2020 same-assay set.' },
  { compound: 'Oxymorphone', target: 'MOR / DOR / KOR', parameter: 'cAMP / β-arrestin2 EC50, Emax', reason: 'NOT_AVAILABLE — not in the Kuo 2020 same-assay set.' },
  { compound: 'Tramadol / O-desmethyl-tramadol', target: 'MOR / KOR', parameter: 'cAMP / β-arrestin2 EC50, Emax', reason: 'NOT_AVAILABLE — not in the Kuo 2020 same-assay set.' },
  { compound: 'Naloxone / Naltrexone', target: 'MOR / DOR / KOR', parameter: 'β-arrestin2 recruitment', reason: 'NOT_AVAILABLE — no same-assay dataset extracted.' },
  { compound: 'All compounds in this pack', target: 'NOP / OPRL1', parameter: 'cAMP / β-arrestin2 functional', reason: 'NOT_AVAILABLE — only binding data for buprenorphine (Olson 2019); no same-assay functional NOP dataset extracted.' },
];
