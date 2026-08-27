/**
 * Earthquake demonstrator UI — compact City3D right-rail control.
 * It only forwards a gate-approved, SCENARIO-only overlay to the one renderer;
 * no epidemic parameter, WorldState, route or Scientific Core mutation occurs here.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { LocalHazardProvenanceStore } from '../../core/hazard/hazardProvenanceStore';
import { storageAvailable } from '../../core/storage';
import { getHazardModule } from '../../core/hazard/hazardModuleRegistry';
import { consumePendingHazardScenario } from '../../core/experimentFabric/hazardScenarioHandoff';
import type { EarthquakeCityOverlayProjection } from '../../core/simulationRenderer/earthquakeCoordinateMapping';
import {
  getEarthquakeEvidenceExportFilename,
  serializeEarthquakeEvidenceExport,
} from '../../core/simulationRenderer/earthquakeEvidenceExport';
import {
  executeEarthquakeCommandCenterScenario,
  type EarthquakeCommandCenterExecution,
} from '../../core/simulationRenderer/earthquakeCommandCenter';
import {
  listEarthquakePersistedRunHistory,
  type EarthquakePersistedRunHistoryEntry,
} from '../../core/simulationRenderer/earthquakePersistedRunHistory';

interface EarthquakeScenarioPanelProps {
  readonly onOverlayChange: (overlay: EarthquakeCityOverlayProjection | null) => void;
}

const SYNTHETIC_PRESET = Object.freeze({ magnitude: 5.4, depthKm: 12, epicenter: { x: 0, y: 0 }, seed: 42 });

type SyntheticEarthquakeParameters = {
  magnitude: number;
  depthKm: number;
  epicenterX: number;
  epicenterY: number;
  seed: number;
};

function shorten(value: string, visible = 12): string {
  return value.length <= visible * 2 + 1 ? value : `${value.slice(0, visible)}…${value.slice(-visible)}`;
}

export function EarthquakeScenarioPanel({ onOverlayChange }: EarthquakeScenarioPanelProps) {
  const [execution, setExecution] = useState<EarthquakeCommandCenterExecution | null>(null);
  const [parameters, setParameters] = useState<SyntheticEarthquakeParameters>({
    magnitude: SYNTHETIC_PRESET.magnitude,
    depthKm: SYNTHETIC_PRESET.depthKm,
    epicenterX: SYNTHETIC_PRESET.epicenter.x,
    epicenterY: SYNTHETIC_PRESET.epicenter.y,
    seed: SYNTHETIC_PRESET.seed,
  });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlayDisplayed, setOverlayDisplayed] = useState(false);
  const [history, setHistory] = useState<readonly EarthquakePersistedRunHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const runSequence = useRef(0);
  const provenanceStore = useMemo(() => new LocalHazardProvenanceStore(), []);
  // SSR cannot probe browser storage. In a browser, distinguish unavailable
  // durability from a genuinely empty retained Earthquake run history.
  const localPersistenceAvailable = typeof window === 'undefined' ? null : storageAvailable();
  // Fast Refresh may preserve a result created before registry provenance was added.
  // The live registry fallback keeps its read-only traceability display safe until rerun.
  const moduleDescriptor = execution?.moduleDescriptor ?? getHazardModule('earthquake');

  const updateParameter = (parameter: keyof SyntheticEarthquakeParameters, value: number) => {
    setParameters((current) => ({ ...current, [parameter]: value }));
  };

  const refreshHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await listEarthquakePersistedRunHistory(provenanceStore));
    } catch (cause) {
      setHistoryError(
        cause instanceof Error ? cause.message : 'Nie udało się odczytać lokalnej historii provenance.',
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    void refreshHistory();
  }, []);

  // Consumes a Science-Chat-confirmed scenario handed off via #/city3d exactly once on
  // mount. Reuses runScenario() unchanged — no second execution path, no re-derivation
  // of the immutable-store scenario-label uniqueness the manual button relies on.
  useEffect(() => {
    const pending = consumePendingHazardScenario();
    if (!pending) return;
    const nextParameters: SyntheticEarthquakeParameters = {
      magnitude: pending.magnitude,
      depthKm: pending.depthKm,
      epicenterX: pending.epicenterX,
      epicenterY: pending.epicenterY,
      seed: pending.seed,
    };
    setParameters(nextParameters);
    void runScenario(nextParameters);
  }, []);

  const runScenario = async (override?: SyntheticEarthquakeParameters) => {
    setRunning(true);
    setError(null);
    try {
      runSequence.current += 1;
      const effective = override ?? parameters;
      const outcome = await executeEarthquakeCommandCenterScenario(
        {
          magnitude: effective.magnitude,
          depthKm: effective.depthKm,
          epicenter: { x: effective.epicenterX, y: effective.epicenterY },
          seed: effective.seed,
          // Provenance labels must remain unique because the local hazard store is immutable.
          scenarioLabel: `city3d-synthetic-${Date.now()}-${runSequence.current}`,
        },
        { store: provenanceStore },
      );
      setExecution(outcome);
      onOverlayChange(outcome.overlay);
      setOverlayDisplayed(outcome.status === 'READY' && outcome.overlay !== null);
      if (outcome.status === 'BLOCKED') setError(`${outcome.blockCode}: ${outcome.blockReason}`);
      await refreshHistory();
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

  const exportEvidence = () => {
    if (!execution) return;
    const blob = new Blob([serializeEarthquakeEvidenceExport(execution)], {
      type: 'application/json;charset=utf-8',
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = getEarthquakeEvidenceExportFilename(execution);
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <section className="world-panel earthquake-scenario-panel" aria-label="Scenariusz trzęsienia ziemi">
      <div className="world-panel-heading earthquake-panel-heading">
        <span>TRZĘSIENIE ZIEMI</span>
        <small>read-only overlay</small>
      </div>
      <div className="earthquake-status-row">
        <b>SCENARIO</b>
        <b>SYNTHETIC</b>
        <b>NON_OPERATIONAL</b>
      </div>
      <p className="earthquake-intro">
        Parametry są wyłącznie syntetycznym wejściem istniejącego kontraktu scenariusza; nie są kalibracją ani
        obserwacją.
      </p>
      <fieldset className="earthquake-parameter-grid" disabled={running}>
        <legend>Synthetic scenario parameters</legend>
        <label>
          Magnitude
          <input
            aria-label="Synthetic magnitude"
            type="number"
            step="0.1"
            value={parameters.magnitude}
            onChange={(event) => updateParameter('magnitude', event.currentTarget.valueAsNumber)}
          />
        </label>
        <label>
          Depth km
          <input
            aria-label="Synthetic depth km"
            type="number"
            step="0.1"
            value={parameters.depthKm}
            onChange={(event) => updateParameter('depthKm', event.currentTarget.valueAsNumber)}
          />
        </label>
        <label>
          Fixture X
          <input
            aria-label="Synthetic fixture X"
            type="number"
            step="0.1"
            value={parameters.epicenterX}
            onChange={(event) => updateParameter('epicenterX', event.currentTarget.valueAsNumber)}
          />
        </label>
        <label>
          Fixture Y
          <input
            aria-label="Synthetic fixture Y"
            type="number"
            step="0.1"
            value={parameters.epicenterY}
            onChange={(event) => updateParameter('epicenterY', event.currentTarget.valueAsNumber)}
          />
        </label>
        <label>
          Seed
          <input
            aria-label="Synthetic seed"
            type="number"
            step="1"
            value={parameters.seed}
            onChange={(event) => updateParameter('seed', event.currentTarget.valueAsNumber)}
          />
        </label>
      </fieldset>
      <div className="earthquake-actions">
        <button className="world-action accent" onClick={() => { void runScenario(); }} disabled={running}>
          {running ? 'Obliczanie…' : 'Uruchom scenariusz'}
        </button>
        <button className="world-action" onClick={clearOverlay} disabled={!overlayDisplayed}>
          Wyczyść overlay
        </button>
        <button className="world-action" onClick={exportEvidence} disabled={!execution}>
          Eksportuj evidence
        </button>
      </div>
      <details className="earthquake-history-details">
        <summary>Local persisted runs ({history.length})</summary>
        <p>Read-only canonical replay history. It never remaps, restores or changes the City3D overlay.</p>
        <button
          className="world-action"
          onClick={() => {
            void refreshHistory();
          }}
          disabled={historyLoading}
        >
          {historyLoading ? 'Odczyt…' : 'Odśwież replay'}
        </button>
        {historyError && (
          <p className="earthquake-error" role="alert">
            HISTORIA: {historyError}
          </p>
        )}
        {localPersistenceAvailable === false && (
          <p className="hospital-panel-note earthquake-history-unavailable" role="status" aria-live="polite" aria-atomic="true">
            <strong>LOCAL_PERSISTENCE_UNAVAILABLE:</strong> Przeglądarka nie udostępnia trwałego local storage. Ten widok nie może potwierdzić zapisanej historii Earthquake HazardRun.
          </p>
        )}
        {history.length === 0 && !historyLoading && localPersistenceAvailable !== false && (
          <p className="earthquake-history-empty">Brak lokalnie zapisanych Earthquake HazardRun.</p>
        )}
        {history.length > 0 && (
          <ul className="earthquake-history-list">
            {history.map((entry) => (
              <li key={entry.hazardRunId}>
                <div>
                  <b title={entry.hazardRunId}>{shorten(entry.hazardRunId, 9)}</b>
                  <span className={`earthquake-history-verdict ${entry.replay.status.toLowerCase()}`}>
                    {entry.replay.status}
                  </span>
                </div>
                <small>
                  {new Date(entry.createdAt).toISOString()} ·{' '}
                  {entry.replay.differences.length === 0
                    ? 'no differences'
                    : `${entry.replay.differences.length} difference(s)`}
                </small>
              </li>
            ))}
          </ul>
        )}
      </details>
      {error && (
        <p className="earthquake-error" role="alert">
          BLOKADA: {error}
        </p>
      )}
      {execution?.status === 'BLOCKED' && (
        <div className="earthquake-proof" role="status" aria-live="polite" aria-atomic="true">
          <div className="earthquake-verdict blocked">
            <b>ENVELOPE BLOCKED</b>
            <span>
              {execution.blockCode} · {execution.blockReason}
            </span>
          </div>
          <dl className="earthquake-proof-grid">
            <div>
              <dt>replay</dt>
              <dd>{execution.envelope.replay?.status ?? 'NOT_RUN'}</dd>
            </div>
            <div>
              <dt>overlay</dt>
              <dd>NOT_RENDERED</dd>
            </div>
            <div>
              <dt>status</dt>
              <dd>SCENARIO ONLY</dd>
            </div>
          </dl>
          <details className="earthquake-not-modeled-details">
            <summary>NOT_MODELED ({execution.envelope.notModeled.length})</summary>
            <ul>
              {execution.envelope.notModeled.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
      {execution?.status === 'READY' && (
        <div className="earthquake-proof" role="status" aria-live="polite" aria-atomic="true">
          <div
            className={`earthquake-verdict ${execution.overlayGate.enabled ? (overlayDisplayed ? 'approved' : 'cleared') : 'blocked'}`}
          >
            <b>
              {execution.overlayGate.enabled
                ? overlayDisplayed
                  ? 'OVERLAY ACTIVE'
                  : 'OVERLAY CLEARED'
                : 'OVERLAY BLOCKED'}
            </b>
            <span>
              {execution.overlayGate.enabled
                ? overlayDisplayed
                  ? 'Gated display projection only'
                  : 'Evidence and replay retained; display projection cleared.'
                : execution.overlayGate.reasons.join(' · ')}
            </span>
          </div>
          <dl className="earthquake-proof-grid">
            <div>
              <dt>replay</dt>
              <dd>{execution.replay.status}</dd>
            </div>
            <div>
              <dt>evidence</dt>
              <dd>
                {execution.evidence.missingFields.length === 0
                  ? 'COMPLETE'
                  : `MISSING ${execution.evidence.missingFields.length}`}
              </dd>
            </div>
            <div>
              <dt>sites</dt>
              <dd>{execution.overlay?.sites.length ?? 0} mapped</dd>
            </div>
          </dl>
          <details className="earthquake-evidence-details">
            <summary>Evidence · replay · mapping</summary>
            <dl className="earthquake-long-values">
              <div>
                <dt>HazardRun</dt>
                <dd title={execution.scenario.run.hazardRunId}>
                  {shorten(execution.scenario.run.hazardRunId)}
                </dd>
              </div>
              <div>
                <dt>Evidence SHA-256</dt>
                <dd title={execution.evidence.sha256}>{shorten(execution.evidence.sha256)}</dd>
              </div>
              <div>
                <dt>Mapping</dt>
                <dd title={execution.overlay?.mappingFingerprint ?? ''}>
                  {execution.overlay?.mappingId} · {shorten(execution.overlay?.mappingFingerprint ?? '')}
                </dd>
              </div>
              <div>
                <dt>Projection</dt>
                <dd>
                  {execution.projection.schemaVersion} · {execution.overlay?.datasetStatus ?? 'BLOCKED'}
                </dd>
              </div>
              <div>
                <dt>Registry module</dt>
                <dd>
                  {moduleDescriptor.hazardType} · v{moduleDescriptor.moduleVersion} · schema{' '}
                  {moduleDescriptor.projectionSchemaVersion}
                </dd>
              </div>
              <div>
                <dt>Declared capabilities</dt>
                <dd>{moduleDescriptor.supportedCapabilities.join(' · ')}</dd>
              </div>
            </dl>
          </details>
          <details className="earthquake-impact-details">
            <summary>Model-derived impacts ({execution.mapping.sites.length})</summary>
            <p>
              Read-only synthetic ground-shaking values from the completed ImpactResult. Display anchors are
              not real facilities and values do not represent building damage.
            </p>
            <div className="earthquake-impact-table-wrap">
              <table className="earthquake-impact-table">
                <thead>
                  <tr>
                    <th>Fixture site</th>
                    <th>Display anchor</th>
                    <th>Severity</th>
                    <th>Intensity (g)</th>
                    <th>Uncertainty (g)</th>
                  </tr>
                </thead>
                <tbody>
                  {execution.mapping.sites.map((site) => (
                    <tr key={site.overlayId}>
                      <td>{site.sourceSiteId}</td>
                      <td>{site.targetCityWorldLocationId}</td>
                      <td>{site.severity}</td>
                      <td>{site.severityValue.toFixed(3)}</td>
                      <td>
                        {site.uncertaintyLow.toFixed(3)}–{site.uncertaintyHigh.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details className="earthquake-impact-details">
            <summary>Damage assessment ({execution.scenario.damageAssessments.length})</summary>
            <p>
              Każda ocena jest jawnie oznaczona jako <strong>NOT_MODELED</strong>. Istniejący model dostarcza
              syntetyczny ground-shaking ImpactResult, ale nie dostarcza podstaw do twierdzeń o uszkodzeniach
              konstrukcji, zawaleniach, ofiarach ani infrastrukturze.
            </p>
            <div className="earthquake-impact-table-wrap">
              <table className="earthquake-impact-table">
                <thead>
                  <tr>
                    <th>Fixture site</th>
                    <th>Status</th>
                    <th>Missing evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {execution.scenario.damageAssessments.map((assessment) => (
                    <tr key={assessment.damageAssessmentId}>
                      <td>{assessment.siteId}</td>
                      <td>{assessment.status}</td>
                      <td>{assessment.requiredData.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details className="earthquake-not-modeled-details">
            <summary>NOT_MODELED ({execution.projection.notModeled.length})</summary>
            <ul>
              {execution.projection.notModeled.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
      <p className="earthquake-caveat">
        Brak danych obserwowanych, GIS, kalibracji, prognozy, oceny ofiar lub szkód, ewakuacji i kaskad
        infrastruktury.
      </p>
    </section>
  );
}
