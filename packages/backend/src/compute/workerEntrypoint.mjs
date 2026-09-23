/**
 * Process entrypoint for a Railway scientific worker container (CMD in
 * packages/backend/workers/<group>/Dockerfile). Reads GENESIS_WORKER_GROUP,
 * resolves it to its fixed engine allowlist, and starts the HTTP seam from
 * workerServer.mjs. See docs/RAILWAY_SCIENTIFIC_WORKERS.md for the grouping
 * rationale and the exact patch Codex applies to route traffic here.
 */
import { createWorkerServer } from './workerServer.mjs';

export const WORKER_GROUPS = Object.freeze({
  'chem-light': Object.freeze(['pyscf', 'biopython']),
  structural: Object.freeze(['openmm', 'vina']),
  admet: Object.freeze(['admet', 'toxicity']),
  // Not built/tested here (see workers/pymeep/Dockerfile.proposal); listed so
  // the seam is ready the moment a real conda-forge image passes the
  // reference case, without another code change.
  pymeep: Object.freeze(['pymeep']),
});

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
  const server = createWorkerServer({ workerGroup, engineIds });
  server.listen(port, () => {
    console.log(`Genesis scientific worker [${workerGroup}] listening on :${port} (engines: ${engineIds.join(', ')})`);
  });
  const shutdown = (signal) => {
    console.log(`${signal} received, closing worker [${workerGroup}]`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
