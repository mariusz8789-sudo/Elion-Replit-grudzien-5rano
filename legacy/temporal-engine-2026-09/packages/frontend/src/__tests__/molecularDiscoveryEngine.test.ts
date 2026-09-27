import { describe, expect, it } from 'vitest';
import { formulaProperties, structuralEngineFromRecords, unavailableStructuralEngine, validateFormula } from '../core/discovery/molecular/chemistry';
import { COMPOSITION_TRANSFORMATIONS, generateCandidateBatch, listCompositionTransformations } from '../core/discovery/molecular/generation';
import { assessCandidate, decideBatch, rankRetained, screenBatch } from '../core/discovery/molecular/screening';
import { buildDemoDiscoveryQuestion, buildDemoGenerationSpec } from '../core/discovery/molecular/demoFixture';
import { runMolecularDiscovery } from '../core/discovery/molecular/discoveryRun';
import type { DiscoveryConstraints } from '../core/discovery/molecular/types';

/**
 * MOLECULAR DISCOVERY ENGINE — test matrix items A (domain validation),
 * B (candidate generation), D (canonicalisation), E (deduplication),
 * F (descriptor calculation), G (constraint filtering), H (missing property →
 * NOT_AVAILABLE), I (deterministic ranking), L (NOT_RESOLVED handling).
 *
 * All chemistry exercised here is REAL and deterministic (the existing
 * `core/compute/cheminformatics.ts` formula engine). Nothing is mocked.
 */

const CONSTRAINTS: DiscoveryConstraints = {
  allowedElements: ['C', 'H', 'N', 'O'],
  maxHeavyAtoms: 12,
  criteria: [
    { criterionId: 'mw', propertyId: 'molecularWeight', op: 'lte', value: 200, required: true, rationale: 'test' },
    { criterionId: 'heavy', propertyId: 'heavyAtomCount', op: 'lte', value: 12, required: true, rationale: 'test' },
  ],
};

describe('A/D — walidacja i kanonizacja wzoru (realny parser)', () => {
  it('kanonizuje do notacji Hilla', () => {
    expect(validateFormula('H8C7O').canonical).toBe('C7H8O');
    expect(validateFormula('OC7H8').canonical).toBe('C7H8O');
  });

  it('odrzuca niepoprawny wzór zamiast zgadywać', () => {
    expect(validateFormula('C6H6(OH)').ok).toBe(false);
    expect(validateFormula('').ok).toBe(false);
    expect(validateFormula('Xx9').ok).toBe(false);
  });
});

describe('F — realnie policzone deskryptory kompozycyjne', () => {
  it('masa molowa benzenu i aspiryny zgadza się z chemią, nie z fikcją', () => {
    const benzene = formulaProperties(validateFormula('C6H6').counts);
    const aspirin = formulaProperties(validateFormula('C9H8O4').counts);

    expect(benzene.find((p) => p.propertyId === 'molecularWeight')!.value).toBeCloseTo(78.11, 1);
    expect(aspirin.find((p) => p.propertyId === 'molecularWeight')!.value).toBeCloseTo(180.16, 1);
    // Benzen: 4 stopnie nienasycenia (pierścień + 3 wiązania podwójne).
    expect(benzene.find((p) => p.propertyId === 'degreeOfUnsaturation')!.value).toBe(4);
    expect(benzene.every((p) => p.status === 'COMPUTED')).toBe(true);
  });

  it('deskryptory strukturalne bez silnika są REQUIRES_EXTERNAL_ENGINE, nigdy liczbą', () => {
    const props = unavailableStructuralEngine.propertiesFor('C6H6');
    expect(props.every((p) => p.status === 'REQUIRES_EXTERNAL_ENGINE' && p.value === null)).toBe(true);
  });
});

