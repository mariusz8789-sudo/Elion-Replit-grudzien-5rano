import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, createSession, getBillingCustomer, getApiKey, API_TIERS } from './store.mjs';
import { hashPassword, generateToken } from './auth.mjs';
import { verifyWebhookSignature, signPayload, createCheckoutSession, parseSignatureHeader } from './billing/stripe.mjs';
import { provisionFromEvent } from './billing/provisioning.mjs';
import { handleCheckout, handleWebhook, billingConfig, priceMapOf, billingConfigured } from './billing/handler.mjs';

/**
 * Stripe billing — Etap 1 (Checkout → webhook → auto create/update plan → auto API
 * key → tier). All offline: a real DB, a REAL HMAC signature (signPayload), and an
 * INJECTED Stripe HTTP boundary (no network — the sandbox blocks api.stripe.com).
 * Covers signature verification, idempotent provisioning, tier assignment, and the
 * checkout + webhook HTTP handlers.
 */
const WHSEC = 'whsec_test_123';
const CONFIG = { secretKey: 'sk_test_x', webhookSecret: WHSEC, prices: { starter: 'price_starter', pro: 'price_pro' }, successUrl: 'https://ok', cancelUrl: 'https://cancel' };

let db;
beforeEach(() => { db = openDatabase(); });

function seedUser(email = 'buyer@lab.io') {
  const user = createUser(db, { email, displayName: 'Buyer', passwordHash: hashPassword('pw123456') });
  const token = generateToken();
  createSession(db, { userId: user.id, token, ttlMs: 1e9 }); // Stage 8: stores the hashed token
  return { user, token };
}
function checkoutEvent({ id = 'evt_1', email = 'buyer@lab.io', tier = 'pro', customer = 'cus_1', subscription = 'sub_1' } = {}) {
  return { id, type: 'checkout.session.completed', data: { object: { customer_details: { email }, customer, subscription, metadata: { tier } } } };
}

describe('stripe.mjs — webhook signature verification (node:crypto)', () => {
  const payload = JSON.stringify(checkoutEvent());
  test('a correctly signed payload verifies and returns the parsed event', () => {
    const r = verifyWebhookSignature(payload, signPayload(payload, WHSEC), WHSEC);
    assert.equal(r.ok, true);
    assert.equal(r.event.type, 'checkout.session.completed');
  });
  test('tampered payload → signature_mismatch', () => {
    const sig = signPayload(payload, WHSEC);
    const r = verifyWebhookSignature(payload + ' ', sig, WHSEC);
    assert.equal(r.ok, false); assert.equal(r.reason, 'signature_mismatch');
  });
  test('wrong secret → signature_mismatch', () => {
    const r = verifyWebhookSignature(payload, signPayload(payload, WHSEC), 'whsec_other');
    assert.equal(r.ok, false);
  });
  test('missing header → malformed_signature_header', () => {
    assert.equal(verifyWebhookSignature(payload, '', WHSEC).reason, 'malformed_signature_header');
  });
  test('stale timestamp → timestamp_out_of_tolerance', () => {
    const oldT = Math.floor(Date.now() / 1000) - 10_000;
    const r = verifyWebhookSignature(payload, signPayload(payload, WHSEC, oldT), WHSEC);
    assert.equal(r.reason, 'timestamp_out_of_tolerance');
  });
  test('empty body / no secret handled', () => {
    assert.equal(verifyWebhookSignature('', 'x', WHSEC).reason, 'empty_body');
    assert.equal(verifyWebhookSignature(payload, 'x', '').reason, 'no_webhook_secret');
  });
  test('parseSignatureHeader extracts t and v1', () => {
    const p = parseSignatureHeader('t=123,v1=abc,v0=zzz');
    assert.equal(p.t, 123); assert.deepEqual(p.v1, ['abc']);
  });
});

