/**
 * Stripe boundary — the ONLY module that talks to Stripe. Two operations:
 *   1. createCheckoutSession() — outbound POST to api.stripe.com (a hosted payment
 *      page). The HTTP call is INJECTABLE (`fetchImpl`) so tests never hit the
 *      network and production swaps in real `fetch`.
 *   2. verifyWebhookSignature() — validates the `Stripe-Signature` header over the
 *      RAW request body using Stripe's documented HMAC-SHA256 scheme (node:crypto,
 *      constant-time compare, timestamp tolerance). No SDK, no network.
 *
 * WHY REST + node:crypto (not the stripe SDK): matches this repo's zero-/minimal-
 * dependency, injectable, offline-testable architecture (node:sqlite/crypto/test).
 * The Stripe wire formats used here (form-encoded Checkout create + the signature
 * scheme) are stable, documented contracts.
 *
 * ENVIRONMENT NOTE: this sandbox's egress to api.stripe.com is policy-blocked and it
 * has no public URL, so a LIVE end-to-end run is impossible here. The code is
 * production-ready; every path is covered offline with an injected fetch + real HMAC.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const STRIPE_API = 'https://api.stripe.com';

/** Flatten nested params into Stripe's bracketed x-www-form-urlencoded format. */
function encodeForm(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object' && !Array.isArray(v)) encodeForm(v, key, out);
    else if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? encodeForm(item, `${key}[${i}]`, out) : out.push([`${key}[${i}]`, String(item)])));
    else out.push([key, String(v)]);
  }
  return out.map(([k, val]) => `${encodeURIComponent(k)}=${encodeURIComponent(val)}`).join('&');
}

/**
 * Create a Stripe Checkout Session (subscription mode). Returns { id, url }.
 * `tier` travels in metadata so the webhook can provision the right plan without a
 * price→tier lookup. Throws on a non-2xx Stripe response (caller maps to HTTP).
 */
export async function createCheckoutSession({ tier, priceId, customerEmail, clientReferenceId, successUrl, cancelUrl }, { fetchImpl = fetch, secretKey } = {}) {
  if (!secretKey) throw new Error('stripe_not_configured');
  const body = encodeForm({
    mode: 'subscription',
    'line_items': [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: customerEmail,
    client_reference_id: clientReferenceId,
    metadata: { tier },
    subscription_data: { metadata: { tier } },
  });
  const res = await fetchImpl(`${STRIPE_API}/v1/checkout/sessions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data?.error?.message ?? 'stripe_error'); e.status = res.status; e.stripe = data?.error; throw e; }
  return { id: data.id, url: data.url };
}

/** Parse a `Stripe-Signature` header into { t, v1: [...] }. */
export function parseSignatureHeader(header) {
  const out = { t: null, v1: [] };
  for (const part of String(header ?? '').split(',')) {
    const [k, v] = part.split('=');
    if (k === 't') out.t = Number(v);
    else if (k === 'v1' && v) out.v1.push(v);
  }
  return out;
}

/**
 * Verify a Stripe webhook signature over the RAW body (Stripe's scheme:
 * HMAC-SHA256 of `${t}.${rawBody}`, constant-time compared to a v1 signature,
 * within a timestamp tolerance). Returns { ok:true, event } or { ok:false, reason }.
 */
export function verifyWebhookSignature(rawBody, sigHeader, secret, { toleranceSec = 300, now = Date.now() } = {}) {
  if (!secret) return { ok: false, reason: 'no_webhook_secret' };
  if (typeof rawBody !== 'string' || rawBody === '') return { ok: false, reason: 'empty_body' };
  const { t, v1 } = parseSignatureHeader(sigHeader);
  if (!t || v1.length === 0) return { ok: false, reason: 'malformed_signature_header' };
  if (Math.abs(Math.floor(now / 1000) - t) > toleranceSec) return { ok: false, reason: 'timestamp_out_of_tolerance' };
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex');
  const expBuf = Buffer.from(expected, 'utf8');
  const matches = v1.some((sig) => { const b = Buffer.from(sig, 'utf8'); return b.length === expBuf.length && timingSafeEqual(b, expBuf); });
  if (!matches) return { ok: false, reason: 'signature_mismatch' };
  let event;
  try { event = JSON.parse(rawBody); } catch { return { ok: false, reason: 'invalid_json' }; }
  return { ok: true, event };
}

/** Test/util: compute a valid Stripe-Signature header for a raw payload. */
export function signPayload(rawBody, secret, t = Math.floor(Date.now() / 1000)) {
  const sig = createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex');
  return `t=${t},v1=${sig}`;
}
