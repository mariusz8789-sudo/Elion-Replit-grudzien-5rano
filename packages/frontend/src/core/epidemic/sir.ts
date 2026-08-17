/**
 * Silnik epidemiczny — modele przedziałowe SIR / SEIR / SEIRD (DEMO B).
 *
 * REALNY model obliczeniowy, nie atrapa: układ równań różniczkowych zwyczajnych
 * całkowany metodą Runge-Kutty 4. rzędu (RK4). Deterministyczny i testowalny
 * (inwarianty: zachowanie populacji, próg epidemiczny R0). Patogen jest
 * ABSTRAKCYJNY („Pathogen X") — model edukacyjny/systemowy, NIGDY nie odwzorowuje
 * konkretnego, realnego patogenu ani nie służy do jego projektowania.
 *
 * Force of infection: λ = β·I/N₀ (mieszanie jednorodne, N₀ stałe). β = R0/D_inf.
 * Interwencja (dystans społeczny): od dnia `interventionDay` β zredukowane o
 * `interventionEffect` (0..1) — to jest dźwignia „co jeśli?"/A-B.
 */

export type EpidemicModel = 'SIR' | 'SEIR' | 'SEIRD';

export interface EpidemicParams {
  model: EpidemicModel;
  /** Całkowita populacja N₀ (stała). */
  population: number;
  /** Początkowa liczba zakażonych. */
  initialInfected: number;
  /** Podstawowa liczba reprodukcji R0 (β = R0/D_inf). */
  r0: number;
  /** Średni czas zakaźności D_inf [dni] (γ = 1/D_inf). */
  infectiousDays: number;
  /** Średni czas inkubacji [dni] (σ = 1/incub) — SEIR/SEIRD. */
  incubationDays: number;
  /** Śmiertelność zakażeń IFR [0..1] — SEIRD. */
  ifr: number;
  /** Dzień startu interwencji (dystans społeczny). 0 = brak. */
  interventionDay: number;
  /** Skuteczność interwencji [0..1] — o tyle redukuje β od interventionDay. */
  interventionEffect: number;
}

export interface Compartments { S: number; E: number; I: number; R: number; D: number }
export interface EpidemicPoint extends Compartments { t: number }

export interface EpidemicResult {
  series: EpidemicPoint[];
  peakInfected: number;
  peakDay: number;
  totalInfected: number; // R+D+I na końcu minus początkowe ozdrowienia (~ ci, którzy przeszli)
  finalDead: number;
  /** Efektywny współczynnik β(t=0) po ewentualnej interwencji na starcie. */
  beta0: number;
}

export const DEFAULT_EPIDEMIC: EpidemicParams = {
  model: 'SEIR',
  population: 100_000,
  initialInfected: 20,
  r0: 2.5,
  infectiousDays: 7,
  incubationDays: 3,
  ifr: 0.01,
  interventionDay: 0,
  interventionEffect: 0,
};

/** β w chwili t z uwzględnieniem interwencji. */
export function betaAt(p: EpidemicParams, t: number): number {
  const base = p.r0 / Math.max(1e-6, p.infectiousDays);
  if (p.interventionDay > 0 && t >= p.interventionDay) {
    return base * (1 - clamp01(p.interventionEffect));
  }
  return base;
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

/** Pochodne układu przedziałowego dla danego modelu. */
export function derivatives(c: Compartments, p: EpidemicParams, t: number): Compartments {
  const N0 = Math.max(1, p.population);
  const beta = betaAt(p, t);
  const gamma = 1 / Math.max(1e-6, p.infectiousDays);
  const sigma = 1 / Math.max(1e-6, p.incubationDays);
  const lambda = (beta * c.I) / N0; // siła zakażenia

  if (p.model === 'SIR') {
    const newInf = lambda * c.S;
    return { S: -newInf, E: 0, I: newInf - gamma * c.I, R: gamma * c.I, D: 0 };
  }
  // SEIR / SEIRD
  const newExp = lambda * c.S;
  const onset = sigma * c.E;
  if (p.model === 'SEIR') {
    return { S: -newExp, E: newExp - onset, I: onset - gamma * c.I, R: gamma * c.I, D: 0 };
  }
  // SEIRD — część ozdrowieńców umiera wg IFR
  const ifr = clamp01(p.ifr);
  const leaveI = gamma * c.I;
  return { S: -newExp, E: newExp - onset, I: onset - leaveI, R: (1 - ifr) * leaveI, D: ifr * leaveI };
}

function addScaled(a: Compartments, b: Compartments, h: number): Compartments {
  return { S: a.S + b.S * h, E: a.E + b.E * h, I: a.I + b.I * h, R: a.R + b.R * h, D: a.D + b.D * h };
}

/** Jeden krok RK4 o długości h [dni]. Eksportowany dla testów. */
export function rk4Step(c: Compartments, p: EpidemicParams, t: number, h: number): Compartments {
  const k1 = derivatives(c, p, t);
  const k2 = derivatives(addScaled(c, k1, h / 2), p, t + h / 2);
  const k3 = derivatives(addScaled(c, k2, h / 2), p, t + h / 2);
  const k4 = derivatives(addScaled(c, k3, h), p, t + h);
  return {
    S: c.S + (h / 6) * (k1.S + 2 * k2.S + 2 * k3.S + k4.S),
    E: c.E + (h / 6) * (k1.E + 2 * k2.E + 2 * k3.E + k4.E),
    I: c.I + (h / 6) * (k1.I + 2 * k2.I + 2 * k3.I + k4.I),
    R: c.R + (h / 6) * (k1.R + 2 * k2.R + 2 * k3.R + k4.R),
    D: c.D + (h / 6) * (k1.D + 2 * k2.D + 2 * k3.D + k4.D),
  };
}

export function initialState(p: EpidemicParams): Compartments {
  const I0 = Math.max(0, Math.min(p.initialInfected, p.population));
  return { S: p.population - I0, E: 0, I: I0, R: 0, D: 0 };
}

/**
 * Pełny przebieg epidemii przez `days` dni z krokiem `dt` (RK4). Zwraca serię
 * czasową i statystyki (szczyt, łączna liczba zakażonych, zgony).
 */
export function simulateEpidemic(p: EpidemicParams, days = 200, dt = 0.25): EpidemicResult {
  let c = initialState(p);
  const series: EpidemicPoint[] = [{ t: 0, ...c }];
  let peakInfected = c.I;
  let peakDay = 0;
  const steps = Math.max(1, Math.round(days / dt));
  for (let i = 1; i <= steps; i++) {
    const t = i * dt;
    c = rk4Step(c, p, t - dt, dt);
    // Zabezpieczenie numeryczne: przedziały nieujemne.
    c = { S: Math.max(0, c.S), E: Math.max(0, c.E), I: Math.max(0, c.I), R: Math.max(0, c.R), D: Math.max(0, c.D) };
    if (Number.isInteger(t) || i === steps) series.push({ t, ...c });
    if (c.I > peakInfected) { peakInfected = c.I; peakDay = t; }
  }
  const last = series[series.length - 1];
  return {
    series,
    peakInfected,
    peakDay,
    totalInfected: last.R + last.D + last.I,
    finalDead: last.D,
    beta0: betaAt(p, 0),
  };
}
