import { useMemo, useState } from 'react';
import { CDE_ADAPTERS } from '../core/cde/adapters';
import { evaluateCandidate, rejectionReasons, type DomainAdapter, type CandidatePassport } from '../core/cde/passport';
import { measurementMarket } from '../core/cde/measurementMarket';
import { listFailures, recordFailure, wasTried, clearFailures, type FailureRecord } from '../core/cde/failureLibrary';
import { HonestyBadge } from './HonestyBadge';

/**
 * CDE — Candidate Discovery Engine (Milestone 3, reachable UI). Wybierasz
 * dziedzinę (adapter), ustawiasz kandydata (wektor parametrów) i dostajesz
 * PASZPORT: co policzył wykonywalny Graf Modeli, które kryteria spełnione,
 * czy zaakceptowany. Rynek Pomiarów mówi, który pomiar najbardziej zmieniłby
 * werdykt; Biblioteka Porażek pamięta ślepe zaułki. Nic tu nie „odkrywa" samo —
 * to realne obliczenia i jawne kryteria, bez ogłaszania odkryć.
 */

const OP_LABEL = (op: string, v: number, v2?: number, unit = '') =>
  op === 'gte' ? `≥ ${v} ${unit}` : op === 'lte' ? `≤ ${v} ${unit}` : `${v}–${v2 ?? '∞'} ${unit}`;

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (v !== 0 && (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3)) return v.toExponential(2);
  return Number.isInteger(v) ? String(v) : v.toFixed(3);
}

