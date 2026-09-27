import { describe, expect, it } from 'vitest';
import { buildDemoDiscoveryQuestion } from '../core/discovery/molecular/demoFixture';
import {
  COMPOSITION_PROVIDER_ID,
  RDKIT_SMARTS_PROVIDER_ID,
  compositionEnumeratorProvider,
  rdkitSmartsEnumeratorProvider,
  selectGenerationProvider,
} from '../core/discovery/molecular/enumeratorProviders';
import { unavailableGenerationProvider, type GenerationRequest } from '../core/discovery/molecular/generationProvider';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import { unavailableRdkitTransport } from '../core/discovery/molecular/rdkitTransport';

/**
 * ETAP 2 — GENERATION PROVIDER CONTRACT.
 *
 * The contract's job is to make the SOURCE of a candidate part of the record.
 * The assertions below are mostly about honesty of labelling, because that is
 * exactly what a provider abstraction can get wrong in a way no chemistry test
 * would catch.
 */
const question = buildDemoDiscoveryQuestion();

const compositionRequest: GenerationRequest = {
  seeds: ['C6H6', 'C7H8O'],
  transformations: ['add-CH2', 'add-OH'],
  depth: 1,
  maxCandidates: 20,
  constraints: question.constraints,
};

const smilesRequest: GenerationRequest = {
  seeds: ['c1ccccc1', 'CC(=O)Oc1ccccc1C(=O)O'],
  transformations: ['add-methyl', 'add-hydroxyl'],
  depth: 1,
  maxCandidates: 20,
  constraints: { ...question.constraints, maxHeavyAtoms: 30 },
};

const transport = createNodeRdkitTransport();
const rdkitAvailable = transport.detect().available;

describe('nazewnictwo metody generowania jest uczciwe', () => {
  it('enumerator kompozycji NIE jest modelem generatywnym', () => {
    const capability = compositionEnumeratorProvider().capabilities();

    expect(capability.kind).toBe('DETERMINISTIC_ENUMERATOR');
    expect(capability.kind).not.toBe('REAL_GENERATIVE_MODEL');
    expect(capability.methodId).toBe(COMPOSITION_PROVIDER_ID);
    expect(capability.producesStructures).toBe(false);
    expect(capability.deterministic).toBe(true);
    // Opis nie może sprzedawać enumeracji jako AI.
    expect(capability.description).toMatch(/not a generative model/i);
    expect(capability.description).not.toMatch(/\bAI\b|artificial intelligence|neural/i);
  });

  it('enumerator SMARTS też jest enumeratorem, mimo że używa realnego RDKit', () => {
    const capability = rdkitSmartsEnumeratorProvider(unavailableRdkitTransport).capabilities();

    expect(capability.kind).toBe('DETERMINISTIC_ENUMERATOR');
    expect(capability.methodId).toBe(RDKIT_SMARTS_PROVIDER_ID);
    expect(capability.producesStructures).toBe(true);
    expect(capability.description).not.toMatch(/\bAI\b|artificial intelligence|neural/i);
  });
});

describe('enumerator kompozycji — zawsze dostępny, ale bez struktur', () => {
  it('produkuje realnych kandydatów i deterministyczny odcisk', () => {
    const provider = compositionEnumeratorProvider();
    const first = provider.generateCandidates(compositionRequest);
    const second = provider.generateCandidates(compositionRequest);

    expect(first.candidates.length).toBeGreaterThan(2);
    expect(first.generationFingerprint).toBe(second.generationFingerprint);
    expect(first.capability.available).toBe(true);
  });

  it('walidacja kandydata zwraca NIEWIADOMĄ, a nie fałszywe "valid"', () => {
    const provider = compositionEnumeratorProvider();
    const candidate = provider.generateCandidates(compositionRequest).candidates[0]!;
    const validation = provider.validateCandidate(candidate);

    // Poprawny wzór ≠ istniejąca cząsteczka. Uczciwa odpowiedź to null.
    expect(validation.valid).toBeNull();
    if (validation.valid === true) throw new Error('unexpected valid');
    expect(validation.reason).toMatch(/does not determine a structure/i);
  });

  it('zły wzór jest jawnie nieprawidłowy', () => {
    const provider = compositionEnumeratorProvider();
    const validation = provider.validateCandidate({
      candidateId: 'x', formula: 'NotAFormula!!', parentFormula: null, transformation: null,
      structure: { status: 'REQUIRES_EXTERNAL_ENGINE', canonicalSmiles: null, engine: null },
      properties: [], origin: 'SEED',
    });
    expect(validation.valid).toBe(false);
  });

  it('sufit kandydatów jest twardy i raportowany', () => {
    const provider = compositionEnumeratorProvider();
    const capped = provider.generateCandidates({ ...compositionRequest, maxCandidates: 3 });

    expect(capped.candidates.length).toBeLessThanOrEqual(3);
    expect(capped.notes.join(' ')).toMatch(/ceiling/i);
  });
});

