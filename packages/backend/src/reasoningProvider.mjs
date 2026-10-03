/* global AbortSignal */
/**
 * ENTITY-3 — THE ONE BACKEND ADAPTER TO AN EXTERNAL REASONING MODEL.
 *
 * It sits behind the canonical `frontend/src/core/experimentFabric/modelRouter.ts`: the router picks a
 * provider and records the routing decision; this module is what actually talks to the provider, on the
 * server, so the API key never leaves the backend (it is read from the environment, never returned, never
 * logged, never in the repository).
 *
 * Provider-agnostic on purpose: one small `complete({ system, prompt, timeoutMs })` contract returning
 * plain text. Nothing here interprets that text as science; `claimProposal.mjs` validates it and the
 * knowledge registry stores it as PROPOSED only. Swapping the provider changes transport, never semantics.
 *
 * Configuration (backend environment only):
 *   GENESIS_REASONING_PROVIDER  anthropic | openai | local   (default: anthropic when ANTHROPIC_API_KEY is set)
 *   anthropic: ANTHROPIC_API_KEY, model GENESIS_REASONING_MODEL ?? GENESIS_AI_MODEL ?? 'claude-opus-4-8'
 *   openai / local (OpenAI-compatible chat completions): GENESIS_REASONING_BASE_URL, GENESIS_REASONING_MODEL,
 *     GENESIS_REASONING_API_KEY (optional for local)
 * Without a working configuration the provider reports BLOCKED_BY_PROVIDER_CONFIGURATION and never calls out.
 */
// The SDK is loaded on first use, not at import: api.mjs imports this module, and jobs that run the router without
// installing the backend's npm dependencies (the PySCF benchmark) must not fail on a provider they never call.
let sdkModule = null;
const loadAnthropic = async () => (sdkModule ??= await import('@anthropic-ai/sdk')).default;
/** The SDK's timeout and abort errors; matched by class name so no SDK import is needed to recognise them. */
const isTimeout = (err) => ['APIConnectionTimeoutError', 'APIUserAbortError'].includes(err?.constructor?.name);

export const REASONING_ADAPTER_VERSION = 'entity3-reasoning-adapter@1';
export const DEFAULT_REASONING_TIMEOUT_MS = 60_000;
const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-4-8';

/** Transport failures, named. The message never carries configuration or the key. */
export class ReasoningProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReasoningProviderError';
    this.code = code; // NOT_CONFIGURED | TIMEOUT | REFUSED | UPSTREAM
  }
}

function blocked(reason, providerId = null) {
  return {
    providerId,
    model: null,
    configured: false,
    reason,
    describe() { return { providerId, model: null, configured: false, status: 'BLOCKED_BY_PROVIDER_CONFIGURATION', reason }; },
    async complete() { throw new ReasoningProviderError('NOT_CONFIGURED', 'Reasoning provider is not configured.'); },
  };
}

function describeOf(providerId, model) {
  return () => ({ providerId, model, configured: true, status: 'CONFIGURED', reason: null });
}

function anthropicProvider(env, AnthropicCtor) {
  if (!env.ANTHROPIC_API_KEY) return blocked('ANTHROPIC_KEY_MISSING', 'ANTHROPIC_CLAUDE');
  const model = env.GENESIS_REASONING_MODEL || env.GENESIS_AI_MODEL || DEFAULT_ANTHROPIC_MODEL;
  let client = null;
  return {
    providerId: 'ANTHROPIC_CLAUDE',
    model,
    configured: true,
    reason: null,
    describe: describeOf('ANTHROPIC_CLAUDE', model),
    async complete({ system, prompt, timeoutMs = DEFAULT_REASONING_TIMEOUT_MS }) {
      let response;
      try {
        client ??= new (AnthropicCtor ?? await loadAnthropic())({ apiKey: env.ANTHROPIC_API_KEY });
        response = await client.messages.create(
          { model, max_tokens: 4096, system, messages: [{ role: 'user', content: prompt }] },
          { timeout: timeoutMs, maxRetries: 0 },
        );
      } catch (err) {
        if (isTimeout(err)) throw new ReasoningProviderError('TIMEOUT', 'Reasoning provider timed out.');
        throw new ReasoningProviderError('UPSTREAM', `Reasoning provider failed (status ${err?.status ?? 'none'}).`);
      }
      if (response?.stop_reason === 'refusal') throw new ReasoningProviderError('REFUSED', 'Reasoning provider declined the request.');
      const text = (Array.isArray(response?.content) ? response.content : []).filter((b) => b?.type === 'text').map((b) => b.text).join('');
      return { text, model: response?.model ?? model };
    },
  };
}

function openAiCompatibleProvider(env, kind, fetchImpl) {
  const providerId = kind === 'local' ? 'PRIVATE_LOCAL' : 'OPENAI_ASTRA';
  const base = env.GENESIS_REASONING_BASE_URL;
  const model = env.GENESIS_REASONING_MODEL;
  const key = env.GENESIS_REASONING_API_KEY;
  if (!base || !model) return blocked('BASE_URL_OR_MODEL_MISSING', providerId);
  if (kind === 'openai' && !key) return blocked('API_KEY_MISSING', providerId);
  const url = `${base.replace(/\/+$/, '')}/chat/completions`;
  return {
    providerId,
    model,
    configured: true,
    reason: null,
    describe: describeOf(providerId, model),
    async complete({ system, prompt, timeoutMs = DEFAULT_REASONING_TIMEOUT_MS }) {
      let res;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
          body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new ReasoningProviderError('TIMEOUT', 'Reasoning provider timed out.');
        throw new ReasoningProviderError('UPSTREAM', 'Reasoning provider unreachable.');
      }
      if (!res.ok) throw new ReasoningProviderError('UPSTREAM', `Reasoning provider failed (status ${res.status}).`);
      let body;
      try { body = await res.json(); } catch { throw new ReasoningProviderError('UPSTREAM', 'Reasoning provider returned a non-JSON body.'); }
      const text = body?.choices?.[0]?.message?.content;
      return { text: typeof text === 'string' ? text : '', model: typeof body?.model === 'string' ? body.model : model };
    },
  };
}

/** Builds the configured provider from the backend environment. Injectable for tests; never reads the frontend. */
export function createReasoningProvider(env = process.env, { AnthropicCtor = null, fetchImpl = globalThis.fetch } = {}) {
  const kind = (env.GENESIS_REASONING_PROVIDER || (env.ANTHROPIC_API_KEY ? 'anthropic' : '')).toLowerCase();
  if (!kind) return blocked('NO_PROVIDER_CONFIGURED');
  if (kind === 'anthropic') return anthropicProvider(env, AnthropicCtor);
  if (kind === 'openai' || kind === 'local') return openAiCompatibleProvider(env, kind, fetchImpl);
  return blocked('UNKNOWN_PROVIDER');
}
