import { describe, expect, it } from 'vitest';
import {
  deriveConfidence,
  describeConfidence,
  isValidConfidenceTransition,
  type EvidenceForConfidence,
} from '../core/discovery/molecular/confidenceLadder';

/**
 * NATURAL-DISCOVERY MISSION, ETAP 7 — CONFIDENCE MUST BE EARNED.
 *
 * "Nigdy nie oznaczaj poziomu 5 bez rzeczywistych eksperymentów." Level 5 is
 * checked here as a TYPE fact (deriveConfidence cannot return it — the test
 * exhaustively tries every input shape) and a RUNTIME fact (describeConfidence
 * throws without a real reference).
 */
const NO_EVIDENCE: EvidenceForConfidence = { hasHypothesis: false, independentSources: [], completedComputationalChecks: [] };

describe('poziom 0 — brak dowodu', () => {
  it('brak hipotezy => 0, niezależnie od czegokolwiek innego', () => {
    expect(deriveConfidence(NO_EVIDENCE)).toBe(0);
    expect(deriveConfidence({
      hasHypothesis: false,
      independentSources: [{ sourceKey: 'a', kind: 'LITERATURE', cited: true }, { sourceKey: 'b', kind: 'PDB', cited: true }],
      completedComputationalChecks: ['RDKIT_DESCRIPTORS', 'ADMET_AI'],
    })).toBe(0);
  });
});

describe('poziom 1 — hipoteza obliczeniowa bez źródła', () => {
  it('hipoteza + brak cytowanych źródeł => 1', () => {
    expect(deriveConfidence({ hasHypothesis: true, independentSources: [], completedComputationalChecks: [] })).toBe(1);
  });

  it('źródło BEZ cytacji nie liczy się jako wsparcie', () => {
    const evidence: EvidenceForConfidence = {
      hasHypothesis: true,
      independentSources: [{ sourceKey: 'assertion', kind: 'USER_ASSERTION', cited: false }],
      completedComputationalChecks: [],
    };
    expect(deriveConfidence(evidence)).toBe(1);
  });
});

describe('poziom 2 — dokładnie jedno cytowane źródło', () => {
  it('jedno cytowane źródło => 2', () => {
    const evidence: EvidenceForConfidence = {
      hasHypothesis: true,
      independentSources: [{ sourceKey: 'popik1994', kind: 'LITERATURE', cited: true }],
      completedComputationalChecks: [],
    };
    expect(deriveConfidence(evidence)).toBe(2);
  });

  it('to samo źródło policzone dwukrotnie (ten sam klucz) pozostaje jednym', () => {
    const evidence: EvidenceForConfidence = {
      hasHypothesis: true,
      independentSources: [
        { sourceKey: 'popik1994', kind: 'LITERATURE', cited: true },
        { sourceKey: 'popik1994', kind: 'LITERATURE', cited: true },
      ],
      completedComputationalChecks: [],
    };
    expect(deriveConfidence(evidence)).toBe(2);
  });

  it('obliczenia same w sobie NIE podnoszą do 3 bez wielu źródeł', () => {
    const evidence: EvidenceForConfidence = {
      hasHypothesis: true,
      independentSources: [{ sourceKey: 'a', kind: 'LITERATURE', cited: true }],
      completedComputationalChecks: ['RDKIT_DESCRIPTORS', 'ADMET_AI', 'DOCKING'],
    };
    expect(deriveConfidence(evidence)).toBe(2);
  });
});

describe('poziom 3 — wiele niezależnych źródeł', () => {
  it('dwa różne cytowane źródła => 3', () => {
    const evidence: EvidenceForConfidence = {
      hasHypothesis: true,
      independentSources: [
        { sourceKey: 'yang-reis-1999', kind: 'LITERATURE', cited: true },
        { sourceKey: 'pubchem-cid-199', kind: 'PUBCHEM', cited: true },
      ],
      completedComputationalChecks: [],
    };
    expect(deriveConfidence(evidence)).toBe(3);
  });
});

