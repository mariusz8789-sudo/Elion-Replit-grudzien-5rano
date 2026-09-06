import { useMemo, useState } from 'react';
import { useThreeLoop } from '../../core/three/useThreeLoop';
import { GenesisScientificCitySim } from '../../core/three/genesisScientificCitySim';
import { parseObservationIntent } from '../../core/lookingGlass/observationIntent';
import { resolveCameraIntent } from '../../core/lookingGlass/observationExecution';

/**
 * GENESIS — CITY INFRASTRUCTURE INTEGRATION 1.0
 *
 * The first screen showing a real C3 `TemporalEngine`-backed world (not the pre-C3 agent
 * simulation `City3DWebGLScreen` renders) through C2's generic `WorldFrameRenderer` pathway —
 * the pump-pipe-system -> hospital cross-domain object this mission exists to prove out. Camera
 * and target resolution reuse the exact Looking Glass 2.1 pattern (`observationIntent.ts`/
 * `observationExecution.ts`) already proven on the epidemic city and the lab.
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

  const askObservation = (sentence: string) => {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    const intent = parseObservationIntent(trimmed);
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

  const handleTriggerFailure = () => {
    const outcome = sim.triggerPumpFailure();
    setFailureOutcome(outcome);
    forceRender((n) => n + 1);
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
                <form className="lg-obs-form" onSubmit={(event) => { event.preventDefault(); askObservation(obsText); }}>
                  <input
                    className="lg-obs-input"
                    type="text"
                    value={obsText}
                    placeholder="np. „Show me the pump.” / „Zoom into the hospital.”"
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
              <button type="button" className="gsc-fail-btn" onClick={handleTriggerFailure} disabled={Boolean(failureOutcome)}>
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
