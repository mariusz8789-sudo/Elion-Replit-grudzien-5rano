import { causalChainOf, type InspectableEvent } from '../../core/lookingGlass/eventInspection';
import { scalarDeltasOf, type WorldModelMoment } from '../../core/lookingGlass/worldModelMoment';

/**
 * LOOKING GLASS — INTERROGATING AN EVENT IN THE WORLD.
 *
 * Answers the questions §2 asks — what happened, when, where, from which
 * state, which model, what evidence, can it be replayed — and answers them
 * with nulls where the model genuinely has nothing to say.
 *
 * That last part is the whole design. It would be trivial to print a
 * confident "Street sector A" for an event that carries no coordinates, and
 * it would survive a demo, because nobody checks a plausible-looking street
 * name. Printing "nie zamodelowane dla tego zdarzenia" instead is the entire
 * difference between an experience layer over a model and a convincing
 * fiction wearing one.
 *
 * The world stays visible behind this: it is a panel over a world, not a
 * screen that replaces one.
 */

const KIND_LABEL: Readonly<Record<string, string>> = {
  STATE_CHANGE: 'ZMIANA STANU',
  THRESHOLD_CROSSING: 'PRZEKROCZENIE PROGU',
  OBSERVATION: 'OBSERWACJA',
  INTERVENTION: 'INTERWENCJA',
  FAILURE: 'NIEPOWODZENIE',
  ANOMALY: 'ANOMALIA',
  TRANSITION: 'PRZEJŚCIE',
  ALERT: 'ALERT',
  UNCLASSIFIED: 'NIESKLASYFIKOWANE',
};

interface Props {
  readonly event: InspectableEvent;
  readonly allEvents: readonly InspectableEvent[];
  readonly unit: string;
  readonly onClose: () => void;
  readonly onReplay: () => void;
  /**
   * Real before/after/why for this event's tick, from a live C3
   * `TemporalEngine` (`session.describeEntityMoment`, `worldModelMoment.ts`).
   * Undefined/null for every domain with no such engine behind it — the
   * block below simply does not render, rather than approximating a moment
   * from `event.affectedEntities` alone.
   */
  readonly moment?: WorldModelMoment | null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="lg-insp-row">
      <span className="lg-insp-label">{label}</span>
      <span className="lg-insp-value">{children}</span>
    </div>
  );
}

/** Renders a value the model does not provide as an explicit absence. */
function NotModelled({ what }: { what: string }): JSX.Element {
  return <span className="lg-insp-absent">nie zamodelowane {what}</span>;
}

