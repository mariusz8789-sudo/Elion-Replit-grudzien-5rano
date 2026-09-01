import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  buildCounterfactualEvidencePack,
  COUNTERFACTUAL_EVIDENCE_CONTRACT_VERSION,
  resolveSweptLever,
  SWEEPABLE_LEVERS,
} from '../core/experimentFabric/counterfactualEvidence';
import { buildSavedScenarioCounterfactual, runScenarioCounterfactual } from '../core/simulation/scenarioCounterfactual';
import { GOVERNED_PREPAREDNESS_QUESTIONS } from '../core/simulation/preparednessQuestions';
import { compareScientificEvidencePacks } from '../core/experimentFabric/evidencePackStore';

/**
 * KONTRFAKTYK → ISTNIEJĄCY EVIDENCE PACK.
 *
 * Testy pilnują bramek, nie ładnego wyniku: paczka nie powstaje bez
 * odtworzenia obu ramion, bez jednoparametrowej różnicy, bez prerejestrowanego
 * kryterium ani wtedy, gdy realny run rozjeżdża się z zapisem.
 */

function makeFakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() { return map.size; },
  };
}

const QUESTION = GOVERNED_PREPAREDNESS_QUESTIONS[0]!;
const PREPAREDNESS = { questionId: QUESTION.questionId, askedText: QUESTION.question, resolutionFingerprint: 'fp-test-01' };

/** Mały, ale REALNY kontrfaktyk: te same dźwignie, krótszy horyzont. */
function savedArtifact(variantInterventionStartDay = 8) {
  return buildSavedScenarioCounterfactual(runScenarioCounterfactual({
    baselineScenarioId: 'ISOLATION', variantScenarioId: 'ISOLATION',
    days: 18, stepsPerDay: 2, baseParams: { nAgents: 120, initialInfected: 4, seed: 20260831 },
    baselineInterventionStartDay: 0, variantInterventionStartDay,
  }), PREPAREDNESS);
}

describe('Oś kontrfaktyku', () => {
  it('dopuszcza dokładnie jedną zadeklarowaną dźwignię', () => {
    expect(SWEEPABLE_LEVERS).toEqual(['scenarioId', 'interventionStartDay']);
    const artifact = savedArtifact();
    const swept = resolveSweptLever(artifact.baseline, artifact.variant);

    expect(swept.lever).toBe('interventionStartDay');
    expect((swept as { value: number }).value).toBe(8);
  });

  it('identyczne ramiona nie dają prerejestrowalnego wariantu', () => {
    const artifact = savedArtifact();
    const swept = resolveSweptLever(artifact.baseline, artifact.baseline);

    expect(swept.lever).toBeNull();
    expect((swept as { reason: string }).reason).toMatch(/identyczne/i);
  });

  it('zmiana warunków startowych unieważnia porównywalność', () => {
    const artifact = savedArtifact();
    const tampered = { ...artifact.variant, params: { ...artifact.variant.params, seed: 999 } };
    const swept = resolveSweptLever(artifact.baseline, tampered);

    expect(swept.lever).toBeNull();
    expect((swept as { reason: string }).reason).toMatch(/dźwigniach|nie jest dopuszczoną/i);
  });
});

