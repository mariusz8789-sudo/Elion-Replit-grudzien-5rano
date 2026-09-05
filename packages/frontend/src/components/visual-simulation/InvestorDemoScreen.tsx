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
import { analyzeExperiment, type ExperimentAnalysis } from '../../core/observationAnalysis/analysis';
import { deriveFindings, type Finding } from '../../core/observationAnalysis/findings';
import { runScientificDiscoveryLoop, type ScientificDiscoveryLoopResult } from '../../core/experimentFabric/scientificDiscoveryLoop';

/**
 * GENESIS INVESTOR DEMO — jeden flagowy ekran prezentacyjny złożony WYŁĄCZNIE
 * z ISTNIEJĄCYCH systemów: Scenario Engine + labSession.ts (ta sama prawda
 * naukowa co `FirstPersonLabScreen`), warstwa Obserwacja/Analiza/Znalezisko
 * (PR #4) i Scientific Discovery Loop (`scientificDiscoveryLoop.ts`). Ten
 * plik NIE liczy niczego naukowego i NIE dodaje drugiego WorldState, silnika
 * ani systemu replay — wyłącznie inny układ prezentacyjny nad tymi samymi
 * hookami/funkcjami, których już używa `FirstPersonLabScreen.tsx`.
 *
 * Układ celowo wzorowany na referencyjnym mockupie „GENESIS — VIRTUAL LAB":
 * pasek Pytanie→Hipotezy→Przewidywanie→Obserwacja→Wynik→Następny eksperyment,
 * kamery, centralna scena 3D, „Dlaczego ta obserwacja?" + łańcuch przyczynowy,
 * panel stanu naukowego i instrumenty. Różnica jest rozmyślna: tu KAŻDA
 * liczba pochodzi z realnego przebiegu; tam, gdzie referencja pokazuje procent
 * pewności hipotezy albo zdjęcie kamery, których Genesis faktycznie nie ma,
 * ten ekran pokazuje realną alternatywę (status/metrykę) albo NOT_MODELED —
 * nigdy zmyślonej liczby czy obrazka.
 */

type ExperimentPhase = 'IDLE' | 'RUNNING_A' | 'COMPLETE_A' | 'RUNNING_B' | 'COMPLETE_B' | 'COMPARED' | 'REPLAYING' | 'REPLAY_DONE';

const MOVE_KEYS: Record<string, MoveKey> = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

const STATUS_LABEL = ['NORMALNY', 'PODWYŻSZONY', 'WYSOKI', 'KRYTYCZNY'];
const CAMERA_LABEL = ['SWOBODNA', 'NAUKOWA', 'NAUKOWA — ANOMALIA', 'ODTWORZENIE'];
const QUESTION_ID = 'problem:intervention-timing';

function canInteractInPhase(phase: ExperimentPhase): boolean {
  return phase === 'IDLE' || phase === 'COMPLETE_A' || phase === 'COMPLETE_B' || phase === 'COMPARED' || phase === 'REPLAY_DONE';
}

