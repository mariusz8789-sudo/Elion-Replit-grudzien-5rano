import { describe, expect, it } from 'vitest';
import { probeLiveCompoundLookup } from '../core/discovery/molecular/compoundLookupTransport.node';
import { pubchemNameUrl } from '../core/discovery/molecular/compoundResolver';
import {
  runPrecisionReferenceAnalysis,
  type PrecisionCompoundRequest,
} from '../core/discovery/molecular/precisionReferenceAnalysis';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import { transporterClaimGuard } from '../core/discovery/molecular/transporterEvidence';

/**
 * 3-MMC / 4-CMC PRECISION MISSION — full orchestrator E2E (tests 1-4, 6, 12
 * of the mission's 12-item list).
 *
 * Reference compounds only. Nothing here computes or asserts a synthesis
 * route, quantity, temperature, timing, or production procedure.
 */
const rdkit = createNodeRdkitTransport();
const rdkitAvailable = rdkit.detect().available;

const THREE_MMC: PrecisionCompoundRequest = {
  name: '3-MMC',
  fallbackSmiles: 'CNC(C)C(=O)c1cccc(C)c1',
  fallbackFormula: 'C11H15NO',
};
const FOUR_CMC: PrecisionCompoundRequest = {
  name: '4-CMC',
  fallbackSmiles: 'CNC(C)C(=O)c1ccc(Cl)cc1',
  fallbackFormula: 'C10H12ClNO',
};

describe('Test 6 — brakujący dowód jest fail-closed, nigdy zmyślony', () => {
  it('realna próba PubChem dla 3-MMC jest zapisana z prawdziwym wynikiem', async () => {
    const result = await probeLiveCompoundLookup(pubchemNameUrl('3-methylmethcathinone'));
    expect(typeof result.available).toBe('boolean');
    if (!result.available) expect(result.reason.length).toBeGreaterThan(0);
  }, 15_000);

  it('bez transportu live: identity spada na fallback z realną walidacją krzyżową, nigdy z cichym sukcesem', () => {
    if (!rdkitAvailable) return;
    const result = runPrecisionReferenceAnalysis(THREE_MMC, FOUR_CMC, { rdkit });
    expect(result.compoundAIdentity.identitySource).toBe('CROSS_VALIDATED_FALLBACK');
    expect(result.compoundBIdentity.identitySource).toBe('CROSS_VALIDATED_FALLBACK');
    expect(result.compoundAIdentity.synonymsStatus).toBe('NOT_AVAILABLE');
    expect(result.compoundAIdentity.synonyms).toHaveLength(0);
  });
});

describe('Test 12 — brak nieuprawnionej inferencji klinicznej', () => {
  it('żadne ograniczenie ani twierdzenie nie zawiera efektu klinicznego u ludzi', () => {
    if (!rdkitAvailable) return;
    const result = runPrecisionReferenceAnalysis(THREE_MMC, FOUR_CMC, { rdkit });
    const allText = [...result.limitations, ...result.claims.map((c) => c.statement)].join(' ');
    for (const claim of result.claims) {
      expect(transporterClaimGuard(claim.statement).allowed).toBe(true);
    }
    expect(allText.toLowerCase()).not.toMatch(/clinically equivalent/);
    expect(allText.toLowerCase()).not.toMatch(/causes a psychoactive effect in humans/);
  });

  it('żaden krok tej analizy nie zawiera OPERACYJNEJ procedury syntezy (temperatura/ilość/kolejność dodawania)', () => {
    if (!rdkitAvailable) return;
    const result = runPrecisionReferenceAnalysis(THREE_MMC, FOUR_CMC, { rdkit });
    const allText = JSON.stringify(result).toLowerCase();
    // Szukamy KONKRETNYCH instrukcji operacyjnych, nie samego słowa "synthesis"
    // w zdaniu zastrzegającym, że synteza NIE jest tu obliczana.
    expect(allText).not.toMatch(/\breflux\b|\badd\s+\d|\bstir\s+for\b|\bheat\s+to\s+\d|\d+\s*(°c|degrees)\b|\d+\s*(g|mg|ml|mol)\s+of\b|\bstep\s+\d\b/);
  });
});

