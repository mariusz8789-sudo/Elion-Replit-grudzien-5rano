import type { ExperimentDef } from '../../core/types';
import { buildOrbitalModelGraph } from '../../core/modelGraph/orbitalGraph';

/**
 * Universe Lab × Graf Modeli (Priorytet 1: adopcja Grafu Modeli przez laby).
 *
 * Ten sam wykonywalny graf, który napędza Reality Navigator (#/reality), zostaje
 * udostępniony BEZPOŚREDNIO w laboratorium jako łańcuch konsekwencji: zmieniasz
 * masę gwiazdy centralnej albo promień orbity, a okres orbitalny (III prawo
 * Keplera), prędkość orbitalna (vis-viva) i względna siła pływowa (∝ M/r³)
 * przeliczają się przez graf, z zapisem „co spowodowało zmianę". To odpowiada na
 * pytanie audytu „czy mogę dotknąć parametru gwiezdnego i zobaczyć konsekwencje"
 * — teraz także wewnątrz Universe Lab, nie tylko w Reality Navigatorze.
 */
export const universeOrbitalConsequence: ExperimentDef = {
  id: 'universe.orbital-consequence',
  name: 'Łańcuch konsekwencji: orbita',
  honesty: 'exact',
  honestyNote:
    'III prawo Keplera (P² = a³/M), vis-viva (prędkość orbitalna) i skalowanie siły pływowej (∝ M/r³) — wielkości DOKŁADNE dla orbity kołowej wokół dominującej masy. Liczy je wykonywalny Graf Modeli (core/modelGraph/orbitalGraph), ten sam co w Reality Navigatorze. Zmiana parametru propaguje konsekwencje w kolejności zależności.',
  params: [],
  narrate: () => [],
  createConsequenceModel: () => ({
    graph: buildOrbitalModelGraph(),
    headline: 'Masa gwiazdy i promień orbity → okres, prędkość orbitalna, siła pływowa',
    params: [
      { id: 'centralMassSolar', min: 0.1, max: 10, step: 0.05 },
      { id: 'orbitalRadiusAu', min: 0.2, max: 6, step: 0.05 },
    ],
    outputs: [
      { id: 'orbitalPeriodYears', format: (v) => v.toFixed(2) },
      { id: 'orbitalSpeedAuPerYear', format: (v) => v.toFixed(2) },
      { id: 'relativeTidalStrength', format: (v) => v.toFixed(2) },
    ],
  }),
};
