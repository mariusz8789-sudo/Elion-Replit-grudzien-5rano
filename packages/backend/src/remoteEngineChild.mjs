/**
 * Child-process entry for the remote worker: runs ONE ResearchRun engine call and nothing else (no database, no
 * network). The worker kills this process group when its lease is lost or the job times out, so a synchronous engine
 * call can never silence the worker's heartbeats. stdin: { engineId, input }. stdout: CHILD_RESULT_MARKER + JSON.
 */
import { RESEARCH_RUN_EXECUTORS, researchEngineStatus } from './researchRunEngines.mjs';
import { CHILD_RESULT_MARKER } from './compute/isolatedProcess.mjs';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const { engineId, input } = JSON.parse(await readStdin());
const executor = RESEARCH_RUN_EXECUTORS[engineId];
const engineStatus = researchEngineStatus(engineId);
const startedAt = new Date().toISOString();
const t0 = Date.now();
const engineResult = executor
  ? (engineStatus.available ? executor.run(input) : { ok: false, status: 'BLOCKED', reason: engineStatus.reason })
  : { ok: false, status: 'BLOCKED', reason: 'NO_RESEARCH_RUN_ADAPTER' };
const outcome = {
  engineResult,
  engineStatus,
  environment: { node: process.versions.node, platform: process.platform, arch: process.arch, toolchain: engineStatus.environment ?? null },
  startedAt,
  finishedAt: new Date().toISOString(),
  durationMs: Date.now() - t0,
};
process.stdout.write(`\n${CHILD_RESULT_MARKER}${JSON.stringify(outcome)}\n`);
