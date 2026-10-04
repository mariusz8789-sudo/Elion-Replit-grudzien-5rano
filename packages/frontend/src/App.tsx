import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './labs/index';
import { getLab } from './core/registry';
import { LabShell } from './components/LabShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppShell, GenesisWordmark } from './components/AppShell';
import { SettingsScreen } from './components/SettingsScreen';
import { AccountScreen } from './components/AccountScreen';
import { ProfileDashboard } from './components/ProfileDashboard';
import { useSession } from './core/backend/session';
import { profileOfUser } from './core/accountProfiles';
import { isSimplifiedProfile } from './core/profileNavigation';
import { ScientificMemoryScreen } from './components/ScientificMemoryScreen';
import { DiscoveryLogScreen } from './components/DiscoveryLogScreen';
import { GlossaryScreen } from './components/GlossaryScreen';
import { DomeWorldScreen } from './components/DomeWorldScreen';
import { WhatIfScreen } from './components/WhatIfScreen';
import { SearchOverlay } from './components/SearchOverlay';
import { HelpOverlay } from './components/HelpOverlay';
import { OnboardingOverlay } from './components/OnboardingOverlay';
import { requestOpenScienceChat } from './core/scienceChatBridge';
import { OPEN_SEARCH_EVENT } from './core/navigation';
import { hasActiveSim, resetActiveSim, toggleActiveSimRunning } from './core/activeSimControls';
import { track } from './core/analytics';
import { getLocale, t, useLocale } from './core/i18n';
import { screenTitle } from './core/navigationText';
import { plEn } from './core/capabilityNames';
import { fcText } from './components/flightControl/flightControlText';
import { vText } from './components/verify/verifyText';
import { lText } from './components/labHandoff/labHandoffText';
import { rText } from './components/reports/reportsText';
import { hasCompletedOnboarding, markOnboardingComplete } from './core/onboarding';
import { playEnterLab } from './core/sound';
import { RealityCanvas } from './components/RealityCanvas';
import { ScienceChat } from './components/ScienceChat';
import { ContextualRouteGuide } from './components/guide/ContextualRouteGuide';
import type { ContextualGuideSurface } from './core/guide/contextualGuideContent';

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
const TemporalCinematicScreen = lazy(() => import('./components/visual-simulation/TemporalCinematicScreen').then((m) => ({ default: m.TemporalCinematicScreen })));
const MoleculeLabScreen = lazy(() => import('./components/visual-simulation/MoleculeLabScreen').then((m) => ({ default: m.MoleculeLabScreen })));
const CellLabScreen = lazy(() => import('./components/visual-simulation/CellLabScreen').then((m) => ({ default: m.CellLabScreen })));
const EvidenceShowcaseScreen = lazy(() => import('./components/visual-simulation/EvidenceShowcaseScreen').then((m) => ({ default: m.EvidenceShowcaseScreen })));
const KnowledgeSourcesScreen = lazy(() => import('./components/KnowledgeSourcesScreen').then((m) => ({ default: m.KnowledgeSourcesScreen })));
const HighFidelitySliceScreen = lazy(() => import('./components/visual-simulation/HighFidelitySliceScreen').then((m) => ({ default: m.HighFidelitySliceScreen })));
const LookingGlassChat = lazy(() => import('./components/looking-glass/LookingGlassChat').then((m) => ({ default: m.LookingGlassChat })));
const FirstPersonLabScreen = lazy(() => import('./components/visual-simulation/FirstPersonLabScreen').then((m) => ({ default: m.FirstPersonLabScreen })));
const InvestorDemoScreen = lazy(() => import('./components/visual-simulation/InvestorDemoScreen').then((m) => ({ default: m.InvestorDemoScreen })));
const ScientificOsScreen = lazy(() => import('./components/ScientificOsScreen').then((m) => ({ default: m.ScientificOsScreen })));
const StartHero = lazy(() => import('./components/StartHero').then((m) => ({ default: m.StartHero })));
const WorldsHubScreen = lazy(() => import('./components/WorldsHubScreen').then((m) => ({ default: m.WorldsHubScreen })));
const DiscoveryHallScreen = lazy(() => import('./components/visual-simulation/DiscoveryHallScreen').then((m) => ({ default: m.DiscoveryHallScreen })));
const ExperimentPilotScreen = lazy(() => import('./components/ExperimentPilotScreen').then((m) => ({ default: m.ExperimentPilotScreen })));
const PrecisionReferenceAnalysisScreen = lazy(() => import('./components/PrecisionReferenceAnalysisScreen').then((m) => ({ default: m.PrecisionReferenceAnalysisScreen })));
const GenesisMatrixHub = lazy(() => import('./components/GenesisMatrixHub').then((m) => ({ default: m.GenesisMatrixHub })));
// Mythos B2G Matrix HUD (packages/ui): hex/bin GPU rain + live EvidenceLedger / CICADA CEP feeds. Source-only package, same alias rules as @genesis/core.
const MatrixRoute = lazy(() => import('../../ui/src/matrix/MatrixRoute').then((m) => ({ default: m.MatrixRoute })));
const CyberWorkspace = lazy(() => import('./components/CyberWorkspace').then((m) => ({ default: m.CyberWorkspace })));
const ClockworkDashboard = lazy(() => import('./components/ClockworkDashboard').then((m) => ({ default: m.ClockworkDashboard })));
const ColliderChamber = lazy(() => import('./components/ColliderChamber').then((m) => ({ default: m.ColliderChamber })));
const LabFpvView = lazy(() => import('./components/LabFpvView').then((m) => ({ default: m.LabFpvView })));
const CernComplexView = lazy(() => import('./components/CernComplexView').then((m) => ({ default: m.CernComplexView })));
import { LaboratoryModeBar } from './components/LaboratoryModeBar';
const ScientificWorldsScreen = lazy(() => import('./components/ScientificWorldsScreen').then((m) => ({ default: m.ScientificWorldsScreen })));
const DeciphermentWorkspace = lazy(() => import('./components/DeciphermentWorkspace').then((m) => ({ default: m.DeciphermentWorkspace })));
const PhysicsCmsZScreen = lazy(() => import('./components/PhysicsCmsZScreen').then((m) => ({ default: m.PhysicsCmsZScreen })));
const VirtualLabDashboard = lazy(() => import('./components/VirtualLabDashboard').then((m) => ({ default: m.VirtualLabDashboard })));
const GenesisConsole = lazy(() => import('./components/GenesisConsole').then((m) => ({ default: m.GenesisConsole })));
const SimWorldDashboard = lazy(() => import('./components/SimWorldDashboard').then((m) => ({ default: m.SimWorldDashboard })));
const MythTheoryLab = lazy(() => import('./features/myths-theories/MythTheoryLab').then((m) => ({ default: m.MythTheoryLab })));
const WorldDirectorScreen = lazy(() => import('./components/WorldDirectorScreen').then((m) => ({ default: m.WorldDirectorScreen })));
const MetaCognitionScreen = lazy(() => import('./components/MetaCognitionScreen').then((m) => ({ default: m.MetaCognitionScreen })));
const ReviewerRoomScreen = lazy(() => import('./components/ReviewerRoomScreen').then((m) => ({ default: m.ReviewerRoomScreen })));
const MirrorStatusScreen = lazy(() => import('./components/MirrorStatusScreen').then((m) => ({ default: m.MirrorStatusScreen })));
const DiscoveryTrackScreen = lazy(() => import('./components/DiscoveryTrackScreen').then((m) => ({ default: m.DiscoveryTrackScreen })));
const FlightControlScreen = lazy(() => import('./components/FlightControlScreen').then((m) => ({ default: m.FlightControlScreen })));
const VerifyScreen = lazy(() => import('./components/VerifyScreen').then((m) => ({ default: m.VerifyScreen })));
const LabHandoffScreen = lazy(() => import('./components/LabHandoffScreen').then((m) => ({ default: m.LabHandoffScreen })));
const ReportsScreen = lazy(() => import('./components/ReportsScreen').then((m) => ({ default: m.ReportsScreen })));

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
  | { kind: 'home'; full?: boolean }
  | { kind: 'lab'; id: string }
  | { kind: 'settings' }
  | { kind: 'account' }
  | { kind: 'memory' }
  | { kind: 'dossier' }
  | { kind: 'discovery-log' }
  | { kind: 'glossary' }
  | { kind: 'reviewer' }
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
  | { kind: 'temporal-cinematic' }
  | { kind: 'molecule' }
  | { kind: 'cell-lab' }
  | { kind: 'evidence-showcase' }
  | { kind: 'knowledge-sources' }
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
  | { kind: 'matrix-map' }
  | { kind: 'cyber' }
  | { kind: 'clockwork' }
  | { kind: 'collider' }
  | { kind: 'lab-fpv' }
  | { kind: 'cern-complex' }
  | { kind: 'scientific-worlds'; world?: 'physics' | 'biology' }
  | { kind: 'decipherment' }
  | { kind: 'myths-theories' }
  | { kind: 'world-director' }
  | { kind: 'meta-cognition' }
  | { kind: 'mirror' }
  | { kind: 'discovery-track' }
  | { kind: 'flight-control' }
  | { kind: 'verify' }
  | { kind: 'lab-handoff' }
  | { kind: 'reports' }
  | { kind: 'more' };