export function CandidateDiscoveryScreen() {
  const [adapterId, setAdapterId] = useState(CDE_ADAPTERS[0].id);
  const adapter = useMemo<DomainAdapter>(() => CDE_ADAPTERS.find((a) => a.id === adapterId)!, [adapterId]);
  // Świeży graf tylko do etykiet/jednostek i wartości startowych parametrów.
  const graph = useMemo(() => adapter.buildGraph(), [adapter]);
  const [params, setParams] = useState<Record<string, number>>(() => graph.getParameterSnapshot());
  const [failures, setFailures] = useState<FailureRecord[]>(() => listFailures(adapter.id));

  // Reset parametrów + porażek przy zmianie adaptera.
  const [lastAdapter, setLastAdapter] = useState(adapterId);
  if (lastAdapter !== adapterId) {
    setLastAdapter(adapterId);
    setParams(graph.getParameterSnapshot());
    setFailures(listFailures(adapter.id));
  }

  const passport: CandidatePassport = evaluateCandidate(adapter, { params });
  const market = useMemo(() => measurementMarket(adapter, params), [adapter, params]);
  const tried = wasTried(adapter.id, params);

  const labelOf = (id: string) => graph.getNode(id)?.label ?? id;
  const unitOf = (id: string) => graph.getNode(id)?.unit ?? '';

  function setParam(id: string, value: number) {
    setParams((p) => ({ ...p, [id]: value }));
  }
  function saveFailure() {
    recordFailure(passport);
    setFailures(listFailures(adapter.id));
  }
  function clearLib() {
    clearFailures(adapter.id);
    setFailures([]);
  }

  const maxInfluence = market.length > 0 ? Math.max(...market.map((m) => m.influence)) || 1 : 1;

  return (
    <main className="settings-view cde-view" id="main-content" tabIndex={-1}>
      <section className="settings-section">
        <h2>Silnik odkryć (CDE)</h2>
        <p className="settings-hint">
          Wybierz dziedzinę, ustaw kandydata i sprawdź, czy spełnia jawne kryteria — liczone przez wykonywalny Graf
          Modeli. CDE nie ogłasza „odkryć": mówi tylko „spełnia kryteria w ramach ważności modelu".
        </p>
        <div className="account-tabs" role="tablist">
          {CDE_ADAPTERS.map((a) => (
            <button
              key={a.id}
              role="tab"
              aria-selected={a.id === adapterId}
              className={`account-tab${a.id === adapterId ? ' active' : ''}`}
              onClick={() => setAdapterId(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
        <HonestyBadge level={adapter.honesty} note={adapter.honestyNote} />
        <p className="settings-hint">{adapter.description}</p>
      </section>

      <section className="settings-section">
        <h2>Kryteria akceptacji</h2>
        <div className="cde-criteria">
          {adapter.criteria.map((c) => (
            <div className="cde-criterion" key={c.outputId}>
              <span>{c.label}</span>
              <span className="cde-crit-bound">{OP_LABEL(c.op, c.value, c.value2, c.unit)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2>Kandydat — parametry</h2>
        {adapter.params.map((p) => (
          <div className="control" key={p.id}>
            <label htmlFor={`cde-${p.id}`}>
              {labelOf(p.id)} — {p.format ? p.format(params[p.id] ?? 0) : fmt(params[p.id] ?? 0)} {unitOf(p.id)}
            </label>
            <input
              id={`cde-${p.id}`}
              type="range"
              min={p.min}
              max={p.max}
              step={p.step}
              value={params[p.id] ?? p.min}
              onChange={(e) => setParam(p.id, Number(e.target.value))}
            />
          </div>
        ))}
        {tried && (
          <div className="cde-tried" role="status">
            ⚠ Ten dokładny wektor już był w Bibliotece Porażek: {tried.reasons.join('; ')}
          </div>
        )}
      </section>

      <section className="settings-section">
        <h2>Paszport kandydata</h2>
        <div className={`cde-verdict ${passport.accepted ? 'accepted' : 'rejected'}`} role="status">
          {passport.accepted ? '✓ SPEŁNIA KRYTERIA' : '✕ NIE SPEŁNIA KRYTERIÓW'}
          <span className="cde-verdict-note">
            {passport.accepted
              ? ' — w ramach ważności modelu (to warunek konieczny, nie ogłoszenie odkrycia).'
              : ' — patrz powody poniżej.'}
          </span>
        </div>
        <div className="cde-results">
          {passport.results.map((r) => (
            <div className={`cde-result ${r.passed ? 'pass' : 'fail'}`} key={r.criterion.outputId}>
              <span className="cde-result-icon" aria-hidden="true">{r.passed ? '✓' : '✕'}</span>
              <span className="cde-result-label">{r.criterion.label}</span>
              <span className="cde-result-actual">{fmt(r.actual)} {r.criterion.unit}</span>
              <span className="cde-result-bound">wymóg {OP_LABEL(r.criterion.op, r.criterion.value, r.criterion.value2, r.criterion.unit)}</span>
            </div>
          ))}
        </div>
        {passport.domainViolation && (
          <div className="domain-violation" role="alert">
            <strong>⚠ Poza dziedziną ważności modelu.</strong> {passport.domainViolation}
          </div>
        )}
        {!passport.accepted && (
          <div className="cde-reasons">
            <div className="section-label">Dlaczego odpadł</div>
            {rejectionReasons(passport).map((r, i) => <div key={i} className="cde-reason">• {r}</div>)}
            <button className="chip-btn" onClick={saveFailure} disabled={Boolean(tried)}>
              {tried ? 'Już w Bibliotece Porażek' : '📕 Zapisz do Biblioteki Porażek'}
            </button>
          </div>
        )}
      </section>

      <section className="settings-section">
        <h2>Rynek Pomiarów</h2>
        <p className="settings-hint">
          Który pomiar najbardziej zmieniłby werdykt? Ranking lokalnej wrażliwości kryteriów na każdy parametr —
          im wyższy udział, tym bardziej precyzja tego pomiaru „kupuje" pewność. To ranking z grafu, nie wyrocznia.
        </p>
        <div className="cde-market">
          {market.map((m) => (
            <div className="cde-listing" key={m.parameterId}>
              <span className="cde-listing-name">{labelOf(m.parameterId)}</span>
              <span className="contrib-bar" aria-hidden="true">
                <span className="contrib-fill" style={{ width: `${Math.round((m.influence / maxInfluence) * 100)}%` }} />
              </span>
              <span className="cde-listing-share">{(m.share * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2>Biblioteka Porażek · {failures.length}</h2>
        {failures.length === 0 ? (
          <p className="settings-hint">Brak zapisanych ślepych zaułków dla tej dziedziny.</p>
        ) : (
          <>
            <div className="cde-failures">
              {failures.slice().reverse().map((f) => (
                <div className="cde-failure" key={f.signature}>
                  <span className="cde-failure-label">{f.label}</span>
                  <span className="cde-failure-reasons">{f.reasons.join('; ')}</span>
                </div>
              ))}
            </div>
            <button className="chip-btn danger" onClick={clearLib}>Wyczyść Bibliotekę Porażek</button>
          </>
        )}
      </section>
    </main>
  );
}
