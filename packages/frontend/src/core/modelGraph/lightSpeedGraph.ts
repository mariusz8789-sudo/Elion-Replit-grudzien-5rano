import { ModelGraph } from './graph';
import { lorentzGamma } from '../physics';

/**
 * c-Slider (Priorytet 5): „co, gdyby zmienić prędkość światła?".
 *
 * Sygnaturowy eksperyment na WYKONYWALNYM grafie: użytkownik ustawia prędkość
 * obiektu v ORAZ prędkość światła c, a system liczy realne konsekwencje STW,
 * bo wszystkie efekty zależą od β = v/c. Zmiana c przy stałym v przesuwa β i
 * wszystkie zależne wielkości — plus czas przelotu światła na zadanym dystansie
 * (∝ 1/c). To NIE jest zmiana prawdziwej stałej fizycznej — to model „gdyby c
 * miało inną wartość", świadomie eksploracyjny.
 *
 * GRANICA WAŻNOŚCI (egzekwowana przez domainGuard eksperymentu): dla v ≥ c
 * mamy β ≥ 1, γ = 1/√(1−β²) staje się nieokreślone, a STW przestaje obowiązywać.
 * System pokazuje wtedy wyraźne ostrzeżenie zamiast udawać wynik.
 */

export const C_VACUUM_MS = 299792458; // rzeczywista prędkość światła w próżni
export const BASELINE_VELOCITY_MS = 1.5e8;
export const BASELINE_DISTANCE_KM = 384400; // Ziemia–Księżyc

export function buildLightSpeedGraph(): ModelGraph {
  const g = new ModelGraph();

  g.addNode(
    {
      id: 'velocityMs', label: 'Prędkość obiektu v', unit: 'm/s', domain: 'szczególna teoria względności',
      honesty: 'exact', honestyNote: 'Prędkość poruszającego się obiektu — zadana.', derivation: 'direct',
      inputs: [], compute: (i) => i.velocityMs ?? BASELINE_VELOCITY_MS, formula: 'v (parametr)',
    },
    BASELINE_VELOCITY_MS,
  );
  g.addNode(
    {
      id: 'lightSpeedMs', label: 'Prędkość światła c (hipotetyczna)', unit: 'm/s', domain: 'szczególna teoria względności',
      honesty: 'theoretical', honestyNote: 'Hipotetyczna wartość c dla eksperymentu myślowego „gdyby światło było szybsze/wolniejsze". Rzeczywiste c ≈ 2,998×10⁸ m/s.',
      derivation: 'direct', inputs: [], compute: (i) => i.lightSpeedMs ?? C_VACUUM_MS, formula: 'c (parametr)',
    },
    C_VACUUM_MS,
  );
  g.addNode(
    {
      id: 'distanceKm', label: 'Dystans (do czasu przelotu światła)', unit: 'km', domain: 'szczególna teoria względności',
      honesty: 'exact', honestyNote: 'Dystans, na którym liczymy czas przelotu światła — zadany.', derivation: 'direct',
      inputs: [], compute: (i) => i.distanceKm ?? BASELINE_DISTANCE_KM, formula: 'd (parametr)',
    },
    BASELINE_DISTANCE_KM,
  );

  g.addNode({
    id: 'betaFraction', label: 'β = v/c', unit: '', domain: 'szczególna teoria względności',
    honesty: 'exact', honestyNote: 'Ułamek prędkości światła. Sedno c-Slidera: zmiana c przy stałym v przesuwa β, a więc wszystkie efekty STW. Dla β ≥ 1 model traci ważność.',
    derivation: 'direct', inputs: ['velocityMs', 'lightSpeedMs'],
    compute: (i) => i.velocityMs / i.lightSpeedMs,
    formula: 'β = v/c',
  });

  g.addNode({
    id: 'lorentzGammaFactor', label: 'Czynnik Lorentza γ', unit: '', domain: 'szczególna teoria względności',
    honesty: 'exact', honestyNote: 'γ = 1/√(1−β²). Dla β ≥ 1 nieokreślone (model STW nie obowiązuje).',
    derivation: 'direct', inputs: ['betaFraction'],
    compute: (i) => lorentzGamma(i.betaFraction),
    formula: 'γ = 1/√(1−β²)',
  });

  g.addNode({
    id: 'secondsPerProperSecond', label: 'Czas obserwatora na 1 s własną', unit: 's', domain: 'szczególna teoria względności',
    honesty: 'exact', honestyNote: 'Δt = γ·Δτ dla Δτ = 1 s — ile sekund mija dla obserwatora, gdy poruszający się zegar odmierzy 1 s. Dokładne (β < 1).',
    derivation: 'direct', inputs: ['lorentzGammaFactor'],
    compute: (i) => i.lorentzGammaFactor,
    formula: 'Δt = γ·(1 s)',
  });

  g.addNode({
    id: 'lengthContractionPercent', label: 'Skrócenie długości', unit: '%', domain: 'szczególna teoria względności',
    honesty: 'exact', honestyNote: '(1 − 1/γ)·100% — o ile procent obiekt jest krótszy w kierunku ruchu z punktu widzenia obserwatora. Dokładne (β < 1).',
    derivation: 'direct', inputs: ['lorentzGammaFactor'],
    compute: (i) => (1 - 1 / i.lorentzGammaFactor) * 100,
    formula: '(1 − 1/γ)·100%',
  });

  g.addNode({
    id: 'dopplerApproaching', label: 'Doppler (zbliżanie) f_obs/f_źr', unit: '×', domain: 'szczególna teoria względności',
    honesty: 'exact', honestyNote: 'Relatywistyczny Doppler przy zbliżaniu √((1+β)/(1−β)). Dokładne (β < 1).',
    derivation: 'direct', inputs: ['betaFraction'],
    compute: (i) => Math.sqrt((1 + i.betaFraction) / (1 - i.betaFraction)),
    formula: '√((1+β)/(1−β))',
  });

  g.addNode({
    id: 'lightTravelTimeSeconds', label: 'Czas przelotu światła na dystansie', unit: 's', domain: 'szczególna teoria względności',
    honesty: 'exact', honestyNote: 't = d/c — czas, w jakim światło pokonuje zadany dystans. Zmiana c wprost skaluje ten czas (∝ 1/c). Dokładne.',
    derivation: 'direct', inputs: ['distanceKm', 'lightSpeedMs'],
    compute: (i) => (i.distanceKm * 1000) / i.lightSpeedMs,
    formula: 't = d/c',
  });

  return g;
}