export function parseHash(): Route {
  const h = window.location.hash;
  const lab = h.match(/^#\/lab\/([\w-]+)/);
  if (lab) return { kind: 'lab', id: lab[1] };
  // More · Scientific OS, the whole catalogue; `?group=<id>` opens one group.
  if (h === '#/more' || h.startsWith('#/more?')) return { kind: 'more' };
  if (h === '#/settings') return { kind: 'settings' };
  if (h === '#/konto' || h.startsWith('#/konto?')) return { kind: 'account' };
  if (h === '#/memory') return { kind: 'memory' };
  if (h === '#/dossier' || h.startsWith('#/dossier?')) return { kind: 'dossier' };
  if (h === '#/discovery-log') return { kind: 'discovery-log' };
  if (h === '#/glossary') return { kind: 'glossary' };
  if (h === '#/reviewer' || h.startsWith('#/reviewer?')) return { kind: 'reviewer' };
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
  // One epidemic city: `#/city3d` (WebGL) and its 2D performance view `#/city3d?view=2d`; `#/city` is the old alias of the 2D view.
  if (h === '#/city' || (h.startsWith('#/city3d?') && new URLSearchParams(h.split('?')[1]).get('view') === '2d')) return { kind: 'city' };
  if (h === '#/city3d' || h.startsWith('#/city3d?')) return { kind: 'city3d' };
  if (h === '#/scientific-city') return { kind: 'scientific-city' };
  // `?mode=philosopher` (the Simulation Question cut) is read by the film screen itself.
  if (h === '#/concept' || h.startsWith('#/concept?')) return { kind: 'concept' };
  if (h === '#/character') return { kind: 'character' };
  if (h === '#/genesis-world') return { kind: 'genesis-world' };
  // Temporal cinematic (place + year) is a World Director mode (`#/world-director?mode=temporal&place=…&year=…`);
  // `#/temporal-cinematic?…` stays as the alias the capture scripts drive.
  if (h === '#/temporal-cinematic' || h.startsWith('#/temporal-cinematic?') || (h.startsWith('#/world-director?') && new URLSearchParams(h.split('?')[1]).get('mode') === 'temporal')) return { kind: 'temporal-cinematic' };
  // Deliberately just `#/molecule`, never `#/lab/molecule` — that shape is claimed by the OLD
  // Canvas-2D `registerLab()` registry's own route match above (`^#\/lab\/`), which would resolve
  // to `getLab('molecule')` in the wrong registry entirely and never reach this branch.
  if (h === '#/molecule') return { kind: 'molecule' };
  if (h === '#/cell-lab') return { kind: 'cell-lab' };
  if (h === '#/knowledge-sources' || h === '#/knowledge') return { kind: 'knowledge-sources' };
  if (h === '#/evidence' || h === '#/evidence-showcase' || h === '#/evidence-case-study' || h === '#/case-study') return { kind: 'evidence-showcase' };
  if (h === '#/hf-slice' || h.startsWith('#/hf-slice?')) return { kind: 'hf-slice' };
  if (h === '#/looking-glass' || h.startsWith('#/looking-glass?') || h === '#/lg') return { kind: 'looking-glass' };
  if (h === '#/lab-3d' || h === '#/first-person-lab') return { kind: 'first-person-lab' };
  if (h === '#/investor-demo') return { kind: 'investor-demo' };
  if (h === '#/discovery-hall' || h.startsWith('#/discovery-hall?')) return { kind: 'discovery-hall' };
  if (h === '#/worlds') return { kind: 'worlds' };
  if (h === '#/pilot' || h.startsWith('#/pilot?')) return { kind: 'pilot' };
  if (h === '#/molecular-reference-analysis') return { kind: 'molecular-reference-analysis' };
  if (h === '#/matrix') return { kind: 'matrix' };
  // The retired 3D stage had no data source left; old links land on the one Matrix route.
  if (h === '#/matrix-stage') return { kind: 'matrix' };
  if (h === '#/matrix-map') return { kind: 'matrix-map' };
  if (h === '#/cyber') return { kind: 'cyber' };
  if (h === '#/clockwork') return { kind: 'clockwork' };
  // The detector chamber is a room of the one CERN complex (`#/cern-complex?room=detector`); `#/collider` is its old alias.
  if (h === '#/collider' || (h.startsWith('#/cern-complex?') && new URLSearchParams(h.split('?')[1]).get('room') === 'detector')) return { kind: 'collider' };
  if (h === '#/lab-fpv') return { kind: 'lab-fpv' };
  if (h === '#/cern-complex' || h.startsWith('#/cern-complex?')) return { kind: 'cern-complex' };
  if (h === '#/scientific-worlds' || h.startsWith('#/scientific-worlds?')) return { kind: 'scientific-worlds' };
  if (h === '#/human-biology-lab' || h.startsWith('#/human-biology-lab?')) return { kind: 'scientific-worlds', world: 'biology' };
  if (h === '#/decipherment') return { kind: 'decipherment' };
  if (h === '#/myths-theories') return { kind: 'myths-theories' };
  if (h === '#/world-director' || h.startsWith('#/world-director?')) return { kind: 'world-director' };
  if (h === '#/meta-cognition') return { kind: 'meta-cognition' };
  if (h === '#/mirror') return { kind: 'mirror' };
  if (h === '#/discovery-track') return { kind: 'discovery-track' };
  if (h === '#/flight-control') return { kind: 'flight-control' };
  if (h === '#/verify' || h.startsWith('#/verify?')) return { kind: 'verify' };
  if (h === '#/lab-handoff') return { kind: 'lab-handoff' };
  if (h === '#/reports') return { kind: 'reports' };
  // Pełny pulpit Genesis (StartHero) dla profili, które domyślnie widzą uproszczony pulpit profilu.
  if (h === '#/?full') return { kind: 'home', full: true };
  return { kind: 'home' };
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  // Uczeń, student i nauczyciel widzą na Start własny, prostszy pulpit; `#/?full` pokazuje pełny StartHero.
  const session = useSession();
  const signedInProfile = profileOfUser(session?.user);
  const profileDashboard = route.kind === 'home' && !route.full && isSimplifiedProfile(signedInProfile) ? signedInProfile : null;
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Start is itself the introduction: landing there counts as having seen the tour, so it never
  // pops up later in the middle of a first visit. Other first entries still get the tour.
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    if (hasCompletedOnboarding()) return false;
    if (parseHash().kind === 'home') { markOnboardingComplete(); return false; }
    // A direct link to sign in / register opens the form, not the tour in front of it.
    if (parseHash().kind === 'account') return false;
    return true;
  });
  const lastLabId = useRef<string | null>(null);

  const contextualGuideSurface: ContextualGuideSurface | null = (() => {
    switch (route.kind) {
      case 'cern-complex': case 'collider': return 'CERN';
      case 'cyber': return 'CYBER';
      case 'gov-campaign': return 'GOVERNMENT';
      case 'mirror': return 'MIRROR';
      case 'world-director': return 'WORLD_DIRECTOR';
      case 'virtual-bio': return 'VIRTUAL_LAB';
      case 'campaign': return 'CAMPAIGN';
      case 'scientific-worlds': return route.world === 'biology' ? 'HUMAN_EXPLORER' : null;
      default: return null;
    }
  })();

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // The shell's Search entries (desktop sidebar, mobile explorer) open the one global Search.
  useEffect(() => {
    const onOpenSearch = (): void => setSearchOpen(true);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpenSearch);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, onOpenSearch);
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
      {/* Portaled to <body>: inside `.app` (its own z-index:1 stacking context) the chat panel and the
          mobile bar, siblings of `.app`, painted over the backdrop and took the taps on phones. */}
      {searchOpen && createPortal(<SearchOverlay onClose={() => setSearchOpen(false)} />, document.body)}
      {helpOpen && createPortal(<HelpOverlay onClose={() => setHelpOpen(false)} />, document.body)}
      <ContextualRouteGuide surface={contextualGuideSurface} />
    </>
  );

  // A reviewer following a direct #/reviewer link lands on the evidence, not the first-run tour.
  if (onboardingOpen && route.kind !== 'reviewer') {
    return (
      <OnboardingOverlay
        onFinish={(destination) => {
          markOnboardingComplete();
          setOnboardingOpen(false);
          if (destination === 'laboratory') window.location.hash = '#/scientific-worlds';
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
    if (route.kind === 'world-director') {
      return <div className="app app-fullbleed"><HeavyRoute><WorldDirectorScreen /></HeavyRoute>{overlays}</div>;
    }
    if (route.kind === 'meta-cognition') {
      return <div className="app"><TopBar title="◉ Meta‑Cognition / Self‑Audit" onSearch={() => setSearchOpen(true)} /><HeavyRoute><MetaCognitionScreen /></HeavyRoute>{overlays}</div>;
    }
    if (route.kind === 'mirror') {
      return <div className="app app-fullbleed"><HeavyRoute><MirrorStatusScreen /></HeavyRoute>{overlays}</div>;
    }
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

    if (route.kind === 'account') {
      return (
        <div className="app">
          <TopBar title="👤 Konto" onSearch={() => setSearchOpen(true)} />
          <AccountScreen />
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

    if (route.kind === 'reviewer') {
      return (
        <div className="app">
          <TopBar title="Reviewer Room" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute><ReviewerRoomScreen /></HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'more') {
      return (
        <div className="app">
          <TopBar title="More · Scientific OS" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute><ScientificOsScreen /></HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'flight-control') {
      return (
        <div className="app">
          <TopBar title={`◎ ${fcText('kicker', getLocale())}`} onSearch={() => setSearchOpen(true)} />
          <HeavyRoute><FlightControlScreen /></HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'verify') {
      return (
        <div className="app">
          <TopBar title={`✓ ${vText('kicker', getLocale())}`} onSearch={() => setSearchOpen(true)} />
          <HeavyRoute><VerifyScreen /></HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'lab-handoff') {
      return (
        <div className="app">
          <TopBar title={lText('kicker', getLocale())} onSearch={() => setSearchOpen(true)} />
          <HeavyRoute><LabHandoffScreen /></HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'reports') {
      return (
        <div className="app">
          <TopBar title={rText('kicker', getLocale())} onSearch={() => setSearchOpen(true)} />
          <HeavyRoute><ReportsScreen /></HeavyRoute>
          {overlays}
        </div>
      );
    }

    if (route.kind === 'discovery-track') {
      return (
        <div className="app">
          <TopBar title="🔬 Ścieżka odkrycia (Phase F)" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute><DiscoveryTrackScreen /></HeavyRoute>
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
          <TopBar title="⚛ Kompleks CERN — komora detektora" onSearch={() => setSearchOpen(true)} />
          <ViewSwitch label="Kompleks CERN" options={[{ label: 'Hala i tunel', hash: '#/cern-complex' }, { label: 'Komora detektora', hash: '#/cern-complex?room=detector', active: true }]} />
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
          <TopBar title="🧪 Laboratorium — Kwantowy FPV" onSearch={() => setSearchOpen(true)} />
          <LaboratoryModeBar active="quantum" />
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
            <ScientificWorldsScreen world={route.world ?? 'physics'} />
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
          <TopBar title="Miasto epidemiologiczne — widok 2D" onSearch={() => setSearchOpen(true)} />
          <ViewSwitch label="Widok miasta" options={[{ label: '3D (WebGL)', hash: '#/city3d' }, { label: '2D (wydajnościowy)', hash: '#/city3d?view=2d', active: true }]} />
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
          <ViewSwitch label="Widok miasta" options={[{ label: '3D (WebGL)', hash: '#/city3d', active: true }, { label: '2D (wydajnościowy)', hash: '#/city3d?view=2d' }]} />
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
          <TopBar title="Laboratorium — scenariusze" onSearch={() => setSearchOpen(true)} />
          <LaboratoryModeBar active="scenarios" />
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

    if (route.kind === 'temporal-cinematic') {
      return (
        <HeavyRoute>
          <TemporalCinematicScreen />
        </HeavyRoute>
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

    if (route.kind === 'knowledge-sources') {
      return (
        <div className="app">
          <TopBar title="📚 Wiedza i źródła publiczne" onSearch={() => setSearchOpen(true)} />
          <HeavyRoute>
            <KnowledgeSourcesScreen />
          </HeavyRoute>
          {overlays}
        </div>
      );
    }

    return (
      <div className="app">
        <TopBar title={profileDashboard ? plEn('Twój pulpit', 'Your dashboard') : 'Start'} derive={!profileDashboard} onSearch={() => setSearchOpen(true)} ask={false} />
        <main className="home home-dashboard" id="main-content" tabIndex={-1}>
          {/* The workspace stage: mission context by default, or one of the
              EXISTING renderers (City3D / Scientific City / World Engine)
              mounted right here beside the chat. Opening a world no longer
              unmounts the conversation. Uczeń, student i nauczyciel dostają
              tu własny, prostszy pulpit (ProfileDashboard). */}
          {profileDashboard ? <ProfileDashboard profile={profileDashboard} /> : (
            <HeavyRoute>
              <StartHero />
            </HeavyRoute>
          )}
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
      {/* One frame around every route. AppShell owns no routing — it only sets
          window.location.hash, exactly as the app's own buttons already do —
          so this is a shell around the existing router, not a second one. */}
      {/* ONE ScienceChat instance, handed to the shell. It is Ask: a separate
          view opened from the bottom bar or the dashboard's command field, never
          pasted into the dashboard. Same node, same state, one conversation. */}
      <AppShell
        chat={!onboardingOpen ? <ErrorBoundary><ScienceChat /></ErrorBoundary> : null}
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

/** One place, several views of it: a tab row under the TopBar that switches between the views' routes. */
function ViewSwitch({ label, options }: { label: string; options: readonly { label: string; hash: string; active?: boolean }[] }) {
  return (
    <nav className="view-switch" aria-label={label}>
      {options.map((option) => (
        <button key={option.hash} type="button" className="chip-btn" aria-pressed={Boolean(option.active)} onClick={() => { window.location.hash = option.hash; }}>
          {option.label}
        </button>
      ))}
    </nav>
  );
}

/** `ask={false}` on the dashboard, which carries its own command field: one Ask input per screen. */
/**
 * The title follows the navigation entry of the current route (`screenTitle`) and the language
 * switch; `title` is only the fallback for routes without a menu entry. `derive={false}` keeps
 * `title` as given (the simplified profile dashboard, which is not a menu place).
 */
function TopBar({ title, onSearch, ask: showAsk = true, derive = true }: { title: string; onSearch: () => void; ask?: boolean; derive?: boolean }) {
  const locale = useLocale();
  const hash = typeof window === 'undefined' ? '' : window.location.hash;
  const shown = derive ? screenTitle(hash, cleanRouteTitle(title), locale) : cleanRouteTitle(title);
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
        <h1 data-testid="topbar-title">{shown}</h1>
      </div>
      {showAsk && <form className="topbar-ask" onSubmit={(e) => { e.preventDefault(); submit(); }} role="search" aria-label="Zapytaj Genesis">
        <span className="topbar-ask-icon" aria-hidden="true">✦</span>
        <input
          className="topbar-ask-input"
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="Zapytaj Genesis…"
          aria-label="Zapytaj Genesis"
        />
        <button type="submit" className="topbar-ask-send" disabled={!ask.trim()} aria-label="Wyślij pytanie">→</button>
      </form>}
      <button className="back" aria-label={t('nav.search')} onClick={onSearch}>
        ⌕
      </button>
    </header>
  );
}
