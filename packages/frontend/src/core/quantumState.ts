/**
 * Symulacja pełnego wektora stanu wielu kubitów — dokładna mechanika
 * kwantowa (2ⁿ amplitud zespolonych), nie przybliżenie. Wystarcza do
 * teleportacji kwantowej (3 kubity, Bennett i in. 1993, PRL 70, 1895) —
 * pierwsze rozszerzenie Quantum Lab poza pojedynczą sferę Blocha
 * (`quantum-bloch.ts`), która z definicji nie może pokazać splątania.
 *
 * Konwencja indeksowania: n-kubitowy stan to tablica 2ⁿ amplitud;
 * indeks i w zapisie binarnym to |q₀q₁...qₙ₋₁⟩ (q₀ = bit najbardziej
 * znaczący). Np. dla n=3: indeks 4 = 100₂ = |q₀=1,q₁=0,q₂=0⟩.
 */

export type C = [number, number]; // [część rzeczywista, część urojona]

function cAdd(a: C, b: C): C {
  return [a[0] + b[0], a[1] + b[1]];
}

function cMul(a: C, b: C): C {
  return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
}

function cScale(a: C, s: number): C {
  return [a[0] * s, a[1] * s];
}

function cAbs2(a: C): number {
  return a[0] * a[0] + a[1] * a[1];
}

export type StateVector = C[];

/** Bramki jednokubitowe potrzebne do teleportacji — te same dokładne macierze co quantum-bloch.ts. */
export const H_GATE: [C, C, C, C] = [[Math.SQRT1_2, 0], [Math.SQRT1_2, 0], [Math.SQRT1_2, 0], [-Math.SQRT1_2, 0]];
export const X_GATE: [C, C, C, C] = [[0, 0], [1, 0], [1, 0], [0, 0]];
export const Z_GATE: [C, C, C, C] = [[1, 0], [0, 0], [0, 0], [-1, 0]];

/** Stan początkowy |00...0⟩ dla n kubitów. */
export function initState(n: number): StateVector {
  const state: StateVector = Array.from({ length: 2 ** n }, () => [0, 0] as C);
  state[0] = [1, 0];
  return state;
}

/** Stosuje dowolną bramkę jednokubitową 2×2 do wybranego kubitu w n-kubitowym stanie. */
export function applySingleQubitGate(state: StateVector, n: number, qubit: number, gate: [C, C, C, C]): StateVector {
  const [a, b, c, d] = gate;
  const size = state.length;
  const out = state.slice();
  const mask = 1 << (n - 1 - qubit);
  for (let i = 0; i < size; i++) {
    if ((i & mask) === 0) {
      const i1 = i | mask;
      const s0 = state[i];
      const s1 = state[i1];
      out[i] = cAdd(cMul(a, s0), cMul(b, s1));
      out[i1] = cAdd(cMul(c, s0), cMul(d, s1));
    }
  }
  return out;
}

/** CNOT: flip kubitu docelowego, gdy kubit kontrolny=1. Dokładna operacja unitarna, nie przybliżenie. */
export function applyCNOT(state: StateVector, n: number, control: number, target: number): StateVector {
  const size = state.length;
  const out = state.slice();
  const cMask = 1 << (n - 1 - control);
  const tMask = 1 << (n - 1 - target);
  for (let i = 0; i < size; i++) {
    if ((i & cMask) !== 0) {
      const j = i ^ tMask;
      if (i < j) {
        out[i] = state[j];
        out[j] = state[i];
      }
    }
  }
  return out;
}

/**
 * Pomiar rzutowy pojedynczego kubitu (reguła Borna dla prawdopodobieństwa,
 * kolaps + renormalizacja stanu) — dokładnie to samo, co jeden "krok 0"
 * eksperymentu interferencji dwuszczelinowej w tym labie, tylko na pełnym
 * wektorze stanu zamiast pojedynczej amplitudy.
 */
export function measureQubit(
  state: StateVector,
  n: number,
  qubit: number,
  rnd: () => number = Math.random,
): { outcome: 0 | 1; newState: StateVector } {
  const mask = 1 << (n - 1 - qubit);
  let p1 = 0;
  for (let i = 0; i < state.length; i++) {
    if ((i & mask) !== 0) p1 += cAbs2(state[i]);
  }
  const outcome: 0 | 1 = rnd() < p1 ? 1 : 0;
  const collapsed = state.map((amp, i) => (((i & mask) !== 0 ? 1 : 0) === outcome ? amp : ([0, 0] as C)));
  const norm = Math.sqrt(collapsed.reduce((sum, a) => sum + cAbs2(a), 0));
  const newState = norm > 0 ? collapsed.map((a) => cScale(a, 1 / norm)) : collapsed;
  return { outcome, newState };
}

