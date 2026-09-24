import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NAV_SECTIONS, MORE_SECTIONS, PRIMARY_NAV_ITEMS, activeNavId, type NavItem } from '../core/navigation';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import { formatHudTelemetry, snapshotHoloPath, type ManifoldView, type SystemTelemetryView } from '../core/holoTelemetry';

/**
 * Range sliders everywhere get a filled, glowing segment (styles-2040.css,
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
 * HUD telemetry: the machine's measured state (`/api/system/telemetry`) and the
 * 5D manifold engine's geometry of the backdrop camera's real flight path
 * (`/api/manifold/evaluate`). Both come from the backend or not at all — the
 * readout is empty when there is nothing measured, never a placeholder number.
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
      <span className="shell-nav-text">
        <span className="shell-nav-label">{item.label}</span>
        {item.description !== undefined && <span className="shell-nav-desc">{item.description}</span>}
      </span>
      {planned && <span className="shell-nav-badge">wkrótce</span>}
    </button>
  );
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
  const [hash, setHash] = useState(() => (typeof window === 'undefined' ? '#/' : window.location.hash || '#/'));
  const [menuOpen, setMenuOpen] = useState(false);
  const menuCloseRef = useRef<HTMLButtonElement>(null);
  /** The long tail of modules, collapsed by default — see MORE_ITEMS. */
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const onHashChange = (): void => { setHash(window.location.hash || '#/'); setMenuOpen(false); };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    menuCloseRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const active = activeNavId(hash);
  useRangeFillPainter();
  const hudTelemetry = useHudTelemetry();
  /** HUD readout under the brand: the real current route, nothing invented. */
  const routeLabel = (hash.replace(/^#\/?/, '').split('?')[0] || 'home').toUpperCase();

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
          <span className="shell-nav-label">Biblioteka</span>
        </button>
        {moreOpen && <div className="shell-nav-groups">
          {MORE_SECTIONS.filter((group) => group.items.length > 0).map((group) => (
            <section className="shell-nav-subgroup" key={group.id} aria-labelledby={`${group.id}-title`}>
              <h3 className="shell-nav-subgroup-title" id={`${group.id}-title`}>{group.label}</h3>
              {group.items.map((item) => (
                <NavButton key={item.id} item={item} active={active === item.id} onNavigate={() => go(item)} />
              ))}
            </section>
          ))}
        </div>}
      </div>
    </>
  );

  return (
    <>
      {/* App owns the single dashboard-only code wallpaper. Worlds own their own scenery. */}
      {/* Legibility scrim over the full-bleed world: a gradient, not a box, so
          the HUD stays borderless while text keeps its contrast. */}
      <div className="hud-scrim" aria-hidden="true" />
    <div className="shell">
      <aside className="shell-sidebar" aria-label="Nawigacja Genesis">
        <button className="shell-brand" onClick={() => { window.location.hash = ''; }} aria-label="Genesis Physics — Start">
          <GenesisWordmark size={30} />
        </button>
        {/* HUD status pill — decorative readout of the live route (the nav
            already carries aria-current, so this stays out of the a11y tree). */}
        <div className="shell-hud" aria-hidden="true" data-testid="shell-hud">
          <span className="shell-hud-dot" />
          <span className="shell-hud-text">SYS · {routeLabel}</span>
          {hudTelemetry !== '' && <span className="shell-hud-telemetry">{hudTelemetry}</span>}
          <span className="shell-hud-bars"><i /><i /><i /><i /></span>
        </div>
        <nav className="shell-nav">{sections}</nav>
        <a className="shell-domain" href="https://genesis-physics.com" target="_blank" rel="noreferrer">genesis-physics.com</a>
      </aside>

      <div className={chatInline ? 'shell-main shell-main-split' : 'shell-main'}>
        <div className="shell-route">{children}</div>
        {chatInline && <div className="shell-chat">{chat}</div>}
      </div>
      {!chatInline && chat}

      {/* Mobile: a real command bar, not a shrunken sidebar. */}
      <nav className="shell-mobilebar" aria-label="Nawigacja Genesis (mobile)" data-testid="mobile-navigation">
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
        <button
          className={`shell-mobilebar-item${menuOpen ? ' active' : ''}`}
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="genesis-mobile-menu"
        >
          <span aria-hidden="true">☰</span>
          <span>Menu</span>
        </button>
      </nav>

      {menuOpen && (
        <>
          <button className="shell-sheet-backdrop" onClick={() => setMenuOpen(false)} aria-label="Zamknij menu" tabIndex={-1} />
          <div id="genesis-mobile-menu" className="shell-sheet" role="dialog" aria-modal="true" aria-label="Pełne menu Genesis">
            <div className="shell-sheet-head">
              <span><strong>Menu</strong><small>Wybierz obszar Genesis</small></span>
              <button ref={menuCloseRef} className="shell-sheet-close" onClick={() => setMenuOpen(false)} aria-label="Zamknij menu">✕</button>
            </div>
            <div className="shell-sheet-body">{sections}</div>
          </div>
        </>
      )}
    </div>
    </>
  );
}

export default AppShell;
