import { useEffect, useRef, useState } from 'react';
import { useI18n } from './core/i18n';
import './labs/index';
import { getLab, getLabs } from './core/registry';
import { LabShell } from './components/LabShell';
import { ScaleJourney } from './components/ScaleJourney';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsScreen } from './components/SettingsScreen';
import { DiscoveryLogScreen } from './components/DiscoveryLogScreen';
import { GlossaryScreen } from './components/GlossaryScreen';
import { WhatIfScreen } from './components/WhatIfScreen';
import { DiscoveryTimeline } from './components/DiscoveryTimeline';
import { QuantumDecisionExplorer } from './components/QuantumDecisionExplorer';
import { SearchOverlay } from './components/SearchOverlay';
import { Icon } from './components/Icon';
import { HelpOverlay } from './components/HelpOverlay';
import { OnboardingOverlay } from './components/OnboardingOverlay';
import { hasActiveSim, resetActiveSim, toggleActiveSimRunning } from './core/activeSimControls';
import { track } from './core/analytics';
import { t } from './core/i18n';
import { getVisitedCount } from './core/discoveryLog';
import { hasCompletedOnboarding, markOnboardingComplete } from './core/onboarding';
import { playEnterLab } from './core/sound';
import { RealityCanvas } from './components/RealityCanvas';
import { RealityNavigator } from './components/RealityNavigator';
import { EngineeringNavigator } from './components/EngineeringNavigator';
import { ModelConflictPanel } from './components/ModelConflictPanel';
import { CloudProjectsScreen } from './components/CloudProjectsScreen';
import { CandidateDiscoveryScreen } from './components/CandidateDiscoveryScreen';
import { DrugDiscoveryScreen } from './components/DrugDiscoveryScreen';
import { CampaignScreen } from './components/CampaignScreen';
import { TruthEngineScreen } from './components/TruthEngineScreen';
import { DiscoveryForgeScreen } from './components/DiscoveryForgeScreen';
import { DiscoveryWorkspaceScreen } from './components/DiscoveryWorkspaceScreen';
import { MissionControlScreen } from './components/discovery/MissionControlScreen';
import { AIChatScreen } from './components/discovery/AIChatScreen';
import { LaboratoryReadinessScreen } from './components/discovery/LaboratoryReadinessScreen';
import { MultiAgentScreen } from './components/discovery/MultiAgentScreen';
import { KnowledgeGraphScreen } from './components/discovery/KnowledgeGraphScreen';
import { ComputeClusterScreen } from './components/discovery/ComputeClusterScreen';
import { ScientificMemoryScreen } from './components/discovery/ScientificMemoryScreen';
import { InvestorDashboardScreen } from './components/discovery/InvestorDashboardScreen';
import { BillingScreen } from './components/discovery/BillingScreen';
import { ChemistryAssistantScreen } from './components/product/ChemistryAssistantScreen';
import { MyAnalysesScreen } from './components/product/MyAnalysesScreen';
import { ComparePlatformScreen } from './components/product/ComparePlatformScreen';
import { CampaignsScreen } from './components/product/CampaignsScreen';
import { CampaignScreen as ResearchCampaignScreen } from './components/product/CampaignScreen';
import { DashboardScreen } from './components/product/DashboardScreen';
import { HomeScreen } from './components/product/HomeScreen';
import { LongevityScreen } from './components/longevity/LongevityScreen';

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
  | { kind: 'glossary' }
  | { kind: 'what-if' }
  | { kind: 'timeline' }
  | { kind: 'decision-explorer' }
  | { kind: 'reality' }
  | { kind: 'prebuild' }
  | { kind: 'conflict' }
  | { kind: 'projects' }
  | { kind: 'cde' }
  | { kind: 'drug' }
  | { kind: 'campaign' }
  | { kind: 'truth-engine' }
  | { kind: 'discovery-forge' }
  | { kind: 'discovery-workspace' }
  | { kind: 'dashboard' }
  | { kind: 'ai-chat' }
  | { kind: 'lab-readiness' }
  | { kind: 'multi-agent' }
  | { kind: 'knowledge-graph' }
  | { kind: 'compute' }
  | { kind: 'scientific-memory' }
  | { kind: 'investor' }
  | { kind: 'billing' }
  | { kind: 'assistant' }
  | { kind: 'analyses' }
  | { kind: 'compare' }
  | { kind: 'research-campaigns' }
  | { kind: 'research-campaign'; id: string }
  | { kind: 'longevity' }
  | { kind: 'genesis' }
  | { kind: 'labs' };

