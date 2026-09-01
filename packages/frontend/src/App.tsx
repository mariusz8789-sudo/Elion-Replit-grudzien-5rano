import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import './labs/index';
import { getLab, getLabs } from './core/registry';
import { LabShell } from './components/LabShell';
import { ScaleJourney } from './components/ScaleJourney';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsScreen } from './components/SettingsScreen';
import { ScientificMemoryScreen } from './components/ScientificMemoryScreen';
import { DiscoveryLogScreen } from './components/DiscoveryLogScreen';
import { GlossaryScreen } from './components/GlossaryScreen';
import { WhatIfScreen } from './components/WhatIfScreen';
import { SearchOverlay } from './components/SearchOverlay';
import { HelpOverlay } from './components/HelpOverlay';
import { OnboardingOverlay } from './components/OnboardingOverlay';
import { hasActiveSim, resetActiveSim, toggleActiveSimRunning } from './core/activeSimControls';
import { track } from './core/analytics';
import { getSettings } from './core/settings';
import { t } from './core/i18n';
import { hasCompletedOnboarding, markOnboardingComplete } from './core/onboarding';
import { playEnterLab } from './core/sound';
import { RealityCanvas } from './components/RealityCanvas';
import { ScienceChat } from './components/ScienceChat';

/**
 * P0-hardening: ciężkie/opcjonalne ekrany ładowane leniwie (React.lazy).
 * Efekt: (1) rdzeń edukacyjny startuje szybciej i mniejszym bundlem, (2)
 * awaria (lub błąd importu) JEDNEGO ciężkiego modułu nie może wyzerować całej
 * aplikacji — każdy jest owinięty w <HeavyRoute> (ErrorBoundary + Suspense),
 * więc pokazuje kartę błędu/ładowania, a nie biały ekran. Named-exporty
 * mapujemy na `default`, którego wymaga React.lazy.
 */
const DiscoveryTimeline = lazy(() => import('./components/DiscoveryTimeline').then((m) => ({ default: m.DiscoveryTimeline })));
const PlaceTimeline = lazy(() => import('./components/PlaceTimeline').then((m) => ({ default: m.PlaceTimeline })));
const QuantumDecisionExplorer = lazy(() => import('./components/QuantumDecisionExplorer').then((m) => ({ default: m.QuantumDecisionExplorer })));
const RealityNavigator = lazy(() => import('./components/RealityNavigator').then((m) => ({ default: m.RealityNavigator })));
const EngineeringNavigator = lazy(() => import('./components/EngineeringNavigator').then((m) => ({ default: m.EngineeringNavigator })));
const ModelConflictPanel = lazy(() => import('./components/ModelConflictPanel').then((m) => ({ default: m.ModelConflictPanel })));
const CloudProjectsScreen = lazy(() => import('./components/CloudProjectsScreen').then((m) => ({ default: m.CloudProjectsScreen })));
const CandidateDiscoveryScreen = lazy(() => import('./components/CandidateDiscoveryScreen').then((m) => ({ default: m.CandidateDiscoveryScreen })));
const DrugDiscoveryScreen = lazy(() => import('./components/DrugDiscoveryScreen').then((m) => ({ default: m.DrugDiscoveryScreen })));
const CandidateDossierScreen = lazy(() => import('./components/CandidateDossierScreen').then((m) => ({ default: m.CandidateDossierScreen })));
const CampaignScreen = lazy(() => import('./components/CampaignScreen').then((m) => ({ default: m.CampaignScreen })));
const SimulationGeneratorScreen = lazy(() => import('./components/SimulationGeneratorScreen').then((m) => ({ default: m.SimulationGeneratorScreen })));
const ModelComparisonScreen = lazy(() => import('./components/ModelComparisonScreen').then((m) => ({ default: m.ModelComparisonScreen })));
const VisualSimulationScreen = lazy(() => import('./components/visual-simulation/VisualSimulationScreen').then((m) => ({ default: m.VisualSimulationScreen })));
const City3DWebGLScreen = lazy(() => import('./components/visual-simulation/City3DWebGLScreen').then((m) => ({ default: m.City3DWebGLScreen })));
const ConceptFilmScreen = lazy(() => import('./components/visual-simulation/ConceptFilmScreen').then((m) => ({ default: m.ConceptFilmScreen })));
const CharacterLabScreen = lazy(() => import('./components/visual-simulation/CharacterLabScreen').then((m) => ({ default: m.CharacterLabScreen })));
const HighFidelitySliceScreen = lazy(() => import('./components/visual-simulation/HighFidelitySliceScreen').then((m) => ({ default: m.HighFidelitySliceScreen })));
const ExperimentPilotScreen = lazy(() => import('./components/ExperimentPilotScreen').then((m) => ({ default: m.ExperimentPilotScreen })));
const AutomotiveClaimAuditorScreen = lazy(() => import('./components/AutomotiveClaimAuditorScreen').then((m) => ({ default: m.AutomotiveClaimAuditorScreen })));
const GenesisCommandCenterHero = lazy(() => import('./components/GenesisCommandCenterHero').then((m) => ({ default: m.GenesisCommandCenterHero })));

