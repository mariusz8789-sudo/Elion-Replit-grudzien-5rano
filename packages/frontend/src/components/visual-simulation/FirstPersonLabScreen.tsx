import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useThreeLoop } from '../../core/three/useThreeLoop';
import { LabScene3D } from '../../core/three/labScene3D';
import type { MoveKey } from '../../core/three/firstPersonController';
import {
  buildLabCounterfactual, compareLabRuns, LAB_INTERVENTION_DAY_RANGE, LAB_NOT_MODELED,
  replayLabRun, runLabScenario, saveLabCounterfactualToMemory,
} from '../../core/experimentFabric/labSession';
import type { ScenarioComparison, ScenarioReplay, ScenarioRun } from '../../core/simulation/scenarioEngine';
import type { SavedExperiment } from '../../core/scienceMemory';

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
const FIXED_KIND_LABEL = ['', 'WIDOK NAUKOWY', 'WIDOK NAUKOWY — ANOMALIA', 'ODTWORZENIE'];

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

  const [locked, setLocked] = useState(false);
  const [phase, setPhase] = useState<ExperimentPhase>('IDLE');
  const [interventionDay, setInterventionDay] = useState(0);
  const [runA, setRunA] = useState<ScenarioRun | null>(null);
  const [runB, setRunB] = useState<ScenarioRun | null>(null);
  const [comparison, setComparison] = useState<ScenarioComparison | null>(null);
  const [replay, setReplay] = useState<ScenarioReplay | null>(null);
  const [saved, setSaved] = useState<SavedExperiment | null>(null);
  const [paused, setPaused] = useState(false);
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
      }
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

  const canInteract = stats.nearStation === 1 && canInteractInPhase(phase);
  const isRunning = phase === 'RUNNING_A' || phase === 'RUNNING_B' || phase === 'REPLAYING';
  const cameraTaken = stats.cameraPhase !== 0;

  return (
    <main id="main-content" tabIndex={-1} className="fp-lab">
      <div className="honesty-row">
        <span className="honesty educational">Pierwszoosobowa scena laboratoryjna</span>
        <span className="honesty-note">
          Naczynie pokazuje REALNE obłożenie łóżek/ICU z istniejącego Scenario Engine (scenariusz IZOLACJA) —
          nie jest to symulacja płynów, organizmów ani żadnej biologii poza obłożeniem szpitalnym.
          Niemodelowane: {LAB_NOT_MODELED.join(', ')}.
        </span>
      </div>

      <div className="fp-lab-stage">
        <canvas ref={canvasRef} className="fp-lab-canvas" aria-label="Pierwszoosobowa scena laboratoryjna (Three.js)" />
        {loading && <div className="route-loading" role="status">Ładowanie silnika 3D…</div>}
        {failed && <div className="empty-state">Nie udało się uruchomić WebGL na tym urządzeniu.</div>}

        {!locked && !loading && !failed && (
          <div className="fp-lab-enter" role="button" tabIndex={0}
            onClick={() => canvasRef.current?.requestPointerLock()}
            onKeyDown={(e) => { if (e.key === 'Enter') canvasRef.current?.requestPointerLock(); }}>
            <p className="fp-lab-enter-title">Kliknij, aby wejść do laboratorium</p>
            <p className="fp-lab-enter-hint">WASD — chód · mysz — rozglądanie · E — interakcja · Esc — wyjście</p>
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
      </div>

      <div className="fp-lab-hud">
        <div className="fp-lab-hud-science">
          <p><strong>PYTANIE</strong> — Czy wcześniejsze wejście izolacji zmienia szczytowe obłożenie szpitala i liczbę zgonów?</p>
          {phase === 'IDLE' && <p><strong>PRZEWIDYWANIE</strong> — Podejdź do konsoli i uruchom eksperyment A (dzień wejścia izolacji: {interventionDay}).</p>}
          {isRunning && (
            <p><strong>OBSERWACJA</strong> — Dzień {stats.dayIndex + 1}/{stats.totalDays || 60} · obłożenie łóżek {(stats.vesselFraction * 100).toFixed(0)}%
              {' · '}ICU {(stats.vesselIcuFraction * 100).toFixed(0)}% · status {STATUS_LABEL[stats.vesselStatusCode]}</p>
          )}
          {(phase === 'COMPLETE_A' || phase === 'COMPLETE_B') && runA && (
            <p><strong>WYNIK</strong> — Przebieg {phase === 'COMPLETE_A' ? 'A' : 'B'}: szczyt obłożenia łóżek {(( (phase==='COMPLETE_A'?runA:runB)!.summary!.peakBedOccupancy)*100).toFixed(0)}%,
              {' '}zgony {(phase==='COMPLETE_A'?runA:runB)!.summary!.totalDeaths}. <strong>DALEJ</strong> — zmień dzień interwencji i uruchom ponownie, albo porównaj.</p>
          )}
          {phase === 'COMPARED' && comparison && (
            <p><strong>WYNIK PORÓWNANIA</strong> — {comparison.message} Zmiana zgonów: {comparison.metrics.find((m) => m.key === 'totalDeaths')?.absoluteDelta}.
              {' '}<strong>DALEJ</strong> — odtwórz przebieg albo zapisz w Pamięci Naukowej.</p>
          )}
          {replay && (
            <p><strong>ODTWORZENIE</strong> — {replay.message} ({replay.status})</p>
          )}
          {saved && <p><strong>ZAPISANO</strong> — rekord {saved.id} w Pamięci Naukowej.</p>}
        </div>

        <div className="fp-lab-hud-controls">
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
          </div>
        </div>
      </div>

      <p className="footer-note">
        Silnik naukowy: core/experimentFabric/labSession.ts nad istniejącym core/simulation/scenarioEngine.ts
        (scenariusz ISOLATION) i scenarioCounterfactual.ts — bez drugiego silnika ani drugiej pamięci.
        Scena: Sim3D + useThreeLoop (ta sama infrastruktura co Character Lab / High-Fidelity Slice).
      </p>
    </main>
  );
}