function parseHash(): Route {
  const h = window.location.hash;
  const lab = h.match(/^#\/lab\/([\w-]+)/);
  if (lab) return { kind: 'lab', id: lab[1] };
  if (h === '#/settings') return { kind: 'settings' };
  if (h === '#/discovery-log') return { kind: 'discovery-log' };
  if (h === '#/glossary') return { kind: 'glossary' };
  if (h === '#/what-if') return { kind: 'what-if' };
  if (h === '#/timeline') return { kind: 'timeline' };
  if (h === '#/decision-explorer') return { kind: 'decision-explorer' };
  if (h === '#/reality') return { kind: 'reality' };
  if (h === '#/prebuild') return { kind: 'prebuild' };
  if (h === '#/conflict') return { kind: 'conflict' };
  if (h === '#/projects') return { kind: 'projects' };
  if (h === '#/longevity') return { kind: 'longevity' };
  if (h === '#/cde') return { kind: 'cde' };
  if (h === '#/drug') return { kind: 'drug' };
  if (h === '#/campaign') return { kind: 'campaign' };
  if (h === '#/truth-engine') return { kind: 'truth-engine' };
  if (h === '#/discovery-forge') return { kind: 'discovery-forge' };
  if (h === '#/discovery-workspace') return { kind: 'discovery-workspace' };
  if (h === '#/dashboard') return { kind: 'dashboard' };
  if (h === '#/ai-chat') return { kind: 'ai-chat' };
  if (h === '#/lab-readiness') return { kind: 'lab-readiness' };
  if (h === '#/multi-agent') return { kind: 'multi-agent' };
  if (h === '#/knowledge-graph') return { kind: 'knowledge-graph' };
  if (h === '#/compute') return { kind: 'compute' };
  if (h === '#/scientific-memory') return { kind: 'scientific-memory' };
  if (h === '#/investor') return { kind: 'investor' };
  if (h === '#/billing') return { kind: 'billing' };
  if (h === '#/assistant') return { kind: 'assistant' };
  if (h === '#/analyses') return { kind: 'analyses' };
  if (h === '#/compare') return { kind: 'compare' };
  const camp = h.match(/^#\/campaigns\/([\w-]+)/);
  if (camp) return { kind: 'research-campaign', id: camp[1] };
  if (h === '#/campaigns') return { kind: 'research-campaigns' };
  if (h === '#/genesis') return { kind: 'genesis' };
  if (h === '#/labs') return { kind: 'labs' };
  return { kind: 'home' };
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

export default function App() {
  const { t } = useI18n();
  const [route, setRoute] = useState<Route>(parseHash);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Osoba przychodząca z linku zapraszającego ma konkretny powód wejścia — czeka na
  // nią czyjeś zaproszenie do wspólnej pracy. Samouczek powitalny zasłoniłby je
  // czterema ekranami wprowadzenia, więc przy ?invite= startujemy od razu na ekranie
  // konta. Samouczek pozostaje dostępny później z Ustawień (onReplayOnboarding).
  const [onboardingOpen, setOnboardingOpen] = useState(
    () => !hasCompletedOnboarding() && !new URLSearchParams(window.location.search).has('invite'),
  );
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
              <button className="chip-btn" onClick={() => { window.location.hash = '#/labs'; }}>← Wróć</button>
            </main>
            {overlays}
          </div>
        );
      }
      const View = lab.CustomView;
      return (
        <div className="app">
          <header className="topbar">
            <button className="back" aria-label="Wróć do laboratoriów" onClick={() => { window.location.hash = '#/labs'; }}>
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
          <DiscoveryTimeline />
          {overlays}
        </div>
      );
    }

    if (route.kind === 'decision-explorer') {
      return (
        <div className="app">
          <TopBar title="🌠 Quantum Decision Explorer" onSearch={() => setSearchOpen(true)} />
          <QuantumDecisionExplorer />
          {overlays}
        </div>
      );
    }

    if (route.kind === 'reality') {
      return (
        <div className="app reality-app">
          <TopBar title="🎬 Reality Navigator" onSearch={() => setSearchOpen(true)} />
          <main id="main-content" tabIndex={-1} className="reality-main">
            <ErrorBoundary>
              <RealityNavigator />
            </ErrorBoundary>
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
            <ErrorBoundary>
              <EngineeringNavigator />
            </ErrorBoundary>
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
            <ErrorBoundary>
              <ModelConflictPanel />
            </ErrorBoundary>
          </main>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'projects') {
      return (
        <div className="app">
          <TopBar title={`☁ ${t('cp.title')}`} onSearch={() => setSearchOpen(true)} />
          <ErrorBoundary>
            <CloudProjectsScreen />
          </ErrorBoundary>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'longevity') return <LongevityScreen />;

    if (route.kind === 'cde') {
      return (
        <div className="app">
          <TopBar title="🧭 Silnik odkryć (CDE)" onSearch={() => setSearchOpen(true)} />
          <ErrorBoundary>
            <CandidateDiscoveryScreen />
          </ErrorBoundary>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'drug') {
      return (
        <div className="app">
          <TopBar title="💊 Drug Discovery" onSearch={() => setSearchOpen(true)} />
          <ErrorBoundary>
            <DrugDiscoveryScreen />
          </ErrorBoundary>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'campaign') {
      return (
        <div className="app">
          <TopBar title={`⚡ ${t('cs.engine.title')}`} onSearch={() => setSearchOpen(true)} />
          <ErrorBoundary>
            <CampaignScreen />
          </ErrorBoundary>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'truth-engine') {
      return (
        <div className="app">
          <TopBar title="🛑 Truth Engine / R&D Kill-Switch" onSearch={() => setSearchOpen(true)} />
          <ErrorBoundary>
            <TruthEngineScreen />
          </ErrorBoundary>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'discovery-forge') {
      return (
        <div className="app">
          <TopBar title="🧬 Autonomous Discovery Forge" onSearch={() => setSearchOpen(true)} />
          <ErrorBoundary>
            <DiscoveryForgeScreen />
          </ErrorBoundary>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'discovery-workspace') {
      return (
        <div className="app">
          <TopBar title="🔬 Discovery Workspace" onSearch={() => setSearchOpen(true)} />
          <ErrorBoundary>
            <DiscoveryWorkspaceScreen />
          </ErrorBoundary>
          {overlays}
        </div>
      );
    }

    // V5 premium discovery-console screens — each renders its own DiscoveryShell.
    if (route.kind === 'dashboard') return <div className="app"><ErrorBoundary><MissionControlScreen /></ErrorBoundary>{overlays}</div>;
    if (route.kind === 'ai-chat') return <div className="app"><ErrorBoundary><AIChatScreen /></ErrorBoundary>{overlays}</div>;
    if (route.kind === 'lab-readiness') return <div className="app"><ErrorBoundary><LaboratoryReadinessScreen /></ErrorBoundary>{overlays}</div>;
    if (route.kind === 'multi-agent') return <div className="app"><ErrorBoundary><MultiAgentScreen /></ErrorBoundary>{overlays}</div>;
    if (route.kind === 'knowledge-graph') return <div className="app"><ErrorBoundary><KnowledgeGraphScreen /></ErrorBoundary>{overlays}</div>;
    if (route.kind === 'compute') return <div className="app"><ErrorBoundary><ComputeClusterScreen /></ErrorBoundary>{overlays}</div>;
    if (route.kind === 'scientific-memory') return <div className="app"><ErrorBoundary><ScientificMemoryScreen /></ErrorBoundary>{overlays}</div>;
    if (route.kind === 'investor') return <div className="app"><ErrorBoundary><InvestorDashboardScreen /></ErrorBoundary>{overlays}</div>;
    if (route.kind === 'billing') return <div className="app"><ErrorBoundary><BillingScreen /></ErrorBoundary>{overlays}</div>;
    if (route.kind === 'assistant') return <div className="app"><ErrorBoundary><ChemistryAssistantScreen /></ErrorBoundary>{overlays}</div>;
    if (route.kind === 'analyses') return <div className="app"><ErrorBoundary><MyAnalysesScreen /></ErrorBoundary>{overlays}</div>;
    if (route.kind === 'compare') return <div className="app"><ErrorBoundary><ComparePlatformScreen /></ErrorBoundary>{overlays}</div>;
    if (route.kind === 'research-campaigns') return <div className="app"><ErrorBoundary><CampaignsScreen /></ErrorBoundary>{overlays}</div>;
    if (route.kind === 'research-campaign') return <div className="app"><ErrorBoundary><ResearchCampaignScreen id={route.id} /></ErrorBoundary>{overlays}</div>;
    if (route.kind === 'genesis') return <div className="app"><ErrorBoundary><DashboardScreen /></ErrorBoundary>{overlays}</div>;
    if (route.kind === 'home') return <div className="app"><ErrorBoundary><HomeScreen /></ErrorBoundary>{overlays}</div>;

    // route.kind === 'labs' — platforma edukacyjna Genesis OS (ScaleJourney + 13
    // laboratoriów + Discovery Console/Timeline itd.). Niezmieniona zawartość,
    // wyłącznie przeniesiona spod domyślnej trasy pod #/labs — patrz HomeScreen.tsx
    // (przycisk "Eksploruj fizykę") i mission o priorytecie produktu komercyjnego.
    return (
      <div className="app">
        <main className="home" id="main-content" tabIndex={-1}>
          <div style={{ position: 'relative' }}>
            <ScaleJourney />
            <span className="hud-corner hud-tl" aria-hidden="true" />
            <span className="hud-corner hud-tr" aria-hidden="true" />
            <span className="hud-corner hud-bl" aria-hidden="true" />
            <span className="hud-corner hud-br" aria-hidden="true" />
          </div>
          <div className="section-label">Zacznij tutaj</div>
          <button className="timeline-cta timeline-cta-genesis" onClick={() => { window.location.hash = '#/genesis'; }}>
            <span className="timeline-cta-icon" aria-hidden="true"><Icon name="flask" size={26} /></span>
            <span className="timeline-cta-text">
              <span className="timeline-cta-title">Genesis Grounded Chemistry <em>(produkt)</em></span>
              <span className="timeline-cta-sub">Komercyjny produkt: analiza cząsteczek RDKit, porównywanie kandydatów i kampanie badawcze — z provenance i eksportem. Pulpit ze wszystkimi modułami.</span>
            </span>
            <span className="timeline-cta-arrow" aria-hidden="true">→</span>
          </button>
          <button className="timeline-cta timeline-cta-console" onClick={() => { window.location.hash = '#/dashboard'; }}>
            <span className="timeline-cta-icon" aria-hidden="true"><Icon name="rocket" size={26} /></span>
            <span className="timeline-cta-text">
              <span className="timeline-cta-title">Discovery Console — Mission Control</span>
              <span className="timeline-cta-sub">Konsola odkryć leków: realny status silników, Multi-Agent AI, graf wiedzy, Laboratory Readiness, Compute Cluster i pakiet inwestorski — wszystko na realnych danych.</span>
            </span>
            <span className="timeline-cta-arrow" aria-hidden="true">→</span>
          </button>
          <button className="timeline-cta timeline-cta-primary" onClick={() => { window.location.hash = '#/timeline'; }}>
            <span className="timeline-cta-icon" aria-hidden="true">🌌</span>
            <span className="timeline-cta-text">
              <span className="timeline-cta-title">Discovery Timeline</span>
              <span className="timeline-cta-sub">Wielki Wybuch → daleka przyszłość. Jedna ciągła podróż z Narratorem AI, bez ekranów ładowania.</span>
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
              <span className="timeline-cta-sub">Zaprojektuj układ pompa–rurociąg, zobacz konsekwencje z prowieniencją (obliczone vs empiryczne vs oszacowane), ranking wrażliwości i CO ZMIERZYĆ przed budową. Symulacja koncepcyjna — nie CFD.</span>
            </span>
            <span className="timeline-cta-arrow" aria-hidden="true">→</span>
          </button>
          <button className="timeline-cta" onClick={() => { window.location.hash = '#/conflict'; }}>
            <span className="timeline-cta-icon" aria-hidden="true">⚖</span>
            <span className="timeline-cta-text">
              <span className="timeline-cta-title">Konflikt modeli <em>(MCRE)</em></span>
              <span className="timeline-cta-sub">Dwa uznane modele tej samej wielkości. Zobacz, gdzie i dlaczego się rozjeżdżają, które są poza dziedziną ważności, i JAKI POMIAR rozstrzygnie spór. Genesis OS potrafi powiedzieć „nie wiemy".</span>
            </span>
            <span className="timeline-cta-arrow" aria-hidden="true">→</span>
          </button>
          <button className="timeline-cta" onClick={() => { window.location.hash = '#/cde'; }}>
            <span className="timeline-cta-icon" aria-hidden="true">🧭</span>
            <span className="timeline-cta-text">
              <span className="timeline-cta-title">Silnik odkryć <em>(CDE)</em></span>
              <span className="timeline-cta-sub">Zdefiniuj dziedzinę, przepuść kandydata przez wykonywalny Graf Modeli i dostań Paszport: które kryteria spełnia, co zmierzyć najpierw (Rynek Pomiarów), a które ślepe zaułki już znamy (Biblioteka Porażek). Bez ogłaszania „odkryć".</span>
            </span>
            <span className="timeline-cta-arrow" aria-hidden="true">→</span>
          </button>
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
            <button onClick={() => { window.location.hash = '#/projects'; }}>
              <span aria-hidden="true">☁</span> Projekty
            </button>
            <button onClick={() => { window.location.hash = '#/drug'; }}>
              <span aria-hidden="true">💊</span> Drug Discovery
            </button>
            <button onClick={() => { window.location.hash = '#/campaign'; }}>
              <span aria-hidden="true">⚡</span> Kampania naukowa
            </button>
            <button onClick={() => { window.location.hash = '#/truth-engine'; }}>
              <span aria-hidden="true">🛑</span> Truth Engine
            </button>
            <button onClick={() => { window.location.hash = '#/discovery-forge'; }}>
              <span aria-hidden="true">🧬</span> Discovery Forge
            </button>
            <button onClick={() => { window.location.hash = '#/discovery-workspace'; }}>
              <span aria-hidden="true">🔬</span> Discovery Workspace
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
          <MissionStatusBar />
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
      <RealityCanvas active={route.kind === 'reality' || route.kind === 'prebuild'} />
      {renderRoute()}
    </>
  );
}

/**
 * Pasek statusu misji — estetyka centrum kontroli, ale WYŁĄCZNIE realne
 * dane: liczba laboratoriów z rejestru, żywy status backendu AI
 * (GET /api/health, ten sam endpoint co w discovery.tsx), postęp
 * eksploracji z Dziennika Odkryć. Zero wymyślonych liczb.
 */
function MissionStatusBar() {
  const [aiStatus, setAiStatus] = useState<'checking' | 'ready' | 'no-key' | 'offline'>('checking');
  const { visited, totalLabs } = getVisitedCount();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => r.json())
      .then((d: { ai?: string }) => {
        if (!cancelled) setAiStatus(d.ai === 'ready' ? 'ready' : 'no-key');
      })
      .catch(() => {
        if (!cancelled) setAiStatus('offline');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const aiLabel =
    aiStatus === 'checking' ? 'sprawdzanie…' : aiStatus === 'ready' ? 'online' : aiStatus === 'no-key' ? 'brak klucza' : 'offline';

  return (
    <div className="mission-bar" role="status" aria-label="Status systemu Genesis OS">
      <span className={`mdot on`} aria-hidden="true" />
      <span>NARRATOR: <strong>zawsze aktywny</strong></span>
      <span className="msep">·</span>
      <span className={`mdot ${aiStatus === 'ready' ? 'on' : aiStatus === 'checking' ? '' : 'warn'}`} aria-hidden="true" />
      <span>AI: <strong>{aiLabel}</strong></span>
      <span className="msep">·</span>
      <span>LABORATORIA: <strong>{getLabs().length}</strong></span>
      <span className="msep">·</span>
      <span>ODWIEDZONE: <strong>{visited}/{totalLabs}</strong></span>
    </div>
  );
}

function TopBar({ title, onSearch }: { title: string; onSearch: () => void }) {
  return (
    <header className="topbar">
      <button className="back" aria-label="Wróć do laboratoriów" onClick={() => { window.location.hash = '#/labs'; }}>
        <Icon name="back" size={22} />
      </button>
      <div className="titles">
        <h1>{title}</h1>
      </div>
      <button className="back" aria-label={t('nav.search')} onClick={onSearch} style={{ marginLeft: 'auto' }}>
        <Icon name="search" size={20} />
      </button>
    </header>
  );
}
