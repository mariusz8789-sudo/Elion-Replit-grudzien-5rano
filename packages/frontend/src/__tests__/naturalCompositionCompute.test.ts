import { describe, expect, it, vi } from 'vitest';
import {
  COMPOSITION_COMPUTE_CONTRACT_VERSION,
  COMPOSITION_COMPUTE_RUNTIMES,
  executeCompositionCompute,
  fabricCompositionComputeExecutor,
  planCompositionCompute,
  replaySavedCompositionCompute,
  type CompositionComputeExecutor,
} from '../core/naturalCompositionCompute';
import { naturalCandidateStructures } from '../core/biotechData/naturalReplacement';
import { buildNaturalFormulationDossier, VALIDATION_PRIORITY } from '../core/naturalFormulationDossier';
import { rankNaturalCompositionHypotheses, type CandidateDiscoveryReport, type CandidateRanking } from '../core/biotechDiscoveryContract';

/**
 * PER-HYPOTHESIS COMPUTE.
 *
 * Dossier wiedziało, CO wiadomo o składniku. Nie potrafiło niczego na nim
 * uruchomić. Te testy pilnują trzech granic, na których łatwo byłoby udawać
 * obliczenia: runtime bez swojego wejścia nie dostaje wartości domyślnej,
 * odmowa runtime'u jest wynikiem z powodem, a wynik dla POŁOWY kompozycji nie
 * jest wynikiem dla kompozycji.
 */

function ranking(candidateId: string, score: number): CandidateRanking {
  return {
    candidateId, score,
    components: { evidenceQuality: score, targetRelevance: score, safetyPenalty: 0, uncertaintyPenalty: 0 },
    rationale: 'Fixture ranking.', uncertainty: 'Model estimate; validation required.', epistemicStatus: 'PREDICTION',
  };
}

function report(candidateId: string, score: number): CandidateDiscoveryReport {
  return {
    reportId: `report:${candidateId}`, candidateId, materialId: `material:${candidateId}`,
    compoundIds: [`compound:${candidateId}`], targetIds: ['target:A1'], mechanismIds: [`mech:${candidateId}`],
    evidenceIds: [`ev:${candidateId}`], safetySignalIds: [], hypothesisId: `hyp:${candidateId}`,
    ranking: ranking(candidateId, score), epistemicStatus: 'PREDICTION', scientificEvidenceStatus: 'PREDICTION',
    clinicalEfficacy: 'UNKNOWN', uncertainty: 'Fixture record.', provenance: [],
    scientificFingerprint: `fp:${candidateId}`,
  };
}

const CAFFEINE = 'candidate:pubchem:2519';
const XANTHINE = 'candidate:pubchem:1188';
const reports = () => [report(CAFFEINE, 0.9), report(XANTHINE, 0.7)];
const composition = () => rankNaturalCompositionHypotheses(reports(), ['target:A1'], 1)[0]!;
const structures = () => naturalCandidateStructures();

/** Wykonawca, który liczy naprawdę prostą, sprawdzalną rzecz — bez udawania chemii. */
const okExecutor: CompositionComputeExecutor = async ({ modelId, inputs }) => ({
  ok: true, runId: `run-${modelId}-${Object.values(inputs)[0]}`, engine: 'test-engine@1.0.0', modelVersion: '1.0.0',
  status: 'ok', outputs: { echoedInputLength: String(Object.values(inputs)[0]).length },
});

/** Wykonawca odwzorowujący realną odmowę backendu (RDKit nieskonfigurowany). */
const refusingExecutor: CompositionComputeExecutor = async ({ modelId }) =>
  modelId === 'chem-rdkit-descriptors'
    ? { ok: false, runId: 'run-rejected', status: 'rejected', error: "capability_unavailable: RDKit niedostępny (No module named 'rdkit')" }
    : okExecutor({ modelId, inputs: { formula: 'C8H10N4O2' }, sourceText: '' });