describe('B/E/G — enumeracja, deduplikacja, filtrowanie ograniczeń', () => {
  it('generuje realnych potomków z zadeklarowanych transformacji', () => {
    const batch = generateCandidateBatch({ seedFormulas: ['C6H6'], transformations: ['add-CH2', 'add-OH'], depth: 1, maxCandidates: 20 }, CONSTRAINTS);
    const formulas = batch.candidates.map((c) => c.formula);

    // Realne produkty podstawienia: benzen → toluen (C7H8) i fenol (C6H6O).
    expect(formulas).toContain('C6H6'); // seed
    expect(formulas).toContain('C7H8'); // add-CH2
    expect(formulas).toContain('C6H6O'); // add-OH (podstawienie H, nie addycja)
    expect(batch.candidates.find((c) => c.formula === 'C7H8')!.transformation).toBe('add-CH2');
    expect(batch.candidates.find((c) => c.formula === 'C6H6')!.origin).toBe('SEED');
  });

  it('deduplikuje po kanonicznym wzorze i zapisuje powód odrzucenia', () => {
    const batch = generateCandidateBatch({ seedFormulas: ['C6H6', 'H6C6'], transformations: [], depth: 0, maxCandidates: 20 }, CONSTRAINTS);
    expect(batch.candidates).toHaveLength(1);
    expect(batch.discarded.some((d) => d.reason === 'duplicate')).toBe(true);
  });

  it('odrzuca niedozwolony pierwiastek i przekroczony limit ciężkich atomów — z jawnym powodem', () => {
    const batch = generateCandidateBatch({ seedFormulas: ['C6H5F', 'C40H50'], transformations: [], depth: 0, maxCandidates: 20 }, CONSTRAINTS);
    expect(batch.candidates).toHaveLength(0);
    expect(batch.discarded.some((d) => d.reason.startsWith('disallowed_element:F'))).toBe(true);
    expect(batch.discarded.some((d) => d.reason.startsWith('heavy_atoms_over_limit'))).toBe(true);
  });

  it('odrzuca produkt niemożliwy chemicznie zamiast go przyjąć (CH4 − CH2 ≠ H2)', () => {
    // Arytmetyka kompozycji dałaby H2; strażnik wiarygodności odrzuca produkt
    // bez węgla — to był realny błąd wykryty przez ten test, nie hipoteza.
    const batch = generateCandidateBatch({ seedFormulas: ['CH4'], transformations: ['remove-CH2'], depth: 1, maxCandidates: 20 }, CONSTRAINTS);

    expect(batch.candidates.map((c) => c.formula)).toEqual(['CH4']);
    expect(batch.discarded.some((d) => d.reason === 'implausible_composition:no_carbon')).toBe(true);
  });

  it('odrzuca kompozycję o niemożliwym stopniu nienasycenia', () => {
    const batch = generateCandidateBatch({ seedFormulas: ['CH5'], transformations: [], depth: 0, maxCandidates: 5 }, CONSTRAINTS);
    expect(batch.candidates).toHaveLength(0);
    expect(batch.discarded[0]!.reason).toMatch(/implausible_composition:(negative|fractional)_unsaturation/);
  });

  it('katalog transformacji jest zadeklarowany i deterministycznie posortowany', () => {
    expect(listCompositionTransformations()).toEqual(Object.keys(COMPOSITION_TRANSFORMATIONS).sort());
  });
});

describe('H/L — brakująca właściwość nigdy nie jest PASS', () => {
  it('kryterium na właściwości bez silnika daje NOT_AVAILABLE i NOT_RESOLVED, nie PASS', () => {
    const constraints: DiscoveryConstraints = {
      ...CONSTRAINTS,
      criteria: [...CONSTRAINTS.criteria, { criterionId: 'logp', propertyId: 'logP', op: 'lte', value: 5, required: true, rationale: 'test' }],
    };
    const batch = generateCandidateBatch({ seedFormulas: ['C7H8O'], transformations: [], depth: 0, maxCandidates: 5 }, constraints);
    const assessment = assessCandidate(batch.candidates[0]!, constraints);

    expect(assessment.criteria.find((c) => c.criterionId === 'logp')!.verdict).toBe('NOT_AVAILABLE');
    expect(assessment.verdict).toBe('NOT_RESOLVED');
    expect(assessment.unresolvedRequired).toEqual(['logp']);
  });

  it('realna porażka wyprzedza brak danych: FAIL daje REJECTED nawet przy nierozstrzygniętym kryterium', () => {
    const constraints: DiscoveryConstraints = {
      ...CONSTRAINTS,
      maxHeavyAtoms: 20, // aspiryna ma 13 ciężkich atomów — musi przejść bramkę enumeratora, żeby dało się ją ocenić
      criteria: [
        { criterionId: 'mw', propertyId: 'molecularWeight', op: 'lte', value: 50, required: true, rationale: 'test' },
        { criterionId: 'logp', propertyId: 'logP', op: 'lte', value: 5, required: true, rationale: 'test' },
      ],
    };
    const batch = generateCandidateBatch({ seedFormulas: ['C9H8O4'], transformations: [], depth: 0, maxCandidates: 5 }, constraints);
    const assessment = assessCandidate(batch.candidates[0]!, constraints);

    expect(assessment.verdict).toBe('REJECTED');
    expect(assessment.failedRequired).toEqual(['mw']);
  });

  it('brak wszystkich wyników przy zerowej liczbie kandydatów to NOT_RESOLVED, nie falsyfikacja', () => {
    expect(decideBatch([]).verdict).toBe('NOT_RESOLVED');
  });
});

