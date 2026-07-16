/**
 * BillingScreen (Stage 2) — self-service billing dashboard. The logged-in user sees
 * their plan, monthly API usage + remaining quota, and their API key (copy /
 * regenerate); can open Stripe Checkout to upgrade; sees billing + renewal status.
 *
 * Pure reuse: DiscoveryShell/Panel/StatCard/StatusPill/Icon/Donut (design system),
 * session.ts (auth), and the Stage-2 client methods. No new business logic here —
 * plan/usage/key come from /api/account/billing; upgrade uses the Stage-1 checkout.
 * If Stripe is not configured → "Billing unavailable" (no crash, upgrade disabled).
 */
import { useCallback, useEffect, useState } from 'react';
import { DiscoveryShell, Panel, StatusPill } from './DiscoveryShell';
import { StatCard, Donut } from '../charts/Charts';
import { Icon } from '../Icon';
import { AccountPanel } from '../AccountPanel';
import { useSession, getToken } from '../../core/backend/session';
import { fetchAccountBilling, regenerateApiKey, startCheckout, type AccountBilling } from '../../core/backend/client';

const TIER_LABEL: Record<string, string> = { free: 'Free', starter: 'Starter', pro: 'Pro' };
const maskKey = (k: string) => (k.length > 14 ? `${k.slice(0, 7)}…${k.slice(-4)}` : k);

