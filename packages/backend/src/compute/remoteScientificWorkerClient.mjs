/**
 * Provider-neutral client for private scientific workers (P9).
 *
 * Talks to compute/workerServer.mjs's `POST /capabilities/:id/execute` over
 * plain HTTP(S) — Railway private networking today, any HTTPS host tomorrow —
 * and treats everything that comes back as untrusted until it has passed the
 * shared contract (compute/scientificCapabilityContract.mjs):
 *   - engine identity, capability, tool, worker group and execution id must
 *     match what was asked for;
 *   - the echoed input fingerprint must match what was sent;
 *   - the output fingerprint is recomputed here, never taken on trust;
 *   - the result must pass its capability's strict result schema and may not
 *     carry anything only the main service may decide (classification,
 *     Evidence, tenancy ids).
 *
 * Every outcome is exactly one DISPATCH_STATE. Failure reasons are fixed
 * codes plus path-redacted, token-scrubbed text; the bearer token is never
 * returned, logged or serialized (see describeWorkerConfig), redirects are
 * refused so it can never be forwarded, and plain http is accepted only for
 * private hosts (*.railway.internal, loopback).
 */
import {
  DISPATCH_STATE,
  EXECUTION_ID_RE,
  MIN_WORKER_TOKEN_LENGTH,
  WORKER_CONTRACT_VERSION,
  computeInputFingerprint,
  computeOutputFingerprint,
  engineVersionFromResult,
  getCapabilityContract,
  sanitizeReason,
  validateCapabilityInput,
  validateCapabilityResult,
} from './scientificCapabilityContract.mjs';

export const WORKER_URL_ENV = Object.freeze({
  'chem-light': 'GENESIS_CHEM_LIGHT_WORKER_URL',
  structural: 'GENESIS_STRUCTURAL_WORKER_URL',
  admet: 'GENESIS_ADMET_WORKER_URL',
  pymeep: 'GENESIS_PYMEEP_WORKER_URL',
});
export const WORKER_TOKEN_ENV = 'GENESIS_SCIENTIFIC_WORKER_TOKEN';
export const MAX_WORKER_RESPONSE_BYTES = 8 * 1024 * 1024;

/** Per-capability request ceilings: each sits just above the worker adapter's own subprocess timeout. */
export const DEFAULT_TIMEOUT_MS = Object.freeze({
  'quantum-chemistry': 150_000,
  'protein-structure-ingestion': 60_000,
  'molecular-dynamics': 210_000,
  'molecular-docking': 330_000,
  'admet-estimation': 150_000,
  'toxicity-risk-estimation': 150_000,
  'maxwell-fdtd': 150_000,
});

const SUCCESS_KEYS = Object.freeze([
  'contractVersion', 'ok', 'executionId', 'capabilityId', 'toolId', 'workerGroup', 'inputFingerprint',
  'engine', 'result', 'outputFingerprint', 'environmentFingerprint', 'durationMs', 'limitations', 'idempotentReplay',
]);
const ENGINE_OUTCOME_STATES = new Set([
  DISPATCH_STATE.ENGINE_FAILED, DISPATCH_STATE.BLOCKED_ENGINE_UNAVAILABLE, DISPATCH_STATE.BLOCKED_INVALID_INPUT,
]);

function isPrivateHttpHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.railway.internal');
}

function parseWorkerUrl(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return { requested: false, url: null, error: null };
  let url;
  try {
    url = new URL(value);
  } catch {
    return { requested: true, url: null, error: 'WORKER_URL_INVALID' };
  }
  if (url.username || url.password) return { requested: true, url: null, error: 'WORKER_URL_HAS_CREDENTIALS' };
  if (url.search || url.hash) return { requested: true, url: null, error: 'WORKER_URL_HAS_QUERY' };
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && isPrivateHttpHost(url.hostname));
  if (!secure) return { requested: true, url: null, error: 'WORKER_URL_INSECURE' };
  return { requested: true, url: url.href.replace(/\/+$/, ''), error: null };
}

