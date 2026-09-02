import { describe, expect, it } from 'vitest';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import { unavailableRdkitTransport, type RdkitTransport } from '../core/discovery/molecular/rdkitTransport';
import {
  evaluateStructuralSimilarity,
  similarityBand,
  similarityStatement,
} from '../core/discovery/molecular/structuralSimilarity';

/**
 * NATURAL-DISCOVERY MISSION, ETAP 3 — STRUCTURAL FILTERING.
 *
 * Real RDKit Tanimoto + scaffold comparison. The property under test
 * everywhere: a similarity number is a structural fact, never a biological
 * one, and its absence is never reported as zero.
 */
const transport = createNodeRdkitTransport();
const rdkitAvailable = transport.detect().available;

const KETAMINE = 'CNC1(CCCCC1=O)c1ccccc1Cl';
const AGMATINE = 'NCCCCNC(=N)N';

describe('similarityBand jest deterministyczna nad realnymi progami', () => {
  it('klasyfikuje wartości brzegowe', () => {
    expect(similarityBand(1.0)).toBe('HIGH');
    expect(similarityBand(0.85)).toBe('HIGH');
    expect(similarityBand(0.6)).toBe('MODERATE');
    expect(similarityBand(0.3)).toBe('LOW');
    expect(similarityBand(0.02)).toBe('NEGLIGIBLE');
    expect(similarityBand(0)).toBe('NEGLIGIBLE');
  });
});

describe('brak silnika nigdy nie wygląda jak wynik podobieństwa', () => {
  it('bez transportu: available=false, reason realny, brak liczby', () => {
    const result = evaluateStructuralSimilarity(unavailableRdkitTransport, AGMATINE, KETAMINE);

    expect(result.available).toBe(false);
    expect(result.tanimoto).toBeNull();
    expect(result.band).toBeNull();
    expect(result.reason.length).toBeGreaterThan(0);
    expect(similarityStatement(result)).toMatch(/could not be computed/i);
  });

  it('nieprawidłowy SMILES referencji nie daje podobieństwa 0, tylko brak wyniku', () => {
    const fake: RdkitTransport = {
      transportId: 'test-fixture',
      detect: () => ({ available: true, engine: 'TEST_FIXTURE', version: '0' }),
      describe: () => ({ ok: false, error: 'INVALID_SMILES', reason: 'fixture' }),
      transform: () => ({ ok: false, error: 'INVALID_SMILES', reason: 'fixture' }),
      transformations: () => ({ ok: true, transformations: [] }),
      similarity: () => ({ ok: false, error: 'INVALID_SMILES', reason: 'invalid_reference_smiles' }),
    };
    const result = evaluateStructuralSimilarity(fake, AGMATINE, 'not-a-smiles');

    expect(result.available).toBe(false);
    expect(result.tanimoto).toBeNull();
    expect(result.reason).toContain('invalid_reference_smiles');
  });
});

describe('oświadczenie o podobieństwie NIGDY nie brzmi jak dowód biologiczny', () => {
  it('nawet przy wysokim podobieństwie tekst zawiera zastrzeżenie', () => {
    const fake: RdkitTransport = {
      transportId: 'test-fixture',
      detect: () => ({ available: true, engine: 'TEST_FIXTURE', version: '0' }),
      describe: () => ({ ok: false, error: 'INVALID_SMILES', reason: 'fixture' }),
      transform: () => ({ ok: false, error: 'INVALID_SMILES', reason: 'fixture' }),
      transformations: () => ({ ok: true, transformations: [] }),
      similarity: () => ({
        ok: true, tanimoto: 0.97, fingerprint: 'morgan_r2_2048',
        candidateCanonical: 'x', referenceCanonical: 'y',
        scaffoldCandidate: 's', scaffoldReference: 's', sameScaffold: true,
      }),
    };
    const result = evaluateStructuralSimilarity(fake, 'x', 'y');
    const statement = similarityStatement(result);

    expect(result.band).toBe('HIGH');
    expect(statement).toMatch(/not evidence of shared biological activity/i);
  });

  it('przy niskim podobieństwie tekst mówi, że to NIE wyklucza wspólnego mechanizmu', () => {
    const fake: RdkitTransport = {
      transportId: 'test-fixture',
      detect: () => ({ available: true, engine: 'TEST_FIXTURE', version: '0' }),
      describe: () => ({ ok: false, error: 'INVALID_SMILES', reason: 'fixture' }),
      transform: () => ({ ok: false, error: 'INVALID_SMILES', reason: 'fixture' }),
      transformations: () => ({ ok: true, transformations: [] }),
      similarity: () => ({
        ok: true, tanimoto: 0.02, fingerprint: 'morgan_r2_2048',
        candidateCanonical: 'x', referenceCanonical: 'y',
        scaffoldCandidate: '', scaffoldReference: 's', sameScaffold: false,
      }),
    };
    const statement = similarityStatement(evaluateStructuralSimilarity(fake, 'x', 'y'));

    expect(statement).toMatch(/does not rule out a shared mechanism/i);
  });
});

describe(`REALNY RDKit — podobieństwo strukturalne (available=${rdkitAvailable})`, () => {
  if (!rdkitAvailable) {
    it('bez RDKit ścieżka jest jawnie zablokowana', () => {
      const detected = transport.detect();
      expect(detected.available).toBe(false);
    });
    return;
  }

  it('agmatyna wobec ketaminy: realny, niski Tanimoto, inny szkielet', () => {
    const result = evaluateStructuralSimilarity(transport, AGMATINE, KETAMINE);

    expect(result.available).toBe(true);
    expect(result.tanimoto).not.toBeNull();
    expect(result.tanimoto!).toBeGreaterThanOrEqual(0);
    expect(result.tanimoto!).toBeLessThan(0.2);
    expect(result.band).toBe('NEGLIGIBLE');
    expect(result.sameScaffold).toBe(false);
  }, 30_000);

  it('cząsteczka wobec samej siebie: Tanimoto=1, ten sam szkielet', () => {
    const result = evaluateStructuralSimilarity(transport, KETAMINE, KETAMINE);

    expect(result.tanimoto).toBe(1);
    expect(result.sameScaffold).toBe(true);
  }, 30_000);

  it('wynik jest deterministyczny między wywołaniami', () => {
    const a = evaluateStructuralSimilarity(transport, AGMATINE, KETAMINE);
    const b = evaluateStructuralSimilarity(transport, AGMATINE, KETAMINE);
    expect(a.tanimoto).toBe(b.tanimoto);
  }, 30_000);
});