export function BillingScreen() {
  const session = useSession();
  const [data, setData] = useState<AccountBilling | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    const token = getToken();
    if (!token) return;
    fetchAccountBilling(token).then((r) => (r.ok ? setData(r.data) : setErr(r.message)));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!session) {
    return (
      <DiscoveryShell active="#/billing" title="Rozliczenia" subtitle="Zaloguj się, aby zarządzać planem i kluczem API">
        <Panel title="Zaloguj się" icon="lock"><AccountPanel /></Panel>
      </DiscoveryShell>
    );
  }

  const key = data?.apiKey ?? null;
  const used = key?.usageCount ?? 0;
  const limit = key?.monthlyLimit ?? 0;
  const remaining = key?.remaining ?? 0;

  const doRegenerate = async () => {
    const token = getToken(); if (!token) return;
    if (!window.confirm('Wygenerować nowy klucz? Obecny klucz przestanie działać natychmiast.')) return;
    setBusy(true); setNotice(null);
    const r = await regenerateApiKey(token);
    setBusy(false);
    if (r.ok) { setRevealed(true); setNotice('Nowy klucz wygenerowany. Skopiuj go teraz.'); load(); }
    else setErr(r.message);
  };
  const doCopy = async () => {
    if (!key) return;
    try { await navigator.clipboard.writeText(key.key); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  };
  const doUpgrade = async (tier: 'starter' | 'pro') => {
    const token = getToken(); if (!token) return;
    setBusy(true); setNotice(null);
    const r = await startCheckout(token, tier);
    setBusy(false);
    if (r.ok) window.location.href = r.data.url; else setErr(r.message);
  };

  const renewalPill = data && (
    data.plan.renewalState === 'RENEWING' ? <StatusPill kind="ok">odnawia się</StatusPill>
      : data.plan.renewalState === 'CANCELED' ? <StatusPill kind="warn">anulowana</StatusPill>
      : <StatusPill kind="info">brak subskrypcji</StatusPill>
  );

  return (
    <DiscoveryShell active="#/billing" title="Rozliczenia" subtitle="Plan, zużycie API i klucz — samoobsługa" actions={renewalPill}>
      {err ? <div className="ds-empty"><Icon name="alert" size={22} className="ds-empty-icon" /><h4>Nie udało się wczytać</h4><p>{err}</p></div> : null}
      {!data && !err ? <div className="skeleton" style={{ height: 200 }} /> : null}

      {data ? (
        <>
          <div className="ds-grid ds-grid-4">
            <StatCard label="Plan" value={TIER_LABEL[data.plan.tier] ?? data.plan.tier} sub={data.plan.status} accent="var(--violet)" />
            <StatCard label="Użyte (miesiąc)" value={used} sub="zapytań API" accent="var(--cyan)" />
            <StatCard label="Limit miesięczny" value={limit || '—'} sub={`tier ${data.plan.tier}`} accent="var(--gold)" />
            <StatCard label="Pozostało" value={remaining} sub={limit ? `${Math.round((remaining / limit) * 100)}%` : '—'} accent="var(--green)" />
          </div>

          <div className="ds-grid ds-grid-2 ds-mt">
            <Panel title="Zużycie w tym okresie" icon="chart">
              {key ? (
                <Donut size={150} thickness={18} centerLabel={String(remaining)} centerSub="pozostało"
                  data={[{ label: 'Użyte', value: used, color: 'var(--violet)' }, { label: 'Pozostałe', value: remaining, color: 'var(--bg-elevated)' }]} />
              ) : <p className="ds-note">Brak klucza API. Wygeneruj klucz poniżej, aby zacząć korzystać z API.</p>}
              {key ? <p className="ds-note ds-mt">Reset licznika: {new Date(key.resetDate).toLocaleDateString('pl-PL')}</p> : null}
            </Panel>

            <Panel title="Klucz API" icon="lock" right={key ? <StatusPill kind="info">{TIER_LABEL[key.tier] ?? key.tier}</StatusPill> : null}>
              {key ? (
                <>
                  <div className="ds-input-row">
                    <input readOnly value={revealed ? key.key : maskKey(key.key)} spellCheck={false} style={{ fontFamily: 'var(--font-mono)' }} />
                    <button className="ds-btn" onClick={() => setRevealed((v) => !v)}>{revealed ? 'Ukryj' : 'Pokaż'}</button>
                    <button className="ds-btn ds-btn-primary" onClick={doCopy}><Icon name={copied ? 'check' : 'chart'} size={14} /> {copied ? 'Skopiowano' : 'Kopiuj'}</button>
                  </div>
                  <div className="ds-chips ds-mt">
                    <button className="ds-chip" onClick={doRegenerate} disabled={busy}><Icon name="spark" size={13} /> Wygeneruj nowy klucz</button>
                  </div>
                  <p className="ds-note ds-mt">Użycie w nagłówku: <code>Authorization: Bearer {maskKey(key.key)}</code></p>
                </>
              ) : (
                <button className="ds-btn ds-btn-primary" onClick={doRegenerate} disabled={busy}><Icon name="spark" size={14} /> Wygeneruj klucz API</button>
              )}
              {notice ? <p className="ds-note ds-mt" style={{ color: 'var(--green)' }}>{notice}</p> : null}
            </Panel>
          </div>

          <Panel title="Plan i płatności" icon="briefcase" className="ds-mt"
            right={data.stripeConfigured ? <StatusPill kind="ok">Stripe aktywny</StatusPill> : <StatusPill kind="blocked">Billing niedostępny</StatusPill>}>
            {!data.stripeConfigured ? (
              <p className="ds-note">Płatności nie są skonfigurowane w tym wdrożeniu. Możesz korzystać z planu <strong>{TIER_LABEL[data.plan.tier]}</strong> i klucza API; upgrade będzie dostępny po podłączeniu Stripe.</p>
            ) : (
              <>
                <p className="ds-para">Aktualny plan: <strong>{TIER_LABEL[data.plan.tier]}</strong> · status: {data.plan.status}. Wybierz wyższy plan, aby zwiększyć limit zapytań.</p>
                <div className="ds-chips">
                  <button className="ds-btn" onClick={() => doUpgrade('starter')} disabled={busy || data.plan.tier === 'starter'}>Starter — 10 000/mies.</button>
                  <button className="ds-btn ds-btn-primary" onClick={() => doUpgrade('pro')} disabled={busy || data.plan.tier === 'pro'}>Pro — 100 000/mies.</button>
                </div>
                <p className="ds-note ds-mt">Płatność obsługuje Stripe Checkout; po opłaceniu klucz zostaje automatycznie przypisany do planu.</p>
              </>
            )}
          </Panel>
        </>
      ) : null}
    </DiscoveryShell>
  );
}