describe('stripe.mjs — createCheckoutSession (injected fetch, no network)', () => {
  test('posts to Stripe and returns { id, url }', async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ id: 'cs_1', url: 'https://checkout/pay' }) }; };
    const s = await createCheckoutSession({ tier: 'pro', priceId: 'price_pro', customerEmail: 'b@l.io', clientReferenceId: 'u1', successUrl: 'https://ok', cancelUrl: 'https://c' }, { fetchImpl, secretKey: 'sk_test_x' });
    assert.deepEqual(s, { id: 'cs_1', url: 'https://checkout/pay' });
    assert.match(calls[0].url, /\/v1\/checkout\/sessions$/);
    assert.match(calls[0].opts.body, /metadata%5Btier%5D=pro/);
    assert.match(calls[0].opts.headers.authorization, /^Bearer sk_test_x/);
  });
  test('non-2xx Stripe response throws with status', async () => {
    const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'bad price' } }) });
    await assert.rejects(() => createCheckoutSession({ tier: 'pro', priceId: 'x' }, { fetchImpl, secretKey: 'sk' }), /bad price/);
  });
  test('missing secret key throws stripe_not_configured', async () => {
    await assert.rejects(() => createCheckoutSession({ tier: 'pro' }, {}), /stripe_not_configured/);
  });
});

describe('provisioning — checkout.session.completed', () => {
  test('first purchase → creates plan + mints a key at the paid tier', () => {
    const r = provisionFromEvent(db, checkoutEvent({ tier: 'pro' }), { now: 1000 });
    assert.equal(r.status, 'provisioned');
    assert.equal(r.action, 'plan_created');
    assert.equal(r.tier, 'pro');
    const key = getApiKey(db, r.apiKey);
    assert.equal(key.tier, 'pro');
    assert.equal(key.monthlyLimit, API_TIERS.pro); // 100000
    const cust = getBillingCustomer(db, 'buyer@lab.io');
    assert.equal(cust.status, 'active');
    // Stage 8: keys are hashed at rest — billing stores the non-secret hint, not the raw key.
    assert.equal(cust.apiKey, r.apiKeyHint);
    assert.equal(cust.stripeSubscriptionId, 'sub_1');
  });
  test('starter tier assigns the starter limit', () => {
    const r = provisionFromEvent(db, checkoutEvent({ tier: 'starter' }), {});
    assert.equal(getApiKey(db, r.apiKey).monthlyLimit, API_TIERS.starter); // 10000
  });
  test('duplicate event id → idempotent (no second key)', () => {
    const ev = checkoutEvent({ id: 'evt_dup' });
    provisionFromEvent(db, ev, {}); // first delivery provisions
    const second = provisionFromEvent(db, ev, {}); // duplicate delivery
    assert.equal(second.status, 'duplicate');
    const keys = db.prepare('SELECT COUNT(*) c FROM api_keys WHERE owner_email = ?').get('buyer@lab.io');
    assert.equal(keys.c, 1);
  });
  test('plan change (new event, different tier, same email) → updates existing key, no new key', () => {
    const k1 = provisionFromEvent(db, checkoutEvent({ id: 'e1', tier: 'starter' }), {}).apiKey; // raw, minted once
    const r2 = provisionFromEvent(db, checkoutEvent({ id: 'e2', tier: 'pro' }), {});
    assert.equal(r2.action, 'plan_updated');
    assert.equal(r2.apiKey, null); // Stage 8: raw key NOT re-derivable on a plan change (hashed)
    assert.equal(getApiKey(db, k1).tier, 'pro'); // the original raw key still authenticates, now at the new tier
    assert.equal(db.prepare('SELECT COUNT(*) c FROM api_keys WHERE owner_email = ?').get('buyer@lab.io').c, 1);
  });
  test('no email → skipped, no key minted', () => {
    const ev = { id: 'e_noemail', type: 'checkout.session.completed', data: { object: { metadata: { tier: 'pro' } } } };
    assert.equal(provisionFromEvent(db, ev, {}).status, 'skipped');
  });
  test('no paid tier → skipped (never provisions "free" as a purchase)', () => {
    const ev = { id: 'e_notier', type: 'checkout.session.completed', data: { object: { customer_details: { email: 'x@y.io' } } } };
    assert.equal(provisionFromEvent(db, ev, {}).action, 'no_paid_tier');
  });
  test('tier resolvable from a price→tier map when metadata is absent', () => {
    const ev = { id: 'e_price', type: 'checkout.session.completed', data: { object: { customer_details: { email: 'z@l.io' }, price: { id: 'price_pro' } } } };
    const r = provisionFromEvent(db, ev, { priceMap: { price_pro: 'pro' } });
    assert.equal(r.tier, 'pro');
  });
});

