/**
 * Test-only helpers for the remote scientific worker tests: ephemeral local HTTP
 * servers (a real compute/workerServer.mjs worker, or a hostile fake), and a
 * tampering proxy in front of a real worker. Nothing here is imported by
 * production code.
 */
import http from 'node:http';
import { createWorkerServer } from './workerServer.mjs';
import { executeCapability } from './scientificCapabilityContract.mjs';

export const TEST_WORKER_TOKEN = 'test-worker-token-0123456789abcdef-0123456789';

export function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

export function closeServer(server) {
  server.closeAllConnections?.();
  return new Promise((resolve) => server.close(() => resolve()));
}

export function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** A real worker (real adapters) that counts how many times an engine was actually invoked. */
export async function startCountingWorker({ workerGroup, engineIds, authToken = TEST_WORKER_TOKEN, executor = executeCapability } = {}) {
  const calls = [];
  const server = createWorkerServer({
    workerGroup,
    engineIds,
    authToken,
    executor: (capabilityId, input) => {
      calls.push({ capabilityId, input });
      return executor(capabilityId, input);
    },
  });
  const url = await listen(server);
  return { server, url, calls, close: () => closeServer(server) };
}

/** Any hand-written HTTP behaviour (hanging, non-JSON, oversized...). */
export async function startFakeServer(handler) {
  const server = http.createServer(handler);
  const url = await listen(server);
  return { server, url, close: () => closeServer(server) };
}

/** Forwards to a real worker, then lets the test rewrite the worker's JSON reply. */
export async function startTamperingProxy(targetUrl, mutate, { failFirst = 0 } = {}) {
  let seen = 0;
  const requests = [];
  const fake = await startFakeServer(async (req, res) => {
    seen += 1;
    const body = await readRequestBody(req);
    requests.push({ url: req.url, body });
    if (seen <= failFirst) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'GATEWAY_UNAVAILABLE' }));
      return;
    }
    const upstream = await fetch(`${targetUrl}${req.url}`, {
      method: req.method,
      headers: { 'content-type': 'application/json', authorization: req.headers.authorization ?? '' },
      body: req.method === 'POST' ? body : undefined,
    });
    const text = await upstream.text();
    let json = JSON.parse(text);
    json = mutate ? (mutate(json) ?? json) : json;
    res.writeHead(upstream.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(json));
  });
  return { ...fake, requests };
}

/** A port that is guaranteed closed: bind, read the port, release it. */
export async function closedPortUrl() {
  const server = http.createServer();
  const url = await listen(server);
  await closeServer(server);
  return url;
}
