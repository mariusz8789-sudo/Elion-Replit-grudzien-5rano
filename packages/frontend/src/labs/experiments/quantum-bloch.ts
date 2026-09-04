/**
 * Sfera Blocha — kubit jako pełny stan kwantowy (wektor zespolony 2D),
 * bramki jako dokładne macierze unitarne. Dekoherencja: kurczenie wektora
 * Blocha (model dephasing/depolaryzacji — fenomenologiczny).
 *
 * Ten plik to WYŁĄCZNIE czysta matematyka (testowalna bez DOM/WebGL) —
 * prezentacja (Sim3D, sfera 3D, przyciski bramek) jest w quantum-bloch-3d.ts,
 * ten sam podział co core/physics.ts vs einstein-blackhole-3d.ts.
 */

export type C = [number, number]; // [re, im]

export const GATES: Record<string, [C, C, C, C]> = {
  // [a b; c d] jako [a, b, c, d]
  H: [[1 / Math.SQRT2, 0], [1 / Math.SQRT2, 0], [1 / Math.SQRT2, 0], [-1 / Math.SQRT2, 0]],
  X: [[0, 0], [1, 0], [1, 0], [0, 0]],
  Y: [[0, 0], [0, -1], [0, 1], [0, 0]],
  Z: [[1, 0], [0, 0], [0, 0], [-1, 0]],
  S: [[1, 0], [0, 0], [0, 0], [0, 1]],
  T: [[1, 0], [0, 0], [0, 0], [Math.SQRT1_2, Math.SQRT1_2]],
};

const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];

/** Zastosowanie bramki (macierzy unitarnej) do stanu [amplituda|0⟩, amplituda|1⟩] — czysta funkcja, eksportowana dla testów. */
export function applyGate(state: [C, C], gate: string): [C, C] {
  const m = GATES[gate];
  if (!m) return state;
  const [a, b] = state;
  return [add(mul(m[0], a), mul(m[1], b)), add(mul(m[2], a), mul(m[3], b))];
}

/** Zastosowanie sekwencji bramek w podanej kolejności — czysta funkcja, eksportowana dla testów. */
export function applyCircuit(state: [C, C], gates: string[]): [C, C] {
  return gates.reduce((s, g) => applyGate(s, g), state);
}

/** Wektor Blocha (x,y,z) odpowiadający stanowi [amplituda|0⟩, amplituda|1⟩] — dla stanu czystego ma długość 1. */
export function blochVector(a: C, b: C): [number, number, number] {
  const [ar, ai] = a;
  const [br, bi] = b;
  const x = 2 * (ar * br + ai * bi);
  const y = 2 * (ar * bi - ai * br);
  const z = ar * ar + ai * ai - (br * br + bi * bi);
  return [x, y, z];
}

/**
 * Obrót wektora (x,y,z) o kąt `angleRad` wokół jednostkowej osi `axis`
 * (wzór Rodriguesa) — czysta funkcja algebry liniowej, użyta do animacji
 * ciągłego obrotu sfery Blocha (patrz GATE_ROTATIONS).
 */
export function rotateVector(
  v: [number, number, number],
  axis: [number, number, number],
  angleRad: number,
): [number, number, number] {
  const [x, y, z] = v;
  const [ax, ay, az] = axis;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dot = x * ax + y * ay + z * az;
  const crossX = ay * z - az * y;
  const crossY = az * x - ax * z;
  const crossZ = ax * y - ay * x;
  return [
    x * cos + crossX * sin + ax * dot * (1 - cos),
    y * cos + crossY * sin + ay * dot * (1 - cos),
    z * cos + crossZ * sin + az * dot * (1 - cos),
  ];
}

/**
 * Oś i kąt obrotu wektora Blocha odpowiadające każdej bramce — z homomorfizmu
 * SU(2)→SO(3): KAŻDA jednokubitowa bramka unitarna działa na wektor Blocha
 * jako DOKŁADNY obrót o kąt θ wokół osi n (nie przybliżenie). Wartości
 * wyprowadzone analitycznie z macierzy w GATES (rozkład na SU(2) przez
 * usunięcie globalnej fazy) i zweryfikowane w quantumBloch.test.ts przez
 * porównanie z applyGate dla wielu losowych stanów — animacja ciągłego
 * obrotu (quantum-bloch-3d.ts) i skokowa ewolucja macierzowa (applyGate) nie
 * mogą się rozjechać, bo to DOKŁADNIE ten sam obrót, tylko sparametryzowany
 * w czasie zamiast zaaplikowany jednym krokiem.
 */
export const GATE_ROTATIONS: Record<string, { axis: [number, number, number]; angleRad: number }> = {
  X: { axis: [1, 0, 0], angleRad: Math.PI },
  Y: { axis: [0, 1, 0], angleRad: Math.PI },
  Z: { axis: [0, 0, 1], angleRad: Math.PI },
  S: { axis: [0, 0, 1], angleRad: Math.PI / 2 },
  T: { axis: [0, 0, 1], angleRad: Math.PI / 4 },
  H: { axis: [1 / Math.SQRT2, 0, 1 / Math.SQRT2], angleRad: Math.PI },
};

export interface BlochCircuitScenarioResult {
  gates: readonly string[];
  finalAmplitude0: C;
  finalAmplitude1: C;
  probability0: number;
  probability1: number;
  bloch: readonly [number, number, number];
  normSquared: number;
}

/** Waliduje i kanonizuje ograniczony alfabet bramek używany przez Canvas oraz Fabric. */
export function parseSingleQubitCircuit(circuit: unknown): string[] {
  if (typeof circuit !== 'string' || circuit.trim().length === 0 || circuit.length > 128) {
    throw new Error('circuit musi być niepustym tekstem do 128 znaków.');
  }
  const gates = circuit.toUpperCase().split(/[\s,;>→-]+/).filter(Boolean);
  if (gates.length === 0 || gates.length > 32) {
    throw new Error('circuit musi zawierać od 1 do 32 bramek.');
  }
  const unknown = gates.find((gate) => GATES[gate] === undefined);
  if (unknown) {
    throw new Error(`Nieobsługiwana bramka jednokubitowa: ${unknown}. Dozwolone: ${Object.keys(GATES).join(', ')}.`);
  }
  return gates;
}

/**
 * Deterministyczny obwód jednokubitowy startujący w |0⟩. Wykorzystuje te
 * same bramki unitarne co wizualizacja sfery Blocha; zwraca amplitudy i
 * prawdopodobieństwa, ale nie losuje pojedynczego wyniku pomiaru.
 */
export function runBlochCircuitScenario({ circuit = 'H' }: { circuit?: string } = {}): BlochCircuitScenarioResult {
  const gates = parseSingleQubitCircuit(circuit);
  const [finalAmplitude0, finalAmplitude1] = applyCircuit([[1, 0], [0, 0]], gates);
  const probability0 = finalAmplitude0[0] ** 2 + finalAmplitude0[1] ** 2;
  const probability1 = finalAmplitude1[0] ** 2 + finalAmplitude1[1] ** 2;
  return {
    gates,
    finalAmplitude0,
    finalAmplitude1,
    probability0,
    probability1,
    bloch: blochVector(finalAmplitude0, finalAmplitude1),
    normSquared: probability0 + probability1,
  };
}

