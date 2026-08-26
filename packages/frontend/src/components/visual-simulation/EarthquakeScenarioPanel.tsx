/**
 * Earthquake demonstrator UI — compact City3D right-rail control.
 * It only forwards a gate-approved, SCENARIO-only overlay to the one renderer;
 * no epidemic parameter, WorldState, route or Scientific Core mutation occurs here.
 */
import { useRef, useState } from 'react';
import { getHazardModule } from '../../core/hazard/hazardModuleRegistry';
import type { EarthquakeCityOverlayProjection } from '../../core/simulationRenderer/earthquakeCoordinateMapping';
import {
  executeEarthquakeCommandCenterScenario,
  type EarthquakeCommandCenterExecution,
} from '../../core/simulationRenderer/earthquakeCommandCenter';

interface EarthquakeScenarioPanelProps {
  readonly onOverlayChange: (overlay: EarthquakeCityOverlayProjection | null) => void;
}

const SYNTHETIC_PRESET = Object.freeze({ magnitude: 5.4, depthKm: 12, epicenter: { x: 0, y: 0 }, seed: 42 });

function shorten(value: string, visible = 12): string {
  return value.length <= visible * 2 + 1 ? value : `${value.slice(0, visible)}…${value.slice(-visible)}`;
}

export function EarthquakeScenarioPanel({ onOverlayChange }: EarthquakeScenarioPanelProps) {
  const [execution, setExecution] = useState<EarthquakeCommandCenterExecution | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlayDisplayed, setOverlayDisplayed] = useState(false);
  const runSequence = useRef(0);
  // Fast Refresh may preserve a result created before registry provenance was added.
  // The live registry fallback keeps its read-only traceability display safe until rerun.
  const moduleDescriptor = execution?.moduleDescriptor ?? getHazardModule('earthquake');

  const runScenario = async () => {
    setRunning(true);
    setError(null);
    try {
      runSequence.current += 1;
      const outcome = await executeEarthquakeCommandCenterScenario({
        ...SYNTHETIC_PRESET,
        // Provenance labels must remain unique because the local hazard store is immutable.
        scenarioLabel: `city3d-synthetic-${Date.now()}-${runSequence.current}`,
      });
      setExecution(outcome);
      onOverlayChange(outcome.overlay);
      setOverlayDisplayed(outcome.overlay !== null);
    } catch (cause) {
      onOverlayChange(null);
      setOverlayDisplayed(false);
      setError(cause instanceof Error ? cause.message : 'Nie udało się uruchomić syntetycznego scenariusza.');
    } finally {
      setRunning(false);
    }
  };

  const clearOverlay = () => {
    onOverlayChange(null);
    setOverlayDisplayed(false);
  };

  return (
    <section className="world-panel earthquake-scenario-panel" aria-label="Scenariusz trzęsienia ziemi">
      <div className="world-panel-heading earthquake-panel-heading">
        <span>TRZĘSIENIE ZIEMI</span><small>read-only overlay</small>
      </div>
      <div className="earthquake-status-row">
        <b>SCENARIO</b><b>SYNTHETIC</b><b>NON_OPERATIONAL</b>
      </div>
      <p className="earthquake-intro">
        Jeden jawny preset syntetyczny: M {SYNTHETIC_PRESET.magnitude} · głębokość {SYNTHETIC_PRESET.depthKm} km · lokalne współrzędne fixture · seed {SYNTHETIC_PRESET.seed}.
      </p>
      <div className="earthquake-actions">
        <button className="world-action accent" onClick={runScenario} disabled={running}>{running ? 'Obliczanie…' : 'Uruchom scenariusz'}</button>
        <button className="world-action" onClick={clearOverlay} disabled={!overlayDisplayed}>Wyczyść overlay</button>
      </div>
      {error && <p className="earthquake-error" role="alert">BLOKADA: {error}</p>}
      {execution && (
        <div className="earthquake-proof">
          <div className={`earthquake-verdict ${execution.overlayGate.enabled ? overlayDisplayed ? 'approved' : 'cleared' : 'blocked'}`}>
            <b>{execution.overlayGate.enabled ? overlayDisplayed ? 'OVERLAY ACTIVE' : 'OVERLAY CLEARED' : 'OVERLAY BLOCKED'}</b>
            <span>{execution.overlayGate.enabled ? overlayDisplayed ? 'Gated display projection only' : 'Evidence and replay retained; display projection cleared.' : execution.overlayGate.reasons.join(' · ')}</span>
          </div>
          <dl className="earthquake-proof-grid">
            <div><dt>replay</dt><dd>{execution.replay.status}</dd></div>
            <div><dt>evidence</dt><dd>{execution.evidence.missingFields.length === 0 ? 'COMPLETE' : `MISSING ${execution.evidence.missingFields.length}`}</dd></div>
            <div><dt>sites</dt><dd>{execution.overlay?.sites.length ?? 0} mapped</dd></div>
          </dl>
          <details className="earthquake-evidence-details">
            <summary>Evidence · replay · mapping</summary>
            <dl className="earthquake-long-values">
              <div><dt>HazardRun</dt><dd title={execution.scenario.run.hazardRunId}>{shorten(execution.scenario.run.hazardRunId)}</dd></div>
              <div><dt>Evidence SHA-256</dt><dd title={execution.evidence.sha256}>{shorten(execution.evidence.sha256)}</dd></div>
              <div><dt>Mapping</dt><dd title={execution.overlay?.mappingFingerprint ?? ''}>{execution.overlay?.mappingId} · {shorten(execution.overlay?.mappingFingerprint ?? '')}</dd></div>
              <div><dt>Projection</dt><dd>{execution.projection.schemaVersion} · {execution.overlay?.datasetStatus ?? 'BLOCKED'}</dd></div>
              <div><dt>Registry module</dt><dd>{moduleDescriptor.hazardType} · v{moduleDescriptor.moduleVersion} · schema {moduleDescriptor.projectionSchemaVersion}</dd></div>
              <div><dt>Declared capabilities</dt><dd>{moduleDescriptor.supportedCapabilities.join(' · ')}</dd></div>
            </dl>
          </details>
          <details className="earthquake-not-modeled-details">
            <summary>NOT_MODELED ({execution.projection.notModeled.length})</summary>
            <ul>{execution.projection.notModeled.map((item) => <li key={item}>{item}</li>)}</ul>
          </details>
        </div>
      )}
      <p className="earthquake-caveat">Brak danych obserwowanych, GIS, kalibracji, prognozy, oceny ofiar lub szkód, ewakuacji i kaskad infrastruktury.</p>
    </section>
  );
}