describe('Dopuszczalność runtime’u', () => {
  it('deklaruje wprost, jakie runtime’y wolno uruchomić i czego każdy wymaga', () => {
    expect(COMPOSITION_COMPUTE_CONTRACT_VERSION).toBe('1.0.0');
    expect(COMPOSITION_COMPUTE_RUNTIMES.map((entry) => entry.modelId)).toEqual(['chem-molecular-weight', 'chem-rdkit-descriptors']);
    for (const runtime of COMPOSITION_COMPUTE_RUNTIMES) {
      expect(runtime.requiredInput).toBeTruthy();
      expect(runtime.limitation).toMatch(/nie jest|to nie/i);
    }
  });

  it('planuje wykonanie tylko tam, gdzie kandydat ma przypięte wejście', () => {
    const plan = planCompositionCompute(composition(), structures());

    expect(plan.planned).toHaveLength(COMPOSITION_COMPUTE_RUNTIMES.length * 2);
    for (const step of plan.planned) {
      expect(step.admissible).toBe(true);
      expect(step.input).not.toBeNull();
      expect(step.inputSourceId).toMatch(/^pubchem:CID:/);
    }
  });

  it('kandydat bez struktury nie dostaje wartości domyślnej, tylko MISSING_DATA', async () => {
    const plan = planCompositionCompute(composition(), structures().filter((entry) => entry.candidateId !== XANTHINE));
    const missing = plan.planned.filter((step) => step.candidateId === XANTHINE);

    expect(missing).toHaveLength(2);
    for (const step of missing) {
      expect(step.admissible).toBe(false);
      expect(step.input).toBeNull();
      expect(step.reason).toMatch(/nie ma na czym pracować/i);
    }

    const report_ = await executeCompositionCompute(plan, okExecutor);
    const records = report_.runtimes.flatMap((runtime) => runtime.componentRecords).filter((record) => record.candidateId === XANTHINE);
    for (const record of records) {
      expect(record.status).toBe('MISSING_DATA');
      expect(record.outputs).toEqual({});
      expect(record.runId).toBeNull();
    }
  });

  it('wejście przekazane runtime’owi jest zapisane dosłownie, razem ze źródłem', async () => {
    const executed = (await executeCompositionCompute(planCompositionCompute(composition(), structures()), okExecutor))
      .runtimes.find((runtime) => runtime.runtimeModelId === 'chem-molecular-weight')!
      .componentRecords.find((record) => record.candidateId === CAFFEINE)!;

    expect(executed.input).toEqual({ formula: 'C8H10N4O2' });
    expect(executed.inputSourceId).toBe('pubchem:CID:2519');
    expect(executed.inputSourceUrl).toContain('pubchem.ncbi.nlm.nih.gov');
  });
});

