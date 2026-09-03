import { describe, expect, it } from 'vitest';
import {
  deriveAssayComparabilityGrade,
  deriveQuantitativeComparabilityGrade,
  KNOWLEDGE_PACK_5_RECORDS,
  knowledgePack5EvidenceRefs,
  knowledgePack5Fingerprint,
  knowledgePack5RecordsFor,
} from '../core/discovery/molecular/knowledgePack5';

describe('knowledgePack5 — provenance honesty', () => {
  it('1. holds at least one record for every compound named in the transmitted Kimi summary', () => {
    expect(KNOWLEDGE_PACK_5_RECORDS.length).toBeGreaterThan(0);
    for (const name of ['Amentoflavone', 'Baicalein', 'Isoliquiritigenin', 'Wogonin', '6-Methylapigenin', 'Apigenin']) {
      expect(knowledgePack5RecordsFor(name).length).toBeGreaterThan(0);
    }
  });

  it('2. every record is validationStatus NOT_EXTRACTED — no PMID/DOI was ever transmitted', () => {
    for (const r of KNOWLEDGE_PACK_5_RECORDS) {
      expect(r.validationStatus).toBe('NOT_EXTRACTED');
      expect(r.pmid).toBeNull();
      expect(r.doi).toBeNull();
      expect(r.databaseId).toBeNull();
      expect(r.validationReason.length).toBeGreaterThan(0);
    }
  });

  it('3. baicalein record matches the exact value transmitted in conversation (Ki=7.5 nM, ~3x weaker, HIGH comparability)', () => {
    const [baicalein] = knowledgePack5RecordsFor('Baicalein');
    expect(baicalein.value).toBe('7.5');
    expect(baicalein.unit).toBe('nM');
    expect(baicalein.reportedRatioToReference).toBe(3);
    expect(baicalein.reportedComparability).toBe('HIGH');
  });

  it('4. apigenin record discloses the real three-way species-dependent direction conflict', () => {
    const [apigenin] = knowledgePack5RecordsFor('Apigenin');
    expect(apigenin.direction).toBe('CONFLICTING');
    expect(apigenin.conflicts).not.toBeNull();
    expect(apigenin.conflicts!.toLowerCase()).toContain('mouse');
    expect(apigenin.conflicts!.toLowerCase()).toContain('rat');
    expect(apigenin.conflicts!.toLowerCase()).toContain('antagonist');
  });

  it('5. the non-BZD-site group (honokiol/magnolol/curcumol/valerenic acid/kuraridine) is recorded as LOW comparability, not silently dropped', () => {
    const record = KNOWLEDGE_PACK_5_RECORDS.find((r) => r.compound.includes('Honokiol'))!;
    expect(record.reportedComparability).toBe('LOW');
    expect(record.bindingSite).toBe('non-benzodiazepine site');
  });

  it('6. deriveAssayComparabilityGrade maps the source-reported tier without inventing a better one', () => {
    expect(deriveAssayComparabilityGrade('HIGH')).toBe('PARTIAL');
    expect(deriveAssayComparabilityGrade('MEDIUM')).toBe('PARTIAL');
    expect(deriveAssayComparabilityGrade('LOW')).toBe('MISMATCH');
    expect(deriveAssayComparabilityGrade('NOT_COMPARABLE')).toBe('MISMATCH');
    expect(deriveAssayComparabilityGrade('UNKNOWN')).toBe('UNKNOWN');
  });

  it('7. deriveQuantitativeComparabilityGrade only grades a ratio the source stated explicitly', () => {
    expect(deriveQuantitativeComparabilityGrade(3)).toBe('PARTIAL');
    expect(deriveQuantitativeComparabilityGrade(10)).toBe('PARTIAL');
    expect(deriveQuantitativeComparabilityGrade(11)).toBe('MISMATCH');
    expect(deriveQuantitativeComparabilityGrade(100)).toBe('MISMATCH');
    expect(deriveQuantitativeComparabilityGrade(null)).toBe('UNKNOWN');
  });

  it('8. evidence refs are generated 1:1 from records and disclose validation status', () => {
    const refs = knowledgePack5EvidenceRefs();
    expect(refs.length).toBe(KNOWLEDGE_PACK_5_RECORDS.length);
    for (const ref of refs) {
      expect(ref.establishes).toContain('NOT_EXTRACTED');
    }
  });

  it('9. the pack fingerprint is deterministic', () => {
    expect(knowledgePack5Fingerprint()).toBe(knowledgePack5Fingerprint());
  });

  it('10. no record asserts a numeric value that does not also carry an explicit unit or is explicitly NOT_AVAILABLE', () => {
    for (const r of KNOWLEDGE_PACK_5_RECORDS) {
      if (r.value !== null && r.measurementType !== 'QUALITATIVE') {
        expect(r.unit).not.toBeNull();
      }
    }
  });
});