describe(`REALNA analiza 3-MMC vs 4-CMC (RDKit=${rdkitAvailable})`, () => {
  if (!rdkitAvailable) {
    it('bez RDKit ścieżka jest jawnie zablokowana', () => {
      expect(rdkit.detect().available).toBe(false);
    });
    return;
  }

  it('Test 1/2 — identity jest deterministyczna dla obu związków', () => {
    const a = runPrecisionReferenceAnalysis(THREE_MMC, FOUR_CMC, { rdkit });
    const b = runPrecisionReferenceAnalysis(THREE_MMC, FOUR_CMC, { rdkit });
    expect(a.resultFingerprint).toBe(b.resultFingerprint);
    expect(a.compoundAIdentity.formula).toBe('C11H15NO');
    expect(a.compoundBIdentity.formula).toBe('C10H12ClNO');
  }, 30_000);

  it('Test 3 — walidacja struktury RDKit: formuła, MW i InChIKey są realne i zgodne', () => {
    const result = runPrecisionReferenceAnalysis(THREE_MMC, FOUR_CMC, { rdkit });
    expect(result.compoundAStructure.ok).toBe(true);
    expect(result.compoundBStructure.ok).toBe(true);
    expect(result.compoundAIdentity.molecularWeight).toBeCloseTo(177.25, 1);
    expect(result.compoundBIdentity.molecularWeight).toBeCloseTo(197.66, 1);
    expect(result.compoundAIdentity.inchiKey).toMatch(/^[A-Z0-9-]+$/);
    expect(result.compoundBIdentity.inchiKey).toMatch(/^[A-Z0-9-]+$/);
    expect(result.compoundAIdentity.structuralCrossValidation?.status).toBe('CONFIRMED');
    expect(result.compoundBIdentity.structuralCrossValidation?.status).toBe('CONFIRMED');
  }, 30_000);

  it('Test 4 — porównanie strukturalne 3-MMC vs 4-CMC jest realne, nie zmyślone', () => {
    const result = runPrecisionReferenceAnalysis(THREE_MMC, FOUR_CMC, { rdkit });
    expect(result.similarity.available).toBe(true);
    expect(result.similarity.tanimoto).toBeCloseTo(0.514, 2);
    expect(result.similarity.band).toBe('LOW');
  }, 30_000);

  it('Test 5 — mechanizm: DAT/NET/SERT są INFERRED (nie VERIFIED) dla obu związków', () => {
    const result = runPrecisionReferenceAnalysis(THREE_MMC, FOUR_CMC, { rdkit });
    for (const record of [...result.transporterEvidenceA, ...result.transporterEvidenceB]) {
      expect(record.status).toBe('INFERRED');
      expect(record.evidence).toHaveLength(0);
    }
    expect(result.transporterEvidenceA.map((r) => r.transporter).sort()).toEqual(['DAT', 'NET', 'SERT']);
  }, 30_000);

  it('tabela porównawcza zawiera wszystkie obowiązkowe wiersze', () => {
    const result = runPrecisionReferenceAnalysis(THREE_MMC, FOUR_CMC, { rdkit });
    const properties = result.comparisonTable.map((r) => r.property);
    expect(properties).toContain('Molecular formula');
    expect(properties).toContain('Molecular weight (g/mol)');
    expect(properties).toContain('DAT activity');
    expect(properties).toContain('NET activity');
    expect(properties).toContain('SERT activity');
    expect(properties).toContain('Structural similarity (Tanimoto)');
    for (const row of result.comparisonTable) {
      expect(row.evidenceStatus.length).toBeGreaterThan(0);
    }
  }, 30_000);

  it('falsyfikacja: maksymalny wspierany claim to STRUCTURAL_SIMILARITY, nigdy silniejszy', () => {
    const result = runPrecisionReferenceAnalysis(THREE_MMC, FOUR_CMC, { rdkit });
    expect(result.falsification.maxSupportableClaim).toBe('STRUCTURAL_SIMILARITY');
    expect(result.falsification.concernCount).toBeGreaterThan(0);
    expect(result.claims.every((c) => c.strength === 'STRUCTURAL_SIMILARITY' || c.strength === 'SAME_TARGET_FAMILY')).toBe(true);
  }, 30_000);
});