/** |⟨ψ|φ⟩|² dla dwuwymiarowych (jednokubitowych) stanów — wierność (fidelity) teleportacji. */
export function stateOverlapSquared(psi: [C, C], phi: [C, C]): number {
  const re = psi[0][0] * phi[0][0] + psi[0][1] * phi[0][1] + psi[1][0] * phi[1][0] + psi[1][1] * phi[1][1];
  const im = psi[0][0] * phi[0][1] - psi[0][1] * phi[0][0] + psi[1][0] * phi[1][1] - psi[1][1] * phi[1][0];
  return re * re + im * im;
}

export type Correction = 'I' | 'X' | 'Z' | 'XZ';

export interface TeleportResult {
  outcome0: 0 | 1;
  outcome1: 0 | 1;
  correction: Correction;
  finalQubit: [C, C];
  fidelity: number;
}

/**
 * Protokół teleportacji kwantowej (Bennett, Brassard, Crépeau, Jozsa,
 * Peres, Wootters 1993, PRL 70, 1895): Alice ma nieznany stan
 * α|0⟩+β|1⟩ (kubit 0) i połowę splątanej pary Bell (kubit 1); Bob ma
 * drugą połowę (kubit 2). Po CNOT+H Alice i pomiarze obu jej kubitów,
 * przesłanie 2 bitów klasycznych i odpowiednia korekta (I/X/Z/XZ)
 * odtwarza DOKŁADNIE oryginalny stan na kubicie Boba — zweryfikowane
 * numerycznie dla wszystkich 4 gałęzi pomiaru przed napisaniem testów
 * (fidelity=1 dokładnie w każdej z nich). Oryginalny stan jest przy tym
 * ZNISZCZONY na kubicie Alice (pomiar) — to nie kopiowanie (złamałoby
 * twierdzenie o zakazie klonowania), tylko PRZENIESIENIE stanu.
 * Wymaga 2 bitów KLASYCZNYCH (nie szybszych niż światło) — bez korekty
 * Bob widzi czysty szum, nie ma dostępu do żadnej informacji.
 */
export function teleport(alpha: C, beta: C, rnd: () => number = Math.random): TeleportResult {
  const n = 3;
  let state = initState(n);
  state[0] = alpha; // |000⟩
  state[4] = beta; // |100⟩ — kubit 0 = α|0⟩+β|1⟩, kubity 1,2 = |0⟩

  state = applySingleQubitGate(state, n, 1, H_GATE);
  state = applyCNOT(state, n, 1, 2); // para Bell między kubitem Alice (1) a kubitem Boba (2)
  state = applyCNOT(state, n, 0, 1);
  state = applySingleQubitGate(state, n, 0, H_GATE);

  const m0 = measureQubit(state, n, 0, rnd);
  state = m0.newState;
  const m1 = measureQubit(state, n, 1, rnd);
  state = m1.newState;

  const idx0 = (m0.outcome << 2) | (m1.outcome << 1) | 0;
  const idx1 = (m0.outcome << 2) | (m1.outcome << 1) | 1;
  let qubit2: [C, C] = [state[idx0], state[idx1]];

  let correction: Correction = 'I';
  const apply1 = (gate: [C, C, C, C], amp: [C, C]): [C, C] => {
    const [a, b, c, d] = gate;
    return [cAdd(cMul(a, amp[0]), cMul(b, amp[1])), cAdd(cMul(c, amp[0]), cMul(d, amp[1]))];
  };
  if (m0.outcome === 0 && m1.outcome === 1) {
    qubit2 = apply1(X_GATE, qubit2);
    correction = 'X';
  } else if (m0.outcome === 1 && m1.outcome === 0) {
    qubit2 = apply1(Z_GATE, qubit2);
    correction = 'Z';
  } else if (m0.outcome === 1 && m1.outcome === 1) {
    qubit2 = apply1(X_GATE, qubit2);
    qubit2 = apply1(Z_GATE, qubit2);
    correction = 'XZ';
  }

  const norm = Math.sqrt(cAbs2(qubit2[0]) + cAbs2(qubit2[1]));
  const normalized: [C, C] = norm > 0 ? [cScale(qubit2[0], 1 / norm), cScale(qubit2[1], 1 / norm)] : qubit2;
  const fidelity = stateOverlapSquared([alpha, beta], normalized);

  return { outcome0: m0.outcome, outcome1: m1.outcome, correction, finalQubit: normalized, fidelity };
}
