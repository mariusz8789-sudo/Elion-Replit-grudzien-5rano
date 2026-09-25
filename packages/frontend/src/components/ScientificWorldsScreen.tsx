import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useThreeLoop } from '../core/three/useThreeLoop';
import { AgentLabScene3D, TWIN_ID, type AgentCameraMode, type HumanTwinLodPreference, type SceneArtifact, type SceneWorld } from '../core/three/agentLabScene3D';
import { AgentController, type AgentReport } from '../core/scientificWorlds/agentController';
import { planActions } from '../core/scientificWorlds/actionPlanner';
import { parseWorldCommands, stationHandoffCommand, type ParsedCommands } from '../core/scientificWorlds/worldCommand';
import { LAB_CATALOG, LAB_OBSTACLES, LAB_ROOM, LAB_SPAWN, LAB_STATIONS, LAB_WORLD_ID, type LabStation } from '../core/scientificWorlds/labWorld';
import { createLabExperimentRunner } from '../core/scientificWorlds/experimentRunners';
import { createBiologyExperimentRunner } from '../core/scientificWorlds/biologyRunners';
import { BIOLOGY_CATALOG, BIOLOGY_OBSTACLES, BIOLOGY_ROOM, BIOLOGY_SPAWN, BIOLOGY_STATIONS, BIOLOGY_WORLD_ID } from '../core/scientificWorlds/biologyLabWorld';
import { parseBiologyWorldCommands } from '../core/scientificWorlds/biologyCommands';
import { createDefaultAnatomyView, isolateAnatomyNode, selectAnatomyNode, setAnatomyMode, setCutaway } from '../core/scientificWorlds/humanLab/anatomyView';
import type { AnatomyDisplayMode, AnatomyViewState } from '../core/scientificWorlds/humanLab/types';
import { TWIN_ASSET_TIER } from '../core/three/biologyLabKit';
import { humanTwinProvenanceLabel, type HumanTwinTier, type HumanTwinPresentationState } from '../core/three/humanTwinAsset';
import { bodyParts3dStructure, type ReferenceAnatomyState } from '../core/three/bodyParts3dPilot';
import { DEFAULT_CUTAWAY, type CutawayState } from '../core/three/humanTwinCutaway';
import type { TwinSurfaceMode } from '../core/three/humanTwinMaterials';
import { replayExperimentSession, type ExperimentRunner, type ExperimentSession, type ReplayVerdict } from '../core/scientificWorlds/experimentSession';
import { AGENT_STATE_LABEL_PL, type AgentActionState } from '../core/scientificWorlds/agentActionMachine';
import { narrateReport, narrateSession, type NarrationLine } from '../core/scientificWorlds/narration';
import { kernelLedger } from '../core/agent/cyberReasoningKernel';
import { getVoiceEngine } from '../core/guide/guideRuntime';
import { museumCalmSettings, museumUtterances } from '../core/guide/museumCalm';
import type { GuideLevel } from '../core/guide/narrationModel';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import HumanExplorerPanel from './HumanExplorerPanel';
import { macroMicroLevelForArtifact } from '../core/three/humanMacroMicroLayer';
import { createScientificWorldsCognitiveCore } from '../core/scientificWorlds/cognitiveBridge';
import { scienceMemoryPort } from '../core/scientificWorlds/scienceMemoryPort';
import { runCuriosityCycle, type CycleResult } from '../core/scientificWorlds/curiosityCycle';
import { runFlagshipJourney, type FlagshipJourneyResult } from '../core/scientificWorlds/agenticScienceRuntime';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import type { BiologyArtifact } from '../core/scientificWorlds/biologyRunners';
import type { WorldCommand } from '../core/scientificWorlds/worldCommand';
import { EXPLORER_ORGANS, bloodMagnificationCommands, explorerCommands } from '../core/scientificWorlds/humanExplorer';

/** The chemistry panel of the main Laboratory (Chemistry Live Lab), loaded only when opened. */
const ChemistryLabPanel = lazy(() => import('./ChemistryLiveLabScreen').then((m) => ({ default: m.ChemistryLiveLabScreen })));
import { titrationPolyline, titrationRegion } from '../core/scientificWorlds/titrationView';
import { nextFromCuriosity, outcomeFromLabSession } from '../core/product/scientificOutcome';
import { NextExperimentPanel, ScientificOutcomePanel } from './ScientificOutcomePanel';

/**
 * SCIENTIFIC WORLDS (`#/scientific-worlds`) — the laboratory the user
 * commands in plain language. Text → typed WorldCommand → ActionPlan → the
 * suited agent walks, reaches, works the console → ONE ExperimentSession
 * through the kernel's engines → the result appears in the world and in the
 * evidence panel, with its epistemic status, hashes and a replay button.
 *
 * The camera looks through the helmet visor (body and hands in frame); a
 * spectator camera is secondary. The HUD keeps to reserved safe zones —
 * status top-left, evidence top-right, command bar at the bottom — and
 * never covers the centre of the frame. Nothing on this screen is a
 * placeholder number: the log starts empty and every line comes from a
 * real command, session or verdict.
 */

const STATE_NAMES: readonly AgentActionState[] = ['IDLE', 'MOVING_TO_TARGET', 'ARRIVED', 'ALIGNING', 'REACHING', 'INTERACTING', 'EXECUTING', 'OBSERVING', 'REPORTING', 'RETURNING', 'BLOCKED'];

export const QUICK_COMMANDS: readonly { readonly label: string; readonly text: string }[] = [
  { label: 'Miareczkowanie', text: 'Podejdź do stanowiska miareczkowania i przeprowadź titrację kwasu octowego, dodając 25 mL NaOH. Potem pokaż wynik i dowody.' },
  { label: 'Synteza NaCl', text: 'Idź do syntezatora kryształów i uruchom próbę NaCl. Potem pokaż mi, co otrzymałeś i skąd to pochodzi.' },
  { label: 'Zderzacz 13 TeV', text: 'Podejdź do konsoli zderzacza i uruchom paczkę zderzeń przy 13 TeV.' },
  { label: 'Epidemia', text: 'Idź do pulpitu epidemiologicznego i zasymuluj epidemię.' },
  { label: 'Okno', text: 'Idź do okna obserwacyjnego.' },
];

