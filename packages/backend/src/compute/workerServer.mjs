/**
 * Railway scientific worker HTTP seam (P8/P9). A bounded, honest HTTP wrapper
 * around the EXISTING canonical toolchain registry (campaign/toolchain.mjs)
 * and its adapters — this is NOT a second solver registry or Virtual Lab.
 *
 * Routes:
 *   GET  /health                                  liveness + what this worker may execute
 *   GET  /engines                                 the toolchain entry of each engine in this worker's allowlist
 *   POST /engines/:toolId/reference-case          the tool's own reference case (unauthenticated, as before)
 *   POST /capabilities/:capabilityId/execute      authenticated, bounded execution of ONE real
 *                                                 candidate computation (compute/scientificCapabilityContract.mjs)
 *
 * The execution endpoint never persists anything, never publishes Evidence,
 * never classifies a result and never sees a project/campaign/candidate id —
 * the main service owns all of that. It accepts only a capability from this
 * worker's fixed allowlist and an input that passes that capability's strict
 * schema; no command, module, executable or filesystem path can come from the
 * request. Every adapter still enforces its own subprocess timeout and
 * output-size cap (execFileSync `timeout`/`maxBuffer`), which is the
 * authoritative bound on a computation; this layer adds body/response caps,
 * a socket timeout, authentication and idempotency.
 *
 * Execution is synchronous (the adapters are), so a worker process runs one
 * computation at a time and answers /health again once it finishes. Railway
 * only probes the healthcheck path during a deploy, so this does not cause
 * restarts mid-computation.
 */
import http from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { getTool, listToolIds } from '../campaign/toolchain.mjs';
import { redact } from '../redact.mjs';
import { sha256Hex16, snapshotEnvironment } from '../provenance.mjs';
import {
  DISPATCH_STATE,
  MIN_WORKER_TOKEN_LENGTH,
  WORKER_CONTRACT_VERSION,
  computeInputFingerprint,
  computeOutputFingerprint,
  executeCapability,
  getCapabilityContract,
  listRemoteCapabilities,
  sanitizeReason,
  validateCapabilityInput,
  validateExecutionEnvelope,
} from './scientificCapabilityContract.mjs';

export const MAX_BODY_BYTES = 64 * 1024;
/** Execution requests may carry a PDB structure or receptor PDBQT, so they get a larger — still bounded — body. */
export const MAX_EXECUTION_BODY_BYTES = 4 * 1024 * 1024;
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
/** Above the slowest adapter's own timeout (docking: 300 s) so the adapter, not the socket, decides. */
export const DEFAULT_SOCKET_TIMEOUT_MS = 330_000;
export const DEFAULT_IDEMPOTENCY_CACHE_SIZE = 128;

function jsonResponse(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  if (Buffer.byteLength(payload) > MAX_RESPONSE_BYTES) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'RESPONSE_TOO_LARGE' }));
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(payload);
}

function readBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let oversized = false;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
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

function failure(state, error, extra = {}) {
  return { contractVersion: WORKER_CONTRACT_VERSION, ok: false, state, error, ...extra };
}

/**
 * Builds one worker's HTTP handler. `engineIds` is a fixed allowlist of
 * canonical toolIds (from campaign/toolchain.mjs) this container serves.
 * A toolId or capability outside the allowlist is refused honestly — never
 * proxied, never silently executed.
 *
 * `authToken` enables the execution endpoint; without a token of at least
 * MIN_WORKER_TOKEN_LENGTH characters it fails closed (503). `executor` is
 * the capability executor (default: the real adapters) — injectable only so
 * tests can count or fail executions deterministically.
 */
