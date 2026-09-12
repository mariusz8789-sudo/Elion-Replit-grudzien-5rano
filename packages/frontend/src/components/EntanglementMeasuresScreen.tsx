import { useMemo, useState } from 'react';
import type { C } from '../core/quantumState';
import {
  checkCKWMonogamy, checkNoCommunication, concurrence, densityFromState, entanglementEntropyBits,
  entropyOfFormation, identity, logarithmicNegativity, maximumCHSH, negativity, partialTraceB,
  peresHorodeckiTest, renyiEntropy, schmidtDecomposition, vonNeumannEntropy,
  type DensityMatrix,
} from '../core/quantum/entanglementMeasures';

/**
 * MIARY SPLĄTANIA — the screen that makes the entanglement hypotheses
 * falsifiable instead of quoted.
 *
 * The repo already showed entanglement HAPPENING: `quantum-chsh.ts` renders
 * real singlet correlations in 3D, `quantum-teleport.ts` runs an exact
 * fidelity-1 teleportation. What no screen could answer was HOW MUCH, and
 * therefore none of the standard claims could be checked. QE2 (monogamy) and
 * QE3 (PPT scope) in particular had nothing in the codebase that could falsify
 * them.
 *
 * This screen computes NOTHING. `core/quantum/entanglementMeasures.ts` owns
 * every number; this picks a state and renders what came back. It is
 * deliberately NOT a second entanglement lab — `quantum-chsh.ts` is the lab,
 * unchanged, and building another would be the duplication this repo forbids.
 *
 * WHY THE STATES BELOW: each has a closed-form answer, so a reader checks the
 * screen against arithmetic rather than trusting it. A Bell state must read
 * S = ln 2, concurrence 1, negativity 1/2 and max CHSH exactly 2sqrt(2); the
 * Werner family must turn entangled at p = 1/3 and CHSH-violating only at
 * p = 1/sqrt(2) — and that GAP is the most misunderstood fact in the subject.
 */

const S = Math.SQRT1_2;
const c = (re: number, im = 0): C => [re, im];

interface StateChoice {
  readonly id: string;
  readonly label: string;
  readonly qubits: 2 | 3;
  readonly note: string;
  readonly build: (p: number) => { readonly psi?: readonly C[]; readonly rho: DensityMatrix };
}

function maximallyMixed(n: number): DensityMatrix {
  return identity(n).map((row) => row.map(([re, im]) => [re / n, im / n] as C));
}

/** p |Psi-><Psi-| + (1-p) I/4 — the one family where every threshold is known in closed form. */
function werner(p: number): DensityMatrix {
  const bell = densityFromState([c(0), c(S), c(-S), c(0)]);
  const mixed = maximallyMixed(4);
  return bell.map((row, i) => row.map(([re, im], j) => [
    p * re + (1 - p) * mixed[i]![j]![0],
    p * im + (1 - p) * mixed[i]![j]![1],
  ] as C));
}

