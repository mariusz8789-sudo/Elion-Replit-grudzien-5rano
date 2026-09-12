import { useState } from 'react';
import { calibrationStrategy } from '../core/agent/discoveryStrategies';
import type { StrategyRun } from '../core/agent/discoveryStrategy';
import {
  EPIDEMIC_INFECTIOUS_DAYS_CANDIDATES, EPIDEMIC_INFECTIOUS_DAYS_PROBE_TICKS,
  epidemicInfectiousDaysCalibration,
} from '../core/agent/epidemicInfectiousDaysCalibration';

/**
 * ILE TRWA OKRES ZAKAŹNOŚCI? — the CALIBRATION strategy, finally run in the
 * product.
 *
 * Three autonomous strategies exist and are tested (`discoveryStrategies.ts`:
 * MECHANISM, PARAMETER, CALIBRATION), and production only ever invoked
 * MECHANISM — hard-wired to the flood catalogue in `GenesisWorldScreen`. So
 * `epidemicInfectiousDaysCalibration.ts`, which poses a real parameter-recovery
 * problem over the RK4 SEIRD solver, had never been run by anything a user
 * could reach.
 *
 * WHAT MAKES THIS WORTH SHOWING: the candidate ranking by infected count
 * REVERSES between day 30 and day 80 (the module's own measured finding). An
 * agent that always reads at the horizon would misjudge the parameter. So
 * choosing WHEN to measure is itself the scientific act, and that is what the
 * rounds below show.
 *
 * THIS SCREEN RUNS NO SCIENCE. `calibrationStrategy.run` executes the real
 * loop and returns the shared `StrategyRun` contract; every field rendered is
 * read off it. The true value is a control, not an answer: the loop is never
 * told it, and the screen compares the loop's surviving candidates against it
 * only AFTER the run, to say plainly whether the recovery succeeded.
 */

/** The parameter the simulated world really has. The loop does not receive it. */
const TRUE_VALUES: readonly number[] = EPIDEMIC_INFECTIOUS_DAYS_CANDIDATES.map((c) => c.infectiousDays);

function claimedValueOf(hypothesisId: string): number | null {
  const candidate = EPIDEMIC_INFECTIOUS_DAYS_CANDIDATES.find((c) => c.id === hypothesisId);
  return candidate === undefined ? null : candidate.infectiousDays;
}

