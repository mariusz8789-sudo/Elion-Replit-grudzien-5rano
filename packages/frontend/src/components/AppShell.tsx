import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  DEMO_SECTION_ID, MORE_OVERVIEW_ITEM, activeNavId, requestOpenSearch, sectionOfNavId,
  type NavItem, type NavSection,
} from '../core/navigation';
import { menuForProfile, primaryForMenu } from '../core/profileNavigation';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import { formatHudTelemetry, snapshotHoloPath, type ManifoldView, type SystemTelemetryView } from '../core/holoTelemetry';
import { useSession } from '../core/backend/session';
import { profileLabel, profileOfUser } from '../core/accountProfiles';
import { LOCALE_NATIVE_NAME, LOCALE_SHORT, UI_LOCALES, setLocale, useLocale } from '../core/i18n';
import { navDescription, navGroupLabel, navLabel, navShortLabel, shellText } from '../core/navigationText';
import { useFocusTrap } from '../core/useFocusTrap';
import { Icon, type IconName } from './home/Icon';

/** PL / EN / عربي: the whole page switches, Arabic reads right to left. */
function LanguageSwitch(): JSX.Element {
  const locale = useLocale();
  return (
    <div className="shell-lang gn-lang" role="group" aria-label={shellText('language')} data-testid="language-switch">
      {UI_LOCALES.map((l) => (
        <button key={l} type="button" lang={l} className={`shell-lang-btn${locale === l ? ' is-on' : ''}`} aria-pressed={locale === l} title={LOCALE_NATIVE_NAME[l]} onClick={() => setLocale(l)} data-testid={`language-${l}`}>{LOCALE_SHORT[l]}</button>
      ))}
    </div>
  );
}

/**
 * Account entry of the shell: "Zaloguj się" when signed out, the user's name
 * and profile when signed in. Always leads to `#/konto` (AccountScreen).
 */
function useAccountEntry(): { signedIn: boolean; title: string; subtitle: string; short: string } {
  const session = useSession();
  if (!session) return { signedIn: false, title: shellText('signIn'), subtitle: shellText('orSignUp'), short: shellText('signInShort') };
  const name = session.user.displayName || session.user.email;
  return { signedIn: true, title: name, subtitle: profileLabel(profileOfUser(session.user)), short: name.split(/\s+/)[0] ?? name };
}

function AccountEntry({ active, onNavigate }: { active: boolean; onNavigate: () => void }): JSX.Element {
  const entry = useAccountEntry();
  return (
    <a
      href="#/konto"
      className={`gn-account${active ? ' is-active' : ''}${entry.signedIn ? ' signed-in' : ''}`}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={`${entry.title} · ${entry.subtitle}`}
      data-testid="shell-account"
    >
      <span className="gn-ico" aria-hidden="true"><Icon name="user" /></span>
      <span className="gn-account-text gn-text">
        <strong>{entry.title}</strong>
        <small>{entry.subtitle}</small>
      </span>
    </a>
  );
}

/**
 * Range sliders everywhere get a filled segment (styles-2040.css,
 * `--fill-pct`). `Controls.tsx` already sets that variable for its own
 * sliders; this paints it for every OTHER `input[type=range]` in the app so
 * the fill matches the thumb without each screen having to know about it.
 * Progressive: if this never runs, the rail is simply unfilled.
 */
function paintRangeFill(input: HTMLInputElement): void {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value) || max <= min) return;
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  input.style.setProperty('--fill-pct', `${pct.toFixed(2)}%`);
}

/**
 * Server telemetry: the machine's measured state (`/api/system/telemetry`) and
 * the manifold geometry of the backdrop camera's real flight path
 * (`/api/manifold/evaluate`). Both come from the backend or not at all — the
 * readout is empty when there is nothing measured, never a placeholder number.
 * It is technical detail, so the sidebar keeps it folded under "Server status".
 */
