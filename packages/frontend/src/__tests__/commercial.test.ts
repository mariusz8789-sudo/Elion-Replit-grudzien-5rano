import { describe, expect, it } from 'vitest';
import { CommercialLedger } from '../core/commercial/ledger';
import { FailClosedError, type Tenant } from '../core/commercial/contracts';
import { alwaysConfirmingAdapter, alwaysRefusingAdapter } from '../core/commercial/testFixtures';
import { complianceNotes, GENERIC_COMPLIANCE_NOTE } from '../core/commercial/compliance';

/**
 * COMMERCIAL LAYER — negative-first, real async (docs/DECISIONS.md D-057).
 * No Stripe, no real payment processor: `alwaysConfirmingAdapter` /
 * `alwaysRefusingAdapter` are explicitly-named test fixtures
 * (core/commercial/testFixtures.ts), never presented as real.
 */

const TENANT: Tenant = { tenantId: 'T1', name: 'Test Tenant', createdAt: Date.now() };
const OTHER_TENANT: Tenant = { tenantId: 'T2', name: 'Other Tenant', createdAt: Date.now() };

describe('CommercialLedger — legal state machine, fail-closed', () => {
  it('a new engagement opens at QUOTED with a real append-only ledger entry', async () => {
    const ledger = new CommercialLedger();
    const engagement = await ledger.open(TENANT, 'GOV_DRUG_DISCOVERY');
    expect(engagement.status).toBe('QUOTED');
    const entries = await ledger.ledgerFor(engagement.engagementId, TENANT.tenantId);
    expect(entries.length).toBe(1);
    expect(entries[0]!.event).toBe('ENGAGEMENT_OPENED');
  });

  it('an illegal transition (skipping states) is refused, fail-closed, and the engagement is unchanged', async () => {
    const ledger = new CommercialLedger();
    const engagement = await ledger.open(TENANT, 'GENERIC');
    await expect(ledger.transition(engagement.engagementId, TENANT.tenantId, 'DELIVERED')).rejects.toBeInstanceOf(FailClosedError);
    const entries = await ledger.ledgerFor(engagement.engagementId, TENANT.tenantId);
    expect(entries.length).toBe(1); // no partial transition recorded
  });

  it('the legal path QUOTED -> ACCEPTED -> IN_PROGRESS -> DELIVERED -> AWAITING_PAYMENT succeeds step by step', async () => {
    const ledger = new CommercialLedger();
    const engagement = await ledger.open(TENANT, 'GENERIC');
    await ledger.transition(engagement.engagementId, TENANT.tenantId, 'ACCEPTED');
    await ledger.transition(engagement.engagementId, TENANT.tenantId, 'IN_PROGRESS');
    await ledger.transition(engagement.engagementId, TENANT.tenantId, 'DELIVERED');
    const final = await ledger.transition(engagement.engagementId, TENANT.tenantId, 'AWAITING_PAYMENT');
    expect(final.status).toBe('AWAITING_PAYMENT');
  });

  it('PAID without a PaymentAdapter fails closed with NO_PAYMENT_ADAPTER — no automatic PAID', async () => {
    const ledger = new CommercialLedger();
    const engagement = await ledger.open(TENANT, 'GENERIC');
    await ledger.transition(engagement.engagementId, TENANT.tenantId, 'ACCEPTED');
    await ledger.transition(engagement.engagementId, TENANT.tenantId, 'IN_PROGRESS');
    await ledger.transition(engagement.engagementId, TENANT.tenantId, 'DELIVERED');
    await ledger.transition(engagement.engagementId, TENANT.tenantId, 'AWAITING_PAYMENT');
    await expect(ledger.transition(engagement.engagementId, TENANT.tenantId, 'PAID')).rejects.toThrow(/NO_PAYMENT_ADAPTER/);
  });

  it('PAID with an adapter that refuses to confirm ALSO fails closed — an adapter existing is not enough', async () => {
    const ledger = new CommercialLedger();
    const engagement = await ledger.open(TENANT, 'GENERIC');
    await ledger.transition(engagement.engagementId, TENANT.tenantId, 'ACCEPTED');
    await ledger.transition(engagement.engagementId, TENANT.tenantId, 'IN_PROGRESS');
    await ledger.transition(engagement.engagementId, TENANT.tenantId, 'DELIVERED');
    await ledger.transition(engagement.engagementId, TENANT.tenantId, 'AWAITING_PAYMENT');
    await expect(
      ledger.transition(engagement.engagementId, TENANT.tenantId, 'PAID', { adapter: alwaysRefusingAdapter }),
    ).rejects.toThrow(/PAYMENT_NOT_CONFIRMED/);
  });

  it('PAID with a genuinely confirming adapter succeeds, and only then can a license be issued', async () => {
    const ledger = new CommercialLedger();
    const engagement = await ledger.open(TENANT, 'GENERIC');
    await ledger.transition(engagement.engagementId, TENANT.tenantId, 'ACCEPTED');
    await ledger.transition(engagement.engagementId, TENANT.tenantId, 'IN_PROGRESS');
    await ledger.transition(engagement.engagementId, TENANT.tenantId, 'DELIVERED');
    await ledger.transition(engagement.engagementId, TENANT.tenantId, 'AWAITING_PAYMENT');
    const paid = await ledger.transition(engagement.engagementId, TENANT.tenantId, 'PAID', { adapter: alwaysConfirmingAdapter, amountCents: 500000 });
    expect(paid.status).toBe('PAID');
    const fingerprint = await ledger.issueLicense(engagement.engagementId, TENANT.tenantId);
    expect(fingerprint.length).toBeGreaterThan(0);
  });

  it('issuing a license before PAID fails closed — no license backdated onto an unpaid engagement', async () => {
    const ledger = new CommercialLedger();
    const engagement = await ledger.open(TENANT, 'GENERIC');
    await expect(ledger.issueLicense(engagement.engagementId, TENANT.tenantId)).rejects.toThrow(/LICENSE_REQUIRES_PAID/);
  });

  it('tenant isolation: a different tenant cannot read or transition another tenant\'s engagement', async () => {
    const ledger = new CommercialLedger();
    const engagement = await ledger.open(TENANT, 'GENERIC');
    await expect(ledger.transition(engagement.engagementId, OTHER_TENANT.tenantId, 'ACCEPTED')).rejects.toThrow(/TENANT_MISMATCH/);
    await expect(ledger.ledgerFor(engagement.engagementId, OTHER_TENANT.tenantId)).rejects.toThrow(/TENANT_MISMATCH/);
  });

  it('tenant isolation also holds for the list projection: engagementsForTenant never leaks another tenant\'s rows', async () => {
    const ledger = new CommercialLedger();
    await ledger.open(TENANT, 'GENERIC');
    await ledger.open(OTHER_TENANT, 'GENERIC');
    const mine = await ledger.engagementsForTenant(TENANT.tenantId);
    expect(mine.length).toBe(1);
    expect(mine.every((e) => e.tenantId === TENANT.tenantId)).toBe(true);
  });

  it('an unknown engagementId fails closed with UNKNOWN_ENGAGEMENT, never a silent no-op', async () => {
    const ledger = new CommercialLedger();
    await expect(ledger.transition('does-not-exist', TENANT.tenantId, 'ACCEPTED')).rejects.toThrow(/UNKNOWN_ENGAGEMENT/);
  });

  it('the ledger is genuinely append-only: the entry count only grows across transitions, nothing is overwritten', async () => {
    const ledger = new CommercialLedger();
    const engagement = await ledger.open(TENANT, 'GENERIC');
    const before = await ledger.ledgerFor(engagement.engagementId, TENANT.tenantId);
    await ledger.transition(engagement.engagementId, TENANT.tenantId, 'ACCEPTED');
    const after = await ledger.ledgerFor(engagement.engagementId, TENANT.tenantId);
    expect(after.length).toBe(before.length + 1);
    expect(after.slice(0, before.length)).toEqual(before);
  });
});

describe('complianceNotes — static text, not a compliance engine', () => {
  it('every vertical\'s notes include the generic disclaimer', () => {
    expect(complianceNotes('GOV_DRUG_DISCOVERY')).toContain(GENERIC_COMPLIANCE_NOTE);
    expect(complianceNotes('UNKNOWN_VERTICAL')).toContain(GENERIC_COMPLIANCE_NOTE);
  });
});
