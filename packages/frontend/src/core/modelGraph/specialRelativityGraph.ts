import { ModelGraph } from './graph';
import { lorentzGamma } from '../physics';

/**
 * Graf szczególnej teorii względności (Priorytet 1: adopcja przez Space-Time
 * Lab; wspólny fundament fizyczny pod c-Slider z Priorytetu 5).
 *
 * Wszystkie wielkości są DOKŁADNE w ramach STW dla ruchu jednostajnego w linii
 * prostej: γ = 1/√(1−β²), dylatacja czasu Δt = γΔτ, skrócenie długości L = L₀/γ,
 * relatywistyczny Doppler przy zbliżaniu √((1+β)/(1−β)). Model traci ważność
 * przy β→1 (γ→∞) i NIE obejmuje przyspieszeń ani grawitacji (to już OTW).
 * Używa tej samej, przetestowanej funkcji core/physics.ts::lorentzGamma.
 */

export const BASELINE_BETA = 0.6;
export const BASELINE_PROPER_TIME_S = 10;
export const BASELINE_REST_LENGTH_M = 10;

export function buildSpecialRelativityGraph(): ModelGraph {
  const g = new ModelGraph();

  g.addNode(
    {
      id: 'velocityFraction', label: 'Prędkość β = v/c', unit: '', domain: 'szczególna teoria względności',
      honesty: 'exact', honestyNote: 'Prędkość jako ułamek prędkości światła. Ważne 0 ≤ β < 1; przy β→1 efekty rozbiegają się do nieskończoności.',
      derivation: 'direct', inputs: [], compute: (i) => i.velocityFraction ?? BASELINE_BETA, formula: 'β (parametr)',
    },
    BASELINE_BETA,
  );
  g.addNode(
    {
      id: 'properTimeSeconds', label: 'Czas własny Δτ', unit: 's', domain: 'szczególna teoria względności',
      honesty: 'exact', honestyNote: 'Czas mierzony w układzie poruszającego się zegara — zadany.', derivation: 'direct',
      inputs: [], compute: (i) => i.properTimeSeconds ?? BASELINE_PROPER_TIME_S, formula: 'Δτ (parametr)',
    },
    BASELINE_PROPER_TIME_S,
  );
  g.addNode(
    {
      id: 'restLengthMeters', label: 'Długość spoczynkowa L₀', unit: 'm', domain: 'szczególna teoria względności',
      honesty: 'exact', honestyNote: 'Długość obiektu w jego układzie spoczynkowym — zadana.', derivation: 'direct',
      inputs: [], compute: (i) => i.restLengthMeters ?? BASELINE_REST_LENGTH_M, formula: 'L₀ (parametr)',
    },
    BASELINE_REST_LENGTH_M,
  );

  g.addNode({
    id: 'lorentzGammaFactor', label: 'Czynnik Lorentza γ', unit: '', domain: 'szczególna teoria względności',
    honesty: 'exact', honestyNote: 'γ = 1/√(1−β²) — dokładny. Rośnie nieograniczenie przy β→1.',
    derivation: 'direct', inputs: ['velocityFraction'],
    compute: (i) => lorentzGamma(i.velocityFraction),
    formula: 'γ = 1/√(1−β²)',
  });

  g.addNode({
    id: 'dilatedTimeSeconds', label: 'Czas rozciągnięty Δt (obserwator)', unit: 's', domain: 'szczególna teoria względności',
    honesty: 'exact', honestyNote: 'Δt = γ·Δτ — poruszający się zegar chodzi wolniej z punktu widzenia obserwatora. Dokładne.',
    derivation: 'direct', inputs: ['lorentzGammaFactor', 'properTimeSeconds'],
    compute: (i) => i.lorentzGammaFactor * i.properTimeSeconds,
    formula: 'Δt = γ·Δτ',
  });

  g.addNode({
    id: 'contractedLengthMeters', label: 'Długość skrócona L (obserwator)', unit: 'm', domain: 'szczególna teoria względności',
    honesty: 'exact', honestyNote: 'L = L₀/γ — obiekt skrócony w kierunku ruchu z punktu widzenia obserwatora. Dokładne.',
    derivation: 'direct', inputs: ['restLengthMeters', 'lorentzGammaFactor'],
    compute: (i) => i.restLengthMeters / i.lorentzGammaFactor,
    formula: 'L = L₀/γ',
  });

  g.addNode({
    id: 'dopplerApproaching', label: 'Doppler (zbliżanie) f_obs/f_źr', unit: '×', domain: 'szczególna teoria względności',
    honesty: 'exact', honestyNote: 'Relatywistyczny Doppler podłużny przy zbliżaniu: √((1+β)/(1−β)) — przesunięcie ku fioletowi. Dokładne.',
    derivation: 'direct', inputs: ['velocityFraction'],
    compute: (i) => Math.sqrt((1 + i.velocityFraction) / (1 - i.velocityFraction)),
    formula: '√((1+β)/(1−β))',
  });

  return g;
}
