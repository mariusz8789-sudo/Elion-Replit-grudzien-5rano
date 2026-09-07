import { useEffect, useMemo, useRef, useState } from 'react';
import { useThreeLoop } from '../../core/three/useThreeLoop';
import { GenesisScientificCitySim } from '../../core/three/genesisScientificCitySim';
import { parseObservationIntent } from '../../core/lookingGlass/observationIntent';
import { resolveCameraIntent } from '../../core/lookingGlass/observationExecution';

/**
 * GENESIS — C1 SCIENTIFIC CONTROL LOOP
 * ======================================================================
 *
 * Człowiek -> język naturalny -> C1 -> C3 -> wynik -> C1 wyjaśnia -> C2 pokazuje.
 *
 * This screen is where that loop closes for the real pump/hospital cross-domain object built in
 * City Infrastructure Integration 1.0. It adds NO new pump, NO new graphics, NO new C3 mechanism —
 * `runScientificControlLoop` below is the single place that TIES TOGETHER what already exists:
 * `parseObservationIntent`/`resolveCameraIntent` (Looking Glass 2.1) for natural language, and
 * `GenesisScientificCitySim`'s own real methods (`resolveNamedWorldTarget`, `triggerPumpFailure`,
 * `explainWaterServiceLoss`, `getComparison`, `applyObservationTarget`, `setViewingBranch`) for
 * entity resolution, intervention, causal analysis, and the camera handoff to C2. C1's own output
 * here is always a STATEMENT about the real world (a narration string, grounded in real solver/
 * event data) plus a call into the Sim3D's existing observation API — never a mesh, a material, or
 * a color.
 */