/** The V3 acceptance sentence first; then one chip per station family. */
export const BIOLOGY_QUICK_COMMANDS: readonly { readonly label: string; readonly text: string }[] = [
  { label: 'Test V3', text: 'Otwórz wirtualnego człowieka, pokaż mózg, przejdź do Hyperscope, powiększ 5×, a potem zbadaj próbkę przez Orpheus i pokaż mi Evidence.' },
  { label: 'RTG', text: 'Otwórz wirtualnego człowieka i pokaż rtg.' },
  { label: 'Neuro', text: 'Idź do konsoli neuro i uruchom symulację sygnałów nerwowych.' },
  { label: 'Obrazowanie', text: 'Uruchom obrazowanie.' },
  { label: 'Histologia', text: 'Przygotuj preparat histologiczny.' },
  { label: 'DNA', text: 'Idź do ściany obliczeniowej i uruchom centralny dogmat dla sekwencji ATGGCCTTAGTGAAGCACGGTACCTTCGAATGGTGA.' },
];

interface WorldDefinition {
  readonly id: string; readonly label: string; readonly room: typeof LAB_ROOM; readonly obstacles: typeof LAB_OBSTACLES; readonly stations: readonly LabStation[];
  readonly spawn: typeof LAB_SPAWN; readonly catalog: typeof LAB_CATALOG; readonly quick: typeof QUICK_COMMANDS;
  readonly parse: (text: string, logicalTime: number) => ParsedCommands;
  readonly runner: (ledger: typeof kernelLedger) => ExperimentRunner<SceneArtifact>;
}

const WORLDS: Readonly<Record<SceneWorld, WorldDefinition>> = {
  physics: { id: LAB_WORLD_ID, label: 'LABORATORIUM', room: LAB_ROOM, obstacles: LAB_OBSTACLES, stations: LAB_STATIONS, spawn: LAB_SPAWN, catalog: LAB_CATALOG, quick: QUICK_COMMANDS, parse: (t, lt) => parseWorldCommands(t, LAB_CATALOG, lt), runner: (l) => createLabExperimentRunner(LAB_WORLD_ID, l) as ExperimentRunner<SceneArtifact> },
  biology: { id: BIOLOGY_WORLD_ID, label: 'HUMAN BIOLOGY LAB', room: BIOLOGY_ROOM, obstacles: BIOLOGY_OBSTACLES, stations: BIOLOGY_STATIONS, spawn: BIOLOGY_SPAWN, catalog: BIOLOGY_CATALOG, quick: BIOLOGY_QUICK_COMMANDS, parse: parseBiologyWorldCommands, runner: (l) => createBiologyExperimentRunner(BIOLOGY_WORLD_ID, l) as ExperimentRunner<SceneArtifact> },
};

/** Pure: the twin's view after an interaction at the anatomy table (V3 anatomyView reducers; unknown nodes are refused, not invented). */
export function applyAnatomyInteraction(state: AnatomyViewState, parameters: Readonly<Record<string, string | number | boolean>>, manifest: Parameters<typeof isolateAnatomyNode>[2]): { readonly state: AnatomyViewState; readonly error: string | null } {
  const action = String(parameters.action ?? '');
  const mode = String(parameters.mode ?? 'NORMAL') as AnatomyDisplayMode;
  try {
    if (action === 'OPEN_TWIN') return { state: setAnatomyMode(createDefaultAnatomyView(state.twinId), mode), error: null };
    if (action === 'FOCUS_ANATOMY') return { state: setAnatomyMode(isolateAnatomyNode(state, String(parameters.focus ?? 'brain'), manifest), mode), error: null };
    if (action === 'SET_ANATOMY_MODE') return { state: setAnatomyMode(state, mode), error: null };
    // D-131: the two V3 reducers that existed but had no renderer behind them until the section plane was implemented.
    if (action === 'SET_CUTAWAY') return { state: setCutaway(state, parameters.enabled !== false), error: null };
    if (action === 'ISOLATE_NODE') return { state: isolateAnatomyNode(state, String(parameters.focus ?? state.selectedNodeId), manifest), error: null };
    if (action === 'CLEAR_ISOLATION') return { state: { ...state, isolatedNodeIds: [] }, error: null };
    return { state, error: null };
  } catch (e) { return { state, error: e instanceof Error ? e.message : String(e) }; }
}

export interface TranscriptEntry { readonly id: number; readonly who: 'user' | 'agent' | 'system'; readonly text: string; }

/** Pure: what the HUD says about a parsed command before the body moves. */
export function describePlan(commandCount: number, unresolved: readonly string[], steps: readonly string[], rejected: readonly { reason: string }[]): string {
  const parts: string[] = [];
  if (commandCount) parts.push(`Rozumiem ${commandCount} ${commandCount === 1 ? 'polecenie' : 'polecenia'}: ${steps.join(' → ') || 'bez kroków'}.`);
  if (unresolved.length) parts.push(`Nie zrozumiałem: „${unresolved.join('”, „')}”.`);
  for (const r of rejected) parts.push(`Odrzucone: ${r.reason}.`);
  if (!parts.length) parts.push('Nie znalazłem polecenia w tym tekście.');
  return parts.join(' ');
}

