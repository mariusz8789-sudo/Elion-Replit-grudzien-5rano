import { canonicalJson, fnv1a } from '../events/hash';
import type { CohortProfile } from '../agents/cohortModel';
import type { EpidemicCityParams } from './epidemicCity';
import type { HospitalCapacityParams } from './hospitalResource';
import { compareScenarios, runScenario, SCENARIO_ENGINE_VERSION, type ScenarioComparison, type ScenarioId, type ScenarioRun } from './scenarioEngine';
import { firstDivergentDay } from './scenarioCounterfactual';
import { buildTemporalTimeline, type TemporalTimeline } from './temporalState';
import {
  buildSavedScenarioRunContext,
  isSavedScenarioRunContext,
  replaySavedScenarioRun,
  type SavedScenarioReplayStatus,
  type SavedScenarioRunContext,
} from './scenarioMemory';

/**
 * WIELE ŚWIATÓW Z JEDNEGO T0.
 *
 * Silnik kontrfaktyczny (`scenarioCounterfactual.ts`) rozgałęzia dokładnie
 * dwa ramiona. Ten moduł nie jest drugim silnikiem porównania — to cienka
 * kompozycja TEJ SAMEJ pary prymitywów (`runScenario` + `compareScenarios` +
 * `firstDivergentDay` + `buildTemporalTimeline`) powtórzona N razy względem
 * jednego, wspólnego stanu T0. Każda gałąź jest osobnym, realnym przebiegiem
 * z tymi samymi warunkami startowymi (`baseParams`/`baseHospital`/
 * `baseCohort`/ziarno) — tak samo jak ramiona kontrfaktyku, tyle że bez
 * ograniczenia do dwóch.
 *
 * DLACZEGO NIE ROZSZERZAM `ScenarioCounterfactual`
 * Ten kontrakt ma ustalone (`baseline`, `variant`) i jest używany przez
 * Evidence Pack (`counterfactualEvidence.ts`), które celowo dopuszcza
 * WYŁĄCZNIE jednoparametrowy sweep dwuramienny. Multiverse nie podmienia
 * tego kontraktu — to osobna, równoległa projekcja tych samych realnych
 * przebiegów dla widoku "wiele światów", nie zamiennik ścieżki dowodowej.
 */
export const TEMPORAL_MULTIVERSE_CONTRACT_VERSION = '1.0.0';

export interface TemporalBranchSpec {
  /** Etykieta gałęzi widoczna dla użytkownika, np. "A", "B", "bez X", "z X". */
  branchId: string;
  scenarioId: ScenarioId;
  /** Dzień wejścia interwencji TEJ gałęzi; pominięty = od początku, tak jak w silniku kontrfaktycznym. */
  interventionStartDay?: number;
}

export interface TemporalMultiverseSpec {
  /** Wspólny stan T0: ten sam scenariusz-punkt-odniesienia dla wszystkich gałęzi. */
  baselineScenarioId: ScenarioId;
  baselineInterventionStartDay?: number;
  days: number;
  stepsPerDay: number;
  baseParams: Partial<EpidemicCityParams>;
  baseHospital?: HospitalCapacityParams;
  baseCohort?: CohortProfile;
  /** Przynajmniej jedna gałąź poza baseline — inaczej nie ma czego rozgałęziać. */
  branches: readonly TemporalBranchSpec[];
}

export interface TemporalBranchResult {
  branchId: string;
  run: ScenarioRun;
  comparisonToBaseline: ScenarioComparison;
  /** Dzień MIERZONY na seriach (baseline, ta gałąź) — nigdy deklarowany dzień interwencji. */
  firstDivergentDayFromBaseline: number | null;
  /** `null`, gdy gałąź jest NOT_MODELED — oś czasu bez realnego przebiegu nie miałaby czego pokazywać. */
  timeline: TemporalTimeline | null;
}

