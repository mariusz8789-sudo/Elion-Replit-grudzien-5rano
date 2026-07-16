/**
 * AI-chat ↔ Grounding Layer integration glue.
 *
 * A thin, REVERSIBLE adapter: it applies the (already-built, tested) Grounding
 * Layer to a model answer ONLY when `GROUNDING_ENABLED=true`. Default / anything
 * else → identical pass-through, so the existing /api/ask behaviour is byte-for-byte
 * unchanged. Kept as its own module (not inline in server.mjs) so the decision is
 * unit-testable end-to-end without booting the HTTP server or the Anthropic client.
 *
 * Contract preserved: this only ever transforms the ANSWER TEXT (redaction markers
 * live inside the text). It adds no response fields and never touches computed_by /
 * BLOCKED_BY_RUNTIME / engine_unavailable / error codes.
 */
import { groundAnswer } from './cognitive/groundingLayer.mjs';

/** The single feature flag. Read from env (default OFF). Injectable for tests. */
export function groundingEnabled(env = process.env) {
  return env.GROUNDING_ENABLED === 'true';
}

/**
 * Apply grounding to a chat answer if enabled. Returns the (possibly redacted/
 * blocked) answer text plus a small audit. When disabled the returned `text` is
 * strictly identical to the input.
 *
 * @param {string} answerText  the model's answer
 * @param {object} [opts]
 * @param {boolean} [opts.enabled]     override the env flag (tests)
 * @param {string|null} [opts.activeSmiles]  context molecule for prose numbers
 * @param {Function} [opts.compute]    compute-on-demand (defaults to real RDKit inside groundAnswer)
 * @param {'redact'|'block'|'annotate'} [opts.policy]
 */
export function groundChatAnswer(answerText, opts = {}) {
  const { enabled = groundingEnabled(), activeSmiles = null, compute, policy = 'redact' } = opts;
  if (!enabled) return { text: answerText, grounded: false, status: 'disabled' };
  const r = groundAnswer(answerText, { enabled: true, activeSmiles, compute, policy });
  return { text: r.text, grounded: true, status: r.status, verifications: r.verifications };
}