export function ScientificWorldsScreen({ world = 'physics' }: { readonly world?: SceneWorld } = {}): JSX.Element {
  const def = WORLDS[world];
  const runner = useMemo(() => def.runner(kernelLedger), [def]);
  const controller = useMemo(() => new AgentController({ room: def.room, obstacles: def.obstacles, stations: def.stations, start: def.spawn, runner, worldId: def.id, defaultSeed: 7 }), [def, runner]);
  const sim = useMemo(() => new AgentLabScene3D(controller, def.stations, def.room, world), [controller, def, world]);
  const [anatomy, setAnatomy] = useState<AnatomyViewState>(() => createDefaultAnatomyView(TWIN_ID));
  const anatomyRef = useRef(anatomy); anatomyRef.current = anatomy;
  const params = useMemo(() => ({}), []);
  const [agentState, setAgentState] = useState<AgentActionState>('IDLE');
  const [stationId, setStationId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [session, setSession] = useState<ExperimentSession | null>(null);
  const [artifactKind, setArtifactKind] = useState<string | null>(null);
  const [bioArtifact, setBioArtifact] = useState<BiologyArtifact | null>(null);
  const [sessions, setSessions] = useState<ExperimentSession[]>([]);
  const explorerOpen = true;
  useEffect(() => { sim.setResearchLayout(false); if (world === 'biology') sim.setCameraMode('TWIN'); }, [sim, world]);
  const [twinTier, setTwinTier] = useState<HumanTwinTier>('PROXY');
  const [twinLoad, setTwinLoad] = useState<HumanTwinPresentationState>(() => sim.getTwinLoadState());
  const [referenceAnatomy, setReferenceAnatomy] = useState<ReferenceAnatomyState>(() => sim.getReferenceAnatomyState());
  const [twinLod, setTwinLod] = useState(() => sim.getTwinLodState());
  const [twinLodPreference, setTwinLodPreference] = useState<HumanTwinLodPreference>('AUTO');
  const [cutaway, setCutawayState] = useState<CutawayState>(DEFAULT_CUTAWAY);
  const [curiosity, setCuriosity] = useState<CycleResult | null>(null);
  const [curiosityBusy, setCuriosityBusy] = useState(false);
  const [flagship, setFlagship] = useState<FlagshipJourneyResult | null>(null);
  const [replay, setReplay] = useState<ReplayVerdict | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [text, setText] = useState('');
  const [chatPrompt, setChatPrompt] = useState('');
  const [camera, setCamera] = useState<AgentCameraMode>(world === 'biology' ? 'TWIN' : 'VISOR');
  /** D-131: how the twin's BODY shell is drawn (skin / translucent / stylised x-ray / ghost). */
  const [surface, setSurface] = useState<TwinSurfaceMode>('NORMAL');
  const [voice, setVoice] = useState(false);
  const [level, setLevel] = useState<GuideLevel>('EXPLORER');
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  /** The chemistry panel docked in the Laboratory: periodic table, experiments, levels; titration runs at the station. */
  const [chemistryOpen, setChemistryOpen] = useState(false);
  const [chemistryCardOpen, setChemistryCardOpen] = useState(true);
  const [frames, setFrames] = useState(0);
  const logicalTime = useRef(0);
  const nextId = useRef(1);
  const levelRef = useRef(level); levelRef.current = level;
  const sessionRef = useRef<ExperimentSession | null>(null);
  const cutawayRef = useRef<CutawayState>(DEFAULT_CUTAWAY);
  const voiceRef = useRef(voice); voiceRef.current = voice;

  const say = useCallback((who: TranscriptEntry['who'], line: string) => {
    setTranscript((t) => [...t.slice(-40), { id: nextId.current++, who, text: line }]);
  }, []);
  const speak = useCallback((lines: readonly NarrationLine[]) => {
    for (const l of lines) say('agent', l.text);
    if (voiceRef.current) {
      // Museum-calm delivery (D-129): the engine's own providers, calmer pacing, captions on, the status first, one idea per utterance.
      const engine = getVoiceEngine();
      engine.update(museumCalmSettings(engine.settings));
      const status = lines.find((l) => l.key === 'status') ? sessionRef.current?.epistemicStatus ?? null : null;
      const utterances = museumUtterances(lines.filter((l) => l.key !== 'status'), status, 'pl');
      const joined = utterances.map((u) => u.text).join(' ');
      engine.speak({ key: `worlds:${lines[0]?.key ?? 'line'}`, text: joined, lang: 'pl' });
    }
  }, [say]);

  const onStats = useCallback((s: Record<string, number>) => {
    setAgentState((prev) => { const next = STATE_NAMES[s.agentState ?? 0] ?? 'IDLE'; return prev === next ? prev : next; });
    setProgress((p) => (Math.abs(p - (s.progress ?? 0)) > 0.02 ? s.progress ?? 0 : p));
    setFrames((f) => (s.frames && s.frames - f >= 10 ? s.frames : f));
  }, []);
  const { canvasRef, loading, failed } = useThreeLoop(sim, params, true, onStats);

  useEffect(() => {
    sim.setTwinTierListener((tier) => setTwinTier(tier));
    sim.setTwinLoadListener(setTwinLoad);
    sim.setReferenceAnatomyListener(setReferenceAnatomy);
    sim.setTwinLodListener(setTwinLod);
    setTwinLoad(sim.getTwinLoadState());
    setTwinTier(sim.getTwinTier());
    sim.setUpdateListener((u) => {
      if (u.stationId) setStationId(u.stationId);
      setBlocked(u.blockedReason);
      if (u.sessionSealed) {
        const { session: sealed, artifact } = u.sessionSealed;
        setSession(sealed); sessionRef.current = sealed; setReplay(null); setArtifactKind((artifact as SceneArtifact).kind);
        setSessions((list) => [...list.slice(-40), sealed]);
        if (world === 'biology') setBioArtifact(artifact as BiologyArtifact);
        if (sealed.stationId) sim.setArtifact(sealed.stationId, artifact as SceneArtifact);
        if (sealed.experimentId === 'chemistry-titration') setChemistryCardOpen(true);
        sim.noteSealedSession(sealed);
      }
      if (u.interaction && u.interaction.stationId === 'station:human-study') {
        const r = applyAnatomyInteraction(anatomyRef.current, u.interaction.parameters, sim.manifest);
        if (r.error) say('system', `Bliźniak: odmowa — ${r.error}.`);
        else {
          // Selecting anatomy changes the displayed result, never the sealed history/ledger.
          setBioArtifact(null); setSession(null); sessionRef.current = null;
          setAnatomy(r.state);
          sim.setTwinView(r.state.displayMode, r.state.selectedNodeId);
          sim.setTwinIsolated(r.state.isolatedNodeIds);
          const next = { ...cutawayRef.current, enabled: r.state.cutawayEnabled };
          cutawayRef.current = next; setCutawayState(next); sim.setTwinCutaway(next);
          say('agent', `Bliźniak: tryb ${r.state.displayMode}, wybrany węzeł ${r.state.selectedNodeId} (anatomia: MODEL; postać: ${sim.getTwinTier() === 'LICENSED_CC0_ASSET' ? 'CC0' : TWIN_ASSET_TIER}).`);
        }
      }
      if (u.report) {
        const report: AgentReport = u.report;
        speak(narrateReport(report, { level: levelRef.current, lang: 'pl' }));
        if (report.deferred.some((d) => d.intent === 'ASK')) { /* the question is handed to Science Chat by the button below */ }
      }
    });
    return () => { sim.setUpdateListener(null); sim.setTwinTierListener(null); sim.setTwinLoadListener(null); sim.setTwinLodListener(null); sim.setReferenceAnatomyListener(null); };
  }, [sim, speak, say, world]);

  /** Typed commands from the Human Explorer's clicks: the same planner and controller as the command bar, no parser in between. */
  const runCommands = useCallback((parsed: ParsedCommands) => {
    const plan = planActions(parsed.commands, def.catalog, controller.station);
    say('system', describePlan(parsed.commands.length, parsed.unresolved, plan.steps.map((s) => s.kind), plan.rejected));
    if (plan.steps.length === 0) return;
    const started = controller.startPlan(plan);
    if (!started.ok) say('system', `Agent nie może przyjąć planu: ${started.reason}.`);
    else { setBlocked(null); const first = plan.steps.find((s) => 'stationId' in s); sim.setHighlight(first && 'stationId' in first ? first.stationId : null); }
  }, [controller, def, say, sim]);
  const submit = useCallback((raw: string) => {
    const t = raw.trim(); if (!t) return;
    say('user', t);
    logicalTime.current += 1;
    runCommands(def.parse(t, logicalTime.current));
    setText('');
  }, [def, runCommands, say]);
  const submitCommands = useCallback((commands: readonly WorldCommand[], label: string) => { say('user', label); runCommands({ commands, unresolved: [] }); }, [runCommands, say]);
  const nextLogicalTime = useCallback(() => { logicalTime.current += 1; return logicalTime.current; }, []);
  const chatHumanHandoffConsumed = useRef(false);
  useEffect(() => {
    if (world !== 'biology' || chatHumanHandoffConsumed.current) return;
    const query = window.location.hash.split('?')[1] ?? '';
    const params = new URLSearchParams(query);
    const focus = params.get('focus');
    const level = params.get('level');
    const specimen = params.get('specimen');
    if (specimen === 'blood') {
      chatHumanHandoffConsumed.current = true;
      const requested = Number(params.get('magnification') ?? 500);
      const magnification = [1, 5, 25, 100, 500, 1000].includes(requested) ? requested : 500;
      const lt = nextLogicalTime();
      const label = `Chat: krew pod mikroskopem ${magnification}×`;
      submitCommands(bloodMagnificationCommands(magnification, label, lt), label);
      return;
    }
    if (!focus) return;
    chatHumanHandoffConsumed.current = true;
    if (focus === 'body') {
      const next = createDefaultAnatomyView(TWIN_ID);
      setAnatomy(next); sim.setTwinView(next.displayMode, next.selectedNodeId); sim.setTwinIsolated([]);
      return;
    }
    const organ = EXPLORER_ORGANS.find((entry) => entry.organId === focus);
    if (organ) {
      const target = level === 'cell' ? 'cell' : level === 'tissue' ? 'tissue' : 'organ';
      const lt = nextLogicalTime();
      submitCommands(explorerCommands(organ, target, `Chat: ${focus} → ${target}`, lt), `Chat: ${focus} → ${target}`);
      return;
    }
    if (bodyParts3dStructure(focus)) {
      const next = isolateAnatomyNode(setAnatomyMode(createDefaultAnatomyView(TWIN_ID), 'ORGANS'), focus, sim.manifest);
      setAnatomy(next); sim.setTwinView(next.displayMode, next.selectedNodeId); sim.setTwinIsolated(next.isolatedNodeIds);
    }
  }, [nextLogicalTime, sim, submitCommands, world]);
  /**
   * The ONE main Laboratory is where chemistry and physics requests land: `?station=<id>&…` (from the chat,
   * the research-mode menu or an Experiment Fabric product route) becomes one validated RUN_EXPERIMENT at
   * that station. Each distinct handoff runs once; the station's own runner does the science.
   */
  const stationHandoffConsumed = useRef<string | null>(null);
  useEffect(() => {
    if (world !== 'physics') return;
    const consume = (): void => {
      const query = window.location.hash.split('?')[1] ?? '';
      if (!query || stationHandoffConsumed.current === query) return;
      const command = stationHandoffCommand(query, def.catalog, nextLogicalTime());
      if (!command) return;
      stationHandoffConsumed.current = query;
      if (command.targetEntityId === 'st-titration') setChemistryOpen(true);
      submitCommands([command], command.text);
    };
    consume();
    window.addEventListener('hashchange', consume);
    window.addEventListener('genesis-product-route', consume);
    return () => {
      window.removeEventListener('hashchange', consume);
      window.removeEventListener('genesis-product-route', consume);
    };
  }, [def.catalog, nextLogicalTime, submitCommands, world]);
  useEffect(() => {
    sim.setOrganPickListener((id) => {
      const organ = EXPLORER_ORGANS.find((entry) => entry.organId === id);
      // A reference-atlas structure with no explorer ladder (the aorta) is still selectable: the pick
      // updates the anatomy view directly — no agent session, no macro→micro claim.
      if (!organ && bodyParts3dStructure(id)) {
        const next = selectAnatomyNode(anatomyRef.current, id, sim.manifest);
        setAnatomy(next); sim.setTwinView(next.displayMode, next.selectedNodeId);
        return;
      }
      if (!organ || !['IDLE', 'ARRIVED', 'BLOCKED'].includes(controller.getDiagnostics().state)) return;
      const lt = nextLogicalTime();
      submitCommands(explorerCommands(organ, 'organ', `Wybór narządu: ${id}`, lt), `Wybór narządu: ${id}`);
    });
    return () => sim.setOrganPickListener(null);
  }, [sim, controller, nextLogicalTime, submitCommands]);
  /** D-130: the autonomous curiosity cycle on this world — ledger gap → question → hypothesis pair → the canonical experiment (headless, same runner and ledger) → belief revision → Science Memory.
   *  The first click proposes (AWAITING_HUMAN_APPROVAL); the second click is the approval — the operator's name is the approval token's grantor. */
  const bridgeRef = useRef<ReturnType<typeof createScientificWorldsCognitiveCore> | null>(null);
  const runCuriosity = useCallback(async (approve: boolean) => {
    if (curiosityBusy) return;
    setCuriosityBusy(true);
    try {
      bridgeRef.current ??= createScientificWorldsCognitiveCore({ worldId: def.id, catalog: def.catalog, stations: def.stations, parse: def.parse, runner, ledger: kernelLedger, memory: scienceMemoryPort(), defaultSeed: 7 });
      const probeRunner = def.runner(new EvidenceLedger({ now: () => Date.now() }));
      const result = await runCuriosityCycle({ bridge: bridgeRef.current, binding: { worldId: def.id, catalog: def.catalog, stations: def.stations, parse: def.parse, runner, ledger: kernelLedger, memory: bridgeRef.current.memory ?? undefined }, probeRunner, approvedBy: approve ? 'operator (HUD)' : null, maxIterations: 1 });
      setCuriosity(result);
      const it = result.iterations[0];
      if (!it) { say('system', 'Ciekawość: brak luk w bazie dowodów — nie ma pytania do zbadania.'); return; }
      say('agent', `Ciekawość: ${it.question.text}`);
      if (it.hypotheses.length) say('agent', `Hipotezy: ${it.hypotheses.map((h) => `${h.revised.criterion.metric}≈${h.revised.criterion.expectedValue} (${h.assessment}, pewność ${h.revised.confidence.toFixed(2)})`).join(' | ')}`);
      if (it.terminal === 'AWAITING_HUMAN_APPROVAL' && it.experiment) say('system', `Proponowany eksperyment różnicujący: ${it.experiment.experimentId} przy ${it.experiment.station.label}. Wymaga zatwierdzenia przez człowieka — kliknij „Zatwierdź i uruchom".`);
      else if (it.session) { setSession(it.session); sessionRef.current = it.session; setReplay(null); setSessions((list) => [...list.slice(-40), it.session!]); sim.noteSealedSession(it.session); say('agent', `Sesja ${it.session.sessionId} (${it.session.epistemicStatus}) zapieczętowana; ${it.key}=${it.observed}. Wynik dotyczy modelu, nie świata. Zapisano w Pamięci Naukowej.`); }
      else say('system', `Cykl zakończony: ${it.terminal}${it.sourceSearch.ingestionRequest ? ` — ${it.sourceSearch.ingestionRequest}` : ''}.`);
    } finally { setCuriosityBusy(false); }
  }, [curiosityBusy, def, runner, say, sim]);
  /** D-130: the flagship journey (mirror twin → circular gate → time machine → the agentic loop at the observation window → capture spec → replay), headless on this world's services.
   *  The click is the human approval for the one experiment the loop runs; every state is narrated with its label. Physics world only (the window runs the photon model). */
  const runAgentic = useCallback(async () => {
    if (curiosityBusy || world !== 'physics') return;
    setCuriosityBusy(true);
    try {
      bridgeRef.current ??= createScientificWorldsCognitiveCore({ worldId: def.id, catalog: def.catalog, stations: def.stations, parse: def.parse, runner, ledger: kernelLedger, memory: scienceMemoryPort(), defaultSeed: 7 });
      const r = await runFlagshipJourney({ sessionId: `flagship-${Date.now().toString(36)}`, binding: { worldId: def.id, catalog: def.catalog, stations: def.stations, parse: def.parse, runner, ledger: kernelLedger, defaultSeed: 7 }, bridge: bridgeRef.current, room: def.room, obstacles: def.obstacles, spawn: def.spawn, userGoal: 'Czy zakrzywiona czasoprzestrzeń zmienia propagację światła w modelu? Wyjaśnij wynik i jego dowody.', mode: 'SCIENTIFIC', approvedBy: 'operator (HUD)' });
      setFlagship(r);
      say('agent', `Lustro: ${r.mirror.state} (${r.mirror.identityScope}); bliźniak: ${r.mirror.divergenceAction ?? '—'}.`);
      say('agent', `Brama: ${r.portal.style} ${r.portal.phase}, przejście ${r.portal.traversed ? 'wykonane' : 'nie'}; świat docelowy ${r.portal.destinationStatus}.`);
      say('agent', `Wehikuł czasu: ${r.timeMachine.mode} → ${r.timeMachine.epistemicStatus}${r.timeMachine.computation ? `, różnica zegarów ${r.timeMachine.computation.differenceSeconds.toExponential(3)} s/dobę (${r.timeMachine.computation.regime})` : ''}.`);
      setSession(r.trace.session); sessionRef.current = r.trace.session; setReplay(null); setSessions((list) => [...list.slice(-40), r.trace.session]); sim.noteSealedSession(r.trace.session); if (r.trace.session.stationId) sim.setArtifact(r.trace.session.stationId, ((): SceneArtifact => { const v = replayExperimentSession(r.trace.session, runner); return v.artifact as SceneArtifact; })());
      say('agent', `Falsyfikacja: ${r.trace.falsification.status} — ${r.trace.falsification.rationale}`);
      say('agent', r.trace.finalAnswer.text);
      say('system', `Zapis sesji: ${r.events.length} zdarzeń w łańcuchu, replay ${r.replayMatches ? 'ZGODNY' : 'ROZBIEŻNY'}, sesja ${r.sessionReplay}; capture ${r.capture.aspect} z etykietą ${r.capture.badge.status}.`);
    } catch (e) { say('system', `Pętla agentowa odmówiła: ${e instanceof Error ? e.message : String(e)}.`); }
    finally { setCuriosityBusy(false); }
  }, [curiosityBusy, def, runner, say, sim, world]);

  const onSubmit = (e: FormEvent): void => { e.preventDefault(); submit(text); };
  const doReplay = (): void => {
    if (!session) return;
    const verdict = replayExperimentSession(session, runner);
    setReplay(verdict);
    if (session.stationId) sim.setArtifact(session.stationId, verdict.artifact as SceneArtifact);
    speak(narrateSession(session, { level: levelRef.current, lang: 'pl', includeProvenance: false, replay: verdict }).filter((l) => l.key === 'replay'));
  };
  // The curiosity cycle is the lab's one producer of the next experiment; its controls live in the shared Next Experiment panel.
  const curiosityActions = (
    <div className="sw-actions" data-testid="sw-curiosity">
      <button type="button" className="sw-btn" onClick={() => void runCuriosity(false)} disabled={curiosityBusy} data-testid="sw-curiosity-propose">Ciekawość: zaproponuj</button>
      {curiosity?.terminal === 'AWAITING_HUMAN_APPROVAL' && <button type="button" className="sw-btn sw-btn-primary" onClick={() => void runCuriosity(true)} disabled={curiosityBusy} data-testid="sw-curiosity-approve">Zatwierdź i uruchom</button>}
      {curiosity && <span className="sw-badge" data-testid="sw-curiosity-terminal">{curiosity.terminal}</span>}
      {world === 'physics' && <button type="button" className="sw-btn" onClick={() => void runAgentic()} disabled={curiosityBusy} data-testid="sw-agentic-run">Pętla agentowa: foton (zatwierdzam)</button>}
      {flagship && <span className="sw-badge" data-testid="sw-agentic-status">MIRROR EXPERIMENTAL / SYNTHETIC · {flagship.trace.falsification.status} · replay {flagship.replayMatches ? 'MATCH' : 'DRIFT'}</span>}
    </div>
  );
  const toggleCamera = (): void => { const next: AgentCameraMode = camera === 'VISOR' ? 'SPECTATOR' : 'VISOR'; setCamera(next); sim.setCameraMode(next); };
  // D-131: the twin camera frames the body instead of the agent; turning it off returns to the observer shot.
  const setTwinCamera = (on: boolean): void => { const next: AgentCameraMode = on ? 'TWIN' : 'SPECTATOR'; setCamera(next); sim.setCameraMode(next); };
  // D-131: the body shell's presentation. Stylised views of a model — no label, session or evidence changes.
  const applySurface = (mode: TwinSurfaceMode): void => { setSurface(mode); sim.setTwinSurface(mode); };
  const openResearchCompanion = (): void => {
    sim.engageResearchCompanion();
    requestOpenScienceChat();
  };
  const station = stationId ? def.stations.find((s) => s.id === stationId) ?? null : null;
  const working = agentState === 'REACHING' || agentState === 'INTERACTING' || agentState === 'EXECUTING';
  const titrationResult = session?.experimentId === 'chemistry-titration' ? {
    acid: String(session.outputs.acid), acidName: String(session.outputs.acidName),
    vb: Number(session.outputs.vb), ph: Number(session.outputs.ph), veq: Number(session.outputs.veq), pKa: Number(session.outputs.pKa),
  } : null;

  const researchControls = <>
      <section className="sw-hud sw-hud-status" aria-label="Stan agenta" data-testid="sw-status">
        <div className="sw-badges">
          <span className="sw-badge">GENESIS · {def.label}</span>
          <span className="sw-badge" data-testid="sw-agent-state">{AGENT_STATE_LABEL_PL[agentState]}</span>
          {station && <span className="sw-badge">STANOWISKO: {station.label}</span>}
          <span className="sw-badge sw-research-only" data-testid="sw-camera-badge">KAMERA: {camera === 'VISOR' ? 'WIZJER' : camera === 'TWIN' ? 'BLIŹNIAK' : 'OBSERWATOR'}</span>
          {world === 'biology' && <span className="sw-badge" data-testid="sw-twin" data-tier={twinTier} data-lod={twinLod?.level ?? 'PROXY_LOW'} data-lod-diagnostics={JSON.stringify(twinLod)} data-load-state={twinLoad.status} data-load-reason={twinLoad.reason} data-load-diagnostics={JSON.stringify(twinLoad)}>
            {twinLoad.status === 'LOADING' ? 'Ładowanie modelu człowieka…' : `BLIŹNIAK: ${anatomy.displayMode} · ${anatomy.selectedNodeId} · ${humanTwinProvenanceLabel(twinTier)}`}
          </span>}
          {world === 'biology' && twinLoad.status === 'ERROR' && <span className="sw-badge" role="status">Nie udało się załadować pełnego modelu. <button type="button" className="sw-btn sw-btn-mini" data-testid="sw-twin-retry" onClick={() => sim.retryTwinLoad()}>Ponów ładowanie</button></span>}
          {world === 'biology' && twinLoad.status === 'BLOCKED' && <span className="sw-badge" role="status">Model nie jest zatwierdzony w rejestrze zasobów.</span>}
          {world === 'biology' && <label className="sw-badge">LOD
            <select className="sw-select" value={twinLodPreference} data-testid="sw-twin-lod" onChange={(event) => {
              const preference = event.target.value as HumanTwinLodPreference;
              setTwinLodPreference(preference); sim.setTwinLodPreference(preference);
            }}>
              <option value="AUTO">Auto</option><option value="FULL">Pełny GLB</option><option value="LOW">Proxy low</option>
            </select>
          </label>}
        </div>
        {agentState !== 'IDLE' && agentState !== 'BLOCKED' && <div className="sw-progress" aria-hidden="true"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
        {blocked && <p className="cw-error" role="alert" data-testid="sw-blocked">Zablokowany: {blocked}</p>}
        {controlsOpen && <div className="sw-actions">
          <button type="button" className="sw-btn" onClick={toggleCamera} data-testid="sw-camera">{camera === 'VISOR' ? 'Kamera obserwatora' : 'Wróć do wizjera'}</button>
          <button type="button" className={`sw-btn${voice ? ' is-on' : ''}`} onClick={() => setVoice((v) => !v)} aria-pressed={voice} data-testid="sw-voice">Głos {voice ? 'wł.' : 'wył.'}</button>
          {world === 'biology' && <>
            <span className="sw-badge" data-testid="sw-ai-companion-label">AI NAUKOWIEC · VISUAL_AI_COMPANION · MODEL</span>
            <button type="button" className="sw-btn sw-btn-primary" onClick={openResearchCompanion} data-testid="sw-ai-companion-chat" aria-label="Porozmawiaj z holograficznym naukowcem przez istniejący ScienceChat">Porozmawiaj z hologramem · ScienceChat</button>
          </>}
          <select className="sw-select" value={level} onChange={(e) => setLevel(e.target.value as GuideLevel)} aria-label="Poziom narracji" data-testid="sw-level">
            <option value="EXPLORER">Odkrywca</option><option value="SCIENTIST">Naukowiec</option><option value="AUDITOR">Audytor</option>
          </select>
        </div>}
      </section>

      <section className={`sw-hud sw-hud-evidence${evidenceOpen ? '' : ' is-collapsed'}`} aria-label="Dowody i sesja" data-testid="sw-evidence">
        <button type="button" className="sw-hud-toggle" onClick={() => setEvidenceOpen((o) => !o)} aria-expanded={evidenceOpen}>DOWODY · SESJA {evidenceOpen ? '▾' : '▸'}</button>
        {evidenceOpen && (session ? (
          <dl className="sw-session" data-testid="sw-session" data-session-id={session.sessionId}>
            <dt>Sesja</dt><dd className="cw-mono">{session.sessionId}</dd>
            <dt>Eksperyment</dt><dd className="cw-mono">{session.experimentId} · ziarno {session.seed}</dd>
            <dt>Status</dt><dd><span className={`sw-status sw-status-${session.epistemicStatus.toLowerCase()}`} data-testid="sw-epistemic">{session.epistemicStatus}</span> · {session.engineLabel}</dd>
            <dt>Wejścia</dt><dd className="cw-mono">{JSON.stringify(session.inputs)}</dd>
            <dt>Wyniki</dt><dd className="cw-mono sw-outputs" data-testid="sw-outputs">{Object.entries(session.outputs).map(([k, v]) => <span key={k}>{k}: {String(v)}</span>)}</dd>
            <dt>Artefakt</dt><dd className="cw-mono">{artifactKind ?? '—'} · renderowany z tej sesji</dd>
          </dl>
        ) : (
          <p className="sw-faint" data-testid="sw-no-session">Brak sesji. Każdy eksperyment tworzy jedną sesję z hashem treści, odciskiem replay i wpisem w EvidenceLedger.</p>
        ))}
        {evidenceOpen && (session
          ? <ScientificOutcomePanel outcome={outcomeFromLabSession(session, replay, curiosity, def.stations.find((st) => st.id === session.stationId)?.label)} onReplay={doReplay} testIds={{ replay: 'sw-replay', replayStatus: 'sw-replay-verdict' }} nextActions={curiosityActions} />
          : <NextExperimentPanel outcome={{ next: nextFromCuriosity(curiosity), nextUnavailableReason: 'Brak propozycji. „Ciekawość: zaproponuj” uruchamia cykl ciekawości na lukach w dowodach.' }} actions={curiosityActions} />)}
      </section>

</>;
  const commandControls = (
      <section className="sw-hud sw-hud-command" aria-label="Polecenia" data-testid="sw-command">
        <div className="sw-lab-primary">
          <form className="sw-lab-chat" onSubmit={(event) => { event.preventDefault(); const prompt = chatPrompt.trim(); requestOpenScienceChat(prompt || undefined); setChatPrompt(''); }} role="search" aria-label="Co chcesz zbadać?">
            <label htmlFor="sw-lab-chat-input">Co chcesz zbadać?</label>
            <div><input id="sw-lab-chat-input" className="sw-input" value={chatPrompt} onChange={(event) => setChatPrompt(event.target.value)} placeholder="Np. znajdź kandydatów dla A1" data-testid="sw-lab-chat-input" /><button type="submit" className="sw-btn sw-btn-primary" data-testid="sw-ask">Zapytaj Genesis →</button></div>
          </form>
          {world === 'physics' && <nav className="sw-domain-rail" aria-label="Strefy laboratorium">
            <button type="button" className="sw-chip" onClick={() => requestOpenScienceChat('Znajdź kandydatów dla receptora A1 i porównaj ich właściwości.')}>Drug Discovery · kandydaci</button>
            <button type="button" className={`sw-chip${chemistryOpen ? ' is-on' : ''}`} aria-pressed={chemistryOpen} onClick={() => setChemistryOpen((open) => !open)} data-testid="sw-chemistry-toggle">Chemistry · laboratorium chemii</button>
            <button type="button" className="sw-chip" onClick={() => requestOpenScienceChat('Pokaż eksperyment z czarną dziurą.')}>Physics · czarna dziura</button>
          </nav>}
          <button type="button" className="sw-btn" onClick={() => setControlsOpen((open) => !open)} aria-expanded={controlsOpen} aria-controls="sw-advanced-controls" data-testid="sw-controls">{controlsOpen ? 'Ukryj sterowanie' : 'Sterowanie'}</button>
        </div>
        <div id="sw-advanced-controls" className="sw-advanced-controls" hidden={!controlsOpen}>
          <ol className="sw-transcript" data-testid="sw-transcript" aria-live="polite">
            {transcript.map((e) => <li key={e.id} className={`sw-line sw-line-${e.who}`}>{e.text}</li>)}
          </ol>
          <form className="sw-form" onSubmit={onSubmit}>
            <input className="sw-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={world === 'biology' ? 'Polecenie dla laboratorium' : 'Zaawansowane polecenie dla stanowiska'} aria-label="Polecenie dla agenta" data-testid="sw-input" />
            <button type="submit" className="sw-btn sw-btn-primary" data-testid="sw-send">Wykonaj</button>
          </form>
          <div className="sw-quick">
            {def.quick.map((q) => <button key={q.label} type="button" className="sw-chip" onClick={() => submit(q.text)} data-testid={`sw-quick-${q.label.split(' ')[0].toLowerCase()}`}>{q.label}</button>)}
          </div>
        </div>
      </section>
  );

  return (
    <main id="main-content" className={`sw sw-cam-${camera.toLowerCase()}${world === 'biology' && explorerOpen ? ' sw-explorer-open' : ''}`} aria-label="Światy naukowe — laboratorium agenta" data-testid="scientific-worlds" data-world={world} data-agent-state={agentState} data-frames={frames} data-camera={camera} data-twin-mode={world === 'biology' ? anatomy.displayMode : undefined} data-macro-level={world === 'biology' ? sim.getRuntimeDiagnostics().macroMicro?.level ?? macroMicroLevelForArtifact(bioArtifact) : undefined} data-runtime-diagnostics={JSON.stringify(sim.getRuntimeDiagnostics())}>
      <canvas ref={canvasRef} className="sw-canvas" data-testid="sw-canvas" />
      {world === 'physics' && chemistryOpen && (
        <Suspense fallback={<div className="sw-loading" role="status">Ładowanie chemii…</div>}>
          <ChemistryLabPanel
            embedded
            onClose={() => setChemistryOpen(false)}
            onTitrationStart={(acid) => {
              const command = stationHandoffCommand(`station=st-titration&acid=${encodeURIComponent(acid)}`, def.catalog, nextLogicalTime());
              if (command) submitCommands([command], command.text);
            }}
          />
        </Suspense>
      )}
      {camera === 'VISOR' && (
        <div className="sw-visor" aria-hidden="true" data-testid="sw-visor">
          <div className="sw-visor-frame" />
          <div className="sw-visor-glare" />
          <div className="sw-visor-breath" />
          {working && <div className="sw-reticle" />}
        </div>
      )}
      {loading && <div className="sw-loading" role="status">Ładowanie laboratorium…</div>}
      {failed && <p className="cw-error sw-glerror" role="alert">WebGL niedostępny — laboratorium 3D nie może się uruchomić na tym urządzeniu.</p>}

      {world === 'physics' && chemistryCardOpen && titrationResult && (
        <aside className="sw-chemistry-context" aria-label="Wynik miareczkowania" data-testid="sw-titration-context">
          <div className="sw-chemistry-head">
            <div><span>EDUCATIONAL PROCEDURE MODEL</span><strong>Wynik · pH {titrationResult.ph.toFixed(2)}</strong></div>
            <button type="button" className="sw-context-close" onClick={() => setChemistryCardOpen(false)} aria-label="Zamknij wynik miareczkowania">×</button>
          </div>
          <p>{titrationResult.acidName.split(' (')[0]} · {titrationResult.vb.toFixed(1)} mL NaOH · {titrationRegion(titrationResult.vb, titrationResult.veq)}</p>
          <div className="sw-context-actions">
            <button type="button" className="sw-btn sw-btn-primary" onClick={() => setEvidenceOpen(true)}>Evidence + replay</button>
            <button type="button" className="sw-btn" onClick={() => requestOpenScienceChat('Zaproponuj następny eksperyment po tym miareczkowaniu.')}>Następny eksperyment</button>
          </div>
          <details>
            <summary>Otwórz wykres</summary>
            <svg className="sw-titration-plot" viewBox="0 0 300 100" role="img" aria-label="Krzywa pH względem objętości NaOH">
              <path d="M0 100H300M0 0V100" />
              <polyline points={titrationPolyline(titrationResult.acid)} />
              <line x1={(titrationResult.veq / 60) * 300} x2={(titrationResult.veq / 60) * 300} y1="0" y2="100" />
              <circle cx={(titrationResult.vb / 60) * 300} cy={100 - (titrationResult.ph / 14) * 100} r="3" />
            </svg>
            <small>Bilans ładunku · Veq {titrationResult.veq.toFixed(1)} mL · pKa {titrationResult.pKa.toFixed(2)}. Aparatura jest rekonstrukcją edukacyjną, nie telemetrią wet-lab.</small>
          </details>
        </aside>
      )}

      {world !== 'biology' && researchControls}
      {world === 'biology' && explorerOpen && (
        <HumanExplorerPanel
          manifest={sim.manifest} anatomy={anatomy} artifact={bioArtifact} session={session} sessions={sessions}
          busy={agentState !== 'IDLE' && agentState !== 'BLOCKED'} onCommands={submitCommands} nextLogicalTime={nextLogicalTime}
          twinTier={twinTier} cutaway={cutaway} isolated={anatomy.isolatedNodeIds} referenceAnatomy={referenceAnatomy}
          twinCamera={camera === 'TWIN'} onTwinCamera={setTwinCamera}
          surface={surface} onSurface={applySurface}
          subjectBounds={camera === 'TWIN' ? sim.getHumanSubjectBounds() : null}
          researchControls={<>{commandControls}{researchControls}</>}
          onCutaway={(next) => { cutawayRef.current = next; setCutawayState(next); sim.setTwinCutaway(next); setAnatomy((a) => setCutaway(a, next.enabled)); }}
          onIsolate={(ids) => { setAnatomy((a) => (ids.length ? isolateAnatomyNode(a, ids[0], sim.manifest) : { ...a, isolatedNodeIds: [] })); sim.setTwinIsolated(ids); }}
        />
      )}
      {world !== 'biology' && commandControls}
    </main>
  );
}

export default ScientificWorldsScreen;