export interface TemporalMultiverse {
  contractVersion: string;
  engineVersion: string;
  spec: TemporalMultiverseSpec;
  baseline: ScenarioRun;
  baselineTimeline: TemporalTimeline;
  branches: readonly TemporalBranchResult[];
  multiverseFingerprint: string;
  epistemicStatus: 'SIMULATION';
}

function armOptions(spec: TemporalMultiverseSpec, interventionStartDay: number) {
  return {
    days: spec.days,
    stepsPerDay: spec.stepsPerDay,
    baseParams: spec.baseParams,
    ...(spec.baseHospital === undefined ? {} : { baseHospital: spec.baseHospital }),
    ...(spec.baseCohort === undefined ? {} : { baseCohort: spec.baseCohort }),
    interventionStartDay,
  };
}

/**
 * Wykonuje jeden wspólny baseline i N realnych gałęzi względem niego.
 *
 * Każda gałąź dzieli warunki startowe z definicji — tak samo jak ramiona
 * kontrfaktyku — więc jedyne, co różni gałęzie, to zadeklarowany scenariusz
 * i moment jego wejścia. Rozjazd każdej gałęzi jest mierzony osobno, nie
 * zakładany z dnia interwencji.
 */
export function runTemporalMultiverse(spec: TemporalMultiverseSpec): TemporalMultiverse {
  if (spec.branches.length === 0) {
    throw new Error('Multiverse wymaga co najmniej jednej gałęzi poza baseline.');
  }
  const branchIds = spec.branches.map((branch) => branch.branchId);
  if (new Set(branchIds).size !== branchIds.length) {
    throw new Error(`Identyfikatory gałęzi muszą być unikalne: ${branchIds.join(', ')}.`);
  }

  const baseline = runScenario(spec.baselineScenarioId, armOptions(spec, spec.baselineInterventionStartDay ?? 0));
  const baselineTimeline = buildTemporalTimeline(baseline, 'BASELINE');

  const branches: TemporalBranchResult[] = spec.branches.map((branchSpec) => {
    const run = runScenario(branchSpec.scenarioId, armOptions(spec, branchSpec.interventionStartDay ?? 0));
    const comparisonToBaseline = compareScenarios(baseline, run);
    const divergence = comparisonToBaseline.status === 'COMPLETED' ? firstDivergentDay(baseline.series, run.series) : null;
    return {
      branchId: branchSpec.branchId,
      run,
      comparisonToBaseline,
      firstDivergentDayFromBaseline: divergence,
      timeline: run.status === 'COMPLETED' ? buildTemporalTimeline(run, 'VARIANT') : null,
    };
  });

  const fingerprintBase = {
    v: TEMPORAL_MULTIVERSE_CONTRACT_VERSION,
    baselineResult: baseline.resultFingerprint,
    branches: branches.map((branch) => ({
      branchId: branch.branchId,
      resultFingerprint: branch.run.resultFingerprint,
      comparisonStatus: branch.comparisonToBaseline.status,
      firstDivergentDayFromBaseline: branch.firstDivergentDayFromBaseline,
    })),
  };

  return {
    contractVersion: TEMPORAL_MULTIVERSE_CONTRACT_VERSION,
    engineVersion: SCENARIO_ENGINE_VERSION,
    spec,
    baseline,
    baselineTimeline,
    branches,
    multiverseFingerprint: fnv1a(canonicalJson(fingerprintBase)),
    epistemicStatus: 'SIMULATION',
  };
}

/**
 * Zapisywalna projekcja: baseline + każda gałąź jako ISTNIEJĄCY
 * `SavedScenarioRunContext` (dokładnie ten sam kontrakt co pojedynczy
 * przebieg i ramiona kontrfaktyku) — nie powstaje drugi format pamięci.
 */
export interface SavedTemporalMultiverse {
  contractVersion: string;
  baseline: SavedScenarioRunContext;
  branches: readonly {
    branchId: string;
    saved: SavedScenarioRunContext;
    comparisonStatus: ScenarioComparison['status'];
    firstDivergentDayFromBaseline: number | null;
  }[];
  multiverseFingerprint: string;
  epistemicStatus: 'SIMULATION';
}

