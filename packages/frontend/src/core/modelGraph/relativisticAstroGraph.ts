import { ModelGraph } from './graph';
import { chirpMassSolar, iscoFrequency, lorentzGamma } from '../physics';

/**
 * Trzeci konkretny graf w Scientific Model Graph, i pierwszy z PRAWDZIWĄ
 * krawędzią MIĘDZYDZIEDZINOWĄ. Łączy dwie dziedziny już zaimplementowane w
 * repozytorium (Einstein/Space-Time Lab: szczególna teoria względności;
 * Einstein/Universe Lab: fale grawitacyjne z inspiralu układów podwójnych),
 * reużywając wyłącznie zweryfikowanych funkcji z core/physics.ts.
 *
 * DWIE dziedziny, DWA łańcuchy, JEDEN węzeł-most:
 *
 *   Dziedzina A — inspiralne fale grawitacyjne (układ podwójny):
 *     totalMassSolar (param) ┐
 *     massRatio q    (param) ┴→ chirpMassSolar      (ℳ, DOKŁADNY wzór)
 *     totalMassSolar         → iscoFrequencySource  (f_ISCO w układzie źródła,
 *                                                     PRZYBLIŻONE: Schwarzschild,
 *                                                     brak spinu — granica ważności inspiralu)
 *
 *   Dziedzina B — szczególna teoria względności (ruch źródła):
 *     lineOfSightBeta (param) → lorentzGammaFactor   (γ, DOKŁADNY)
 *     lineOfSightBeta         → dopplerRedshiftFactor (√((1−β)/(1+β)), DOKŁADNY
 *                                                      podłużny Doppler relatywistyczny)
 *
 *   KRAWĘDŹ MIĘDZYDZIEDZINOWA (węzeł-most):
 *     observedIscoFrequency = iscoFrequencySource × dopplerRedshiftFactor
 *       ← zależy od OBU dziedzin naraz.
 *
 * Dlaczego ta krawędź jest naukowo obroniona, nie zmyślona: detektory (LIGO/
 * Virgo) mierzą CZĘSTOTLIWOŚĆ PRZESUNIĘTĄ względem układu źródła — to jest
 * standardowa, podręcznikowa relacja („masa w układzie detektora" = (1+z)·
 * „masa w układzie źródła"). Przesunięcie częstotliwości fali (dowolnej,
 * także grawitacyjnej) przez ruch źródła to ten sam relatywistyczny Doppler,
 * który STW stosuje do światła. NIE fabrykujemy związku — łączymy dwie realne
 * fizyki dokładnie tam, gdzie natura je łączy (na drodze fali do detektora).
 *
 * UCZCIWY ZASTRZEŻENIE (w honestyNote mostu): dla źródeł w odległościach
 * kosmologicznych przesunięcie jest KOSMOLOGICZNE (FLRW), nie kinematyczny
 * Doppler STW. Ten graf traktuje β jako prędkość PECULIAR (kinematyczną) w
 * linii widzenia, dla której Doppler STW jest dokładny — i jawnie to mówi.
 * Stąd derivation mostu = 'approximate' (dziedziczy przybliżenie ISCO +
 * kinematyczne, nie kosmologiczne, ujęcie przesunięcia).
 */
export const BASELINE_TOTAL_MASS_SOLAR = 60;
export const BASELINE_MASS_RATIO = 1;
export const BASELINE_LOS_BETA = 0.1;

