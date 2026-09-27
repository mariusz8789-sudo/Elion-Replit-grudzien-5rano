/**
 * computePool (Genesis 2.1, Part 1) — trwała, asynchroniczna pula wątków roboczych
 * dla obliczeń RDKit. Zastępuje blokujący execFileSync na głównej pętli: zadania
 * lecą do puli N trwałych worker_thread'ów (kolejka FIFO, ograniczona współbieżność),
 * a główny wątek pozostaje responsywny (health/metrics odpowiadają natychmiast).
 *
 * Włączane WYŁĄCZNIE za flagą ASYNC_EXECUTION — tor synchroniczny pozostaje domyślny
 * i nietknięty. Pula sama restartuje martwe wątki; każde zadanie ma limit czasu.
 */
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'computeWorker.mjs');
const DEFAULT_SIZE = Math.max(1, Math.min(4, (os.cpus()?.length || 2) - 1));
const DEFAULT_TIMEOUT_MS = 60_000;

export function createComputePool({ size = DEFAULT_SIZE, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const workers = [];       // { worker, busy }
  const queue = [];         // { cmd, args, resolve, reject }
  const inflight = new Map(); // id → { entry, timer, wrap }
  let nextId = 1;
  let closed = false;

  function spawn() {
    const worker = new Worker(WORKER_FILE);
    const rec = { worker, busy: false };
    worker.on('message', (msg) => {
      const job = inflight.get(msg.id);
      if (!job) return;
      clearTimeout(job.timer);
      inflight.delete(msg.id);
      rec.busy = false;
      if (msg.ok) job.entry.resolve(msg.result);
      else job.entry.reject(new Error(msg.error || 'compute_worker_error'));
      pump();
    });
    worker.on('error', (err) => failWorker(rec, err));
    worker.on('exit', (code) => { if (!closed && code !== 0) failWorker(rec, new Error(`worker exited ${code}`)); });
    return rec;
  }

  // Wątek padł: odrzuć jego zadanie w locie i podmień na świeży (samonaprawa).
  function failWorker(rec, err) {
    for (const [id, job] of inflight) {
      if (job.rec === rec) { clearTimeout(job.timer); inflight.delete(id); job.entry.reject(err); }
    }
    const i = workers.indexOf(rec);
    if (i >= 0) workers.splice(i, 1);
    try { rec.worker.terminate(); } catch { /* ignore */ }
    if (!closed) { workers.push(spawn()); pump(); }
  }

  function pump() {
    if (closed) return;
    for (const rec of workers) {
      if (rec.busy || queue.length === 0) continue;
      const entry = queue.shift();
      const id = nextId++;
      rec.busy = true;
      const timer = setTimeout(() => {
        if (!inflight.has(id)) return;
        inflight.delete(id);
        entry.reject(new Error('compute_timeout'));
        failWorker(rec, new Error('compute_timeout')); // ubij zawieszony wątek, wstaw świeży
      }, timeoutMs);
      inflight.set(id, { entry, timer, rec });
      rec.worker.postMessage({ id, cmd: entry.cmd, args: entry.args });
    }
  }

  for (let i = 0; i < size; i++) workers.push(spawn());

  return {
    run(cmd, args) {
      if (closed) return Promise.reject(new Error('pool_closed'));
      return new Promise((resolve, reject) => { queue.push({ cmd, args, resolve, reject }); pump(); });
    },
    stats: () => ({ size: workers.length, busy: workers.filter((w) => w.busy).length, queued: queue.length, inflight: inflight.size }),
    async close() {
      closed = true;
      for (const [, job] of inflight) { clearTimeout(job.timer); }
      await Promise.all(workers.map((r) => r.worker.terminate().catch(() => {})));
      workers.length = 0;
    },
  };
}