describe('brak silnika nigdy nie wygląda jak pusty wynik naukowy', () => {
  it('provider NOT_AVAILABLE mówi wprost, że nie próbowano', () => {
    const provider = unavailableGenerationProvider('none@0', 'no engine in this runtime');
    const outcome = provider.generateCandidates(compositionRequest);

    expect(outcome.capability.kind).toBe('NOT_AVAILABLE');
    expect(outcome.candidates).toHaveLength(0);
    expect(outcome.notes.join(' ')).toMatch(/not attempted.*not.*none exist/i);
  });

  it('enumerator SMARTS bez RDKit zwraca zero kandydatów Z POWODEM, nie po cichu', () => {
    const provider = rdkitSmartsEnumeratorProvider(unavailableRdkitTransport);
    const outcome = provider.generateCandidates(smilesRequest);

    expect(outcome.capability.available).toBe(false);
    expect(outcome.capability.reason.length).toBeGreaterThan(0);
    expect(outcome.candidates).toHaveLength(0);
    expect(outcome.notes.join(' ')).toMatch(/not attempted/i);
  });

  it('walidacja bez silnika jest NIEWIADOMA, nigdy "valid"', () => {
    const provider = rdkitSmartsEnumeratorProvider(unavailableRdkitTransport);
    const validation = provider.validateCandidate({
      candidateId: 'x', formula: 'C6H6', parentFormula: null, transformation: null,
      structure: { status: 'ACTUAL_SOURCE', canonicalSmiles: 'c1ccccc1', engine: 'x' },
      properties: [], origin: 'SEED',
    });
    expect(validation.valid).toBeNull();
  });
});

describe(`enumerator SMARTS na REALNYM RDKit (available=${rdkitAvailable})`, () => {
  if (rdkitAvailable) {
    it('produkuje realne struktury z realnymi deskryptorami', () => {
      const provider = rdkitSmartsEnumeratorProvider(transport);
      const outcome = provider.generateCandidates(smilesRequest);

      expect(outcome.capability.available).toBe(true);
      expect(outcome.candidates.length).toBeGreaterThan(2);

      // KAŻDY kandydat ma realną, skanonizowaną przez RDKit strukturę.
      for (const candidate of outcome.candidates) {
        expect(candidate.structure.status).toBe('ACTUAL_SOURCE');
        expect(candidate.structure.canonicalSmiles).toBeTruthy();
        expect(candidate.structure.engine).toMatch(/^RDKit /);
      }

      // logP przestaje być luką — jest policzone przez realny silnik.
      const logP = outcome.candidates[0]!.properties.find((p) => p.propertyId === 'logP')!;
      expect(logP.status).toBe('COMPUTED');
      expect(typeof logP.value).toBe('number');
    });

    it('ten sam request daje ten sam odcisk generacji', () => {
      const provider = rdkitSmartsEnumeratorProvider(transport);
      const a = provider.generateCandidates(smilesRequest);
      const b = provider.generateCandidates(smilesRequest);

      expect(a.generationFingerprint).toBe(b.generationFingerprint);
      expect(a.candidates.map((c) => c.structure.canonicalSmiles))
        .toEqual(b.candidates.map((c) => c.structure.canonicalSmiles));
    });

    it('walidacja realnej struktury przechodzi przez RDKit', () => {
      const provider = rdkitSmartsEnumeratorProvider(transport);
      const candidate = provider.generateCandidates(smilesRequest).candidates[0]!;
      const validation = provider.validateCandidate(candidate);

      expect(validation.valid).toBe(true);
      expect(validation.checkedBy).toMatch(/^RDKit /);
    });

    it('selekcja wybiera silnik strukturalny, gdy RDKit jest obecny', () => {
      expect(selectGenerationProvider(transport).capabilities().methodId).toBe(RDKIT_SMARTS_PROVIDER_ID);
    });
  } else {
    it('bez RDKit selekcja spada na enumerator kompozycji — jawnie', () => {
      const chosen = selectGenerationProvider(transport).capabilities();
      expect(chosen.methodId).toBe(COMPOSITION_PROVIDER_ID);
      expect(chosen.producesStructures).toBe(false);
    });
  }
});

describe('selekcja providera zawsze zwraca coś wykonywalnego', () => {
  it('bez RDKit spada na enumerator kompozycji, nie na NOT_AVAILABLE', () => {
    const chosen = selectGenerationProvider(unavailableRdkitTransport).capabilities();

    expect(chosen.methodId).toBe(COMPOSITION_PROVIDER_ID);
    expect(chosen.available).toBe(true);
    expect(chosen.kind).toBe('DETERMINISTIC_ENUMERATOR');
  });
});
