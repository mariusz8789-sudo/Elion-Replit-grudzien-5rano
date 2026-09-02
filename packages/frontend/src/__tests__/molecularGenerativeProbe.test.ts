import { describe, expect, it } from 'vitest';
import { buildDemoDiscoveryQuestion } from '../core/discovery/molecular/demoFixture';
import type { GenerationRequest } from '../core/discovery/molecular/generationProvider';
import {
  GENERATIVE_ADAPTER_CONTRACT,
  generativeChemistryProvider,
  probeGenerativeChemistry,
  type GenerativeAdapter,
} from '../core/discovery/molecular/generativeProvider';
import type { MoleculeCandidate } from '../core/discovery/molecular/types';

/**
 * ETAP 3 — GENERATIVE CHEMISTRY.
 *
 * The point of these tests is that the NOT_AVAILABLE verdict is produced by
 * real code with a checkable reason, and that REAL_GENERATIVE_MODEL cannot be
 * reached without an actual inference path.
 */
const question = buildDemoDiscoveryQuestion();
const request: GenerationRequest = {
  seeds: ['C6H6'],
  transformations: ['add-CH2'],
  depth: 1,
  maxCandidates: 10,
  constraints: question.constraints,
};

describe('sonda zdolności generatywnej', () => {
  it('bez adaptera zwraca NIEDOSTĘPNE i mówi, co dokładnie sprawdziła', () => {
    const probe = probeGenerativeChemistry();

    expect(probe.available).toBe(false);
    expect(probe.reason.length).toBeGreaterThan(0);
    // Werdykt jest sprawdzalny: sonda wylicza, co obejrzała.
    expect(probe.checked.length).toBeGreaterThanOrEqual(5);
    expect(probe.checked.filter((c) => c.what !== 'inference runtime').every((c) => c.found === false)).toBe(true);
    // Runtime jest obecny — blokadą są WAGI, nie środowisko uruchomieniowe.
    expect(probe.checked.map((c) => c.what)).toContain('reachable model weights');
    expect(probe.checked.map((c) => c.what)).toContain('model weights in repository');
    expect(probe.checked.map((c) => c.what)).toContain('inference runtime');
    expect(probe.requires).toContain('GenerativeAdapter.propose');
  });

  it('jawnie odrzuca LLM jako zamiennik modelu generatywnego chemii', () => {
    expect(probeGenerativeChemistry().requires).toMatch(/LLM is not a substitute/i);
  });
});

describe('provider generatywny nie może udawać, że działa', () => {
  it('domyślnie jest NOT_AVAILABLE, nigdy REAL_GENERATIVE_MODEL', () => {
    const capability = generativeChemistryProvider().capabilities();

    expect(capability.kind).toBe('NOT_AVAILABLE');
    expect(capability.kind).not.toBe('REAL_GENERATIVE_MODEL');
    expect(capability.available).toBe(false);
    expect(capability.methodId).toContain('NOT_IMPLEMENTED');
    expect(capability.description).toMatch(/not generative models/i);
  });

  it('zero kandydatów znaczy "brak generatora", a nie "brak cząsteczek"', () => {
    const outcome = generativeChemistryProvider().generateCandidates(request);

    expect(outcome.candidates).toHaveLength(0);
    const notes = outcome.notes.join(' ');
    expect(notes).toMatch(/no generator exists.*not.*no molecules exist/i);
    expect(notes).toContain(GENERATIVE_ADAPTER_CONTRACT);
  });

  it('null adapter nie otwiera ścieżki generatywnej', () => {
    expect(generativeChemistryProvider(null).capabilities().kind).toBe('NOT_AVAILABLE');
  });

  it('adapter, który sam deklaruje brak dostępności, NIE zostaje REAL_GENERATIVE_MODEL', () => {
    // Sama obecność adaptera nie wystarcza — musi istnieć realna ścieżka inferencji.
    const declaredButDead: GenerativeAdapter = {
      adapterId: 'configured-but-not-loaded@1',
      capabilities: () => ({ available: false, reason: 'weights not found on disk', engine: 'none' }),
      propose: () => ({ candidates: [], applicabilityDomain: 'none', engine: 'none' }),
    };

    const capability = generativeChemistryProvider(declaredButDead).capabilities();
    expect(capability.kind).toBe('NOT_AVAILABLE');
    expect(capability.reason).toContain('weights not found');
  });
});

describe('seam działa, gdy realny adapter naprawdę istnieje', () => {
  // TEST FIXTURE — jawnie oznaczony. Ta cząsteczka NIE została wygenerowana
  // przez Genesis ani przez żaden model; istnieje wyłącznie po to, by udowodnić,
  // że seam przenosi wynik adaptera. Nigdy nie jest wynikiem naukowym.
  const fixtureCandidate: MoleculeCandidate = {
    candidateId: 'cand_test_fixture',
    formula: 'C7H8',
    structure: { status: 'TEST_FIXTURE', canonicalSmiles: 'Cc1ccccc1', engine: 'TEST_FIXTURE' },
    parentFormula: null,
    transformation: null,
    properties: [],
    origin: 'SEED',
  };

  const workingAdapter: GenerativeAdapter = {
    adapterId: 'test-fixture-generator@1.0.0',
    capabilities: () => ({ available: true, reason: '', engine: 'TEST_FIXTURE inference path' }),
    propose: () => ({ candidates: [fixtureCandidate], applicabilityDomain: 'TEST_FIXTURE — no real domain', engine: 'TEST_FIXTURE' }),
  };

  it('adapter z realną ścieżką jest oznaczony REAL_GENERATIVE_MODEL i niesie swoje id', () => {
    const capability = generativeChemistryProvider(workingAdapter).capabilities();

    expect(capability.kind).toBe('REAL_GENERATIVE_MODEL');
    expect(capability.methodId).toBe('test-fixture-generator@1.0.0');
    // Model generatywny nie jest domyślnie uznawany za odtwarzalny.
    expect(capability.deterministic).toBe(false);
  });

  it('kandydat z fixture pozostaje oznaczony TEST_FIXTURE, nie jako odkrycie Genesis', () => {
    const outcome = generativeChemistryProvider(workingAdapter).generateCandidates(request);

    expect(outcome.candidates).toHaveLength(1);
    expect(outcome.candidates[0]!.structure.status).toBe('TEST_FIXTURE');
    expect(outcome.notes.join(' ')).toMatch(/applicability domain/i);
  });

  it('propozycja modelu NIE jest dowodem poprawności cząsteczki', () => {
    const validation = generativeChemistryProvider(workingAdapter).validateCandidate(fixtureCandidate);

    expect(validation.valid).toBeNull();
    if (validation.valid === true) throw new Error('unexpected valid');
    expect(validation.reason).toMatch(/not evidence the molecule is valid/i);
  });
});
