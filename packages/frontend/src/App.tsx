import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import './labs/index';
import { getLab, getLabs } from './core/registry';
import { LabShell } from './components/LabShell';
import { ScaleJourney } from './components/ScaleJourney';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppShell, GenesisWordmark } from './components/AppShell';
import { SettingsScreen } from './components/SettingsScreen';
import { ScientificMemoryScreen } from './components/ScientificMemoryScreen';
import { DiscoveryLogScreen } from './components/DiscoveryLogScreen';
import { GlossaryScreen } from './components/GlossaryScreen';
import { DomeWorldScreen } from './components/DomeWorldScreen';
import { WhatIfScreen } from './components/WhatIfScreen';
import { SearchOverlay } from './components/SearchOverlay';
import { HelpOverlay } from './components/HelpOverlay';
import { OnboardingOverlay } from './components/OnboardingOverlay';
import { requestOpenScienceChat } from './core/scienceChatBridge';
import { hasActiveSim, resetActiveSim, toggleActiveSimRunning } from './core/activeSimControls';
import { track } from './core/analytics';
import { getSettings } from './core/settings';
import { t } from './core/i18n';
import { hasCompletedOnboarding, markOnboardingComplete } from './core/onboarding';
import { playEnterLab } from './core/sound';
import { RealityCanvas } from './components/RealityCanvas';
import { ScienceChat } from './components/ScienceChat';
import { LiveMatrixBackground } from './components/liveMatrix/LiveMatrixBackground';
import { toMatrixConfig, deriveGenesisVisualState } from './components/liveMatrix/genesisVisualState';
import { isSuppressed as isHeavy3DRoute } from './components/MatrixDataStream';
import { listExperiments } from './core/scienceMemory';

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
const ModelTournamentPanel = lazy(() => import('./components/ModelTournamentPanel').then((m) => ({ default: m.ModelTournamentPanel })));
const ProtectionPriorityScreen = lazy(() => import('./components/ProtectionPriorityScreen').then((m) => ({ default: m.ProtectionPriorityScreen })));
const GovDrugCampaignScreen = lazy(() => import('./components/GovDrugCampaignScreen').then((m) => ({ default: m.GovDrugCampaignScreen })));
const MonetizeScreen = lazy(() => import('./components/MonetizeScreen').then((m) => ({ default: m.MonetizeScreen })));
const GeodesicWorldScreen = lazy(() => import('./components/GeodesicWorldScreen').then((m) => ({ default: m.GeodesicWorldScreen })));
const WorldProposalScreen = lazy(() => import('./components/WorldProposalScreen').then((m) => ({ default: m.WorldProposalScreen })));
const CalibrationInquiryScreen = lazy(() => import('./components/CalibrationInquiryScreen').then((m) => ({ default: m.CalibrationInquiryScreen })));
const AutonomousInquiryScreen = lazy(() => import('./components/AutonomousInquiryScreen').then((m) => ({ default: m.AutonomousInquiryScreen })));
const EntanglementMeasuresScreen = lazy(() => import('./components/EntanglementMeasuresScreen').then((m) => ({ default: m.EntanglementMeasuresScreen })));
const CloudProjectsScreen = lazy(() => import('./components/CloudProjectsScreen').then((m) => ({ default: m.CloudProjectsScreen })));
const CandidateDiscoveryScreen = lazy(() => import('./components/CandidateDiscoveryScreen').then((m) => ({ default: m.CandidateDiscoveryScreen })));
const DrugDiscoveryScreen = lazy(() => import('./components/DrugDiscoveryScreen').then((m) => ({ default: m.DrugDiscoveryScreen })));
const CandidateDossierScreen = lazy(() => import('./components/CandidateDossierScreen').then((m) => ({ default: m.CandidateDossierScreen })));
const CampaignScreen = lazy(() => import('./components/CampaignScreen').then((m) => ({ default: m.CampaignScreen })));
const SimulationGeneratorScreen = lazy(() => import('./components/SimulationGeneratorScreen').then((m) => ({ default: m.SimulationGeneratorScreen })));
const ModelComparisonScreen = lazy(() => import('./components/ModelComparisonScreen').then((m) => ({ default: m.ModelComparisonScreen })));
const VisualSimulationScreen = lazy(() => import('./components/visual-simulation/VisualSimulationScreen').then((m) => ({ default: m.VisualSimulationScreen })));
const City3DWebGLScreen = lazy(() => import('./components/visual-simulation/City3DWebGLScreen').then((m) => ({ default: m.City3DWebGLScreen })));
const GenesisScientificCityScreen = lazy(() => import('./components/visual-simulation/GenesisScientificCityScreen').then((m) => ({ default: m.GenesisScientificCityScreen })));
const ConceptFilmScreen = lazy(() => import('./components/visual-simulation/ConceptFilmScreen').then((m) => ({ default: m.ConceptFilmScreen })));
const CharacterLabScreen = lazy(() => import('./components/visual-simulation/CharacterLabScreen').then((m) => ({ default: m.CharacterLabScreen })));
const GenesisWorldScreen = lazy(() => import('./components/visual-simulation/GenesisWorldScreen').then((m) => ({ default: m.GenesisWorldScreen })));
const MoleculeLabScreen = lazy(() => import('./components/visual-simulation/MoleculeLabScreen').then((m) => ({ default: m.MoleculeLabScreen })));
const CellLabScreen = lazy(() => import('./components/visual-simulation/CellLabScreen').then((m) => ({ default: m.CellLabScreen })));
const EvidenceShowcaseScreen = lazy(() => import('./components/visual-simulation/EvidenceShowcaseScreen').then((m) => ({ default: m.EvidenceShowcaseScreen })));
const HighFidelitySliceScreen = lazy(() => import('./components/visual-simulation/HighFidelitySliceScreen').then((m) => ({ default: m.HighFidelitySliceScreen })));
const LookingGlassChat = lazy(() => import('./components/looking-glass/LookingGlassChat').then((m) => ({ default: m.LookingGlassChat })));
const FirstPersonLabScreen = lazy(() => import('./components/visual-simulation/FirstPersonLabScreen').then((m) => ({ default: m.FirstPersonLabScreen })));
const InvestorDemoScreen = lazy(() => import('./components/visual-simulation/InvestorDemoScreen').then((m) => ({ default: m.InvestorDemoScreen })));
const StartHero = lazy(() => import('./components/StartHero').then((m) => ({ default: m.StartHero })));
const WorldsHubScreen = lazy(() => import('./components/WorldsHubScreen').then((m) => ({ default: m.WorldsHubScreen })));
const DiscoveryHallScreen = lazy(() => import('./components/visual-simulation/DiscoveryHallScreen').then((m) => ({ default: m.DiscoveryHallScreen })));
const ExperimentPilotScreen = lazy(() => import('./components/ExperimentPilotScreen').then((m) => ({ default: m.ExperimentPilotScreen })));
const PrecisionReferenceAnalysisScreen = lazy(() => import('./components/PrecisionReferenceAnalysisScreen').then((m) => ({ default: m.PrecisionReferenceAnalysisScreen })));
const GenesisCommandCenterHero = lazy(() => import('./components/GenesisCommandCenterHero').then((m) => ({ default: m.GenesisCommandCenterHero })));
const GenesisCapabilityShowcase = lazy(() => import('./components/GenesisCapabilityShowcase').then((m) => ({ default: m.GenesisCapabilityShowcase })));
const GenesisMatrixHub = lazy(() => import('./components/GenesisMatrixHub').then((m) => ({ default: m.GenesisMatrixHub })));
const MatrixStageView = lazy(() => import('./components/MatrixStageView').then((m) => ({ default: m.MatrixStageView })));
// Mythos B2G Matrix HUD (packages/ui): hex/bin GPU rain + live EvidenceLedger / CICADA CEP feeds. Source-only package, same alias rules as @genesis/core.
const MatrixRoute = lazy(() => import('../../ui/src/matrix/MatrixRoute').then((m) => ({ default: m.MatrixRoute })));
const CyberWorkspace = lazy(() => import('./components/CyberWorkspace').then((m) => ({ default: m.CyberWorkspace })));
const ClockworkDashboard = lazy(() => import('./components/ClockworkDashboard').then((m) => ({ default: m.ClockworkDashboard })));
const ColliderChamber = lazy(() => import('./components/ColliderChamber').then((m) => ({ default: m.ColliderChamber })));
const LabFpvView = lazy(() => import('./components/LabFpvView').then((m) => ({ default: m.LabFpvView })));
const CernComplexView = lazy(() => import('./components/CernComplexView').then((m) => ({ default: m.CernComplexView })));
const ScientificWorldsScreen = lazy(() => import('./components/ScientificWorldsScreen').then((m) => ({ default: m.ScientificWorldsScreen })));
const DeciphermentWorkspace = lazy(() => import('./components/DeciphermentWorkspace').then((m) => ({ default: m.DeciphermentWorkspace })));
const WorkspaceStage = lazy(() => import('./components/WorkspaceStage').then((m) => ({ default: m.WorkspaceStage })));
const PhysicsCmsZScreen = lazy(() => import('./components/PhysicsCmsZScreen').then((m) => ({ default: m.PhysicsCmsZScreen })));
const VirtualLabDashboard = lazy(() => import('./components/VirtualLabDashboard').then((m) => ({ default: m.VirtualLabDashboard })));
const GenesisConsole = lazy(() => import('./components/GenesisConsole').then((m) => ({ default: m.GenesisConsole })));
const SimWorldDashboard = lazy(() => import('./components/SimWorldDashboard').then((m) => ({ default: m.SimWorldDashboard })));
const MythTheoryLab = lazy(() => import('./features/myths-theories/MythTheoryLab').then((m) => ({ default: m.MythTheoryLab })));

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
  | { kind: 'dome-world' }
  | { kind: 'protection-priority' }
  | { kind: 'geodesics' }
  | { kind: 'world-proposal' }
  | { kind: 'calibration' }
  | { kind: 'inquiry' }
  | { kind: 'entanglement' }
  | { kind: 'what-if' }
  | { kind: 'timeline'; mode?: 'cosmic' | 'place' }
  | { kind: 'decision-explorer' }
  | { kind: 'reality' }
  | { kind: 'prebuild' }
  | { kind: 'conflict' }
  | { kind: 'projects' }
  | { kind: 'cde' }
  | { kind: 'drug' }
  | { kind: 'gov-campaign' }
  | { kind: 'monetize' }
  | { kind: 'physics-cms-z' }
  | { kind: 'virtual-bio' }
  | { kind: 'research-console' }
  | { kind: 'sim-world' }
  | { kind: 'campaign' }
  | { kind: 'generate' }
  | { kind: 'compare' }
  | { kind: 'city' }
  | { kind: 'city3d' }
  | { kind: 'scientific-city' }
  | { kind: 'concept' }
  | { kind: 'character' }
  | { kind: 'genesis-world' }
  | { kind: 'molecule' }
  | { kind: 'cell-lab' }
  | { kind: 'evidence-showcase' }
  | { kind: 'hf-slice' }
  | { kind: 'first-person-lab' }
  | { kind: 'looking-glass' }
  | { kind: 'investor-demo' }
  | { kind: 'discovery-hall' }
  | { kind: 'worlds' }
  | { kind: 'tour' }
  | { kind: 'pilot' }
  | { kind: 'molecular-reference-analysis' }
  | { kind: 'matrix' }
  | { kind: 'matrix-stage' }
  | { kind: 'matrix-map' }
  | { kind: 'cyber' }
  | { kind: 'clockwork' }
  | { kind: 'collider' }
  | { kind: 'lab-fpv' }
  | { kind: 'cern-complex' }
  | { kind: 'scientific-worlds' }
  | { kind: 'decipherment' }
  | { kind: 'myths-theories' };

