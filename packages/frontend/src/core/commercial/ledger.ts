import { canonicalJson, fnv1a } from '../events/hash';
import { InMemoryRecordStore, type KeyedRecordStore } from '../provenance/recordStore';
import {
  FailClosedError,
  type Engagement,
  type EngagementStatus,
  type LedgerEntry,
  type PaymentAdapter,
  type Tenant,
} from './contracts';

/**
 * LEGAL STATE MACHINE. The only transitions this ledger will ever record.
 * `AWAITING_PAYMENT -> PAID` is listed here as legal SHAPE only — whether it
 * is actually allowed to happen additionally requires a real `PaymentAdapter`
 * that returns `confirmed: true` (enforced in `transition`, not in this map).
 */
const LEGAL_TRANSITIONS: Readonly<Record<EngagementStatus, readonly EngagementStatus[]>> = {
  QUOTED: ['ACCEPTED'],
  ACCEPTED: ['IN_PROGRESS'],
  IN_PROGRESS: ['DELIVERED'],
  DELIVERED: ['AWAITING_PAYMENT'],
  AWAITING_PAYMENT: ['PAID', 'DISPUTED'],
  PAID: [],
  DISPUTED: ['AWAITING_PAYMENT'],
};

export interface TransitionOptions {
  readonly adapter?: PaymentAdapter;
  readonly amountCents?: number;
  readonly note?: string;
}

/**
 * COMMERCIAL LEDGER — engagements + their append-only ledger, backed by the
 * same `KeyedRecordStore` primitive every other Genesis provenance store
 * uses (`core/provenance/recordStore.ts`), not a new storage mechanism.
 *
 * TENANT ISOLATION: every read/write that names an `engagementId` also
 * requires the caller's `tenantId` and refuses (`TENANT_MISMATCH`) when the
 * engagement belongs to a different tenant — a tenant can never read or
 * transition another tenant's engagement through this class.
 */
export class CommercialLedger {
  constructor(
    private readonly engagements: KeyedRecordStore<Engagement> = new InMemoryRecordStore('overwrite'),
    private readonly ledgerEntries: KeyedRecordStore<readonly LedgerEntry[]> = new InMemoryRecordStore('overwrite'),
  ) {}

  private async appendEntry(entry: Omit<LedgerEntry, 'entryId' | 'fingerprint'>): Promise<LedgerEntry> {
    const prior = (await this.ledgerEntries.get(entry.engagementId)) ?? [];
    const entryId = fnv1a(canonicalJson({ engagementId: entry.engagementId, n: prior.length, event: entry.event }));
    const full: LedgerEntry = Object.freeze({
      ...entry,
      entryId,
      fingerprint: fnv1a(canonicalJson({ entryId, engagementId: entry.engagementId, event: entry.event, fromStatus: entry.fromStatus, toStatus: entry.toStatus, note: entry.note })),
    });
    await this.ledgerEntries.put(entry.engagementId, [...prior, full]);
    return full;
  }

  async open(tenant: Tenant, vertical: string): Promise<Engagement> {
    const existingIds = await this.engagements.list();
    const engagementId = fnv1a(canonicalJson({ tenantId: tenant.tenantId, vertical, n: existingIds.length }));
    const engagement: Engagement = Object.freeze({
      engagementId,
      tenantId: tenant.tenantId,
      vertical,
      status: 'QUOTED',
      createdAt: Date.now(),
      licenseFingerprint: null,
    });
    await this.engagements.put(engagementId, engagement);
    await this.appendEntry({
      engagementId,
      tenantId: tenant.tenantId,
      event: 'ENGAGEMENT_OPENED',
      fromStatus: null,
      toStatus: 'QUOTED',
      note: `engagement opened for tenant ${tenant.tenantId} (${vertical})`,
      recordedAt: Date.now(),
    });
    return engagement;
  }

  private async loadForTenant(engagementId: string, tenantId: string): Promise<Engagement> {
    const engagement = await this.engagements.get(engagementId);
    if (engagement === null) throw new FailClosedError(`no engagement "${engagementId}"`, 'UNKNOWN_ENGAGEMENT');
    if (engagement.tenantId !== tenantId) throw new FailClosedError(`engagement "${engagementId}" does not belong to tenant "${tenantId}"`, 'TENANT_MISMATCH');
    return engagement;
  }

