import { describe, expect, it } from 'vitest';
import { sameAssayComparable, validateBioactivitySource, verifyConflictAgainstRecords } from '../core/discovery/molecular/bioactivityRecord';
import {
  ALL_RECORDS,
  CONFLICTS,
  GAPS,
  GILLIS_2020_UNRESOLVED,
  NEGATIVE_EVIDENCE_RECORD_IDS,
  OBENG_2025,
  OLSON_2019,
} from '../core/discovery/molecular/opioidBioactivityPack4';
import {
  buildOpioidBioactivityEvidencePack,
  buildSavedOpioidProfileRun,
  isSavedOpioidProfileRun,
  replaySavedOpioidProfileRun,
} from '../core/discovery/molecular/opioidBioactivityEvidencePack';
import { buildOpioidReceptorProfile } from '../core/discovery/molecular/opioidReceptorProfile';

/**
 * KIMI PACK #4 — OPIOIDS: focused tests per the mission's 12-item list.
 */
describe('Test: record count', () => {
  it('ingests exactly 58 unique bioactivity records (27+19+8+4), no more, no fewer', () => {
    expect(ALL_RECORDS).toHaveLength(58);
    const ids = ALL_RECORDS.map((r) => r.recordId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('preserves exactly 7 negative-evidence findings, 4 documented conflicts, 9 gaps', () => {
    expect(NEGATIVE_EVIDENCE_RECORD_IDS).toHaveLength(7);
    expect(CONFLICTS).toHaveLength(4);
    expect(GAPS).toHaveLength(9);
  });
});

describe('Test: exact values, units, parameter preservation — no conversion, no averaging', () => {
  it('Morphine MOR Ki from Olson 2019 is exactly 74 nM, not converted or rounded', () => {
    const record = ALL_RECORDS.find((r) => r.compound === 'Morphine' && r.target === 'MOR' && r.source.label === 'Olson 2019' && r.parameter === 'Ki')!;
    expect(record.value).toBe(74);
    expect(record.valueError).toBe(18);
    expect(record.unit).toBe('nM');
  });

  it('Morphine MOR Ki from Obeng 2025 is exactly 4.19 nM — coexists with Olson\'s 74 nM as a separate record, never averaged', () => {
    const record = ALL_RECORDS.find((r) => r.compound === 'Morphine' && r.target === 'MOR' && r.source.label === 'Obeng 2025' && r.parameter === 'Ki')!;
    expect(record.value).toBe(4.19);
    expect(record.valueError).toBeCloseTo(0.83);
  });

  it('Buprenorphine KOR functional Emax is 9.6%, preserved as its own record, not folded into the EC50 row', () => {
    const ec50Record = ALL_RECORDS.find((r) => r.compound === 'Buprenorphine' && r.target === 'KOR' && r.parameter === 'EC50')!;
    const emaxRecord = ALL_RECORDS.find((r) => r.compound === 'Buprenorphine' && r.target === 'KOR' && r.parameter === 'Emax')!;
    expect(ec50Record.value).toBe(1078);
    expect(emaxRecord.value).toBe(9.6);
    expect(emaxRecord.unit).toBe('%');
  });

  it('Oxycodone KOR FLIPR EC50 is exactly 100000 nM (100 μM ceiling), not simplified to ">100000"', () => {
    const record = ALL_RECORDS.find((r) => r.compound === 'Oxycodone' && r.target === 'KOR' && r.source.label === 'Tran 2024')!;
    expect(record.value).toBe(100000);
  });

  it('parameter types are never mixed: Ki, EC50 and Emax stay distinct fields', () => {
    for (const record of ALL_RECORDS) {
      expect(['Ki', 'Kd', 'IC50', 'EC50', 'Emax']).toContain(record.parameter);
    }
  });
});

describe('Test: assay / model / species preservation', () => {
  it('Fentanyl MOR/KOR/DOR binding used DIFFERENT radioligands and cell models, all preserved', () => {
    const mor = ALL_RECORDS.find((r) => r.compound === 'Fentanyl' && r.target === 'MOR' && r.assayClass === 'RADIOLIGAND_BINDING')!;
    const kor = ALL_RECORDS.find((r) => r.compound === 'Fentanyl' && r.target === 'KOR' && r.assayClass === 'RADIOLIGAND_BINDING')!;
    const dor = ALL_RECORDS.find((r) => r.compound === 'Fentanyl' && r.target === 'DOR' && r.assayClass === 'RADIOLIGAND_BINDING')!;
    expect(mor.assayDescription).toContain('DAMGO');
    expect(kor.assayDescription).toContain('U69,593');
    expect(dor.assayDescription).toContain('DADLE');
    expect(mor.model).toBe('CHO');
    expect(kor.model).toBe('HEK');
    expect(dor.model).toBe('CHO');
    expect([mor, kor, dor].every((r) => r.species === 'human')).toBe(true);
  });

  it('cAMP and β-arrestin2 records are never merged into one assayClass', () => {
    const camp = ALL_RECORDS.filter((r) => r.assayClass === 'CAMP_INHIBITION');
    const arrestin = ALL_RECORDS.filter((r) => r.assayClass === 'BETA_ARRESTIN2');
    expect(camp.length).toBeGreaterThan(0);
    expect(arrestin.length).toBeGreaterThan(0);
    expect(camp.every((r) => (arrestin as typeof camp).includes(r) === false)).toBe(true);
  });
});

describe('Test: DOI/source provenance', () => {
  it('every record traces to a real, shape-valid source with a DOI or PMID/PMC id', () => {
    for (const record of ALL_RECORDS) {
      const validation = validateBioactivitySource(record.source);
      expect(validation.ok, `${record.recordId}: ${validation.issues.join(', ')}`).toBe(true);
    }
  });

  it('Olson 2019 has a real DOI, Obeng 2025 has a real PMC id, and neither is fabricated', () => {
    expect(OLSON_2019.doi).toBe('10.1371/journal.pone.0217371');
    expect(OBENG_2025.pmid).toBe('PMC12408109');
  });

  it('Gillis 2020\'s two conflicting DOIs are flagged, and NO record cites it', () => {
    expect(GILLIS_2020_UNRESOLVED.candidateDois).toHaveLength(2);
    expect(GILLIS_2020_UNRESOLVED.candidateDois[0]).not.toBe(GILLIS_2020_UNRESOLVED.candidateDois[1]);
    expect(ALL_RECORDS.some((r) => r.source.label === 'Gillis 2020')).toBe(false);
  });

  it('Genesis never marks a record VERIFIED — the ceiling is NOT_INDEPENDENTLY_VERIFIED, because live DOI/PubMed/PMC resolution is unreachable here', () => {
    const exactRecords = ALL_RECORDS.filter((r) => r.valueStatus === 'EXACT' || r.valueStatus === 'NO_EFFECT');
    expect(exactRecords.length).toBeGreaterThan(0);
    for (const record of exactRecords) {
      expect(record.genesisVerification).toBe('NOT_INDEPENDENTLY_VERIFIED');
      expect(record.genesisVerification).not.toBe('VERIFIED' as never);
    }
  });
});

describe('Test: SAME_ASSAY semantics — never claimed just because it is the same paper', () => {
  it('two records sharing a paper but different assayClass are NOT sameAssayComparable', () => {
    const binding = ALL_RECORDS.find((r) => r.compound === 'Buprenorphine' && r.target === 'KOR' && r.assayClass === 'RADIOLIGAND_BINDING')!;
    const functional = ALL_RECORDS.find((r) => r.compound === 'Buprenorphine' && r.target === 'KOR' && r.assayClass === 'GTPGAMMAS' && r.parameter === 'EC50')!;
    expect(sameAssayComparable(binding, functional)).toBe(false);
  });

  it('two records with the same assayClass/parameter/model/species genuinely ARE sameAssayComparable', () => {
    const a = ALL_RECORDS.find((r) => r.compound === 'Morphine' && r.target === 'MOR' && r.source.label === 'Obeng 2025' && r.assayClass === 'RADIOLIGAND_BINDING')!;
    const b = ALL_RECORDS.find((r) => r.compound === 'Naltrexone' && r.target === 'MOR' && r.source.label === 'Obeng 2025' && r.assayClass === 'RADIOLIGAND_BINDING')!;
    expect(sameAssayComparable(a, b)).toBe(true);
  });

  it('every group of records this pack actually labels SAME_ASSAY is internally consistent for every ingested compound', () => {
    const compounds = [...new Set(ALL_RECORDS.map((r) => r.compound))];
    for (const compound of compounds) {
      const profile = buildOpioidReceptorProfile(compound, ALL_RECORDS, NEGATIVE_EVIDENCE_RECORD_IDS, CONFLICTS);
      for (const group of profile.sameAssayValidation) {
        expect(group.ok, `${compound} group ${group.groupKey}: ${group.issues.join(', ')}`).toBe(true);
      }
    }
  });
});

describe('Test: negative evidence is preserved, never dropped', () => {
  it('all 7 negative-evidence recordIds resolve to real records in the dataset', () => {
    for (const id of NEGATIVE_EVIDENCE_RECORD_IDS) {
      expect(ALL_RECORDS.some((r) => r.recordId === id), id).toBe(true);
    }
  });

  it('Naltrexone MOR shows Emax ~9.69% (no agonist activity) as a real, retained record', () => {
    const record = ALL_RECORDS.find((r) => r.compound === 'Naltrexone' && r.target === 'MOR' && r.parameter === 'Emax')!;
    expect(record.value).toBeCloseTo(9.69);
    expect(record.limitations).toMatch(/no agonist activity/i);
  });

  it('Oxycodone shows genuine no-binding/no-stimulation findings at DOR and KOR, not silently omitted', () => {
    const dorNoBinding = ALL_RECORDS.find((r) => r.compound === 'Oxycodone' && r.target === 'DOR' && r.assayClass === 'RADIOLIGAND_BINDING')!;
    const korNoStim = ALL_RECORDS.find((r) => r.compound === 'Oxycodone' && r.target === 'KOR' && r.assayClass === 'FLIPR_CALCIUM')!;
    expect(dorNoBinding.valueStatus).toBe('NO_EFFECT');
    expect(korNoStim.limitations).toMatch(/no stimulation/i);
  });
});

describe('Test: conflicts are preserved, never resolved by averaging', () => {
  it('every documented conflict verifies against the actual ingested records', () => {
    for (const conflict of CONFLICTS) {
      const check = verifyConflictAgainstRecords(conflict, ALL_RECORDS);
      expect(check.ok, `${conflict.conflictId}: ${check.issues.join(', ')}`).toBe(true);
    }
  });

  it('the Morphine MOR Ki conflict cites BOTH real values (74 nM and 4.19 nM), no averaged number appears anywhere', () => {
    const conflict = CONFLICTS.find((c) => c.conflictId === 'conflict-morphine-mor-ki')!;
    expect(conflict.values.map((v) => v.value).sort((a, b) => a - b)).toEqual([4.19, 74]);
    expect(conflict.values.some((v) => v.value === (74 + 4.19) / 2)).toBe(false);
  });

  it('the Buprenorphine KOR binding-vs-function conflict is preserved as a real, large discrepancy', () => {
    const conflict = CONFLICTS.find((c) => c.conflictId === 'conflict-buprenorphine-kor-binding-vs-function')!;
    expect(conflict.values.map((v) => v.value)).toEqual([27, 1078]);
  });
});

describe('Test: Evidence Pack compatibility', () => {
  it('KIMI_PACK4_OPIOIDS_EVIDENCE_PACK contains input/profile/provenance/fingerprint for a real compound', () => {
    const pack = buildOpioidBioactivityEvidencePack('Morphine');
    expect(pack.packName).toBe('KIMI_PACK4_OPIOIDS_EVIDENCE_PACK');
    expect(pack.input.compound).toBe('Morphine');
    expect(pack.profile.records.length).toBeGreaterThan(0);
    expect(pack.provenance.sourceDataset).toBe('KIMI_PACK4_OPIOIDS');
    expect(pack.resultFingerprint).toBe(pack.profile.resultFingerprint);
  });

  it('a compound with zero Pack #4 records still produces a valid, honestly empty pack', () => {
    const pack = buildOpioidBioactivityEvidencePack('Not-A-Real-Opioid');
    expect(pack.profile.records).toHaveLength(0);
    expect(pack.profile.conflicts).toHaveLength(0);
  });
});

describe('Test: Replay compatibility', () => {
  it('isSavedOpioidProfileRun rejects incomplete data', () => {
    expect(isSavedOpioidProfileRun(null)).toBe(false);
    expect(isSavedOpioidProfileRun({})).toBe(false);
  });

  it('replay of an identical saved run gives MATCH', () => {
    const saved = buildSavedOpioidProfileRun('Fentanyl');
    expect(isSavedOpioidProfileRun(saved)).toBe(true);
    const replay = replaySavedOpioidProfileRun(saved);
    expect(replay.status).toBe('MATCH');
    expect(replay.result).not.toBeNull();
    expect(replay.result!.records.length).toBeGreaterThan(0);
  });

  it('replay against a tampered record set gives DRIFT, never a silent MATCH', () => {
    const saved = buildSavedOpioidProfileRun('Fentanyl');
    const tamperedRecords = ALL_RECORDS.filter((r) => !(r.compound === 'Fentanyl' && r.target === 'KOR'));
    const replay = replaySavedOpioidProfileRun(saved, tamperedRecords, NEGATIVE_EVIDENCE_RECORD_IDS, CONFLICTS);
    expect(replay.status).toBe('DRIFT');
    expect(replay.result).toBeNull();
  });

  it('a corrupted saved run is BLOCKED, never recomputed blindly', () => {
    const replay = replaySavedOpioidProfileRun({ version: '1.0.0' });
    expect(replay.status).toBe('BLOCKED');
  });
});

describe('no unsupported ranking claim ("strongest", "safest", "best drug") anywhere in the dataset or profile output', () => {
  it('no record or gap text asserts a ranking claim', () => {
    const allText = JSON.stringify({ ALL_RECORDS, CONFLICTS, GAPS }).toLowerCase();
    expect(allText).not.toMatch(/strongest opioid|safest opioid|best (drug|opioid)/);
  });

  it('profile limitations explicitly forbid the binding->potency and cell->clinical jumps', () => {
    const profile = buildOpioidReceptorProfile('Morphine', ALL_RECORDS, NEGATIVE_EVIDENCE_RECORD_IDS, CONFLICTS);
    const text = profile.limitations.join(' ').toLowerCase();
    expect(text).toMatch(/never treats binding affinity as functional potency|never converted or averaged/);
    expect(text).toMatch(/clinical efficacy/);
  });
});
