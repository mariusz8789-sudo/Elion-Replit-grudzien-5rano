import type { StrategyRun } from '../core/agent/discoveryStrategy';

/**
 * ONE REPORT FOR ALL THREE AUTONOMOUS STRATEGIES.
 *
 * MECHANISM, PARAMETER and CALIBRATION all return the SAME `StrategyRun`
 * contract — that is the whole reason `discoveryStrategies.ts` exists. So they
 * get one renderer. A second screen with its own round table would be a second
 * opinion about what a run means, free to drift from this one, and the
 * contract's value is precisely that it does not need that.
 *
 * It renders and nothing else: no derivation, no aggregation, no verdict of its
 * own. Whatever a screen wants to say ABOUT a run (e.g. "did it recover the
 * hidden parameter?") stays in that screen, because that question needs
 * knowledge this component deliberately does not have.
 *
 * `openQuestions` and `limitations` are not optional extras here. They are what
 * the run could NOT settle, and a report that drops them turns a bounded result
 * into a claim.
 */
export function StrategyRunReport({ run, elapsedMs }: { run: StrategyRun; elapsedMs?: number }) {
  return (
    <>
      <section className="pilot-step" data-testid="strategy-summary">
        <h2>{run.question}</h2>
        <dl className="pilot-provenance">
          <div><dt>strategia</dt><dd className="mono">{run.strategyId}</dd></div>
          <div><dt>kształt pytania</dt><dd className="mono">{run.shape}</dd></div>
          <div><dt>domena</dt><dd className="mono">{run.domainId}</dd></div>
          <div><dt>rundy</dt><dd className="mono">{run.rounds.length}</dd></div>
          <div><dt>powód zatrzymania</dt><dd className="mono" data-testid="strategy-stop">{run.stopReason}</dd></div>
          {/* `origin: null` means the run MIXED origins — a real state the
              contract refuses to collapse to one word, so neither do we. */}
          <div><dt>pochodzenie danych</dt><dd className="mono">{run.dataProvenance.origin ?? `mieszane: ${run.dataProvenance.origins.join(', ')}`}</dd></div>
          <div><dt>odcisk wyniku</dt><dd className="mono">{run.resultFingerprint}</dd></div>
          {elapsedMs !== undefined && <div><dt>czas</dt><dd className="mono">{elapsedMs.toFixed(0)} ms</dd></div>}
        </dl>
        <p className="settings-hint">Skąd te liczby: {run.dataProvenance.derivedFrom} — {run.dataProvenance.why}</p>
      </section>

      <section className="pilot-step">
        <h3>Runda po rundzie — co zmierzył i dlaczego właśnie to</h3>
        {/* The loops record their reasoning in English. Rendering it verbatim
            keeps this a transcript; translating would swap the agent's actual
            record for a paraphrase. */}
        <p className="settings-hint">
          Kolumny „co zrobił" i „dlaczego to" są cytatem z pętli, dosłownie i po angielsku — nie tłumaczymy ich, żeby
          nie podmienić tego, co agent naprawdę zapisał, na własną parafrazę.
        </p>
        <div className="compare-table-wrap">
          <table className="compare-table" data-testid="strategy-rounds">
            <thead>
              <tr><th>runda</th><th>co zrobił</th><th>dlaczego to</th><th>odczyt</th><th>odniesienie</th><th>werdykty hipotez</th></tr>
            </thead>
            <tbody>
              {run.rounds.map((round) => (
                <tr key={round.round} data-testid={`strategy-round-${round.round}`}>
                  <td className="mono">{round.round}</td>
                  <td>{round.what}</td>
                  <td>{round.why}</td>
                  <td className="mono">{round.observed === null ? '—' : round.observed.toPrecision(6)}</td>
                  {/* An observation with nothing to compare it to is not
                      interpretable — and a loop that has no such reference
                      reports null rather than inventing one. */}
                  <td className="mono">{round.reference === null ? '—' : round.reference.toPrecision(6)}</td>
                  <td className="mono">
                    {round.verdicts.length === 0
                      ? '—'
                      : round.verdicts.map((v) => `${v.hypothesisId}: ${v.assessment}`).join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pilot-step">
        <h3>Stan hipotez po przebiegu</h3>
        <dl className="pilot-provenance">
          <div><dt>przetrwały</dt><dd className="mono" data-testid="strategy-surviving">{run.surviving.join(', ') || '—'}</dd></div>
          <div><dt>sfalsyfikowane</dt><dd className="mono" data-testid="strategy-falsified">{run.falsified.join(', ') || '—'}</dd></div>
          <div><dt>nieprzetestowane</dt><dd className="mono">{run.untested.join(', ') || '—'}</dd></div>
        </dl>
        {run.nextExperiment !== null && (
          <p className="settings-hint" data-testid="strategy-next">
            NASTĘPNY EKSPERYMENT ({run.nextExperiment.status}): {run.nextExperiment.action} — {run.nextExperiment.why}
            {run.nextExperiment.resolves !== null && <> · ROZSTRZYGNIE: {run.nextExperiment.resolves}</>}
          </p>
        )}
        {run.openQuestions.length > 0 && (
          <>
            <h4 className="matrix-detail-sub">Czego nie rozstrzygnął</h4>
            <ul className="matrix-relation-list" data-testid="strategy-open">
              {run.openQuestions.map((question) => <li key={question}>{question}</li>)}
            </ul>
          </>
        )}
        <h4 className="matrix-detail-sub">Ograniczenia i założenia</h4>
        <ul className="matrix-relation-list" data-testid="strategy-limitations">
          {run.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
        </ul>
      </section>
    </>
  );
}
