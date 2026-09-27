import { Worker } from 'node:worker_threads';
import { setInterval, clearInterval } from 'node:timers';

/**
 * Runs a heavy campaign job (`campaign-run`, `campaign-stage`) on a worker thread when the database is
 * a file, so the HTTP thread keeps answering while the engines compute and the stage events the
 * pipeline persists can be polled live. Returns null when the database has no file (`:memory:` in
 * tests) — the caller then runs the same function in-process, exactly as before.
 *
 * Cancellation crosses into the busy worker through a shared flag (the worker is inside synchronous
 * engine calls and cannot receive messages until it finishes).
 */
export function databaseFile(db) {
  try {
    const location = typeof db?.location === 'function' ? db.location() : null;
    return typeof location === 'string' && location.length > 0 ? location : null;
  } catch {
    return null;
  }
}

export function runHeavyJobInThread(db, kind, { campaignId, config, onProgress = () => {}, isCancelled = () => false } = {}) {
  const dbPath = databaseFile(db);
  if (!dbPath) return null;
  const cancelFlag = new SharedArrayBuffer(4);
  const flag = new Int32Array(cancelFlag);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./heavyJobWorker.mjs', import.meta.url), {
      workerData: { dbPath, kind, campaignId, config, cancelFlag },
    });
    const poll = setInterval(() => { if (isCancelled()) Atomics.store(flag, 0, 1); }, 250);
    let settled = false;
    const finish = (fn, value) => { if (settled) return; settled = true; clearInterval(poll); fn(value); };
    worker.on('message', (message) => {
      if (message?.type === 'progress') onProgress(message.fraction);
      else if (message?.type === 'done') finish(resolve, message.result);
      else if (message?.type === 'error') finish(reject, new Error(message.message));
    });
    worker.on('error', (error) => finish(reject, error));
    worker.on('exit', (code) => finish(reject, new Error(`heavy_job_worker_exited: ${code}`)));
  });
}
