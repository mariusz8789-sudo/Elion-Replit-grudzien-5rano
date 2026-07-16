/**
 * DiscoveryShell — the premium operator console shell (V5). A persistent left
 * sidebar (icon + label nav, active-state highlight) + a content area, matching
 * the Mission-Control reference. Wraps every discovery-product screen so they
 * share one navigation model. Hash-routed (no external router), responsive:
 * the sidebar collapses to a top scroll-rail on narrow viewports.
 */
import type { ReactNode } from 'react';
import { Icon, type IconName } from '../Icon';

export interface NavItem { hash: string; label: string; icon: IconName }

/** The discovery console's navigation model. Hashes map to App.tsx routes. */
export const DISCOVERY_NAV: NavItem[] = [
  { hash: '#/dashboard', label: 'Mission Control', icon: 'rocket' },
  { hash: '#/ai-chat', label: 'AI Chat', icon: 'brain' },
  { hash: '#/drug', label: 'Drug Discovery', icon: 'flask' },
  { hash: '#/discovery-forge', label: 'Discovery Forge', icon: 'dna' },
  { hash: '#/campaign', label: 'Kampanie', icon: 'spark' },
  { hash: '#/lab-readiness', label: 'Laboratory Readiness', icon: 'target' },
  { hash: '#/multi-agent', label: 'Multi-Agent AI', icon: 'users' },
  { hash: '#/knowledge-graph', label: 'Knowledge Graph', icon: 'graph' },
  { hash: '#/compute', label: 'Compute Cluster', icon: 'cpu' },
  { hash: '#/scientific-memory', label: 'Scientific Memory', icon: 'memory' },
  { hash: '#/investor', label: 'Investor Dashboard', icon: 'briefcase' },
  { hash: '#/truth-engine', label: 'Truth Engine', icon: 'shield' },
  { hash: '#/discovery-workspace', label: 'Workspace', icon: 'chart' },
];

export function DiscoveryShell({ active, title, subtitle, children, actions }: {
  active: string; title: string; subtitle?: string; children: ReactNode; actions?: ReactNode;
}) {
  return (
    <div className="ds-shell">
      <aside className="ds-sidebar" aria-label="Nawigacja konsoli odkryć">
        <a className="ds-brand" href="#/" aria-label="Genesis OS — strona główna">
          <span className="ds-brand-mark"><Icon name="atom" size={22} /></span>
          <span className="ds-brand-text">GENESIS OS<span className="ds-brand-badge">V5</span></span>
        </a>
        <nav className="ds-nav">
          {DISCOVERY_NAV.map((it) => (
            <a key={it.hash} href={it.hash} className={`ds-nav-item${active === it.hash ? ' active' : ''}`} aria-current={active === it.hash ? 'page' : undefined}>
              <Icon name={it.icon} size={18} />
              <span>{it.label}</span>
            </a>
          ))}
        </nav>
        <a className="ds-nav-item ds-nav-foot" href="#/settings"><Icon name="settings" size={18} /><span>Ustawienia</span></a>
      </aside>
      <div className="ds-main">
        <header className="ds-topbar">
          <div>
            <h1 className="ds-title">{title}</h1>
            {subtitle ? <p className="ds-subtitle">{subtitle}</p> : null}
          </div>
          <div className="ds-topbar-actions">{actions}</div>
        </header>
        <div className="ds-content">{children}</div>
      </div>
    </div>
  );
}

/** A titled panel/card used across the console. */
export function Panel({ title, icon, children, right, className }: {
  title?: string; icon?: IconName; children: ReactNode; right?: ReactNode; className?: string;
}) {
  return (
    <section className={`ds-panel${className ? ' ' + className : ''}`}>
      {title ? (
        <header className="ds-panel-head">
          <span className="ds-panel-title">{icon ? <Icon name={icon} size={16} /> : null}{title}</span>
          {right ? <span className="ds-panel-right">{right}</span> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** A small honesty/status pill. */
export function StatusPill({ kind, children }: { kind: 'ok' | 'blocked' | 'warn' | 'info'; children: ReactNode }) {
  return <span className={`ds-pill ds-pill-${kind}`}>{children}</span>;
}
