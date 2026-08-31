import { canonicalJson, fnv1a } from './events/hash';
import type { NaturalCandidateStructure } from './biotechData/naturalReplacement';
import type { RankedCompositionHypothesis } from './biotechDiscoveryContract';

/**
 * PER-HYPOTHESIS COMPUTE.
 *
 * Dossier kompozycji potrafił już powiedzieć, CO wiadomo o każdym składniku.
 * Nie potrafił natomiast uruchomić na nim niczego: pole COMPUTE wypełniało się
 * wyłącznie wtedy, gdy ktoś wcześniej wykonał obliczenie gdzie indziej. Ten
 * moduł domyka to, nie tworząc żadnego nowego silnika — planuje i wykonuje
 * ISTNIEJĄCE, realne runtime'y backendowe na wejściach, które kandydat
 * faktycznie posiada.
 *
 * Trzy reguły, bez których byłoby to udawanie obliczeń:
 *
 * 1. RUNTIME MUSI DOSTAĆ SWOJE WEJŚCIE. `chem-molecular-weight` potrzebuje
 *    wzoru sumarycznego, `chem-rdkit-descriptors` SMILES. Brak wejścia to
 *    MISSING_DATA — nigdy wartość domyślna i nigdy „przybliżenie".
 *
 * 2. NIEUDANE WYKONANIE TO WYNIK, NIE CISZA. Runtime nieskonfigurowany w tym
 *    środowisku zwraca BLOCKED wraz z realnym powodem od backendu. Brak
 *    jakiegokolwiek runtime'u dla danych wejść to COMPUTE_NOT_AVAILABLE.
 *
 * 3. POZIOM KOMPOZYCJI JEST PORÓWNYWALNY DOPIERO PRZY PEŁNYM POKRYCIU. Jeżeli
 *    runtime policzył jeden składnik, a drugiego nie, to nie jest wynik dla
 *    kompozycji — to wynik dla połowy kompozycji. Oznaczamy PARTIAL i
 *    `comparable: false`, dokładnie tak jak `compareScenarios` blokuje
 *    porównanie przebiegów o różnym horyzoncie.
 *
 * NIE POWSTAJE ŻADNA LICZBA ZBIORCZA. Nie ma „wyniku compute" kompozycji ani
 * wskaźnika jakości: takiej wielkości nie da się uzasadnić bez proporcji, a
 * proporcji Genesis świadomie nie produkuje.
 */
export const COMPOSITION_COMPUTE_CONTRACT_VERSION = '1.0.0';

/**
 * Runtime'y, które WOLNO uruchomić na naturalnym kandydacie, wraz z wejściem,
 * którego każdy bezwzględnie wymaga. Lista jest jawna, żeby dało się
 * zakwestionować sam dobór, a nie tylko wynik.
 */
export const COMPOSITION_COMPUTE_RUNTIMES = [
  {
    modelId: 'chem-molecular-weight',
    requiredInput: 'formula',
    structureField: 'formula',
    computes: 'masa molowa, liczba atomów i stopień nienasycenia ze wzoru sumarycznego',
    limitation: 'Prosty wzór bez nawiasów, hydratów i izotopów; to nie jest analiza struktury ani aktywności.',
  },
  {
    modelId: 'chem-rdkit-descriptors',
    requiredInput: 'smiles',
    structureField: 'smiles',
    computes: 'deskryptory topologiczne 2D: masa, logP Crippena, HBD/HBA, pierścienie, TPSA, reguła 5',
    limitation: 'Deskryptory 2D to nie QSAR, nie docking, nie ADMET i nie aktywność biologiczna.',
  },
] as const;

export type ComponentComputeStatus = 'EXECUTED' | 'MISSING_DATA' | 'COMPUTE_NOT_AVAILABLE' | 'BLOCKED';

