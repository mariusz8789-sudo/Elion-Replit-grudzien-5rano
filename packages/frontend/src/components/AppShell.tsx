import { useEffect, useState, type ReactNode } from 'react';
import { NAV_SECTIONS, MORE_ITEMS, PRIMARY_NAV_ITEMS, activeNavId, type NavItem } from '../core/navigation';
import { requestOpenScienceChat } from '../core/scienceChatBridge';

/**
 * APP SHELL — the frame that makes Genesis one product instead of ~35 screens
 * that each happened to be reachable.
 *
 * Desktop gets a persistent sidebar; a phone gets a bottom command bar plus a
 * full menu sheet, because a shrunk-down sidebar is exactly the "mobile is
 * just a smaller desktop" failure. Both render from the SAME `NAV_SECTIONS`
 * model — there is one navigation truth, not a desktop one and a mobile one
 * that drift apart.
 *
 * It owns no routing: `App.tsx` still parses the hash and decides what to
 * render. This only sets `window.location.hash`, exactly as every existing
 * button in the app already does, so it is a frame around the router rather
 * than a second router.
 */

function NavButton({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: () => void }): JSX.Element {
  const planned = item.status === 'planned';
  return (
    <button
      className={`shell-nav-item${active ? ' active' : ''}${planned ? ' planned' : ''}`}
      onClick={() => { if (!planned) onNavigate(); }}
      aria-current={active ? 'page' : undefined}
      aria-disabled={planned || undefined}
      title={planned ? item.plannedNote : undefined}
    >
      <span className="shell-nav-icon" aria-hidden="true">{item.icon}</span>
      <span className="shell-nav-label">{item.label}</span>
      {planned && <span className="shell-nav-badge">wkrótce</span>}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const [hash, setHash] = useState(() => (typeof window === 'undefined' ? '#/' : window.location.hash || '#/'));
  const [menuOpen, setMenuOpen] = useState(false);
  /** The long tail of modules, collapsed by default — see MORE_ITEMS. */
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const onHashChange = (): void => { setHash(window.location.hash || '#/'); setMenuOpen(false); };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const active = activeNavId(hash);

  const go = (item: NavItem): void => {
    if (item.kind === 'chat') { requestOpenScienceChat(); setMenuOpen(false); return; }
    if (!item.hash) return;
    window.location.hash = item.hash === '#/' ? '' : item.hash;
    setMenuOpen(false);
  };

  const sections = (
    <>
      {NAV_SECTIONS.map((section) => (
        <div className="shell-nav-section" key={section.id}>
          {section.label && <h2 className="shell-nav-section-title">{section.label}</h2>}
          {section.items.map((item) => (
            <NavButton key={item.id} item={item} active={active === item.id} onNavigate={() => go(item)} />
          ))}
        </div>
      ))}
      <div className="shell-nav-section">
        <button className="shell-nav-more" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>
          <span className="shell-nav-icon" aria-hidden="true">{moreOpen ? '−' : '+'}</span>
          <span className="shell-nav-label">Wszystkie moduły</span>
          <span className="shell-nav-badge">{MORE_ITEMS.length}</span>
        </button>
        {moreOpen && MORE_ITEMS.map((item) => (
          <NavButton key={item.id} item={item} active={active === item.id} onNavigate={() => go(item)} />
        ))}
      </div>
    </>
  );

  return (
    <div className="shell">
      <aside className="shell-sidebar" aria-label="Nawigacja Genesis">
        <button className="shell-brand" onClick={() => { window.location.hash = ''; }}>
          <span className="shell-brand-mark" aria-hidden="true">◈</span>
          <span className="shell-brand-text">
            <strong>GENESIS</strong>
            <em>Scientific OS</em>
          </span>
        </button>
        <nav className="shell-nav">{sections}</nav>
      </aside>

      <div className="shell-main">{children}</div>

      {/* Mobile: a real command bar, not a shrunken sidebar. */}
      <nav className="shell-mobilebar" aria-label="Nawigacja Genesis (mobile)">
        {PRIMARY_NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`shell-mobilebar-item${active === item.id ? ' active' : ''}`}
            onClick={() => go(item)}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label.split(' ')[0]}</span>
          </button>
        ))}
        <button className="shell-mobilebar-item" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen}>
          <span aria-hidden="true">☰</span>
          <span>Więcej</span>
        </button>
      </nav>

      {menuOpen && (
        <div className="shell-sheet" role="dialog" aria-label="Pełne menu Genesis">
          <div className="shell-sheet-head">
            <strong>Genesis</strong>
            <button className="shell-sheet-close" onClick={() => setMenuOpen(false)} aria-label="Zamknij menu">✕</button>
          </div>
          <div className="shell-sheet-body">{sections}</div>
        </div>
      )}
    </div>
  );
}

export default AppShell;
