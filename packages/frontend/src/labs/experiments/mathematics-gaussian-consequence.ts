import type { ExperimentDef } from '../../core/types';
import { buildGaussianGraph } from '../../core/modelGraph/gaussianGraph';

/** Mathematics Lab × Graf Modeli — rozkład normalny (Priorytet 1). */
export const mathematicsGaussianConsequence: ExperimentDef = {
  id: 'mathematics.gaussian-consequence',
  name: 'Łańcuch konsekwencji: rozkład normalny',
  honesty: 'simplified',
  honestyNote:
    'Rozkład normalny: z=(x−μ)/σ i gęstość f(x) są DOKŁADNE; prawdopodobieństwo w przedziale ±|z| = erf(|z|/√2) liczone przybliżeniem numerycznym (błąd < 1,5·10⁻⁷). Liczy to wykonywalny Graf Modeli.',
  params: [],
  narrate: () => [],
  createConsequenceModel: () => ({
    graph: buildGaussianGraph(),
    headline: 'Średnia μ, odchylenie σ, punkt x → z-score, gęstość f(x), prawdopodobieństwo ±|z|',
    params: [
      { id: 'mean', min: -10, max: 10, step: 0.1 },
      { id: 'sigma', min: 0.1, max: 10, step: 0.1 },
      { id: 'xValue', min: -20, max: 20, step: 0.1 },
    ],
    outputs: [
      { id: 'zScore', format: (v) => v.toFixed(3) },
      { id: 'pdfValue', format: (v) => v.toFixed(4) },
      { id: 'probWithinZ', format: (v) => (v * 100).toFixed(1) + '%' },
    ],
  }),
};