function useHudTelemetry(): string {
  const [sys, setSys] = useState<SystemTelemetryView | null>(null);
  const [manifold, setManifold] = useState<ManifoldView | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;
    let alive = true;
    const pullSystem = async (): Promise<void> => {
      try {
        const r = await fetch('/api/system/telemetry', { signal: AbortSignal.timeout(4000) });
        if (!r.ok) return;
        const j = (await r.json()) as SystemTelemetryView & { ok?: boolean };
        if (alive && j && typeof j.cpuCount === 'number') setSys(j);
      } catch { /* backend absent: the readout stays empty */ }
    };
    const pullManifold = async (): Promise<void> => {
      const points = snapshotHoloPath();
      if (points.length < 3) return;
      try {
        const r = await fetch('/api/manifold/evaluate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nodeId: 'HUD', points }), signal: AbortSignal.timeout(4000) });
        if (!r.ok) return;
        const j = (await r.json()) as { manifold?: ManifoldView };
        if (alive && j.manifold) setManifold(j.manifold);
      } catch { /* backend absent */ }
    };
    void pullSystem();
    const a = window.setInterval(() => { void pullSystem(); }, 15000);
    const b = window.setInterval(() => { void pullManifold(); }, 20000);
    const first = window.setTimeout(() => { void pullManifold(); }, 6000);
    return () => { alive = false; window.clearInterval(a); window.clearInterval(b); window.clearTimeout(first); };
  }, []);
  return formatHudTelemetry(sys, manifold);
}

function useRangeFillPainter(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const paintAll = (): void => {
      document.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(paintRangeFill);
    };
    const onInput = (event: Event): void => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === 'range') paintRangeFill(target);
    };
    let scheduled = 0;
    const schedule = (): void => {
      if (scheduled !== 0) return;
      scheduled = window.requestAnimationFrame(() => { scheduled = 0; paintAll(); });
    };
    paintAll();
    document.addEventListener('input', onInput, true);
    document.addEventListener('change', onInput, true);
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule);
    observer?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['value'] });
    return () => {
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('change', onInput, true);
      observer?.disconnect();
      if (scheduled !== 0) window.cancelAnimationFrame(scheduled);
    };
  }, []);
}

/**
 * APP SHELL — the frame that makes Genesis one product instead of ~35 screens
 * that each happened to be reachable.
 *
 * Desktop gets a collapsible sidebar: six capability groups, two levels at
 * most (group → place). A phone gets a tab bar with the four places people
 * return to plus More, which opens a full-screen explorer — a shrunk-down
 * sidebar is exactly the "mobile is just a smaller desktop" failure. Every
 * surface renders from the SAME `core/navigation.ts` model (filtered per
 * account profile by `core/profileNavigation.ts`): one navigation truth.
 *
 * It owns no routing: `App.tsx` still parses the hash and decides what to
 * render. Places are plain `href="#/…"` links, so this is a frame around the
 * router rather than a second one.
 */

/**
 * GENESIS PHYSICS brand mark — the chrome-and-glass hexagonal lattice with a
 * lit core (public/brand/genesis-mark.png, the same artwork as the PWA icons
 * and og-image.jpg). Used on every page (top bar, sidebar, title card) via
 * `GenesisWordmark`. Decorative: the wordmark text carries the name.
 */
export function GenesisMark({ size = 28 }: { size?: number }): JSX.Element {
  return <img src="/brand/genesis-mark.png" width={size} height={size} alt="" aria-hidden="true" className="genesis-mark" decoding="async" />;
}

/** Mark + name, one component for every page's chrome. */
export function GenesisWordmark({ size = 26, tagline = true }: { size?: number; tagline?: boolean }): JSX.Element {
  return (
    <span className="genesis-wordmark">
      <span className="genesis-wordmark-mark"><GenesisMark size={size} /></span>
      <span className="genesis-wordmark-text">
        <strong>GENESIS<em>PHYSICS</em></strong>
        {tagline && <small>Scientific OS</small>}
      </span>
    </span>
  );
}

/** One line icon per main place; More entries are text rows. */
const PLACE_ICON: Readonly<Record<string, IconName>> = {
  home: 'home', chat: 'spark', discover: 'runs', inquiry: 'bulb',
  science: 'pill', 'human-biology-lab': 'body', molecule: 'molecule', 'cms-open-data': 'atom', 'scientific-worlds': 'flask',
  evidence: 'replay', reviewer: 'review', memory: 'memory', verify: 'verify',
  'flight-control': 'gauge', dossier: 'box', pilot: 'export', 'scientific-os': 'grid',
};

const GROUP_ICON: Readonly<Record<string, IconName>> = {
  research: 'runs', explore: 'atom', proof: 'shield', operations: 'gauge', deliver: 'box',
  'more-ls': 'pill', 'more-physics': 'atom', 'more-public': 'shield', 'more-learning': 'flask', 'more-system': 'cpu', 'more-showcase': 'grid',
};

function placeIcon(item: NavItem): IconName {
  return PLACE_ICON[item.id] ?? 'chevron';
}