export function buildSavedTemporalMultiverse(multiverse: TemporalMultiverse): SavedTemporalMultiverse {
  return {
    contractVersion: TEMPORAL_MULTIVERSE_CONTRACT_VERSION,
    baseline: buildSavedScenarioRunContext(multiverse.baseline),
    branches: multiverse.branches.map((branch) => ({
      branchId: branch.branchId,
      saved: buildSavedScenarioRunContext(branch.run),
      comparisonStatus: branch.comparisonToBaseline.status,
      firstDivergentDayFromBaseline: branch.firstDivergentDayFromBaseline,
    })),
    multiverseFingerprint: multiverse.multiverseFingerprint,
    epistemicStatus: 'SIMULATION',
  };
}

export function isSavedTemporalMultiverse(value: unknown): value is SavedTemporalMultiverse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const saved = value as Record<string, unknown>;
  if (typeof saved.contractVersion !== 'string' || saved.contractVersion.trim().length === 0) return false;
  if (!isSavedScenarioRunContext(saved.baseline)) return false;
  if (!Array.isArray(saved.branches) || saved.branches.length === 0) return false;
  const branchesValid = (saved.branches as unknown[]).every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const branch = entry as Record<string, unknown>;
    return typeof branch.branchId === 'string' && branch.branchId.trim().length > 0
      && isSavedScenarioRunContext(branch.saved)
      && typeof branch.comparisonStatus === 'string'
      && (branch.firstDivergentDayFromBaseline === null || Number.isFinite(branch.firstDivergentDayFromBaseline));
  });
  if (!branchesValid) return false;
  return typeof saved.multiverseFingerprint === 'string' && saved.epistemicStatus === 'SIMULATION';
}

export interface TemporalMultiverseBranchReplay {
  branchId: string;
  status: SavedScenarioReplayStatus;
  reason: string;
}

export interface TemporalMultiverseReplay {
  /** Najsłabsze ogniwo spośród baseline i wszystkich gałęzi: BLOCKED bije DRIFT, DRIFT bije MATCH. */
  status: SavedScenarioReplayStatus;
  reason: string;
  baselineStatus: SavedScenarioReplayStatus | null;
  branches: readonly TemporalMultiverseBranchReplay[];
  /** Przeliczony multiverse — wyłącznie przy MATCH; niezweryfikowany wynik nie ma drogi do World/3D. */
  multiverse: TemporalMultiverse | null;
}

const REPLAY_SEVERITY: Record<SavedScenarioReplayStatus, number> = { MATCH: 0, DRIFT: 1, BLOCKED: 2 };
function weakestReplayStatus(statuses: readonly SavedScenarioReplayStatus[]): SavedScenarioReplayStatus {
  return statuses.reduce((worst, status) => (REPLAY_SEVERITY[status] > REPLAY_SEVERITY[worst] ? status : worst), 'MATCH' as SavedScenarioReplayStatus);
}

/**
 * Odtwarza CAŁY multiverse, wykonując baseline i każdą gałąź od nowa.
 * Werdykt całości to najsłabsze ogniwo — jedna zdryfowana gałąź psuje
 * odtworzenie całego multiverse, tak samo jak w kontrfaktyku jedno
 * niezweryfikowane ramię blokuje przekazanie różnicy dalej.
 */
