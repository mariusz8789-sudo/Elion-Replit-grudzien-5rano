/**
 * Model Isinga 2D (siatka kwadratowa, J=1, brak pola zewnętrznego) —
 * jedyny nietrywialny model przejścia fazowego z DOKŁADNYM rozwiązaniem
 * analitycznym (Onsager 1944, Phys. Rev. 65, 117). Krytyczna temperatura
 * i spontaniczna magnetyzacja poniżej niej to nie dopasowanie ani
 * przybliżenie — to twierdzenie matematyczne, względem którego symulacja
 * Monte Carlo (algorytm Metropolisa) może być uczciwie zweryfikowana.
 *
 * Sanity check wbudowany w samą definicję stałych (sprawdzony i w kodzie,
 * i w testach): przy T=T_c mamy sinh(2/T_c) = sinh(ln(1+√2)) DOKŁADNIE 1,
 * co daje ciągłe przejście magnetyzacji do zera — formuła Onsagera i
 * temperatura krytyczna są ze sobą spójne z konstrukcji, nie przez
 * przypadek.
 */

/** Dokładna temperatura krytyczna (jednostki J/k_B=1): T_c = 2/ln(1+√2) ≈ 2,269. */
export const ISING_TC = 2 / Math.log(1 + Math.sqrt(2));

/**
 * Dokładna spontaniczna magnetyzacja poniżej T_c (Onsager 1944; wzór w tej
 * postaci: Yang 1952, Phys. Rev. 85, 808): M(T) = [1−sinh⁻⁴(2/T)]^(1/8).
 * Zero dla T≥T_c (paramagnetyk, brak uporządkowania dalekiego zasięgu).
 */
export function isingExactMagnetization(temperature: number): number {
  if (temperature <= 0) return 1;
  if (temperature >= ISING_TC) return 0;
  const s = Math.sinh(2 / temperature);
  return Math.pow(Math.max(0, 1 - Math.pow(s, -4)), 1 / 8);
}

/** Suma czterech sąsiadów (periodyczne warunki brzegowe) na siatce n×n spłaszczonej wierszami. */
export function isingNeighborSum(lattice: Int8Array, n: number, i: number, j: number): number {
  const up = lattice[((i - 1 + n) % n) * n + j];
  const down = lattice[((i + 1) % n) * n + j];
  const left = lattice[i * n + ((j - 1 + n) % n)];
  const right = lattice[i * n + ((j + 1) % n)];
  return up + down + left + right;
}

/**
 * Jedna próba algorytmu Metropolisa (Metropolis i in. 1953): losowy spin,
 * ΔE = 2·J·s·(suma sąsiadów), akceptacja z prawdopodobieństwem
 * min(1, e^(−ΔE/T)). n² takich prób = jeden "zamach" (sweep) po siatce.
 */
export function isingMetropolisStep(
  lattice: Int8Array,
  n: number,
  temperature: number,
  rnd: () => number = Math.random,
): void {
  const i = Math.floor(rnd() * n);
  const j = Math.floor(rnd() * n);
  const s = lattice[i * n + j];
  const neighborSum = isingNeighborSum(lattice, n, i, j);
  const dE = 2 * s * neighborSum;
  if (dE <= 0 || rnd() < Math.exp(-dE / temperature)) {
    lattice[i * n + j] = -s;
  }
}

/** Magnetyzacja na spin, |M|/N² ∈ [0,1]. */
export function isingMagnetization(lattice: Int8Array): number {
  let sum = 0;
  for (let k = 0; k < lattice.length; k++) sum += lattice[k];
  return Math.abs(sum) / lattice.length;
}

/** Energia na spin (J=1); każdy bond liczony raz (sąsiedzi w prawo i w dół). Stan podstawowy (wszystkie zgodne) = −2. */
export function isingEnergyPerSite(lattice: Int8Array, n: number): number {
  let e = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const s = lattice[i * n + j];
      const right = lattice[i * n + ((j + 1) % n)];
      const down = lattice[((i + 1) % n) * n + j];
      e += -s * right - s * down;
    }
  }
  return e / lattice.length;
}

/** Losowa siatka startowa (nieskorelowana, jak przy T=∞). */
export function isingRandomLattice(n: number, rnd: () => number = Math.random): Int8Array {
  const lattice = new Int8Array(n * n);
  for (let k = 0; k < lattice.length; k++) lattice[k] = rnd() < 0.5 ? 1 : -1;
  return lattice;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export interface IsingMetropolisScenarioResult {
  temperature: number;
  latticeSize: number;
  sweeps: number;
  seed: number;
  magnetization: number;
  energyPerSite: number;
  exactMagnetization: number;
  magnetizationDelta: number;
}

/**
 * Odtwarzalny run tego samego 2D Isinga J=1 i Metropolisa co Canvas.
 * Służy do Evidence/Experiment Fabric, więc seed i horyzont są jawne;
 * nie zastępuje długiego uśredniania termodynamicznego ani analizy błędów.
 */
export function runIsingMetropolisScenario({
  temperature = 2,
  latticeSize = 42,
  sweeps = 100,
  seed = 20_260_819,
}: {
  temperature?: number;
  latticeSize?: number;
  sweeps?: number;
  seed?: number;
} = {}): IsingMetropolisScenarioResult {
  if (!Number.isFinite(temperature) || temperature < 0.5 || temperature > 5) {
    throw new Error('temperature musi być skończoną liczbą z zakresu 0.5–5.');
  }
  if (!Number.isInteger(latticeSize) || latticeSize < 4 || latticeSize > 128) {
    throw new Error('latticeSize musi być liczbą całkowitą z zakresu 4–128.');
  }
  if (!Number.isInteger(sweeps) || sweeps < 1 || sweeps > 2_000) {
    throw new Error('sweeps musi być liczbą całkowitą z zakresu 1–2000.');
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error('seed musi być 32-bitową nieujemną liczbą całkowitą.');
  }
  const random = mulberry32(seed);
  const lattice = isingRandomLattice(latticeSize, random);
  for (let step = 0; step < sweeps * latticeSize * latticeSize; step++) {
    isingMetropolisStep(lattice, latticeSize, temperature, random);
  }
  const magnetization = isingMagnetization(lattice);
  const exactMagnetization = isingExactMagnetization(temperature);
  return {
    temperature,
    latticeSize,
    sweeps,
    seed,
    magnetization,
    energyPerSite: isingEnergyPerSite(lattice, latticeSize),
    exactMagnetization,
    magnetizationDelta: Math.abs(magnetization - exactMagnetization),
  };
}
