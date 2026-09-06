import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useThreeLoop } from '../../core/three/useThreeLoop';
import { consumePendingLookingGlassExperience, peekPendingLookingGlassExperience } from '../../core/lookingGlass/sessionHandoff';
import { ExperiencePlayer } from '../../core/lookingGlass/experienceOrchestrator';
import { directionForFrame, type WorldDirection } from '../../core/lookingGlass/worldDirector';
import { parseObservationIntent } from '../../core/lookingGlass/observationIntent';
import { resolveCameraIntent, type ObservationExecutionStatus } from '../../core/lookingGlass/observationExecution';
import {
  closeInspection, initialExperienceState, inspect, replay as enterReplay, timeIsFrozen, MODE_LABEL,
  type ExperienceState,
} from '../../core/lookingGlass/experienceMode';
import { EventInspector } from '../looking-glass/EventInspector';
import { ComparisonPanel } from '../looking-glass/ComparisonPanel';
import { LabScene3D } from '../../core/three/labScene3D';
import type { MoveKey } from '../../core/three/firstPersonController';
import {
  buildLabCounterfactual, compareLabRuns, LAB_INTERVENTION_DAY_RANGE, LAB_NOT_MODELED,
  replayLabRun, runLabScenario, saveLabCounterfactualToMemory,
} from '../../core/experimentFabric/labSession';
import type { ScenarioComparison, ScenarioReplay, ScenarioRun } from '../../core/simulation/scenarioEngine';
import type { SavedExperiment } from '../../core/scienceMemory';
import { extractObservations } from '../../core/observationAnalysis/observationExtraction';
import { analyzeExperiment } from '../../core/observationAnalysis/analysis';
import { deriveFindings, type Finding } from '../../core/observationAnalysis/findings';
import { runScientificDiscoveryLoop, type ScientificDiscoveryLoopResult } from '../../core/experimentFabric/scientificDiscoveryLoop';
import { explainScientificEvidence, type WhyNextExperimentAdvice } from '../../core/experimentFabric/whyNextExperiment';
import { seriesSparkline } from './InvestorDemoScreen';

/**
 * FIRST-PERSON SCIENTIST — jedna spójna, grywalna scena łącząca ISTNIEJĄCE
 * systemy: Scenario Engine + Kontrfaktyk + Pamięć Naukowa (naukowa prawda,
 * `core/experimentFabric/labSession.ts`) z nową warstwą prezentacji
 * (`core/three/labScene3D.ts` — Sim3D pierwszoosobowy) przez ISTNIEJĄCY
 * `useThreeLoop`. Ten komponent NIE liczy niczego naukowego — wyłącznie
 * orkiestruje: kiedy uruchomić realny model, kiedy pokazać wynik, kiedy
 * kamera ma przejąć kontrolę i kiedy oddać ją z powrotem graczowi.
 */

type ExperimentPhase = 'IDLE' | 'RUNNING_A' | 'COMPLETE_A' | 'RUNNING_B' | 'COMPLETE_B' | 'COMPARED' | 'REPLAYING' | 'REPLAY_DONE';

const MOVE_KEYS: Record<string, MoveKey> = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

const STATUS_LABEL = ['NORMALNY', 'PODWYŻSZONY', 'WYSOKI', 'KRYTYCZNY'];
const FIXED_KIND_LABEL = ['', 'WIDOK NAUKOWY', 'WIDOK NAUKOWY — ANOMALIA', 'ODTWORZENIE', 'HALA — KADR OTWIERAJĄCY'];
const CAMERA_LABEL = ['SWOBODNA', 'NAUKOWA', 'NAUKOWA — ANOMALIA', 'ODTWORZENIE', 'HALA'];

function canInteractInPhase(phase: ExperimentPhase): boolean {
  return phase === 'IDLE' || phase === 'COMPLETE_A' || phase === 'COMPLETE_B' || phase === 'COMPARED' || phase === 'REPLAY_DONE';
}

