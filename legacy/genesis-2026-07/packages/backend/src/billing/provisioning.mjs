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
import { API_TIERS, createApiKey, updateApiKeyTier, listApiKeysByOwner, upsertBillingCustomer, getBillingCustomer, wasBillingEventProcessed, markBillingEventProcessed } from '../store.mjs';

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

    // Stage 8: klucze są haszowane w spoczynku — identyfikujemy je po WŁAŚCICIELU
    // (jeden klucz na konto), nie po jawnej wartości. `apiKeyHint` to nietajna
    // wskazówka do wyświetlania; surowego klucza NIE przechowujemy w billing.
    const ownerKeys = listApiKeysByOwner(db, ownerEmail);
    // Keys are hashed at rest → the RAW key can only be surfaced when freshly minted
    // (first purchase); on a plan change we keep the same hashed key and can only
    // expose its non-secret hint. `apiKey` (raw) is present only on create.
    let apiKey = null, apiKeyHint;
    if (ownerKeys.length) { updateApiKeyTier(db, ownerKeys[0].key, tier, { now }); apiKeyHint = ownerKeys[0].keyHint; } // reuse → change plan
    else { const fresh = createApiKey(db, { ownerEmail, tier, now }); apiKey = fresh.key; apiKeyHint = fresh.keyHint; } // first purchase → mint

    upsertBillingCustomer(db, {
      ownerEmail, tier, status: 'active', apiKey: apiKeyHint,
      stripeCustomerId: obj.customer, stripeSubscriptionId: obj.subscription, now,
    });
    markBillingEventProcessed(db, eventId, type, now);
    return { status: 'provisioned', action: ownerKeys.length ? 'plan_updated' : 'plan_created', tier, apiKey, apiKeyHint, ownerEmail };
  }

  if (type === 'customer.subscription.deleted') {
    const subId = obj.id;
    const record = obj.metadata?.owner_email
      ? getBillingCustomer(db, obj.metadata.owner_email)
      : db.prepare('SELECT * FROM billing_customers WHERE stripe_subscription_id = ?').get(subId);
    const ownerEmail = record?.ownerEmail ?? record?.owner_email ?? obj.metadata?.owner_email ?? null;
    if (!ownerEmail) { markBillingEventProcessed(db, eventId, type, now); return { status: 'skipped', action: 'unknown_subscription' }; }
    const ownerKeys = listApiKeysByOwner(db, ownerEmail);
    if (ownerKeys.length) updateApiKeyTier(db, ownerKeys[0].key, 'free', { now }); // downgrade by owner (keys are hashed)
    upsertBillingCustomer(db, { ownerEmail, tier: 'free', status: 'canceled', now });
    markBillingEventProcessed(db, eventId, type, now);
    return { status: 'canceled', action: 'plan_downgraded', tier: 'free', ownerEmail };
  }

  markBillingEventProcessed(db, eventId, type, now);
  return { status: 'ignored', action: 'unhandled_event_type', type };
}