/**
 * Reads worker configuration from the environment. The token is held as a
 * non-enumerable property, so JSON.stringify/console.log of the config can
 * never print it.
 */
export function resolveWorkerConfig(env = process.env) {
  const groups = {};
  for (const [group, envName] of Object.entries(WORKER_URL_ENV)) {
    groups[group] = Object.freeze({ envName, ...parseWorkerUrl(env[envName]) });
  }
  const rawToken = typeof env[WORKER_TOKEN_ENV] === 'string' ? env[WORKER_TOKEN_ENV].trim() : '';
  const tokenError = rawToken.length === 0 ? 'WORKER_TOKEN_MISSING' : rawToken.length < MIN_WORKER_TOKEN_LENGTH ? 'WORKER_TOKEN_TOO_SHORT' : null;
  const config = { groups: Object.freeze(groups), tokenError };
  Object.defineProperty(config, 'token', { value: tokenError ? null : rawToken, enumerable: false });
  return Object.freeze(config);
}

/** Safe for logs, health output and docs: origins only, never the token. */
export function describeWorkerConfig(config) {
  const groups = {};
  for (const [group, entry] of Object.entries(config.groups)) {
    groups[group] = {
      envName: entry.envName,
      requested: entry.requested,
      origin: entry.url ? new URL(entry.url).origin : null,
      error: entry.error,
    };
  }
  return { groups, token: config.token ? 'configured' : config.tokenError === 'WORKER_TOKEN_TOO_SHORT' ? 'too_short' : 'missing' };
}

/**
 * Local-vs-remote routing. A capability goes REMOTE exactly when the operator
 * asked for it by setting its group's URL variable — even if that value is
 * unusable, so a misconfigured worker blocks honestly instead of silently
 * running somewhere else. Everything else (RDKit descriptors, capabilities
 * with no execution contract) stays LOCAL.
 */
export function routeCapability(capabilityId, config) {
  const contract = getCapabilityContract(capabilityId);
  const envName = contract ? WORKER_URL_ENV[contract.workerGroup] : undefined;
  if (!contract || !envName) return { route: 'LOCAL', remoteCapable: false, workerGroup: null, envName: null };
  const group = config.groups[contract.workerGroup];
  return { route: group?.requested ? 'REMOTE' : 'LOCAL', remoteCapable: true, workerGroup: contract.workerGroup, envName };
}

function sanitizeCode(value, fallback) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(value) ? value : fallback;
}

function readBounded(response, max) {
  const declared = Number(response.headers.get('content-length'));
  const tooLarge = () => Object.assign(new Error('RESPONSE_TOO_LARGE'), { code: 'RESPONSE_TOO_LARGE' });
  if (Number.isFinite(declared) && declared > max) {
    return Promise.resolve(response.body?.cancel()).catch(() => {}).then(() => { throw tooLarge(); });
  }
  if (!response.body) return Promise.resolve('');
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  const pump = () => reader.read().then(({ done, value }) => {
    if (done) return Buffer.concat(chunks).toString('utf8');
    received += value.byteLength;
    if (received > max) return reader.cancel().catch(() => {}).then(() => { throw tooLarge(); });
    chunks.push(Buffer.from(value));
    return pump();
  });
  return pump();
}

const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * @param {object} [options]
 * @param {ReturnType<typeof resolveWorkerConfig>} [options.config]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number|null} [options.timeoutMs]  overrides the per-capability default
 * @param {number} [options.retries]         extra attempts for transport-level failures only
 */