export interface ComponentComputeRecord {
  candidateId: string;
  runtimeModelId: string;
  status: ComponentComputeStatus;
  reason: string;
  /** Dokładne wejście przekazane runtime'owi. `null`, gdy nic nie przekazano. */
  input: Readonly<Record<string, string | number | boolean>> | null;
  runId: string | null;
  engine: string | null;
  version: string | null;
  outputs: Readonly<Record<string, string | number | boolean>>;
  /** Odcisk {model, wejście, wyjście} — tożsamość tego wykonania. */
  fingerprint: string | null;
  /** Skąd pochodzi wejście: bez przypiętego źródła obliczenie jest bezużyteczne dowodowo. */
  inputSourceId: string | null;
  inputSourceUrl: string | null;
}

export type CompositionComputeCoverage = 'COMPLETE' | 'PARTIAL' | 'NOT_AVAILABLE';

export interface CompositionComputeRuntimeRecord {
  runtimeModelId: string;
  coverage: CompositionComputeCoverage;
  /** Czy wyniki tego runtime'u wolno zestawiać między składnikami kompozycji. */
  comparable: boolean;
  reason: string;
  componentRecords: readonly ComponentComputeRecord[];
}

export interface CompositionComputeReport {
  contractVersion: string;
  combinationId: string;
  rank: number;
  runtimes: readonly CompositionComputeRuntimeRecord[];
  /** Najsilniejszy status, jaki kompozycja osiągnęła w którymkolwiek runtime. */
  coverage: CompositionComputeCoverage;
  executedRunCount: number;
  computeFingerprint: string;
  limitations: readonly string[];
}

/** Jedno zaplanowane wykonanie: model, kandydat, wejście albo powód jego braku. */
export interface PlannedComponentCompute {
  candidateId: string;
  runtimeModelId: string;
  admissible: boolean;
  input: Readonly<Record<string, string | number | boolean>> | null;
  reason: string;
  inputSourceId: string | null;
  inputSourceUrl: string | null;
}

export interface CompositionComputePlan {
  contractVersion: string;
  combinationId: string;
  rank: number;
  planned: readonly PlannedComponentCompute[];
}

/**
 * Wykonawca realnego runu. Celowo wstrzykiwany: moduł nie zna transportu, a
 * test może podstawić wykonawcę, który NIE udaje wyniku, tylko go zwraca albo
 * odrzuca. Produkcyjnie podpina się tu istniejący backendowy Fabric.
 */
export interface CompositionComputeExecutor {
  (request: { modelId: string; inputs: Readonly<Record<string, string | number | boolean>>; sourceText: string }): Promise<{
    ok: boolean;
    runId?: string;
    engine?: string;
    modelVersion?: string;
    status?: string;
    outputs?: Readonly<Record<string, string | number | boolean>>;
    error?: string;
  }>;
}

/**
 * Dopasowanie struktury do kandydata. Najpierw dokładny identyfikator, a gdy
 * go nie ma — obecność KANONICZNEGO identyfikatora źródła (`pubchem:CID:2519`)
 * w identyfikatorze kandydata. Ten sam kandydat występuje w kilku formach id
 * (`candidate:pubchem:CID:2519:chembl:target:CHEMBL318` obok
 * `candidate:pubchem:2519`), a wiąże je dokładnie ten identyfikator źródłowy.
 * To sprawdzenie tożsamości, nie dopasowanie po nazwie ani po podobieństwie.
 */
export function matchCandidateStructure(
  candidateId: string,
  structures: readonly NaturalCandidateStructure[],
): NaturalCandidateStructure | undefined {
  return structures.find((entry) => entry.candidateId === candidateId)
    ?? structures.find((entry) => candidateId.includes(entry.sourceId));
}