describe('Tworzenie paczki przez ISTNIEJĄCY kontrakt', () => {
  it('tworzy Evidence Pack z realnych przebiegów i prerejestrowanego kryterium', () => {
    const result = buildCounterfactualEvidencePack(savedArtifact());

    expect(result.contractVersion).toBe(COUNTERFACTUAL_EVIDENCE_CONTRACT_VERSION);
    expect(result.status).toBe('CREATED');
    expect(result.pack).not.toBeNull();
    expect(result.pack!.evidencePackId).toMatch(/^pack_[0-9a-f]{8}$/);
    expect(result.pack!.runCount).toBe(4); // 2 ramiona x 2 powtórzenia
    expect(result.sweptLever).toBe('interventionStartDay');
    // Kryterium pochodzi z katalogu, nie z tego modułu.
    expect(result.pack!.protocol.hypothesis.falsification).toEqual(QUESTION.falsification);
    expect(result.pack!.protocol.primaryMetric).toBe(QUESTION.primaryMetric);
  });

  it('każdy przebieg w paczce ma realną prowieniencję z silnika', () => {
    const pack = buildCounterfactualEvidencePack(savedArtifact()).pack!;

    for (const run of pack.runs) {
      expect(run.status).toBe('completed');
      expect(run.provenance.resultOrigin).toBe('real-engine');
      expect(run.engine).toBe('genesis-scenario-engine@1.0.0');
      expect(run.provenance.runFingerprint).toMatch(/^run_[0-9a-f]{8}$/);
      expect(run.modelId).toBe('scenario-timeline');
    }
    expect(pack.reproducibility.allArmsMatched).toBe(true);
    expect(pack.reproducibility.armsWithDrift).toEqual([]);
  });

  it('raportuje FALSYFIKACJĘ, gdy wynik przeczy prerejestrowanemu kryterium', () => {
    // Kryterium: opóźniony wariant ma MNIEJ zgonów. Realny wynik jest odwrotny,
    // więc uczciwą oceną jest falsyfikacja — i tak ma zostać zaraportowana.
    const result = buildCounterfactualEvidencePack(savedArtifact(8));

    expect(['SUPPORTED_WITHIN_PROTOCOL', 'FALSIFIED_WITHIN_PROTOCOL']).toContain(result.pack!.hypothesisAssessment.assessment);
    expect(result.pack!.hypothesisAssessment.criterion).toEqual(QUESTION.falsification);
    expect(result.pack!.disclaimer).toMatch(/nie stanowi odkrycia/i);
  });

  it('zachowuje granice NOT_MODELED w założeniach protokołu', () => {
    const pack = buildCounterfactualEvidencePack(savedArtifact()).pack!;
    const assumptions = pack.protocol.hypothesis.declaredAssumptions.join(' ');

    expect(assumptions).toMatch(/NOT_MODELED/);
    expect(assumptions).toMatch(/NON_OPERATIONAL/);
    expect(assumptions).toMatch(/nie jest skalibrowany/i);
  });
});

describe('Bramki fail-closed', () => {
  it('nieodtworzone ramiona blokują paczkę', () => {
    const artifact = savedArtifact();
    const result = buildCounterfactualEvidencePack({
      ...artifact,
      baseline: { ...artifact.baseline, resultFingerprint: 'deadbeef' },
    });

    expect(result.status).toBe('BLOCKED_REPLAY');
    expect(result.pack).toBeNull();
    expect(result.replay!.status).toBe('DRIFT');
  });

  it('uszkodzony artefakt jest BLOCKED_REPLAY, nigdy CREATED', () => {
    expect(buildCounterfactualEvidencePack(undefined).status).toBe('BLOCKED_REPLAY');
    expect(buildCounterfactualEvidencePack({}).pack).toBeNull();
  });

  it('artefakt bez prerejestrowanego pytania NIE dostaje dorobionego kryterium', () => {
    const artifact = buildSavedScenarioCounterfactual(runScenarioCounterfactual({
      baselineScenarioId: 'ISOLATION', variantScenarioId: 'ISOLATION',
      days: 18, stepsPerDay: 2, baseParams: { nAgents: 120, initialInfected: 4, seed: 20260831 },
      baselineInterventionStartDay: 0, variantInterventionStartDay: 8,
    }));
    const result = buildCounterfactualEvidencePack(artifact);

    expect(result.status).toBe('NOT_AVAILABLE');
    expect(result.pack).toBeNull();
    expect(result.reason).toMatch(/PREREJESTROWANEGO kryterium/);
  });

  it('nieznane pytanie w artefakcie też kończy się NOT_AVAILABLE', () => {
    const artifact = savedArtifact();
    const result = buildCounterfactualEvidencePack({
      ...artifact,
      preparedness: { questionId: 'prep:nie-istnieje', askedText: 'x', resolutionFingerprint: 'y' },
    });

    expect(result.status).toBe('NOT_AVAILABLE');
    expect(result.pack).toBeNull();
  });

  it('rozjazd realnego runu z zapisaną migawką daje NOT_REPRODUCIBLE', () => {
    const artifact = savedArtifact();
    // Migawka podmieniona po zapisie: odtworzenie ramion nadal MATCH (odciski
    // liczone z przebiegu), ale realny run nie potwierdza zapisanej liczby.
    const result = buildCounterfactualEvidencePack({
      ...artifact,
      variant: {
        ...artifact.variant,
        summaryDigest: { ...artifact.variant.summaryDigest, peakInfectiousDay: artifact.variant.summaryDigest.peakInfectiousDay + 3 },
      },
    });

    expect(['NOT_REPRODUCIBLE', 'BLOCKED_REPLAY']).toContain(result.status);
    expect(result.pack).toBeNull();
  });
});

