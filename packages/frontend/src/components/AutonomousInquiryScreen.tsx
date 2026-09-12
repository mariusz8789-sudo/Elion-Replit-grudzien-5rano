import { useState } from 'react';
import { parameterStrategy } from '../core/agent/discoveryStrategies';
import type { StrategyRun } from '../core/agent/discoveryStrategy';
import type { InquiryLoopInput } from '../core/agent/inquiryLoop';
import {
  QUANTUM_JUNCTION_CANDIDATES, QUANTUM_OPENING_ENERGY, QUANTUM_PROBE_ENERGIES, quantumJunctionInquiry,
} from '../core/agent/quantumTunnelingInquiry';
import {
  PROTEIN_FOLDING_CANDIDATES, PROTEIN_FOLDING_OPENING_STEPS, PROTEIN_FOLDING_PROBE_STEPS, proteinFoldingInquiry,
} from '../core/agent/proteinFoldingInquiry';
import { StrategyRunReport } from './StrategyRunReport';

/**
 * AUTONOMICZNE DOCHODZENIE — the PARAMETER strategy, run in the product.
 *
 * `quantumTunnelingInquiry.ts` and `proteinFoldingInquiry.ts` each declare a
 * real inquiry over a real solver, and both were unreachable for the same
 * reason: nothing in production ever invoked the PARAMETER strategy. Only
 * MECHANISM was wired, hard-coded to the flood catalogue.
 *
 * WHAT BOTH PROBLEMS HAVE IN COMMON, AND WHY IT IS THE POINT: the obvious
 * first measurement is the useless one.
 *
 *  - Quantum junction: at E = 1.3, above every candidate barrier, all four
 *    junctions transmit between 0.6097 and 0.6583 — a strong, easy, high-current
 *    reading that separates nothing. The information is at LOW bias, where the
 *    height/width degeneracy breaks.
 *  - Protein fold: at 200 Metropolis steps every candidate temperature reads
 *    back the same 0.13 acceptance rate, an algorithmic floor rather than a
 *    property of the fold. The answer has to be earned with a longer run.
 *
 * Both inquiries therefore OPEN on the uninformative measurement on purpose, and
 * what they reach for next is decided by what came back. That decision, in the
 * loop's own words, is what the report below shows.
 *
 * THIS SCREEN RUNS NO SCIENCE and states no verdict: `parameterStrategy.run`
 * executes the real loop, and `StrategyRunReport` — the same renderer the
 * CALIBRATION screen uses, because all three strategies return the same
 * contract — displays what it returned.
 */

interface Problem {
  readonly id: string;
  readonly label: string;
  readonly opening: string;
  readonly probes: string;
  readonly candidates: readonly string[];
  /**
   * The hypothesis id the world REALLY matches — a control, never given to the
   * loop. Kept here so the screen can say afterwards whether the inquiry
   * recovered it; without that, "it narrowed to two" is unreadable.
   */
  readonly truthHypothesisId: string;
  readonly build: () => InquiryLoopInput;
}

const PROBLEMS: readonly Problem[] = [
  {
    id: 'quantum-junction',
    label: 'Złącze kwantowe — jaka jest bariera i jej szerokość?',
    opening: `E = ${QUANTUM_OPENING_ENERGY} (powyżej każdej kandydującej bariery — celowo najmniej informatywny odczyt)`,
    probes: QUANTUM_PROBE_ENERGIES.join(', '),
    candidates: QUANTUM_JUNCTION_CANDIDATES.map((c) => `${c.id}: bariera ${c.barrier}, szerokość ${c.width}`),
    // The junction the world really has. The loop is not told which one.
    truthHypothesisId: 'h:mid-wide', // barrier 1.2, width 2.5
    build: () => quantumJunctionInquiry(1.2, 2.5),
  },
  {
    id: 'protein-folding',
    label: 'Zwijanie białka (HP-lattice) — w jakiej temperaturze zwijało się to białko?',
    opening: `${PROTEIN_FOLDING_OPENING_STEPS} kroków Metropolisa (najkrótszy i najtańszy — mierzy podłogę algorytmu, nie fold)`,
    probes: PROTEIN_FOLDING_PROBE_STEPS.join(', '),
    candidates: PROTEIN_FOLDING_CANDIDATES.map((c) => `${c.id}: T = ${c.temperature}`),
    truthHypothesisId: 'h:warm', // T = 1.2
    build: () => proteinFoldingInquiry(1.2),
  },
];

