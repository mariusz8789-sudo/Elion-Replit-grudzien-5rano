import { useEffect, useState } from 'react';
import './labs/index';
import { getLab, getLabs } from './core/registry';
import { LabShell } from './components/LabShell';
import { ScaleJourney } from './components/ScaleJourney';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsScreen } from './components/SettingsScreen';
import { DiscoveryLogScreen } from './components/DiscoveryLogScreen';
import { GlossaryScreen } from './components/GlossaryScreen';
import { SearchOverlay } from './components/SearchOverlay';
import { HelpOverlay } from './components/HelpOverlay';
import { hasActiveSim, resetActiveSim, toggleActiveSimRunning } from './core/activeSimControls';
import { track } from './core/analytics';
import { t } from './core/i18n';

/**
 * Genesis OS — powłoka aplikacji.
 * Nawigacja przez hash (#/lab/quantum, #/settings, #/discovery-log,
 * #/glossary), więc wstecz/dalej i odświeżenie działają natywnie na
 * telefonie bez zewnętrznego routera.
 */

type Route =
  | { kind: 'home' }
  | { kind: 'lab'; id: string }
  | { kind: 'settings' }
  | { kind: 'discovery-log' }
  | { kind: 'glossary' };

function parseHash(): Route {
  const h = window.location.hash;
  const lab = h.match(/^#\/lab\/([\w-]+)/);
  if (lab) return { kind: 'lab', id: lab[1] };
  if (h === '#/settings') return { kind: 'settings' };
  if (h === '#/discovery-log') return { kind: 'discovery-log' };
  if (h === '#/glossary') return { kind: 'glossary' };
  return { kind: 'home' };
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Globalne skróty klawiszowe: działają wszędzie poza polami tekstowymi,
  // sterują AKTYWNYM eksperymentem przez most activeSimControls.ts.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (searchOpen) { setSearchOpen(false); return; }
        if (helpOpen) { setHelpOpen(false); return; }
      }
      if (isTypingTarget(e.target)) return;
      if (e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.key === '?') {
        setHelpOpen(true);
        return;
      }
      if (e.code === 'Space') {
        if (hasActiveSim()) {
          e.preventDefault();
          toggleActiveSimRunning();
          track('shortcut_used');
        }
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        if (hasActiveSim()) {
          resetActiveSim();
          track('shortcut_used');
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen, helpOpen]);

  const overlays = (
    <>
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
    </>
  );

  if (route.kind === 'lab') {
    const lab = getLab(route.id);
    if (!lab) {
      return (
        <div className="app">
          <TopBar title="Nieznane laboratorium" onSearch={() => setSearchOpen(true)} />
          <main className="home">
            <p className="empty-state">Nie znaleziono laboratorium „{route.id}".</p>
            <button className="chip-btn" onClick={() => { window.location.hash = ''; }}>← Wróć</button>
          </main>
          {overlays}
        </div>
      );
    }
    const View = lab.CustomView;
    return (
      <div className="app">
        <header className="topbar">
          <button className="back" aria-label="Wróć do laboratoriów" onClick={() => { window.location.hash = ''; }}>
            ←
          </button>
          <div className="titles">
            <h1>{lab.icon} {lab.name}</h1>
            <p className="tagline">{lab.tagline}</p>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="lab-main">
          <ErrorBoundary key={lab.id}>
            {View ? <View lab={lab} /> : <LabShell key={lab.id} lab={lab} />}
          </ErrorBoundary>
        </main>
        {overlays}
      </div>
    );
  }

  if (route.kind === 'settings') {
    return (
      <div className="app">
        <TopBar title={`⚙ ${t('nav.settings')}`} onSearch={() => setSearchOpen(true)} />
        <SettingsScreen />
        {overlays}
      </div>
    );
  }

  if (route.kind === 'discovery-log') {
    return (
      <div className="app">
        <TopBar title={`🏆 ${t('nav.discoveryLog')}`} onSearch={() => setSearchOpen(true)} />
        <DiscoveryLogScreen />
        {overlays}
      </div>
    );
  }

  if (route.kind === 'glossary') {
    return (
      <div className="app">
        <TopBar title={`📚 ${t('nav.glossary')}`} onSearch={() => setSearchOpen(true)} />
        <GlossaryScreen />
        {overlays}
      </div>
    );
  }

  return (
    <div className="app">
      <main className="home" id="main-content" tabIndex={-1}>
        <ScaleJourney />
        <nav className="home-nav" aria-label="Nawigacja Genesis OS">
          <button onClick={() => setSearchOpen(true)}>
            <span aria-hidden="true">🔍</span> {t('nav.search')}
          </button>
          <button onClick={() => { window.location.hash = '#/discovery-log'; }}>
            <span aria-hidden="true">🏆</span> {t('nav.discoveryLog')}
          </button>
          <button onClick={() => { window.location.hash = '#/glossary'; }}>
            <span aria-hidden="true">📚</span> {t('nav.glossary')}
          </button>
          <button onClick={() => { window.location.hash = '#/settings'; }}>
            <span aria-hidden="true">⚙</span> {t('nav.settings')}
          </button>
        </nav>
        <div className="section-label">Laboratoria · {getLabs().length} modułów</div>
        <div className="labs-grid">
          {getLabs().map((l) => (
            <button
              key={l.id}
              className="lab-card"
              style={{ ['--accent' as string]: l.accent }}
              onClick={() => { window.location.hash = `#/lab/${l.id}`; }}
            >
              <span className="icon" aria-hidden="true">{l.icon}</span>
              <span className="name">{l.name}</span>
              <span className="desc">{l.tagline}</span>
            </button>
          ))}
        </div>
        <p className="footer-note">
          Genesis OS · Każda symulacja nosi etykietę uczciwości naukowej: hipotezy nigdy nie udają faktów.
          Naciśnij <kbd>/</kbd>, aby szukać, albo <kbd>?</kbd> po listę skrótów.
        </p>
      </main>
      {overlays}
    </div>
  );
}

function TopBar({ title, onSearch }: { title: string; onSearch: () => void }) {
  return (
    <header className="topbar">
      <button className="back" aria-label="Wróć do laboratoriów" onClick={() => { window.location.hash = ''; }}>
        ←
      </button>
      <div className="titles">
        <h1>{title}</h1>
      </div>
      <button className="back" aria-label={t('nav.search')} onClick={onSearch} style={{ marginLeft: 'auto' }}>
        🔍
      </button>
    </header>
  );
}
