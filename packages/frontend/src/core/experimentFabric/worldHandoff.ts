import { EpidemicCitySimulation } from '../simulation/epidemicCity';
import type { ScenarioDaySample, ScenarioId, ScenarioRun, ScenarioSummary } from '../simulation/scenarioEngine';
import type { ScenarioCounterfactual } from '../simulation/scenarioCounterfactual';

/**
 * Ephemeral pointer handoff for a single interactive Experiment Run.
 * The object is deliberately not serialized or persisted: provenance lives in
 * ExperimentRun, while this module only transfers the existing model instance
 * to the existing renderer once.
 */
export interface LiveWorldHandoff {
  runId: string;
  runFingerprint: string;
  resultOrigin: 'real-engine';
  modelId: 'epidemic-city';
  summary: string;
  simulation: EpidemicCitySimulation;
}

const LIVE_WORLDS = new Map<string, LiveWorldHandoff>();
let pendingRunId: string | null = null;
const MAX_RETAINED_WORLDS = 8;

export function registerLiveExperimentWorld(runId: string, simulation: EpidemicCitySimulation, metadata: { runFingerprint: string; resultOrigin: 'real-engine'; summary: string }): void {
  LIVE_WORLDS.set(runId, { runId, ...metadata, modelId: 'epidemic-city', simulation });
  while (LIVE_WORLDS.size > MAX_RETAINED_WORLDS) {
    const oldestId = LIVE_WORLDS.keys().next().value as string | undefined;
    if (!oldestId) break;
    LIVE_WORLDS.delete(oldestId);
  }
}

export function setPendingExperimentWorld(runId: string): boolean {
  if (!LIVE_WORLDS.has(runId)) return false;
  pendingRunId = runId;
  return true;
}

/** Consumption transfers the original simulation reference once to the renderer. */
export function consumePendingExperimentWorld(): LiveWorldHandoff | null {
  if (!pendingRunId) return null;
  const runId = pendingRunId;
  pendingRunId = null;
  const handoff = LIVE_WORLDS.get(runId) ?? null;
  if (handoff) LIVE_WORLDS.delete(runId);
  return handoff;
}

export function clearExperimentWorldHandoffs(): void {
  pendingRunId = null;
  LIVE_WORLDS.clear();
}

/**
 * Przekazanie ZAKOŃCZONEGO przebiegu scenariusza do World/3D.
 *
 * Kanał obok `LiveWorldHandoff`, nie zamiast niego. Tamten przekazuje żywą
 * instancję EpidemicCitySimulation, którą renderer sam taktuje; ten przekazuje
 * gotową serię dobową z Scenario Engine, po której renderer się PRZEWIJA.
 * Bez tego drugiego kanału wynik scenariusza nie miał żadnej drogi do świata —
 * `run.series` kończyło życie w executorze.
 *
 * Seria jest przekazywana as-is. Renderer nie interpoluje ani nie ekstrapoluje:
 * dzień spoza serii po prostu nie istnieje.
 */
export interface ScenarioTimelineHandoff {
  runId: string;
  runFingerprint: string;
  resultOrigin: 'real-engine';
  modelId: 'scenario-timeline';
  scenarioId: ScenarioId;
  scenarioLabel: string;
  seed: number;
  summary: string;
  /** Rzeczywista seria dobowa przebiegu — jedyne źródło stanu świata w czasie. */
  series: readonly ScenarioDaySample[];
  scenarioSummary: ScenarioSummary;
  /**
   * Pełny przebieg wraz z rozwiązanymi wejściami. To ta sama instancja, z
   * której pochodzą `series` i `scenarioSummary` — nie kopia i nie drugi stan.
   * Potrzebna, bo utrwalenie w Pamięci Naukowej wymaga WEJŚĆ (parametry sprzed
   * i po interwencji, kohorta, pojemność szpitala), a nie samego wyniku.
   */
  scenarioRun: ScenarioRun;
  /** Model nie jest skalibrowany do żadnej rzeczywistej epidemii. */
  epistemicStatus: 'SIMULATION';
  /**
   * Skąd wziął się ten przebieg. Świat MUSI to pokazywać: świeże wykonanie w
   * Experiment Fabric i odtworzenie z Pamięci Naukowej to nie to samo, nawet
   * jeżeli seria jest identyczna.
   */
  origin: 'fabric-run' | 'memory-replay';
  /**
   * Wypełnione, gdy ten świat jest ramieniem WARIANTU kontrfaktyku. Niesie oba
   * przebiegi i policzoną różnicę, żeby dało się zapisać całe porównanie, a nie
   * tylko pokazany świat.
   */
  counterfactual?: ScenarioCounterfactual;
  /** Rządzone pytanie, z którego ten przebieg powstał. */
  preparedness?: { questionId: string; askedText: string; resolutionFingerprint: string };
  /**
   * Wypełnione wyłącznie dla `memory-replay`: werdykt, który dopuścił serię do
   * świata. Wyłącznie MATCH — DRIFT i BLOCKED nie mają tu wstępu.
   */
  replayVerdict?: 'MATCH';
}

const SCENARIO_TIMELINES = new Map<string, ScenarioTimelineHandoff>();
let pendingScenarioRunId: string | null = null;

export function registerScenarioTimeline(handoff: ScenarioTimelineHandoff): void {
  SCENARIO_TIMELINES.set(handoff.runId, handoff);
  while (SCENARIO_TIMELINES.size > MAX_RETAINED_WORLDS) {
    const oldestId = SCENARIO_TIMELINES.keys().next().value as string | undefined;
    if (!oldestId) break;
    SCENARIO_TIMELINES.delete(oldestId);
  }
}

export function setPendingScenarioTimeline(runId: string): boolean {
  if (!SCENARIO_TIMELINES.has(runId)) return false;
  pendingScenarioRunId = runId;
  return true;
}

/** Podgląd bez konsumpcji — renderer musi móc odczytać serię wielokrotnie. */
export function peekPendingScenarioTimeline(): ScenarioTimelineHandoff | null {
  return pendingScenarioRunId ? SCENARIO_TIMELINES.get(pendingScenarioRunId) ?? null : null;
}

/**
 * Direct, read-only lookup by `runId` — no consumption, no pending-pointer
 * side effect. Added for `core/world/scientificWorldState.ts`'s
 * epidemiology adapter, which needs the real per-day series behind an
 * already-produced `ExperimentRun` (by its `runId`) to project a
 * `WorldState` timeline. Reuses the SAME retained-world map `runExperiment`
 * already populates for every real scenario-timeline run — no second
 * world-state store.
 */
export function getScenarioTimelineByRunId(runId: string): ScenarioTimelineHandoff | null {
  return SCENARIO_TIMELINES.get(runId) ?? null;
}

export function consumePendingScenarioTimeline(): ScenarioTimelineHandoff | null {
  if (!pendingScenarioRunId) return null;
  const runId = pendingScenarioRunId;
  pendingScenarioRunId = null;
  return SCENARIO_TIMELINES.get(runId) ?? null;
}

export function clearScenarioTimelineHandoffs(): void {
  pendingScenarioRunId = null;
  SCENARIO_TIMELINES.clear();
}