describe('Wykonanie i jego uczciwe statusy', () => {
  it('zapisuje runtime, wersję, wejście, runId, wyjście i odcisk każdego wykonania', async () => {
    const record = (await executeCompositionCompute(planCompositionCompute(composition(), structures()), okExecutor))
      .runtimes[0]!.componentRecords[0]!;

    expect(record.status).toBe('EXECUTED');
    expect(record.runtimeModelId).toBeTruthy();
    expect(record.version).toBe('1.0.0');
    expect(record.engine).toBe('test-engine@1.0.0');
    expect(record.runId).toBeTruthy();
    expect(Object.keys(record.outputs).length).toBeGreaterThan(0);
    expect(record.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it('odmowa runtime’u jest WYNIKIEM z realnym powodem, nie ciszą i nie zerem', async () => {
    const report_ = await executeCompositionCompute(planCompositionCompute(composition(), structures()), refusingExecutor);
    const rdkit = report_.runtimes.find((runtime) => runtime.runtimeModelId === 'chem-rdkit-descriptors')!;

    expect(rdkit.coverage).toBe('NOT_AVAILABLE');
    expect(rdkit.comparable).toBe(false);
    for (const record of rdkit.componentRecords) {
      expect(record.status).toBe('BLOCKED');
      expect(record.reason).toMatch(/RDKit niedostępny/);
      expect(record.outputs).toEqual({});
      expect(record.fingerprint).toBeNull();
    }
  });

  it('wyjątek wykonawcy też kończy się BLOCKED, a nie wywróceniem raportu', async () => {
    const report_ = await executeCompositionCompute(planCompositionCompute(composition(), structures()), async () => { throw new Error('sieć padła'); });

    expect(report_.executedRunCount).toBe(0);
    expect(report_.coverage).toBe('NOT_AVAILABLE');
    for (const runtime of report_.runtimes) {
      for (const record of runtime.componentRecords) {
        expect(record.status).toBe('BLOCKED');
        expect(record.reason).toMatch(/sieć padła/);
      }
    }
  });

  it('wynik dla POŁOWY kompozycji nie jest wynikiem dla kompozycji', async () => {
    const halfExecutor: CompositionComputeExecutor = async ({ modelId, inputs }) =>
      String(inputs.formula ?? inputs.smiles) === 'C8H10N4O2'
        ? okExecutor({ modelId, inputs, sourceText: '' })
        : { ok: false, error: 'runtime odmówił dla tego wejścia' };
    const report_ = await executeCompositionCompute(planCompositionCompute(composition(), structures()), halfExecutor);
    const mw = report_.runtimes.find((runtime) => runtime.runtimeModelId === 'chem-molecular-weight')!;

    expect(mw.coverage).toBe('PARTIAL');
    // To jest ta sama bramka co przy porównaniu przebiegów o różnym horyzoncie:
    // zestawianie wyniku z brakiem nie jest porównaniem.
    expect(mw.comparable).toBe(false);
    expect(mw.reason).toMatch(/nie dla kompozycji/i);
  });

  it('pełne pokrycie jednym runtime’em daje COMPLETE i zgodę na zestawianie', async () => {
    const report_ = await executeCompositionCompute(planCompositionCompute(composition(), structures()), okExecutor);

    expect(report_.coverage).toBe('COMPLETE');
    expect(report_.executedRunCount).toBe(4);
    for (const runtime of report_.runtimes) {
      expect(runtime.coverage).toBe('COMPLETE');
      expect(runtime.comparable).toBe(true);
    }
  });

  it('nie powstaje żadna liczba zbiorcza dla kompozycji', async () => {
    const report_ = await executeCompositionCompute(planCompositionCompute(composition(), structures()), okExecutor);
    const keys = new Set<string>();
    JSON.parse(JSON.stringify(report_), function collect(this: unknown, key: string, value: unknown) { if (key) keys.add(key.toLowerCase()); return value; });

    for (const forbidden of ['score', 'compositescore', 'aggregate', 'total', 'ratio', 'dose', 'weightfraction']) {
      expect([...keys]).not.toContain(forbidden);
    }
    expect(report_.limitations.join(' ')).toMatch(/Nie powstaje żadna wielkość zbiorcza/i);
  });

  it('ten sam wsad daje ten sam odcisk compute, inny wynik inny', async () => {
    const plan = planCompositionCompute(composition(), structures());
    const a = await executeCompositionCompute(plan, okExecutor);
    const b = await executeCompositionCompute(plan, okExecutor);
    const c = await executeCompositionCompute(plan, refusingExecutor);

    expect(b.computeFingerprint).toBe(a.computeFingerprint);
    expect(c.computeFingerprint).not.toBe(a.computeFingerprint);
  });
});

describe('Adapter backendowego Fabric', () => {
  it('przekazuje wykonany run z jego prawdziwym runId i silnikiem', async () => {
    const executor = fabricCompositionComputeExecutor(async () => ({
      ok: true,
      data: { run: { runId: 'f0c7c786', engine: 'genesis-compute@1.0.0', modelVersion: '1.0.0', status: 'ok', outputs: { molarMassGmol: 194.194, atomCount: 24 } } },
    }));
    const result = await executor({ modelId: 'chem-molecular-weight', inputs: { formula: 'C8H10N4O2' }, sourceText: '' });

    expect(result.ok).toBe(true);
    expect(result.runId).toBe('f0c7c786');
    expect(result.engine).toBe('genesis-compute@1.0.0');
    expect(result.outputs).toEqual({ molarMassGmol: 194.194, atomCount: 24 });
  });

  it('status inny niż ok zwraca powód backendu, a nie pusty sukces', async () => {
    const executor = fabricCompositionComputeExecutor(async () => ({
      ok: true,
      data: { run: { runId: '2f233d3b', status: 'rejected', error: 'capability_unavailable', message: "RDKit niedostępny (No module named 'rdkit')" } },
    }));
    const result = await executor({ modelId: 'chem-rdkit-descriptors', inputs: { smiles: 'CN1' }, sourceText: '' });

    expect(result.ok).toBe(false);
    expect(result.runId).toBe('2f233d3b');
    expect(result.error).toMatch(/capability_unavailable/);
    expect(result.error).toMatch(/RDKit niedostępny/);
  });
});

describe('Compute i priorytet walidacji w dossier', () => {
  it('wykonany compute wypełnia pole COMPUTE składnika realnymi rekordami', async () => {
    const hypothesis = composition();
    const compute = await executeCompositionCompute(planCompositionCompute(hypothesis, structures()), okExecutor);
    const dossier = buildNaturalFormulationDossier({ reports: reports(), requestedTargetIds: ['target:A1'], computeReports: [compute] });
    const entry = dossier.hypotheses.find((item) => item.combinationId === hypothesis.combinationId)!;

    expect(entry.computeStatus).toBe('PRESENT');
    expect(entry.compute).not.toBeNull();
    for (const component of entry.components) {
      expect(component.hypothesisComputeRecords.length).toBe(2);
      expect(component.computeStatus).toBe('PRESENT');
    }
    expect(dossier.unfilledFields.join(' ')).not.toMatch(/^COMPUTE/);
  });

  it('częściowe pokrycie NIE jest raportowane jako komplet', async () => {
    const hypothesis = composition();
    const compute = await executeCompositionCompute(planCompositionCompute(hypothesis, structures()), refusingExecutor);
    const entry = buildNaturalFormulationDossier({ reports: reports(), computeReports: [compute] })
      .hypotheses.find((item) => item.combinationId === hypothesis.combinationId)!;

    expect(compute.coverage).toBe('COMPLETE');
    expect(compute.runtimes.find((runtime) => runtime.runtimeModelId === 'chem-rdkit-descriptors')!.coverage).toBe('NOT_AVAILABLE');
    expect(entry.validationExperiments.some((experiment) => experiment.priority === 'BLOCKED_COMPUTE')).toBe(true);
  });

  it('plan walidacji jest UPORZĄDKOWANY wg jawnych kryteriów, nie kolejnością budowania', async () => {
    // Ten sam zestaw żądanych targetów po obu stronach — inaczej kompozycja ma
    // inne pokrycie, a więc inne combinationId.
    const requested = ['target:nieistniejacy'];
    const hypothesis = rankNaturalCompositionHypotheses(reports(), requested, 1)[0]!;
    const compute = await executeCompositionCompute(planCompositionCompute(hypothesis, structures()), refusingExecutor);
    const entry = buildNaturalFormulationDossier({ reports: reports(), requestedTargetIds: requested, computeReports: [compute] })
      .hypotheses.find((item) => item.combinationId === hypothesis.combinationId)!;

    expect(entry.validationExperiments.map((experiment) => experiment.order)).toEqual(entry.validationExperiments.map((_, index) => index + 1));
    const ranks = entry.validationExperiments.map((experiment) => VALIDATION_PRIORITY.indexOf(experiment.priority));
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]!).toBeGreaterThanOrEqual(ranks[i - 1]!);
    // Niepokryty target bije lukę obliczeniową, a ta bije test addytywności pary.
    expect(entry.validationExperiments[0]!.priority).toBe('UNCOVERED_TARGET');
    expect(entry.validationExperiments.at(-1)!.priority).toBe('COMBINATION');
  });

  it('każdy krok walidacji mówi, co rozstrzygnie', async () => {
    const hypothesis = composition();
    const compute = await executeCompositionCompute(planCompositionCompute(hypothesis, structures()), refusingExecutor);
    const entry = buildNaturalFormulationDossier({ reports: reports(), computeReports: [compute] })
      .hypotheses.find((item) => item.combinationId === hypothesis.combinationId)!;

    for (const experiment of entry.validationExperiments) {
      expect(experiment.resolves).toMatch(/rozstrzygnie/i);
      expect(experiment.question).toBeTruthy();
    }
  });

  it('bez uruchomionego compute dossier mówi MISSING_DATA, a nie „nie da się policzyć"', () => {
    const entry = buildNaturalFormulationDossier({ reports: reports() }).hypotheses[0]!;

    expect(entry.compute).toBeNull();
    expect(entry.computeStatus).toBe('MISSING_DATA');
    for (const component of entry.components) expect(component.hypothesisComputeRecords).toEqual([]);
  });
});

describe('Zapisane compute w Pamięci Naukowej', () => {
  it('weryfikacja nienaruszonego zapisu daje MATCH i mówi, czym NIE jest', async () => {
    const compute = await executeCompositionCompute(planCompositionCompute(composition(), structures()), okExecutor);
    const replay = replaySavedCompositionCompute([compute]);

    expect(replay.status).toBe('MATCH');
    expect(replay.verifiedRecordCount).toBe(4);
    // MATCH nie wolno czytać jako „runtime uruchomiono ponownie".
    expect(replay.reason).toMatch(/nie ponowne uruchomienie/i);
  });

  it('podmieniony wynik w zapisie kończy się DRIFT ze wskazaniem rekordu', async () => {
    const compute = await executeCompositionCompute(planCompositionCompute(composition(), structures()), okExecutor);
    const tampered = [{
      ...compute,
      runtimes: compute.runtimes.map((runtime, index) => index !== 0 ? runtime : {
        ...runtime,
        componentRecords: runtime.componentRecords.map((record, position) => position !== 0 ? record : { ...record, outputs: { ...record.outputs, echoedInputLength: 999 } }),
      }),
    }];
    const replay = replaySavedCompositionCompute(tampered);

    expect(replay.status).toBe('DRIFT');
    expect(replay.differences).toHaveLength(1);
    expect(replay.differences[0]!.field).toBe('fingerprint');
    expect(replay.differences[0]!.candidateId).toBeTruthy();
  });

  it('brak wykonań albo obcy kształt zapisu jest BLOCKED, nigdy MATCH', async () => {
    expect(replaySavedCompositionCompute([]).status).toBe('BLOCKED');
    expect(replaySavedCompositionCompute(undefined).status).toBe('BLOCKED');
    expect(replaySavedCompositionCompute([{ nieoczekiwane: true }]).status).toBe('BLOCKED');

    const refused = await executeCompositionCompute(planCompositionCompute(composition(), structures()), async () => ({ ok: false, error: 'brak runtime' }));
    const replay = replaySavedCompositionCompute([refused]);
    expect(replay.status).toBe('BLOCKED');
    expect(replay.reason).toMatch(/nie ma czego weryfikować/i);
  });

  it('compute przeżywa przeładowanie w istniejącym artefakcie pamięci', async () => {
    const storage = (() => {
      const map = new Map<string, string>();
      return {
        getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
        setItem: (key: string, value: string) => void map.set(key, value),
        removeItem: (key: string) => void map.delete(key),
        key: (index: number) => [...map.keys()][index] ?? null,
        get length() { return map.size; },
      };
    })();
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const memory = await import('../core/scienceMemory');
    const { buildPinnedChEMBLCaffeineDiscovery } = await import('../core/biotechData/chembl');
    const { buildPinnedChEMBLAdenosineDiscovery } = await import('../core/biotechData/adenosine');
    const { buildPinnedChEMBLTheophyllineDiscovery } = await import('../core/biotechData/theophylline');
    const compute = await executeCompositionCompute(planCompositionCompute(composition(), structures()), okExecutor);
    const pinned = [buildPinnedChEMBLCaffeineDiscovery().report, buildPinnedChEMBLAdenosineDiscovery().report, buildPinnedChEMBLTheophyllineDiscovery().report];
    memory.saveBiotechDiscoveryComparisonToMemory(pinned, { requestedTargetIds: ['CHEMBL318'], compositionCompute: [compute] });

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const reloaded = await import('../core/scienceMemory');
    const artifact = reloaded.listExperiments()[0]?.biotech?.artifact;

    expect(artifact?.compositionCompute).toBeDefined();
    expect(artifact!.compositionCompute![0]!.executedRunCount).toBe(4);
    expect(replaySavedCompositionCompute(artifact!.compositionCompute).status).toBe('MATCH');
  });
});
