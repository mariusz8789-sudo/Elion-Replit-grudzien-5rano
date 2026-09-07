import { useEffect, useMemo, useRef, useState } from 'react';
import { registerActiveSimControls } from '../../core/activeSimControls';
import { registerSimContext } from '../../core/simContext';
import { ANALYSIS_MODES, type AnalysisMode } from '../../core/simulation/analysis';
import { CLOCK_SPEEDS, type ClockSpeed } from '../../core/simulationClock/clock';
import { EpidemicCity3DSim, type CityCameraPreset, type CityWorldSelection } from '../../core/three/epidemicCity3D';
import { consumePendingExperimentWorld, consumePendingScenarioTimeline, peekPendingExperimentWorld, peekPendingScenarioTimeline } from '../../core/experimentFabric/worldHandoff';
import { consumePendingLookingGlassExperience, peekPendingLookingGlassExperience } from '../../core/lookingGlass/sessionHandoff';
import { ExperiencePlayer } from '../../core/lookingGlass/experienceOrchestrator';
import { cityPresetFor, directionForFrame, type WorldDirection } from '../../core/lookingGlass/worldDirector';
import { parseObservationIntent } from '../../core/lookingGlass/observationIntent';
import { resolveCameraIntent, resolveTransitionKind, type ObservationExecutionStatus } from '../../core/lookingGlass/observationExecution';
import { closeInspection, initialExperienceState, inspect, replay as enterReplay, timeIsFrozen, MODE_LABEL, type ExperienceState } from '../../core/lookingGlass/experienceMode';
import { EventInspector } from '../looking-glass/EventInspector';
import { ComparisonPanel } from '../looking-glass/ComparisonPanel';
import { saveScenarioCounterfactualToMemory, saveScenarioRunToMemory } from '../../core/scienceMemory';
import { buildSavedScenarioRunContext } from '../../core/simulation/scenarioMemory';
import { createTemporalStateBookmark, resolveTemporalStateBookmark, type TemporalStateBookmark } from '../../core/simulation/temporalStateBookmark';
import { describeScenarioEffects } from '../../core/simulation/scenarioDisclosure';
import { useThreeLoop } from '../../core/three/useThreeLoop';
import type { ParamDef, SimParams } from '../../core/types';
import { DEFAULT_HOSPITAL_CAPACITY } from '../../core/simulation/hospitalResource';
import { projectWorldState } from '../../core/simulation/worldEngineContract';
import type { EarthquakeCityOverlayProjection } from '../../core/simulationRenderer/earthquakeCoordinateMapping';
import { consumePendingEarthquakeOverlay } from '../../core/simulationRenderer/earthquakeChatBridge';
import { EarthquakeScenarioPanel } from './EarthquakeScenarioPanel';
import { EvidenceReplayPanel } from './EvidenceReplayPanel';
import { ScenarioCommandCenterPanel } from './ScenarioCommandCenterPanel';
import { TemporalWorldHud } from './TemporalWorldHud';
import { TemporalMultiversePanel } from './TemporalMultiversePanel';

/** Command Center reads existing model and World Engine state only; it does not generate epidemic data or agent routes. */
/** Musi zgadzać się z EpidemicCity3DSim.hospitalStatusCode — indeks, nie liczba wyniku. */
const HOSPITAL_STATUS_LABELS = ['NORMAL', 'WARNING', 'HIGH', 'CRITICAL'] as const;

const CITY_PARAM_DEFS: ParamDef[] = [
  { key: 'r0', label: 'R₀', type: 'slider', default: 2.5, min: 0, max: 6, step: 0.1 },
  { key: 'infectiousDays', label: 'Czas zakażenia', type: 'slider', default: 6, min: 2, max: 14, step: 1, unit: 'dni' },
  { key: 'transmissionScale', label: 'Prawd. transmisji', type: 'slider', default: 1, min: 0, max: 1, step: 0.05 },
  { key: 'restrictions', label: 'Restrykcje', type: 'slider', default: 0, min: 0, max: 1, step: 0.05 },
  { key: 'mobility', label: 'Mobilność', type: 'slider', default: 0.85, min: 0, max: 1, step: 0.05 },
  { key: 'severeRate', label: 'Ciężkie przypadki', type: 'slider', default: 0.15, min: 0, max: 0.6, step: 0.05 },
  { key: 'contactRadius', label: 'Zasięg kontaktu', type: 'slider', default: 14, min: 6, max: 30, step: 1, unit: 'px' },
  { key: 'nAgents', label: 'Liczba agentów', type: 'slider', default: 260, min: 1, max: 1000, step: 1 },
  { key: 'isolate', label: 'Izolacja objawowych', type: 'toggle', default: false },
];

const SLIDERS = CITY_PARAM_DEFS.filter((def) => def.type === 'slider');
const EPIDEMIC_LEGEND = [
  ['S', 'podatny', '#54d98c'], ['E', 'narażony', '#e8b34a'], ['I', 'zakażony', '#f05555'], ['R', 'ozdrowiały', '#5aa2ff'], ['D', 'nieaktywny', '#6b7280'],
] as const;
const CAMERA_PRESETS: Array<{ id: CityCameraPreset; label: string }> = [
  { id: 'city', label: 'CITY' }, { id: 'district', label: 'DISTRICT' }, { id: 'street', label: 'STREET' }, { id: 'agent', label: 'AGENT' },
];
const MINIMAP_COLORS: Record<string, string> = {
  S: '#54d98c', E: '#e8b34a', I: '#f05555', R: '#5aa2ff', D: '#6b7280',
};
const MINIMAP_OBJECT_COLORS: Record<string, string> = {
  home: '#6689aa', shop: '#d4a15e', school: '#7fc0d8', hospital: '#e7edf4', isolation: '#968bac', park: '#3d855d',
};

/**
 * Główna ścieżka 3D miasta. Canvas 2D pozostaje pod #/city jako fallback,
 * a wszystkie dane sceny nadal pochodzą z istniejącego EpidemicCitySimulation.
 */
