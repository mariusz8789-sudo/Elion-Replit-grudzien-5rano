/**
 * Symulacja Monte Carlo "rozrzutu konsekwencji" jednej ścieżki decyzyjnej —
 * realna matematyka (dyskretny proces Wienera z dryfem, standardowy model
 * używany m.in. w finansach do modelowania niepewności w czasie), NIE
 * przewidywanie przyszłości. Kluczowa, uczciwa własność matematyczna, którą
 * ten moduł demonstruje: niepewność ROŚNIE jak √czasu (odchylenie
 * standardowe wyniku po czasie t wynosi volatility·√t), nie liniowo — to
 * dokładnie ten sam mechanizm co dyfuzja czy błądzenie losowe w fizyce
 * (por. `core/physics.ts` dla analogicznych, prawdziwych zjawisk fizycznych).
 * Wejścia (`driftPerYear`, `volatilityPerYear`) pochodzą WYŁĄCZNIE z
 * własnych, jawnych ocen użytkownika (`Branch.tone`, `Decision.weight`) —
 * ten moduł nie zgaduje niczego o realnym świecie.
 */

export interface TrajectoryPoint {
  t: number;
  v: number;
}

export type Trajectory = TrajectoryPoint[];

/**
 * Standardowa transformacja Boxa–Mullera: zamienia dwie liczby losowe z
 * rozkładu jednostajnego [0,1) na jedną liczbę z rozkładu normalnego N(0,1).
 */
export function gaussianRandom(rnd: () => number = Math.random): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Jedna symulowana trajektoria: v(t+dt) = v(t) + drift·dt + volatility·√dt·Z,
 * Z~N(0,1) — dyskretyzacja procesu Wienera z dryfem (Euler–Maruyama, ten
 * sam schemat co symulacja ruchów Browna w fizyce/finansach).
 */
export function simulateTrajectory(
  years: number,
  driftPerYear: number,
  volatilityPerYear: number,
  steps: number,
  rnd: () => number = Math.random,
): Trajectory {
  const dt = years / steps;
  let v = 0;
  const path: Trajectory = [{ t: 0, v: 0 }];
  for (let i = 1; i <= steps; i++) {
    const z = gaussianRandom(rnd);
    v += driftPerYear * dt + volatilityPerYear * Math.sqrt(dt) * z;
    path.push({ t: i * dt, v });
  }
  return path;
}

export interface MonteCarloBundle {
  trajectories: Trajectory[];
  finalValues: number[];
  meanFinal: number;
  stdFinal: number;
  /** Ułamek symulacji, w których |wynik końcowy| przekroczył jedno teoretyczne odchylenie standardowe. */
  significantFraction: number;
}

export interface MonteCarloOptions {
  paths?: number;
  steps?: number;
  rnd?: () => number;
}

export function runMonteCarlo(
  years: number,
  driftPerYear: number,
  volatilityPerYear: number,
  opts: MonteCarloOptions = {},
): MonteCarloBundle {
  const paths = opts.paths ?? 60;
  const steps = opts.steps ?? Math.max(12, Math.round(years * 6));
  const rnd = opts.rnd ?? Math.random;
  const trajectories: Trajectory[] = [];
  const finalValues: number[] = [];
  for (let p = 0; p < paths; p++) {
    const traj = simulateTrajectory(years, driftPerYear, volatilityPerYear, steps, rnd);
    trajectories.push(traj);
    finalValues.push(traj[traj.length - 1].v);
  }
  const meanFinal = finalValues.reduce((a, b) => a + b, 0) / finalValues.length;
  const variance = finalValues.reduce((a, b) => a + (b - meanFinal) ** 2, 0) / finalValues.length;
  const stdFinal = Math.sqrt(variance);
  const theoreticalStd = volatilityPerYear * Math.sqrt(years);
  const significantFraction =
    theoreticalStd > 0 ? finalValues.filter((v) => Math.abs(v) > theoreticalStd).length / finalValues.length : 0;
  return { trajectories, finalValues, meanFinal, stdFinal, significantFraction };
}

/**
 * Mapuje jawne, subiektywne oceny użytkownika (waga decyzji 1-10, ton
 * odgałęzienia -5..+5) na parametry symulacji. Stałe dobrane tak, by
 * zakres wyjściowy był czytelny wizualnie — to ZAŁOŻENIE MODELOWE, nie
 * zmierzona wielkość, jawnie nazwane w `knowledge/quantum-decision-explorer.md`.
 */
export function branchToSimParams(decisionWeight: number, branchTone: number): { drift: number; volatility: number } {
  const volatility = 0.15 + (decisionWeight / 10) * 0.35;
  const drift = (branchTone / 5) * 0.3;
  return { drift, volatility };
}