describe('I — deterministyczny ranking', () => {
  it('ranking obejmuje wyłącznie RETAINED i jest stabilny', () => {
    const batch = generateCandidateBatch({ seedFormulas: ['C6H6', 'C7H8O', 'C9H8O4'], transformations: ['add-CH2'], depth: 1, maxCandidates: 20 }, CONSTRAINTS);
    const assessments = screenBatch(batch, CONSTRAINTS);
    const ranking = rankRetained(assessments);

    expect(ranking.every((a) => a.verdict === 'RETAINED')).toBe(true);
    expect(ranking.map((a) => a.formula)).toEqual(rankRetained(assessments).map((a) => a.formula));
    for (let i = 1; i < ranking.length; i++) {
      expect(ranking[i]!.rankScore! >= ranking[i - 1]!.rankScore!).toBe(true);
    }
  });

  it('ranking nie nagradza kandydata za kryterium, którego nie dało się ocenić', () => {
    const withMissing: DiscoveryConstraints = {
      ...CONSTRAINTS,
      criteria: [...CONSTRAINTS.criteria, { criterionId: 'logp', propertyId: 'logP', op: 'lte', value: 5, required: false, rationale: 'test' }],
    };
    const batch = generateCandidateBatch({ seedFormulas: ['C7H8O'], transformations: [], depth: 0, maxCandidates: 5 }, withMissing);
    const assessment = assessCandidate(batch.candidates[0]!, withMissing);

    // rankScore liczony wyłącznie z PASS — nierozstrzygnięte logP go nie zmienia.
    expect(assessment.rankScore).toBe(assessCandidate(generateCandidateBatch({ seedFormulas: ['C7H8O'], transformations: [], depth: 0, maxCandidates: 5 }, CONSTRAINTS).candidates[0]!, CONSTRAINTS).rankScore);
  });
});

describe('Determinizm całego przebiegu', () => {
  it('te same wejścia dwukrotnie dają identyczny odcisk wyniku', () => {
    const first = runMolecularDiscovery(buildDemoDiscoveryQuestion(), buildDemoGenerationSpec());
    const second = runMolecularDiscovery(buildDemoDiscoveryQuestion(), buildDemoGenerationSpec());

    expect(second.resultFingerprint).toBe(first.resultFingerprint);
    expect(second.batch.candidates.map((c) => c.formula)).toEqual(first.batch.candidates.map((c) => c.formula));
  });

  it('inny silnik strukturalny to inny eksperyment — inny odcisk', () => {
    const withoutEngine = runMolecularDiscovery(buildDemoDiscoveryQuestion(), buildDemoGenerationSpec());
    const withEngine = runMolecularDiscovery(
      buildDemoDiscoveryQuestion(),
      buildDemoGenerationSpec(),
      structuralEngineFromRecords('test-engine@1', { C6H6: { canonicalSmiles: 'c1ccccc1', descriptors: { logP: 1.6866 } } }, 'TEST_FIXTURE'),
    );

    expect(withEngine.resultFingerprint).not.toBe(withoutEngine.resultFingerprint);
  });

  it('silnik strukturalny nie zmyśla wartości dla wzoru, którego nie zna', () => {
    const engine = structuralEngineFromRecords('test-engine@1', { C6H6: { canonicalSmiles: 'c1ccccc1', descriptors: { logP: 1.6866 } } }, 'TEST_FIXTURE');
    expect(engine.structureFor('C9H8O4').status).toBe('REQUIRES_EXTERNAL_ENGINE');
    expect(engine.propertiesFor('C9H8O4').every((p) => p.value === null)).toBe(true);
    // Znany wzór: tylko logP jest realny, reszta pozostaje niedostępna.
    expect(engine.propertiesFor('C6H6').find((p) => p.propertyId === 'logP')!.value).toBe(1.6866);
    expect(engine.propertiesFor('C6H6').find((p) => p.propertyId === 'tpsa')!.status).toBe('REQUIRES_EXTERNAL_ENGINE');
  });
});
