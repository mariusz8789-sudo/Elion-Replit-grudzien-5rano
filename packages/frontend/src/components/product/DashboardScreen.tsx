/**
 * DashboardScreen — the Scientific Command Center (Genesis V3, P0 · Milestone 2).
 *
 * The first screen a scientist sees each morning. It answers, in one glance: what to
 * continue (Zone 1), what needs attention (Zone 2), and what's happening across all
 * research (Zone 5) — the three zones P0 lights up. It is a SURFACE over systems that
 * already exist: the new /api/portfolio rollup for the cross-project facts, and the
 * existing scoring engine (core/moleculeComparison.ts) for the leading candidate. No new
 * system, no fabricated data. English-first per the V3 language mandate.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProductChrome } from './ProductChrome';
import { AccountPanel } from '../AccountPanel';
import { useSession, getToken } from '../../core/backend/session';
import { listCampaigns, type Campaign } from '../../core/campaigns';
import { fetchPortfolio, type PortfolioEntry } from '../../core/backend/client';
import { buildCommandCenter, reproState, reproLabel, relativeTime } from '../../core/dashboard';

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function ReproBadge({ analysed, total }: { analysed: number; total: number }) {
  const state = reproState(analysed, total);
  return <span className={`cc-badge cc-badge-${state}`}>{reproLabel(analysed, total)}</span>;
}

const go = (hash: string) => { window.location.hash = hash; };

export function DashboardScreen() {
  const session = useSession();
  const [portfolio, setPortfolio] = useState<PortfolioEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  // Local-first: locally-held campaigns supply molecule data so the scoring engine can
  // compute a leading candidate. Re-read whenever the portfolio refreshes.
  const localById = useMemo(() => {
    const m = new Map<string, Campaign>();
    if (session) for (const c of listCampaigns(session.user.id)) m.set(c.id, c);
    return m;
  }, [session, portfolio]);

  const model = useMemo(
    () => (portfolio ? buildCommandCenter(portfolio, localById) : null),
    [portfolio, localById],
  );

  const now = Date.now();
  const hour = new Date().getHours();
  const name = session ? (session.user.displayName || session.user.email.split('@')[0]) : '';

  if (!session) {
    return (
      <ProductChrome active="#/genesis">
        <div className="cc-signin">
          <div className="cc-signin-copy">
            <h1 className="cc-title">Your Scientific Command Center</h1>
            <p className="cc-sub">Sign in to see what changed, what needs your attention, and what to continue — across every project.</p>
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
          <h1 className="cc-title">{greeting(hour)}, {name}</h1>
          <p className="cc-sub">
            {model
              ? `${model.rows.length} ${model.rows.length === 1 ? 'project' : 'projects'} · ${model.needsAttention.length} need${model.needsAttention.length === 1 ? 's' : ''} attention`
              : 'Loading your research…'}
          </p>
        </div>
        <button className="cc-btn cc-btn-primary" onClick={() => go('#/campaigns')}>+ New project</button>
      </div>

      {error ? (
        <div className="cc-error" role="alert">
          <span>Couldn&rsquo;t load your portfolio. {error}</span>
          <button className="cc-btn cc-btn-ghost" onClick={load}>Try again</button>
        </div>
      ) : null}

      {!model && loading ? (
        <div className="cc-skeleton" aria-busy="true" aria-label="Loading">
          <div className="cc-sk-row" /><div className="cc-sk-row" /><div className="cc-sk-row" />
        </div>
      ) : null}

      {model && model.rows.length === 0 ? (
        <div className="cc-firstrun">
          <h2>Start your first project</h2>
          <p>A project is where you evaluate molecules together — rank candidates from real RDKit descriptors, with every decision and its full history kept.</p>
          <button className="cc-btn cc-btn-primary" onClick={() => go('#/campaigns')}>Create a project</button>
        </div>
      ) : null}

      {model && model.rows.length > 0 ? (
        <>
          {model.continueRow ? (
            <div className="cc-continue">
              <div className="cc-continue-text">
                <span className="cc-eyebrow">Continue</span>
                <span className="cc-continue-name">{model.continueRow.entry.name || 'Untitled project'}</span>
                <span className="cc-continue-meta">Last activity {relativeTime(model.continueRow.entry.lastActivityAt, now)}</span>
              </div>
              <button className="cc-btn cc-btn-primary" onClick={() => go(`#/campaigns/${model.continueRow!.entry.id}`)}>Resume →</button>
            </div>
          ) : null}

          <div className="cc-section-label">
            <span className="cc-dot cc-dot-attn" aria-hidden="true" /> Needs attention
            {model.needsAttention.length > 0 ? <span className="cc-count">{model.needsAttention.length}</span> : null}
          </div>
          {model.needsAttention.length === 0 ? (
            <div className="cc-empty-note">Nothing needs attention — every project is fully analysed and has no open comments.</div>
          ) : (
            <div className="cc-attention-list">
              {model.needsAttention.map((r) => (
                <div key={r.entry.id} className="cc-attn">
                  <div className="cc-attn-body">
                    <div className="cc-attn-head">
                      <span className="cc-attn-name">{r.entry.name || 'Untitled project'}</span>
                      {r.leading ? (
                        <span className="cc-attn-lead">Leading: {r.leading.name} · <span className="cc-mono">{r.leading.scored.score}/100</span></span>
                      ) : null}
                    </div>
                    <div className="cc-attn-reasons">{r.attention.reasons.join(' · ')}</div>
                  </div>
                  <button className="cc-btn cc-btn-ghost" onClick={() => go(`#/campaigns/${r.entry.id}`)}>Open</button>
                </div>
              ))}
            </div>
          )}

          <div className="cc-section-label">All projects</div>
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Project</th><th>Status</th><th>Analysed</th><th>Open comments</th><th>Last activity</th><th>Role</th>
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
                      <td className="cc-cell-name">{r.entry.name || 'Untitled project'}</td>
                      <td className="cc-cell-status">{r.entry.status}</td>
                      <td><ReproBadge analysed={r.entry.analysed} total={r.entry.total} /></td>
                      <td>{r.entry.unresolvedComments > 0 ? r.entry.unresolvedComments : '—'}</td>
                      <td className="cc-cell-time">{relativeTime(r.entry.lastActivityAt, now)}</td>
                      <td className="cc-cell-role">{r.entry.role}</td>
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