export function City3DWebGLScreen() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [worldSelection, setWorldSelection] = useState<CityWorldSelection | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CityCameraPreset>('city');
  // GENESIS UI UNIFICATION SPRINT: the scene is the hero, so the model/hospital/
  // risk/network/scenario-tool panels that used to sit permanently on screen
  // (12 panel blocks at once) now live in one on-demand drawer. Nothing about
  // the data they show changed — only whether it's visible without being asked for.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'model' | 'risk' | 'network' | 'scenario' | 'diagnostics'>('model');
  // Consumed exactly once on mount, mirroring HighFidelitySliceScreen's own
  // handoff pattern: a Science-Chat-confirmed epidemic-city run hands off its
  // already-computed EpidemicCitySimulation instance here instead of City3D
  // silently starting a second, disconnected simulation.
  // Peek, not consume — see the note on `scenarioTimeline` below: a state
  // initializer that consumes loses the handoff to StrictMode's deliberate
  // double invocation, and this channel additionally DELETES the world on
  // consumption, so the loss was permanent.
  const [experimentWorld] = useState(() => peekPendingExperimentWorld());
  // How the user asked to experience this world (Looking Glass). Independent
  // of the scientific handoff above: ignoring it would still show the right
  // run, only from the default city vantage.
  const [lookingGlass] = useState(() => peekPendingLookingGlassExperience());
  // Drugi kanał przekazania: ZAKOŃCZONY przebieg Scenario Engine. Świat nie jest
  // wtedy taktowany — jest PRZEWIJANY po rzeczywistej serii dobowej przebiegu.
  // PEEK, nie consume. `useState` z inicjalizatorem, który KONSUMUJE, jest
  // nieczysty, a React w StrictMode celowo wywołuje inicjalizator dwa razy:
  // pierwsze wywołanie zabierało przekazany świat, drugie zastawało już pustą
  // skrzynkę i to jego wynik trafiał do stanu. Efekt był taki, że świat
  // otwarty z czatu/Pamięci pokazywał własną symulację zamiast przekazanej
  // serii. Odczyt jest teraz czysty, a wskaźnik kasuje efekt po zamontowaniu.
  const [scenarioTimeline, setScenarioTimeline] = useState(() => peekPendingScenarioTimeline());
  const [timelineDay, setTimelineDay] = useState(0);
  const [enteredTimelineDay, setEnteredTimelineDay] = useState<number | null>(null);
  const [timelineSaved, setTimelineSaved] = useState<string | null>(null);
  const [timelineBookmark, setTimelineBookmark] = useState<TemporalStateBookmark | null>(null);
  useEffect(() => {
    // Skasowanie wskaźnika po tym, jak stan początkowy już go odczytał —
    // przekazanie jest jednorazowe, więc powrót na ten ekran nie może
    // ponownie wciągnąć tej samej serii.
    consumePendingScenarioTimeline();
    consumePendingExperimentWorld();
    consumePendingLookingGlassExperience();
  }, []);
  useEffect(() => {
    const applyPendingScenarioTimeline = () => {
      const pending = consumePendingScenarioTimeline();
      if (!pending) return;
      setScenarioTimeline(pending);
      setTimelineDay(0);
      setEnteredTimelineDay(null);
      setTimelineBookmark(null);
      setTimelineSaved(null);
    };
    window.addEventListener('genesis:scenario-timeline-ready', applyPendingScenarioTimeline);
    return () => window.removeEventListener('genesis:scenario-timeline-ready', applyPendingScenarioTimeline);
  }, []);
  const timelineSample = scenarioTimeline
    ? scenarioTimeline.series[Math.min(timelineDay, scenarioTimeline.series.length - 1)]
    : undefined;
  const timelineLogicalDay = timelineSample?.day ?? 0;
  const sim = useMemo(() => new EpidemicCity3DSim({}, {
    onAgentSelected: (id) => {
      setSelectedId(id);
      if (id !== null) setCameraPreset('agent');
    },
    onWorldSelected: setWorldSelection,
  }, experimentWorld?.simulation), [experimentWorld]);
  const [params, setParams] = useState<SimParams>(() => sim.getSim().getParams());
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<ClockSpeed>(1);
  const [analysis, setAnalysis] = useState<AnalysisMode>('none');
  const [showTransmissions, setShowTransmissions] = useState(true);
  // Design reminder: Earthquake is an immutable SCENARIO overlay, never epidemic WorldState.
  const [earthquakeOverlay, setEarthquakeOverlay] = useState<EarthquakeCityOverlayProjection | null>(null);
  const [stats, setStats] = useState<Record<string, number>>(() => sim.getStats());
  const paramsRef = useRef(params);
  const statsRef = useRef(stats);
  paramsRef.current = params;
  statsRef.current = stats;

  // LOOKING GLASS 2.1 — LIVE OBSERVATION DIRECTOR. Parses a sentence into an
  // ObservationIntent (reused from the chat console, `observationIntent.ts`),
  // resolves it onto the real C2 CameraIntent vocabulary (`observationExecution.
  // ts`, itself composed from the EXISTING mode->vantage and vantage->camera
  // tables — no new mapping invented), and hands the target NAME to
  // `sim.applyObservationTarget`, which alone knows the city's real objects
  // and alone touches the camera (through the existing OrbitControls target/
  // distance seam every preset already uses). This component never computes
  // a position or a transform.
  const [obsText, setObsText] = useState('');
  const [obsResult, setObsResult] = useState<{ status: ObservationExecutionStatus; narration: string; cameraIntent: string; transition: string } | null>(null);
  const askObservation = (sentence: string) => {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    const intent = parseObservationIntent(trimmed);
    const query = intent.target ?? intent.focus;
    if (!query) {
      setObsResult({ status: 'FAILED', narration: 'No target was named in that sentence — say what to look at (e.g. "the hospital").', cameraIntent: '', transition: '' });
      setObsText('');
      return;
    }
    const cameraIntent = resolveCameraIntent(intent);
    const transition = resolveTransitionKind(intent);
    const outcome = sim.applyObservationTarget(query, cameraIntent);
    const timeNote = intent.time && intent.time.kind !== 'NOW'
      ? ' Time travel for the live city view is not yet supported — showing the current moment.'
      : '';
    setObsResult({
      status: outcome.found ? 'EXECUTED' : 'FAILED',
      narration: outcome.found
        ? `Showing ${outcome.label} — ${cameraIntent} · ${transition.toLowerCase()} move.${timeNote}`
        : `Nothing in this run answers to "${query}" — no such object exists here.`,
      cameraIntent,
      transition,
    });
    setObsText('');
  };

  const renderParams = useMemo<SimParams>(() => ({ ...params, clockSpeed: running ? speed : 0 }), [params, running, speed]);
  const { canvasRef, loading, failed } = useThreeLoop(sim, renderParams, true, setStats);

  // GO TO TIME / ENTER THIS MOMENT: replay the existing agent model to the
  // selected Scenario Engine day. The canvas stays on the same renderer and
  // reads the replayed agents; timeline aggregates are never painted as agents.
  useEffect(() => {
    if (!scenarioTimeline) return;
    const run = scenarioTimeline.scenarioRun;
    sim.getSim().replayToDay({
      preInterventionParams: run.preInterventionParams,
      params: run.params,
      cohort: run.cohort,
      stepsPerDay: run.stepsPerDay,
      interventionStartDay: run.interventionStartDay,
    }, timelineLogicalDay);
    setRunning(false);
    setSelectedId(null);
    setWorldSelection(null);
    setStats(sim.getStats());
  }, [scenarioTimeline, timelineLogicalDay, sim]);

  useEffect(() => { sim.setAnalysisMode(analysis); }, [analysis, sim]);
  useEffect(() => { sim.setShowTransmissions(showTransmissions); }, [showTransmissions, sim]);
  useEffect(() => { sim.setEarthquakeScenarioOverlay(earthquakeOverlay); }, [earthquakeOverlay, sim]);
  useEffect(() => {
    const applyPending = () => {
      const pending = consumePendingEarthquakeOverlay();
      if (pending) setEarthquakeOverlay(pending);
    };
    applyPending();
    window.addEventListener('genesis:earthquake-overlay-ready', applyPending);
    return () => window.removeEventListener('genesis:earthquake-overlay-ready', applyPending);
  }, []);

  const updateParam = (key: string, value: number | boolean) => {
    sim.setParam(key, value);
    setParams((previous) => ({ ...previous, [key]: value }));
    setStats(sim.getStats());
  };
  const play = () => { if (!scenarioTimeline) setRunning(true); };
  const pause = () => setRunning(false);
  const step = () => { if (!scenarioTimeline) { sim.step(); setStats(sim.getStats()); } };
  const reset = () => {
    sim.reset(); setRunning(false); setSelectedId(null); setWorldSelection(null); setCameraPreset('city');
    setParams(sim.getSim().getParams()); setStats(sim.getStats());
  };
  // ANCHORED VIEWPOINT: the user asked to stand in the world rather than look
  // down on it, so the city opens at street level and time starts moving by
  // itself — standing still while the world changes is the entire premise.
  // The scrub bar stays live, so this is a starting vantage, not a lock.
  useEffect(() => {
    if (!lookingGlass) return;
    const streetLevel = lookingGlass.viewpoint === 'ANCHORED_HUMAN' || lookingGlass.viewpoint === 'RESPONDER_POV';
    if (streetLevel) {
      sim.setCameraPreset('street');
      setCameraPreset('street');
    }
  }, [lookingGlass, sim]);

  // THE CINEMATIC SEQUENCE DRIVES THIS WORLD.
  //
  // Previously an interval just incremented the day, which played the series
  // but ignored the edit entirely: the shot plan chose a camera and a moment
  // and the world never heard about it. Now the director resolves each
  // instant and this applies it to the two levers the world actually has —
  // its day and its camera. It writes the SAME `timelineDay` the scrub bar
  // writes, so it remains playback of the real series rather than a second
  // clock, and the user can still grab the scrub bar at any point.
  //
  // The day is only moved when the director says the time is on this
  // viewer's clock. A marker from a run of a different length reports null,
  // and holding is the honest response — jumping to "day 72" of a 60-day
  // series would render a day this run never had.
  const [direction, setDirection] = useState<WorldDirection | null>(null);
  // Read inside the animation frame, so freezing takes effect without
  // tearing down and rebuilding the loop on every mode change.
  const frozenRef = useRef(false);
  const [experience, setExperience] = useState<ExperienceState>(() => initialExperienceState(0, Boolean(lookingGlass?.autoPlay)));
  const inspectableEvents = useMemo(() => lookingGlass?.world?.getInspectableEvents() ?? [], [lookingGlass]);
  useEffect(() => { frozenRef.current = timeIsFrozen(experience); }, [experience]);
  const cinematic = useMemo(
    () => (lookingGlass?.experience && lookingGlass.world ? new ExperiencePlayer(lookingGlass.experience) : null),
    [lookingGlass],
  );
  useEffect(() => {
    const world = lookingGlass?.world;
    if (!cinematic || !world || !scenarioTimeline) return;
    cinematic.play();
    const lastDay = scenarioTimeline.series.length - 1;
    let raf = 0;
    let last = performance.now();
    let appliedPreset: string | null = null;
    const tick = (now: number) => {
      // A stalled frame must not teleport the world. Without a cap, one
      // slow frame — a backgrounded tab, a software renderer, a GC pause —
      // advances the sequence by however long it took, skipping states the
      // viewer never saw. Capped at 100 ms, playback simply slows instead.
      const delta = Math.min(0.1, (now - last) / 1000);
      last = now;
      // A moment being interrogated must not move underneath the person
      // interrogating it, so INSPECT/REPLAY stop the clock rather than
      // merely hiding it.
      const frame = frozenRef.current ? cinematic.currentFrame : cinematic.advance(delta);
      if (frame) {
        const next = directionForFrame(frame, world, lookingGlass?.viewpoint);
        setDirection(next);
        if (next.worldTime !== null) {
          // No local clamp: the director already resolved this through the
          // world's clock, which knows which ticks the run really produced.
          // A second, different rule here is how these paths drifted apart
          // before. The index is looked up rather than assumed equal to the
          // day, so a run with gaps still addresses the right sample.
          const index = world.clock.allTicks.indexOf(next.worldTime);
          setTimelineDay(index >= 0 ? Math.min(index, lastDay) : Math.min(Math.round(next.worldTime), lastDay));
        }
        const preset = cityPresetFor(next.cameraIntent);
        // Only on an actual change: re-applying a preset every frame would
        // fight the user's own camera and burn work for no visible result.
        if (preset !== appliedPreset) {
          appliedPreset = preset;
          sim.setCameraPreset(preset);
          setCameraPreset(preset);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cinematic, lookingGlass, scenarioTimeline, sim]);

  const changeCamera = (preset: CityCameraPreset) => {
    sim.setCameraPreset(preset);
    setCameraPreset(preset);
    setStats(sim.getStats());
  };

  useEffect(() => registerActiveSimControls({ toggleRunning: () => setRunning((value) => !value), reset }), [sim]);
  useEffect(() => registerSimContext({
    labId: 'visual-city',
    experimentId: 'epidemic-city-3d',
    experimentName: 'Epidemia w małym mieście — WebGL',
    honesty: 'educational',
    honestyNote: 'Fikcyjne miasto i abstrakcyjny Pathogen X. Scena 3D odczytuje wynik modelu agentowego; nie jest prognozą.',
    paramDefs: CITY_PARAM_DEFS,
    getParams: () => paramsRef.current,
    getStats: () => statsRef.current,
    setParam: (key, value) => updateParam(key, value as number | boolean),
  }), [sim]);

  const person = selectedId === null ? null : sim.getSim().debugInfo(selectedId);
  const displayedAgentCount = Number(params.nAgents ?? 0);
  const renderBudget = Number(stats.webgl_total_humanoids ?? 0);
  const analysisLabel = ANALYSIS_MODES.find((mode) => mode.id === analysis)?.label ?? 'Brak';
  const latestTransmission = sim.getLatestTransmissionView();
  const modelObjects = sim.getSim().objects();
  const modelAgents = sim.getSim().agents();
  const worldWidth = sim.getSim().worldWidth;
  const worldHeight = sim.getSim().worldHeight;
  const roadNetwork = useMemo(() => sim.getSim().roadNetworkView(), [sim]);
  const topologyCounts = useMemo(() => roadNetwork.segments.reduce<Record<string, number>>((counts, segment) => {
    counts[segment.segmentType] = (counts[segment.segmentType] ?? 0) + 1;
    return counts;
  }, {}), [roadNetwork]);
  const percentageKeys = ['transmissionScale', 'restrictions', 'mobility', 'severeRate'];
  // Ta sama projekcja World Engine Contract, którą dostaje każdy zewnętrzny konsument (SC2) — brak drugiego liczenia hotspotów/klastrów.
  const worldState = useMemo(() => projectWorldState(sim.getSim(), scenarioTimeline?.scenarioRun.hospitalCapacity), [sim, stats, scenarioTimeline]);
  useEffect(() => { sim.setWorldState(worldState); }, [sim, worldState]);
  const topHotspots = worldState.hotspots.slice(0, 3);
  const topClusters = [...worldState.clusters.household, ...worldState.clusters.location]
    .sort((a, b) => b.transmissions - a.transmissions)
    .slice(0, 3);

  return (
    <main id="main-content" tabIndex={-1} className="home city-3d-screen city-world-shell city-world-shell-v2">
      <header className="city-world-topbar">
        <div className="city-world-topbar-id">
          <span className="gx-eyebrow">GENESIS OS · EPIDEMIA — MIASTO 3D</span>
          <div className="city-world-topbar-status" aria-label="Stan epistemiczny świata">
            <span className="gx-status real">REAL RUN</span>
            <span className="gx-status not-modelled">FUTURE: NOT_MODELLED</span>
            <span className="city-world-topbar-day">dzień <b>{stats.dzien ?? 0}</b> · {renderBudget}/{displayedAgentCount} agentów</span>
            {analysis !== 'none' && <span className="city-world-topbar-day">warstwa: {analysisLabel}</span>}
            {experimentWorld && (
              <span className="city-world-topbar-day" title={experimentWorld.runFingerprint}>
                real run · {experimentWorld.resultOrigin} · {experimentWorld.runId.slice(0, 12)}…
              </span>
            )}
          </div>
        </div>
        <div className="city-world-topbar-actions">
          <button
            type="button"
            className="gx-btn city-world-drawer-btn"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            ☰ Panele i dane
          </button>
          <button className="gx-btn" onClick={() => { window.location.hash = '#/city'; }}>Tryb 2D</button>
        </div>
      </header>

      <section className="city-world-layout city-world-layout-v2">
        <section className="city-world-center" aria-label="Żywa scena miasta 3D">
          <div className={`city-3d-stage-wrap city-world-stage${enteredTimelineDay === timelineLogicalDay ? ' temporal-moment-entered' : ''}`} data-temporal-day={timelineLogicalDay} data-temporal-entered={enteredTimelineDay === timelineLogicalDay ? 'true' : 'false'}>
            <canvas ref={canvasRef} className="city-3d-canvas" aria-label="Żywa scena Three.js miasta z humanoidami sterowanymi przez model epidemii" />
            <TemporalWorldHud timeline={scenarioTimeline} day={timelineDay} enteredDay={enteredTimelineDay} />
            {/* LOOKING GLASS 2.1 — the live observation console: tell Genesis
                what to look at, in one sentence, and the REAL camera moves. */}
            <div className="lg-obs-live">
              <div className="lg-obs">
                <span className="lg-obs-title">ASK GENESIS</span>
                <form className="lg-obs-form" onSubmit={(event) => { event.preventDefault(); askObservation(obsText); }}>
                  <input
                    className="lg-obs-input"
                    type="text"
                    value={obsText}
                    placeholder="np. „Go to the hospital” / „Focus on the pump”"
                    onChange={(event) => setObsText(event.target.value)}
                  />
                  <button type="submit" className="lg-obs-send" disabled={obsText.trim().length === 0}>Go</button>
                </form>
                {obsResult && (
                  <div className="lg-obs-result">
                    <span className={`lg-obs-status is-${obsResult.status.toLowerCase()}`}>{obsResult.status}</span>
                    <p className="lg-obs-narration">{obsResult.narration}</p>
                  </div>
                )}
              </div>
            </div>
            {/* THE EDIT, VISIBLE IN THE WORLD. What the director chose, why it
                chose it, and the evidence behind it — so the viewer is never
                watching a pretty animation with no provenance. The time source
                is stated plainly: a marker from another run says so instead of
                showing a day this series never had. */}
            {/* THE EVENTS OF THIS RUN, SELECTABLE. They are listed rather than
                clicked in 3D because these events genuinely carry no
                coordinates — placing a marker somewhere plausible would be
                inventing a location. When a domain does provide one, the
                same record drives a spatial marker with no change here. */}
            {inspectableEvents.length > 0 && experience.mode !== 'INSPECT' && (
              <div className="lg-rail">
                <span className="lg-rail-title">zdarzenia przebiegu ({inspectableEvents.length})</span>
                <div className="lg-rail-items">
                  {inspectableEvents.slice(0, 8).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className="lg-rail-item"
                      onClick={() => setExperience((current) => inspect(current, event, cinematic?.elapsedSeconds ?? null, lookingGlass?.world?.clock))}
                    >
                      {event.semanticKind.replace(/_/g, ' ').toLowerCase()} · {event.time.tick}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {experience.selectedEvent && (
              <EventInspector
                event={experience.selectedEvent}
                allEvents={inspectableEvents}
                unit={(lookingGlass?.world?.getTemporalRange().unit ?? 'DAY').toLowerCase()}
                onClose={() => setExperience(closeInspection)}
                onReplay={() => setExperience(enterReplay)}
              />
            )}
            <span className="lg-mode-badge">{MODE_LABEL[experience.mode]}</span>
            {experience.mode !== 'INSPECT' && lookingGlass?.comparison && (
              <div className="lg-world-cmp">
                <ComparisonPanel comparison={lookingGlass.comparison} requestedButMissing={false} />
              </div>
            )}
            {direction && (
              <div className="lg-world-shot">
                <div className="lg-world-shot-head">
                  <span className={`lg-world-shot-kind lg-world-shot-${direction.shotKind.toLowerCase()}`}>{direction.shotKind}</span>
                  <span className="lg-world-shot-cam">{direction.cameraIntent}</span>
                  <span className="lg-world-shot-time">
                    {direction.worldTime !== null ? `dzień ${Math.round(direction.worldTime)}` : 'czas wstrzymany'}
                  </span>
                </div>
                <p className="lg-world-shot-reason">{direction.reason}</p>
                {/* The clock's OWN reason for the time shown — not the shot's
                    editorial reason above. Surfaced only when it says
                    something the day number alone does not: the clock
                    snapped over a real gap in the run, or froze because a
                    marker belongs to a different run's clock entirely. */}
                {(direction.worldTimeSnapped || direction.worldTime === null) && (
                  <p className="lg-world-shot-clock">{direction.worldTimeReason}</p>
                )}
                {direction.evidence.map((entry) => (
                  <p key={entry.id} className="lg-world-shot-evidence">
                    <span className="lg-world-shot-evid-id">{entry.id}</span>
                    {entry.replayStatus ? <span className={`lg-world-shot-replay is-${entry.replayStatus.toLowerCase()}`}>{entry.replayStatus}</span> : null}
                  </p>
                ))}
              </div>
            )}
            {loading && <div className="route-loading" role="status">Ładowanie miasta 3D…</div>}
            {failed && <div className="empty-state">WebGL nie uruchomił się. Użyj <button className="link-button" onClick={() => { window.location.hash = '#/city'; }}>trybu Canvas 2D</button>.</div>}
            {scenarioTimeline && timelineSample && (
              <div className="scenario-run-timeline" aria-label="Oś czasu zapisanego przebiegu scenariusza">
                <div className="scenario-run-identity">
                  <span className="scenario-run-badge">SIMULATION</span>
                  <strong>{scenarioTimeline.scenarioLabel}</strong>
                  <span className="mono" title={scenarioTimeline.runFingerprint}>run {scenarioTimeline.runId.slice(0, 14)}…</span>
                  <span>seed {scenarioTimeline.seed}</span>
                  <span>{scenarioTimeline.series.length} dni</span>
                  <span>{scenarioTimeline.origin === 'memory-replay' ? `odtworzenie z Pamięci · ${scenarioTimeline.replayVerdict ?? 'MATCH'}` : 'świeże wykonanie'}</span>
                  {scenarioTimeline.counterfactual && <span>ramię WARIANTU kontrfaktyku vs {scenarioTimeline.counterfactual.baseline.label}</span>}
                </div>
                <label className="scenario-run-scrubber">
                  <span>GO TO TIME · dzień {timelineSample.day} / {scenarioTimeline.series.length - 1}</span>
                  <input
                    type="range" min={0} max={scenarioTimeline.series.length - 1} step={1}
                    value={Math.min(timelineDay, scenarioTimeline.series.length - 1)}
                    onChange={(event) => { setTimelineDay(Number(event.target.value)); setEnteredTimelineDay(null); }}
                    aria-label="GO TO TIME — wybierz dzień dostępnego przebiegu"
                  />
                </label>
                <div className="scenario-run-time-actions">
                  <button type="button" className="chip-btn" onClick={() => setEnteredTimelineDay(timelineLogicalDay)}>
                    ENTER THIS MOMENT · DAY {timelineLogicalDay}
                  </button>
                  {enteredTimelineDay !== null && <span className="scenario-run-entered">ENTERED · DAY {enteredTimelineDay}</span>}
                </div>
                <div className="scenario-run-metrics">
                  <span>zakaźni<b>{timelineSample.infectious}</b></span>
                  <span>zmarli<b>{timelineSample.deceased}</b></span>
                  <span>podatni<b>{timelineSample.susceptible}</b></span>
                  <span>ozdrowieńcy<b>{timelineSample.recovered}</b></span>
                  <span>obłożenie łóżek<b>{(timelineSample.hospital.bedOccupancy * 100).toFixed(1)}%</b></span>
                </div>
                <details className="scenario-run-disclosure">
                  <summary>Co model liczy, a czego NIE liczy</summary>
                  {(() => {
                    const disclosure = describeScenarioEffects(scenarioTimeline.scenarioRun);
                    return (
                      <>
                        <p className="scenario-run-note"><strong>MODELOWANE ({disclosure.modeled.length}):</strong> {disclosure.modeled.map((entry) => `${entry.effect} [${entry.evidenceField}] = ${entry.value}`).join(' · ')}</p>
                        <p className="scenario-run-note"><strong>NOT_MODELED ({disclosure.notModeled.length}):</strong> {disclosure.notModeled.map((entry) => entry.effect).join(' · ')}</p>
                        <p className="scenario-run-note">{disclosure.boundary}</p>
                      </>
                    );
                  })()}
                </details>
                {scenarioTimeline.preparedness && (
                  <p className="scenario-run-note">
                    Pytanie rządzone: {scenarioTimeline.preparedness.questionId} — „{scenarioTimeline.preparedness.askedText}"
                  </p>
                )}
                <p className="scenario-run-note">
                  Stan pochodzi wyłącznie z zapisanej serii tego przebiegu. Model nie jest skalibrowany do żadnej
                  rzeczywistej epidemii — to symulacja scenariuszowa, nie prognoza ani obserwacja.
                </p>
                <div className="scenario-run-actions">
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => {
                      try {
                        const source = { kind: 'run' as const, saved: buildSavedScenarioRunContext(scenarioTimeline.scenarioRun, scenarioTimeline.preparedness) };
                        const bookmark = createTemporalStateBookmark(source, timelineLogicalDay);
                        setTimelineBookmark(bookmark);
                        setTimelineSaved(`BOOKMARK CREATED · ${bookmark.bookmarkId} · DAY ${bookmark.logicalDay}`);
                      } catch (error) {
                        setTimelineSaved(`Nie utworzono bookmarka: ${error instanceof Error ? error.message : String(error)}`);
                      }
                    }}
                  >
                    SAVE THIS MOMENT
                  </button>
                  {timelineBookmark && <button
                    type="button"
                    className="chip-btn"
                    onClick={() => {
                      const resolved = resolveTemporalStateBookmark(timelineBookmark);
                      if (resolved.status === 'MATCH') {
                        setTimelineDay(resolved.envelope.logicalDay);
                        setEnteredTimelineDay(resolved.envelope.logicalDay);
                        setTimelineSaved(`OPEN BOOKMARK · ${timelineBookmark.bookmarkId} · MATCH · DAY ${resolved.envelope.logicalDay}`);
                      } else {
                        setTimelineSaved(`OPEN BOOKMARK · ${timelineBookmark.bookmarkId} · ${resolved.status} · ${resolved.reason}`);
                      }
                    }}
                  >
                    OPEN BOOKMARK · REPLAY
                  </button>}
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => {
                      try {
                        const record = saveScenarioRunToMemory(scenarioTimeline.scenarioRun, undefined, scenarioTimeline.preparedness);
                        setTimelineSaved(`Zapisano w Pamięci Naukowej: #${record.contentHash}. Po przeładowaniu przebieg jest liczony od nowa i weryfikowany odciskiem.`);
                      } catch (error) {
                        setTimelineSaved(`Nie zapisano: ${error instanceof Error ? error.message : String(error)}`);
                      }
                    }}
                  >
                    Zapisz przebieg w Pamięci
                  </button>
                  {scenarioTimeline.counterfactual && (
                    <button
                      type="button"
                      className="chip-btn"
                      onClick={() => {
                        try {
                          const record = saveScenarioCounterfactualToMemory(scenarioTimeline.counterfactual!, undefined, scenarioTimeline.preparedness);
                          setTimelineSaved(`Zapisano kontrfaktyk (oba ramiona + różnica): #${record.contentHash}.`);
                        } catch (error) {
                          setTimelineSaved(`Nie zapisano kontrfaktyku: ${error instanceof Error ? error.message : String(error)}`);
                        }
                      }}
                    >
                      Zapisz kontrfaktyk w Pamięci
                    </button>
                  )}
                  <button type="button" className="chip-btn" onClick={() => { window.location.hash = '#/memory'; }}>Otwórz Pamięć Naukową</button>
                </div>
                {timelineSaved && <p className="scenario-run-note" role="status">{timelineSaved}</p>}
              </div>
            )}
            <div className="city-scene-readout" aria-live="polite">
              <span>model aktywny</span><strong>dzień {stats.dzien ?? 0}</strong><span>widok: {cameraPreset}</span><span>{analysis === 'none' ? 'widok normalny' : `warstwa: ${analysisLabel}`}</span>{experimentWorld && <span title={experimentWorld.runFingerprint}>real run · {experimentWorld.resultOrigin} · {experimentWorld.runId.slice(0, 12)}…</span>}
            </div>
            {person && (
              <aside className="city-3d-person-card city-agent-inspector gx-floating-card">
                <div className="agent-inspector-heading"><span>AGENT #{selectedId}</span><button onClick={() => { sim.clearSelection(); setCameraPreset('city'); }} aria-label="Zamknij inspekcję">×</button></div>
                <div className="agent-inspector-grid">
                  <span>wiek<b>{String(person.wiek)}</b></span><span>rola<b>{String(person.rola)}</b></span>
                  <span>stan<b>{String(person.stan)}</b></span><span>zachowanie<b>{String(person.zachowanie)}</b></span>
                  <span>izolacja<b>{String(person.izolowany)}</b></span><span>szpital<b>{String(person.hospitalizowany)}</b></span>
                  <span>zakażony przez<b>#{String(person.zarazony_przez)}</b></span>
                </div>
                <button className="world-action accent" onClick={() => { sim.clearSelection(); setCameraPreset('city'); }}>Przestań śledzić</button>
              </aside>
            )}
            {worldSelection && (
              <aside className="city-3d-person-card city-world-object-card gx-floating-card">
                <div className="agent-inspector-heading"><span>{worldSelection.kind.toUpperCase()}</span><button onClick={() => { sim.clearSelection(); setCameraPreset('city'); }} aria-label="Zamknij inspekcję świata">×</button></div>
                <strong>{worldSelection.label}</strong>
                <p>{worldSelection.detail}</p>
                <button className="world-action accent" onClick={() => { sim.clearSelection(); setCameraPreset('city'); }}>Wyczyść fokus</button>
              </aside>
            )}
          </div>
          {/* Minimal always-visible transport: play/step/speed/camera vantage.
              Everything ELSE (model detail, risk layers, network, scenario
              tools, diagnostics) moved into the on-demand drawer — the scene
              stays the hero, this is the one control strip that must always
              be reachable without opening anything. Lives in normal document
              flow (not floated over the canvas) so it never collides with
              the timeline/analytics-rail strips below, which become
              absolutely-positioned overlays of their own at wide viewports. */}
          <div className="city-world-transport-float" aria-label="Sterowanie czasem symulacji">
            <button className="world-action primary" onClick={running ? pause : play}>{running ? '⏸ Pauza' : '▶ Start'}</button>
            <button className="world-action" onClick={step}>⏭ Krok</button>
            <button className="world-action" onClick={reset}>↺ Restart</button>
            <span className="city-speed-control" role="group" aria-label="Prędkość symulacji">
              {CLOCK_SPEEDS.filter((value) => value > 0).map((value) => (
                <button key={value} className="world-speed" aria-pressed={speed === value} onClick={() => { setSpeed(value); setRunning(true); }}>{value}×</button>
              ))}
            </span>
            <span className="city-camera-control" role="group" aria-label="Poziom obserwacji świata">
              {CAMERA_PRESETS.map((preset) => <button key={preset.id} className="world-speed" aria-pressed={cameraPreset === preset.id} onClick={() => changeCamera(preset.id)}>{preset.label}</button>)}
            </span>
            <button className="world-action accent" onClick={() => { sim.focusFirstInfected(); setCameraPreset(sim.getCameraPreset()); setStats(sim.getStats()); }}>◉ Śledź zakażonego</button>
            <button className="world-action" onClick={() => { sim.focusLatestTransmission(); setCameraPreset(sim.getCameraPreset()); setStats(sim.getStats()); }}>↗ Ostatnia transmisja</button>
          </div>
          <div className="city-event-timeline" aria-label="Bieżący punkt osi symulacji">
            <div className="timeline-heading"><span>OŚ SYMULACJI</span><small>zdarzenia wynikają z modelu</small></div>
            <div className="timeline-track"><i /><b style={{ left: `${Math.min(96, 8 + Number(stats.dzien ?? 0) * 2)}%` }} /></div>
            <div className="timeline-labels"><span>start</span><span>dzień {stats.dzien ?? 0}</span><span>{stats.kontakty ?? 0} kontaktów · {stats.hospitalizowani ?? 0} hosp.</span></div>
          </div>
          <section className="city-world-analytics-rail" aria-label="Skrócona analityka World State">
            <div><span>HOTSPOTY</span><strong>{worldState.hotspots.length}</strong><small>komórki z zakaźnymi</small></div>
            <div><span>KLASTRY</span><strong>{worldState.clusters.household.length + worldState.clusters.location.length}</strong><small>realne transmisje</small></div>
            <div><span>HOSPITAL</span><strong>{worldState.hospital.status}</strong><small>{worldState.hospital.unmetCare} bez opieki</small></div>
            <div><span>MOBILITY</span><strong>{Math.round(worldState.mobility.effectiveMobility * 100)}%</strong><small>efektywna mobilność</small></div>
            <div className="analytics-rail-not-modeled"><span>ROUTES</span><strong>NOT_MODELED</strong><small>atrybucja kontaktów</small></div>
          </section>
        </section>

      </section>

      {drawerOpen && (
        <>
          <div className="gx-drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <aside className="gx-drawer" role="dialog" aria-modal="true" aria-label="Panele i dane modelu">
            <div className="gx-drawer-head">
              <strong>Panele i dane</strong>
              <button type="button" className="gx-drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Zamknij panele">×</button>
            </div>
            <div className="gx-drawer-tabs" role="tablist" aria-label="Kategorie paneli">
              <button type="button" className="gx-tab" role="tab" aria-selected={drawerTab === 'model'} onClick={() => setDrawerTab('model')}>Model</button>
              <button type="button" className="gx-tab" role="tab" aria-selected={drawerTab === 'risk'} onClick={() => setDrawerTab('risk')}>Ryzyko</button>
              <button type="button" className="gx-tab" role="tab" aria-selected={drawerTab === 'network'} onClick={() => setDrawerTab('network')}>Sieć</button>
              <button type="button" className="gx-tab" role="tab" aria-selected={drawerTab === 'scenario'} onClick={() => setDrawerTab('scenario')}>Scenariusze</button>
              <button type="button" className="gx-tab" role="tab" aria-selected={drawerTab === 'diagnostics'} onClick={() => setDrawerTab('diagnostics')}>Diagnostyka</button>
            </div>
            <div className="gx-drawer-body">
              {drawerTab === 'model' && (
                <>
                  <div className="world-panel model-panel">
                    <div className="world-panel-heading"><span>SEIRDD</span><small>aktywny model</small></div>
                    <div className="epidemic-summary">
                      {EPIDEMIC_LEGEND.map(([id, label, color]) => (
                        <div key={id} className="epidemic-summary-row"><i style={{ backgroundColor: color }} /><span>{id} · {label}</span><strong>{stats[id] ?? 0}</strong></div>
                      ))}
                      <div className="epidemic-summary-row accent-row"><i className="legend-hospital" /><span>hospitalizacja</span><strong>{stats.hospitalizowani ?? 0}</strong></div>
                      <div className="epidemic-summary-row accent-row"><i className="legend-isolation" /><span>izolacja</span><strong>{stats.izolowani ?? 0}</strong></div>
                    </div>
                  </div>

                  <div className="world-panel hospital-panel">
                    <div className="world-panel-heading">
                      <span>SZPITAL</span>
                      <small>{HOSPITAL_STATUS_LABELS[stats.hosp_status_code ?? 0]}</small>
                    </div>
                    <div className="epidemic-summary">
                      <div className="epidemic-summary-row"><span>łóżka ogólne</span><strong>{stats.hosp_occupied_beds ?? 0} / {stats.hosp_total_beds ?? 0}</strong></div>
                      <div className="epidemic-summary-row"><span>ICU</span><strong>{stats.hosp_occupied_icu ?? 0} / {stats.hosp_icu_beds ?? 0}</strong></div>
                      <div className="epidemic-summary-row"><span>obłożenie ogólne</span><strong>{(stats.hosp_bed_occupancy_pct ?? 0).toFixed(1)}%</strong></div>
                      <div className="epidemic-summary-row"><span>obłożenie ICU</span><strong>{(stats.hosp_icu_occupancy_pct ?? 0).toFixed(1)}%</strong></div>
                      <div className={`epidemic-summary-row ${(stats.hosp_unmet_care ?? 0) > 0 ? 'accent-row' : ''}`}>
                        <span>bez opieki</span><strong>{stats.hosp_unmet_care ?? 0}</strong>
                      </div>
                    </div>
                    <p className="hospital-panel-note">
                      Pojemność {DEFAULT_HOSPITAL_CAPACITY.totalBeds} łóżek / {DEFAULT_HOSPITAL_CAPACITY.icuBeds} ICU — ta sama
                      stała co w Scientific Core (<code>hospitalResource.ts</code>). Sprzężenie śmiertelności wyłączone: ta
                      warstwa liczy obciążenie, nie zmienia przebiegu epidemii.
                    </p>
                  </div>

                  <div className="world-panel parameter-panel">
                    <div className="world-panel-heading"><span>PARAMETRY MODELU</span><small>to samo źródło co Canvas</small></div>
                    <div className="world-parameter-list">
                      {SLIDERS.map((definition) => {
                        const raw = Number(params[definition.key] ?? definition.default);
                        const percentage = percentageKeys.includes(definition.key);
                        const shown = percentage ? Math.round(raw * 100) : raw;
                        return (
                          <label className="world-parameter" key={definition.key}>
                            <span>{definition.label}<b>{shown}{percentage ? '%' : definition.unit ? ` ${definition.unit}` : ''}</b></span>
                            <input type="range" min={percentage ? Number(definition.min) * 100 : definition.min} max={percentage ? Number(definition.max) * 100 : definition.max} step={percentage ? Number(definition.step) * 100 : definition.step} value={shown} aria-label={definition.label} onChange={(event) => updateParam(definition.key, percentage ? Number(event.target.value) / 100 : Number(event.target.value))} />
                          </label>
                        );
                      })}
                      <label className="world-toggle"><input type="checkbox" checked={Boolean(params.isolate)} onChange={(event) => updateParam('isolate', event.target.checked)} /><span>Izolacja objawowych</span></label>
                    </div>
                  </div>
                </>
              )}

              {drawerTab === 'risk' && (
                <>
                  <div className="world-panel risk-panel">
                    <div className="world-panel-heading"><span>MAPA RYZYKA</span><small>warstwa świata</small></div>
                    <select className="world-analysis-select" value={analysis} onChange={(event) => setAnalysis(event.target.value as AnalysisMode)} aria-label="Warstwa analizy 3D">
                      {ANALYSIS_MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
                    </select>
                    <div className="risk-gradient"><span>niskie</span><i /><span>wysokie</span></div>
                  </div>
                  <div className="world-panel layers-panel">
                    <div className="world-panel-heading"><span>WARSTWY</span><small>odczyt modelu</small></div>
                    {ANALYSIS_MODES.filter((mode) => mode.id !== 'none').map((mode) => <button key={mode.id} className="world-layer" aria-pressed={analysis === mode.id} onClick={() => setAnalysis(mode.id)}><span>{mode.label}</span><i /></button>)}
                    <label className="world-layer transmission-layer"><span>Ślady transmisji</span><input type="checkbox" checked={showTransmissions} onChange={(event) => setShowTransmissions(event.target.checked)} /></label>
                  </div>
                </>
              )}

              {drawerTab === 'network' && (
                <>
                  <div className="world-panel hotspot-panel">
                    <div className="world-panel-heading"><span>OGNISKA</span><small>World Engine Contract</small></div>
                    <div className="epidemic-summary">
                      <div className="epidemic-summary-row"><span>aktywne ogniska (siatka)</span><strong>{worldState.hotspots.length}</strong></div>
                      <div className="epidemic-summary-row"><span>klastry gospodarstw</span><strong>{worldState.clusters.household.length}</strong></div>
                      <div className="epidemic-summary-row"><span>klastry miejsc</span><strong>{worldState.clusters.location.length}</strong></div>
                    </div>
                    {topHotspots.length > 0 ? (
                      <ul className="hotspot-list">
                        {topHotspots.map((hotspot, index) => (
                          <li key={`hotspot-${index}`}><span>({Math.round(hotspot.x)}, {Math.round(hotspot.y)})</span><strong>{hotspot.infectious} zakaźnych</strong></li>
                        ))}
                      </ul>
                    ) : <p className="world-panel-empty">Brak ognisk — za mało jednoczesnych zakażeń w jednej komórce siatki.</p>}
                    {topClusters.length > 0 && (
                      <ul className="hotspot-list hotspot-cluster-list">
                        {topClusters.map((cluster) => (
                          <li key={cluster.clusterId}><span>{cluster.kind === 'household' ? 'gospodarstwo' : cluster.contactType} · dzień {Math.round(cluster.firstDay)}–{Math.round(cluster.lastDay)}</span><strong>{cluster.transmissions} transmisji</strong></li>
                        ))}
                      </ul>
                    )}
                    <p className="hospital-panel-note">
                      Ognisko = komórka siatki z realnymi zakaźnymi agentami; klaster = realne krawędzie transmisji w tym
                      samym gospodarstwie lub miejscu (<code>clusterAnalysis.ts</code>). Bez wykrywania heurystycznego —
                      pusty wynik jest wynikiem.
                    </p>
                  </div>
                  <div className="world-panel route-network-panel">
                    <div className="world-panel-heading"><span>SIEĆ MIEJSKA</span><small>World Engine · topologia</small></div>
                    <div className="epidemic-summary">
                      <div className="epidemic-summary-row"><span>jezdnie</span><strong>{topologyCounts.ROAD ?? 0}</strong></div>
                      <div className="epidemic-summary-row"><span>chodniki</span><strong>{topologyCounts.SIDEWALK ?? 0}</strong></div>
                      <div className="epidemic-summary-row"><span>przejścia</span><strong>{topologyCounts.CROSSING ?? 0}</strong></div>
                    </div>
                    <p className="hospital-panel-note">Topologia pochodzi z tego samego układu miasta co renderer. Przypisanie agentów do tras i segmentów kontaktu pozostaje <code>NOT_MODELED</code>.</p>
                  </div>
                  <div className="world-panel minimap-panel">
                    <div className="world-panel-heading"><span>MINIMAPA ŚWIATA</span><small>{modelAgents.length} agentów modelu</small></div>
                    <svg className="city-minimap" viewBox={`0 0 ${worldWidth} ${worldHeight}`} role="img" aria-label="Minimapa miasta z obiektami i agentami modelu">
                      <rect width={worldWidth} height={worldHeight} fill="#173126" />
                      {modelObjects.map((object, index) => <rect key={`object-${index}`} x={object.x} y={object.y} width={object.w} height={object.h} rx="4" fill={MINIMAP_OBJECT_COLORS[object.kind] ?? '#718096'} opacity={object.closed ? 0.34 : 0.92} />)}
                      {modelAgents.map((agent) => <circle key={agent.id} cx={agent.x} cy={agent.y} r="4.1" fill={MINIMAP_COLORS[agent.state] ?? '#cbd5e1'} opacity={agent.isolated ? 0.50 : 0.92} />)}
                    </svg>
                    <div className="minimap-key"><span><i className="minimap-building-key" /> obiekty</span><span><i className="minimap-agent-key" /> S/E/I/R/D</span></div>
                  </div>
                </>
              )}

              {drawerTab === 'scenario' && (
                <>
                  <EarthquakeScenarioPanel onOverlayChange={setEarthquakeOverlay} />
                  <ScenarioCommandCenterPanel params={scenarioTimeline ? { ...scenarioTimeline.scenarioRun.params } : params} temporalDay={scenarioTimeline ? timelineLogicalDay : null} />
                  <TemporalMultiversePanel params={scenarioTimeline ? { ...scenarioTimeline.scenarioRun.params } : params} temporalDay={scenarioTimeline ? timelineLogicalDay : null} />
                  <EvidenceReplayPanel />
                </>
              )}

              {drawerTab === 'diagnostics' && (
                <>
                  <div className="world-panel event-feed-panel">
                    <div className="world-panel-heading"><span>OSTATNIE ZDARZENIE</span><small>odczyt modelu</small></div>
                    {latestTransmission ? (
                      <div className="event-feed-item event-feed-transmission">
                        <i /><div><b>Transmisja A → B</b><span>dzień {Number(latestTransmission.day.toFixed(2))} · #{latestTransmission.from} → #{latestTransmission.to}</span></div>
                        <button className="world-action" onClick={() => { sim.focusLatestTransmission(); setCameraPreset(sim.getCameraPreset()); }}>Pokaż</button>
                      </div>
                    ) : <p className="world-panel-empty">Brak potwierdzonej transmisji w bieżącym przebiegu.</p>}
                  </div>
                  <div className="world-panel science-chat-world-panel">
                    <div className="world-panel-heading"><span>SCIENCE CHAT</span><small>aktywny kontekst</small></div>
                    <p>Jeden punkt sterowania dla parametrów, pytań i zapisu aktualnego eksperymentu.</p>
                    <button className="world-action accent" onClick={() => window.dispatchEvent(new Event('genesis:open-science-chat'))}>Otwórz panel</button>
                  </div>
                  <div className="world-panel observability-panel">
                    <div className="world-panel-heading"><span>OBSERWOWALNOŚĆ</span><small>renderer</small></div>
                    <div><span>FPS</span><b>{Math.round(stats.webgl_fps ?? 0)}</b></div>
                    <div><span>frame</span><b>{Number(stats.webgl_frame_ms ?? 0).toFixed(2)} ms</b></div>
                    <div><span>render</span><b>{Number(stats.webgl_render_ms ?? 0).toFixed(2)} ms</b></div>
                    <div><span>draw calls</span><b>{Math.round(stats.webgl_draw_calls ?? 0)}</b></div>
                    <div><span>triangles</span><b>{Math.round(stats.webgl_triangles ?? 0)}</b></div>
                    <div><span>textures (est.)</span><b>{(Number(stats.webgl_texture_bytes_estimate ?? 0) / (1024 * 1024)).toFixed(1)} MB</b></div>
                    <div><span>geometry (est.)</span><b>{(Number(stats.webgl_geometry_bytes_estimate ?? 0) / (1024 * 1024)).toFixed(1)} MB</b></div>
                    <div><span>GPU mem (est.)</span><b>{(Number(stats.webgl_gpu_bytes_estimate ?? 0) / (1024 * 1024)).toFixed(1)} MB</b></div>
                  </div>
                </>
              )}
            </div>
          </aside>
        </>
      )}

      <footer className="city-world-note">Fikcyjne miasto i abstrakcyjny patogen. Kolor ubrania, znaczniki, heatmapa i transmisje są odczytem modelu edukacyjnego, nie diagnozą ani prognozą.</footer>
    </main>
  );
}