export function AutonomousInquiryScreen() {
  const [problemId, setProblemId] = useState(PROBLEMS[0]!.id);
  const [run, setRun] = useState<StrategyRun | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [admissionStatus, setAdmissionStatus] = useState<string | null>(null);
  /** An APPROXIMATION is admitted, but its caveat travels with the result — dropping it would present an approximation as exact. */
  const [caveat, setCaveat] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [busy, setBusy] = useState(false);

  const problem = PROBLEMS.find((p) => p.id === problemId)!;

  const start = (): void => {
    setBusy(true);
    setRefused(null);
    try {
      const input = problem.build();
      // The strategy decides whether it will touch this problem at all, and
      // its admission carries a STATUS, not a boolean: REAL, APPROXIMATION,
      // NOT_MODELLED or BLOCKED. Only the last two are refusals, and both must
      // name what Genesis would concretely need — showing that verbatim is the
      // point of an admission that refuses.
      const admission = parameterStrategy.admit(input);
      setAdmissionStatus(admission.status);
      setCaveat(admission.caveat);
      if (admission.status === 'NOT_MODELLED' || admission.status === 'BLOCKED') {
        setRun(null);
        setRefused(`${admission.status} — ${admission.why}${admission.missing.length > 0 ? ` Potrzebne: ${admission.missing.join('; ')}` : ''}`);
        return;
      }
      const t0 = performance.now();
      const result = parameterStrategy.run(input);
      setElapsedMs(performance.now() - t0);
      setRun(result);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="home" id="main-content" tabIndex={-1}>
      <section className="pilot-step">
        <p className="settings-hint">
          Agent dostaje kilka konkurencyjnych hipotez o UKRYTYM parametrze i sam wybiera, przy jakiej wartości próbnej
          zmierzyć. Każdy odczyt to realny przebieg solvera — nie tabela, nie zgadywanie.
        </p>
        <p className="settings-hint">
          <strong>Oczywisty pierwszy pomiar jest tu bezużyteczny — i o to chodzi.</strong> Oba dochodzenia CELOWO
          otwierają się na odczycie, który niczego nie rozróżnia, więc odpowiedź trzeba wypracować, a to, po co agent
          sięgnie dalej, wynika z tego, co właśnie zmierzył.
        </p>

        <div className="pilot-actions">
          <label>
            Problem
            <select value={problemId} data-testid="inquiry-problem"
              onChange={(e) => { setProblemId(e.target.value); setRun(null); setRefused(null); setAdmissionStatus(null); setCaveat(null); }}>
              {PROBLEMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <button className="chip-btn pilot-primary" data-testid="run-inquiry" onClick={start} disabled={busy}>
            {busy ? 'Mierzę…' : 'Uruchom dochodzenie'}
          </button>
        </div>

        <dl className="pilot-provenance" data-testid="inquiry-setup">
          <div><dt>otwarcie</dt><dd className="mono">{problem.opening}</dd></div>
          <div><dt>dostępne wartości próbne</dt><dd className="mono">{problem.probes}</dd></div>
        </dl>
        <h4 className="matrix-detail-sub">Konkurencyjne hipotezy</h4>
        <ul className="matrix-relation-list" data-testid="inquiry-candidates">
          {problem.candidates.map((candidate) => <li key={candidate} className="mono">{candidate}</li>)}
        </ul>
      </section>

      {refused !== null && (
        <section className="pilot-step">
          <p className="pilot-summary" data-testid="inquiry-refused">
            Strategia ODMÓWIŁA przyjęcia tego problemu: {refused}
          </p>
        </section>
      )}

      {run !== null && (
        <>
          {/* The control comparison — the only claim this screen makes of its
              own, made after the run and needing the hidden truth the shared
              report deliberately does not know. "Narrowed to two" is a real and
              common outcome here and is reported as one, not as a failure. */}
          <section className="pilot-step">
            <p className="pilot-summary" data-testid="inquiry-verdict">
              {run.surviving.length === 0
                ? `Żadna hipoteza nie przetrwała. Świat odpowiadał hipotezie ${problem.truthHypothesisId} — agent jej nie odzyskał.`
                : run.surviving.length === 1 && run.surviving[0] === problem.truthHypothesisId
                  ? `ODZYSKANY: została wyłącznie ${problem.truthHypothesisId} — dokładnie ta, której odpowiadał świat.`
                  : run.surviving.includes(problem.truthHypothesisId)
                    ? `ZAWĘŻONE, NIEROZSTRZYGNIĘTE: prawdziwa hipoteza (${problem.truthHypothesisId}) przetrwała razem z ${run.surviving.filter((id) => id !== problem.truthHypothesisId).join(', ')}. Przy dostępnych wartościach próbnych dane nie oddzieliły ich od siebie — to zapisane ograniczenie tego dochodzenia, nie wynik do ukrycia.`
                    : `BŁĄD ODZYSKANIA: przetrwały ${run.surviving.join(', ')}, a świat odpowiadał ${problem.truthHypothesisId}. Agent sfalsyfikował prawdziwą hipotezę — to poważny wynik i jest pokazany wprost.`}
            </p>
          </section>
          {(admissionStatus !== null && admissionStatus !== 'REAL') && (
            <section className="pilot-step">
              <p className="pilot-summary" data-testid="inquiry-admission">
                Dopuszczenie: {admissionStatus}{caveat !== null && <> — {caveat}</>}
              </p>
            </section>
          )}
          <StrategyRunReport run={run} elapsedMs={elapsedMs} />
        </>
      )}
    </main>
  );
}
