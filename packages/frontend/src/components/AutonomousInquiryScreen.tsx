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
import {
  QE1_CANDIDATES, QE1_OPENING_NOISE, QE1_PROBE_NOISE, QE2_CANDIDATES, QE2_OPENING_MIXING_ANGLE,
  QE2_PROBE_MIXING_ANGLES, QE3_CANDIDATES, QE3_OPENING_NOISE, QE3_PROBE_NOISE,
  qe1VisibilityInquiry, qe2MonogamyInquiry, qe3BoundEntanglementInquiry,
} from '../core/agent/entanglementInquiry';
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
 * The three entanglement inquiries QE1-QE3 were added for the same reason and
 * each fails the obvious measurement differently:
 *
 *  - QE1: at full depolarisation max CHSH is exactly 0 for every candidate
 *    visibility. It then turns out that NO setting of white noise can separate
 *    p = 1.00 from p = 0.92 inside the declared band — the probe multiplies
 *    every prediction by the same factor — so the loop narrows the field and
 *    then refuses, which is the honest answer rather than a recovered one.
 *  - QE2: at a pure |W> state the residual three-tangle is 0 for every theta.
 *    Worse, the strongest signal in the family (the pure generalised-GHZ limit)
 *    is SYMMETRIC about theta = 45 degrees, so it leaves theta = 20 and
 *    theta = 70 exactly tied. The loop has to reach off-axis to break that.
 *  - QE3: the bound-entanglement margin is 0 at every noise setting down to
 *    half a percent, so only a perfectly noiseless preparation says anything —
 *    a measured fact about how close bound entanglement sits to separability.
 *
 * All five inquiries therefore OPEN on the uninformative measurement on purpose,
 * and what they reach for next is decided by what came back. That decision, in
 * the loop's own words, is what the report below shows.
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

/**
 * Polish wording for the entanglement candidates.
 *
 * The inquiry modules keep their statements in English because those are what
 * the loop RECORDS — `ParameterHypothesis.statement` ends up inside the
 * criterion rationale the report quotes verbatim, and translating it here would
 * put a second wording of the same claim on screen. The junction and the fold
 * do the same thing: their candidate lines are built in this file from the
 * module's numbers, not from its prose. Only the numbers cross over, so there
 * is one source of truth for them.
 */
const QE1_PL: Readonly<Record<string, string>> = {
  'h:ideal': 'źródło idealne, maksymalnie splątane, max CHSH 2√2',
  'h:good': 'dobre źródło, łamie CHSH z zapasem',
  'h:marginal': 'źródło graniczne, tuż nad progiem CHSH 1/√2',
  'h:classical': 'wciąż splątane (p > 1/3), ale NIE MOŻE złamać CHSH',
};
const QE2_PL: Readonly<Record<string, string>> = {
  'h:theta-20': 'silnie przechylone ku |000⟩',
  'h:theta-35': 'lekko przechylone ku |000⟩',
  'h:theta-45': 'zrównoważone — standardowy |GHZ⟩',
  'h:theta-55': 'lekko przechylone ku |111⟩',
  'h:theta-70': 'silnie przechylone ku |111⟩',
};
const QE3_PL: Readonly<Record<string, string>> = {
  'h:a-0.2': 'głęboko w reżimie splątania związanego',
  'h:a-0.4': 'wyraźne splątanie związane',
  'h:a-0.6': 'słabe splątanie związane',
  'h:a-0.8': 'ledwie wykrywalne splątanie związane — margines poniżej 0,001',
};

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
  {
    id: 'qe1-visibility',
    label: 'QE1 — jaka jest widzialność tego źródła par splątanych?',
    opening: `szum biały w = ${QE1_OPENING_NOISE} (pełna depolaryzacja — max CHSH dokładnie 0 dla każdego kandydata)`,
    probes: QE1_PROBE_NOISE.join(', '),
    candidates: QE1_CANDIDATES.map((c) => `${c.id}: p = ${c.visibility.toFixed(2)} — ${QE1_PL[c.id]}`),
    truthHypothesisId: 'h:good', // p = 0.92
    build: () => qe1VisibilityInquiry(0.92),
  },
  {
    id: 'qe2-monogamy',
    label: 'QE2 — gdzie to źródło trójkubitowe trzyma swoje splątanie?',
    opening: `domieszka |W⟩ α = ${QE2_OPENING_MIXING_ANGLE}° (czysty |W⟩ — resztkowy trójsplot 0 dla każdego θ)`,
    probes: QE2_PROBE_MIXING_ANGLES.map((a) => `${a}°`).join(', '),
    candidates: QE2_CANDIDATES.map((c) => `${c.id}: θ = ${c.theta}° — ${QE2_PL[c.id]}`),
    truthHypothesisId: 'h:theta-70', // theta = 70 degrees
    build: () => qe2MonogamyInquiry(70),
  },
  {
    id: 'qe3-bound-entanglement',
    label: 'QE3 — który to stan Horodeckich, skoro PPT nie mówi o żadnym z nich niczego?',
    opening: `szum biały w = ${QE3_OPENING_NOISE} (pełna depolaryzacja — margines splątania związanego 0 dla każdego kandydata)`,
    probes: QE3_PROBE_NOISE.join(', '),
    candidates: QE3_CANDIDATES.map((c) => `${c.id}: a = ${c.a.toFixed(1)} — ${QE3_PL[c.id]}`),
    truthHypothesisId: 'h:a-0.4', // a = 0.4
    build: () => qe3BoundEntanglementInquiry(0.4),
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
          <strong>Oczywisty pierwszy pomiar jest tu bezużyteczny — i o to chodzi.</strong> Każde z pięciu dochodzeń
          CELOWO otwiera się na odczycie, który niczego nie rozróżnia, i za każdym razem z innego powodu, więc
          odpowiedź trzeba wypracować, a to, po co agent sięgnie dalej, wynika z tego, co właśnie zmierzył.
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
