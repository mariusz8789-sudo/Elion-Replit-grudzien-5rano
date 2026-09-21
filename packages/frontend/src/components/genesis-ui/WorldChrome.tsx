import type React from 'react';

/**
 * WorldChrome — the ONE header every Genesis Scientific World wears (D-118):
 * glyph · domain · title · one-line research purpose on the left, epistemic
 * badges (REAL / WIZUALIZACJA / NOT_MODELLED / BLOCKED) and live KPI chips in
 * the middle, the world's own actions on the right. It renders exactly what
 * it is given — the screens pass real state; the chrome never invents a
 * number or a status.
 */

export type WorldBadgeTone = 'real' | 'visual' | 'approximation' | 'not-modelled' | 'blocked';

export interface WorldBadge { readonly label: string; readonly tone: WorldBadgeTone; readonly title?: string; }
export interface WorldKpi { readonly label: string; readonly value: React.ReactNode; readonly title?: string; }

export function WorldChrome({ glyph, domain, title, purpose, badges = [], kpis = [], actions, children }: {
  readonly glyph: string;
  readonly domain: string;
  readonly title: string;
  readonly purpose: string;
  readonly badges?: readonly WorldBadge[];
  readonly kpis?: readonly WorldKpi[];
  readonly actions?: React.ReactNode;
  readonly children?: React.ReactNode;
}): React.ReactElement {
  return (
    <header className="world-chrome" data-testid="world-chrome">
      <div className="world-chrome-id">
        <span className="world-chrome-glyph" aria-hidden="true">{glyph}</span>
        <div className="world-chrome-text">
          <span className="world-chrome-domain">{domain}</span>
          <h2 className="world-chrome-title">{title}</h2>
          <p className="world-chrome-purpose">{purpose}</p>
        </div>
      </div>
      {(badges.length > 0 || kpis.length > 0) && (
        <div className="world-chrome-state" aria-label="Stan świata">
          {badges.map((b) => <span key={b.label} className={`gx-status ${b.tone}`} title={b.title}>{b.label}</span>)}
          {kpis.map((k) => (
            <span key={k.label} className="world-chrome-kpi" title={k.title}>
              <b>{k.value}</b><span>{k.label}</span>
            </span>
          ))}
        </div>
      )}
      {actions !== undefined && <div className="world-chrome-actions">{actions}</div>}
      {children}
    </header>
  );
}