const STATES: readonly StateChoice[] = [
  {
    id: 'phi-plus', label: '|Φ+⟩ = (|00⟩ + |11⟩)/√2', qubits: 2,
    note: 'Maksymalnie splątany. Wzorzec: S = ln 2, concurrence 1, negatywność 1/2, max CHSH = 2√2.',
    build: () => { const psi: C[] = [c(S), c(0), c(0), c(S)]; return { psi, rho: densityFromState(psi) }; },
  },
  {
    id: 'psi-minus', label: '|Ψ−⟩ = (|01⟩ − |10⟩)/√2', qubits: 2,
    note: 'Singlet — ten sam stan, którego korelacje liczy laboratorium CHSH w repo.',
    build: () => { const psi: C[] = [c(0), c(S), c(-S), c(0)]; return { psi, rho: densityFromState(psi) }; },
  },
  {
    id: 'product', label: '|0⟩ ⊗ |+⟩ (stan produktowy)', qubits: 2,
    note: 'Zero splątania. Każda miara musi dać dokładnie 0, a ranga Schmidta 1.',
    build: () => { const psi: C[] = [c(S), c(S), c(0), c(0)]; return { psi, rho: densityFromState(psi) }; },
  },
  {
    id: 'partial', label: 'α|00⟩ + β|11⟩ (suwak: α)', qubits: 2,
    note: 'Częściowo splątany. Closed form: concurrence = 2|αβ|.',
    build: (p) => {
      const alpha = Math.max(0, Math.min(1, p));
      const psi: C[] = [c(alpha), c(0), c(0), c(Math.sqrt(1 - alpha * alpha))];
      return { psi, rho: densityFromState(psi) };
    },
  },
  {
    id: 'werner', label: 'Stan Wernera (suwak: p)', qubits: 2,
    note: 'Splątany dokładnie dla p > 1/3 (PPT jest tu warunkiem koniecznym I wystarczającym), ale łamie CHSH dopiero dla p > 1/√2 ≈ 0,7071.',
    build: (p) => ({ rho: werner(Math.max(0, Math.min(1, p))) }),
  },
  {
    id: 'mixed', label: 'Stan maksymalnie mieszany I/4', qubits: 2,
    note: 'Separowalny. Test na zdegenerowanym widmie — tu najłatwiej o błąd numeryczny.',
    build: () => ({ rho: maximallyMixed(4) }),
  },
  {
    id: 'ghz', label: '|GHZ⟩ = (|000⟩ + |111⟩)/√2', qubits: 3,
    note: 'Splątanie w pełni trójstronne: τ_AB = τ_AC = 0, a reszta (three-tangle) = 1.',
    build: () => ({ psi: [c(S), c(0), c(0), c(0), c(0), c(0), c(0), c(S)], rho: densityFromState([c(S), c(0), c(0), c(0), c(0), c(0), c(0), c(S)]) }),
  },
  {
    id: 'w', label: '|W⟩ = (|001⟩ + |010⟩ + |100⟩)/√3', qubits: 3,
    note: 'Splątanie wyłącznie parami: nierówność CKW jest NASYCONA, three-tangle = 0.',
    build: () => {
      const t = 1 / Math.sqrt(3);
      const psi: C[] = [c(0), c(t), c(t), c(0), c(t), c(0), c(0), c(0)];
      return { psi, rho: densityFromState(psi) };
    },
  },
];

const VERDICT_LABEL: Readonly<Record<ReturnType<typeof peresHorodeckiTest>['verdict'], string>> = {
  SEPARABLE: 'SEPAROWALNY',
  ENTANGLED: 'SPLĄTANY',
  PPT_BUT_UNDECIDED: 'PPT, ALE NIEROZSTRZYGNIĘTE',
};

const fmt = (x: number): string => (Math.abs(x) < 1e-9 ? '0' : x.toFixed(6));

