/**
 * EARTHQUAKE PERSISTED-RUN HISTORY.
 *
 * This is a read-only local provenance projection. It lists real persisted
 * Earthquake runs and recomputes their canonical replay verdicts; it owns no
 * mapping, overlay, renderer, download transport or scientific solver.
 */
import { earthquakeEvaluator } from '../hazard/earthquake/earthquakeEvaluator';
import { getHazardModule } from '../hazard/hazardModuleRegistry';
import type { HazardReplayReport } from '../hazard/hazardReplay';
import { replayHazardRun } from '../hazard/hazardReplay';
import type { HazardProvenanceStore } from '../hazard/hazardProvenanceStore';

export interface EarthquakePersistedRunHistoryEntry {
  readonly hazardRunId: string;
  readonly hazardInputId: string;
  readonly sourceArtifactId: string;
  readonly createdAt: number;
  readonly hazardModuleVersion: string;
  readonly codeCommitHash: string;
  readonly inputFingerprint: string;
  readonly resultFingerprint: string;
  readonly replay: HazardReplayReport;
}

/**
 * Lists only persisted records whose retained input explicitly declares the
 * registered Earthquake hazard type. Results are sorted newest-first and use
 * canonical replay, not a cached UI verdict.
 */
export async function listEarthquakePersistedRunHistory(
  store: HazardProvenanceStore,
): Promise<readonly EarthquakePersistedRunHistoryEntry[]> {
  const descriptor = getHazardModule('earthquake');
  const runIds = await store.listRuns();
  const entries = await Promise.all(runIds.map(async (hazardRunId) => {
    const run = await store.getRun(hazardRunId);
    if (!run) return null;
    const input = await store.getInput(run.hazardInputId);
    if (!input || input.hazardType !== descriptor.hazardType) return null;
    const replay = await replayHazardRun({
      store,
      hazardRunId: run.hazardRunId,
      evaluator: earthquakeEvaluator,
      hazardType: descriptor.hazardType,
      projectionSchemaVersion: descriptor.projectionSchemaVersion,
    });
    return Object.freeze({
      hazardRunId: run.hazardRunId,
      hazardInputId: run.hazardInputId,
      sourceArtifactId: input.sourceArtifactId,
      createdAt: run.createdAt,
      hazardModuleVersion: run.hazardModuleVersion,
      codeCommitHash: run.codeCommitHash,
      inputFingerprint: input.inputFingerprint,
      resultFingerprint: run.resultFingerprint,
      replay,
    });
  }));

  return Object.freeze(entries
    .filter((entry): entry is EarthquakePersistedRunHistoryEntry => entry !== null)
    .sort((left, right) => right.createdAt - left.createdAt || left.hazardRunId.localeCompare(right.hazardRunId)));
}
