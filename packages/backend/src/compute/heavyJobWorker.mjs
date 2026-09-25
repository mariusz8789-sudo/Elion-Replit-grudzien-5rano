/**
 * Worker thread entry for the heavy campaign jobs (see heavyJobThread.mjs).
 *
 * Runs the SAME synchronous functions the in-process path runs — `runCampaign` and
 * `runMultiFidelityStage` — against the SAME database file, opened through the one `openDatabase`.
 * It exists only so the Python engines (execFileSync) block this thread instead of the HTTP thread:
 * every stage event the pipeline already writes (`campaign_events`, `science_runs`) becomes readable
 * by polling WHILE the run is still going. No second pipeline, no second store.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { openDatabase } from '../store.mjs';
import { runCampaign } from '../campaign/orchestrator.mjs';
import { runMultiFidelityStage } from '../campaign/multiFidelity.mjs';

const { dbPath, kind, campaignId, config, cancelFlag } = workerData;
const cancelled = cancelFlag ? new Int32Array(cancelFlag) : null;

const db = openDatabase(dbPath);
try {
  let result;
  if (kind === 'campaign-run') {
    result = runCampaign(db, campaignId, {
      shouldCancel: () => Boolean(cancelled && Atomics.load(cancelled, 0) === 1),
      onProgress: (fraction) => parentPort.postMessage({ type: 'progress', fraction }),
    });
  } else if (kind === 'campaign-stage') {
    result = runMultiFidelityStage(db, campaignId, config ?? {});
  } else {
    throw new Error(`unknown_heavy_job_kind: ${kind}`);
  }
  parentPort.postMessage({ type: 'done', result });
} catch (error) {
  parentPort.postMessage({ type: 'error', message: String(error?.message ?? error) });
} finally {
  db.close();
}