/** Prosty, realny wykres SVG z serii dnia po dniu — brak zmyślonych punktów; pusta ścieżka gdy brak danych. */
export function seriesSparkline(values: readonly number[], width = 100, height = 32): string {
  if (values.length < 2) return '';
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  return values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${(index * step).toFixed(1)} ${(height - (value / max) * height).toFixed(1)}`).join(' ');
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function InvestorDemoScreen() {
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
  const [discoveryLoop, setDiscoveryLoop] = useState<ScientificDiscoveryLoopResult | null>(null);
  const [discoveryLoopError, setDiscoveryLoopError] = useState<string | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const move = MOVE_KEYS[e.code];
      if (move) { sim.setMoveKey(move, true); return; }
      if (e.code === 'Escape' && document.pointerLockElement) document.exitPointerLock();
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
  }, [sim]);

  useEffect(() => {
    if (stats.playbackDone !== 1) return;
    if (phase === 'RUNNING_A') setPhase('COMPLETE_A');
    else if (phase === 'RUNNING_B') setPhase('COMPLETE_B');
    else if (phase === 'REPLAYING') setPhase('REPLAY_DONE');
  }, [stats.playbackDone, phase]);

  // "Start" / "Uruchom ponownie" — jeden przycisk niezależny od pozycji gracza w scenie 3D,
  // wywołujący DOKŁADNIE tę samą funkcję co interakcja E w FirstPersonLabScreen.
  const handleRunExperiment = () => {
    if (phaseRef.current === 'IDLE') {
      const run = runLabScenario(interventionDay);
      setRunA(run);
      sim.playSeries(run.series, 'A');
      setPhase('RUNNING_A');
    } else {
      const run = runLabScenario(interventionDay);
      setRunB(run);
      setComparison(null); setReplay(null); setSaved(null);
      sim.playSeries(run.series, 'B');
      setPhase('RUNNING_B');
    }
  };

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

  const handleTogglePause = () => {
    if (paused) sim.resumePlayback(); else sim.pausePlayback();
    setPaused(!paused);
  };

  const handleRestart = () => {
    sim.resetVessel();
    setRunA(null); setRunB(null); setComparison(null); setReplay(null); setSaved(null); setPaused(false);
    setDiscoveryLoop(null); setDiscoveryLoopError(null);
    setPhase('IDLE');
  };

  const handleSave = () => {
    if (!runA || !runB) return;
    const cf = buildLabCounterfactual(runA.interventionStartDay, runB.interventionStartDay);
    setSaved(saveLabCounterfactualToMemory(cf));
  };

  const handleRunDiscoveryLoop = () => {
    try {
      setDiscoveryLoop(runScientificDiscoveryLoop(QUESTION_ID));
      setDiscoveryLoopError(null);
    } catch (error) {
      setDiscoveryLoop(null);
      setDiscoveryLoopError(error instanceof Error ? error.message : String(error));
    }
  };

  const isRunning = phase === 'RUNNING_A' || phase === 'RUNNING_B' || phase === 'REPLAYING';
  const cameraTaken = stats.cameraPhase !== 0;
  const completedRun = runB ?? runA;
  const observationLayer = useMemo(() => {
    if (!completedRun || completedRun.status !== 'COMPLETED' || completedRun.summary === null) return null;
    const analysis: ExperimentAnalysis = analyzeExperiment(completedRun, runB && runA ? runA : undefined);
    return { observations: extractObservations(completedRun), analysis, findings: deriveFindings(completedRun, analysis) };
  }, [completedRun, runA, runB]);

  const instrumentSeries = useMemo(() => (completedRun ? {
    infectious: completedRun.series.map((s) => s.infectious),
    hospitalized: completedRun.series.map((s) => s.hospitalized),
    deceased: completedRun.series.map((s) => s.deceased),
  } : null), [completedRun]);

  const notModeledCount = discoveryLoop ? discoveryLoop.evidenceChain.filter((link) => link.notModeled !== undefined).length : 0;

  // "Dlaczego ta obserwacja?" + łańcuch przyczynowy — z PIERWSZEGO realnego znaleziska
  // bieżącego przebiegu; niezależne od Pętli Odkrycia (dostępne od razu po jednym runie).
  const causalLineage = useMemo(() => {
    const finding: Finding | undefined = observationLayer?.findings[0];
    if (!finding || !completedRun) return null;
    const event = observationLayer?.analysis.significantEvents[0] ?? null;
    const hypothesis = discoveryLoop?.evidenceChain.find((link) => link.findings.some((f) => f.id === finding.id));
    return { finding, event, run: completedRun, hypothesis: hypothesis ?? null };
  }, [observationLayer, completedRun, discoveryLoop]);

  const handleExport = () => {
    if (!completedRun) return;
    downloadJson(`genesis-investor-demo-${completedRun.inputFingerprint ?? 'run'}.json`, {
      run: completedRun, comparison, replay, discoveryLoop, exportedAt: new Date().toISOString(),
    });
  };

  return (
    <main id="main-content" tabIndex={-1} className="gid-shell">
      <section className="gid-flow" aria-label="Przepływ naukowy: Pytanie -> Hipotezy -> Przewidywanie -> Obserwacja -> Wynik -> Następny eksperyment">
        {discoveryLoop ? (
          <>
            <div className="gid-flow-step"><span>PYTANIE</span><p>{discoveryLoop.problem.statement}</p></div>
            <div className="gid-flow-arrow">→</div>
            <div className="gid-flow-step">
              <span>AKTYWNE HIPOTEZY · {discoveryLoop.loop.preregistration.hypotheses.length}</span>
              {discoveryLoop.loop.outcomes.slice(0, 3).map((outcome) => (
                <p key={outcome.hypothesisId} className={`gid-hyp-row gid-hyp-${outcome.status.toLowerCase()}`}>
                  {outcome.status}{outcome.observedMetric !== null ? ` · ${discoveryLoop.problem.primaryMetric}=${outcome.observedMetric}` : ''}
                </p>
              ))}
            </div>
            <div className="gid-flow-arrow">→</div>
            <div className="gid-flow-step"><span>PRZEWIDYWANIE</span><p>{discoveryLoop.loop.preregistration.hypotheses[0]?.predictedOutcome.slice(0, 70)}…</p></div>
            <div className="gid-flow-arrow">→</div>
            <div className="gid-flow-step"><span>OBSERWACJA</span><p>{discoveryLoop.evidenceChain.reduce((sum, l) => sum + l.observations.length, 0)} realnych obserwacji</p></div>
            <div className="gid-flow-arrow">→</div>
            <div className="gid-flow-step"><span>WYNIK</span><p>{discoveryLoop.loop.discrimination.reason.slice(0, 70)}</p></div>
            <div className="gid-flow-arrow">→</div>
            <div className="gid-flow-step gid-flow-step-next"><span>NASTĘPNY EKSPERYMENT</span><p>{discoveryLoop.nextExperiment.status}: {discoveryLoop.nextExperiment.why.slice(0, 50)}</p></div>
          </>
        ) : discoveryLoopError ? (
          <div className="gid-flow-step gid-flow-blocked"><span>ZABLOKOWANE</span><p>{discoveryLoopError}</p></div>
        ) : (
          <div className="gid-flow-empty">Pytanie → Hipotezy → Przewidywanie → Obserwacja → Wynik → Następny eksperyment — kliknij „Uruchom Pętlę Odkrycia Naukowego" poniżej.</div>
        )}
      </section>

      <div className="gid-body">
        <aside className="gid-rail-left" aria-label="Kamery i obserwacja na żywo">
          <h2>KAMERY</h2>
          <div className="gid-cam-list">
            <button type="button" className={`gid-cam-slot ${!cameraTaken ? 'active' : ''}`} disabled={!cameraTaken} onClick={() => sim.returnToFirstPerson()}>
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
          {/* Legenda statusów, których ten ekran realnie używa — żeby „zmierzone"
              nigdy nie było mylone z „oszacowane przez model" ani z „zablokowane". */}
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
            <canvas ref={canvasRef} className="gid-canvas" aria-label="Żywa scena laboratoryjna (Three.js, realne dane Scenario Engine)" />
            {/* Nagłówek sceny: wyłącznie realny stan (scenariusz z przebiegu, dzień z
                odtwarzania, status szpitala) — nic tu nie jest zmyślone ani stylizowane
                na wynik, którego Genesis nie policzył. */}
            <div className="gid-stage-head">
              <span className="gid-stage-scenario">{completedRun?.scenarioId ?? runA?.scenarioId ?? 'BRAK PRZEBIEGU'}</span>
              {isRunning ? (
                <>
                  <span className="gid-stage-day">DZIEŃ {stats.dayIndex + 1}/{stats.totalDays || 60}</span>
                  <span className={`gid-stage-status s${stats.vesselStatusCode}`}>{STATUS_LABEL[stats.vesselStatusCode]}</span>
                </>
              ) : (
                <span className="gid-stage-status idle">{completedRun ? 'PRZEBIEG ZAKOŃCZONY' : 'NOT_EXECUTED'}</span>
              )}
            </div>
            {loading && <div className="route-loading" role="status">Ładowanie silnika 3D…</div>}
            {failed && <div className="empty-state">Nie udało się uruchomić WebGL na tym urządzeniu.</div>}
            {!locked && phase === 'IDLE' && !loading && !failed && (
              <div className="gid-enter" role="button" tabIndex={0}
                onClick={() => canvasRef.current?.requestPointerLock()}
                onKeyDown={(e) => { if (e.key === 'Enter') canvasRef.current?.requestPointerLock(); }}>
                <p className="gid-enter-title">Kliknij, aby wejść do laboratorium</p>
                <p className="gid-enter-hint">WASD — chód · mysz — rozglądanie · Esc — wyjście. Użyj przycisku „Uruchom" poniżej, aby wystartować eksperyment bez chodzenia.</p>
              </div>
            )}
            {locked && phase === 'IDLE' && !isRunning && (
              <div className="gid-empty-overlay">Brak jeszcze żadnego przebiegu — kliknij „Uruchom eksperyment".</div>
            )}
          </div>
          <div className="gid-stage-footer">
            <div className="gid-why-panel">
              <h3>DLACZEGO TA OBSERWACJA?</h3>
              {causalLineage ? (
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
            <p className="gid-empty-note">Instrumenty wypełnią się realnymi danymi po zakończeniu pierwszego przebiegu.</p>
          )}
        </aside>
      </div>

      <div className="gid-controls" role="toolbar" aria-label="Sterowanie eksperymentem">
        <label className="gid-slider">
          Dzień wejścia izolacji: {interventionDay}
          <input type="range" min={LAB_INTERVENTION_DAY_RANGE.min} max={LAB_INTERVENTION_DAY_RANGE.max} value={interventionDay}
            disabled={isRunning} onChange={(e) => setInterventionDay(Number(e.target.value))} />
        </label>
        <div className="gid-buttons">
          {!isRunning && canInteractInPhase(phase) && phase === 'IDLE' && <button className="chip-btn primary" onClick={handleRunExperiment}>Start</button>}
          {isRunning && <button className="chip-btn" onClick={handleTogglePause}>{paused ? 'Wznów' : 'Pauza'}</button>}
          {(runA || runB) && <button className="chip-btn gid-quiet" onClick={handleRestart}>Restart</button>}
          {!isRunning && canInteractInPhase(phase) && phase !== 'IDLE' && <button className="chip-btn primary" onClick={handleRunExperiment}>Uruchom ponownie</button>}
          {runA && runB && phase !== 'COMPARED' && !isRunning && <button className="chip-btn" onClick={handleCompare}>Porównaj</button>}
          {runA && !isRunning && <button className="chip-btn" onClick={handleReplay}>Odtwórz</button>}
          {comparison && !saved && <button className="chip-btn" onClick={handleSave}>Zapisz w Pamięci</button>}
          {completedRun && <button className="chip-btn gid-quiet" onClick={handleExport}>Eksportuj dane</button>}
          {!isRunning && <button className="chip-btn gid-secondary" onClick={handleRunDiscoveryLoop}>Uruchom Pętlę Odkrycia Naukowego</button>}
        </div>
        {replay && <p className={`gid-replay-status ${replay.status.toLowerCase()}`}>{replay.status}: {replay.message}</p>}
        {saved && <p className="gid-saved-status">Zapisano: {saved.id}</p>}
      </div>

      <button type="button" className="gid-info-toggle" title="Co jest realne, co jest wizualizacją" onClick={() => alert(`Naczynie pokazuje realne obłożenie łóżek/ICU z istniejącego Scenario Engine. Niemodelowane: ${LAB_NOT_MODELED.join(', ')}.`)}>ℹ</button>
    </main>
  );
}
