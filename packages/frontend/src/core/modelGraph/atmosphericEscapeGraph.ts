import { ModelGraph } from './graph';

/**
 * Ucieczka atmosfery — FLAGOWY łańcuch MIĘDZYDZIEDZINOWY (Priorytet 3).
 *
 * To najsilniejszy dowód tezy „modele są wykonywalne i połączone": jeden graf
 * spina CZTERY dziedziny realnymi krawędziami obliczeniowymi:
 *
 *   astronomia gwiazdowa (L⋆, a)  ─► klimat planetarny (T_eq)
 *   klimat (T_eq) + chemia (masa cząsteczki)  ─► fizyka termiczna (v_th)
 *   mechanika/grawitacja (v_esc) + termika (v_th)  ─► ucieczka atmosfery (λ Jeansa)
 *
 * FIZYKA (zamkniętoformułowa, cytowana):
 *  - Temperatura równowagowa: T_eq = 278,5·((1−A)·L⋆/a²)^¼ [K] (bilans strumienia
 *    gwiazdy; 278,5 K ze stałej słonecznej). Dla Ziemi (L=1, a=1, A=0,3) → ~255 K. ✓
 *  - Prędkość ucieczki: v_esc = √(2GM/R). Dla Ziemi → ~11,2 km/s. ✓
 *  - Najbardziej prawdopodobna prędkość cieplna: v_th = √(2k_BT/m) (rozkład
 *    Maxwella–Boltzmanna).
 *  - Parametr ucieczki Jeansa: λ = v_esc²/v_th² = GMm/(k_BTR). Reguła kciuka:
 *    λ ≳ 15–20 → atmosfera utrzymana przez miliardy lat; małe λ → szybka ucieczka.
 *
 * GRANICE (jawne, honestyNote): to WYŁĄCZNIE ucieczka termiczna (Jeansa). Pomija
 * ucieczkę hydrodynamiczną, porywanie przez wiatr gwiazdowy, utratę na skutek
 * braku pola magnetycznego i procesy niestacjonarne — dlatego derivation węzłów
 * ucieczkowych = 'approximate', a poziom uczciwości = 'simplified'.
 */

const G = 6.674e-11; // N·m²/kg²
const KB = 1.380649e-23; // J/K
const AMU = 1.66053907e-27; // kg
const M_EARTH = 5.972e24; // kg
const R_EARTH = 6.371e6; // m

export const BASELINE_LUMINOSITY_SOLAR = 1;
export const BASELINE_ORBIT_AU = 1;
export const BASELINE_ALBEDO = 0.3;
export const BASELINE_PLANET_MASS_EARTH = 1;
export const BASELINE_PLANET_RADIUS_EARTH = 1;
export const BASELINE_MOLECULE_AMU = 18; // woda

