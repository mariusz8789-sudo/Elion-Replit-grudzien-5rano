import { useEffect, useMemo, useState } from 'react';
import { runDomeWorldChallenge } from '../core/agent/domeWorld/domeChallenge';
import { DEFAULT_DOME_PARAMETERS } from '../core/agent/domeWorld/domeModel';
import { track } from '../core/analytics';

/**
 * DOME WORLD — the falsification already built in `core/agent/domeWorld/`,
 * finally visible.
 *
 * This screen computes NOTHING of its own. `runDomeWorldChallenge` states what
 * a flat-disk-plus-local-sun-plus-dome model predicts, and judges it against
 * cited historical measurements through the SAME REFERENCE verification
 * pipeline the Real Experiment Contract uses for manually entered citations
 * (`createReferenceMeasurementRun` + `verifyPredictionAgainstRealExperiment`).
 * No verdict is produced here, no tolerance is invented here: the tolerance on
 * each criterion is the citation's OWN declared uncertainty.
 *
 * The sun-height control exists to make one specific point checkable rather
 * than asserted: the reader can sweep the dome model's single free parameter
 * across its whole plausible range and watch both cases stay FALSIFIED. A
 * model that cannot be rescued by any value of its own free parameter has been
 * falsified by the data, not by the app's opinion of it.
 */
export function DomeWorldScreen() {
  const [sunHeightKm, setSunHeightKm] = useState(DEFAULT_DOME_PARAMETERS.sunHeightKm);

  useEffect(() => {
    track('dome_world_viewed');
  }, []);

  const result = useMemo(
    () => runDomeWorldChallenge({ ...DEFAULT_DOME_PARAMETERS, sunHeightKm }),
    [sunHeightKm],
  );

  /**
   * Swept over the control's full range, not sampled at a few flattering
   * points — this is the claim the control is there to let the reader check.
   */
  const sweep = useMemo(() => {
    const heights = [500, 1000, 2000, 3000, 5000, 8000, 12000, 20000, 50000];
    return heights.map((h) => {
      const run = runDomeWorldChallenge({ ...DEFAULT_DOME_PARAMETERS, sunHeightKm: h });
      return {
        sunHeightKm: h,
        allFalsified: run.cases.every((c) => c.verification.assessment === 'FALSIFIED_WITHIN_PROTOCOL'),
      };
    });
  }, []);

  const everySweepFalsified = sweep.every((s) => s.allFalsified);

  return (
    <main className="glossary-view" id="main-content" tabIndex={-1}>
      <div className="settings-section">
        <p className="footer-note">
          Model płaskiego dysku z lokalnym słońcem i kopułą wylicza własne przewidywania, które
          są następnie sądzone przeciw <strong>cytowanym pomiarom historycznym</strong> — tym
          samym mechanizmem REFERENCE, którego Genesis używa dla ręcznie wprowadzonych danych
          laboratoryjnych. Tolerancja każdego kryterium to <strong>własna niepewność cytowania</strong>,
          nie liczba dobrana tutaj.
        </p>
      </div>

      <div className="settings-section">
        <label htmlFor="dome-sun-height">
          Wysokość słońca w modelu kopuły: <strong>{sunHeightKm.toLocaleString('pl')} km</strong>
        </label>
        <input
          id="dome-sun-height"
          type="range"
          min={500}
          max={50000}
          step={500}
          value={sunHeightKm}
          onChange={(e) => setSunHeightKm(Number(e.target.value))}
          aria-label="Wysokość słońca w modelu kopuły"
        />
        <p className="footer-note">
          To jedyny wolny parametr tego modelu. Przesuń go po całym zakresie — obie sprawy
          pozostają sfalsyfikowane.
        </p>
      </div>

      {result.cases.map((c) => {
        const falsified = c.verification.assessment === 'FALSIFIED_WITHIN_PROTOCOL';
        return (
          <div className="settings-section" key={c.caseId}>
            <h2>{c.observableMetric}</h2>
            <p>
              <strong>Model kopuły przewiduje:</strong>{' '}
              {c.predictedValue.toFixed(2)} {c.unit}
            </p>
            <p>
              <strong>Cytowany pomiar:</strong> {c.citation.measuredValue} ± {c.citation.uncertainty}{' '}
              {c.citation.unit}
            </p>
            <p className="footer-note">{c.citation.citationText}</p>
            <p className="footer-note">
              <em>Źródło:</em> {c.citation.sourceRef}
            </p>
            <p>
              <strong>Kryterium (prerejestrowane):</strong>{' '}
              {c.verification.criterion.relation}, tolerancja {c.verification.criterion.tolerance}
            </p>
            <p>
              <strong>Werdykt:</strong>{' '}
              <span className={falsified ? 'badge badge-falsified' : 'badge'}>
                {c.verification.assessment}
              </span>
            </p>
            {/* `outcome` is null when the relation was not applicable to this
                comparison at all — reported as such rather than rendered as an
                empty line that would read like a silent pass. */}
            <p className="footer-note">
              {c.verification.outcome === null
                ? 'Relacja nie była stosowalna do tego porównania — brak rozstrzygnięcia liczbowego.'
                : c.verification.outcome.explanation}
            </p>
          </div>
        );
      })}

      <div className="settings-section">
        <h2>Przemiatanie całego zakresu parametru</h2>
        <p className="footer-note">
          Każda wysokość słońca policzona osobnym, pełnym przebiegiem — bez interpolacji.
        </p>
        <ul>
          {sweep.map((s) => (
            <li key={s.sunHeightKm}>
              {s.sunHeightKm.toLocaleString('pl')} km —{' '}
              {s.allFalsified ? 'obie sprawy FALSIFIED_WITHIN_PROTOCOL' : 'nie wszystkie sfalsyfikowane'}
            </li>
          ))}
        </ul>
        <p>
          {everySweepFalsified
            ? 'Żadna wartość wolnego parametru nie ratuje modelu w żadnej z badanych spraw.'
            : 'Co najmniej jedna wartość parametru nie prowadzi do falsyfikacji — patrz lista wyżej.'}
        </p>
      </div>

      <div className="settings-section">
        <p className="footer-note">
          Genesis nie twierdzi tu niczego ponad to, co pokazuje porównanie: model kopuły nie
          odtwarza dwóch konkretnych, cytowanych obserwacji w granicach ich własnych
          niepewności. To jest falsyfikacja w ramach zadeklarowanego protokołu, nie dowód
          globalny ani opinia aplikacji.
        </p>
      </div>
    </main>
  );
}

export default DomeWorldScreen;