export function buildRelativisticAstroGraph(): ModelGraph {
  const graph = new ModelGraph();

  // --- parametry ---
  graph.addNode(
    {
      id: 'totalMassSolar', label: 'Masa całkowita układu', unit: 'M☉', domain: 'fale grawitacyjne',
      honesty: 'exact', honestyNote: 'Parametr — suma mas obu składników układu podwójnego. Ustawiany bezpośrednio.',
      derivation: 'direct', inputs: [], compute: (i) => i.totalMassSolar ?? BASELINE_TOTAL_MASS_SOLAR, formula: 'M = m₁+m₂ (parametr)',
    },
    BASELINE_TOTAL_MASS_SOLAR,
  );

  graph.addNode(
    {
      id: 'massRatio', label: 'Stosunek mas q = m₂/m₁', unit: '', domain: 'fale grawitacyjne',
      honesty: 'exact', honestyNote: 'Parametr — 1,0 to układ równomasowy, mniejsze q to coraz bardziej asymetryczny układ. Ustawiany bezpośrednio (0<q≤1).',
      derivation: 'direct', inputs: [], compute: (i) => i.massRatio ?? BASELINE_MASS_RATIO, formula: 'q = m₂/m₁ (parametr)',
    },
    BASELINE_MASS_RATIO,
  );

  graph.addNode(
    {
      id: 'lineOfSightBeta', label: 'Prędkość źródła w linii widzenia', unit: 'β = v/c', domain: 'szczególna teoria względności',
      honesty: 'exact', honestyNote: 'Parametr — składowa prędkości źródła wzdłuż linii widzenia (oddalanie: β>0). Traktowana jako prędkość kinematyczna (peculiar), nie ekspansja kosmologiczna. Ustawiany bezpośrednio.',
      derivation: 'direct', inputs: [], compute: (i) => i.lineOfSightBeta ?? BASELINE_LOS_BETA, formula: 'β (parametr)',
    },
    BASELINE_LOS_BETA,
  );

  // --- dziedzina A: fale grawitacyjne ---
  graph.addNode({
    id: 'chirpMassSolar', label: 'Masa ćwierkowa ℳ', unit: 'M☉', domain: 'fale grawitacyjne',
    honesty: 'exact',
    honestyNote: 'ℳ = (m₁m₂)^(3/5)/(m₁+m₂)^(1/5) — dokładny wzór, jedyna kombinacja mas, którą kształt sygnału inspiralu ustala niezależnie. Ta sama funkcja core/physics.ts::chirpMassSolar co Einstein/Universe Lab. m₁,m₂ wyliczone z M i q: m₁=M/(1+q), m₂=Mq/(1+q).',
    derivation: 'direct', inputs: ['totalMassSolar', 'massRatio'],
    compute: (i) => {
      const m1 = i.totalMassSolar / (1 + i.massRatio);
      const m2 = (i.totalMassSolar * i.massRatio) / (1 + i.massRatio);
      return chirpMassSolar(m1, m2);
    },
    formula: 'ℳ = (m₁m₂)^(3/5)/(m₁+m₂)^(1/5)',
  });

  graph.addNode({
    id: 'iscoFrequencySource', label: 'Częstotliwość ISCO (układ źródła)', unit: 'Hz', domain: 'fale grawitacyjne',
    honesty: 'exact',
    honestyNote: 'Częstotliwość fali grawitacyjnej na ostatniej stabilnej orbicie kołowej (ISCO, r=6GM/c²) — praktyczna granica ważności modelu inspiralu, poza nią zaczyna się merger. PRZYBLIŻONE: zakłada Schwarzschilda (brak spinu); dla wirujących czarnych dziur ISCO leży inaczej. Ta sama funkcja core/physics.ts::iscoFrequency.',
    derivation: 'approximate', inputs: ['totalMassSolar'],
    compute: (i) => iscoFrequency(i.totalMassSolar),
    formula: 'f_ISCO = c³/(6^(3/2)·π·G·M)',
  });

  // --- dziedzina B: szczególna teoria względności ---
  graph.addNode({
    id: 'lorentzGammaFactor', label: 'Czynnik Lorentza γ', unit: '', domain: 'szczególna teoria względności',
    honesty: 'exact',
    honestyNote: 'γ = 1/√(1−β²) — dokładny czynnik dylatacji czasu / skrócenia długości. Ta sama funkcja core/physics.ts::lorentzGamma co Space-Time Lab.',
    derivation: 'direct', inputs: ['lineOfSightBeta'],
    compute: (i) => lorentzGamma(i.lineOfSightBeta),
    formula: 'γ = 1/√(1−β²)',
  });

  graph.addNode({
    id: 'dopplerRedshiftFactor', label: 'Czynnik Dopplera (przesunięcie ku czerwieni)', unit: '×', domain: 'szczególna teoria względności',
    honesty: 'exact',
    honestyNote: 'Podłużny relatywistyczny Doppler dla oddalającego się źródła: f_obs/f_src = √((1−β)/(1+β)) — dokładny wynik STW. Dla β>0 (oddalanie) czynnik <1 (ku czerwieni, niższa częstotliwość).',
    derivation: 'direct', inputs: ['lineOfSightBeta'],
    compute: (i) => Math.sqrt((1 - i.lineOfSightBeta) / (1 + i.lineOfSightBeta)),
    formula: 'f_obs/f_src = √((1−β)/(1+β))',
  });

  // --- KRAWĘDŹ MIĘDZYDZIEDZINOWA: most GW × STW ---
  graph.addNode({
    id: 'observedIscoFrequency', label: 'Obserwowana częstotliwość ISCO (u detektora)', unit: 'Hz', domain: 'międzydziedzinowy (GW × STW)',
    honesty: 'exact',
    honestyNote: 'KRAWĘDŹ MIĘDZYDZIEDZINOWA: częstotliwość ISFO w układzie źródła (dziedzina fal grawitacyjnych) przesunięta relatywistycznym Dopplerem ruchu źródła (dziedzina STW): f_obs = f_ISCO,źródło × √((1−β)/(1+β)). To jest realna relacja — detektory mierzą przesunięte częstotliwości. PRZYBLIŻONE, bo dziedziczy założenie ISCO (brak spinu) ORAZ traktuje przesunięcie kinematycznie (Doppler STW); dla źródeł kosmologicznych właściwe byłoby przesunięcie kosmologiczne (FLRW), nie STW.',
    derivation: 'approximate', inputs: ['iscoFrequencySource', 'dopplerRedshiftFactor'],
    compute: (i) => i.iscoFrequencySource * i.dopplerRedshiftFactor,
    formula: 'f_obs = f_ISCO,źródło × √((1−β)/(1+β))',
  });

  return graph;
}