export function buildAtmosphericEscapeGraph(): ModelGraph {
  const g = new ModelGraph();

  g.addNode(
    { id: 'stellarLuminositySolar', label: 'Jasność gwiazdy L⋆', unit: 'L☉', domain: 'astronomia gwiazdowa',
      honesty: 'exact', honestyNote: 'Jasność gwiazdy w jednostkach Słońca — zadana.', derivation: 'direct',
      inputs: [], compute: (i) => i.stellarLuminositySolar ?? BASELINE_LUMINOSITY_SOLAR, formula: 'L⋆ (parametr)' },
    BASELINE_LUMINOSITY_SOLAR,
  );
  g.addNode(
    { id: 'orbitalDistanceAu', label: 'Odległość orbitalna a', unit: 'AU', domain: 'astronomia gwiazdowa',
      honesty: 'exact', honestyNote: 'Odległość planety od gwiazdy — zadana.', derivation: 'direct',
      inputs: [], compute: (i) => i.orbitalDistanceAu ?? BASELINE_ORBIT_AU, formula: 'a (parametr)' },
    BASELINE_ORBIT_AU,
  );
  g.addNode(
    { id: 'planetAlbedo', label: 'Albedo planety A', unit: '', domain: 'klimat planetarny',
      honesty: 'exact', honestyNote: 'Ułamek światła odbijanego (0–1) — zadany. Ziemia ≈ 0,3.', derivation: 'direct',
      inputs: [], compute: (i) => i.planetAlbedo ?? BASELINE_ALBEDO, formula: 'A (parametr)' },
    BASELINE_ALBEDO,
  );
  g.addNode(
    { id: 'planetMassEarth', label: 'Masa planety M_p', unit: 'M⊕', domain: 'mechanika (grawitacja)',
      honesty: 'exact', honestyNote: 'Masa planety w masach Ziemi — zadana.', derivation: 'direct',
      inputs: [], compute: (i) => i.planetMassEarth ?? BASELINE_PLANET_MASS_EARTH, formula: 'M_p (parametr)' },
    BASELINE_PLANET_MASS_EARTH,
  );
  g.addNode(
    { id: 'planetRadiusEarth', label: 'Promień planety R_p', unit: 'R⊕', domain: 'mechanika (grawitacja)',
      honesty: 'exact', honestyNote: 'Promień planety w promieniach Ziemi — zadany.', derivation: 'direct',
      inputs: [], compute: (i) => i.planetRadiusEarth ?? BASELINE_PLANET_RADIUS_EARTH, formula: 'R_p (parametr)' },
    BASELINE_PLANET_RADIUS_EARTH,
  );
  g.addNode(
    { id: 'moleculeMassAmu', label: 'Masa cząsteczki gazu m', unit: 'u', domain: 'chemia / skład atmosfery',
      honesty: 'exact', honestyNote: 'Masa cząsteczki w jednostkach masy atomowej: H₂=2, He=4, H₂O=18, N₂=28, CO₂=44. Zadana.', derivation: 'direct',
      inputs: [], compute: (i) => i.moleculeMassAmu ?? BASELINE_MOLECULE_AMU, formula: 'm (parametr)' },
    BASELINE_MOLECULE_AMU,
  );

  // KRAWĘDŹ 1: astronomia → klimat planetarny.
  g.addNode({
    id: 'equilibriumTempK', label: 'Temperatura równowagowa T_eq', unit: 'K', domain: 'klimat planetarny',
    honesty: 'simplified',
    honestyNote: 'T_eq = 278,5·((1−A)·L⋆/a²)^¼ — bilans strumienia gwiazdy. PRZYBLIŻONE: to temperatura równowagi promienistej BEZ efektu cieplarnianego (Ziemia realnie ~288 K vs 255 K równowagowe). Pomija atmosferę, rotację, wewnętrzne ciepło.',
    derivation: 'approximate', inputs: ['stellarLuminositySolar', 'orbitalDistanceAu', 'planetAlbedo'],
    compute: (i) => 278.5 * Math.pow((1 - i.planetAlbedo) * i.stellarLuminositySolar / (i.orbitalDistanceAu * i.orbitalDistanceAu), 0.25),
    formula: 'T_eq = 278,5·((1−A)·L⋆/a²)^¼',
  });

  // Mechanika grawitacyjna (jednodziedzinowa).
  g.addNode({
    id: 'escapeVelocityMs', label: 'Prędkość ucieczki v_esc', unit: 'm/s', domain: 'mechanika (grawitacja)',
    honesty: 'exact', honestyNote: 'v_esc = √(2GM/R) — dokładne. Dla Ziemi ~11,2 km/s.',
    derivation: 'direct', inputs: ['planetMassEarth', 'planetRadiusEarth'],
    compute: (i) => Math.sqrt(2 * G * i.planetMassEarth * M_EARTH / (i.planetRadiusEarth * R_EARTH)),
    formula: 'v_esc = √(2GM/R)',
  });

  // KRAWĘDŹ 2: klimat (T_eq) + chemia (masa) → fizyka termiczna.
  g.addNode({
    id: 'thermalVelocityMs', label: 'Prędkość cieplna v_th (najczęstsza)', unit: 'm/s', domain: 'fizyka termiczna',
    honesty: 'exact', honestyNote: 'v_th = √(2k_BT/m) — najbardziej prawdopodobna prędkość w rozkładzie Maxwella–Boltzmanna. Dokładne dla gazu w równowadze termicznej w temperaturze T_eq.',
    derivation: 'direct', inputs: ['equilibriumTempK', 'moleculeMassAmu'],
    compute: (i) => Math.sqrt(2 * KB * i.equilibriumTempK / (i.moleculeMassAmu * AMU)),
    formula: 'v_th = √(2k_BT/m)',
  });

  // KRAWĘDŹ 3 (FLAGOWA): mechanika (v_esc) + termika (v_th) → ucieczka atmosfery.
  g.addNode({
    id: 'jeansParameter', label: 'Parametr ucieczki Jeansa λ', unit: '', domain: 'ucieczka atmosfery (międzydziedzinowa)',
    honesty: 'simplified',
    honestyNote: 'λ = v_esc²/v_th² = GMm/(k_BTR). Reguła kciuka: λ ≳ 15–20 → gaz utrzymany przez miliardy lat; małe λ → szybka ucieczka termiczna. PRZYBLIŻONE: tylko ucieczka Jeansa (termiczna), pomija ucieczkę hydrodynamiczną, wiatr gwiazdowy, brak pola magnetycznego.',
    derivation: 'approximate', inputs: ['escapeVelocityMs', 'thermalVelocityMs'],
    compute: (i) => (i.escapeVelocityMs * i.escapeVelocityMs) / (i.thermalVelocityMs * i.thermalVelocityMs),
    formula: 'λ = v_esc²/v_th²',
  });

  g.addNode({
    id: 'thermalToEscapeRatio', label: 'Stosunek v_th/v_esc', unit: '', domain: 'ucieczka atmosfery (międzydziedzinowa)',
    honesty: 'simplified',
    honestyNote: 'v_th/v_esc — gdy przekracza ~1/6, ucieczka termiczna staje się szybka w skali geologicznej. Wielkość międzydziedzinowa (termika × grawitacja).',
    derivation: 'approximate', inputs: ['thermalVelocityMs', 'escapeVelocityMs'],
    compute: (i) => i.thermalVelocityMs / i.escapeVelocityMs,
    formula: 'v_th / v_esc',
  });

  return g;
}
