import { registerScenarioTimeline, setPendingScenarioTimeline } from '../experimentFabric/worldHandoff';
import type { EpidemicCityParams } from './epidemicCity';
import { SCENARIOS } from './scenarioEngine';
import { replaySavedScenarioRun, type SavedScenarioReplay } from './scenarioMemory';

/**
 * MOST PAMIĘĆ → ŚWIAT 3D.
 *
 * Jedyna droga, którą zapisany przebieg może trafić do renderera. Świadomie
 * przechodzi przez pełne odtworzenie: seria oddana światu pochodzi z modelu
 * policzonego TERAZ, a nie z rekordu w localStorage. Rekord dostarcza wyłącznie
 * wejść i odcisków do porównania.
 *
 * Bramka jest jednokierunkowa: przy DRIFT albo BLOCKED nic nie zostaje
 * zarejestrowane i nic nie staje się „pending", więc świat nie ma czego
 * pokazać. Ostrzeżenie w UI nie jest tu zabezpieczeniem — brak danych jest.
 */
export interface SavedScenarioWorldHandoffResult {
  replay: SavedScenarioReplay;
  /** Wypełnione wyłącznie przy MATCH — identyfikator przekazania do świata. */
  handoffRunId: string | null;
  /** Czy renderer ma teraz co odebrać. */
  opened: boolean;
}

export interface OpenSavedScenarioOptions {
  /** Identyfikator rekordu pamięci; wchodzi do identyfikatora przekazania. */
  recordId: string;
  /** Świadoma zmiana parametru — służy wykazaniu DRIFT, nie obejściu bramki. */
  overrideParams?: Partial<EpidemicCityParams>;
}

export function openSavedScenarioInWorld(saved: unknown, options: OpenSavedScenarioOptions): SavedScenarioWorldHandoffResult {
  const replay = replaySavedScenarioRun(saved, options.overrideParams === undefined ? {} : { overrideParams: options.overrideParams });
  if (replay.status !== 'MATCH' || replay.run === null || replay.run.summary === null || replay.actualResultFingerprint === null) {
    return { replay, handoffRunId: null, opened: false };
  }
  const run = replay.run;
  const scenarioSummary = run.summary;
  if (scenarioSummary === null) return { replay, handoffRunId: null, opened: false };
  const handoffRunId = `replay:${options.recordId}`;
  registerScenarioTimeline({
    runId: handoffRunId,
    runFingerprint: replay.actualResultFingerprint,
    resultOrigin: 'real-engine',
    modelId: 'scenario-timeline',
    scenarioId: run.scenarioId,
    scenarioLabel: SCENARIOS[run.scenarioId].label,
    seed: run.params.seed,
    summary: `Odtworzenie z Pamięci Naukowej: ${run.label}, ${run.series.length} dni, werdykt MATCH.`,
    series: run.series,
    scenarioSummary,
    scenarioRun: run,
    epistemicStatus: 'SIMULATION',
    origin: 'memory-replay',
    replayVerdict: 'MATCH',
  });
  const opened = setPendingScenarioTimeline(handoffRunId);
  return { replay, handoffRunId: opened ? handoffRunId : null, opened };
}
