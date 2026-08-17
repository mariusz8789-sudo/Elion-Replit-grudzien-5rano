/**
 * Porównanie dwóch modeli epidemicznych A vs B (PRIORYTET 5 / FAZA 1).
 *
 * REUSE, nie nowy silnik: uruchamia ten sam, przetestowany `simulateEpidemic`
 * (core/epidemic/sir.ts) dla dwóch konfiguracji parametrów i liczy różnice
 * kluczowych wielkości (szczyt, dzień szczytu, łączna liczba zakażonych,
 * zgony). Czysta i deterministyczna — te same wejścia dają ten sam wynik,
 * więc jest w pełni testowalna.
 */

import { simulateEpidemic, DEFAULT_EPIDEMIC, type EpidemicParams, type EpidemicResult } from './sir';

export interface ModelConfig {
  label: string;
  params: EpidemicParams;
}

export interface MetricDiff {
  a: number;
  b: number;
  /** b − a. */
  delta: number;
  /** Zmiana względna b vs a w procentach (null, gdy a == 0). */
  pct: number | null;
}

export interface CompareDiff {
  peakInfected: MetricDiff;
  peakDay: MetricDiff;
  totalInfected: MetricDiff;
  finalDead: MetricDiff;
}

export interface CompareResult {
  a: { config: ModelConfig; result: EpidemicResult };
  b: { config: ModelConfig; result: EpidemicResult };
  diff: CompareDiff;
  days: number;
}

function metric(a: number, b: number): MetricDiff {
  return { a, b, delta: b - a, pct: a !== 0 ? ((b - a) / a) * 100 : null };
}

/** Domyślny scenariusz porównania z dyrektywy: SIR R0=1.5 vs SIR R0=3.0. */
export function defaultComparison(): { a: ModelConfig; b: ModelConfig } {
  return {
    a: { label: 'Model A · SIR R₀=1.5', params: { ...DEFAULT_EPIDEMIC, model: 'SIR', r0: 1.5 } },
    b: { label: 'Model B · SIR R₀=3.0', params: { ...DEFAULT_EPIDEMIC, model: 'SIR', r0: 3.0 } },
  };
}

export function compareEpidemic(a: ModelConfig, b: ModelConfig, days = 200, dt = 0.25): CompareResult {
  const ra = simulateEpidemic(a.params, days, dt);
  const rb = simulateEpidemic(b.params, days, dt);
  return {
    a: { config: a, result: ra },
    b: { config: b, result: rb },
    diff: {
      peakInfected: metric(ra.peakInfected, rb.peakInfected),
      peakDay: metric(ra.peakDay, rb.peakDay),
      totalInfected: metric(ra.totalInfected, rb.totalInfected),
      finalDead: metric(ra.finalDead, rb.finalDead),
    },
    days,
  };
}
