#!/usr/bin/env node
/**
 * Genesis — scientific worker runtime verification.
 *
 * Runs packages/backend/src/compute/workerRuntimeProbe.mjs against one worker
 * group and prints a JSON report. The token is generated (spawn mode) or read from
 * GENESIS_SCIENTIFIC_WORKER_TOKEN (url mode) and is never printed.
 *
 *   # LOCAL_RUNTIME_VERIFIED — start the worker as its own process from a pinned venv
 *   node scripts/verify-scientific-worker-runtime.mjs --spawn --group chem-light \
 *        --python /opt/genesis-science/bin/python [--uid 65534 --gid 65534]
 *
 *   # LOCAL_CONTAINER_VERIFIED — a `docker run` of packages/backend/workers/<group>/Dockerfile
 *   GENESIS_SCIENTIFIC_WORKER_TOKEN=... node scripts/verify-scientific-worker-runtime.mjs \
 *        --url http://127.0.0.1:8090 --group chem-light --level LOCAL_CONTAINER_VERIFIED
 *
 *   # RAILWAY_VERIFIED — only from inside the Railway project, against the private URL
 *   GENESIS_SCIENTIFIC_WORKER_TOKEN=... node scripts/verify-scientific-worker-runtime.mjs \
 *        --url http://<worker>.railway.internal:<port> --group chem-light --level RAILWAY_VERIFIED
 *
 * Exit code 0 only when every check passed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERIFICATION_LEVEL, probeWorker, spawnLocalWorker } from '../packages/backend/src/compute/workerRuntimeProbe.mjs';

function parseArgs(argv) {
  const args = { spawn: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--spawn') args.spawn = true;
    else if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
  }
  return args;
}

function processUid(pid) {
  try {
    const line = readFileSync(`/proc/${pid}/status`, 'utf8').split('\n').find((l) => l.startsWith('Uid:'));
    return line ? Number(line.split(/\s+/)[1]) : null;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (!args.group) throw new Error('--group is required');

  let report;
  if (args.spawn) {
    const uid = args.uid !== undefined ? Number(args.uid) : null;
    const gid = args.gid !== undefined ? Number(args.gid) : uid;
    const worker = await spawnLocalWorker({ workerGroup: args.group, python: args.python, uid, gid });
    const runningUid = processUid(worker.pid);
    try {
      report = await probeWorker({
        url: worker.url, token: worker.token, workerGroup: args.group,
        level: VERIFICATION_LEVEL.LOCAL_RUNTIME_VERIFIED,
        forbiddenStrings: [args.python, repoRoot, worker.tmpdir].filter(Boolean),
        log: (line) => process.stderr.write(`${line}\n`),
      });
    } finally {
      const stopped = await worker.stop();
      report = report ?? { ok: false, verificationLevel: 'FAILED', checks: [] };
      report.process = {
        requestedUid: uid, observedUid: runningUid,
        nonRoot: runningUid !== null && runningUid !== 0,
        shutdown: { signal: stopped.signal, code: stopped.code, shutdownMs: stopped.shutdownMs },
      };
      const cleanShutdown = stopped.code === 0 || stopped.signal === 'SIGTERM';
      report.checks.push({ name: 'clean-shutdown-on-SIGTERM', pass: cleanShutdown });
      if (uid !== null) report.checks.push({ name: 'runs-as-requested-non-root-uid', pass: runningUid === uid && uid !== 0 });
      const failed = report.checks.filter((c) => !c.pass);
      report.failedChecks = failed.map((c) => c.name);
      report.ok = failed.length === 0;
      report.verificationLevel = report.ok ? VERIFICATION_LEVEL.LOCAL_RUNTIME_VERIFIED : 'FAILED';
    }
  } else {
    if (!args.url) throw new Error('--url or --spawn is required');
    if (!args.level || !Object.values(VERIFICATION_LEVEL).includes(args.level)) {
      throw new Error(`--level must be one of ${Object.values(VERIFICATION_LEVEL).join(', ')} (the caller states where the worker runs)`);
    }
    const token = process.env.GENESIS_SCIENTIFIC_WORKER_TOKEN;
    if (!token) throw new Error('GENESIS_SCIENTIFIC_WORKER_TOKEN must be set in url mode');
    report = await probeWorker({
      url: args.url, token, workerGroup: args.group, level: args.level,
      log: (line) => process.stderr.write(`${line}\n`),
    });
  }

  const json = JSON.stringify(report, null, 2);
  console.log(json);
  if (args.out) writeFileSync(args.out, json);
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exitCode = 2;
});
