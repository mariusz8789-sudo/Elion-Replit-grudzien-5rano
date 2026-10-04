/**
 * Entry point of a remote ResearchRun worker: `node remoteWorkerMain.mjs`. It needs no database and no shared
 * file, only the server's URL and the worker token. Env: GENESIS_SERVER_URL, GENESIS_WORKER_TOKEN,
 * GENESIS_WORKER_ID (default: worker-remote-<pid>), GENESIS_REMOTE_WORKER_LEASE_MS (default 30000).
 */
import { createRemoteWorker } from './remoteWorker.mjs';

const log = (level, msg, extra = {}) => process.stdout.write(`${JSON.stringify({ level, msg, ts: new Date().toISOString(), ...extra })}\n`);
const serverUrl = process.env.GENESIS_SERVER_URL;
const token = process.env.GENESIS_WORKER_TOKEN;
const workerId = process.env.GENESIS_WORKER_ID || `worker-remote-${process.pid}`;
const leaseMs = process.env.GENESIS_REMOTE_WORKER_LEASE_MS ? Number(process.env.GENESIS_REMOTE_WORKER_LEASE_MS) : 30_000;
if (!serverUrl || !token) {
  log('error', 'worker_not_configured', { need: ['GENESIS_SERVER_URL', 'GENESIS_WORKER_TOKEN'] });
  process.exit(2);
}
const worker = createRemoteWorker({ serverUrl, token, workerId, leaseMs });
const stop = new globalThis.AbortController();
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => stop.abort());
log('info', 'worker_started', { workerId, serverUrl });
await worker.run({
  signal: stop.signal,
  onResult: (r) => { if (r.state !== 'IDLE') log('info', 'job_result', { state: r.state, jobId: r.job?.jobId ?? r.jobId ?? null, error: r.error ?? null }); },
});