export function createWorkerServer({
  workerGroup,
  engineIds,
  startedAt = Date.now(),
  authToken = null,
  executor = executeCapability,
  idempotencyCacheSize = DEFAULT_IDEMPOTENCY_CACHE_SIZE,
} = {}) {
  if (!workerGroup || typeof workerGroup !== 'string') {
    throw new Error('createWorkerServer requires a workerGroup name');
  }
  if (!Array.isArray(engineIds) || engineIds.length === 0) {
    throw new Error('createWorkerServer requires a non-empty engineIds allowlist');
  }
  const allowed = new Set(engineIds);
  // listToolIds() reads the registry without running any reference case, so a
  // worker starts immediately; engines are validated on first real use.
  const knownToolIds = new Set(listToolIds());
  for (const id of allowed) {
    if (!knownToolIds.has(id)) {
      throw new Error(`createWorkerServer: "${id}" is not a canonical toolId in campaign/toolchain.mjs`);
    }
  }

  const executableCapabilities = listRemoteCapabilities().filter((capabilityId) => allowed.has(getCapabilityContract(capabilityId).toolId));
  const token = typeof authToken === 'string' && authToken.length >= MIN_WORKER_TOKEN_LENGTH ? authToken : null;
  const tokenDigest = token ? createHash('sha256').update(token).digest() : null;
  const idempotency = new Map();

  const scrub = (text) => {
    const clean = sanitizeReason(text);
    return clean && token ? clean.split(token).join('<redacted>') : clean;
  };
  const authorized = (header) => {
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
    const presented = createHash('sha256').update(header.slice('Bearer '.length)).digest();
    return timingSafeEqual(presented, tokenDigest);
  };
  const remember = (executionId, entry) => {
    idempotency.set(executionId, entry);
    while (idempotency.size > idempotencyCacheSize) idempotency.delete(idempotency.keys().next().value);
  };

  async function handleExecute(req, res, capabilityId) {
    if (req.method !== 'POST') return jsonResponse(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
    // Authenticate before reading a body or revealing anything about this worker.
    if (!tokenDigest) return jsonResponse(res, 503, failure(DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE, 'WORKER_AUTH_NOT_CONFIGURED'));
    if (!authorized(req.headers.authorization)) {
      return jsonResponse(res, 401, failure(DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE, 'UNAUTHORIZED'), { 'www-authenticate': 'Bearer' });
    }

    const contract = getCapabilityContract(capabilityId);
    if (!contract) return jsonResponse(res, 404, failure(DISPATCH_STATE.BLOCKED_INVALID_INPUT, 'UNKNOWN_CAPABILITY'));
    if (!allowed.has(contract.toolId)) {
      return jsonResponse(res, 404, failure(DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE, 'CAPABILITY_NOT_IN_WORKER', { capabilityId, workerGroup }));
    }

    let rawBody;
    try {
      rawBody = await readBody(req, MAX_EXECUTION_BODY_BYTES);
    } catch (err) {
      if (err?.code === 'BODY_TOO_LARGE') return jsonResponse(res, 413, failure(DISPATCH_STATE.BLOCKED_INVALID_INPUT, 'BODY_TOO_LARGE'));
      return jsonResponse(res, 400, failure(DISPATCH_STATE.BLOCKED_INVALID_INPUT, 'BODY_READ_FAILED'));
    }
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse(res, 400, failure(DISPATCH_STATE.BLOCKED_INVALID_INPUT, 'MALFORMED_INPUT'));
    }

    const envelope = validateExecutionEnvelope(body);
    if (!envelope.ok) return jsonResponse(res, 400, failure(DISPATCH_STATE.BLOCKED_INVALID_INPUT, 'INVALID_REQUEST', { errors: envelope.errors }));
    if (body.capabilityId !== capabilityId) return jsonResponse(res, 400, failure(DISPATCH_STATE.BLOCKED_INVALID_INPUT, 'CAPABILITY_MISMATCH'));

    const input = validateCapabilityInput(capabilityId, body.input);
    if (!input.ok) return jsonResponse(res, 400, failure(DISPATCH_STATE.BLOCKED_INVALID_INPUT, 'INVALID_INPUT', { errors: input.errors }));
    const inputFingerprint = computeInputFingerprint(capabilityId, body.input);
    if (inputFingerprint !== body.inputFingerprint) {
      return jsonResponse(res, 400, failure(DISPATCH_STATE.BLOCKED_INVALID_INPUT, 'INPUT_FINGERPRINT_MISMATCH'));
    }

    const cached = idempotency.get(body.executionId);
    if (cached) {
      if (cached.inputFingerprint !== inputFingerprint || cached.capabilityId !== capabilityId) {
        return jsonResponse(res, 409, failure(DISPATCH_STATE.BLOCKED_INVALID_INPUT, 'IDEMPOTENCY_CONFLICT', { executionId: body.executionId }));
      }
      return jsonResponse(res, cached.status, { ...cached.body, idempotentReplay: true });
    }

    const outcome = executor(capabilityId, body.input);
    if (!outcome.ok) {
      const responseBody = failure(outcome.state, outcome.error, {
        executionId: body.executionId, capabilityId, reason: scrub(outcome.reason), durationMs: outcome.durationMs ?? 0, idempotentReplay: false,
      });
      // Deterministic engine outcomes are remembered (a retry must not re-run a
      // known failure); an unavailable engine is not, since it may recover.
      if (outcome.state === DISPATCH_STATE.ENGINE_FAILED || outcome.state === DISPATCH_STATE.BLOCKED_INVALID_INPUT) {
        remember(body.executionId, { capabilityId, inputFingerprint, status: 200, body: responseBody });
      }
      return jsonResponse(res, 200, responseBody);
    }

    const snapshot = snapshotEnvironment();
    const responseBody = {
      contractVersion: WORKER_CONTRACT_VERSION,
      ok: true,
      executionId: body.executionId,
      capabilityId,
      toolId: contract.toolId,
      workerGroup,
      inputFingerprint,
      engine: outcome.engine,
      result: outcome.result,
      outputFingerprint: computeOutputFingerprint(outcome.result),
      environmentFingerprint: snapshot.ok ? snapshot.hash : null,
      durationMs: outcome.durationMs,
      limitations: (outcome.limitations ?? []).map((l) => scrub(l)),
      idempotentReplay: false,
    };
    remember(body.executionId, { capabilityId, inputFingerprint, status: 200, body: responseBody });
    return jsonResponse(res, 200, responseBody);
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
          contractVersion: WORKER_CONTRACT_VERSION,
          executableCapabilities,
          executionAuth: tokenDigest ? 'configured' : 'not_configured',
        });
      }

      if (req.method === 'GET' && url.pathname === '/engines') {
        // getTool() per allowlisted id: listToolchain() would run the reference
        // case of every registry engine — engines this image does not even contain.
        const matrix = [...allowed].map((toolId) => getTool(toolId));
        return jsonResponse(res, 200, { ok: true, workerGroup, engines: matrix });
      }

      const capabilityRoute = /^\/capabilities\/([a-z0-9-]{1,64})\/execute$/.exec(url.pathname);
      if (capabilityRoute) return await handleExecute(req, res, capabilityRoute[1]);

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
      jsonResponse(res, 500, { ok: false, error: 'INTERNAL_ERROR', reason: scrub(err?.message ?? err) });
    }
  });

  server.setTimeout(DEFAULT_SOCKET_TIMEOUT_MS);
  server.executionAuthConfigured = Boolean(tokenDigest);
  return server;
}
