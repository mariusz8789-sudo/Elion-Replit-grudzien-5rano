/**
 * ProductChrome (Stage 4) — a slim, focused product shell for the Grounded Chemistry
 * Assistant. Deliberately NOT the developer console: one clear header (brand + a few
 * links + language + account), centered content. Reuses the design-system tokens + Icon.
 * All labels are i18n keys (EN/PL) so the whole product path switches language together.
 */
import type { ReactNode } from 'react';
import { Icon, type IconName } from '../Icon';
import { useSession, clearSession, getToken } from '../../core/backend/session';
import { logout } from '../../core/backend/client';
import { useI18n } from '../../core/i18n';
import { LanguageSwitcher } from './LanguageSwitcher';

const LINKS: { hash: string; labelKey: string; icon: IconName }[] = [
  { hash: '#/genesis', labelKey: 'nav.dashboard', icon: 'graph' },
  { hash: '#/assistant', labelKey: 'nav.assistant', icon: 'flask' },
  { hash: '#/compare', labelKey: 'nav.compare', icon: 'atom' },
  { hash: '#/campaigns', labelKey: 'nav.projects', icon: 'briefcase' },
  { hash: '#/analyses', labelKey: 'nav.analyses', icon: 'book' },
  { hash: '#/billing', labelKey: 'nav.billing', icon: 'lock' },
];

export function ProductChrome({ active, children }: { active: string; children: ReactNode }) {
  const session = useSession();
  const { t } = useI18n();
  const doLogout = async () => { const tok = getToken(); if (tok) await logout(tok); clearSession(); window.location.hash = '#/genesis'; };
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
              <Icon name={l.icon} size={15} /> <span>{t(l.labelKey)}</span>
            </a>
          ))}
        </nav>
        <div className="product-account">
          <LanguageSwitcher />
          {session ? (
            <>
              <span className="product-email">{session.user.email}</span>
              <button className="ds-btn" onClick={doLogout}>{t('common.signOut')}</button>
            </>
          ) : null}
        </div>
      </header>
      <main className="product-main">{children}</main>
    </div>
  );
}