  /**
   * Transitions an engagement. `PAID` requires `opts.adapter` AND a real
   * `confirmed: true` from it — no adapter, or an adapter that returns
   * `confirmed: false`, both fail closed and leave the engagement exactly
   * where it was (no partial transition is ever recorded).
   */
  async transition(engagementId: string, tenantId: string, to: EngagementStatus, opts: TransitionOptions = {}): Promise<Engagement> {
    const engagement = await this.loadForTenant(engagementId, tenantId);
    const allowed = LEGAL_TRANSITIONS[engagement.status];
    if (!allowed.includes(to)) {
      throw new FailClosedError(`"${engagement.status}" -> "${to}" is not a legal transition (legal: ${allowed.join(', ') || 'none, terminal state'})`, 'ILLEGAL_TRANSITION');
    }

    let event: LedgerEntry['event'] = 'STATUS_TRANSITION';
    if (to === 'PAID') {
      if (opts.adapter === undefined) {
        throw new FailClosedError(`cannot transition engagement "${engagementId}" to PAID without a real PaymentAdapter`, 'NO_PAYMENT_ADAPTER');
      }
      const confirmation = await opts.adapter.confirmPayment(engagementId, opts.amountCents ?? 0);
      if (confirmation.confirmed !== true) {
        throw new FailClosedError(`PaymentAdapter did not confirm payment for engagement "${engagementId}" (reference: ${confirmation.reference})`, 'PAYMENT_NOT_CONFIRMED');
      }
      event = 'PAYMENT_CONFIRMED';
    }

    const updated: Engagement = Object.freeze({ ...engagement, status: to });
    await this.engagements.put(engagementId, updated);
    await this.appendEntry({
      engagementId,
      tenantId,
      event,
      fromStatus: engagement.status,
      toStatus: to,
      note: opts.note ?? `${engagement.status} -> ${to}`,
      recordedAt: Date.now(),
    });
    return updated;
  }

  /** Only from PAID — a license fingerprint before payment would be exactly the fake confirmation this module refuses to produce. */
  async issueLicense(engagementId: string, tenantId: string): Promise<string> {
    const engagement = await this.loadForTenant(engagementId, tenantId);
    if (engagement.status !== 'PAID') {
      throw new FailClosedError(`engagement "${engagementId}" is "${engagement.status}", not PAID — no license without a confirmed payment`, 'LICENSE_REQUIRES_PAID');
    }
    const priorEntries = (await this.ledgerEntries.get(engagementId)) ?? [];
    const licenseFingerprint = fnv1a(canonicalJson({ engagementId, tenantId, vertical: engagement.vertical, ledgerLength: priorEntries.length }));
    const updated: Engagement = Object.freeze({ ...engagement, licenseFingerprint });
    await this.engagements.put(engagementId, updated);
    await this.appendEntry({
      engagementId,
      tenantId,
      event: 'LICENSE_ISSUED',
      fromStatus: 'PAID',
      toStatus: 'PAID',
      note: `license fingerprint ${licenseFingerprint} issued`,
      recordedAt: Date.now(),
    });
    return licenseFingerprint;
  }

  async ledgerFor(engagementId: string, tenantId: string): Promise<readonly LedgerEntry[]> {
    await this.loadForTenant(engagementId, tenantId);
    return (await this.ledgerEntries.get(engagementId)) ?? [];
  }

  /** Tenant isolation surfaced as a read too: only this tenant's own engagements come back. */
  async engagementsForTenant(tenantId: string): Promise<readonly Engagement[]> {
    const ids = await this.engagements.list();
    const all = await Promise.all(ids.map((id) => this.engagements.get(id)));
    return all.filter((e): e is Engagement => e !== null && e.tenantId === tenantId);
  }

  /** Read-only status projection for UI (/monetize) — no field here may feed scientific ranking. */
  async allEngagements(): Promise<readonly Engagement[]> {
    const ids = await this.engagements.list();
    const all = await Promise.all(ids.map((id) => this.engagements.get(id)));
    return all.filter((e): e is Engagement => e !== null);
  }
}
