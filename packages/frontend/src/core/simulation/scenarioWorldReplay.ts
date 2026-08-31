import { registerScenarioTimeline, setPendingScenarioTimeline } from '../experimentFabric/worldHandoff';
import type { EpidemicCityParams } from './epidemicCity';
import { SCENARIOS } from './scenarioEngine';
import { replaySavedScenarioRun, type SavedScenarioReplay } from './scenarioMemory';
import { replaySavedScenarioCounterfactual, type SavedScenarioCounterfactualReplay } from './scenarioCounterfactual';

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

export interface SavedCounterfactualWorldHandoffResult {
  replay: SavedScenarioCounterfactualReplay;
  handoffRunId: string | null;
  opened: boolean;
}

/**
 * MOST PAMIĘĆ → ŚWIAT 3D DLA KONTRFAKTYKU.
 *
 * Ta sama, jedyna droga co dla pojedynczego przebiegu, tylko z dwoma
 * ramionami: świat dostaje ramię WARIANTU — to ono jest odpowiedzią na „a
 * gdyby" — ale dopiero po tym, jak OBA ramiona zostały policzone od nowa i
 * cała różnica między nimi się odtworzyła. Zweryfikowany wariant przy
 * niezweryfikowanym odniesieniu nie jest kontrfaktykiem, więc DRIFT albo
 * BLOCKED nie rejestruje niczego i świat nie ma czego pokazać.
 */
export function openSavedCounterfactualInWorld(saved: unknown, options: { recordId: string }): SavedCounterfactualWorldHandoffResult {
  const replay = replaySavedScenarioCounterfactual(saved);
  const counterfactual = replay.counterfactual;
  if (replay.status !== 'MATCH' || counterfactual === null) {
    return { replay, handoffRunId: null, opened: false };
  }
  const variant = counterfactual.variant;
  const scenarioSummary = variant.summary;
  if (scenarioSummary === null || variant.resultFingerprint === null) {
    return { replay, handoffRunId: null, opened: false };
  }
  const preparedness = (saved as { preparedness?: { questionId: string; askedText: string; resolutionFingerprint: string } }).preparedness;
  const handoffRunId = `replay:counterfactual:${options.recordId}`;
  registerScenarioTimeline({
    runId: handoffRunId,
    runFingerprint: variant.resultFingerprint,
    resultOrigin: 'real-engine',
    modelId: 'scenario-timeline',
    scenarioId: variant.scenarioId,
    scenarioLabel: SCENARIOS[variant.scenarioId].label,
    seed: variant.params.seed,
    summary: `Odtworzony kontrfaktyk z Pamięci: ramię wariantu ${variant.label}, ${variant.series.length} dni, werdykt MATCH dla obu ramion.`,
    series: variant.series,
    scenarioSummary,
    scenarioRun: variant,
    epistemicStatus: 'SIMULATION',
    origin: 'memory-replay',
    replayVerdict: 'MATCH',
    counterfactual,
    ...(preparedness === undefined ? {} : { preparedness }),
  });
  const opened = setPendingScenarioTimeline(handoffRunId);
  return { replay, handoffRunId: opened ? handoffRunId : null, opened };
}