export function planCompositionCompute(
  hypothesis: RankedCompositionHypothesis,
  structures: readonly NaturalCandidateStructure[],
): CompositionComputePlan {
  const planned: PlannedComponentCompute[] = [];
  for (const runtime of COMPOSITION_COMPUTE_RUNTIMES) {
    for (const candidateId of hypothesis.candidateIds) {
      const structure = matchCandidateStructure(candidateId, structures);
      const value = structure?.[runtime.structureField];
      if (structure === undefined || typeof value !== 'string' || value.trim().length === 0) {
        planned.push({
          candidateId, runtimeModelId: runtime.modelId, admissible: false, input: null,
          reason: `Kandydat ${candidateId} nie ma przypiętego wejścia „${runtime.requiredInput}"; runtime nie ma na czym pracować.`,
          inputSourceId: structure?.sourceId ?? null, inputSourceUrl: structure?.sourceUrl ?? null,
        });
        continue;
      }
      planned.push({
        candidateId, runtimeModelId: runtime.modelId, admissible: true,
        input: { [runtime.requiredInput]: value },
        reason: `Wejście „${runtime.requiredInput}" pochodzi z ${structure.sourceVersion}; runtime liczy ${runtime.computes}.`,
        inputSourceId: structure.sourceId, inputSourceUrl: structure.sourceUrl,
      });
    }
  }
  return { contractVersion: COMPOSITION_COMPUTE_CONTRACT_VERSION, combinationId: hypothesis.combinationId, rank: hypothesis.rank, planned };
}

function coverageFor(records: readonly ComponentComputeRecord[]): CompositionComputeCoverage {
  const executed = records.filter((record) => record.status === 'EXECUTED').length;
  if (executed === 0) return 'NOT_AVAILABLE';
  return executed === records.length ? 'COMPLETE' : 'PARTIAL';
}

export async function executeCompositionCompute(
  plan: CompositionComputePlan,
  executor: CompositionComputeExecutor,
): Promise<CompositionComputeReport> {
  const records: ComponentComputeRecord[] = [];
  for (const step of plan.planned) {
    const base = {
      candidateId: step.candidateId, runtimeModelId: step.runtimeModelId,
      input: step.input, inputSourceId: step.inputSourceId, inputSourceUrl: step.inputSourceUrl,
    };
    if (!step.admissible || step.input === null) {
      records.push({ ...base, status: 'MISSING_DATA', reason: step.reason, runId: null, engine: null, version: null, outputs: {}, fingerprint: null });
      continue;
    }
    let response: Awaited<ReturnType<CompositionComputeExecutor>>;
    try {
      response = await executor({ modelId: step.runtimeModelId, inputs: step.input, sourceText: `Per-hypothesis compute dla ${step.candidateId} (${plan.combinationId}).` });
    } catch (error) {
      records.push({ ...base, status: 'BLOCKED', reason: `Wykonanie odrzucone: ${error instanceof Error ? error.message : String(error)}`, runId: null, engine: null, version: null, outputs: {}, fingerprint: null });
      continue;
    }
    if (!response.ok || response.outputs === undefined || response.runId === undefined) {
      records.push({
        ...base, status: 'BLOCKED',
        reason: `Runtime ${step.runtimeModelId} nie policzył tego wejścia: ${response.error ?? response.status ?? 'brak powodu od backendu'}.`,
        runId: response.runId ?? null, engine: response.engine ?? null, version: response.modelVersion ?? null, outputs: {}, fingerprint: null,
      });
      continue;
    }
    records.push({
      ...base, status: 'EXECUTED',
      reason: `${step.reason} Wykonano realnie; wynik pochodzi z silnika, nie z tej warstwy.`,
      runId: response.runId, engine: response.engine ?? null, version: response.modelVersion ?? null,
      outputs: response.outputs,
      fingerprint: fnv1a(canonicalJson({ modelId: step.runtimeModelId, inputs: step.input, outputs: response.outputs })),
    });
  }

  const runtimes: CompositionComputeRuntimeRecord[] = COMPOSITION_COMPUTE_RUNTIMES.map((runtime) => {
    const componentRecords = records.filter((record) => record.runtimeModelId === runtime.modelId);
    const coverage = coverageFor(componentRecords);
    return {
      runtimeModelId: runtime.modelId,
      coverage,
      // Zestawianie wyników między składnikami ma sens WYŁĄCZNIE wtedy, gdy ten
      // sam runtime policzył je wszystkie. Inaczej porównuje się wynik z brakiem.
      comparable: coverage === 'COMPLETE',
      reason: coverage === 'COMPLETE'
        ? `Runtime policzył każdy składnik kompozycji; wyniki są zestawialne między nimi. ${runtime.limitation}`
        : coverage === 'PARTIAL'
          ? `Runtime policzył tylko część składników — to wynik dla części kompozycji, nie dla kompozycji. Zestawianie zablokowane. ${runtime.limitation}`
          : `Runtime nie policzył żadnego składnika. ${runtime.limitation}`,
      componentRecords,
    };
  }).filter((entry) => entry.componentRecords.length > 0);

  const executedRunCount = records.filter((record) => record.status === 'EXECUTED').length;
  const coverage: CompositionComputeCoverage = runtimes.some((entry) => entry.coverage === 'COMPLETE')
    ? 'COMPLETE'
    : runtimes.some((entry) => entry.coverage === 'PARTIAL') ? 'PARTIAL' : 'NOT_AVAILABLE';

  return {
    contractVersion: COMPOSITION_COMPUTE_CONTRACT_VERSION,
    combinationId: plan.combinationId,
    rank: plan.rank,
    runtimes,
    coverage,
    executedRunCount,
    computeFingerprint: fnv1a(canonicalJson({
      combinationId: plan.combinationId,
      records: records.map((record) => ({ candidateId: record.candidateId, runtime: record.runtimeModelId, status: record.status, fingerprint: record.fingerprint })),
    })),
    limitations: [
      'Obliczenia dotyczą POJEDYNCZYCH składników. Nie powstaje żadna wielkość zbiorcza dla kompozycji — bez proporcji nie miałaby sensu, a proporcji Genesis nie produkuje.',
      ...COMPOSITION_COMPUTE_RUNTIMES.map((runtime) => `${runtime.modelId}: ${runtime.limitation}`),
    ],
  };
}

