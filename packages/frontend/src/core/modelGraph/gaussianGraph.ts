import { ModelGraph } from './graph';

/**
 * Mathematics Lab × Graf Modeli — rozkład normalny (Priorytet 1). Gęstość
 * prawdopodobieństwa i wartość standaryzowana z są DOKŁADNE; prawdopodobieństwo
 * w przedziale ±|z| korzysta z funkcji błędu erf liczonej PRZYBLIŻENIEM
 * numerycznym (Abramowitz–Stegun 7.1.26, błąd < 1,5·10⁻⁷) — stąd derivation
 * 'approximate' dla tego węzła.
 */

const SQRT_2PI = Math.sqrt(2 * Math.PI);

/** Funkcja błędu — przybliżenie Abramowitz–Stegun 7.1.26 (|błąd| < 1,5·10⁻⁷). */
export function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return Math.sign(x) * y;
}

export const BASELINE_MEAN = 0;
export const BASELINE_SIGMA = 1;
export const BASELINE_X = 1;

export function buildGaussianGraph(): ModelGraph {
  const g = new ModelGraph();

  g.addNode(
    { id: 'mean', label: 'Średnia μ', unit: '', domain: 'statystyka', honesty: 'exact',
      honestyNote: 'Wartość oczekiwana rozkładu — zadana.', derivation: 'direct',
      inputs: [], compute: (i) => i.mean ?? BASELINE_MEAN, formula: 'μ (parametr)' },
    BASELINE_MEAN,
  );
  g.addNode(
    { id: 'sigma', label: 'Odchylenie standardowe σ', unit: '', domain: 'statystyka', honesty: 'exact',
      honestyNote: 'Rozrzut rozkładu (σ>0) — zadany.', derivation: 'direct',
      inputs: [], compute: (i) => Math.max(1e-6, i.sigma ?? BASELINE_SIGMA), formula: 'σ (parametr)' },
    BASELINE_SIGMA,
  );
  g.addNode(
    { id: 'xValue', label: 'Punkt x', unit: '', domain: 'statystyka', honesty: 'exact',
      honestyNote: 'Punkt, w którym oceniamy rozkład — zadany.', derivation: 'direct',
      inputs: [], compute: (i) => i.xValue ?? BASELINE_X, formula: 'x (parametr)' },
    BASELINE_X,
  );

  g.addNode({
    id: 'zScore', label: 'Wartość standaryzowana z', unit: 'σ', domain: 'statystyka', honesty: 'exact',
    honestyNote: 'z = (x−μ)/σ — o ile odchyleń standardowych x jest od średniej. Dokładne.',
    derivation: 'direct', inputs: ['xValue', 'mean', 'sigma'], compute: (i) => (i.xValue - i.mean) / i.sigma,
    formula: 'z = (x−μ)/σ',
  });
  g.addNode({
    id: 'pdfValue', label: 'Gęstość prawdopodobieństwa f(x)', unit: '', domain: 'statystyka', honesty: 'exact',
    honestyNote: 'f(x) = e^(−z²/2)/(σ√(2π)) — dokładna gęstość rozkładu normalnego.',
    derivation: 'direct', inputs: ['zScore', 'sigma'],
    compute: (i) => Math.exp(-(i.zScore * i.zScore) / 2) / (i.sigma * SQRT_2PI),
    formula: 'f(x) = e^(−z²/2)/(σ√(2π))',
  });
  g.addNode({
    id: 'probWithinZ', label: 'P(w przedziale ±|z|)', unit: '', domain: 'statystyka', honesty: 'simplified',
    honestyNote: 'P(μ−|x−μ| < X < μ+|x−μ|) = erf(|z|/√2). Dla |z|=1 → 0,683 (reguła 68%). erf liczone przybliżeniem numerycznym (Abramowitz–Stegun, błąd < 1,5·10⁻⁷).',
    derivation: 'approximate', inputs: ['zScore'], compute: (i) => erf(Math.abs(i.zScore) / Math.SQRT2),
    formula: 'P = erf(|z|/√2)',
  });

  return g;
}
