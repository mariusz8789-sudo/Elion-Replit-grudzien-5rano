import { EpidemicCitySimulation } from '../simulation/epidemicCity';

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
  simulation: EpidemicCitySimulation;
}

const LIVE_WORLDS = new Map<string, LiveWorldHandoff>();
let pendingRunId: string | null = null;
const MAX_RETAINED_WORLDS = 8;

export function registerLiveExperimentWorld(runId: string, simulation: EpidemicCitySimulation, metadata: { runFingerprint: string; resultOrigin: 'real-engine' }): void {
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