export function createRemoteScientificWorkerClient({
  config = resolveWorkerConfig(),
  fetchImpl = globalThis.fetch,
  timeoutMs = null,
  maxResponseBytes = MAX_WORKER_RESPONSE_BYTES,
  retries = 1,
  retryDelayMs = 150,
} = {}) {
  const token = config.token;
  const scrub = (text) => {
    const clean = sanitizeReason(text);
    return clean && token ? clean.split(token).join('<redacted>') : clean;
  };

  function outcomeBase(capabilityId, executionId, workerGroup) {
    const fail = (state, error, reason = null, extra = {}) => ({
      ok: false, state, error, reason: scrub(reason), retryable: false, httpStatus: null,
      capabilityId, executionId, workerGroup, ...extra,
    });
    return { fail };
  }

  function validateSuccess(body, { capabilityId, executionId, contract, inputFingerprint, input }) {
    const keys = Object.keys(body);
    if (keys.length !== SUCCESS_KEYS.length || !SUCCESS_KEYS.every((k) => Object.prototype.hasOwnProperty.call(body, k))) return 'ENVELOPE_SHAPE_INVALID';
    if (body.contractVersion !== WORKER_CONTRACT_VERSION) return 'CONTRACT_VERSION_MISMATCH';
    if (body.executionId !== executionId) return 'EXECUTION_ID_MISMATCH';
    if (body.capabilityId !== capabilityId) return 'CAPABILITY_MISMATCH';
    if (body.toolId !== contract.toolId) return 'TOOL_MISMATCH';
    if (body.workerGroup !== contract.workerGroup) return 'WORKER_GROUP_MISMATCH';
    if (body.inputFingerprint !== inputFingerprint) return 'INPUT_FINGERPRINT_MISMATCH';
    const engine = body.engine;
    if (!engine || typeof engine !== 'object' || Object.keys(engine).sort().join(',') !== 'fingerprint,name,toolId,version') return 'ENGINE_IDENTITY_INVALID';
    if (engine.toolId !== contract.toolId || engine.name !== contract.engineName) return 'ENGINE_IDENTITY_MISMATCH';
    if (typeof engine.version !== 'string' || !/^[\x20-\x7E]{1,60}$/.test(engine.version)) return 'ENGINE_VERSION_INVALID';
    if (engine.fingerprint !== null && (typeof engine.fingerprint !== 'string' || !/^[a-f0-9]{16}$/.test(engine.fingerprint))) return 'ENGINE_FINGERPRINT_INVALID';
    if (body.outputFingerprint !== computeOutputFingerprint(body.result)) return 'OUTPUT_HASH_MISMATCH';
    const resultCheck = validateCapabilityResult(capabilityId, body.result, input);
    if (!resultCheck.ok) return 'RESULT_SCHEMA_INVALID';
    const attested = engineVersionFromResult(capabilityId, body.result);
    if (attested !== null && attested !== engine.version) return 'ENGINE_VERSION_INCONSISTENT';
    if (body.environmentFingerprint !== null && (typeof body.environmentFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(body.environmentFingerprint))) return 'ENVIRONMENT_FINGERPRINT_INVALID';
    if (typeof body.durationMs !== 'number' || !Number.isFinite(body.durationMs) || body.durationMs < 0 || body.durationMs > 86_400_000) return 'DURATION_INVALID';
    if (!Array.isArray(body.limitations) || body.limitations.length > 20 || !body.limitations.every((l) => typeof l === 'string' && l.length <= 2000)) return 'LIMITATIONS_INVALID';
    if (typeof body.idempotentReplay !== 'boolean') return 'IDEMPOTENT_REPLAY_INVALID';
    return null;
  }

  function interpret(status, body, ctx, fail, roundTripMs) {
    const at = { httpStatus: status };
    if (status === 200 && body?.ok === true) {
      const problem = validateSuccess(body, ctx);
      if (problem) return fail(DISPATCH_STATE.WORKER_RESPONSE_INVALID, problem, 'The worker response failed contract validation and was discarded.', at);
      return {
        ok: true,
        state: DISPATCH_STATE.REMOTE_EXECUTION,
        capabilityId: ctx.capabilityId,
        executionId: ctx.executionId,
        workerGroup: ctx.contract.workerGroup,
        inputFingerprint: body.inputFingerprint,
        outputFingerprint: body.outputFingerprint,
        engine: { ...body.engine },
        result: body.result,
        environmentFingerprint: body.environmentFingerprint,
        durationMs: body.durationMs,
        roundTripMs,
        limitations: body.limitations.map((l) => scrub(l)),
        idempotentReplay: body.idempotentReplay,
        httpStatus: status,
      };
    }
    if (status === 200 && body?.ok === false) {
      if (!ENGINE_OUTCOME_STATES.has(body.state) || body.executionId !== ctx.executionId || body.capabilityId !== ctx.capabilityId) {
        return fail(DISPATCH_STATE.WORKER_RESPONSE_INVALID, 'ENGINE_OUTCOME_INVALID', 'The worker reported an engine outcome that does not match this request.', at);
      }
      return fail(body.state, sanitizeCode(body.error, 'engine_failed'), body.reason, at);
    }
    const workerError = sanitizeCode(body?.error, null);
    if (status === 400 || status === 413) {
      const errors = Array.isArray(body?.errors) ? body.errors.slice(0, 10).map((e) => scrub(e)) : undefined;
      return fail(DISPATCH_STATE.BLOCKED_INVALID_INPUT, workerError ?? 'WORKER_REJECTED_INPUT', 'The worker rejected the request.', { ...at, ...(errors ? { errors } : {}) });
    }
    if (status === 409) return fail(DISPATCH_STATE.BLOCKED_INVALID_INPUT, 'IDEMPOTENCY_CONFLICT', 'This execution id was already used with a different input.', at);
    if (status === 401 || status === 403) return fail(DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE, 'WORKER_AUTH_REJECTED', 'The worker rejected this service\'s credentials.', at);
    if (status === 404) {
      return workerError === 'CAPABILITY_NOT_IN_WORKER'
        ? fail(DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE, 'CAPABILITY_NOT_IN_WORKER', 'The configured worker does not serve this capability.', at)
        : fail(DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE, 'WORKER_ENDPOINT_NOT_FOUND', 'The configured URL does not expose the execution endpoint.', at);
    }
    if (status === 503 && workerError === 'WORKER_AUTH_NOT_CONFIGURED') {
      return fail(DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE, 'WORKER_AUTH_NOT_CONFIGURED', 'The worker has no execution token configured.', at);
    }
    if (status >= 500 && status <= 599) {
      return fail(DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE, `WORKER_HTTP_${status}`, 'The worker is unavailable.', { ...at, retryable: true });
    }
    return fail(DISPATCH_STATE.WORKER_RESPONSE_INVALID, 'UNEXPECTED_HTTP_STATUS', null, at);
  }

  async function attemptOnce({ endpoint, requestBody, ctx, fail, effectiveTimeout, signal }) {
    const controller = new globalThis.AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, effectiveTimeout);
    const onExternalAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onExternalAbort, { once: true });
    }
    const t0 = Date.now();
    try {
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${token}` },
          body: requestBody,
          signal: controller.signal,
          redirect: 'error',
        });
      } catch (err) {
        if (timedOut) return fail(DISPATCH_STATE.WORKER_TIMEOUT, 'WORKER_TIMEOUT', `No response within ${effectiveTimeout} ms.`);
        if (signal?.aborted) return fail(DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE, 'REQUEST_ABORTED', 'The caller aborted the request.');
        const code = sanitizeCode(err?.cause?.code ?? err?.code, 'NETWORK_ERROR');
        return fail(DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE, 'WORKER_UNREACHABLE', `Connection to the worker failed (${code}).`, { retryable: true });
      }
      let text;
      try {
        text = await readBounded(response, maxResponseBytes);
      } catch (err) {
        if (timedOut) return fail(DISPATCH_STATE.WORKER_TIMEOUT, 'WORKER_TIMEOUT', `No complete response within ${effectiveTimeout} ms.`);
        if (err?.code === 'RESPONSE_TOO_LARGE') {
          return fail(DISPATCH_STATE.WORKER_RESPONSE_INVALID, 'RESPONSE_TOO_LARGE', `The worker response exceeded ${maxResponseBytes} bytes.`, { httpStatus: response.status });
        }
        return fail(DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE, 'WORKER_CONNECTION_LOST', 'The worker connection closed mid-response.', { retryable: true });
      }
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        return fail(DISPATCH_STATE.WORKER_RESPONSE_INVALID, 'RESPONSE_NOT_JSON', null, { httpStatus: response.status });
      }
      return interpret(response.status, body, ctx, fail, Date.now() - t0);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onExternalAbort);
    }
  }

  /**
   * Executes one capability remotely. Never throws for an expected failure;
   * always resolves to `{ ok: true, state: 'REMOTE_EXECUTION', ... }` or
   * `{ ok: false, state, error, reason, retryable, ... }`.
   */
  async function execute({ capabilityId, executionId, input, signal = null } = {}) {
    const contract = getCapabilityContract(capabilityId);
    const workerGroup = contract?.workerGroup ?? null;
    const { fail } = outcomeBase(capabilityId, executionId, workerGroup);
    if (!contract || !WORKER_URL_ENV[workerGroup]) {
      return { ...fail(DISPATCH_STATE.BLOCKED_INVALID_INPUT, 'CAPABILITY_NOT_REMOTE_EXECUTABLE'), attempts: 0 };
    }
    if (typeof executionId !== 'string' || !EXECUTION_ID_RE.test(executionId)) {
      return { ...fail(DISPATCH_STATE.BLOCKED_INVALID_INPUT, 'INVALID_EXECUTION_ID'), attempts: 0 };
    }
    const group = config.groups[workerGroup];
    if (!group?.url) {
      return {
        ...fail(DISPATCH_STATE.BLOCKED_WORKER_NOT_CONFIGURED, group?.error ?? 'WORKER_URL_MISSING', `${WORKER_URL_ENV[workerGroup]} is not set to a usable worker URL.`),
        attempts: 0,
      };
    }
    if (!token) {
      return {
        ...fail(DISPATCH_STATE.BLOCKED_WORKER_NOT_CONFIGURED, config.tokenError ?? 'WORKER_TOKEN_MISSING', `${WORKER_TOKEN_ENV} must be set to at least ${MIN_WORKER_TOKEN_LENGTH} characters.`),
        attempts: 0,
      };
    }
    const validated = validateCapabilityInput(capabilityId, input);
    if (!validated.ok) {
      return { ...fail(DISPATCH_STATE.BLOCKED_INVALID_INPUT, 'INVALID_INPUT', 'The request did not match the capability schema.', { errors: validated.errors }), attempts: 0 };
    }

    const inputFingerprint = computeInputFingerprint(capabilityId, input);
    const requestBody = JSON.stringify({ contractVersion: WORKER_CONTRACT_VERSION, executionId, capabilityId, inputFingerprint, input });
    const endpoint = `${group.url}/capabilities/${capabilityId}/execute`;
    const effectiveTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS[capabilityId] ?? 150_000;
    const ctx = { capabilityId, executionId, contract, inputFingerprint, input };

    let attempts = 0;
    let outcome;
    for (;;) {
      attempts += 1;
      outcome = await attemptOnce({ endpoint, requestBody, ctx, fail, effectiveTimeout, signal });
      // Only transport-level failures are retried, with the SAME execution id and
      // input — the worker's idempotency cache turns a retry of a request that
      // did reach it into a replay of the first result, never a second run.
      if (outcome.ok || !outcome.retryable || attempts > retries) break;
      await delay(retryDelayMs * attempts);
    }
    return { ...outcome, attempts };
  }

  return { execute };
}
