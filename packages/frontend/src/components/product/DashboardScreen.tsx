/**
 * DashboardScreen — the Scientific Command Center (Genesis V3, P0 · Milestone 2).
 *
 * The first screen a scientist sees each morning: what to continue (Zone 1), what needs
 * attention (Zone 2), and what's happening across all research (Zone 5) — a SURFACE over
 * the /api/portfolio rollup and the existing scoring engine, no new system, no fabricated
 * data. Fully bilingual (EN/PL) via the i18n seam; switches language with the whole app.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProductChrome } from './ProductChrome';
import { AccountPanel } from '../AccountPanel';
import { useSession, getToken } from '../../core/backend/session';
import { listCampaigns, type Campaign } from '../../core/campaigns';
import { fetchPortfolio, type PortfolioEntry } from '../../core/backend/client';
import { buildCommandCenter, reproState, reproLabel, relativeTime } from '../../core/dashboard';
import { loadSampleProject } from '../../core/sampleProject';
import { useI18n } from '../../core/i18n';

function greetingKey(hour: number): string {
  if (hour < 12) return 'dash.greeting.morning';
  if (hour < 18) return 'dash.greeting.afternoon';
  return 'dash.greeting.evening';
}

function ReproBadge({ analysed, total }: { analysed: number; total: number }) {
  const state = reproState(analysed, total);
  return <span className={`cc-badge cc-badge-${state}`}>{reproLabel(analysed, total)}</span>;
}

const go = (hash: string) => { window.location.hash = hash; };

export function DashboardScreen() {
  const session = useSession();
  const { t, tp } = useI18n();
  const [portfolio, setPortfolio] = useState<PortfolioEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(() => {
    const token = getToken();
    if (!token) return () => {};
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPortfolio(token).then((r) => {
      if (cancelled) return;
      if (r.ok) setPortfolio(r.data);
      else setError(r.message);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!session) { setPortfolio(null); setError(null); return; }
    return load();
  }, [session, load]);

  const localById = useMemo(() => {
    const m = new Map<string, Campaign>();
    if (session) for (const c of listCampaigns(session.user.id)) m.set(c.id, c);
    return m;
  }, [session, portfolio]);

  const model = useMemo(
    () => (portfolio ? buildCommandCenter(portfolio, localById) : null),
    [portfolio, localById],
  );

  const loadSample = async () => {
    if (!session || seeding) return;
    setSeeding(true);
    try { await loadSampleProject(session.user.id, session.user.email); } finally { setSeeding(false); }
    load();
  };

  const now = Date.now();
  const hour = new Date().getHours();
  const name = session ? (session.user.displayName || session.user.email.split('@')[0]) : '';

  if (!session) {
    return (
      <ProductChrome active="#/genesis">
        <div className="cc-signin">
          <div className="cc-signin-copy">
            <h1 className="cc-title">{t('dash.signin.title')}</h1>
            <p className="cc-sub">{t('dash.signin.sub')}</p>
          </div>
          <div className="cc-signin-panel"><AccountPanel /></div>
        </div>
      </ProductChrome>
    );
  }

  return (
    <ProductChrome active="#/genesis">
      <div className="cc-header">
        <div>
          <h1 className="cc-title">{t(greetingKey(hour), { name })}</h1>
          <p className="cc-sub">
            {model
              ? `${tp('dash.projects', model.rows.length)} · ${tp('dash.needCount', model.needsAttention.length)}`
              : t('dash.loading')}
          </p>
        </div>
        <button className="cc-btn cc-btn-primary" onClick={() => go('#/campaigns')}>{t('dash.newProject')}</button>
      </div>

      {error ? (
        <div className="cc-error" role="alert">
          <span>{t('dash.error', { message: error })}</span>
          <button className="cc-btn cc-btn-ghost" onClick={load}>{t('common.tryAgain')}</button>
        </div>
      ) : null}

      {!model && loading ? (
        <div className="cc-skeleton" aria-busy="true" aria-label={t('dash.loading')}>
          <div className="cc-sk-row" /><div className="cc-sk-row" /><div className="cc-sk-row" />
        </div>
      ) : null}

      {model && model.rows.length === 0 ? (
        <div className="cc-firstrun">
          <h2>{t('dash.firstrun.title')}</h2>
          <p>{t('dash.firstrun.body')}</p>
          <div className="cc-firstrun-actions">
            <button className="cc-btn cc-btn-primary" onClick={() => go('#/campaigns')}>{t('dash.firstrun.create')}</button>
            <button className="cc-btn cc-btn-ghost" onClick={loadSample} disabled={seeding}>{seeding ? t('dash.firstrun.loading') : t('dash.firstrun.sample')}</button>
          </div>
          <p className="cc-firstrun-note">{t('dash.firstrun.note')}</p>
        </div>
      ) : null}

      {model && model.rows.length > 0 ? (
        <>
          {model.continueRow ? (
            <div className="cc-continue">
              <div className="cc-continue-text">
                <span className="cc-eyebrow">{t('dash.continue')}</span>
                <span className="cc-continue-name">{model.continueRow.entry.name || t('campaigns.empty.title')}</span>
                <span className="cc-continue-meta">{t('dash.lastActivity', { time: relativeTime(model.continueRow.entry.lastActivityAt, now) })}</span>
              </div>
              <button className="cc-btn cc-btn-primary" onClick={() => go(`#/campaigns/${model.continueRow!.entry.id}`)}>{t('dash.resume')}</button>
            </div>
          ) : null}

          <div className="cc-section-label">
            <span className="cc-dot cc-dot-attn" aria-hidden="true" /> {t('dash.needsAttention')}
            {model.needsAttention.length > 0 ? <span className="cc-count">{model.needsAttention.length}</span> : null}
          </div>
          {model.needsAttention.length === 0 ? (
            <div className="cc-empty-note">{t('dash.nothingAttention')}</div>
          ) : (
            <div className="cc-attention-list">
              {model.needsAttention.map((r) => (
                <div key={r.entry.id} className="cc-attn">
                  <div className="cc-attn-body">
                    <div className="cc-attn-head">
                      <span className="cc-attn-name">{r.entry.name || '—'}</span>
                      {r.leading ? (
                        <span className="cc-attn-lead">{t('dash.leading', { name: r.leading.name })} · <span className="cc-mono">{r.leading.scored.score}/100</span></span>
                      ) : null}
                    </div>
                    <div className="cc-attn-reasons">{r.attention.reasons.join(' · ')}</div>
                  </div>
                  <button className="cc-btn cc-btn-ghost" onClick={() => go(`#/campaigns/${r.entry.id}`)}>{t('common.open')}</button>
                </div>
              ))}
            </div>
          )}

          <div className="cc-section-label">{t('dash.allProjects')}</div>
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead>
                <tr>
                  <th>{t('dash.col.project')}</th><th>{t('dash.col.status')}</th><th>{t('dash.col.analysed')}</th>
                  <th>{t('dash.col.comments')}</th><th>{t('dash.col.activity')}</th><th>{t('dash.col.role')}</th>
                </tr>
              </thead>
              <tbody>
                {model.rows.map((r) => {
                  const open = () => go(`#/campaigns/${r.entry.id}`);
                  return (
                    <tr
                      key={r.entry.id}
                      className="cc-row"
                      tabIndex={0}
                      onClick={open}
                      onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
                    >
                      <td className="cc-cell-name">{r.entry.name || '—'}</td>
                      <td className="cc-cell-status">{t(`status.${r.entry.status}`)}</td>
                      <td><ReproBadge analysed={r.entry.analysed} total={r.entry.total} /></td>
                      <td>{r.entry.unresolvedComments > 0 ? r.entry.unresolvedComments : '—'}</td>
                      <td className="cc-cell-time">{relativeTime(r.entry.lastActivityAt, now)}</td>
                      <td className="cc-cell-role">{t(`role.${r.entry.role}`)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </ProductChrome>
  );
}