/**
 * Wykonawca produkcyjny: istniejący backendowy Fabric. Zero nowego transportu,
 * zero nowego endpointu — dokładnie ta sama droga, którą idzie każdy inny
 * backendowy run, więc wynik ma tę samą prowieniencję i ten sam runId.
 */
export function fabricCompositionComputeExecutor(
  runFabricCompute: (input: { modelId: string; inputs: Record<string, string | number | boolean>; sourceText?: string; domainId?: string }) => Promise<{
    ok: boolean;
    data?: { run: { runId: string; engine?: string | null; modelVersion?: string; status: string; outputs?: Readonly<Record<string, string | number | boolean>>; error?: string; message?: string } };
    error?: string;
    message?: string;
    /** Surowa odpowiedź nieudanego żądania; niesie powód odmowy backendu. */
    responseBody?: unknown;
  }>,
): CompositionComputeExecutor {
  return async ({ modelId, inputs, sourceText }) => {
    const response = await runFabricCompute({ modelId, inputs: { ...inputs }, sourceText, domainId: 'chemistry' });
    if (!response.ok || response.data === undefined) {
      // Backend odrzuca niedostępną zdolność statusem HTTP 400, ale opisuje
      // powód w ciele odpowiedzi. Bierzemy runId odrzuconego runu, żeby
      // odmowa też miała tożsamość — inaczej „nie policzono" jest anonimowe.
      const rejected = (response.responseBody as { run?: { runId?: string; status?: string } } | undefined)?.run;
      return {
        ok: false,
        ...(rejected?.runId === undefined ? {} : { runId: rejected.runId }),
        ...(rejected?.status === undefined ? {} : { status: rejected.status }),
        error: `${response.error ?? 'backend_error'}: ${response.message ?? 'brak komunikatu'}`,
      };
    }
    const run = response.data.run;
    if (run.status !== 'ok' && run.status !== 'completed') {
      // Odmowa backendu jest WYNIKIEM: niesie realny powód, a nie ciszę.
      return { ok: false, runId: run.runId, status: run.status, error: `${run.error ?? run.status}: ${run.message ?? 'brak komunikatu backendu'}` };
    }
    return {
      ok: true,
      runId: run.runId,
      engine: run.engine ?? undefined,
      modelVersion: run.modelVersion,
      status: run.status,
      outputs: run.outputs ?? {},
    };
  };
}