export function replaySavedTemporalMultiverse(saved: unknown): TemporalMultiverseReplay {
  if (!isSavedTemporalMultiverse(saved)) {
    return { status: 'BLOCKED', reason: 'Zapisany multiverse jest niekompletny albo uszkodzony.', baselineStatus: null, branches: [], multiverse: null };
  }

  const baselineReplay = replaySavedScenarioRun(saved.baseline);
  const branchReplays = saved.branches.map((branch) => ({
    branchId: branch.branchId,
    replay: replaySavedScenarioRun(branch.saved),
  }));

  const allStatuses: SavedScenarioReplayStatus[] = [baselineReplay.status, ...branchReplays.map((entry) => entry.replay.status)];
  const overall = weakestReplayStatus(allStatuses);
  const branches: TemporalMultiverseBranchReplay[] = branchReplays.map((entry) => ({
    branchId: entry.branchId,
    status: entry.replay.status,
    reason: entry.replay.reason,
  }));

  if (overall !== 'MATCH' || baselineReplay.run === null || branchReplays.some((entry) => entry.replay.run === null)) {
    return {
      status: overall,
      reason: `Odtworzenie multiverse zakończyło się werdyktem ${overall}: baseline=${baselineReplay.status}, gałęzie=${branches.map((b) => `${b.branchId}:${b.status}`).join(', ')}.`,
      baselineStatus: baselineReplay.status,
      branches,
      multiverse: null,
    };
  }

  const baseline = baselineReplay.run;
  const rebuiltBranches: TemporalBranchResult[] = branchReplays.map((entry) => {
    const run = entry.replay.run!;
    const comparisonToBaseline = compareScenarios(baseline, run);
    const divergence = comparisonToBaseline.status === 'COMPLETED' ? firstDivergentDay(baseline.series, run.series) : null;
    return {
      branchId: entry.branchId,
      run,
      comparisonToBaseline,
      firstDivergentDayFromBaseline: divergence,
      timeline: buildTemporalTimeline(run, 'VARIANT'),
    };
  });

  // Bramka dodatkowa: sama zgodność odcisków ramion nie wystarcza — rozjazd
  // od baseline jest przeliczany ponownie i zestawiany z zapisem, więc
  // podmieniona różnica przy nietkniętych ramionach też kończy się DRIFT.
  const mismatches: string[] = [];
  for (const rebuilt of rebuiltBranches) {
    const savedBranch = saved.branches.find((entry) => entry.branchId === rebuilt.branchId)!;
    if (rebuilt.comparisonToBaseline.status !== savedBranch.comparisonStatus) mismatches.push(`${rebuilt.branchId}.comparisonStatus`);
    if (rebuilt.firstDivergentDayFromBaseline !== savedBranch.firstDivergentDayFromBaseline) mismatches.push(`${rebuilt.branchId}.firstDivergentDayFromBaseline`);
  }
  if (mismatches.length > 0) {
    return {
      status: 'DRIFT',
      reason: `Odtworzony multiverse różni się w ${mismatches.length} ${mismatches.length === 1 ? 'polu' : 'polach'}: ${mismatches.join(', ')}.`,
      baselineStatus: 'MATCH',
      branches,
      multiverse: null,
    };
  }

  const rebuiltMultiverse: TemporalMultiverse = {
    contractVersion: TEMPORAL_MULTIVERSE_CONTRACT_VERSION,
    engineVersion: SCENARIO_ENGINE_VERSION,
    spec: {
      baselineScenarioId: saved.baseline.scenarioId,
      baselineInterventionStartDay: saved.baseline.interventionStartDay,
      days: saved.baseline.days,
      stepsPerDay: saved.baseline.stepsPerDay,
      baseParams: saved.baseline.preInterventionParams,
      baseHospital: saved.baseline.preInterventionHospital,
      baseCohort: saved.baseline.cohort,
      branches: saved.branches.map((branch) => ({
        branchId: branch.branchId,
        scenarioId: branch.saved.scenarioId,
        interventionStartDay: branch.saved.interventionStartDay,
      })),
    },
    baseline,
    baselineTimeline: buildTemporalTimeline(baseline, 'BASELINE'),
    branches: rebuiltBranches,
    multiverseFingerprint: saved.multiverseFingerprint,
    epistemicStatus: 'SIMULATION',
  };

  return { status: 'MATCH', reason: 'Baseline i wszystkie gałęzie policzono od nowa; multiverse odtworzył się co do rozjazdu każdej z nich.', baselineStatus: 'MATCH', branches, multiverse: rebuiltMultiverse };
}