/** A place in the menu: a real link for a route, a button for an action, a disabled row when planned. */
function Place({ item, active, onSelect, variant = 'row', demo = false }: {
  item: NavItem;
  active: boolean;
  onSelect: () => void;
  variant?: 'row' | 'tab';
  demo?: boolean;
}): JSX.Element {
  const label = variant === 'tab' ? navShortLabel(item) : navLabel(item);
  const description = variant === 'row' ? navDescription(item) : undefined;
  const className = variant === 'tab' ? `gn-tab${active ? ' is-active' : ''}` : `gn-place${active ? ' is-active' : ''}${item.status === 'planned' ? ' is-planned' : ''}`;
  const body = (
    <>
      {variant === 'tab' || PLACE_ICON[item.id] !== undefined
        ? <span className="gn-ico" aria-hidden="true"><Icon name={placeIcon(item)} /></span>
        : null}
      <span className="gn-text">
        <span className="gn-label">{label}</span>
        {description !== undefined && <span className="gn-desc">{description}</span>}
      </span>
      {demo && <span className="gn-badge gn-badge-demo">{shellText('demo')}</span>}
      {item.status === 'planned' && <span className="gn-badge">{shellText('soon')}</span>}
    </>
  );
  if (item.status === 'planned') {
    return <span className={className} aria-disabled="true" title={item.plannedNote}>{body}</span>;
  }
  if (item.kind === 'chat' || !item.hash) {
    return <button type="button" className={className} onClick={onSelect} title={label}>{body}</button>;
  }
  return (
    <a href={item.hash} className={className} aria-current={active ? 'page' : undefined} onClick={onSelect} title={label}>
      {body}
    </a>
  );
}

const COLLAPSE_KEY = 'genesis.nav.collapsed';

