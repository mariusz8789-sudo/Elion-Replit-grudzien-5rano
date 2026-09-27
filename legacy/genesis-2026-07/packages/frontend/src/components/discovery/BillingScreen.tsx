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
import { Panel, StatusPill } from './DiscoveryShell';
import { ProductChrome } from '../product/ProductChrome';
import { StatCard, Donut } from '../charts/Charts';
import { Icon } from '../Icon';
import { AccountPanel } from '../AccountPanel';
import { useSession, getToken } from '../../core/backend/session';
import { fetchAccountBilling, regenerateApiKey, startCheckout, type AccountBilling } from '../../core/backend/client';
import { useI18n } from '../../core/i18n';

const TIER_LABEL: Record<string, string> = { free: 'Free', starter: 'Starter', pro: 'Pro' };
const maskKey = (k: string) => (k.length > 14 ? `${k.slice(0, 7)}…${k.slice(-4)}` : k);

export function BillingScreen() {
  const session = useSession();
  const { t, locale } = useI18n();
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
      <ProductChrome active="#/billing">
        <div className="product-page-head"><div><h1>{t('nav.billing')}</h1><p>{t('billing.signin.sub')}</p></div></div>
        <Panel title={t('common.signIn')} icon="lock"><AccountPanel /></Panel>
      </ProductChrome>
    );
  }

  const key = data?.apiKey ?? null;
  const used = key?.usageCount ?? 0;
  const limit = key?.monthlyLimit ?? 0;
  const remaining = key?.remaining ?? 0;

  const doRegenerate = async () => {
    const token = getToken(); if (!token) return;
    if (!window.confirm(t('billing.key.confirmRegen'))) return;
    setBusy(true); setNotice(null);
    const r = await regenerateApiKey(token);
    setBusy(false);
    if (r.ok) { setRevealed(true); setNotice(t('billing.key.regenNotice')); load(); }
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
    data.plan.renewalState === 'RENEWING' ? <StatusPill kind="ok">{t('billing.renewal.renewing')}</StatusPill>
      : data.plan.renewalState === 'CANCELED' ? <StatusPill kind="warn">{t('billing.renewal.canceled')}</StatusPill>
      : <StatusPill kind="info">{t('billing.renewal.none')}</StatusPill>
  );
  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(locale === 'pl' ? 'pl-PL' : 'en-US');

  return (
    <ProductChrome active="#/billing">
      <div className="product-page-head"><div><h1>{t('nav.billing')}</h1><p>{t('billing.subtitle')}</p></div>{renewalPill}</div>
      {err ? <div className="ds-empty"><Icon name="alert" size={22} className="ds-empty-icon" /><h4>{t('billing.loadError')}</h4><p>{err}</p></div> : null}
      {!data && !err ? <div className="skeleton" style={{ height: 200 }} /> : null}

      {data ? (
        <>
          <div className="ds-grid ds-grid-4">
            <StatCard label={t('billing.stat.plan')} value={TIER_LABEL[data.plan.tier] ?? data.plan.tier} sub={data.plan.status} accent="var(--violet)" />
            <StatCard label={t('billing.stat.used')} value={used} sub={t('billing.stat.usedSub')} accent="var(--cyan)" />
            <StatCard label={t('billing.stat.limit')} value={limit || '—'} sub={t('billing.stat.limitSub', { tier: data.plan.tier })} accent="var(--gold)" />
            <StatCard label={t('billing.stat.remaining')} value={remaining} sub={limit ? `${Math.round((remaining / limit) * 100)}%` : '—'} accent="var(--green)" />
          </div>

          <div className="ds-grid ds-grid-2 ds-mt">
            <Panel title={t('billing.usage.title')} icon="chart">
              {key ? (
                <Donut size={150} thickness={18} centerLabel={String(remaining)} centerSub={t('billing.usage.remainingCenter')}
                  data={[{ label: t('billing.usage.used'), value: used, color: 'var(--violet)' }, { label: t('billing.usage.remaining'), value: remaining, color: 'var(--bg-elevated)' }]} />
              ) : <p className="ds-note">{t('billing.usage.noKey')}</p>}
              {key ? <p className="ds-note ds-mt">{t('billing.usage.reset', { date: fmtDate(key.resetDate) })}</p> : null}
            </Panel>

            <Panel title={t('billing.key.title')} icon="lock" right={key ? <StatusPill kind="info">{TIER_LABEL[key.tier] ?? key.tier}</StatusPill> : null}>
              {key ? (
                <>
                  <div className="ds-input-row">
                    <input readOnly value={revealed ? key.key : maskKey(key.key)} spellCheck={false} style={{ fontFamily: 'var(--font-mono)' }} />
                    <button className="ds-btn" onClick={() => setRevealed((v) => !v)}>{revealed ? t('billing.key.hide') : t('billing.key.show')}</button>
                    <button className="ds-btn ds-btn-primary" onClick={doCopy}><Icon name={copied ? 'check' : 'chart'} size={14} /> {copied ? t('billing.key.copied') : t('billing.key.copy')}</button>
                  </div>
                  <div className="ds-chips ds-mt">
                    <button className="ds-chip" onClick={doRegenerate} disabled={busy}><Icon name="spark" size={13} /> {t('billing.key.regenerate')}</button>
                  </div>
                  <p className="ds-note ds-mt">{t('billing.key.usageHeader')} <code>Authorization: Bearer {maskKey(key.key)}</code></p>
                </>
              ) : (
                <button className="ds-btn ds-btn-primary" onClick={doRegenerate} disabled={busy}><Icon name="spark" size={14} /> {t('billing.key.generate')}</button>
              )}
              {notice ? <p className="ds-note ds-mt" style={{ color: 'var(--green)' }}>{notice}</p> : null}
            </Panel>
          </div>

          <Panel title={t('billing.plan.title')} icon="briefcase" className="ds-mt"
            right={data.stripeConfigured ? <StatusPill kind="ok">{t('billing.plan.stripeActive')}</StatusPill> : <StatusPill kind="blocked">{t('billing.plan.stripeOff')}</StatusPill>}>
            {!data.stripeConfigured ? (
              <p className="ds-note">{t('billing.plan.notConfigured', { tier: TIER_LABEL[data.plan.tier] ?? data.plan.tier })}</p>
            ) : (
              <>
                <p className="ds-para">{t('billing.plan.current', { tier: TIER_LABEL[data.plan.tier] ?? data.plan.tier, status: data.plan.status })}</p>
                <div className="ds-chips">
                  <button className="ds-btn" onClick={() => doUpgrade('starter')} disabled={busy || data.plan.tier === 'starter'}>{t('billing.plan.starter')}</button>
                  <button className="ds-btn ds-btn-primary" onClick={() => doUpgrade('pro')} disabled={busy || data.plan.tier === 'pro'}>{t('billing.plan.pro')}</button>
                </div>
                <p className="ds-note ds-mt">{t('billing.plan.stripeNote')}</p>
              </>
            )}
          </Panel>
        </>
      ) : null}
    </ProductChrome>
  );
}
