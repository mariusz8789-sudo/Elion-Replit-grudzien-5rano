/**
 * Billing HTTP handlers — the glue server.mjs calls. Two endpoints:
 *   POST /api/billing/checkout  (auth) → create a Stripe Checkout Session, return its url.
 *   POST /api/billing/webhook   (raw)  → verify signature, provision the plan + key.
 *
 * Config is read from env (billingConfig) but injectable for tests; the Stripe
 * boundary (createCheckoutSession / verifyWebhookSignature) is injectable too, so
 * every path is exercised offline with no network and a real HMAC signature.
 * Returns { status, body } — server.mjs handles the socket. Reuses getUserByToken.
 */
import { getUserByToken } from '../store.mjs';
import { createCheckoutSession, verifyWebhookSignature } from './stripe.mjs';
import { provisionFromEvent } from './provisioning.mjs';

/** Build the billing config from env (injectable for tests). */
export function billingConfig(env = process.env) {
  return {
    secretKey: env.STRIPE_SECRET_KEY || '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    prices: { starter: env.STRIPE_PRICE_STARTER || '', pro: env.STRIPE_PRICE_PRO || '' },
    successUrl: env.BILLING_SUCCESS_URL || 'https://genesis.example/billing/success',
    cancelUrl: env.BILLING_CANCEL_URL || 'https://genesis.example/billing/cancel',
  };
}
/** Reverse map priceId → tier, for webhook subscription events. */
export function priceMapOf(config) {
  const m = {};
  if (config.prices.starter) m[config.prices.starter] = 'starter';
  if (config.prices.pro) m[config.prices.pro] = 'pro';
  return m;
}
export function billingConfigured(config) { return Boolean(config.secretKey && config.webhookSecret); }

const ok = (body) => ({ status: 200, body });
const err = (status, error, message) => ({ status, body: { error, ...(message ? { message } : {}) } });

/**
 * Create a Checkout Session for the logged-in user's chosen paid tier.
 * `deps.createCheckoutSession` is injectable (tests pass a fake; no network).
 */
export async function handleCheckout(db, { token, body = {}, config = billingConfig(), deps = {} } = {}) {
  if (!config.secretKey) return err(503, 'billing_not_configured', 'Płatności nie są skonfigurowane w tym wdrożeniu.');
  const user = getUserByToken(db, token);
  if (!user) return err(401, 'unauthorized', 'Zaloguj się, aby wykupić plan.');
  const tier = body.tier;
  if (tier !== 'starter' && tier !== 'pro') return err(400, 'invalid_tier', 'Dozwolone plany: starter, pro.');
  const priceId = config.prices[tier];
  if (!priceId) return err(503, 'price_not_configured', `Brak konfiguracji ceny dla planu "${tier}".`);
  try {
    const create = deps.createCheckoutSession ?? createCheckoutSession;
    const session = await create(
      { tier, priceId, customerEmail: user.email, clientReferenceId: user.id, successUrl: config.successUrl, cancelUrl: config.cancelUrl },
      { secretKey: config.secretKey, fetchImpl: deps.fetchImpl },
    );
    return ok({ url: session.url, sessionId: session.id, tier });
  } catch (e) {
    return err(502, 'stripe_error', String(e?.message ?? 'stripe_error').slice(0, 160));
  }
}

/**
 * Handle a raw Stripe webhook: verify the signature over the RAW body, then provision.
 * `deps.verify` is injectable for tests. Never provisions on an unverified payload.
 */
export function handleWebhook(db, { rawBody, sigHeader, config = billingConfig(), deps = {}, now = Date.now() } = {}) {
  if (!config.webhookSecret) return err(503, 'billing_not_configured', 'Webhook nie jest skonfigurowany.');
  const verify = deps.verify ?? verifyWebhookSignature;
  const v = verify(rawBody, sigHeader, config.webhookSecret, { now });
  if (!v.ok) return err(400, 'invalid_signature', v.reason);
  const result = provisionFromEvent(db, v.event, { priceMap: priceMapOf(config), now });
  return ok({ received: true, result });
}
