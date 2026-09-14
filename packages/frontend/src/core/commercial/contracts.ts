/**
 * COMMERCIAL LAYER — contracts (docs/DECISIONS.md D-057, "DOBUDOWANIE
 * RESZTY MASZYNY" pass, item B).
 *
 * WHAT THIS IS. Bookkeeping for a real engagement's legal lifecycle
 * (Tenant, Engagement, an append-only ledger, a license fingerprint) — NOT
 * a payment processor and NOT a claim that any of this repo's science is
 * for sale today. There is no Stripe adapter, no concrete `PaymentAdapter`
 * shipped here, and no code path that marks an engagement `PAID` without a
 * real adapter confirming a real payment. A fake or omitted adapter fails
 * closed (`ledger.ts::CommercialLedger.transition`), every time.
 *
 * SCIENCE STAYS UPSTREAM OF THIS. Nothing in this module or its future
 * callers may read a `Tenant`, `Engagement`, or `LedgerEntry` field into
 * `core/agent/*` ranking, adjudication, or evidence-minimum logic — the
 * separation this repo's own architecture already enforces between
 * Government RESEARCH (unconstrained) and Government ACTION (authorised)
 * extends here: a paying tenant gets no scientific advantage, and an unpaid
 * one gets no scientific penalty.
 */

export interface Tenant {
  readonly tenantId: string;
  readonly name: string;
  readonly createdAt: number;
}

export type EngagementStatus =
  | 'QUOTED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'DELIVERED'
  | 'AWAITING_PAYMENT'
  | 'PAID'
  | 'DISPUTED';

export interface Engagement {
  readonly engagementId: string;
  readonly tenantId: string;
  readonly vertical: string;
  readonly status: EngagementStatus;
  readonly createdAt: number;
  /** Set only once status reaches PAID (see `issueLicense`). Never backdated. */
  readonly licenseFingerprint: string | null;
}

export type LedgerEvent = 'ENGAGEMENT_OPENED' | 'STATUS_TRANSITION' | 'PAYMENT_CONFIRMED' | 'LICENSE_ISSUED';

/** One append-only entry. Prior entries for an engagement are never edited or removed. */
export interface LedgerEntry {
  readonly entryId: string;
  readonly engagementId: string;
  readonly tenantId: string;
  readonly event: LedgerEvent;
  readonly fromStatus: EngagementStatus | null;
  readonly toStatus: EngagementStatus | null;
  readonly note: string;
  readonly recordedAt: number;
  readonly fingerprint: string;
}

export interface PaymentConfirmation {
  readonly confirmed: boolean;
  readonly reference: string;
}

/**
 * The only door to a real payment. No implementation of this ships in the
 * repo (no Stripe, no anything) — `transition(... 'PAID')` without one
 * throws `NO_PAYMENT_ADAPTER`, and `confirmed !== true` throws
 * `PAYMENT_NOT_CONFIRMED`. There is no default that makes PAID reachable
 * without a real, positively-confirming adapter.
 */
export interface PaymentAdapter {
  confirmPayment(engagementId: string, amountCents: number): Promise<PaymentConfirmation>;
}

export class FailClosedError extends Error {
  constructor(
    message: string,
    public readonly code: 'ILLEGAL_TRANSITION' | 'NO_PAYMENT_ADAPTER' | 'PAYMENT_NOT_CONFIRMED' | 'UNKNOWN_ENGAGEMENT' | 'TENANT_MISMATCH' | 'LICENSE_REQUIRES_PAID',
  ) {
    super(`FAIL_CLOSED[${code}]: ${message}`);
    this.name = 'FailClosedError';
  }
}
