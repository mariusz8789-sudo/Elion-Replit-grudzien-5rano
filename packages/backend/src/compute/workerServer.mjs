/**
 * Railway scientific worker HTTP seam (P8). A bounded, honest HTTP wrapper
 * around the EXISTING canonical toolchain registry (campaign/toolchain.mjs)
 * and its adapters — this is NOT a second solver registry or Virtual Lab.
 * Every response is built from `getTool()`/`listToolchain()`, the same
 * functions the in-process backend already uses; the worker only adds a
 * network boundary so one engine group can run as its own Railway service.
 *
 * Bounding:
 *  - Each adapter already enforces its own subprocess timeout and output-size
 *    cap (execFileSync `timeout`/`maxBuffer` in every *Adapter.mjs`); that is
 *    the authoritative bound on a hanging or oversized scientific computation,
 *    and it holds regardless of this HTTP layer.
 *  - This module adds a real HTTP-level bound on top: `server.setTimeout()`
 *    closes an idle socket, and request/response bodies are size-capped
 *    before they ever reach an adapter.
 *  - No arbitrary shell/file input ever reaches an adapter: only a `toolId`
 *    drawn from a fixed allowlist chosen at server construction, matched
 *    against the canonical registry.
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { getTool, listToolchain } from '../campaign/toolchain.mjs';
import { redact } from '../redact.mjs';
import { sha256Hex16 } from '../provenance.mjs';

export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export const DEFAULT_SOCKET_TIMEOUT_MS = 150_000;

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body);
  if (Buffer.byteLength(payload) > MAX_RESPONSE_BYTES) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'RESPONSE_TOO_LARGE' }));
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let oversized = false;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Never call req.destroy() here: killing the request stream can tear
        // down the underlying socket before the 413 response below is sent,
        // turning an honest rejection into an unexplained connection reset
        // for the caller. Just stop retaining data and let 'end' fire.
        oversized = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (oversized) {
        reject(Object.assign(new Error('BODY_TOO_LARGE'), { code: 'BODY_TOO_LARGE' }));
        return;
      }
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

/**
 * Builds one worker's HTTP handler. `engineIds` is a fixed allowlist of
 * canonical toolIds (from campaign/toolchain.mjs) this container serves.
 * A toolId outside the allowlist is refused honestly — never proxied,
 * never silently executed — so a worker built for one group can never be
 * asked to run an engine it was not provisioned for.
 */
export function createWorkerServer({ workerGroup, engineIds, startedAt = Date.now() } = {}) {
  if (!workerGroup || typeof workerGroup !== 'string') {
    throw new Error('createWorkerServer requires a workerGroup name');
  }
  if (!Array.isArray(engineIds) || engineIds.length === 0) {
    throw new Error('createWorkerServer requires a non-empty engineIds allowlist');
  }
  const allowed = new Set(engineIds);
  const knownToolIds = new Set(listToolchain().map((t) => t.toolId));
  for (const id of allowed) {
    if (!knownToolIds.has(id)) {
      throw new Error(`createWorkerServer: "${id}" is not a canonical toolId in campaign/toolchain.mjs`);
    }
  }

  const server = http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://internal');
    } catch {
      return jsonResponse(res, 400, { ok: false, error: 'MALFORMED_URL' });
    }

    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return jsonResponse(res, 200, {
          ok: true,
          workerGroup,
          engineIds: [...allowed],
          uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
          node: process.version,
        });
      }

      if (req.method === 'GET' && url.pathname === '/engines') {
        const matrix = listToolchain().filter((t) => allowed.has(t.toolId));
        return jsonResponse(res, 200, { ok: true, workerGroup, engines: matrix });
      }

      const execMatch = /^\/engines\/([a-z0-9-]+)\/reference-case$/.exec(url.pathname);
      if (execMatch) {
        if (req.method !== 'POST') return jsonResponse(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
        const toolId = execMatch[1];
        if (!allowed.has(toolId)) {
          return jsonResponse(res, 404, { ok: false, error: 'ENGINE_NOT_IN_WORKER', toolId, workerGroup });
        }

        let rawBody;
        try {
          rawBody = await readBody(req);
        } catch (err) {
          if (err?.code === 'BODY_TOO_LARGE') return jsonResponse(res, 413, { ok: false, error: 'BODY_TOO_LARGE' });
          return jsonResponse(res, 400, { ok: false, error: 'BODY_READ_FAILED' });
        }
        if (rawBody.trim().length > 0) {
          try {
            JSON.parse(rawBody);
          } catch {
            return jsonResponse(res, 400, { ok: false, error: 'MALFORMED_INPUT' });
          }
        }

        const requestId = randomUUID();
        const startedAtMs = Date.now();
        try {
          // getTool() runs the tool's real reference case (bounded by its own
          // execFileSync timeout) and returns the canonical, already-redacted
          // public shape — the same one GET /api/compute/toolchain/:toolId
          // returns in the main service.
          const tool = getTool(toolId);
          const durationMs = Date.now() - startedAtMs;
          if (!tool) return jsonResponse(res, 404, { ok: false, error: 'UNKNOWN_ENGINE', toolId, requestId });
          const outputHash = sha256Hex16(JSON.stringify({ toolId, status: tool.status, validation: tool.validation }));
          return jsonResponse(res, 200, {
            ok: true,
            requestId,
            toolId,
            workerGroup,
            durationMs,
            outputHash,
            status: tool.status,
            availability: tool.availability,
            executionStatus: tool.executionStatus,
            version: tool.version,
            engine: tool.engine,
            fingerprint: tool.fingerprint,
            environment: tool.environment,
            validation: tool.validation,
            reason: tool.reason,
            limitations: tool.assumptions,
          });
        } catch (err) {
          return jsonResponse(res, 500, {
            ok: false,
            error: 'EXECUTION_FAILED',
            toolId,
            requestId,
            reason: redact(String(err?.message ?? err).slice(0, 200)),
          });
        }
      }

      return jsonResponse(res, 404, { ok: false, error: 'NOT_FOUND' });
    } catch (err) {
      jsonResponse(res, 500, { ok: false, error: 'INTERNAL_ERROR', reason: redact(String(err?.message ?? err).slice(0, 200)) });
    }
  });

  server.setTimeout(DEFAULT_SOCKET_TIMEOUT_MS);
  return server;
}