/** Owija ciężką (leniwą) trasę: własna granica błędu + fallback ładowania. Izolacja awarii per-trasa. */
function HeavyRoute({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="route-loading" role="status">Ładowanie modułu…</div>}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

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
  | { kind: 'memory' }
  | { kind: 'dossier' }
  | { kind: 'discovery-log' }
  | { kind: 'glossary' }
  | { kind: 'what-if' }
  | { kind: 'timeline'; mode?: 'cosmic' | 'place' }
  | { kind: 'decision-explorer' }
  | { kind: 'reality' }
  | { kind: 'prebuild' }
  | { kind: 'conflict' }
  | { kind: 'projects' }
  | { kind: 'cde' }
  | { kind: 'drug' }
  | { kind: 'campaign' }
  | { kind: 'generate' }
  | { kind: 'compare' }
  | { kind: 'city' }
  | { kind: 'city3d' }
  | { kind: 'concept' }
  | { kind: 'character' }
  | { kind: 'hf-slice' }
  | { kind: 'pilot' }
  | { kind: 'automotive-audit' };

function parseHash(): Route {
  const h = window.location.hash;
  const lab = h.match(/^#\/lab\/([\w-]+)/);
  if (lab) return { kind: 'lab', id: lab[1] };
  if (h === '#/settings') return { kind: 'settings' };
  if (h === '#/memory') return { kind: 'memory' };
  if (h === '#/dossier' || h.startsWith('#/dossier?')) return { kind: 'dossier' };
  if (h === '#/discovery-log') return { kind: 'discovery-log' };
  if (h === '#/glossary') return { kind: 'glossary' };
  if (h === '#/what-if') return { kind: 'what-if' };
  if (h === '#/timeline' || h === '#/timeline?mode=cosmic') return { kind: 'timeline', mode: 'cosmic' };
  if (h === '#/timeline?mode=place') return { kind: 'timeline', mode: 'place' };
  if (h === '#/decision-explorer') return { kind: 'decision-explorer' };
  if (h === '#/reality') return { kind: 'reality' };
  if (h === '#/prebuild') return { kind: 'prebuild' };
  if (h === '#/conflict') return { kind: 'conflict' };
  if (h === '#/projects') return { kind: 'projects' };
  if (h === '#/cde') return { kind: 'cde' };
  if (h === '#/drug' || h.startsWith('#/drug?')) return { kind: 'drug' };
  if (h === '#/campaign') return { kind: 'campaign' };
  if (h === '#/generate') return { kind: 'generate' };
  if (h === '#/compare') return { kind: 'compare' };
  if (h === '#/city') return { kind: 'city' };
  if (h === '#/city3d') return { kind: 'city3d' };
  if (h === '#/concept') return { kind: 'concept' };
  if (h === '#/character') return { kind: 'character' };
  if (h === '#/hf-slice' || h.startsWith('#/hf-slice?')) return { kind: 'hf-slice' };
  if (h === '#/pilot' || h.startsWith('#/pilot?')) return { kind: 'pilot' };
  if (h === '#/automotive-audit') return { kind: 'automotive-audit' };
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
  const [onboardingOpen, setOnboardingOpen] = useState(() => !hasCompletedOnboarding());
  const lastLabId = useRef<string | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Dźwięk "wejścia do laboratorium" — tylko przy faktycznej zmianie route
  // na NOWE laboratorium, nie przy przełączaniu zakładek eksperymentu
  // wewnątrz LabShell (to lokalny stan, nie zmiana hash/route).
  useEffect(() => {
    if (route.kind === 'lab') {
      if (route.id !== lastLabId.current) {
        lastLabId.current = route.id;
        playEnterLab();
      }
    } else {
      lastLabId.current = null;
    }
  }, [route]);

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

  if (onboardingOpen) {
    return (
      <OnboardingOverlay
        onFinish={(destination) => {
          markOnboardingComplete();
          setOnboardingOpen(false);
          if (destination === 'timeline') window.location.hash = '#/timeline';
        }}
      />
    );
  }

  // Zawartość specyficzna dla trasy — WYDZIELONA z głównego return, żeby
  // <RealityCanvas> mógł zostać zamontowany RAZ, POZA tym warunkowym
  // drzewem (patrz komponent). Gdyby canvas był wewnątrz jednej z tych
  // gałęzi, React odmontowywałby go przy każdej zmianie trasy — dokładnie
  // to, czego "persystentne płótno" ma unikać.
  const renderRoute = () => {
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
          <SettingsScreen onReplayOnboarding={() => setOnboardingOpen(true)} />
          {overlays}
        </div>
      );
    }

    if (route.kind === 'memory') {
      return (
        <div className="app">
          <TopBar title="🧠 Pamięć Naukowa" onSearch={() => setSearchOpen(true)} />
          <ScientificMemoryScreen />
          {overlays}
        </div>
      );
    }

    if (route.kind === 'dossier') {
      return (
        <div className="app">
          <TopBar title="📋 Candidate Dossier" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <CandidateDossierScreen />
          </HeavyRoute>
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

    if (route.kind === 'what-if') {
      return (
        <div className="app">
          <TopBar title={`🌀 ${t('nav.whatIf')}`} onSearch={() => setSearchOpen(true)} />
          <WhatIfScreen />
          {overlays}
        </div>
      );
    }

    if (route.kind === 'timeline') {
      return (
        <div className="app">
          <TopBar title="🌌 Discovery Timeline" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>{route.mode === 'place' ? <PlaceTimeline /> : <DiscoveryTimeline />}</HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'decision-explorer') {
      return (
        <div className="app">
          <TopBar title="🌠 Quantum Decision Explorer" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute><QuantumDecisionExplorer /></HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'reality') {
      return (
        <div className="app reality-app">
          <TopBar title="🎬 Reality Navigator" onSearch={() => setSearchOpen(true)} />
          <main id="main-content" tabIndex={-1} className="reality-main">
            <HeavyRoute>
              <RealityNavigator />
            </HeavyRoute>
          </main>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'prebuild') {
      return (
        <div className="app reality-app">
          <TopBar title="🏭 Machine Pre-Build" onSearch={() => setSearchOpen(true)} />
          <main id="main-content" tabIndex={-1} className="reality-main">
            <HeavyRoute>
              <EngineeringNavigator />
            </HeavyRoute>
          </main>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'conflict') {
      return (
        <div className="app">
          <TopBar title="⚖ Konflikt modeli (MCRE)" onSearch={() => setSearchOpen(true)} />
          <main id="main-content" tabIndex={-1} className="home">
            <HeavyRoute>
              <ModelConflictPanel />
            </HeavyRoute>
          </main>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'projects') {
      return (
        <div className="app">
          <TopBar title="☁ Projekty (chmura)" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <CloudProjectsScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'cde') {
      return (
        <div className="app">
          <TopBar title="🧭 Silnik odkryć (CDE)" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <CandidateDiscoveryScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'drug') {
      return (
        <div className="app">
          <TopBar title="💊 Drug Discovery" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <DrugDiscoveryScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'campaign') {
      return (
        <div className="app">
          <TopBar title="⚡ Silnik Przyspieszenia Naukowego" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <CampaignScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'generate') {
      return (
        <div className="app">
          <TopBar title="🔭 Generator symulacji" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <SimulationGeneratorScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'compare') {
      return (
        <div className="app">
          <TopBar title="⚖ Porównanie modeli (A vs B)" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <ModelComparisonScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'city') {
      return (
        <div className="app">
          <TopBar title="🏙 Epidemia w małym mieście — tryb wydajnościowy 2D" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <VisualSimulationScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'city3d') {
      return (
        <div className="app">
          <TopBar title="🏙 Epidemia w małym mieście — żywa scena WebGL" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <City3DWebGLScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'hf-slice') {
      return (
        <div className="app">
          <TopBar title="Genesis — High-Fidelity Street Slice" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <HighFidelitySliceScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'pilot') {
      return (
        <div className="app">
          <TopBar title="🧪 Pilot eksperymentu — plan → wynik → Scenario Capsule" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <ExperimentPilotScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'automotive-audit') {
      return (
        <div className="app">
          <TopBar title="🚗 Automotive Claim Auditor — spike" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <AutomotiveClaimAuditorScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'concept') {
      return (
        <div className="app">
          <TopBar title="🎬 Genesis OS 2030 — film koncepcyjny" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <ConceptFilmScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'character') {
      return (
        <div className="app">
          <TopBar title="🧍 Character Lab — humanoid 3D (Etap 1)" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <CharacterLabScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    return (
      <div className="app">
        <main className="home" id="main-content" tabIndex={-1}>
          <HeavyRoute>
            <GenesisCommandCenterHero />
          </HeavyRoute>
          <div style={{ position: 'relative' }}>
            <ScaleJourney />
            <span className="hud-corner hud-tl" aria-hidden="true" />
            <span className="hud-corner hud-tr" aria-hidden="true" />
            <span className="hud-corner hud-bl" aria-hidden="true" />
            <span className="hud-corner hud-br" aria-hidden="true" />
          </div>
          <div className="section-label">Zacznij tutaj</div>
          <button className="timeline-cta timeline-cta-primary" onClick={() => { window.location.hash = '#/generate'; }}>
            <span className="timeline-cta-icon" aria-hidden="true">🔭</span>
            <span className="timeline-cta-text">
              <span className="timeline-cta-title">Generator symulacji</span>
              <span className="timeline-cta-sub">Opisz zjawisko jednym zdaniem — Genesis dobierze realny model, uruchomi go i pozwoli zmieniać parametry na żywo. „Zasymuluj dylatację czasu", „zwiększ masę gwiazdy 2×"…</span>
            </span>
            <span className="timeline-cta-arrow" aria-hidden="true">→</span>
          </button>
          <button className="timeline-cta" onClick={() => { window.location.hash = '#/character'; }}>
            <span className="timeline-cta-icon" aria-hidden="true">🧍</span>
            <span className="timeline-cta-text">
              <span className="timeline-cta-title">Character Lab — humanoid 3D <em>(Etap 1)</em></span>
              <span className="timeline-cta-sub">Migracja warstwy wizualnej do WebGL: zrigowany człowiek 3D (pełna sylwetka, ubranie, chód/idle/gest, kontakt stóp). Walidacja jakości postaci przed tłumem.</span>
            </span>
            <span className="timeline-cta-arrow" aria-hidden="true">→</span>
          </button>
          <button className="timeline-cta" onClick={() => { window.location.hash = '#/city3d'; }}>
            <span className="timeline-cta-icon" aria-hidden="true">🏙</span>
            <span className="timeline-cta-text">
              <span className="timeline-cta-title">Żywa symulacja 3D: epidemia w mieście</span>
              <span className="timeline-cta-sub">Rzeczywiści agenci modelu epidemii są renderowani jako humanoidy WebGL. Pozycja, ruch, stan, izolacja i hospitalizacja pochodzą bezpośrednio z symulacji; Canvas 2D pozostaje trybem wydajnościowym.</span>
            </span>
            <span className="timeline-cta-arrow" aria-hidden="true">→</span>
          </button>
          <button className="timeline-cta" onClick={() => { window.location.hash = '#/timeline'; }}>
            <span className="timeline-cta-icon" aria-hidden="true">🌌</span>
            <span className="timeline-cta-text">
              <span className="timeline-cta-title">Discovery Timeline</span>
              <span className="timeline-cta-sub">Wielki Wybuch → daleka przyszłość. Jedna ciągła podróż z Narratorem AI, bez ekranów ładowania.</span>
            </span>
            <span className="timeline-cta-arrow" aria-hidden="true">→</span>
          </button>
          {/* Narzędzia do nauki — produkt edukacyjny (Faza 1). Zawsze widoczne. */}
          <nav className="home-nav" aria-label="Nawigacja Genesis OS">
            <button className="whatif-nav-btn" onClick={() => { window.location.hash = '#/what-if'; }}>
              <span aria-hidden="true">🌀</span> {t('nav.whatIf')}
            </button>
            <button className="qde-nav-btn" onClick={() => { window.location.hash = '#/decision-explorer'; }}>
              <span aria-hidden="true">🌠</span> {t('nav.decisionExplorer')}
            </button>
            <button onClick={() => setSearchOpen(true)}>
              <span aria-hidden="true">🔍</span> {t('nav.search')}
            </button>
            <button onClick={() => { window.location.hash = '#/discovery-log'; }}>
              <span aria-hidden="true">🏆</span> {t('nav.discoveryLog')}
            </button>
            <button onClick={() => { window.location.hash = '#/memory'; }}>
              <span aria-hidden="true">🧠</span> Pamięć Naukowa
            </button>
            <button onClick={() => { window.location.hash = '#/glossary'; }}>
              <span aria-hidden="true">📚</span> {t('nav.glossary')}
            </button>
            <button onClick={() => { window.location.hash = '#/settings'; }}>
              <span aria-hidden="true">⚙</span> {t('nav.settings')}
            </button>
          </nav>

          {/* FAZA 2: Collaborative Scientific Discovery — cały stos badawczy, ukryty za flagą
              (Ustawienia → Tryb badawczy). NIC nie usunięte: trasy działają zawsze, także z deep-linku;
              flaga decyduje wyłącznie o widoczności na stronie głównej. */}
          {getSettings().researchModeEnabled && (
            <div className="research-zone">
              <div className="section-label">🔬 Tryb badawczy · Collaborative Scientific Discovery <em>(Faza 2)</em></div>
              <button className="timeline-cta" onClick={() => { window.location.hash = '#/campaign'; }}>
                <span className="timeline-cta-icon" aria-hidden="true">⚡</span>
                <span className="timeline-cta-text">
                  <span className="timeline-cta-title">Kampania naukowa</span>
                  <span className="timeline-cta-sub">Wielofidelitowe kampanie na realnych silnikach (RDKit → ADMET → dokowanie → chemia kwantowa) z pełną prowieniencją i weryfikacją odtwarzalności.</span>
                </span>
                <span className="timeline-cta-arrow" aria-hidden="true">→</span>
              </button>
              <button className="timeline-cta" onClick={() => { window.location.hash = '#/drug'; }}>
                <span className="timeline-cta-icon" aria-hidden="true">💊</span>
                <span className="timeline-cta-text">
                  <span className="timeline-cta-title">Drug Discovery</span>
                  <span className="timeline-cta-sub">Paszport kandydata, deskryptory RDKit i realne silniki naukowe. Wyniki to MODEL_ESTIMATE — walidacja oprogramowania, nie odkrycie terapeutyczne.</span>
                </span>
                <span className="timeline-cta-arrow" aria-hidden="true">→</span>
              </button>
              <button className="timeline-cta" onClick={() => { window.location.hash = '#/cde'; }}>
                <span className="timeline-cta-icon" aria-hidden="true">🧭</span>
                <span className="timeline-cta-text">
                  <span className="timeline-cta-title">Silnik odkryć <em>(CDE)</em></span>
                  <span className="timeline-cta-sub">Przepuść kandydata przez wykonywalny Graf Modeli i dostań Paszport: co zmierzyć najpierw (Rynek Pomiarów), które ślepe zaułki już znamy (Biblioteka Porażek).</span>
                </span>
                <span className="timeline-cta-arrow" aria-hidden="true">→</span>
              </button>
              <button className="timeline-cta" onClick={() => { window.location.hash = '#/conflict'; }}>
                <span className="timeline-cta-icon" aria-hidden="true">⚖</span>
                <span className="timeline-cta-text">
                  <span className="timeline-cta-title">Konflikt modeli <em>(MCRE)</em></span>
                  <span className="timeline-cta-sub">Dwa uznane modele tej samej wielkości. Gdzie i dlaczego się rozjeżdżają, i JAKI POMIAR rozstrzygnie spór. Genesis OS potrafi powiedzieć „nie wiemy".</span>
                </span>
                <span className="timeline-cta-arrow" aria-hidden="true">→</span>
              </button>
              <button className="timeline-cta" onClick={() => { window.location.hash = '#/reality'; }}>
                <span className="timeline-cta-icon" aria-hidden="true">🎬</span>
                <span className="timeline-cta-text">
                  <span className="timeline-cta-title">Reality Navigator <em>(prototyp)</em></span>
                  <span className="timeline-cta-sub">Zmień masę gwiazdy centralnej i patrz, jak kamera odwiedza rzeczywiste konsekwencje w Scientific Model Graph — nie animację, obliczenia.</span>
                </span>
                <span className="timeline-cta-arrow" aria-hidden="true">→</span>
              </button>
              <button className="timeline-cta" onClick={() => { window.location.hash = '#/prebuild'; }}>
                <span className="timeline-cta-icon" aria-hidden="true">🏭</span>
                <span className="timeline-cta-text">
                  <span className="timeline-cta-title">Machine Pre-Build <em>(prototyp)</em></span>
                  <span className="timeline-cta-sub">Zaprojektuj układ pompa–rurociąg z prowieniencją (obliczone vs empiryczne vs oszacowane), ranking wrażliwości i CO ZMIERZYĆ przed budową. Symulacja koncepcyjna — nie CFD.</span>
                </span>
                <span className="timeline-cta-arrow" aria-hidden="true">→</span>
              </button>
              <nav className="home-nav" aria-label="Nawigacja trybu badawczego">
                <button onClick={() => { window.location.hash = '#/projects'; }}>
                  <span aria-hidden="true">☁</span> Projekty
                </button>
              </nav>
            </div>
          )}
          <div className="section-label">Laboratoria · {getLabs().length} modułów</div>
          <div className="labs-grid">
            {getLabs().map((l) => (
              <button
                key={l.id}
                className="lab-card"
                style={{ ['--accent' as string]: l.accent }}
                onClick={() => { window.location.hash = `#/lab/${l.id}`; }}
              >
                <span className="badge" aria-hidden="true">{l.icon}</span>
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
  };

  return (
    <>
      {/* Persystentne, zawsze zamontowane, ciężkie (Three.js) komponenty — każdy we
          własnej granicy błędu, żeby ich awaria nie zwaliła całej aplikacji na biały ekran. */}
      <ErrorBoundary><RealityCanvas active={route.kind === 'reality' || route.kind === 'prebuild'} /></ErrorBoundary>
      {renderRoute()}
      {!onboardingOpen && <ErrorBoundary><ScienceChat /></ErrorBoundary>}
    </>
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