export function GenesisScientificCityScreen() {
  const sim = useMemo(() => new GenesisScientificCitySim(), []);
  const params = useMemo(() => ({}), []);
  const { canvasRef, loading, failed } = useThreeLoop(sim, params, false, undefined);

  const [obsText, setObsText] = useState('');
  const [obsResult, setObsResult] = useState<string | null>(null);
  const [failureOutcome, setFailureOutcome] = useState<ReturnType<GenesisScientificCitySim['triggerPumpFailure']> | null>(null);
  const [rainfallOutcome, setRainfallOutcome] = useState<ReturnType<GenesisScientificCitySim['triggerRainfallScenario']> | null>(null);
  const [tick, setTick] = useState(0);
  const [replaying, setReplaying] = useState(false);
  const [, forceRender] = useState(0);
  const replayTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Renderer counters refresh every frame; polling once a second is enough to read them and costs
   * nothing, whereas re-rendering this panel per frame would itself distort what it measures. */
  const [stats, setStats] = useState<Record<string, number>>({});

  useEffect(() => () => { if (replayTimer.current) clearInterval(replayTimer.current); }, []);

  useEffect(() => {
    const timer = setInterval(() => setStats(sim.getStats()), 1000);
    return () => clearInterval(timer);
  }, [sim]);

  /**
   * THE SCIENTIFIC CONTROL LOOP:
   *   1. natural language -> ObservationIntent (parseObservationIntent, reused verbatim)
   *   2. C1 recognizes the REAL entity this world already has (sim.resolveNamedWorldTarget — a
   *      live graph scan, never a hardcoded id, never a newly-created entity)
   *   3. an intervention command / "what if X fails" hypothetical -> executed through C3
   *      (sim.triggerPumpFailure — the real fork + real solver re-solve + real cascade)
   *   4. consequences analyzed from REAL data (sim.explainWaterServiceLoss / sim.getComparison —
   *      real causal ancestry, real branch diff)
   *   5. the observation handed to C2 is a target + CameraIntent (sim.applyObservationTarget) —
   *      C1 never touches a THREE object; C2's existing camera/material code decides how it looks
   *   6. replay/counterfactual reuses the SAME fork already made (sim.setViewingBranch) — no
   *      second branching system
   */
  const runScientificControlLoop = (sentence: string) => {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    const intent = parseObservationIntent(trimmed);

    // (1) A whole SCENARIO request — "Pokaż mi miasto podczas ekstremalnego deszczu." Establishes
    // the flagship scenario on the LIVE baseline via C3's own real scripted rainfall event (see
    // sim.triggerRainfallScenario's own doc) — not a counterfactual fork, not a second scenario
    // mechanism.
    if (intent.scenarioRequest === 'EXTREME_RAINFALL') {
      const outcome = sim.triggerRainfallScenario();
      if (!rainfallOutcome) setRainfallOutcome(outcome);
      setObsResult(`Extreme rainfall has occurred. Pump tripped: ${outcome.tripped}. Hospital water service interrupted: ${outcome.hospitalInterrupted}.`);
      setObsText('');
      setTick(sim.getStats().tick);
      forceRender((n) => n + 1);
      return;
    }

    // (0 — mandatory Step 0) The ONE counterfactual this mission's flagship names explicitly.
    // REAL as of C3 Phase 5 (rainfall intensity genuinely drives hydraulic load) — checked BEFORE
    // the generic comparison/intervention branches below so it's never silently absorbed into an
    // unrelated real intervention. Falls back to the honest "run the scenario first" message only
    // when there's no real baseline yet to compare against — see sim's own doc for exactly why.
    if (intent.rainfallCounterfactualQuery) {
      if (!sim.isRainfallScenarioActive()) {
        setObsResult(sim.getRainfallCounterfactualGap());
        setObsText('');
        return;
      }
      const percentLower = intent.rainfallCounterfactualPercent ?? 30;
      const outcome = sim.runRainfallIntensityCounterfactual(percentLower);
      setObsResult(outcome
        ? `At ${outcome.adjustedIntensityMmPerHour.toFixed(1)}mm/h (${percentLower}% lower): pump tripped: ${outcome.tripped} (vs ${outcome.baselineTripped} at full intensity). Hospital water service interrupted: ${outcome.hospitalInterrupted} (vs ${outcome.baselineHospitalInterrupted}).`
        : sim.getRainfallCounterfactualGap());
      setObsText('');
      return;
    }

    // "What's happening?" / "Co się dzieje?" — a grounded status summary, never a fabricated one.
    if (intent.askingWhatIsHappening) {
      setObsResult(sim.describeCurrentState().narration);
      setObsText('');
      return;
    }

    // (3) An imperative command ("turn off the pump") or a "what happens if X fails" hypothetical
    // — both authorize the SAME real C3 intervention. Idempotent: asking twice re-shows the
    // already-computed real outcome rather than forking a second time.
    if (intent.interventionRequested) {
      const query = intent.target ?? intent.focus ?? 'pump';
      const match = sim.resolveNamedWorldTarget(query);
      if (!match || match.kind !== 'pump-pipe-system') {
        setObsResult(`Nothing in this city can be failed by that name ("${query}").`);
        setObsText('');
        return;
      }
      const outcome = failureOutcome ?? sim.triggerPumpFailure();
      if (!failureOutcome) setFailureOutcome(outcome);
      sim.setViewingBranch('FAILURE');
      setObsResult(`Pump tripped: ${outcome.tripped}. Hospital water service interrupted: ${outcome.hospitalInterrupted}. See the causal chain and comparison below.`);
      setObsText('');
      setTick(sim.getStats().tick);
      forceRender((n) => n + 1);
      return;
    }

    // (7) "Cofnij do momentu przed awarią" / "go back to before the failure" / "return to
    // baseline" — reuses the SAME fork's own untouched baseline branch, never a second timeline.
    // Honest distinction: triggerRainfallScenario mutates the LIVE baseline directly (there is no
    // separate branch to switch back to) — Replay is the honest way to look at that "before".
    const referencesFailure = intent.event ? /awari|failure|incydent|incident/i.test(intent.event) : false;
    if (intent.returningToBaseline || (intent.time?.kind === 'BEFORE_EVENT' && referencesFailure)) {
      if (failureOutcome) {
        sim.setViewingBranch('BASELINE');
        setObsResult('Showing the baseline — the pump as it was before the failure.');
      } else if (rainfallOutcome) {
        setObsResult('The rainfall scenario ran on the live world directly (no separate baseline branch was forked) — try "Replay" to see how it unfolded.');
      } else {
        setObsResult('Nothing has failed yet — there is no "before" to return to.');
      }
      setObsText('');
      forceRender((n) => n + 1);
      return;
    }

    // (11) "Replay what happened" / "Powtórz." — steps through the REAL recorded history via
    // sim.startReplay/advanceReplay (getFrameState's own timestamp param) — no second replay engine.
    if (/\b(replay|powtórz|powtorz)\b/i.test(trimmed)) {
      handleStartReplay();
      setObsText('');
      return;
    }

    // (4/7) "What changed?" / "show me before and after" / a bare comparison request — the real
    // branch diff (sim.getComparison), never a guessed delta. Comparison structurally needs a real
    // fork (WORLD A vs WORLD B); the rainfall scenario alone (no fork) has no "other world" to
    // diff against — say so honestly instead of returning an empty table.
    if (intent.askingWhatChanged || intent.mode === 'BEFORE_AFTER' || intent.comparison) {
      const rows = sim.getComparison();
      if (rows) {
        const pump = rows.find((row) => row.label === 'Pump');
        const hospital = rows.find((row) => row.label === 'Hospital');
        setObsResult(pump
          ? `Pump flow: ${pump.baseline?.volumetricFlow ?? '?'} m³/s -> ${pump.failure?.volumetricFlow ?? '?'} m³/s. Hospital water service interrupted: ${hospital?.failure?.waterServiceInterrupted === 1}.`
          : 'No comparable state found.');
      } else if (rainfallOutcome) {
        const current = sim.describeCurrentState();
        setObsResult(`The rainfall scenario changed the world directly — pump flow is now ${current.pumpFlow.toFixed(3)} m³/s. No separate baseline branch exists to compare against (that needs a real forked counterfactual — try "what happens if the pump fails" for a real WORLD A/B comparison).`);
      } else {
        setObsResult('Nothing has changed yet — no intervention has been run.');
      }
      setObsText('');
      return;
    }

    // (4) "Why did this happen?" — the real causal chain (sim.explainWaterServiceLoss), never a
    // second causal engine.
    if (intent.askingWhy) {
      const chain = sim.explainWaterServiceLoss();
      setObsResult(chain && chain.length > 0
        ? `Real cause chain: ${chain.map((step) => step.type).join(' -> ')}.`
        : 'No recorded cause yet — nothing has failed.');
      setObsText('');
      return;
    }

    // (5) "Pokaż następne 24 godziny." / "Show me the next 24 hours." — a forward time move,
    // reusing the sim's own existing sim.step (the SAME method the +1h/+6h buttons call — no
    // second clock). Checked before the plain-observation fallback below, since a bare "next N
    // hours" phrase also happens to satisfy the generic TARGET_TRIGGERS grammar (it looks like
    // "show me the <name>") and must not be misrouted into a failed entity lookup for "next 24
    // hours" as if that were a place in the city.
    if (intent.time?.kind === 'RELATIVE' && intent.time.direction === 'FORWARD') {
      const unit = intent.time.unit ?? 'HOUR';
      const hoursPerUnit = unit === 'DAY' ? 24 : unit === 'YEAR' ? 24 * 365 : 1;
      const hours = intent.time.amount * hoursPerUnit;
      sim.step(hours);
      setTick(sim.getStats().tick);
      setObsResult(`Advanced ${intent.time.amount} ${unit.toLowerCase()}${intent.time.amount === 1 ? '' : 's'} (${hours}h). Tick is now ${sim.getStats().tick}h.`);
      setObsText('');
      forceRender((n) => n + 1);
      return;
    }

    // (2/5) A plain observation request — resolve the REAL target and hand the camera intent to
    // C2 through the sim's own existing observation-execution method.
    const query = intent.target ?? intent.focus;
    if (!query) {
      setObsResult('No target was named — try "the pump" or "the hospital".');
      setObsText('');
      return;
    }
    const cameraIntent = resolveCameraIntent(intent);
    const outcome = sim.applyObservationTarget(query, cameraIntent);
    setObsResult(outcome.found
      ? `Showing ${outcome.label} — ${cameraIntent}.`
      : `Nothing in this city answers to "${query}".`);
    setObsText('');
  };

  const handleStep = (hours: number) => {
    sim.step(hours);
    setTick(sim.getStats().tick);
  };

  // Reuses sim.startReplay/advanceReplay — the REAL recorded history via getFrameState's own
  // timestamp param, stepped on an interval. No second replay engine, no fabricated frames.
  const handleStartReplay = () => {
    if (replaying) return;
    const window = sim.startReplay();
    if (!window) {
      setObsResult('Nothing has happened yet to replay.');
      return;
    }
    setReplaying(true);
    setObsResult(`Replaying from tick ${window.fromTick} to tick ${window.toTick}…`);
    replayTimer.current = setInterval(() => {
      const more = sim.advanceReplay();
      forceRender((n) => n + 1);
      if (!more) {
        if (replayTimer.current) clearInterval(replayTimer.current);
        replayTimer.current = null;
        setReplaying(false);
        setObsResult('Replay finished — back to the present.');
      }
    }, 400);
  };

  // explainWaterServiceLoss now reads whichever engine is active (fork OR the rainfall-mutated
  // baseline) — so both real interventions light up the same causal panel, never a second one.
  const causalChain = (failureOutcome || rainfallOutcome) ? sim.explainWaterServiceLoss() : null;
  const comparison = failureOutcome ? sim.getComparison() : null;

  return (
    <div className="app">
      <div className="gsc-stage">
        <canvas ref={canvasRef} className="gsc-canvas" aria-label="Genesis Scientific City — real cross-domain pump/hospital scene" />
        {loading && <div className="route-loading" role="status">Ładowanie silnika 3D…</div>}
        {failed && <div className="empty-state">Nie udało się uruchomić WebGL na tym urządzeniu.</div>}

        {!loading && !failed && (
          <>
            <div className="lg-obs-live">
              <div className="lg-obs">
                <span className="lg-obs-title">ASK GENESIS</span>
                <form className="lg-obs-form" onSubmit={(event) => { event.preventDefault(); runScientificControlLoop(obsText); }}>
                  <input
                    className="lg-obs-input"
                    type="text"
                    value={obsText}
                    placeholder="np. „Pokaż pompę.” / „Co się stanie, jeśli pompa padnie?”"
                    onChange={(event) => setObsText(event.target.value)}
                  />
                  <button type="submit" className="lg-obs-send" disabled={obsText.trim().length === 0}>Go</button>
                </form>
                {obsResult && <p className="lg-obs-narration">{obsResult}</p>}
              </div>
            </div>

            {/* GRAPHICS V2 — real WebGLRenderer.info counters for the flagship scene, read through
                the existing Sim3D `onRenderMetrics` hook. Same keys and same purpose as the epidemic
                city's own observability panel: graphics/PERFORMANCE_BUDGET.md requires every sprint
                to measure this scene, and until now it could not be measured at all. */}
            <div className="gsc-panel observability-panel">
              <div><span>draw calls</span><b>{Math.round(stats.webgl_draw_calls ?? 0)}</b></div>
              <div><span>triangles</span><b>{Math.round(stats.webgl_triangles ?? 0)}</b></div>
              <div><span>geometries</span><b>{Math.round(stats.webgl_geometries ?? 0)}</b></div>
              <div><span>textures</span><b>{Math.round(stats.webgl_textures ?? 0)}</b></div>
              <div><span>tex. mem (est.)</span><b>{(Number(stats.webgl_texture_bytes_estimate ?? 0) / (1024 * 1024)).toFixed(1)} MB</b></div>
              <div><span>geo. mem (est.)</span><b>{(Number(stats.webgl_geometry_bytes_estimate ?? 0) / (1024 * 1024)).toFixed(1)} MB</b></div>
              <div><span>GPU mem (est.)</span><b>{(Number(stats.webgl_gpu_bytes_estimate ?? 0) / (1024 * 1024)).toFixed(1)} MB</b></div>
              <div><span>render</span><b>{Number(stats.webgl_render_ms ?? 0).toFixed(2)} ms</b></div>
            </div>

            <div className="gsc-panel">
              <div className="gsc-panel-row">
                <span className="gx-status real">REAL</span>
                <span>Tick: {tick}h</span>
                <button type="button" onClick={() => handleStep(1)}>+1h</button>
                <button type="button" onClick={() => handleStep(6)}>+6h</button>
              </div>
              <button
                type="button"
                className="gsc-fail-btn"
                onClick={() => runScientificControlLoop('What happens if the pump fails?')}
                disabled={Boolean(failureOutcome)}
              >
                {failureOutcome ? 'Pump failure triggered' : 'What happens if the pump fails?'}
              </button>
              {failureOutcome && (
                <div className="gsc-outcome">
                  <p>Forked at tick {failureOutcome.forkTick}. Pump tripped: <b>{String(failureOutcome.tripped)}</b>. Hospital water service interrupted: <b>{String(failureOutcome.hospitalInterrupted)}</b>.</p>
                  <div className="gsc-branch-toggle">
                    <button type="button" onClick={() => { sim.setViewingBranch('BASELINE'); forceRender((n) => n + 1); }}>View: Baseline (pump normal)</button>
                    <button type="button" onClick={() => { sim.setViewingBranch('FAILURE'); forceRender((n) => n + 1); }}>View: Failure branch</button>
                  </div>
                  <p className="gsc-caption">Now viewing: <b>{sim.getViewingBranch()}</b></p>
                </div>
              )}
              <button
                type="button"
                className="gsc-rainfall-btn"
                onClick={() => runScientificControlLoop('Pokaż mi miasto podczas ekstremalnego deszczu.')}
                disabled={Boolean(rainfallOutcome)}
              >
                {rainfallOutcome ? 'Rainfall scenario triggered' : 'Show extreme rainfall scenario'}
              </button>
              {rainfallOutcome && (
                <div className="gsc-outcome">
                  <p>Rainfall scheduled at tick {rainfallOutcome.scheduledAtTick}. Pump tripped: <b>{String(rainfallOutcome.tripped)}</b>. Hospital water service interrupted: <b>{String(rainfallOutcome.hospitalInterrupted)}</b>.</p>
                </div>
              )}
              <button
                type="button"
                className="gsc-replay-btn"
                onClick={handleStartReplay}
                disabled={replaying}
              >
                {replaying ? `Replaying… tick ${sim.getReplayTick() ?? '?'}` : 'Replay'}
              </button>
              {causalChain && causalChain.length > 0 && (
                <div className="gsc-causal">
                  <span className="lg-obs-title">WHY DID THE HOSPITAL LOSE WATER SERVICE?</span>
                  <ol>
                    {causalChain.map((step, i) => (
                      <li key={`${step.type}-${i}`}>{step.type} @ tick {step.tick} — {step.cause ?? 'no recorded cause'}</li>
                    ))}
                  </ol>
                </div>
              )}
              {comparison && (
                <div className="gsc-comparison">
                  <span className="lg-obs-title">WORLD A (NORMAL) vs WORLD B (FAILURE)</span>
                  <table>
                    <tbody>
                      {comparison.map((row) => (
                        <tr key={row.entityId}>
                          <td>{row.label}</td>
                          <td>{row.baseline ? JSON.stringify(row.baseline) : 'n/a'}</td>
                          <td>{row.failure ? JSON.stringify(row.failure) : 'n/a'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
