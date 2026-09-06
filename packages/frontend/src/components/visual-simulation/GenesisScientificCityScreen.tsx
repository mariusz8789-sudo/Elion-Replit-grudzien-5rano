import { useMemo, useState } from 'react';
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
  const [tick, setTick] = useState(0);
  const [, forceRender] = useState(0);

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
      forceRender((n) => n + 1);
      return;
    }

    // (7) "Cofnij do momentu przed awarią" / "go back to before the failure" / "return to
    // baseline" — reuses the SAME fork's own untouched baseline branch, never a second timeline.
    const referencesFailure = intent.event ? /awari|failure|incydent|incident/i.test(intent.event) : false;
    if (intent.returningToBaseline || (intent.time?.kind === 'BEFORE_EVENT' && referencesFailure)) {
      if (!failureOutcome) {
        setObsResult('Nothing has failed yet — there is no "before" to return to.');
      } else {
        sim.setViewingBranch('BASELINE');
        setObsResult('Showing the baseline — the pump as it was before the failure.');
      }
      setObsText('');
      forceRender((n) => n + 1);
      return;
    }

    // (4/7) "What changed?" / "show me before and after" / a bare comparison request — the real
    // branch diff (sim.getComparison), never a guessed delta.
    if (intent.askingWhatChanged || intent.mode === 'BEFORE_AFTER' || intent.comparison) {
      if (!failureOutcome) {
        setObsResult('Nothing has changed yet — no intervention has been run.');
      } else {
        const rows = sim.getComparison();
        const pump = rows?.find((row) => row.label === 'Pump');
        const hospital = rows?.find((row) => row.label === 'Hospital');
        setObsResult(pump
          ? `Pump flow: ${pump.baseline?.volumetricFlow ?? '?'} m³/s -> ${pump.failure?.volumetricFlow ?? '?'} m³/s. Hospital water service interrupted: ${hospital?.failure?.waterServiceInterrupted === 1}.`
          : 'No comparable state found.');
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

  const causalChain = failureOutcome ? sim.explainWaterServiceLoss() : null;
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

            <div className="gsc-panel">
              <div className="gsc-panel-row">
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
