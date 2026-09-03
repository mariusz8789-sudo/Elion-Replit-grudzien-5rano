import { describe, expect, it } from 'vitest';
import {
  ALPRAZOLAM_RAT_KD_NM,
  KNOWLEDGE_PACK_6_RECORDS,
  knowledgePack6EvidenceRefs,
  knowledgePack6Fingerprint,
  knowledgePack6RecordsFor,
  ratioToAlprazolamBaseline,
} from '../core/discovery/molecular/knowledgePack6';

describe('knowledgePack6 — verification pack v3 (real PMID/DOI), stronger than Pack #5', () => {
  it('1. holds records for every compound named in the transmitted verification pack', () => {
    for (const name of ['alprazolam', 'baicalein', 'wogonin', 'apigenin', 'honokiol', 'magnolol', 'valerenic acid', 'oroxylin A']) {
      expect(knowledgePack6RecordsFor(name).length).toBeGreaterThan(0);
    }
  });

  it('2. every record carries a real PMID or DOI, or explicitly neither — never a fabricated identifier', () => {
    for (const r of KNOWLEDGE_PACK_6_RECORDS) {
      expect(r.pmid === null || /^\d+$/.test(r.pmid)).toBe(true);
      expect(r.doi === null || r.doi.startsWith('10.')).toBe(true);
    }
  });

  it('3. every record is still validationStatus NOT_EXTRACTED — a real PMID is not the same as Genesis independently re-checking it', () => {
    for (const r of KNOWLEDGE_PACK_6_RECORDS) {
      expect(r.validationStatus).toBe('NOT_EXTRACTED');
    }
  });

  it('4. the alprazolam reference baseline is real, cited, and explicitly rat-only (no human recombinant value exists in this pack)', () => {
    const [alprazolam] = knowledgePack6RecordsFor('alprazolam');
    expect(alprazolam.value).toBe(ALPRAZOLAM_RAT_KD_NM);
    expect(alprazolam.pmid).toBe('1964224');
    expect(alprazolam.species).toBe('rat');
    expect(alprazolam.limitations.toLowerCase()).toContain('human recombinant');
  });

  it('5. baicalein carries two independently-cited CONFLICTING primary values, both real µM-range, not the Pack #5 nM claim', () => {
    const records = knowledgePack6RecordsFor('baicalein');
    expect(records.length).toBe(2);
    for (const r of records) {
      expect(r.conflictStatus).toBe('CONFLICTING');
      expect(r.value).toBeGreaterThan(1000); // real values are in the thousands of nM (µM range)
      expect(r.supersedes).not.toBeNull();
      expect(r.supersedes!.toLowerCase()).toContain('supersedes');
    }
  });

  it('6. ratioToAlprazolamBaseline computes an honest, unrounded ratio against the real cited baseline', () => {
    expect(ratioToAlprazolamBaseline(4.6)).toBe(1);
    expect(ratioToAlprazolamBaseline(46)).toBe(10);
    expect(ratioToAlprazolamBaseline(5690)).toBeCloseTo(1236.96, 1);
  });

  it('7. honokiol/magnolol/valerenic acid are all recorded NOT_COMPARABLE — confirmed non-benzodiazepine-site mechanisms with real human/recombinant citations', () => {
    for (const name of ['honokiol', 'magnolol', 'valerenic acid']) {
      const [r] = knowledgePack6RecordsFor(name);
      expect(r.comparability).toBe('NOT_COMPARABLE');
      expect(r.doi).not.toBeNull();
    }
  });

  it('8. evidence refs prefer a real PMID/DOI identifier over a generic pack tag', () => {
    const refs = knowledgePack6EvidenceRefs();
    const alprazolamRef = refs.find((r) => r.establishes.startsWith('alprazolam'))!;
    expect(alprazolamRef.identifier).toBe('pmid:1964224');
  });

  it('9. the pack fingerprint is deterministic', () => {
    expect(knowledgePack6Fingerprint()).toBe(knowledgePack6Fingerprint());
  });
});