function parseHash(): Route {
  const h = window.location.hash;
  const lab = h.match(/^#\/lab\/([\w-]+)/);
  if (lab) return { kind: 'lab', id: lab[1] };
  if (h === '#/settings') return { kind: 'settings' };
  if (h === '#/memory') return { kind: 'memory' };
  if (h === '#/dossier' || h.startsWith('#/dossier?')) return { kind: 'dossier' };
  if (h === '#/discovery-log') return { kind: 'discovery-log' };
  if (h === '#/glossary') return { kind: 'glossary' };
  if (h === '#/dome-world') return { kind: 'dome-world' };
  if (h === '#/protection-priority') return { kind: 'protection-priority' };
  if (h === '#/geodesics') return { kind: 'geodesics' };
  if (h === '#/world-proposal') return { kind: 'world-proposal' };
  if (h === '#/calibration') return { kind: 'calibration' };
  if (h === '#/inquiry') return { kind: 'inquiry' };
  if (h === '#/entanglement') return { kind: 'entanglement' };
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
  if (h === '#/gov-campaign') return { kind: 'gov-campaign' };
  if (h === '#/monetize') return { kind: 'monetize' };
  if (h === '#/physics/cms-z') return { kind: 'physics-cms-z' };
  if (h === '#/virtual-bio') return { kind: 'virtual-bio' };
  if (h === '#/research-console' || h.startsWith('#/research-console?')) return { kind: 'research-console' };
  if (h === '#/tour') return { kind: 'tour' };
  if (h === '#/sim-world') return { kind: 'sim-world' };
  if (h === '#/campaign') return { kind: 'campaign' };
  if (h === '#/generate') return { kind: 'generate' };
  if (h === '#/compare') return { kind: 'compare' };
  if (h === '#/city') return { kind: 'city' };
  if (h === '#/city3d') return { kind: 'city3d' };
  if (h === '#/scientific-city') return { kind: 'scientific-city' };
  if (h === '#/concept') return { kind: 'concept' };
  if (h === '#/character') return { kind: 'character' };
  if (h === '#/genesis-world') return { kind: 'genesis-world' };
  // Deliberately just `#/molecule`, never `#/lab/molecule` — that shape is claimed by the OLD
  // Canvas-2D `registerLab()` registry's own route match above (`^#\/lab\/`), which would resolve
  // to `getLab('molecule')` in the wrong registry entirely and never reach this branch.
  if (h === '#/molecule') return { kind: 'molecule' };
  if (h === '#/cell-lab') return { kind: 'cell-lab' };
  if (h === '#/evidence' || h === '#/evidence-showcase' || h === '#/evidence-case-study' || h === '#/case-study') return { kind: 'evidence-showcase' };
  if (h === '#/hf-slice' || h.startsWith('#/hf-slice?')) return { kind: 'hf-slice' };
  if (h === '#/looking-glass' || h === '#/lg') return { kind: 'looking-glass' };
  if (h === '#/lab-3d' || h === '#/first-person-lab') return { kind: 'first-person-lab' };
  if (h === '#/investor-demo') return { kind: 'investor-demo' };
  if (h === '#/discovery-hall' || h.startsWith('#/discovery-hall?')) return { kind: 'discovery-hall' };
  if (h === '#/worlds') return { kind: 'worlds' };
  if (h === '#/pilot' || h.startsWith('#/pilot?')) return { kind: 'pilot' };
  if (h === '#/molecular-reference-analysis') return { kind: 'molecular-reference-analysis' };
  if (h === '#/matrix') return { kind: 'matrix' };
  if (h === '#/matrix-stage') return { kind: 'matrix-stage' };
  if (h === '#/matrix-map') return { kind: 'matrix-map' };
  if (h === '#/cyber') return { kind: 'cyber' };
  if (h === '#/clockwork') return { kind: 'clockwork' };
  if (h === '#/collider') return { kind: 'collider' };
  if (h === '#/lab-fpv') return { kind: 'lab-fpv' };
  if (h === '#/cern-complex') return { kind: 'cern-complex' };
  if (h === '#/scientific-worlds' || h.startsWith('#/scientific-worlds?')) return { kind: 'scientific-worlds' };
  if (h === '#/decipherment') return { kind: 'decipherment' };
  if (h === '#/myths-theories') return { kind: 'myths-theories' };
  return { kind: 'home' };
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [searchOpen, setSearchOpen] = useState(false);
  const [homeMoreOpen, setHomeMoreOpen] = useState(false);
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

    if (route.kind === 'dome-world') {
      return (
        <div className="app">
          <TopBar title="🌍 Kopuła vs kula — falsyfikacja" onSearch={() => setSearchOpen(true)} />
          <DomeWorldScreen />
          {overlays}
        </div>
      );
    }

    if (route.kind === 'gov-campaign') {
      return (
        <div className="app">
          <TopBar title="🏛 Government Drug Discovery" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <GovDrugCampaignScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'monetize') {
      return (
        <div className="app">
          <TopBar title="💼 Monetize" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <MonetizeScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'physics-cms-z') {
      return (
        <div className="app">
          <TopBar title="⚛ Physics / CMS Z→μμ" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <PhysicsCmsZScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'virtual-bio') {
      return (
        <div className="app">
          <TopBar title="🧫 Virtual Bio Lab" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <VirtualLabDashboard />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'research-console') {
      return (
        <div className="app">
          <TopBar title="Odkrycia — Genesis Research Console" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <GenesisConsole key="console" />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'sim-world') {
      return (
        <div className="app">
          <TopBar title="🪐 Sim World" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <SimWorldDashboard />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'protection-priority') {
      return (
        <div className="app">
          <TopBar title="🛡 Kogo chronić najpierw?" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <ProtectionPriorityScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'geodesics') {
      return (
        <div className="app">
          <TopBar title="🕳 Fotony wokół czarnej dziury" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <GeodesicWorldScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'world-proposal') {
      return (
        <div className="app">
          <TopBar title="🧩 Zaproponuj świat" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <WorldProposalScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'calibration') {
      return (
        <div className="app">
          <TopBar title="🔎 Ile trwa okres zakaźności?" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <CalibrationInquiryScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'inquiry') {
      return (
        <div className="app">
          <TopBar title="🔬 Autonomiczne dochodzenie" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <AutonomousInquiryScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'entanglement') {
      return (
        <div className="app">
          <TopBar title="🔗 Miary splątania" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <EntanglementMeasuresScreen />
          </HeavyRoute>
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
              {/* Two different questions on two different substrates, so two
                  panels. ModelConflictPanel reads recorded MCRE friction
                  correlations; the tournament EXECUTES two registered models
                  and compares what they computed — the protocol
                  counterfactualCompare.ts explicitly declines to perform. */}
              <ModelTournamentPanel />
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

    if (route.kind === 'matrix') {
      // Mythos B2G Matrix HUD: hex/bin rain on its own full-viewport canvas (the shell backdrop is suppressed here), ledger + CEP feeds, no cards.
      return (
        <div className="app app-matrix-stage">
          <HeavyRoute>
            <MatrixRoute />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'matrix-stage') {
      // The 3D stage: the full-bleed WebGL world (volumetric rain over the obsidian mirror) is the page; one HUD column, no cards.
      return (
        <div className="app app-matrix-stage">
          <HeavyRoute>
            <MatrixStageView />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'matrix-map') {
      return (
        <div className="app">
          <TopBar title="◈ Genesis Matrix — mapa systemu" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <GenesisMatrixHub />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'collider') {
      return (
        <div className="app">
          <TopBar title="⚛ Genesis Collider — komora detektora" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <ColliderChamber />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'lab-fpv') {
      return (
        <div className="app">
          <TopBar title="🧪 Quantum Lab — FPV" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <LabFpvView />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'scientific-worlds') {
      // Scientific Worlds: full-viewport WebGL through the agent's visor, HUD in safe zones; the shell backdrop is suppressed here.
      return (
        <div className="app app-matrix-stage app-sw">
          <HeavyRoute>
            <ScientificWorldsScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'cern-complex') {
      // CERN complex: full-viewport WebGL (lab hub, glass, tunnel) with a transparent HUD; the shell backdrop is suppressed here.
      return (
        <div className="app app-matrix-stage app-cern">
          <HeavyRoute>
            <CernComplexView />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'clockwork') {
      // CLOCKWORK: the clerk's deadline dashboard — a client of the single kernel's `deadline-monitoring` provider.
      return (
        <div className="app">
          <TopBar title="⏱ CLOCKWORK — terminy KPA i UDIP" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <ClockworkDashboard />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'cyber') {
      return (
        <div className="app">
          <TopBar title="🛡 Cyber" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <CyberWorkspace />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'decipherment') {
      return (
        <div className="app">
          <TopBar title="📜 Deszyfracja" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <DeciphermentWorkspace />
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
          <TopBar title="Miasto epidemiologiczne" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <City3DWebGLScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'scientific-city') {
      return (
        <div className="app">
          <TopBar title="🏙 Genesis Scientific City — real cross-domain pump/hospital" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <GenesisScientificCityScreen />
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

    if (route.kind === 'looking-glass') {
      return (
        <div className="app">
          <TopBar title="🔭 Looking Glass" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <LookingGlassChat />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'myths-theories') {
      return (
        <div className="app">
          <TopBar title="Mity i Teorie" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <MythTheoryLab />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'first-person-lab') {
      return (
        <div className="app">
          <TopBar title="Wirtualne laboratorium" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <FirstPersonLabScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'investor-demo') {
      return (
        <div className="app">
          <TopBar title="🔬 GENESIS — Investor Demo" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <InvestorDemoScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'tour') {
      return (
        <div className="app">
          <TopBar title="Genesis Tour" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            {/* Distinct key: switching between the console and the tour must remount the console,
                so a guided session never leaks into the tour (and vice versa). */}
            <GenesisConsole key="tour" autoplay="TOUR" />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'worlds') {
      return (
        <div className="app">
          <TopBar title="Światy 3D" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <WorldsHubScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'discovery-hall') {
      return (
        <div className="app">
          <TopBar title="Discovery Hall" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <DiscoveryHallScreen />
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

    if (route.kind === 'molecular-reference-analysis') {
      return (
        <div className="app">
          <TopBar title="🧪 Precision Reference Analysis" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <PrecisionReferenceAnalysisScreen />
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

    if (route.kind === 'genesis-world') {
      return (
        <div className="app">
          <TopBar title="🌍 Genesis World Observation — Trinity (C1+C2+C3)" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <GenesisWorldScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'molecule') {
      return (
        <div className="app">
          <TopBar title="Molecule World" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <MoleculeLabScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'cell-lab') {
      return (
        <div className="app">
          <TopBar title="🧫 Genesis Virtual Cell Lab — Control vs Treatment" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <CellLabScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'evidence-showcase') {
      return (
        <div className="app">
          <TopBar title="📋 Evidence & Replay Showcase" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <EvidenceShowcaseScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    return (
      <div className="app">
        <TopBar title="Start" onSearch={() => setSearchOpen(true)} />
        <main className="home home-dashboard" id="main-content" tabIndex={-1}>
          {/* The workspace stage: mission context by default, or one of the
              EXISTING renderers (City3D / Scientific City / World Engine)
              mounted right here beside the chat. Opening a world no longer
              unmounts the conversation. */}
          <HeavyRoute>
            <StartHero />
          </HeavyRoute>
          <HeavyRoute>
            <WorkspaceStage />
          </HeavyRoute>
          {/* D-118: everything Home used to shout (launcher lists, research zone, the 3D command
              centre, the capability showcase, the scale journey, the labs grid) stays reachable
              behind ONE disclosure. Nothing was deleted; it stopped competing with the question box. */}
          <div className="home-more">
            <button type="button" className="chip-btn home-more-toggle" aria-expanded={homeMoreOpen} onClick={() => setHomeMoreOpen((v) => !v)}>
              {homeMoreOpen ? 'Zwiń przegląd systemu' : 'Poznaj Genesis od środka — moduły, laboratoria, przegląd systemu'}
            </button>
          </div>
          {homeMoreOpen && (
          <div className="home-more-body">
          <div className="section-label">Zacznij tutaj</div>
          <div className="home-launcher">
          <button className="timeline-cta timeline-cta-primary" onClick={() => { window.location.hash = '#/generate'; }}>
            <span className="timeline-cta-icon" aria-hidden="true">🔭</span>
            <span className="timeline-cta-text">
              <span className="timeline-cta-title">Generator symulacji</span>
              <span className="timeline-cta-sub">Opisz zjawisko jednym zdaniem — Genesis dobierze realny model, uruchomi go i pozwoli zmieniać parametry na żywo. „Zasymuluj dylatację czasu", „zwiększ masę gwiazdy 2×"…</span>
            </span>
            <span className="timeline-cta-arrow" aria-hidden="true">→</span>
          </button>
          <button className="timeline-cta timeline-cta-primary matrix-hub-cta" onClick={() => { window.location.hash = '#/matrix'; }}>
            <span className="timeline-cta-icon" aria-hidden="true">◈</span>
            <span className="timeline-cta-text">
              <span className="timeline-cta-title">Genesis Matrix — mapa całego systemu</span>
              <span className="timeline-cta-sub">Jedna, realna mapa wszystkiego, co Genesis zarejestrował: hipotezy, światy, modele, scenariusze, evidence, cyber, replay. Czyta tę samą Pamięć Naukową co reszta aplikacji — nic tu nie jest udawane.</span>
            </span>
            <span className="timeline-cta-arrow" aria-hidden="true">→</span>
          </button>
          <button className="timeline-cta timeline-cta-primary" onClick={() => { window.location.hash = '#/first-person-lab'; }}>
            <span className="timeline-cta-icon" aria-hidden="true">🔬</span>
            <span className="timeline-cta-text">
              <span className="timeline-cta-title">Wejdź do laboratorium — pierwsza osoba</span>
              <span className="timeline-cta-sub">Chodzisz po pokoju, podchodzisz do stanowiska i uruchamiasz realny eksperyment (Scenario Engine: izolacja vs obłożenie szpitala). Zmień dzień wejścia interwencji, uruchom ponownie, porównaj i odtwórz.</span>
            </span>
            <span className="timeline-cta-arrow" aria-hidden="true">→</span>
          </button>
          <button className="timeline-cta" onClick={() => { window.location.hash = '#/molecule'; }}>
            <span className="timeline-cta-icon" aria-hidden="true">🧪</span>
            <span className="timeline-cta-text">
              <span className="timeline-cta-title">Molecule Lab — realne atomy i wiązania</span>
              <span className="timeline-cta-sub">Kofeina, renderowana z realnej geometrii RDKit i realnego kanału wiązań (Phase 8.1): rząd wiązania, aromatyczność, CPK. To druga twarz Genesis — Scientific World Engine, nie tylko symulator miasta.</span>
            </span>
            <span className="timeline-cta-arrow" aria-hidden="true">→</span>
          </button>
          <button className="timeline-cta" onClick={() => { window.location.hash = '#/cell-lab'; }}>
            <span className="timeline-cta-icon" aria-hidden="true">🧫</span>
            <span className="timeline-cta-text">
              <span className="timeline-cta-title">Virtual Cell Lab — Control vs Treatment</span>
              <span className="timeline-cta-sub">Realny solwer G1/S/G2M (RK4): dwie hodowle na żywo, kontrolna i traktowana substancją, plus pełna pętla Question → Hypotheses → Experiment → Observation na tej samej domenie.</span>
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
          </div>
          {/* Narzędzia do nauki — produkt edukacyjny (Faza 1). Zawsze widoczne. */}
          <nav className="home-nav" aria-label="Nawigacja Genesis OS">
            <button className="matrix-nav-btn" onClick={() => { window.location.hash = '#/matrix'; }}>
              <span aria-hidden="true">◈</span> Matrix
            </button>
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
              <button className="timeline-cta" onClick={() => { window.location.hash = '#/gov-campaign'; }}>
                <span className="timeline-cta-icon" aria-hidden="true">🏛</span>
                <span className="timeline-cta-text">
                  <span className="timeline-cta-title">Government Drug Discovery</span>
                  <span className="timeline-cta-sub">Pełna kampania na realnej, wygenerowanej z mechanizmu puli kandydatów: screening, TOP 10, TOP 2, głęboka falsyfikacja, bramka bezpieczeństwa i werdykt — łącznie z uczciwym brakiem zwycięzcy.</span>
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
          <div className="section-label">Czym jest Genesis · przegląd systemu</div>
          <HeavyRoute>
            <GenesisCommandCenterHero />
          </HeavyRoute>
          <HeavyRoute>
            <GenesisCapabilityShowcase />
          </HeavyRoute>
          <div style={{ position: 'relative' }}>
            <ScaleJourney />
            <span className="hud-corner hud-tl" aria-hidden="true" />
            <span className="hud-corner hud-tr" aria-hidden="true" />
            <span className="hud-corner hud-bl" aria-hidden="true" />
            <span className="hud-corner hud-br" aria-hidden="true" />
          </div>
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
          </div>
          )}
        </main>
        {overlays}
      </div>
    );
  };

  // Real, honest signals only (see genesisVisualState.ts's own doc): the
  // record count is a genuine read of Science Memory; the other three
  // signals are not yet wired to a cheap, honest global source at this
  // App-level scope (a real-time "is a Campaign running right now" /  "is a
  // capability blocked" check), so they stay `false` rather than guessed —
  // `deriveGenesisVisualState` degrades gracefully to IDLE/ACTIVE off the
  // record count alone when they are. A real follow-up, not a fabrication.
  const genesisVisualState = deriveGenesisVisualState({
    runInProgress: false,
    needsAttention: false,
    hasOpenInvestigation: false,
    savedExperimentCount: (() => { try { return listExperiments().length; } catch { return 0; } })(),
  });
  // The same route list `MatrixDataStream.tsx` uses, read here for a DIFFERENT
  // decision. Suppressing the background entirely on these routes was measured
  // to be wrong: on #/genesis-world the 3D canvas is 1200x750 inside a
  // 1440x900 viewport — 69% — so the sidebar, title strip, description block
  // and margins (the other 31%) were left empty for no reason. What actually
  // needs protecting on these screens is the frame budget, since a second rAF
  // loop runs beside the 3D scene's own. So the background stays mounted and
  // visible, and drops to LOW quality instead: fewer streams and particles,
  // no glow blur, lower device-pixel-ratio cap (matrixEngine.ts::QUALITY).
  const heavy3DRoute = isHeavy3DRoute(window.location.hash);

  return (
    <>
      {/* Persystentne, zawsze zamontowane, ciężkie (Three.js) komponenty — każdy we
          własnej granicy błędu, żeby ich awaria nie zwaliła całej aplikacji na biały ekran. */}
      <ErrorBoundary>
        <LiveMatrixBackground
          className="matrix-datastream"
          {...toMatrixConfig(genesisVisualState)}
          quality={heavy3DRoute ? 'LOW' : 'HIGH'}
        />
      </ErrorBoundary>
      <ErrorBoundary><RealityCanvas active={route.kind === 'reality' || route.kind === 'prebuild'} /></ErrorBoundary>
      {/* One frame around every route. AppShell owns no routing — it only sets
          window.location.hash, exactly as the app's own buttons already do —
          so this is a shell around the existing router, not a second one. */}
      {/* ONE ScienceChat instance, handed to the shell. On Home it lays out as
          the workspace column (chat IS the primary interface); everywhere else
          it floats. Same node, same state, one conversation. */}
      <AppShell
        chatInline={route.kind === 'home' && !onboardingOpen}
        chat={!onboardingOpen ? <ErrorBoundary><ScienceChat inline={route.kind === 'home'} /></ErrorBoundary> : null}
      >
        {renderRoute()}
      </AppShell>
    </>
  );
}

/** Route titles were written with a leading emoji; the chrome shows the Genesis mark instead (D-118). */
export function cleanRouteTitle(title: string): string {
  return title.replace(/^[^\p{L}\p{N}]+\s*/u, '').trim();
}

function TopBar({ title, onSearch }: { title: string; onSearch: () => void }) {
  const [ask, setAsk] = useState('');
  const submit = (): void => {
    const text = ask.trim();
    if (!text) return;
    setAsk('');
    requestOpenScienceChat(text);
  };
  return (
    <header className="topbar">
      {/* The logo is the way home on every page (D-120). */}
      <button className="topbar-logo" aria-label="Genesis Physics — Start" onClick={() => { window.location.hash = ''; }}>
        <GenesisWordmark size={26} tagline={false} />
      </button>
      <div className="titles">
        <h1>{cleanRouteTitle(title)}</h1>
      </div>
      <form className="topbar-ask" onSubmit={(e) => { e.preventDefault(); submit(); }} role="search" aria-label="Zapytaj Genesis">
        <span className="topbar-ask-icon" aria-hidden="true">✦</span>
        <input
          className="topbar-ask-input"
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="Zapytaj Genesis…"
          aria-label="Zapytaj Genesis"
        />
        <button type="submit" className="topbar-ask-send" disabled={!ask.trim()} aria-label="Wyślij pytanie">→</button>
      </form>
      <button className="back" aria-label={t('nav.search')} onClick={onSearch}>
        ⌕
      </button>
    </header>
  );
}