export function CalibrationInquiryScreen() {
  const [trueDays, setTrueDays] = useState(7.5);
  const [maxRounds, setMaxRounds] = useState(4);
  const [run, setRun] = useState<StrategyRun | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [busy, setBusy] = useState(false);

  const start = (): void => {
    setBusy(true);
    try {
      const t0 = performance.now();
      setRun(calibrationStrategy.run(epidemicInfectiousDaysCalibration(trueDays, maxRounds)));
      setElapsedMs(performance.now() - t0);
    } finally {
      setBusy(false);
    }
  };

  const survivingValues = run === null ? [] : run.surviving.map(claimedValueOf).filter((v): v is number => v !== null);
  const recovered = survivingValues.length > 0 && survivingValues.every((v) => v === trueDays);

  return (
    <main className="home" id="main-content" tabIndex={-1}>
      <section className="pilot-step">
        <p className="settings-hint">
          Świat ma ukrytą wartość: rzeczywisty średni okres zakaźności. Agent jej NIE zna. Ma{' '}
          {EPIDEMIC_INFECTIOUS_DAYS_CANDIDATES.length} konkurencyjnych hipotez (
          {EPIDEMIC_INFECTIOUS_DAYS_CANDIDATES.map((c) => c.infectiousDays).join(', ')} dni) i sam decyduje, W KTÓRYM
          MOMENCIE zmierzyć — do wyboru ma dni {EPIDEMIC_INFECTIOUS_DAYS_PROBE_TICKS.join(', ')}. Każdy odczyt to realny
          przebieg solvera SEIRD (RK4).
        </p>
        <p className="settings-hint">
          <strong>Dlaczego WYBÓR MOMENTU jest tu nauką, a nie optymalizacją:</strong> uporządkowanie kandydatów według
          liczby zakażonych ODWRACA SIĘ między dniem 30 a 80. Agent czytający zawsze na końcu horyzontu pomyliłby się co
          do parametru.
        </p>

        <div className="pilot-actions">
          <label>
            Prawdziwy okres zakaźności (ukryty przed agentem)
            <select value={trueDays} data-testid="true-days" onChange={(e) => { setTrueDays(Number(e.target.value)); setRun(null); }}>
              {TRUE_VALUES.map((v) => <option key={v} value={v}>{v} dni</option>)}
            </select>
          </label>
          <label>
            Maks. rund
            <input type="number" min={1} max={6} value={maxRounds} data-testid="max-rounds"
              onChange={(e) => { setMaxRounds(Number(e.target.value)); setRun(null); }} />
          </label>
          <button className="chip-btn pilot-primary" data-testid="run-calibration" onClick={start} disabled={busy}>
            {busy ? 'Mierzę…' : 'Uruchom kalibrację'}
          </button>
        </div>
      </section>

      {run !== null && (
        <>
          <section className="pilot-step" data-testid="calibration-summary">
            <h2>{run.question}</h2>
            <dl className="pilot-provenance">
              <div><dt>strategia</dt><dd className="mono">{run.strategyId}</dd></div>
              <div><dt>kształt pytania</dt><dd className="mono">{run.shape}</dd></div>
              <div><dt>rundy</dt><dd className="mono">{run.rounds.length}</dd></div>
              <div><dt>powód zatrzymania</dt><dd className="mono" data-testid="calibration-stop">{run.stopReason}</dd></div>
              <div><dt>pochodzenie danych</dt><dd className="mono">{run.dataProvenance.origin ?? 'mieszane'}</dd></div>
              <div><dt>czas</dt><dd className="mono">{elapsedMs.toFixed(0)} ms</dd></div>
            </dl>

            {/* The control comparison, made AFTER the run and labelled as such. */}
            <p className="pilot-summary" data-testid="calibration-verdict">
              {run.surviving.length === 0
                ? `Agent nie zostawił żadnej hipotezy przy życiu. Prawdziwa wartość to ${trueDays} dni — tego nie odzyskał.`
                : recovered
                  ? `ODZYSKANY: przetrwała wyłącznie hipoteza o wartości ${trueDays} dni — dokładnie ta, którą miał świat.`
                  : `NIEODZYSKANY JEDNOZNACZNIE: przy życiu zostały wartości ${survivingValues.join(', ')} dni, a świat miał ${trueDays}. To realny wynik, nie porażka do ukrycia — przy tych momentach pomiaru dane nie rozstrzygnęły między nimi.`}
            </p>
          </section>

          <section className="pilot-step">
            <h3>Runda po rundzie — co zmierzył i dlaczego właśnie to</h3>
            {/* The loop records its own reasoning in English. Rendering it
                verbatim keeps this a transcript; translating it here would make
                it a paraphrase of what the agent actually wrote. */}
            <p className="settings-hint">
              Kolumny „co zrobił" i „dlaczego to" są cytatem z pętli, dosłownie i po angielsku — nie tłumaczymy ich,
              żeby nie podmienić tego, co agent naprawdę zapisał, na własną parafrazę.
            </p>
            <div className="compare-table-wrap">
              <table className="compare-table" data-testid="calibration-rounds">
                <thead>
                  <tr><th>runda</th><th>co zrobił</th><th>dlaczego to</th><th>odczyt</th><th>werdykty hipotez</th></tr>
                </thead>
                <tbody>
                  {run.rounds.map((round) => (
                    <tr key={round.round} data-testid={`calibration-round-${round.round}`}>
                      <td className="mono">{round.round}</td>
                      <td>{round.what}</td>
                      <td>{round.why}</td>
                      <td className="mono">{round.observed === null ? '—' : round.observed.toPrecision(6)}</td>
                      {/* Every hypothesis's verdict for this round, as the loop
                          recorded it — not a derived "falsified" list, which the
                          round does not carry and which a view must not invent. */}
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
              <div><dt>przetrwały</dt><dd className="mono" data-testid="calibration-surviving">{run.surviving.join(', ') || '—'}</dd></div>
              <div><dt>sfalsyfikowane</dt><dd className="mono">{run.falsified.join(', ') || '—'}</dd></div>
              <div><dt>nieprzetestowane</dt><dd className="mono">{run.untested.join(', ') || '—'}</dd></div>
            </dl>
            {run.nextExperiment !== null && (
              <p className="settings-hint" data-testid="calibration-next">
                NASTĘPNY EKSPERYMENT ({run.nextExperiment.status}): {run.nextExperiment.action} — {run.nextExperiment.why}
              </p>
            )}
            {/* Open questions and limitations are what the loop could NOT settle.
                Dropping them would turn a bounded result into a claim. */}
            {run.openQuestions.length > 0 && (
              <>
                <h4 className="matrix-detail-sub">Czego nie rozstrzygnął</h4>
                <ul className="matrix-relation-list" data-testid="calibration-open">
                  {run.openQuestions.map((q) => <li key={q}>{q}</li>)}
                </ul>
              </>
            )}
            <h4 className="matrix-detail-sub">Ograniczenia i założenia</h4>
            <ul className="matrix-relation-list" data-testid="calibration-limitations">
              {run.limitations.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
