import { useCallback, useEffect, useState } from 'react';
import type React from 'react';
import { sharedCommercialLedger } from '../core/commercial/sharedLedger';
import { complianceNotes } from '../core/commercial/compliance';
import { FailClosedError, type Engagement, type EngagementStatus, type LedgerEntry, type Tenant } from '../core/commercial/contracts';
import { FingerprintChip } from './genesis-ui/FingerprintChip';

/**
 * /monetize — a real, read-heavy projection of `CommercialLedger`
 * (docs/DECISIONS.md D-057). This screen computes nothing scientific and
 * feeds nothing back into `core/agent/*` — the separation
 * `core/commercial/contracts.ts`'s own header states is enforced by this
 * screen simply never importing anything from `core/agent` or
 * `core/orchestrator`.
 *
 * NO PAYMENT ADAPTER IS WIRED HERE. The "Attempt PAID" button exists to
 * demonstrate, honestly, that `CommercialLedger.transition(... 'PAID')`
 * fails closed without one — the failure message shown is the real
 * `FailClosedError`, not a simulated success and not a simulated failure.
 */

const DEMO_TENANT: Tenant = { tenantId: 'demo-tenant', name: 'Demo Tenant', createdAt: Date.now() };
const VERTICALS = ['GOV_DRUG_DISCOVERY', 'PHYSICS', 'GENERIC'] as const;

const LEGAL_NEXT: Readonly<Record<EngagementStatus, readonly EngagementStatus[]>> = {
  QUOTED: ['ACCEPTED'],
  ACCEPTED: ['IN_PROGRESS'],
  IN_PROGRESS: ['DELIVERED'],
  DELIVERED: ['AWAITING_PAYMENT'],
  AWAITING_PAYMENT: ['PAID', 'DISPUTED'],
  PAID: [],
  DISPUTED: ['AWAITING_PAYMENT'],
};

export function MonetizeScreen(): React.ReactElement {
  const [vertical, setVertical] = useState<(typeof VERTICALS)[number]>('GOV_DRUG_DISCOVERY');
  const [engagements, setEngagements] = useState<readonly Engagement[]>([]);
  const [ledgers, setLedgers] = useState<Readonly<Record<string, readonly LedgerEntry[]>>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const mine = await sharedCommercialLedger.engagementsForTenant(DEMO_TENANT.tenantId);
    setEngagements(mine);
    const entries = await Promise.all(mine.map((e) => sharedCommercialLedger.ledgerFor(e.engagementId, DEMO_TENANT.tenantId)));
    setLedgers(Object.fromEntries(mine.map((e, i) => [e.engagementId, entries[i]!])));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openEngagement = async (): Promise<void> => {
    setError(null);
    await sharedCommercialLedger.open(DEMO_TENANT, vertical);
    await refresh();
  };

  const doTransition = async (engagementId: string, to: EngagementStatus): Promise<void> => {
    setError(null);
    try {
      await sharedCommercialLedger.transition(engagementId, DEMO_TENANT.tenantId, to);
    } catch (e) {
      setError(e instanceof FailClosedError ? e.message : String(e));
    }
    await refresh();
  };

  return (
    <div className="settings-view">
      <section className="settings-section">
        <h2>Monetize — engagement ledger</h2>
        <p className="settings-hint">
          Real `CommercialLedger` state, read from the browser's own in-memory store. No payment processor is wired
          in — PAID is only reachable with a real `PaymentAdapter` that confirms; there is none here, so the demo
          button below is expected to fail closed. This screen contains no scientific ranking, adjudication, or
          evidence-minimum logic of its own.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={vertical} onChange={(e) => setVertical(e.target.value as (typeof VERTICALS)[number])}>
            {VERTICALS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <button type="button" className="chip-btn primary" onClick={() => void openEngagement()}>
            Open new engagement
          </button>
        </div>
        <ul className="gdd-list" style={{ marginTop: 8 }}>
          {complianceNotes(vertical).map((note) => <li key={note}>{note}</li>)}
        </ul>
        {error !== null && <p className="gdd-error">{error}</p>}
      </section>

      {engagements.length === 0 ? (
        <section className="settings-section">
          <p className="empty-state">No engagements yet. Open one above.</p>
        </section>
      ) : (
        <section className="settings-section">
          <h3 className="section-label">Engagements — tenant {DEMO_TENANT.tenantId}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {engagements.map((e) => (
              <div key={e.engagementId} className="gu-locked-panel" style={{ textAlign: 'left' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{e.vertical}</strong>
                  <span className="gu-hint" style={{ margin: 0 }}>status: {e.status}</span>
                  <FingerprintChip label="engagement" value={e.engagementId} />
                  {e.licenseFingerprint !== null && <FingerprintChip label="license" value={e.licenseFingerprint} />}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {LEGAL_NEXT[e.status].map((to) => (
                    <button key={to} type="button" className="chip-btn" onClick={() => void doTransition(e.engagementId, to)}>
                      {to === 'PAID' ? 'Attempt PAID (no adapter — will fail closed)' : `-> ${to}`}
                    </button>
                  ))}
                </div>
                <p className="gu-hint">{(ledgers[e.engagementId] ?? []).length} ledger entries</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