export function EventInspector({ event, allEvents, unit, onClose, onReplay, moment }: Props): JSX.Element {
  const chain = causalChainOf(event.id, allEvents);
  const deltas = moment ? scalarDeltasOf(moment) : [];

  return (
    <div className="lg-insp" role="dialog" aria-label="Inspekcja zdarzenia">
      <div className="lg-insp-head">
        <span className={`lg-insp-kind lg-insp-kind-${event.semanticKind.toLowerCase()}`}>
          {KIND_LABEL[event.semanticKind] ?? event.semanticKind}
        </span>
        <code className="lg-insp-type">{event.type}</code>
        <button type="button" className="lg-insp-close" onClick={onClose} aria-label="Zamknij inspekcję">×</button>
      </div>

      <Row label="czas">
        {unit} {event.time.tick}
        {!event.time.onViewerClock && (
          <span className="lg-insp-warn"> — z innego przebiegu niż oglądana seria</span>
        )}
      </Row>

      <Row label="miejsce">
        {event.location
          ? `x ${event.location.x.toFixed(1)} · y ${event.location.y.toFixed(1)}${event.location.z !== undefined ? ` · z ${event.location.z.toFixed(1)}` : ''}`
          : <NotModelled what="dla tego zdarzenia" />}
      </Row>

      <Row label="dotkliwość">
        {event.severity !== null ? event.severity.toFixed(2) : <NotModelled what="— model nie stopniuje tego zdarzenia" />}
      </Row>

      <Row label="przyczyna">{event.cause ?? <NotModelled what="— brak zapisanej przyczyny" />}</Row>

      <Row label="stan świata">
        {event.stateIndex !== null ? `stan #${event.stateIndex}` : <NotModelled what="— zdarzenie nie mapuje się na stan" />}
      </Row>

      {/* Właściwości bytów DOTKNIĘTYCH tym zdarzeniem — realne wartości z
          modelu (fractionOfCapacity, bedOccupancy, ...), nie tylko id bytu.
          To jest odpowiedź na „co się zmieniło", nie tylko „że coś się zmieniło". */}
      {event.affectedEntities.length > 0 && (
        <div className="lg-insp-block">
          <span className="lg-insp-label">dotknięte byty</span>
          {event.affectedEntities.map((entity) => (
            <div key={`${entity.ref.kind}:${entity.ref.id}`} className="lg-insp-entity">
              <span className="lg-insp-entity-label">{entity.label}</span>
              <span className="lg-insp-entity-props">
                {entity.properties.map((property) => (
                  <span key={property.key} className="lg-insp-prop">
                    {property.key}={typeof property.value === 'number' ? property.value.toFixed(2) : String(property.value)}
                    {property.unit ? ` ${property.unit}` : ''}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* PRZED / PO / DLACZEGO — realne, dwa prawdziwe odczyty z żywego C3
          TemporalEngine (describeWorldMoment wywołane przy tym i poprzednim
          ticku), nie jedna migawka. Pojawia się tylko tam, gdzie taki silnik
          faktycznie stoi za tą domeną (patrz session.describeEntityMoment). */}
      {moment && deltas.length > 0 && (
        <div className="lg-insp-block">
          <span className="lg-insp-label">przed / po</span>
          {deltas.map((delta) => (
            <div key={delta.key} className="lg-insp-delta">
              <span className="lg-insp-delta-key">{delta.key}</span>
              <span className="lg-insp-delta-values">
                {delta.before.toFixed(4)} → {delta.after.toFixed(4)}
                <span className={delta.absoluteDelta < 0 ? 'is-down' : 'is-up'}>
                  {' '}({delta.absoluteDelta > 0 ? '+' : ''}{delta.absoluteDelta.toFixed(4)})
                </span>
              </span>
            </div>
          ))}
          {moment.why && <p className="lg-insp-obs">dlaczego: {moment.why}</p>}
        </div>
      )}

      {/* Hipotezy, których dotyczy ten przebieg — realne powiązanie
          epistemiczne (SUPPORTED/FALSIFIED/...) z traceWorldChange, nigdy
          wywnioskowane z treści zdarzenia. */}
      {event.relatedHypothesisIds.length > 0 && (
        <Row label="hipotezy">
          <span className="lg-insp-hyp-ids">{event.relatedHypothesisIds.join(', ')}</span>
        </Row>
      )}

      <Row label="model">
        <code>{event.modelId ?? 'nieznany'}</code>
        {event.origin ? <span className="lg-insp-origin"> · {event.origin}</span> : null}
      </Row>

      {event.observations.length > 0 && (
        <div className="lg-insp-block">
          <span className="lg-insp-label">obserwacje</span>
          {event.observations.map((observation) => (
            <p key={observation.id} className="lg-insp-obs">{observation.statement}</p>
          ))}
        </div>
      )}

      <div className="lg-insp-block">
        <span className="lg-insp-label">dowód</span>
        {event.evidence ? (
          <p className="lg-insp-obs">
            <code>{event.evidence.id}</code>
            {event.evidence.replayStatus && (
              <span className={`lg-insp-replaybadge is-${event.evidence.replayStatus.toLowerCase()}`}>
                {event.evidence.replayStatus}
              </span>
            )}
          </p>
        ) : <NotModelled what="— brak powiązanego dowodu" />}
      </div>

      {chain.length > 1 && (
        <div className="lg-insp-block">
          <span className="lg-insp-label">łańcuch przyczynowy ({chain.length})</span>
          {/* Recorded by the models via parentEventId — reported, not inferred. */}
          <ol className="lg-insp-chain">
            {chain.map((link) => (
              <li key={link.id} className={link.id === event.id ? 'is-current' : ''}>
                <code>{link.type}</code> <span>{unit} {link.time.tick}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="lg-insp-actions">
        {event.replay.available ? (
          <>
            <button type="button" className="lg-insp-replay" onClick={onReplay}>↻ Odtwórz ten moment</button>
            {event.replay.seed !== null && <span className="lg-insp-seed">ziarno {String(event.replay.seed)}</span>}
          </>
        ) : (
          // A replay button that silently produced different numbers would be
          // worse than none, so an unverified run says why instead.
          <span className="lg-insp-noreplay">Odtworzenie niedostępne — {event.replay.reason}</span>
        )}
      </div>
    </div>
  );
}