export function EntanglementMeasuresScreen() {
  const [stateId, setStateId] = useState(STATES[0]!.id);
  const [parameter, setParameter] = useState(0.6);
  const choice = STATES.find((s) => s.id === stateId)!;

  const analysis = useMemo(() => {
    const { psi, rho } = choice.build(parameter);
    const twoQubit = choice.qubits === 2;
    return {
      rho,
      psi,
      schmidt: psi !== undefined && twoQubit ? schmidtDecomposition(psi, 2, 2) : null,
      reducedEntropy: twoQubit ? vonNeumannEntropy(partialTraceB(rho, 2, 2)) : null,
      reducedBits: twoQubit ? entanglementEntropyBits(partialTraceB(rho, 2, 2)) : null,
      renyi2: twoQubit ? renyiEntropy(partialTraceB(rho, 2, 2), 2) : null,
      concurrence: twoQubit ? concurrence(rho) : null,
      negativity: twoQubit ? negativity(rho, 2, 2) : null,
      logNegativity: twoQubit ? logarithmicNegativity(rho, 2, 2) : null,
      ppt: twoQubit ? peresHorodeckiTest(rho, 2, 2) : null,
      chsh: twoQubit ? maximumCHSH(rho) : null,
      monogamy: !twoQubit && psi !== undefined ? checkCKWMonogamy(psi) : null,
      // An arbitrary local unitary on A — Hadamard. The theorem must hold for any.
      noComm: twoQubit
        ? checkNoCommunication(rho, 2, 2, [[c(S), c(S)], [c(S), c(-S)]])
        : null,
    };
  }, [choice, parameter]);

  const hasSlider = choice.id === 'partial' || choice.id === 'werner';

  return (
    <main className="home" id="main-content" tabIndex={-1}>
      <section className="pilot-step">
        <p className="settings-hint">
          Każda liczba poniżej jest policzona przez <span className="mono">core/quantum/entanglementMeasures.ts</span> —
          ten ekran nie liczy niczego. Śladem częściowym, dekompozycją Schmidta, concurrence Woottersa, negatywnością,
          transpozycją częściową i kryterium Horodeckich, na dokładnych macierzach gęstości.
        </p>
        <p className="settings-hint">
          <strong>Sprawdzalne, nie deklarowane:</strong> każdy stan poniżej ma wartość w postaci zamkniętej. Stan Bella
          MUSI dać S = ln 2 ≈ 0,693147, concurrence 1, negatywność 0,5 i max CHSH = 2√2 ≈ 2,828427. Jeśli nie daje —
          to błąd w kodzie, nie w fizyce.
        </p>

        <div className="pilot-actions">
          <label>
            Stan
            <select value={stateId} data-testid="entanglement-state" onChange={(e) => setStateId(e.target.value)}>
              {STATES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          {hasSlider && (
            <label>
              Parametr: <strong data-testid="entanglement-parameter">{parameter.toFixed(2)}</strong>
              <input type="range" min={0} max={1} step={0.01} value={parameter}
                data-testid="entanglement-slider" onChange={(e) => setParameter(Number(e.target.value))} />
            </label>
          )}
        </div>
        <p className="settings-hint" data-testid="entanglement-note">{choice.note}</p>
      </section>

      {analysis.ppt !== null && (
        <section className="pilot-step" data-testid="entanglement-measures">
          <h2>Miary</h2>
          <dl className="pilot-provenance">
            {analysis.schmidt !== null && (
              <>
                <div><dt>ranga Schmidta</dt><dd className="mono" data-testid="schmidt-rank">{analysis.schmidt.rank}</dd></div>
                <div><dt>współczynniki Schmidta</dt><dd className="mono">{analysis.schmidt.coefficients.map(fmt).join(', ')}</dd></div>
              </>
            )}
            <div><dt>entropia von Neumanna S(ρ_A)</dt><dd className="mono" data-testid="vn-entropy">{fmt(analysis.reducedEntropy!)} nat = {fmt(analysis.reducedBits!)} bit</dd></div>
            <div><dt>entropia Rényiego S₂</dt><dd className="mono">{fmt(analysis.renyi2!)} nat</dd></div>
            <div><dt>concurrence (Wootters)</dt><dd className="mono" data-testid="concurrence">{fmt(analysis.concurrence!)}</dd></div>
            <div><dt>entropia formowania</dt><dd className="mono">{fmt(entropyOfFormation(analysis.concurrence!))} bit</dd></div>
            <div><dt>negatywność</dt><dd className="mono" data-testid="negativity">{fmt(analysis.negativity!)}</dd></div>
            <div><dt>log-negatywność</dt><dd className="mono">{fmt(analysis.logNegativity!)}</dd></div>
          </dl>
          {/* For a PURE state the reduced entropy IS the entanglement entropy. For a
              MIXED one it is not — it counts classical mixing too, and saying so is
              the difference between a measure and a number that looks like one. */}
          {analysis.psi === undefined && (
            <p className="settings-hint">
              Ten stan jest MIESZANY, więc S(ρ_A) nie jest miarą splątania — zawiera też zwykłą niepewność klasyczną.
              Dla stanu mieszanego czytaj concurrence i negatywność, nie entropię redukowaną.
            </p>
          )}
        </section>
      )}

      {analysis.ppt !== null && analysis.chsh !== null && (
        <section className="pilot-step">
          <h2>Hipotezy QE — jako wykonywalne sprawdzenia</h2>

          {/* QE1 — Tsirelson. Horodecki daje MAKSIMUM po wszystkich ustawieniach w
              postaci zamkniętej, więc to nie jest przeszukiwanie kątów, które mogło
              coś pominąć: to jest sufit. */}
          <p className="pilot-summary" data-testid="qe1">
            <strong>QE1 (granica Tsirelsona):</strong> max CHSH po WSZYSTKICH ustawieniach ={' '}
            <span className="mono">{fmt(analysis.chsh.maxS)}</span>; sufit kwantowy 2√2 ={' '}
            <span className="mono">{fmt(analysis.chsh.tsirelsonBound)}</span>.{' '}
            {analysis.chsh.maxS <= analysis.chsh.tsirelsonBound + 1e-9
              ? 'NIE PRZEKROCZONO — zgodnie z hipotezą.'
              : 'PRZEKROCZONO — to byłby wynik ponad-kwantowy i falsyfikowałby QE1.'}{' '}
            {analysis.chsh.violatesCHSH
              ? 'Ten stan łamie nierówność CHSH (S > 2).'
              : 'Ten stan NIE łamie CHSH przy żadnych ustawieniach.'}
          </p>

          {/* QE3 — the scope is the finding. A PPT verdict outside 2x2 / 2x3 proves
              nothing about separability, and the module refuses to pretend otherwise. */}
          <p className="pilot-summary" data-testid="qe3">
            <strong>QE3 (zakres kryterium PPT):</strong> werdykt{' '}
            <span className="mono" data-testid="ppt-verdict">{VERDICT_LABEL[analysis.ppt.verdict]}</span>, najmniejsza
            wartość własna ρ^{'{T_A}'} = <span className="mono">{fmt(analysis.ppt.minEigenvalue)}</span>.{' '}
            {analysis.ppt.decisiveForSeparability
              ? 'W wymiarze 2⊗2 kryterium Peresa–Horodeckich jest warunkiem KONIECZNYM I WYSTARCZAJĄCYM, więc ten werdykt rozstrzyga.'
              : 'Poza 2⊗2 i 2⊗3 stan PPT może być splątany w sposób związany — ten werdykt NIE rozstrzyga separowalności.'}
          </p>

          {/* The gap that makes "entangled" and "Bell-violating" different words. */}
          {analysis.ppt.verdict === 'ENTANGLED' && !analysis.chsh.violatesCHSH && (
            <p className="pilot-summary" data-testid="entangled-not-violating">
              ⚠ Ten stan jest SPLĄTANY, a mimo to nie łamie CHSH przy żadnych ustawieniach. „Splątany" i „łamiący
              nierówność Bella" to nie są synonimy — dla rodziny Wernera pierwszy próg leży przy p = 1/3, a drugi
              dopiero przy p = 1/√2.
            </p>
          )}

          {analysis.noComm !== null && (
            <p className="pilot-summary" data-testid="no-communication">
              <strong>Brak komunikacji (twierdzenie):</strong> po dowolnej lokalnej unitarnej na A największa zmiana
              w ρ_B wynosi <span className="mono">{analysis.noComm.maxDeviation.toExponential(2)}</span>.{' '}
              {analysis.noComm.holds
                ? 'ρ_B nie drgnął — Genesis pokazuje tę regułę, a nie tylko ją powtarza.'
                : 'ρ_B SIĘ ZMIENIŁ — to byłby błąd implementacji, nie odkrycie.'}
            </p>
          )}
        </section>
      )}

      {analysis.monogamy !== null && (
        <section className="pilot-step">
          <h2>QE2 — monogamia CKW</h2>
          <dl className="pilot-provenance" data-testid="qe2">
            <div><dt>τ(A|B)</dt><dd className="mono">{fmt(analysis.monogamy.tangleAB)}</dd></div>
            <div><dt>τ(A|C)</dt><dd className="mono">{fmt(analysis.monogamy.tangleAC)}</dd></div>
            <div><dt>τ(A|BC)</dt><dd className="mono">{fmt(analysis.monogamy.tangleABC)}</dd></div>
            <div><dt>reszta (three-tangle)</dt><dd className="mono" data-testid="three-tangle">{fmt(analysis.monogamy.residual)}</dd></div>
          </dl>
          <p className="pilot-summary" data-testid="qe2-verdict">
            {analysis.monogamy.satisfied
              ? 'τ(A|B) + τ(A|C) ≤ τ(A|BC) — nierówność SPEŁNIONA.'
              : 'NIERÓWNOŚĆ ZŁAMANA — to byłby błąd w implementacji, nie violacja twierdzenia CKW.'}
          </p>
          <p className="settings-hint">
            Monogamia jest twierdzeniem, więc to sprawdzenie testuje KOD, nie fizykę. Wartość leży w kontraście: GHZ
            trzyma całe splątanie w reszcie trójstronnej (τ_AB = τ_AC = 0), a W nasyca nierówność z resztą równą zeru —
            dwa przeciwne układy, jedna nierówność.
          </p>
        </section>
      )}

      <section className="pilot-step">
        <p className="settings-hint">
          <strong>Czego ten ekran nie mówi:</strong> splątanie NIE pozwala przesłać informacji szybciej niż światło —
          wyklucza to twierdzenie o braku komunikacji, sprawdzane wyżej liczbowo. Teleportacja przenosi STAN, nie
          substrat. Każda liczba tutaj jest wynikiem SYMULACJI dokładnej algebry, nie pomiarem laboratoryjnym.
        </p>
      </section>
    </main>
  );
}
