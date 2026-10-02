import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(path.resolve(HERE, '../../../../.github/workflows/railway-scientific-workers.yml'), 'utf8');
const probeScript = readFileSync(path.resolve(HERE, '../../../../scripts/verify-scientific-worker-runtime.mjs'), 'utf8');

test('Railway worker CI uses a masked ephemeral service token for protected engine routes', () => {
  assert.match(workflow, /openssl rand -hex 32/);
  assert.match(workflow, /::add-mask::\$worker_token/);
  assert.match(workflow, /GENESIS_SCIENTIFIC_WORKER_TOKEN=\$worker_token/);
  assert.match(workflow, /-e GENESIS_SCIENTIFIC_WORKER_TOKEN/);
  assert.match(workflow, /curl --fail --silent http:\/\/127\.0\.0\.1:8090\/health/);
  assert.match(workflow, /node scripts\/verify-scientific-worker-runtime\.mjs/);
  assert.match(workflow, /--level LOCAL_CONTAINER_VERIFIED/);
  assert.match(workflow, /--out "artifacts\/engine-runtime\/worker-runtime-\$\{\{ matrix\.group \}\}\.json"/);
  assert.match(probeScript, /const token = process\.env\.GENESIS_SCIENTIFIC_WORKER_TOKEN/);
  assert.match(probeScript, /probeWorker\(\{/);
  assert.match(probeScript, /token, workerGroup: args\.group, level: args\.level/);
});
