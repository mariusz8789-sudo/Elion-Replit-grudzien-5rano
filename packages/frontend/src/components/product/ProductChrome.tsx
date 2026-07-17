/**
 * ProductChrome (Stage 4) — a slim, focused product shell for the Grounded Chemistry
 * Assistant. Deliberately NOT the developer console: one clear header (brand + a few
 * links + account), centered content. Reuses the design-system tokens + Icon.
 */
import type { ReactNode } from 'react';
import { Icon, type IconName } from '../Icon';
import { useSession, clearSession, getToken } from '../../core/backend/session';
import { logout } from '../../core/backend/client';

const LINKS: { hash: string; label: string; icon: IconName }[] = [
  { hash: '#/genesis', label: 'Pulpit', icon: 'graph' },
  { hash: '#/assistant', label: 'Asystent', icon: 'flask' },
  { hash: '#/compare', label: 'Porównaj', icon: 'atom' },
  { hash: '#/campaigns', label: 'Kampanie', icon: 'briefcase' },
  { hash: '#/analyses', label: 'Moje analizy', icon: 'book' },
  { hash: '#/billing', label: 'Rozliczenia', icon: 'lock' },
];

export function ProductChrome({ active, children }: { active: string; children: ReactNode }) {
  const session = useSession();
  const doLogout = async () => { const t = getToken(); if (t) await logout(t); clearSession(); window.location.hash = '#/genesis'; };
  return (
    <div className="product">
      <header className="product-top">
        <a className="product-brand" href="#/genesis">
          <span className="product-brand-mark"><Icon name="flask" size={20} /></span>
          <span className="product-brand-text">Genesis <em>Grounded Chemistry</em></span>
        </a>
        <nav className="product-nav">
          {LINKS.map((l) => (
            <a key={l.hash} href={l.hash} className={`product-link${active === l.hash ? ' active' : ''}`}>
              <Icon name={l.icon} size={15} /> <span>{l.label}</span>
            </a>
          ))}
        </nav>
        <div className="product-account">
          {session ? (
            <>
              <span className="product-email">{session.user.email}</span>
              <button className="ds-btn" onClick={doLogout}>Wyloguj</button>
            </>
          ) : null}
        </div>
      </header>
      <main className="product-main">{children}</main>
    </div>
  );
}
