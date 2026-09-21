import { useState } from 'react';
import { calibrationStrategy } from '../core/agent/discoveryStrategies';
import type { StrategyRun } from '../core/agent/discoveryStrategy';
import { StrategyRunReport } from './StrategyRunReport';
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
          {/* THE ONLY THING THIS SCREEN SAYS OF ITS OWN: did the loop recover
              the value the world really had? That comparison needs the hidden
              control, which the shared report deliberately does not know — so
              it lives here and nowhere else. */}
          <section className="pilot-step" data-testid="calibration-verdict-section">
            <p className="pilot-summary" data-testid="calibration-verdict">
              {run.surviving.length === 0
                ? `Agent nie zostawił żadnej hipotezy przy życiu. Prawdziwa wartość to ${trueDays} dni — tego nie odzyskał.`
                : recovered
                  ? `ODZYSKANY: przetrwała wyłącznie hipoteza o wartości ${trueDays} dni — dokładnie ta, którą miał świat.`
                  : `NIEODZYSKANY JEDNOZNACZNIE: przy życiu zostały wartości ${survivingValues.join(', ')} dni, a świat miał ${trueDays}. To realny wynik, nie porażka do ukrycia — przy tych momentach pomiaru dane nie rozstrzygnęły między nimi.`}
            </p>
          </section>

          {/* Everything else is the shared StrategyRun report — the same one the
              PARAMETER inquiries use, because all three strategies return the
              same contract and a second round table would be a second opinion
              about what a run means. */}
          <StrategyRunReport run={run} elapsedMs={elapsedMs} />
        </>
      )}
    </main>
  );
}
