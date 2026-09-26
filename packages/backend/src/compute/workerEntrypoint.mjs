/**
 * Process entrypoint for a Railway scientific worker container (CMD in
 * packages/backend/workers/<group>/Dockerfile). Reads GENESIS_WORKER_GROUP,
 * resolves it to its fixed engine allowlist, and starts the HTTP seam from
 * workerServer.mjs. See docs/RAILWAY_SCIENTIFIC_WORKERS.md for the grouping
 * rationale and the remote-execution contract.
 */
import { createWorkerServer } from './workerServer.mjs';
import { WORKER_GROUPS } from './scientificCapabilityContract.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export { WORKER_GROUPS };

function main() {
  const workerGroup = process.env.GENESIS_WORKER_GROUP;
  const engineIds = WORKER_GROUPS[workerGroup];
  if (!engineIds) {
    console.error(
      `GENESIS_WORKER_GROUP="${workerGroup ?? ''}" is not a known worker group. ` +
        `Expected one of: ${Object.keys(WORKER_GROUPS).join(', ')}`,
    );
    process.exit(1);
  }
  const port = Number(process.env.PORT || 8090);
  const server = createWorkerServer({ workerGroup, engineIds, authToken: process.env.GENESIS_SCIENTIFIC_WORKER_TOKEN });
  server.listen(port, () => {
    console.log(
      `Genesis scientific worker [${workerGroup}] listening on :${port} (engines: ${engineIds.join(', ')}; ` +
        `execution endpoint ${server.executionAuthConfigured ? 'enabled' : 'DISABLED — GENESIS_SCIENTIFIC_WORKER_TOKEN missing or shorter than 32 characters'})`,
    );
  });
  const shutdown = (signal) => {
    console.log(`${signal} received, closing worker [${workerGroup}]`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