function readCollapsed(): boolean {
  try { return typeof window !== 'undefined' && window.localStorage?.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
}

function writeCollapsed(value: boolean): void {
  try { window.localStorage?.setItem(COLLAPSE_KEY, value ? '1' : '0'); } catch { /* private mode: not remembered */ }
}

export function AppShell({ children, chat, chatInline = false }: {
  children: ReactNode;
  /** The ONE ScienceChat instance, handed in by App.tsx. */
  chat?: ReactNode;
  /** When true the chat is laid out as the workspace column beside the route
      instead of floating over it. Same node either way — the chat is never
      mounted twice, so its conversation never forks. */
  chatInline?: boolean;
}): JSX.Element {
  // The menu re-renders in the chosen language.
  useLocale();
  const [hash, setHash] = useState(() => (typeof window === 'undefined' ? '#/' : window.location.hash || '#/'));
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  /** Main groups the person folded; the group holding the current place never folds. */
  const [foldedGroups, setFoldedGroups] = useState<ReadonlySet<string>>(() => new Set());
  /** More capabilities whose alternative screens (variants) are unfolded. */
  const [openVariants, setOpenVariants] = useState<ReadonlySet<string>>(() => new Set());
  const explorerRef = useRef<HTMLDivElement>(null);
  const explorerCloseRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(explorerRef, explorerOpen);

  const toggleSet = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  };

  useEffect(() => {
    const onHashChange = (): void => { setHash(window.location.hash || '#/'); setExplorerOpen(false); };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!explorerOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.stopPropagation(); setExplorerOpen(false); }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    explorerCloseRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [explorerOpen]);

  const toggleCollapsed = (): void => setCollapsed((value) => { writeCollapsed(!value); return !value; });

  const active = activeNavId(hash);
  const activeSection = sectionOfNavId(active);
  useRangeFillPainter();
  const telemetry = useHudTelemetry();

  // Uczeń, student i nauczyciel dostają krótsze menu (core/profileNavigation.ts); gość, badacz i instytucja — pełne.
  const session = useSession();
  const profile = profileOfUser(session?.user);
  const menu = menuForProfile(profile);
  const tabs = primaryForMenu(menu);
  const accountActive = active === 'account';
  const closeExplorer = useCallback(() => setExplorerOpen(false), []);

  const select = (item: NavItem): void => {
    if (item.kind === 'chat') requestOpenScienceChat();
    setExplorerOpen(false);
  };
  const openSearch = (): void => { setExplorerOpen(false); requestOpenSearch(); };

  const [homeSection, ...groups] = menu.main;
  const moreSections = menu.more.filter((section) => section.items.length > 0);

  /** Desktop sidebar group: a header that folds, then its places. */
  const sidebarGroup = (section: NavSection): JSX.Element => {
    const open = !foldedGroups.has(section.id) || section.id === activeSection || collapsed;
    const listId = `gn-group-${section.id}`;
    return (
      <div className="gn-group" key={section.id}>
        <button
          type="button"
          className="gn-group-head"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setFoldedGroups((set) => toggleSet(set, section.id))}
        >
          <span className="gn-group-title">{navGroupLabel(section)}</span>
          <span className={`gn-chev${open ? ' is-open' : ''}`} aria-hidden="true"><Icon name="chevron" /></span>
        </button>
        <ul className="gn-list" id={listId} hidden={!open}>
          {section.items.map((item) => (
            <li key={item.id}><Place item={item} active={active === item.id} onSelect={() => select(item)} /></li>
          ))}
        </ul>
      </div>
    );
  };

  /** More group inside the explorer: one row per capability, alternative screens folded under it. */
  const explorerGroup = (section: NavSection): JSX.Element => {
    const demo = section.id === DEMO_SECTION_ID;
    return (
      <section className={`gn-x-card${demo ? ' gn-x-demo' : ''}`} key={section.id} aria-labelledby={`gn-x-${section.id}`}>
        <h3 id={`gn-x-${section.id}`} className="gn-x-card-title">
          {GROUP_ICON[section.id] && <span className="gn-ico" aria-hidden="true"><Icon name={GROUP_ICON[section.id]!} /></span>}
          {navGroupLabel(section)}
        </h3>
        {demo && <p className="gn-x-note">{shellText('demoNote')}</p>}
        <ul className="gn-list">
          {section.items.map((item) => {
            const variants = menu.variants(item.id);
            const unfolded = openVariants.has(item.id) || variants.some((v) => v.id === active);
            const variantsId = `gn-v-${item.id}`;
            return (
              <li key={item.id} className="gn-x-cap">
                <Place item={item} active={active === item.id} onSelect={() => select(item)} demo={demo} />
                {variants.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="gn-variants-toggle"
                      aria-expanded={unfolded}
                      aria-controls={variantsId}
                      aria-label={`${shellText(unfolded ? 'hideViews' : 'showViews')} ${shellText('otherViews')}: ${navLabel(item)} (${variants.length})`}
                      onClick={() => setOpenVariants((set) => toggleSet(set, item.id))}
                    >
                      <span className={`gn-chev${unfolded ? ' is-open' : ''}`} aria-hidden="true"><Icon name="chevron" /></span>
                      {shellText('otherViews')} ({variants.length})
                    </button>
                    <ul className="gn-list gn-variants" id={variantsId} hidden={!unfolded}>
                      {variants.map((variant) => (
                        <li key={variant.id}><Place item={variant} active={active === variant.id} onSelect={() => select(variant)} /></li>
                      ))}
                    </ul>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  return (
    <>
      {/* App owns the single dashboard-only code wallpaper. Worlds own their own scenery. */}
      <div className="hud-scrim" aria-hidden="true" />
    <div className="shell" data-nav={collapsed ? 'collapsed' : 'expanded'}>
      <nav className={`gn-side${collapsed ? ' is-collapsed' : ''}`} id="genesis-sidebar" aria-label={shellText('navigation')} data-testid="desktop-navigation">
        <div className="gn-side-head">
          <a className="gn-brand" href="#/" aria-label="Genesis Physics — Start">
            <GenesisWordmark size={28} />
          </a>
          <button
            type="button"
            className="gn-collapse"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="genesis-sidebar"
            aria-label={shellText(collapsed ? 'expand' : 'collapse')}
            title={shellText(collapsed ? 'expand' : 'collapse')}
            data-testid="nav-collapse"
          >
            <Icon name="sidebar" />
          </button>
        </div>

        <button type="button" className="gn-search" onClick={openSearch} title={shellText('search')} data-testid="nav-search">
          <span className="gn-ico" aria-hidden="true"><Icon name="search" /></span>
          <span className="gn-text gn-label">{shellText('search')}</span>
          <kbd className="gn-kbd" aria-hidden="true">/</kbd>
        </button>

        <div className="gn-scroll">
          {homeSection && (
            <ul className="gn-list gn-home">
              {homeSection.items.map((item) => (
                <li key={item.id}><Place item={item} active={active === item.id} onSelect={() => select(item)} /></li>
              ))}
            </ul>
          )}
          {groups.map(sidebarGroup)}
          <div className="gn-group gn-group-more">
            <button
              type="button"
              className={`gn-place gn-more${explorerOpen ? ' is-active' : ''}`}
              onClick={() => setExplorerOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={explorerOpen}
              aria-controls="genesis-explorer"
              title={menu.simplified ? shellText('more') : shellText('moreAll')}
              data-testid="nav-more"
            >
              <span className="gn-ico" aria-hidden="true"><Icon name="grid" /></span>
              <span className="gn-text"><span className="gn-label">{menu.simplified ? shellText('more') : shellText('moreAll')}</span></span>
            </button>
          </div>
        </div>

        <div className="gn-side-foot">
          <AccountEntry active={accountActive} onNavigate={() => setExplorerOpen(false)} />
          <LanguageSwitch />
          {telemetry !== '' && (
            <details className="gn-sys" data-testid="shell-hud" data-technical-details>
              <summary>{shellText('serverStatus')}</summary>
              <p>{telemetry}</p>
            </details>
          )}
          <a className="gn-domain" href="https://genesis-physics.com" target="_blank" rel="noreferrer">genesis-physics.com</a>
        </div>
      </nav>

      <div className={chatInline ? 'shell-main shell-main-split' : 'shell-main'}>
        <div className="shell-route">{children}</div>
        {chatInline && <div className="shell-chat">{chat}</div>}
      </div>
      {!chatInline && chat}

      {/* Mobile: a tab bar of the places people return to, not a shrunken sidebar. */}
      <nav className="gn-tabbar" aria-label={`${shellText('navigation')} (mobile)`} data-testid="mobile-navigation">
        {tabs.map((item) => (
          <Place key={item.id} item={item} variant="tab" active={active === item.id} onSelect={() => select(item)} />
        ))}
        <button
          type="button"
          className={`gn-tab${explorerOpen ? ' is-active' : ''}`}
          onClick={() => setExplorerOpen((open) => !open)}
          aria-haspopup="dialog"
          aria-expanded={explorerOpen}
          aria-controls="genesis-explorer"
          data-testid="mobile-more"
        >
          <span className="gn-ico" aria-hidden="true"><Icon name="menu" /></span>
          <span className="gn-text"><span className="gn-label">{shellText('more')}</span></span>
        </button>
      </nav>

      {explorerOpen && (
        <>
          <div className="gn-x-backdrop" onClick={closeExplorer} aria-hidden="true" />
          <div
            ref={explorerRef}
            id="genesis-explorer"
            className="gn-x"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gn-x-title"
            data-testid="nav-explorer"
          >
            <header className="gn-x-head">
              <div className="gn-x-titles">
                <h2 id="gn-x-title">{shellText('more')}</h2>
                <p>{menu.simplified ? `${shellText('profileMenu')}: ${profileLabel(profile)}` : shellText('explorer')}</p>
              </div>
              <button ref={explorerCloseRef} type="button" className="gn-x-close" onClick={closeExplorer} aria-label={shellText('closeMenu')} data-testid="nav-explorer-close">
                <Icon name="close" />
              </button>
            </header>
            <div className="gn-x-body">
              <button type="button" className="gn-x-search" onClick={openSearch} data-testid="explorer-search">
                <span className="gn-ico" aria-hidden="true"><Icon name="search" /></span>
                <span>{shellText('searchHint')}</span>
              </button>

              <div className="gn-x-main">
                {groups.map((section) => (
                  <section className="gn-x-card" key={section.id} aria-labelledby={`gn-x-${section.id}`}>
                    <h3 id={`gn-x-${section.id}`} className="gn-x-card-title">
                      {GROUP_ICON[section.id] && <span className="gn-ico" aria-hidden="true"><Icon name={GROUP_ICON[section.id]!} /></span>}
                      {navGroupLabel(section)}
                    </h3>
                    <ul className="gn-list">
                      {section.items.map((item) => (
                        <li key={item.id}><Place item={item} active={active === item.id} onSelect={() => select(item)} /></li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>

              <h3 className="gn-x-section-title">{shellText('moreModules')}</h3>
              {menu.showOverview && (
                <div className="gn-x-overview">
                  <Place item={MORE_OVERVIEW_ITEM} active={active === MORE_OVERVIEW_ITEM.id} onSelect={() => select(MORE_OVERVIEW_ITEM)} />
                </div>
              )}
              <div className="gn-x-grid">{moreSections.map(explorerGroup)}</div>

              {/* On a phone the explorer also carries what the desktop sidebar footer holds. */}
              <div className="gn-x-mobile-only">
                <AccountEntry active={accountActive} onNavigate={closeExplorer} />
                <LanguageSwitch />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
    </>
  );
}

export default AppShell;
