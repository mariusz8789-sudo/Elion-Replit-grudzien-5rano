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
import { extractObservations } from '../../core/observationAnalysis/observationExtraction';
import { analyzeExperiment } from '../../core/observationAnalysis/analysis';
import { deriveFindings } from '../../core/observationAnalysis/findings';
import { runScientificDiscoveryLoop, type ScientificDiscoveryLoopResult } from '../../core/experimentFabric/scientificDiscoveryLoop';

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
  const handleRunDiscoveryLoop = () => {
    try {
      setDiscoveryLoop(runScientificDiscoveryLoop('problem:intervention-timing'));
      setDiscoveryLoopError(null);
    } catch (error) {
      setDiscoveryLoop(null);
      setDiscoveryLoopError(error instanceof Error ? error.message : String(error));
    }
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

  return (
    <main id="main-content" tabIndex={-1} className="fp-lab">
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

        {!hudHidden && caption && (
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
            {!isRunning && <button className="chip-btn" onClick={handleRunDiscoveryLoop}>Uruchom Pętlę Odkrycia Naukowego</button>}
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
