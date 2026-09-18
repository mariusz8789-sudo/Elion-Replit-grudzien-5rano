import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { NAV_SECTIONS, MORE_ITEMS, PRIMARY_NAV_ITEMS, activeNavId, type NavItem } from '../core/navigation';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import { ErrorBoundary } from './ErrorBoundary';
import { formatHudTelemetry, snapshotHoloPath, type ManifoldView, type SystemTelemetryView } from '../core/holoTelemetry';

/**
 * The 2040 ambient 3D layer (three.js) is lazy: the initial bundle must not
 * grow for a decoration. It renders BEHIND everything (see styles-2040.css,
 * `.holo-backdrop`), inside its own error boundary so a GPU failure can never
 * take the navigation down with it.
 */
const GenesisHoloBackdrop = lazy(() => import('./GenesisHoloBackdrop').then((m) => ({ default: m.GenesisHoloBackdrop })));

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
 * GENESIS PHYSICS brand mark — "the lattice and the spark". Used on every
 * page (top bar, sidebar, title card) via `GenesisWordmark`.
 * A hexagonal evidence lattice (six nodes, three spokes) around a bright
 * core; one vertex lit green: the single verified node the Winner Gate lets
 * through. Same geometry as public/icon-*.png and og-image.jpg.
 */
export function GenesisMark({ size = 28 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="genesis-mark">
      <defs>
        <linearGradient id="gm-ring" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8ee8f5" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
        <radialGradient id="gm-core" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#c9f4fa" />
          <stop offset="1" stopColor="#8ee8f5" stopOpacity="0" />
        </radialGradient>
      </defs>
      <polygon points="16,4 26.39,10 26.39,22 16,28 5.61,22 5.61,10" fill="none" stroke="url(#gm-ring)" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M16 4 L16 16 M26.39 22 L16 16 M5.61 22 L16 16" fill="none" stroke="url(#gm-ring)" strokeWidth="1.1" strokeOpacity="0.7" strokeLinecap="round" />
      <circle cx="16" cy="16" r="5.2" fill="url(#gm-core)" />
      <circle cx="16" cy="16" r="2.2" fill="#eef2fb" />
      <circle cx="16" cy="4" r="1.25" fill="#eef2fb" />
      <circle cx="26.39" cy="10" r="1.35" fill="#39d97a" />
      <circle cx="26.39" cy="22" r="1.25" fill="#eef2fb" />
      <circle cx="16" cy="28" r="1.25" fill="#eef2fb" />
      <circle cx="5.61" cy="22" r="1.25" fill="#eef2fb" />
      <circle cx="5.61" cy="10" r="1.25" fill="#eef2fb" />
    </svg>
  );
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
  /** The long tail of modules, collapsed by default — see MORE_ITEMS. */
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const onHashChange = (): void => { setHash(window.location.hash || '#/'); setMenuOpen(false); };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

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
    <>
      {/* Ambient 3D layer: fixed, pointer-events:none, z-index below the Matrix
          data stream. A sibling of `.shell` on purpose — `.shell` is its own
          stacking context (z-index 1), so anything inside it would paint OVER
          the data stream instead of under it. */}
      <ErrorBoundary>
        <Suspense fallback={null}>
          <GenesisHoloBackdrop />
        </Suspense>
      </ErrorBoundary>
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
    </>
  );
}

export default AppShell;