describe('poziom 4 — niezależne wsparcie OBLICZENIOWE ponad wieloma źródłami', () => {
  it('wiele źródeł + >=2 różne silniki obliczeniowe => 4', () => {
    const evidence: EvidenceForConfidence = {
      hasHypothesis: true,
      independentSources: [
        { sourceKey: 'yang-reis-1999', kind: 'LITERATURE', cited: true },
        { sourceKey: 'pubchem-cid-199', kind: 'PUBCHEM', cited: true },
      ],
      completedComputationalChecks: ['RDKIT_DESCRIPTORS', 'ADMET_AI'],
    };
    expect(deriveConfidence(evidence)).toBe(4);
  });

  it('jeden powtórzony silnik nie liczy się jako dwa', () => {
    const evidence: EvidenceForConfidence = {
      hasHypothesis: true,
      independentSources: [
        { sourceKey: 'a', kind: 'LITERATURE', cited: true },
        { sourceKey: 'b', kind: 'PDB', cited: true },
      ],
      completedComputationalChecks: ['RDKIT_DESCRIPTORS', 'RDKIT_DESCRIPTORS'],
    };
    expect(deriveConfidence(evidence)).toBe(3);
  });
});

describe('poziom 5 jest strukturalnie nieosiągalny z deriveConfidence', () => {
  it('żadna kombinacja wejść nie daje 5 (przeszukanie wyczerpujące nad rozsądną przestrzenią)', () => {
    const sourceKinds = ['LITERATURE', 'PUBLIC_DATABASE_RECORD', 'PDB', 'CHEMBL', 'PUBCHEM', 'USER_ASSERTION'] as const;
    const engineNames = ['RDKIT_DESCRIPTORS', 'ADMET_AI', 'DOCKING', 'STRUCTURAL_SIMILARITY', 'TARGET_RESOLUTION'];
    for (let sourceCount = 0; sourceCount <= 5; sourceCount++) {
      for (let engineCount = 0; engineCount <= 5; engineCount++) {
        for (const hasHypothesis of [true, false]) {
          const evidence: EvidenceForConfidence = {
            hasHypothesis,
            independentSources: Array.from({ length: sourceCount }, (_, i) => ({
              sourceKey: `source-${i}`, kind: sourceKinds[i % sourceKinds.length]!, cited: true,
            })),
            completedComputationalChecks: engineNames.slice(0, engineCount),
          };
          const level = deriveConfidence(evidence);
          expect(level).toBeLessThanOrEqual(4);
          expect(level).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe('describeConfidence: poziom 5 wymaga realnej referencji eksperymentalnej', () => {
  it('bez referencji: rzuca błąd zamiast opisać poziom 5', () => {
    expect(() => describeConfidence(5)).toThrow(/experimental evidence reference/i);
    expect(() => describeConfidence(5, '')).toThrow(/experimental evidence reference/i);
    expect(() => describeConfidence(5, '   ')).toThrow(/experimental evidence reference/i);
  });

  it('z realną referencją: opisuje poziom 5, ale nadal jawnie stwierdza że Genesis nie prowadzi eksperymentów', () => {
    const statement = describeConfidence(5, 'wet-lab-assay-2027-04-01');
    expect(statement).toContain('wet-lab-assay-2027-04-01');
    expect(statement).toMatch(/Genesis performs no experiments/i);
  });

  it('poziomy 0-4 nigdy nie rzucają i nie wspominają eksperymentu jako spełnionego', () => {
    for (let level = 0 as const; level <= 4; level++) {
      const statement = describeConfidence(level as 0 | 1 | 2 | 3 | 4);
      expect(statement).not.toMatch(/has validated/i);
    }
  });
});

describe('isValidConfidenceTransition', () => {
  it('podniesienie lub utrzymanie poziomu jest ważne; obniżenie nie', () => {
    expect(isValidConfidenceTransition(1, 2)).toBe(true);
    expect(isValidConfidenceTransition(2, 2)).toBe(true);
    expect(isValidConfidenceTransition(3, 1)).toBe(false);
  });
});
