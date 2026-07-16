/**
 * Provisioning — turns a VERIFIED Stripe event into account state: create/update the
 * user's plan and issue/adjust their API key at the right tier. Pure over the DB and
 * fully idempotent (Stripe retries webhooks): each event id is processed once.
 *
 * Reuses existing store logic — createApiKey / updateApiKeyTier / upsertBillingCustomer
 * / API_TIERS — so there is no duplicated key or tier logic here.
 *
 * Handled events:
 *   checkout.session.completed      → activate plan, provision (or upgrade) the key.
 *   customer.subscription.deleted   → cancel plan, downgrade the key to free.
 * Anything else → ignored (acknowledged, not an error).
 */
import { API_TIERS, createApiKey, updateApiKeyTier, getApiKey, upsertBillingCustomer, getBillingCustomer, wasBillingEventProcessed, markBillingEventProcessed } from '../store.mjs';

/** A paid tier the billing layer may assign (never provisions 'free' as a purchase). */
export function isPaidTier(tier) { return tier === 'starter' || tier === 'pro'; }

/** Resolve the tier for an event: metadata.tier first, else a price→tier map. */
export function resolveTier(obj, priceMap = {}) {
  const metaTier = obj?.metadata?.tier;
  if (metaTier && API_TIERS[metaTier] !== undefined) return metaTier;
  const priceId = obj?.items?.data?.[0]?.price?.id ?? obj?.price?.id ?? obj?.plan?.id;
  if (priceId && priceMap[priceId]) return priceMap[priceId];
  return null;
}

const emailOf = (obj) => obj?.customer_details?.email ?? obj?.customer_email ?? obj?.metadata?.owner_email ?? null;

/**
 * Provision from a verified event. Returns a structured result — never throws for
 * expected cases. `{ status, action, tier?, apiKey?, ownerEmail? }`.
 */
export function provisionFromEvent(db, event, { priceMap = {}, now = Date.now() } = {}) {
  const eventId = event?.id;
  const type = event?.type;
  if (!eventId || !type) return { status: 'ignored', action: 'no_event' };
  if (wasBillingEventProcessed(db, eventId)) return { status: 'duplicate', action: 'already_processed' };

  const obj = event?.data?.object ?? {};

  if (type === 'checkout.session.completed') {
    const ownerEmail = emailOf(obj);
    const tier = resolveTier(obj, priceMap);
    if (!ownerEmail) { markBillingEventProcessed(db, eventId, type, now); return { status: 'skipped', action: 'no_email' }; }
    if (!isPaidTier(tier)) { markBillingEventProcessed(db, eventId, type, now); return { status: 'skipped', action: 'no_paid_tier' }; }

    const existing = getBillingCustomer(db, ownerEmail);
    let apiKey = existing?.apiKey && getApiKey(db, existing.apiKey) ? existing.apiKey : null;
    if (apiKey) updateApiKeyTier(db, apiKey, tier, { now });         // reuse existing key → change plan
    else apiKey = createApiKey(db, { ownerEmail, tier, now }).key;   // first purchase → mint a key

    upsertBillingCustomer(db, {
      ownerEmail, tier, status: 'active', apiKey,
      stripeCustomerId: obj.customer, stripeSubscriptionId: obj.subscription, now,
    });
    markBillingEventProcessed(db, eventId, type, now);
    return { status: 'provisioned', action: existing?.apiKey ? 'plan_updated' : 'plan_created', tier, apiKey, ownerEmail };
  }

  if (type === 'customer.subscription.deleted') {
    const subId = obj.id;
    const record = obj.metadata?.owner_email
      ? getBillingCustomer(db, obj.metadata.owner_email)
      : db.prepare('SELECT * FROM billing_customers WHERE stripe_subscription_id = ?').get(subId);
    const ownerEmail = record?.ownerEmail ?? record?.owner_email ?? obj.metadata?.owner_email ?? null;
    if (!ownerEmail) { markBillingEventProcessed(db, eventId, type, now); return { status: 'skipped', action: 'unknown_subscription' }; }
    const cust = getBillingCustomer(db, ownerEmail);
    if (cust?.apiKey && getApiKey(db, cust.apiKey)) updateApiKeyTier(db, cust.apiKey, 'free', { now });
    upsertBillingCustomer(db, { ownerEmail, tier: 'free', status: 'canceled', now });
    markBillingEventProcessed(db, eventId, type, now);
    return { status: 'canceled', action: 'plan_downgraded', tier: 'free', ownerEmail };
  }

  markBillingEventProcessed(db, eventId, type, now);
  return { status: 'ignored', action: 'unhandled_event_type', type };
}
