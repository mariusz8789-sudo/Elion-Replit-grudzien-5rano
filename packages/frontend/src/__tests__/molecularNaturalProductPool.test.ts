import { describe, expect, it } from 'vitest';
import {
  crossValidateCandidate,
  NATURAL_PRODUCT_CANDIDATE_POOL,
} from '../core/discovery/molecular/naturalProductCandidatePool';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import { unavailableRdkitTransport, type RdkitTransport } from '../core/discovery/molecular/rdkitTransport';

/**
 * NATURAL-DISCOVERY MISSION, ETAP 2 — NATURAL PRODUCT UNIVERSE.
 *
 * The pool is a small, real, individually cited set — not a generated list.
 * These tests check the pool's own internal honesty: every citation slot is
 * filled, every SMILES-bearing candidate's formula is re-derived (not
 * trusted), and the declared-negative-control candidate really is one.
 */
const transport = createNodeRdkitTransport();
const rdkitAvailable = transport.detect().available;

describe('każdy kandydat niesie realną cytację występowania i mechanizmu', () => {
  it('żaden kandydat nie ma pustej listy dowodów występowania', () => {
    for (const candidate of NATURAL_PRODUCT_CANDIDATE_POOL) {
      expect(candidate.naturalOccurrenceEvidence.length, candidate.candidateKey).toBeGreaterThan(0);
      for (const evidence of candidate.naturalOccurrenceEvidence) {
        expect(evidence.reference.trim().length, `${candidate.candidateKey} occurrence reference`).toBeGreaterThan(0);
      }
    }
  });

  it('żaden kandydat nie ma pustej listy dowodów mechanizmu', () => {
    for (const candidate of NATURAL_PRODUCT_CANDIDATE_POOL) {
      expect(candidate.mechanismEvidence.length, candidate.candidateKey).toBeGreaterThan(0);
      for (const evidence of candidate.mechanismEvidence) {
        expect(evidence.identifier.trim().length, `${candidate.candidateKey} mechanism identifier`).toBeGreaterThan(0);
        expect(evidence.source).toBe('LITERATURE');
      }
    }
  });

  it('klucze kandydatów są unikalne', () => {
    const keys = NATURAL_PRODUCT_CANDIDATE_POOL.map((c) => c.candidateKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('pula zawiera prawdziwą negatywną kontrolę', () => {
  it('harmalina ma zgłoszony target INNY niż receptor NMDA', () => {
    const harmaline = NATURAL_PRODUCT_CANDIDATE_POOL.find((c) => c.candidateKey === 'harmaline')!;
    expect(harmaline.reportedTargetFamily).toMatch(/monoamine oxidase/i);
    expect(harmaline.reportedTargetFamily).not.toMatch(/nmda/i);
    expect(harmaline.mechanismSummary).toMatch(/negative control/i);
  });

  it('conantokin-G ma dowód mechanizmu, ale strukturę świadomie odrzuconą, nie zmyśloną', () => {
    const conantokin = NATURAL_PRODUCT_CANDIDATE_POOL.find((c) => c.candidateKey === 'conantokin-g')!;
    expect(conantokin.structure.kind).toBe('STRUCTURE_DECLINED');
    expect(conantokin.reportedTargetFamily).toMatch(/nmda/i);
  });
});

describe('crossValidateCandidate: strukturę odrzuconą zgłasza jako DECLINED, nie jako błąd', () => {
  it('kandydat bez SMILES nigdy nie trafia do RDKit', () => {
    const harmaline = NATURAL_PRODUCT_CANDIDATE_POOL.find((c) => c.candidateKey === 'harmaline')!;
    const result = crossValidateCandidate(unavailableRdkitTransport, harmaline);
    expect(result.status).toBe('DECLINED');
    expect(result.smiles).toBeNull();
  });
});

describe('crossValidateCandidate: bez silnika RDKit nigdy nie potwierdza po cichu', () => {
  it('kandydat ze SMILES bez silnika => ENGINE_UNAVAILABLE, nie CONFIRMED', () => {
    const agmatine = NATURAL_PRODUCT_CANDIDATE_POOL.find((c) => c.candidateKey === 'agmatine')!;
    const result = crossValidateCandidate(unavailableRdkitTransport, agmatine);
    expect(result.status).toBe('ENGINE_UNAVAILABLE');
  });
});

describe('crossValidateCandidate: niezgodność formuły jest wykrywana, nie ukrywana', () => {
  it('sfałszowana oczekiwana formuła daje MISMATCH', () => {
    const fake: RdkitTransport = {
      transportId: 'test-fixture',
      detect: () => ({ available: true, engine: 'TEST_FIXTURE', version: '0' }),
      describe: () => ({ ok: true, engine: 'TEST_FIXTURE', data: { canonicalSmiles: 'NCCCCNC(=N)N', molecularFormula: 'C5H14N4', values: {} } }),
      transform: () => ({ ok: false, error: 'INVALID_SMILES', reason: 'fixture' }),
      transformations: () => ({ ok: true, transformations: [] }),
      similarity: () => ({ ok: false, error: 'INVALID_SMILES', reason: 'fixture' }),
    };
    const agmatine = NATURAL_PRODUCT_CANDIDATE_POOL.find((c) => c.candidateKey === 'agmatine')!;
    const tamperedExpectation = { ...agmatine, structure: { kind: 'SMILES_CROSS_VALIDATED' as const, smiles: agmatine.structure.kind === 'SMILES_CROSS_VALIDATED' ? agmatine.structure.smiles : '', expectedFormula: 'C999H999N999' } };

    const result = crossValidateCandidate(fake, tamperedExpectation);
    expect(result.status).toBe('MISMATCH');
    expect(result.reason).toMatch(/does NOT match/);
  });
});

describe(`REALNY RDKit — walidacja krzyżowa całej puli (available=${rdkitAvailable})`, () => {
  if (!rdkitAvailable) {
    it('bez RDKit ścieżka jest jawnie zablokowana', () => {
      expect(transport.detect().available).toBe(false);
    });
    return;
  }

  it('każdy kandydat ze SMILES ma formułę potwierdzoną przez realny RDKit', () => {
    const withStructure = NATURAL_PRODUCT_CANDIDATE_POOL.filter((c) => c.structure.kind === 'SMILES_CROSS_VALIDATED');
    expect(withStructure.length).toBeGreaterThanOrEqual(2);
    for (const candidate of withStructure) {
      const result = crossValidateCandidate(transport, candidate);
      expect(result.status, `${candidate.candidateKey}: ${result.reason}`).toBe('CONFIRMED');
      expect(result.observedFormula).toBe(result.expectedFormula);
    }
  }, 30_000);

  it('kandydaci ze świadomie odrzuconą strukturą pozostają DECLINED nawet z działającym silnikiem', () => {
    const declined = NATURAL_PRODUCT_CANDIDATE_POOL.filter((c) => c.structure.kind === 'STRUCTURE_DECLINED');
    expect(declined.length).toBeGreaterThanOrEqual(2);
    for (const candidate of declined) {
      expect(crossValidateCandidate(transport, candidate).status).toBe('DECLINED');
    }
  });
});