export type CompositionComputeReplayStatus = 'MATCH' | 'DRIFT' | 'BLOCKED';

export interface CompositionComputeReplayDifference {
  candidateId: string;
  runtimeModelId: string;
  field: string;
  expected: string;
  actual: string;
}

export interface CompositionComputeReplay {
  status: CompositionComputeReplayStatus;
  reason: string;
  verifiedRecordCount: number;
  differences: readonly CompositionComputeReplayDifference[];
}

/**
 * WERYFIKACJA ZAPISANEGO COMPUTE — i jasna deklaracja, czym ona NIE jest.
 *
 * Wykonany run backendowy ma własny, jednorazowy runId; ponowne wywołanie
 * runtime'u dałoby inny run, nawet przy identycznym wyniku. Odtworzenie
 * „bit w bit" jak przy Scenario Engine jest więc tutaj niemożliwe i udawanie
 * go byłoby fałszem.
 *
 * Sprawdzamy zamiast tego SPÓJNOŚĆ WEWNĘTRZNĄ zapisu: czy odcisk każdego
 * wykonania nadal odpowiada trójce {model, wejście, wyjście}. To wykrywa
 * podmianę zapisanej liczby w localStorage — czyli dokładnie to, przed czym
 * zapis ma chronić. MATCH oznacza „rekord jest nienaruszony", a NIE „runtime
 * został uruchomiony ponownie", i tak jest opisany.
 */
export function replaySavedCompositionCompute(saved: unknown): CompositionComputeReplay {
  if (!Array.isArray(saved) || saved.length === 0) {
    return { status: 'BLOCKED', reason: 'Brak zapisanych rekordów compute do zweryfikowania.', verifiedRecordCount: 0, differences: [] };
  }
  const differences: CompositionComputeReplayDifference[] = [];
  let verified = 0;
  for (const entry of saved as CompositionComputeReport[]) {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.runtimes)) {
      return { status: 'BLOCKED', reason: 'Zapisany raport compute ma nieoczekiwaną strukturę; weryfikacja wstrzymana.', verifiedRecordCount: verified, differences };
    }
    for (const runtime of entry.runtimes) {
      for (const record of runtime.componentRecords ?? []) {
        if (record.status !== 'EXECUTED') continue;
        if (record.input === null || record.fingerprint === null) {
          differences.push({ candidateId: record.candidateId, runtimeModelId: record.runtimeModelId, field: 'fingerprint', expected: 'odcisk wykonania', actual: 'brak' });
          continue;
        }
        verified += 1;
        const recomputed = fnv1a(canonicalJson({ modelId: record.runtimeModelId, inputs: record.input, outputs: record.outputs }));
        if (recomputed !== record.fingerprint) {
          differences.push({ candidateId: record.candidateId, runtimeModelId: record.runtimeModelId, field: 'fingerprint', expected: record.fingerprint, actual: recomputed });
        }
      }
    }
  }
  if (verified === 0) {
    return { status: 'BLOCKED', reason: 'Żaden zapisany rekord nie jest wykonaniem — nie ma czego weryfikować.', verifiedRecordCount: 0, differences };
  }
  if (differences.length > 0) {
    return {
      status: 'DRIFT',
      reason: `Zapisane wykonania nie zgadzają się ze swoimi odciskami w ${differences.length} ${differences.length === 1 ? 'przypadku' : 'przypadkach'} — treść rekordu została zmieniona po zapisie.`,
      verifiedRecordCount: verified, differences,
    };
  }
  return {
    status: 'MATCH',
    reason: `${verified} zapisanych wykonań jest spójnych ze swoimi odciskami {model, wejście, wyjście}. To potwierdzenie NIENARUSZONEGO zapisu, nie ponowne uruchomienie runtime'u.`,
    verifiedRecordCount: verified, differences: [],
  };
}
