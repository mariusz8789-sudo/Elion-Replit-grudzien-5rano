import type { ExperimentDef } from '../../core/types';
import { buildSpecialRelativityGraph } from '../../core/modelGraph/specialRelativityGraph';

/**
 * Space-Time Lab × Graf Modeli — szczególna teoria względności (Priorytet 1).
 * Zmieniasz β, czas własny i długość spoczynkową, a czynnik Lorentza, dylatacja
 * czasu, skrócenie długości i relatywistyczny Doppler przeliczają się przez
 * wykonywalny graf. Wszystko DOKŁADNE w ramach STW (ruch jednostajny).
 */
export const spacetimeRelativityConsequence: ExperimentDef = {
  id: 'spacetime.sr-consequence',
  name: 'Łańcuch konsekwencji: STW',
  honesty: 'exact',
  honestyNote:
    'Szczególna teoria względności dla ruchu jednostajnego: γ=1/√(1−β²), dylatacja czasu, skrócenie długości, relatywistyczny Doppler — wielkości DOKŁADNE. Model traci ważność przy β→1 i nie obejmuje przyspieszeń/grawitacji (to OTW). Liczy je wykonywalny Graf Modeli.',
  params: [],
  narrate: () => [],
  createConsequenceModel: () => ({
    graph: buildSpecialRelativityGraph(),
    headline: 'Prędkość β, czas własny, długość spoczynkowa → γ, dylatacja czasu, skrócenie, Doppler',
    params: [
      { id: 'velocityFraction', min: 0, max: 0.99, step: 0.01 },
      { id: 'properTimeSeconds', min: 1, max: 100, step: 1 },
      { id: 'restLengthMeters', min: 1, max: 100, step: 1 },
    ],
    outputs: [
      { id: 'lorentzGammaFactor', format: (v) => v.toFixed(3) },
      { id: 'dilatedTimeSeconds', format: (v) => v.toFixed(2) },
      { id: 'contractedLengthMeters', format: (v) => v.toFixed(2) },
      { id: 'dopplerApproaching', format: (v) => v.toFixed(3) },
    ],
  }),
};