describe('provisioning — customer.subscription.deleted', () => {
  test('cancellation downgrades the key to free and marks status canceled', () => {
    const prov = provisionFromEvent(db, checkoutEvent({ tier: 'pro', subscription: 'sub_x' }), {});
    const ev = { id: 'evt_del', type: 'customer.subscription.deleted', data: { object: { id: 'sub_x' } } };
    const r = provisionFromEvent(db, ev, {});
    assert.equal(r.status, 'canceled');
    assert.equal(getApiKey(db, prov.apiKey).tier, 'free');
    assert.equal(getApiKey(db, prov.apiKey).monthlyLimit, API_TIERS.free);
    assert.equal(getBillingCustomer(db, 'buyer@lab.io').status, 'canceled');
  });
  test('unknown subscription → skipped', () => {
    const ev = { id: 'evt_del2', type: 'customer.subscription.deleted', data: { object: { id: 'sub_unknown' } } };
    assert.equal(provisionFromEvent(db, ev, {}).action, 'unknown_subscription');
  });
});

describe('provisioning — unhandled events acknowledged, not errored', () => {
  test('unrelated event type → ignored', () => {
    const r = provisionFromEvent(db, { id: 'e_x', type: 'invoice.paid', data: { object: {} } }, {});
    assert.equal(r.status, 'ignored');
  });
});

describe('handler — handleCheckout', () => {
  test('not configured → 503', async () => {
    const r = await handleCheckout(db, { config: { ...CONFIG, secretKey: '' } });
    assert.equal(r.status, 503); assert.equal(r.body.error, 'billing_not_configured');
  });
  test('no auth token → 401', async () => {
    const r = await handleCheckout(db, { token: null, body: { tier: 'pro' }, config: CONFIG });
    assert.equal(r.status, 401);
  });
  test('invalid tier → 400', async () => {
    const { token } = seedUser();
    const r = await handleCheckout(db, { token, body: { tier: 'free' }, config: CONFIG });
    assert.equal(r.status, 400); assert.equal(r.body.error, 'invalid_tier');
  });
  test('valid → 200 with a checkout url (injected create)', async () => {
    const { token, user } = seedUser();
    const deps = { createCheckoutSession: async (args, opts) => { assert.equal(args.customerEmail, user.email); assert.equal(opts.secretKey, CONFIG.secretKey); return { id: 'cs_9', url: 'https://checkout/9' }; } };
    const r = await handleCheckout(db, { token, body: { tier: 'pro' }, config: CONFIG, deps });
    assert.equal(r.status, 200); assert.equal(r.body.url, 'https://checkout/9'); assert.equal(r.body.tier, 'pro');
  });
  test('Stripe failure → 502', async () => {
    const { token } = seedUser();
    const deps = { createCheckoutSession: async () => { throw new Error('stripe down'); } };
    const r = await handleCheckout(db, { token, body: { tier: 'starter' }, config: CONFIG, deps });
    assert.equal(r.status, 502);
  });
});

describe('handler — handleWebhook', () => {
  test('not configured → 503', () => {
    assert.equal(handleWebhook(db, { rawBody: '{}', config: { ...CONFIG, webhookSecret: '' } }).status, 503);
  });
  test('bad signature → 400, nothing provisioned', () => {
    const raw = JSON.stringify(checkoutEvent());
    const r = handleWebhook(db, { rawBody: raw, sigHeader: 't=1,v1=deadbeef', config: CONFIG });
    assert.equal(r.status, 400); assert.equal(r.body.error, 'invalid_signature');
    assert.equal(getBillingCustomer(db, 'buyer@lab.io'), null);
  });
  test('valid signed webhook → 200 and the plan + key are provisioned', () => {
    const raw = JSON.stringify(checkoutEvent({ id: 'evt_hook', tier: 'pro' }));
    const r = handleWebhook(db, { rawBody: raw, sigHeader: signPayload(raw, WHSEC), config: CONFIG });
    assert.equal(r.status, 200);
    assert.equal(r.body.result.status, 'provisioned');
    assert.equal(getBillingCustomer(db, 'buyer@lab.io').tier, 'pro');
    assert.equal(getApiKey(db, r.body.result.apiKey).tier, 'pro');
  });
});

describe('handler — config helpers', () => {
  test('billingConfig reads env; priceMapOf reverses; billingConfigured', () => {
    const c = billingConfig({ STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: 'wh', STRIPE_PRICE_STARTER: 'ps', STRIPE_PRICE_PRO: 'pp' });
    assert.equal(billingConfigured(c), true);
    assert.deepEqual(priceMapOf(c), { ps: 'starter', pp: 'pro' });
    assert.equal(billingConfigured(billingConfig({})), false);
  });
});
