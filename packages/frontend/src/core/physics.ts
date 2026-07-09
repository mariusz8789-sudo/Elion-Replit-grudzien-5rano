/**
 * Czyste funkcje fizyczne Genesis OS — wspólne dla symulacji i testów.
 * Zero zależności od UI. Każda funkcja odpowiada wzorowi z knowledge/.
 */

/** Czynnik Lorentza γ = 1/√(1−β²). */
export function lorentzGamma(beta: number): number {
  return 1 / Math.sqrt(1 - beta * beta);
}

/** Czas zdarzenia w układzie ruchomym: ct' = γ(ct − βx). */
export function lorentzTime(ct: number, x: number, beta: number): number {
  return lorentzGamma(beta) * (ct - beta * x);
}

/** Pozycje obrazów soczewki punktowej (w jednostkach θ_E): θ± = ½(β ± √(β²+4)). */
export function lensImagePositions(beta: number): [number, number] {
  const d = Math.sqrt(beta * beta + 4);
  return [0.5 * (beta + d), 0.5 * (beta - d)];
}

/** Łączne wzmocnienie mikrosoczewkowania: A(u) = (u²+2)/(u√(u²+4)). */
export function lensAmplification(u: number): number {
  const uu = Math.max(u, 1e-9);
  return (uu * uu + 2) / (uu * Math.sqrt(uu * uu + 4));
}

/** Prawo rozpadu: ułamek pozostały po t okresach półtrwania. */
export function decayRemaining(halfLives: number): number {
  return Math.pow(0.5, halfLives);
}

/** Moc cywilizacji wg wzoru Sagana: P = 10^(10K+6) W. */
export function kardashevPower(K: number): number {
  return Math.pow(10, 10 * K + 6);
}

/** Promień Schwarzschilda r_s = 2GM/c² [m] dla masy w kg. */
export function schwarzschildRadius(massKg: number): number {
  const G = 6.674e-11;
  const C = 2.998e8;
  return (2 * G * massKg) / (C * C);
}

/**
 * Korelacja spinowa singletu: E(a,b) = −cos(a−b) — dokładny wynik MK
 * dla pomiarów spinu pod kątami a, b (radiany).
 */
export function singletCorrelation(a: number, b: number): number {
  return -Math.cos(a - b);
}

/**
 * Wartość CHSH: S = E(a,b) − E(a,b') + E(a',b) + E(a',b').
 * Lokalny realizm: |S| ≤ 2. Mechanika kwantowa: |S| ≤ 2√2 (granica Tsirelsona).
 */
export function chshS(
  E: (x: number, y: number) => number,
  a: number,
  aP: number,
  b: number,
  bP: number,
): number {
  return E(a, b) - E(a, bP) + E(aP, b) + E(aP, bP);
}

/**
 * Losowanie pary wyników pomiaru singletu (A, B ∈ {−1, +1}) zgodnie z MK:
 * ⟨AB⟩ = −cos(a−b), rozkłady brzegowe 50/50.
 */
export function sampleSingletPair(a: number, b: number, rnd: () => number = Math.random): [number, number] {
  const A = rnd() < 0.5 ? 1 : -1;
  const pSame = (1 + singletCorrelation(a, b)) / 2; // P(B = A)
  const B = rnd() < pSame ? A : -A;
  return [A, B];
}

/**
 * Model lokalnych ukrytych zmiennych: wspólna zmienna λ ~ U(0, 2π),
 * wynik deterministyczny sign(cos(θ−λ)). Daje korelację trójkątną
 * E(Δ) = −1 + 2Δ/π (dla Δ∈[0,π]) i nigdy nie łamie |S| ≤ 2.
 */
export function sampleLocalHiddenPair(a: number, b: number, rnd: () => number = Math.random): [number, number] {
  const lambda = rnd() * Math.PI * 2;
  const sign = (x: number) => (Math.cos(x) >= 0 ? 1 : -1);
  return [sign(a - lambda), -sign(b - lambda)];
}

/**
 * Anomalia mimośrodowa E z równania Keplera M = E − e·sinE, metodą Newtona
 * (8 iteracji — zbiega kwadratowo, błąd <1e-10 rad dla e<0.99, czyli dla
 * wszystkich planet Układu Słonecznego z dużym zapasem).
 */
export function solveKepler(meanAnomaly: number, e: number): number {
  let E = meanAnomaly;
  for (let i = 0; i < 8; i++) {
    E -= (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
  }
  return E;
}

/** Pozycja heliocentryczna [AU] na orbicie eliptycznej o półosi a i mimośrodzie e. */
export function keplerPosition(semiMajorAxisAu: number, eccentricity: number, meanAnomaly: number): { x: number; y: number } {
  const E = solveKepler(meanAnomaly, eccentricity);
  return {
    x: semiMajorAxisAu * (Math.cos(E) - eccentricity),
    y: semiMajorAxisAu * Math.sqrt(1 - eccentricity ** 2) * Math.sin(E),
  };
}