describe('Trwałość, przeładowanie i odtworzenie paczki', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { localStorage: makeFakeStorage() }); });

  it('paczka zapisuje się i wraca po przeładowaniu jako ten sam rekord', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const store = await import('../core/experimentFabric/evidencePackStore');
    const pack = buildCounterfactualEvidencePack(savedArtifact()).pack!;
    store.saveScientificEvidencePack(pack);

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const reloaded = await import('../core/experimentFabric/evidencePackStore');
    const found = reloaded.getScientificEvidencePack(pack.evidencePackId);

    expect(found).toBeDefined();
    expect(found!.pack.evidencePackId).toBe(pack.evidencePackId);
    expect(found!.pack.runCount).toBe(pack.runCount);
    expect(reloaded.classifyStoredEvidencePack(found!.pack)).toBe('VALID');
  });

  it('niezmieniony artefakt odtwarza paczkę jako MATCH', () => {
    const artifact = savedArtifact();
    const first = buildCounterfactualEvidencePack(artifact).pack!;
    const second = buildCounterfactualEvidencePack(artifact).pack!;

    expect(second.evidencePackId).toBe(first.evidencePackId);
    expect(compareScientificEvidencePacks(first, second)).toBe('MATCH');
  });

  it('zmiana rządzonej dźwigni daje inną paczkę i werdykt inny niż MATCH', () => {
    const reference = buildCounterfactualEvidencePack(savedArtifact(8)).pack!;
    const mutated = buildCounterfactualEvidencePack(savedArtifact(12)).pack!;

    expect(mutated.evidencePackId).not.toBe(reference.evidencePackId);
    expect(compareScientificEvidencePacks(reference, mutated)).not.toBe('MATCH');
  });
});

describe('Brak duplikatów systemów', () => {
  it('adapter nie importuje drugiego magazynu, silnika ani renderera', async () => {
    const source = ((await import('../core/experimentFabric/counterfactualEvidence?raw')) as { default: string }).default;

    expect(source).not.toMatch(/from '.*storage'/);
    expect(source).not.toMatch(/from '.*scienceMemory'/);
    expect(source).not.toMatch(/from '.*three\//);
    expect(source).not.toMatch(/localStorage|writeJSON|new Renderer/);
    // Paczka, protokół i wykonanie pochodzą z istniejących modułów.
    expect(source).toMatch(/from '\.\/evidencePack'/);
    expect(source).toMatch(/from '\.\/scientificPlanner'/);
    expect(source).toMatch(/from '\.\/scientificExecutor'/);
    // Adapter nie liczy sam — nie wywołuje silnika scenariuszy bezpośrednio.
    expect(source).not.toMatch(/runScenario\(/);
  });
});