export function FirstPersonLabScreen() {
  const sim = useMemo(() => new LabScene3D(), []);
  const params = useMemo(() => ({}), []);

  const [stats, setStats] = useState({
    nearStation: 0, cameraPhase: 0, fixedKind: 0, playing: 0, playbackDone: 0,
    dayIndex: -1, totalDays: 0, vesselFraction: 0, vesselIcuFraction: 0, vesselStatusCode: 0, playTag: 0,
  });
  const onStats = useCallback((s: Record<string, number>) => {
    setStats((prev) => (
      prev.nearStation === s.nearStation && prev.cameraPhase === s.cameraPhase && prev.fixedKind === s.fixedKind
        && prev.playing === s.playing && prev.playbackDone === s.playbackDone && prev.dayIndex === s.dayIndex
        && prev.vesselStatusCode === s.vesselStatusCode && prev.playTag === s.playTag
        ? prev
        : {
          nearStation: s.nearStation!, cameraPhase: s.cameraPhase!, fixedKind: s.fixedKind!, playing: s.playing!,
          playbackDone: s.playbackDone!, dayIndex: s.dayIndex!, totalDays: s.totalDays!, vesselFraction: s.vesselFraction!,
          vesselIcuFraction: s.vesselIcuFraction!, vesselStatusCode: s.vesselStatusCode!, playTag: s.playTag!,
        }
    ));
  }, []);
  const { canvasRef, loading, failed } = useThreeLoop(sim, params, true, onStats);

  // Hero establishing shot: the scene opens on the SAME cinematic "WIDE"
  // framing the Investor Demo uses (scientificFraming('WIDE') in labScene3D.ts —
  // no new camera, no fabricated state), not the raw first-person spawn point.
  // Entering the lab (pointer lock) hands control back to free first-person
  // movement exactly like it already does when leaving any other fixed camera.
  useEffect(() => {
    if (!loading) sim.focusScientific('WIDE');
  }, [loading, sim]);

  const [locked, setLocked] = useState(false);
  const [phase, setPhase] = useState<ExperimentPhase>('IDLE');
  const [interventionDay, setInterventionDay] = useState(0);
  const [runA, setRunA] = useState<ScenarioRun | null>(null);
  const [runB, setRunB] = useState<ScenarioRun | null>(null);
  const [comparison, setComparison] = useState<ScenarioComparison | null>(null);
  const [replay, setReplay] = useState<ScenarioReplay | null>(null);
  const [saved, setSaved] = useState<SavedExperiment | null>(null);
  const [paused, setPaused] = useState(false);
  const [hudHidden, setHudHidden] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [discoveryLoop, setDiscoveryLoop] = useState<ScientificDiscoveryLoopResult | null>(null);
  const [discoveryLoopError, setDiscoveryLoopError] = useState<string | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const runARef = useRef(runA);
  runARef.current = runA;
  const runBRef = useRef(runB);
  runBRef.current = runB;

  // Pointer lock: wejście "myszą w scenę" jest jawnym gestem gracza (wymóg przeglądarek).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onClick = () => { if (document.pointerLockElement !== canvas) canvas.requestPointerLock(); };
    const onLockChange = () => setLocked(document.pointerLockElement === canvas);
    canvas.addEventListener('click', onClick);
    document.addEventListener('pointerlockchange', onLockChange);
    return () => {
      canvas.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onLockChange);
    };
  }, [canvasRef]);

  // Ruch + rozglądanie + interakcja — jedyne miejsce, gdzie klawiatura/mysz dotykają Sim3D.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const move = MOVE_KEYS[e.code];
      if (move) { sim.setMoveKey(move, true); return; }
      if (e.code === 'KeyE') {
        if (!canInteractInPhase(phaseRef.current) || !stats.nearStation) return;
        if (phaseRef.current === 'IDLE') {
          const run = runLabScenario(interventionDay);
          setRunA(run);
          sim.playSeries(run.series, 'A');
          setPhase('RUNNING_A');
        } else {
          const run = runLabScenario(interventionDay);
          setRunB(run);
          setComparison(null);
          setReplay(null);
          setSaved(null);
          sim.playSeries(run.series, 'B');
          setPhase('RUNNING_B');
        }
        return;
      }
      if (e.code === 'Escape') {
        if (document.pointerLockElement) document.exitPointerLock();
        return;
      }
      if (e.code === 'KeyH') { setHudHidden((h) => !h); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const move = MOVE_KEYS[e.code];
      if (move) sim.setMoveKey(move, false);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement) sim.addMouseLook(e.movementX, e.movementY);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', onMouseMove);
    };
  }, [sim, interventionDay, stats.nearStation]);

  // Zakończenie odtwarzania serii → przejście fazy. Jedyny most między zegarem Sim3D (co klatkę) a fazą Reacta.
  useEffect(() => {
    if (stats.playbackDone !== 1) return;
    if (phase === 'RUNNING_A') setPhase('COMPLETE_A');
    else if (phase === 'RUNNING_B') setPhase('COMPLETE_B');
    else if (phase === 'REPLAYING') setPhase('REPLAY_DONE');
  }, [stats.playbackDone, phase]);

  const handleCompare = () => {
    if (!runA || !runB) return;
    setComparison(compareLabRuns(runA, runB));
    setPhase('COMPARED');
  };

  const handleReplay = () => {
    const target = runB ?? runA;
    if (!target) return;
    const result = replayLabRun(target);
    setReplay(result);
    if (result.status === 'MATCH') {
      sim.focusScientific('REPLAY');
      sim.playSeries(target.series, 'REPLAY');
      setPhase('REPLAYING');
    }
  };

  const handleReturnToFirstPerson = () => {
    sim.returnToFirstPerson();
    if (phase === 'REPLAYING' || phase === 'REPLAY_DONE') setPhase(runB ? 'COMPLETE_B' : 'COMPLETE_A');
  };

  const handleTogglePause = () => {
    if (paused) sim.resumePlayback(); else sim.pausePlayback();
    setPaused(!paused);
  };

  const handleReset = () => {
    sim.resetVessel();
    setRunA(null); setRunB(null); setComparison(null); setReplay(null); setSaved(null); setPaused(false);
    setPhase('IDLE');
  };

  const handleSave = () => {
    if (!runA || !runB) return;
    const cf = buildLabCounterfactual(runA.interventionStartDay, runB.interventionStartDay);
    setSaved(saveLabCounterfactualToMemory(cf));
  };

  // Ta sama pytanie badawcze co suwak powyżej ("dzień wejścia izolacji"), ale
  // rozstrzygana automatycznie przez pełną pętlę: konkurencyjne hipotezy →
  // realne przebiegi Scenario Engine → falsyfikacja → porównanie → następny
  // eksperyment. Nic nowego naukowo — istniejący `runScientificDiscoveryLoop`
  // (core/experimentFabric/scientificDiscoveryLoop.ts) w jednym wywołaniu.
  // Opened from the Looking Glass? Then the sentence already said what to
  // look at and from where. Peek (never consume) in the initializer: React
  // invokes it twice in StrictMode, and consuming there would drop the
  // vantage on the second call — the same defect already fixed in the city.
  const [lookingGlass] = useState(() => peekPendingLookingGlassExperience());
  useEffect(() => { consumePendingLookingGlassExperience(); }, []);

  // A request for the scientist's perspective on a running experiment should
  // arrive with the experiment running. This starts the SAME discovery loop
  // the button starts — no second entry point, no results computed here.
  const discoveryLoopStarted = useRef(false);
  useEffect(() => {
    if (!lookingGlass || discoveryLoopStarted.current) return;
    if (lookingGlass.viewpoint !== 'SCIENTIST_POV' && lookingGlass.viewpoint !== 'OPERATOR_POV') return;
    discoveryLoopStarted.current = true;
    // The problem comes from the session, not a default: the bench must
    // answer the question the sentence asked.
    handleRunDiscoveryLoop(lookingGlass.problemId ?? undefined);
  }, [lookingGlass]);

  // THE SAME LOOKING GLASS MACHINERY THE CITY USES, proof that it is a
  // platform and not an epidemic-shaped one-off: event inspection, the mode
  // machine, and a real comparison, unmodified from worldDirector.ts /
  // experienceMode.ts / scenarioComparison.ts. The one thing this world does
  // NOT do that the city does is move the camera from `direction` — there is
  // no camera-preset system here to drive (the lab is fully player-walked),
  // and inventing one would be exactly the kind of engine-shaped hack this
  // seam is meant to avoid. `direction` is therefore read-only here: an
  // honest readout of what a future camera rig would receive, not a control.
  const [lgMode, setLgMode] = useState<ExperienceState>(
    () => initialExperienceState(0, Boolean(lookingGlass?.autoPlay)),
  );
  const inspectableEvents = useMemo(() => lookingGlass?.world?.getInspectableEvents() ?? [], [lookingGlass]);
  const frozenRef = useRef(false);
  useEffect(() => { frozenRef.current = timeIsFrozen(lgMode); }, [lgMode]);
  const cinematic = useMemo(
    () => (lookingGlass?.experience && lookingGlass.world ? new ExperiencePlayer(lookingGlass.experience) : null),
    [lookingGlass],
  );
  const [direction, setDirection] = useState<WorldDirection | null>(null);
  useEffect(() => {
    const world = lookingGlass?.world;
    if (!cinematic || !world) return;
    cinematic.play();
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // Capped at 100 ms — see the identical guard in City3DWebGLScreen: one
      // slow frame must slow playback, not skip states nobody saw.
      const delta = Math.min(0.1, (now - last) / 1000);
      last = now;
      const frame = frozenRef.current ? cinematic.currentFrame : cinematic.advance(delta);
      if (frame) setDirection(directionForFrame(frame, world, lookingGlass!.viewpoint));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cinematic, lookingGlass]);

  const handleRunDiscoveryLoop = (problemId = 'problem:intervention-timing') => {
    try {
      setDiscoveryLoop(runScientificDiscoveryLoop(problemId));
      setDiscoveryLoopError(null);
    } catch (error) {
      setDiscoveryLoop(null);
      setDiscoveryLoopError(error instanceof Error ? error.message : String(error));
    }
  };

  // Wejście do laboratorium: przejmuje kontrolę pierwszoosobową z dowolnego
  // stałego kadru (domyślnie "HALA" — patrz useEffect powyżej). Nie dotyka
  // kamery, jeśli gracz jest już w trybie FREE (returnToFirstPerson no-op).
  const enterLab = () => {
    sim.returnToFirstPerson();
    canvasRef.current?.requestPointerLock();
  };

  // LOOKING GLASS 2.1 — LIVE OBSERVATION DIRECTOR (lab). Same intent parser
  // and CameraIntent resolution as the city (`observationIntent.ts`/
  // `observationExecution.ts`), dispatched onto THIS lab's own real,
  // already-tested camera mechanism (`focusScientific`/`returnToFirstPerson`
  // — see LabScene3D.applyObservationCameraIntent's own doc for why this is
  // reuse, not a second camera system) and its one real addressable object,
  // the reaction vessel (`resolveNamedLabTarget`).
  const [obsText, setObsText] = useState('');
  const [obsResult, setObsResult] = useState<{ status: ObservationExecutionStatus; narration: string } | null>(null);
  const askObservation = (sentence: string) => {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    const intent = parseObservationIntent(trimmed);
    const query = intent.target ?? intent.focus;
    const namesLab = /\b(lab|laborator|hala)/i.test(trimmed);
    if (!query && !namesLab) {
      setObsResult({ status: 'FAILED', narration: 'No target was named — try "the reaction vessel" or "the laboratory".' });
      setObsText('');
      return;
    }
    if (query && !namesLab && !sim.resolveNamedLabTarget(query)) {
      setObsResult({ status: 'FAILED', narration: `Nothing in this lab answers to "${query}" — the only real instrument here is the reaction vessel.` });
      setObsText('');
      return;
    }
    const cameraIntent = resolveCameraIntent(intent);
    sim.applyObservationCameraIntent(cameraIntent);
    let timeNote = '';
    if (intent.time) {
      if (intent.time.kind === 'ABSOLUTE' && intent.time.unit === 'DAY') {
        const ok = sim.showDay(intent.time.amount);
        timeNote = ok ? ` Showing day ${intent.time.amount}.` : ' No experiment has produced a day that far yet.';
      } else if (intent.time.kind !== 'NOW') {
        timeNote = ' This lab only shows day-level detail from a completed run — finer time resolution is not modelled here.';
      }
    }
    setObsResult({ status: 'EXECUTED', narration: `Showing ${query ?? 'the laboratory'} — ${cameraIntent}.${timeNote}` });
    setObsText('');
  };

  const canInteract = stats.nearStation === 1 && canInteractInPhase(phase);
  const isRunning = phase === 'RUNNING_A' || phase === 'RUNNING_B' || phase === 'REPLAYING';
  const cameraTaken = stats.cameraPhase !== 0;
  const completedRun = runB ?? runA;
  const observationLayer = useMemo(() => {
    if (!completedRun || completedRun.status !== 'COMPLETED' || completedRun.summary === null) return null;
    const analysis = analyzeExperiment(completedRun, runB && runA ? runA : undefined);
    return {
      observations: extractObservations(completedRun),
      analysis,
      findings: deriveFindings(completedRun, analysis),
    };
  }, [completedRun, runA, runB]);

  // Ten sam realny odczyt co prawa szyna Investor Demo — trzy metryki dzień po
  // dniu z ukończonego przebiegu, nigdy zmyślony punkt.
  const instrumentSeries = useMemo(() => (completedRun ? {
    infectious: completedRun.series.map((s) => s.infectious),
    hospitalized: completedRun.series.map((s) => s.hospitalized),
    deceased: completedRun.series.map((s) => s.deceased),
  } : null), [completedRun]);

  const notModeledCount = discoveryLoop ? discoveryLoop.evidenceChain.filter((link) => link.notModeled !== undefined).length : 0;

  // "Dlaczego ta obserwacja?" + łańcuch przyczynowy — identyczna konstrukcja co
  // Investor Demo (ten sam realny finding/run/event/hypothesis), dostępna od
  // razu po jednym ukończonym przebiegu, niezależnie od Pętli Odkrycia.
  const causalLineage = useMemo(() => {
    const finding: Finding | undefined = observationLayer?.findings[0];
    if (!finding || !completedRun) return null;
    const event = observationLayer?.analysis.significantEvents[0] ?? null;
    const hypothesis = discoveryLoop?.evidenceChain.find((link) => link.findings.some((f) => f.id === finding.id));
    return { finding, event, run: completedRun, hypothesis: hypothesis ?? null };
  }, [observationLayer, completedRun, discoveryLoop]);

  // Formalne "dlaczego" NAD tym samym łańcuchem, ale z realnej,
  // prerejestrowanej pętli hipotez (`explainScientificEvidence`,
  // `whyNextExperiment.ts`) — ta sama funkcja, której już używa
  // ExperimentPilotScreen, tu po raz pierwszy pokazana w scenie 3D.
  const whyAdvice: WhyNextExperimentAdvice | null = useMemo(() => {
    const chain = discoveryLoop?.loop.chains[0];
    return chain ? explainScientificEvidence(chain) : null;
  }, [discoveryLoop]);

  // JEDNA aktualna linia zamiast rosnącej listy — "less is more" (sekcja 6 misji).
  // Priorytet: najnowsze/najważniejsze realne zdarzenie wygrywa, starsze znikają.
  const caption: { label: string; text: string } | null = saved
    ? { label: 'ZAPISANO', text: `Rekord ${saved.id} w Pamięci Naukowej.` }
    : replay
      ? { label: 'ODTWORZENIE', text: `${replay.message} (${replay.status})` }
      : phase === 'COMPARED' && comparison
        ? { label: 'PORÓWNANIE', text: `${comparison.message} Zmiana zgonów: ${comparison.metrics.find((m) => m.key === 'totalDeaths')?.absoluteDelta}.` }
        : (phase === 'COMPLETE_A' || phase === 'COMPLETE_B') && runA
          ? {
            label: 'WYNIK',
            text: `Przebieg ${phase === 'COMPLETE_A' ? 'A' : 'B'}: szczyt obłożenia łóżek ${(((phase === 'COMPLETE_A' ? runA : runB)!.summary!.peakBedOccupancy) * 100).toFixed(0)}%, zgony ${(phase === 'COMPLETE_A' ? runA : runB)!.summary!.totalDeaths}.`,
          }
          : isRunning
            ? {
              label: 'OBSERWACJA',
              text: `Dzień ${stats.dayIndex + 1}/${stats.totalDays || 60} · łóżka ${(stats.vesselFraction * 100).toFixed(0)}% · ICU ${(stats.vesselIcuFraction * 100).toFixed(0)}% · status ${STATUS_LABEL[stats.vesselStatusCode]}`,
            }
            : phase === 'IDLE'
              ? { label: 'PRZEWIDYWANIE', text: `Podejdź do konsoli i uruchom eksperyment (dzień izolacji: ${interventionDay}).` }
              : null;

  // Discovery Process strip — reuses the SAME `.gid-flow` design language as the
  // Investor Demo screen (one visual system, not a second dashboard). It never
  // invents a stage: when the formal, falsifiable HYPOTHESIS_PROBLEMS loop has
  // been run, it shows the SAME real SUPPORTED/FALSIFIED verdicts as that panel
  // below; otherwise it reflects the real A/B console state that already drives
  // the vessel — the direct metric comparison stays labeled as a comparison,
  // never dressed up as a falsification it isn't.
  const flowStrip = discoveryLoop ? (
    <>
      <div className="gid-flow-step"><span>PYTANIE</span><p>{discoveryLoop.problem.statement}</p></div>
      <div className="gid-flow-arrow">→</div>
      <div className="gid-flow-step">
        <span>HIPOTEZY · {discoveryLoop.loop.preregistration.hypotheses.length}</span>
        {discoveryLoop.loop.outcomes.slice(0, 3).map((outcome) => (
          <p key={outcome.hypothesisId} className={`gid-hyp-row gid-hyp-${outcome.status.toLowerCase()}`}>
            {outcome.status}{outcome.observedMetric !== null ? ` · ${discoveryLoop.problem.primaryMetric}=${outcome.observedMetric}` : ''}
          </p>
        ))}
      </div>
      <div className="gid-flow-arrow">→</div>
      <div className="gid-flow-step"><span>WYKONANIE</span><p>{discoveryLoop.loop.allRuns.length} realnych przebiegów</p></div>
      <div className="gid-flow-arrow">→</div>
      <div className="gid-flow-step"><span>OBSERWACJA</span><p>{discoveryLoop.evidenceChain.reduce((sum, l) => sum + l.observations.length, 0)} realnych obserwacji</p></div>
      <div className="gid-flow-arrow">→</div>
      <div className="gid-flow-step"><span>ANALIZA I FALSYFIKACJA</span><p>{discoveryLoop.loop.discrimination.reason.slice(0, 70)}</p></div>
      <div className="gid-flow-arrow">→</div>
      <div className="gid-flow-step gid-flow-step-next"><span>NASTĘPNY EKSPERYMENT</span><p>{discoveryLoop.nextExperiment.status}: {discoveryLoop.nextExperiment.why.slice(0, 50)}</p></div>
    </>
  ) : phase !== 'IDLE' || runA ? (
    <>
      <div className="gid-flow-step"><span>PYTANIE</span><p>Czy izolacja objawowych od dnia {interventionDay} zmienia modelowany przebieg względem braku interwencji?</p></div>
      <div className="gid-flow-arrow">→</div>
      <div className="gid-flow-step"><span>EKSPERYMENT A/B</span><p>{runB ? 'Ramiona A i B wykonane' : runA ? 'Ramię A wykonane · B w toku lub oczekuje' : 'Zaprojektowany, oczekuje wykonania'}</p></div>
      <div className="gid-flow-arrow">→</div>
      <div className="gid-flow-step"><span>WYKONANIE</span><p>{isRunning ? `dzień ${stats.dayIndex + 1}/${stats.totalDays || 60} w toku` : 'zakończone'}</p></div>
      <div className="gid-flow-arrow">→</div>
      <div className="gid-flow-step"><span>OBSERWACJA</span><p>{observationLayer ? `${observationLayer.observations.length} realnych obserwacji` : 'oczekuje na zakończony przebieg'}</p></div>
      <div className="gid-flow-arrow">→</div>
      <div className="gid-flow-step"><span>PORÓWNANIE</span><p>{comparison ? comparison.message.slice(0, 70) : 'bezpośrednie porównanie metryk, nie test hipotezy — oczekuje ramienia B'}</p></div>
      <div className="gid-flow-arrow">→</div>
      <div className="gid-flow-step gid-flow-step-next"><span>NASTĘPNY KROK</span><p>{saved ? `Zapisano jako ${saved.id}` : comparison ? 'Zapisz w Pamięci Naukowej lub uruchom formalną Pętlę Odkrycia' : 'Dokończ oba ramiona, aby porównać'}</p></div>
    </>
  ) : (
    <div className="gid-flow-empty">Pytanie → Eksperyment → Wykonanie → Obserwacja → Porównanie → Następny krok — podejdź do konsoli (E) albo uruchom „Pętlę Odkrycia Naukowego" poniżej.</div>
  );

  return (
    <main id="main-content" tabIndex={-1} className="gid-shell fp-lab">
      <section className="gid-flow" aria-label="Przepływ naukowy: Pytanie -> Eksperyment -> Wykonanie -> Obserwacja -> Porównanie -> Następny krok">
        {flowStrip}
      </section>

      <div className="gid-body">
        <aside className="gid-rail-left" aria-label="Kamery i obserwacja na żywo">
          <h2>KAMERY</h2>
          <div className="gid-cam-list">
            <button type="button" className={`gid-cam-slot ${stats.fixedKind === 4 ? 'active' : ''}`} onClick={() => sim.focusScientific('WIDE')}>
              <span className="gid-cam-dot" />Hala<small>Kadr otwierający</small>
            </button>
            <button type="button" className={`gid-cam-slot ${!cameraTaken ? 'active' : ''}`} disabled={!cameraTaken} onClick={enterLab}>
              <span className="gid-cam-dot" />Swobodna<small>Pierwsza osoba</small>
            </button>
            <button type="button" className={`gid-cam-slot ${stats.fixedKind === 1 ? 'active' : ''}`} disabled={!completedRun} onClick={() => sim.focusScientific('SCIENTIFIC')}>
              <span className="gid-cam-dot" />Naukowa<small>Widok wyniku</small>
            </button>
            <button type="button" className={`gid-cam-slot ${stats.fixedKind === 3 ? 'active' : ''}`} disabled={replay?.status !== 'MATCH'} onClick={() => sim.focusScientific('REPLAY')}>
              <span className="gid-cam-dot" />Odtworzenie<small>Tylko po MATCH</small>
            </button>
          </div>
          <p className="gid-cam-current">Aktualna: <strong>{CAMERA_LABEL[stats.fixedKind] ?? CAMERA_LABEL[0]}</strong></p>
          <h2>OBSERWACJA NA ŻYWO</h2>
          {isRunning ? (
            <dl className="gid-live-metrics">
              <div><dt>Dzień</dt><dd>{stats.dayIndex + 1}/{stats.totalDays || 60}</dd></div>
              <div><dt>Obłożenie łóżek</dt><dd>{(stats.vesselFraction * 100).toFixed(0)}%</dd></div>
              <div><dt>Obłożenie ICU</dt><dd>{(stats.vesselIcuFraction * 100).toFixed(0)}%</dd></div>
              <div><dt>Status</dt><dd>{STATUS_LABEL[stats.vesselStatusCode]}</dd></div>
            </dl>
          ) : (
            <p className="gid-empty-note">{completedRun ? 'Przebieg zakończony — patrz panel stanu naukowego.' : 'Brak aktywnego przebiegu.'}</p>
          )}
          <h2>STATUSY</h2>
          <ul className="gid-legend">
            <li><span className="gid-legend-dot measured" />ZMIERZONE — wartość z realnego przebiegu</li>
            <li><span className="gid-legend-dot supported" />SUPPORTED / FALSIFIED — wynik hipotezy</li>
            <li><span className="gid-legend-dot blocked" />BLOCKED — brak przesłanek do wykonania</li>
            <li><span className="gid-legend-dot notmodeled" />NOT_MODELED — poza zakresem modelu</li>
          </ul>
        </aside>

        <section className="gid-stage-col">
          <div className="gid-stage">
            <canvas ref={canvasRef} className="gid-canvas" aria-label="Pierwszoosobowa scena laboratoryjna (Three.js)" />
            {loading && <div className="route-loading" role="status">Ładowanie silnika 3D…</div>}
            {failed && <div className="empty-state">Nie udało się uruchomić WebGL na tym urządzeniu.</div>}

            {!loading && !failed && (
              <div className="lg-obs-live">
                <div className="lg-obs">
                  <span className="lg-obs-title">ASK GENESIS</span>
                  <form className="lg-obs-form" onSubmit={(event) => { event.preventDefault(); askObservation(obsText); }}>
                    <input
                      className="lg-obs-input"
                      type="text"
                      value={obsText}
                      placeholder="np. „Show me the reaction vessel” / „Take me to the laboratory”"
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
            )}

            {!locked && !loading && !failed && (
              <div className="fp-lab-enter" role="button" tabIndex={0}
                onClick={enterLab}
                onKeyDown={(e) => { if (e.key === 'Enter') enterLab(); }}>
                <p className="fp-lab-enter-title">Kliknij, aby wejść do laboratorium</p>
                <p className="fp-lab-enter-hint">WASD — chód · mysz — rozglądanie · E — interakcja · Esc — wyjście. Kamera „Hala" powyżej to kadr otwierający.</p>
              </div>
            )}

            {locked && !cameraTaken && <div className="fp-lab-crosshair" aria-hidden="true" />}

            {locked && canInteract && !cameraTaken && (
              <div className="fp-lab-prompt">
                {phase === 'IDLE' ? 'E — uruchom eksperyment' : 'E — uruchom ponownie ze zmienionym parametrem'}
              </div>
            )}

            {cameraTaken && (
              <div className="fp-lab-camera-badge">{FIXED_KIND_LABEL[stats.fixedKind] || 'KAMERA NAUKOWA'}</div>
            )}

            {locked && !hudHidden && caption && (
              <div className="fp-lab-caption">
                <strong>{caption.label}</strong> — {caption.text}
              </div>
            )}

            <button
              type="button"
              className={`fp-lab-info-toggle${infoOpen ? ' open' : ''}`}
              onClick={() => setInfoOpen((v) => !v)}
              aria-expanded={infoOpen}
              aria-label="Co jest realne, co jest wizualizacją"
            >
              ℹ
            </button>
            {infoOpen && (
              <div className="fp-lab-info-panel">
                Naczynie pokazuje REALNE obłożenie łóżek/ICU z istniejącego Scenario Engine (scenariusz IZOLACJA) — to
                nie jest symulacja płynów, organizmów ani żadnej biologii poza obłożeniem szpitalnym.
                Niemodelowane: {LAB_NOT_MODELED.join(', ')}.
              </div>
            )}

            <button
              type="button"
              className="fp-lab-hide-toggle"
              onClick={() => setHudHidden((v) => !v)}
              title="H — pokaż/ukryj interfejs (tryb do nagrywania)"
            >
              {hudHidden ? 'Pokaż UI' : 'Ukryj UI'}
            </button>

            {/* THE SAME EVENT/EVIDENCE/COMPARE APPARATUS THE CITY USES —
                proof by reuse rather than by claim that Looking Glass is a
                platform. Hidden while the player is walking freely and
                nothing was opened from a sentence, so it never intrudes on
                the pre-existing, independently-working discovery-loop flow. */}
            {lookingGlass && inspectableEvents.length > 0 && lgMode.mode !== 'INSPECT' && (
              <div className="lg-rail">
                <span className="lg-rail-title">zdarzenia przebiegu ({inspectableEvents.length})</span>
                <div className="lg-rail-items">
                  {inspectableEvents.slice(0, 8).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className="lg-rail-item"
                      onClick={() => setLgMode((current) => inspect(current, event, cinematic?.elapsedSeconds ?? null, lookingGlass.world?.clock))}
                    >
                      {event.semanticKind.replace(/_/g, ' ').toLowerCase()} · {event.time.tick}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {lgMode.selectedEvent && (
              <EventInspector
                event={lgMode.selectedEvent}
                allEvents={inspectableEvents}
                unit={(lookingGlass?.world?.getTemporalRange().unit ?? 'HOUR').toLowerCase()}
                onClose={() => setLgMode(closeInspection)}
                onReplay={() => setLgMode(enterReplay)}
              />
            )}
            {lookingGlass && <span className="lg-mode-badge">{MODE_LABEL[lgMode.mode]}</span>}
            {lgMode.mode !== 'INSPECT' && lookingGlass?.comparison && (
              <div className="lg-world-cmp">
                <ComparisonPanel comparison={lookingGlass.comparison} requestedButMissing={false} />
              </div>
            )}
            {direction && lgMode.mode !== 'INSPECT' && (
              <div className="lg-world-shot">
                <div className="lg-world-shot-head">
                  <span className={`lg-world-shot-kind lg-world-shot-${direction.shotKind.toLowerCase()}`}>{direction.shotKind}</span>
                  <span className="lg-world-shot-cam">{direction.cameraIntent}</span>
                </div>
                <p className="lg-world-shot-reason">{direction.reason}</p>
                {/* Same platform-parity clock note as the city world: the
                    clock's own reason, shown only when it says something the
                    editorial shot reason above does not — a snapped-over gap
                    or a marker held because it belongs to a different run. */}
                {(direction.worldTimeSnapped || direction.worldTime === null) && (
                  <p className="lg-world-shot-clock">{direction.worldTimeReason}</p>
                )}
              </div>
            )}
          </div>

          <div className="gid-stage-footer">
            <div className="gid-why-panel">
              <h3>DLACZEGO TA OBSERWACJA?</h3>
              {whyAdvice ? (
                <>
                  <p>{whyAdvice.why} <strong>{whyAdvice.assessment}</strong></p>
                  <p className="fp-observation-meta">Baza dowodu: {whyAdvice.evidenceBasis.join(' · ')}.</p>
                </>
              ) : causalLineage ? (
                <p>Znalezisko <strong>{causalLineage.finding.metric}</strong> (dzień {causalLineage.finding.sourceSnapshot.day}) pochodzi z przebiegu {causalLineage.run.scenarioId}
                  {causalLineage.event ? ` po zdarzeniu ${causalLineage.event.type} tego samego dnia` : ''}. Realny resultFingerprint: <code>{causalLineage.finding.evidence.resultFingerprint.slice(0, 16)}…</code></p>
              ) : (
                <p className="gid-empty-note">Dostępne po zakończeniu pierwszego przebiegu.</p>
              )}
            </div>
            <div className="gid-lineage-panel">
              <h3>ŁAŃCUCH PRZYCZYNOWY</h3>
              {causalLineage ? (
                <div className="gid-lineage-chain">
                  <span className="gid-lineage-node">PRZEBIEG<small>{causalLineage.run.scenarioId}</small></span>
                  <span className="gid-lineage-arrow">→</span>
                  <span className="gid-lineage-node">ZDARZENIE<small>{causalLineage.event ? `d${causalLineage.event.day} ${causalLineage.event.type}` : 'brak'}</small></span>
                  <span className="gid-lineage-arrow">→</span>
                  <span className="gid-lineage-node">OBSERWACJA<small>{causalLineage.finding.evidence.resultFingerprint.slice(0, 8)}…</small></span>
                  <span className="gid-lineage-arrow">→</span>
                  <span className="gid-lineage-node">DOWÓD<small>{causalLineage.finding.id.slice(0, 12)}…</small></span>
                  <span className="gid-lineage-arrow">→</span>
                  <span className="gid-lineage-node">HIPOTEZA<small>{causalLineage.hypothesis ? causalLineage.hypothesis.status : 'nie uruchomiono'}</small></span>
                </div>
              ) : (
                <p className="gid-empty-note">Dostępne po zakończeniu pierwszego przebiegu.</p>
              )}
            </div>
          </div>
        </section>

        <aside className="gid-rail-right" aria-label="Stan naukowy i instrumenty">
          <h2>STAN NAUKOWY</h2>
          <dl className="gid-state-grid">
            <div><dt>Hipotezy</dt><dd>{discoveryLoop?.loop.preregistration.hypotheses.length ?? 0}</dd></div>
            <div><dt>Obserwacje</dt><dd>{observationLayer?.observations.length ?? 0}</dd></div>
            <div><dt>Znaleziska</dt><dd>{observationLayer?.findings.length ?? 0}</dd></div>
            <div><dt>Zdarzenia</dt><dd>{observationLayer?.analysis.significantEvents.length ?? 0}</dd></div>
            <div><dt>Przebiegi</dt><dd>{(runA ? 1 : 0) + (runB ? 1 : 0)}</dd></div>
            <div><dt>Nie zamodelowane</dt><dd className={notModeledCount > 0 ? 'gid-warn' : ''}>{notModeledCount}</dd></div>
          </dl>
          {observationLayer && <p className="gid-summary">{observationLayer.analysis.summary}</p>}
          <h3>INSTRUMENTY <span className="gid-measured-tag">TYLKO POMIARY REALNE</span></h3>
          {instrumentSeries ? (
            <div className="gid-instruments">
              {(['infectious', 'hospitalized', 'deceased'] as const).map((key) => {
                const values = instrumentSeries[key];
                const spark = seriesSparkline(values);
                const latest = values[values.length - 1];
                return (
                  <div className="gid-instrument" key={key}>
                    <div className="gid-instrument-head"><span>{key.toUpperCase()}</span><em>ZMIERZONE</em></div>
                    <strong className="gid-instrument-value">{latest}<small>ostatni dzień</small></strong>
                    {spark ? <svg viewBox="0 0 100 32" className="gid-spark"><path d={spark} /></svg> : <p className="gid-empty-note">NOT_MODELED</p>}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="gid-empty-note">Dostępne po zakończeniu pierwszego przebiegu.</p>
          )}
        </aside>
      </div>

      {!hudHidden && observationLayer && (phase === 'COMPLETE_A' || phase === 'COMPLETE_B' || phase === 'COMPARED' || phase === 'REPLAY_DONE') && (
        <section className="fp-observation-panel" aria-label="Observation and Analysis Layer">
          <div className="fp-observation-section">
            <h2>OBSERVATIONS</h2>
            <p>{observationLayer.observations.length} obserwacji z przebiegu {completedRun?.scenarioId}.</p>
            <div className="fp-observation-chips">
              {observationLayer.observations.slice(0, 6).map((observation) => (
                <span key={`${observation.observationType}-${observation.day}-${observation.inputParameter}`} className={`fp-observation-chip ${observation.severity.toLowerCase()}`}>
                  D{observation.day} · {observation.inputParameter} · {String(observation.observedValue)}
                </span>
              ))}
            </div>
          </div>
          <div className="fp-observation-section">
            <h2>ANALYSIS</h2>
            <p>{observationLayer.analysis.summary}</p>
            <p className="fp-observation-meta">Trend infectious: {observationLayer.analysis.trends.find((trend) => trend.metric === 'infectious')?.direction ?? '—'} · wydarzenia: {observationLayer.analysis.significantEvents.length}</p>
          </div>
          <div className="fp-observation-section">
            <h2>KEY FINDINGS</h2>
            {observationLayer.findings.slice(0, 5).map((finding) => (
              <p key={finding.id} className="fp-finding">
                <strong>{finding.metric}</strong>: {String(finding.observedValue)}{finding.delta === null ? '' : ` · Δ ${finding.delta}`} · dzień {finding.sourceSnapshot.day}
              </p>
            ))}
          </div>
        </section>
      )}

      {!hudHidden && (
        <div className="fp-lab-hud">
          <label className="fp-lab-slider">
            Dzień wejścia izolacji: {interventionDay}
            <input type="range" min={LAB_INTERVENTION_DAY_RANGE.min} max={LAB_INTERVENTION_DAY_RANGE.max} value={interventionDay}
              disabled={isRunning}
              onChange={(e) => setInterventionDay(Number(e.target.value))} />
          </label>
          {locked && runA && (
            <p className="fp-lab-mouse-hint">Esc — odblokuj mysz, żeby kliknąć przyciski</p>
          )}
          <div className="fp-lab-buttons">
            {isRunning && <button className="chip-btn" onClick={handleTogglePause}>{paused ? 'Wznów' : 'Pauza'}</button>}
            {runA && runB && phase !== 'COMPARED' && !isRunning && <button className="chip-btn" onClick={handleCompare}>Porównaj A/B</button>}
            {runA && !isRunning && <button className="chip-btn" onClick={handleReplay}>Odtwórz</button>}
            {comparison && !saved && <button className="chip-btn primary" onClick={handleSave}>Zapisz w Pamięci Naukowej</button>}
            {cameraTaken && <button className="chip-btn" onClick={handleReturnToFirstPerson}>Powrót do pierwszej osoby</button>}
            {(runA || runB) && <button className="chip-btn danger" onClick={handleReset}>Reset</button>}
            {!isRunning && <button className="chip-btn" onClick={() => handleRunDiscoveryLoop()}>Uruchom Pętlę Odkrycia Naukowego</button>}
          </div>
        </div>
      )}

      {!hudHidden && discoveryLoopError && (
        <section className="fp-observation-panel" aria-label="Scientific Discovery Loop error">
          <div className="fp-observation-section">
            <h2>PĘTLA ODKRYCIA — BLOKADA</h2>
            <p>{discoveryLoopError}</p>
          </div>
        </section>
      )}

      {!hudHidden && discoveryLoop && (
        <section className="fp-observation-panel" aria-label="Scientific Discovery Loop">
          <div className="fp-observation-section">
            <h2>KONKURENCYJNE HIPOTEZY</h2>
            <p>{discoveryLoop.problem.statement}</p>
            <div className="fp-observation-chips">
              {discoveryLoop.loop.preregistration.hypotheses.map((hypothesis) => {
                const outcome = discoveryLoop.loop.outcomes.find((entry) => entry.hypothesisId === hypothesis.hypothesisId);
                const value = hypothesis.proposedExperiment?.parameters[discoveryLoop.problem.candidateVariable];
                const chipClass = outcome?.status === 'FALSIFIED' ? 'critical' : outcome?.status === 'SUPPORTED' ? 'supported' : outcome?.status === 'INCONCLUSIVE' || outcome?.status === 'BLOCKED' ? 'notable' : '';
                return (
                  <span key={hypothesis.hypothesisId} className={`fp-observation-chip ${chipClass}`}>
                    {discoveryLoop.problem.candidateVariable}={String(value)} · {outcome?.status ?? 'UNKNOWN'}
                    {outcome?.observedMetric !== null && outcome?.observedMetric !== undefined ? ` · ${discoveryLoop.problem.primaryMetric}=${outcome.observedMetric}` : ''}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="fp-observation-section">
            <h2>PORÓWNANIE I FALSYFIKACJA</h2>
            <p>{discoveryLoop.loop.discrimination.reason}</p>
            {discoveryLoop.evidenceChain.filter((link) => link.findings.length > 0)[0] && (
              <p className="fp-observation-meta">
                Dowód: finding {discoveryLoop.evidenceChain.filter((link) => link.findings.length > 0)[0]!.findings[0]!.id} · resultFingerprint {discoveryLoop.evidenceChain.filter((link) => link.findings.length > 0)[0]!.findings[0]!.sourceSnapshot.resultFingerprint.slice(0, 12)}… · dzień {discoveryLoop.evidenceChain.filter((link) => link.findings.length > 0)[0]!.findings[0]!.sourceSnapshot.day}.
              </p>
            )}
          </div>
          <div className="fp-observation-section">
            <h2>NASTĘPNY EKSPERYMENT</h2>
            <p><strong>{discoveryLoop.nextExperiment.status}</strong>: {discoveryLoop.nextExperiment.why}</p>
          </div>
        </section>
      )}
    </main>
  );
}
