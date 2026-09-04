import type { ExperimentDef } from '../../core/types';
import {
  BASELINE_DISTANCE_KM,
  BASELINE_VELOCITY_MS,
  C_VACUUM_MS,
  buildLightSpeedGraph,
} from '../../core/modelGraph/lightSpeedGraph';

export type LightSpeedScenarioInput = {
  velocityMs?: number;
  lightSpeedMs?: number;
  distanceKm?: number;
};

/**
 * Współdzielony runner Fabric dla istniejącego c-Slidera. Wszystkie wielkości
 * pochodzą z buildLightSpeedGraph(); funkcja jedynie waliduje dziedzinę i
 * ujawnia wyniki bez uruchamiania drugiej implementacji STW.
 */
export function runLightSpeedScenario({
  velocityMs = BASELINE_VELOCITY_MS,
  lightSpeedMs = C_VACUUM_MS,
  distanceKm = BASELINE_DISTANCE_KM,
}: LightSpeedScenarioInput = {}) {
  if (!Number.isFinite(velocityMs) || velocityMs < 0) throw new Error('velocityMs must be finite and non-negative.');
  if (!Number.isFinite(lightSpeedMs) || lightSpeedMs <= 0) throw new Error('lightSpeedMs must be finite and positive.');
  if (!Number.isFinite(distanceKm) || distanceKm < 0) throw new Error('distanceKm must be finite and non-negative.');
  const betaFraction = velocityMs / lightSpeedMs;
  if (betaFraction >= 1) throw new Error('Model STW jest nieokreślony dla velocityMs ≥ lightSpeedMs (β ≥ 1).');

  const graph = buildLightSpeedGraph();
  graph.applyParameterSnapshot({ velocityMs, lightSpeedMs, distanceKm });
  return {
    velocityMs,
    lightSpeedMs,
    distanceKm,
    betaFraction: graph.getValue('betaFraction'),
    lorentzGammaFactor: graph.getValue('lorentzGammaFactor'),
    secondsPerProperSecond: graph.getValue('secondsPerProperSecond'),
    lengthContractionPercent: graph.getValue('lengthContractionPercent'),
    dopplerApproaching: graph.getValue('dopplerApproaching'),
    lightTravelTimeSeconds: graph.getValue('lightTravelTimeSeconds'),
  } as const;
}

/**
 * c-Slider (Priorytet 5) — sygnaturowy eksperyment „co, gdyby zmienić prędkość
 * światła?". Wykonywalny graf STW z c jako suwakiem: zmiana c przesuwa β = v/c i
 * wszystkie efekty relatywistyczne oraz czas przelotu światła. Straż granic
 * (domainGuard) egzekwuje, że dla v ≥ c model przestaje obowiązywać — wtedy
 * zamiast fałszywych liczb pojawia się wyraźne ostrzeżenie.
 */
export const spacetimeCSlider: ExperimentDef = {
  id: 'spacetime.c-slider',
  name: 'c-Slider: co, gdyby zmienić prędkość światła?',
  honesty: 'theoretical',
  honestyNote:
    'Eksperyment myślowy: c jako suwak. Fizyka STW jest DOKŁADNA dla każdego ustawionego c przy β < 1 — zmieniamy tylko założoną wartość stałej, nie „łamiemy" praw. Dla v ≥ c (β ≥ 1) model traci ważność i system to jawnie sygnalizuje. To NIE zmienia rzeczywistej stałej fizycznej.',
  params: [],
  narrate: () => [],
  createConsequenceModel: () => ({
    graph: buildLightSpeedGraph(),
    headline: 'Prędkość obiektu v i (hipotetyczna) prędkość światła c → efekty STW + czas przelotu światła',
    params: [
      { id: 'velocityMs', min: 0, max: 4e8, step: 1e6, format: (v) => (v / 1e8).toFixed(2) + '×10⁸' },
      { id: 'lightSpeedMs', min: 5e7, max: 6e8, step: 1e6, format: (v) => (v / 1e8).toFixed(2) + '×10⁸' },
      { id: 'distanceKm', min: 1, max: 1e6, step: 1000, format: (v) => v.toExponential(1) },
    ],
    outputs: [
      { id: 'betaFraction', format: (v) => v.toFixed(3) },
      { id: 'lorentzGammaFactor', format: (v) => (Number.isFinite(v) ? v.toFixed(3) : '—'), sonify: { min: 1, max: 10 } },
      { id: 'secondsPerProperSecond', format: (v) => (Number.isFinite(v) ? v.toFixed(3) : '—') },
      { id: 'lengthContractionPercent', format: (v) => (Number.isFinite(v) ? v.toFixed(1) : '—') },
      { id: 'dopplerApproaching', format: (v) => (Number.isFinite(v) ? v.toFixed(3) : '—') },
      { id: 'lightTravelTimeSeconds', format: (v) => (v >= 100 ? v.toExponential(2) : v.toFixed(3)) },
    ],
    domainGuard: (graph) => {
      const beta = graph.getValue('betaFraction');
      if (beta >= 1) {
        return {
          message: `Ustawiono v ≥ c (β = ${beta.toFixed(2)} ≥ 1). Żaden obiekt z masą nie może osiągnąć ani przekroczyć prędkości światła — szczególna teoria względności nie ma tu rozwiązania (γ nieokreślone).`,
        };
      }
      if (beta >= 0.999) {
        return {
          message: `β = ${beta.toFixed(4)} — ekstremalnie blisko c. Wyniki są formalnie poprawne, ale γ rośnie gwałtownie i drobna zmiana v/c daje ogromne efekty.`,
        };
      }
      return null;
    },
  }),
};
