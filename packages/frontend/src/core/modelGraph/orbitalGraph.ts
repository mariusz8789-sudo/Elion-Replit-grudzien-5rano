import { ModelGraph } from './graph';
import { G_ASTRO_YEAR, visVivaSpeed } from '../physics';

/**
 * Pierwszy konkretny graf w Scientific Model Graph: mechanika orbitalna
 * ciała krążącego wokół gwiazdy centralnej. Węzły REUŻYWAJĄ dokładnie te
 * same, już zweryfikowane funkcje z core/physics.ts, które od dawna
 * napędzają Universe Lab (prawdziwy Układ Słoneczny 3D) — Reality
 * Navigator NIE wymyśla nowej fizyki, tylko przestawia istniejącą na nową
 * warstwę wizualizacji.
 *
 * Łańcuch (1 parametr → 3 wielkości pochodne):
 *   centralMassSolar (parametr, jednostka: masy Słońca)
 *     → orbitalPeriodYears   (III prawo Keplera, dokładne w jednostkach AU/rok/M☉)
 *     → orbitalSpeedAuPerYear (równanie vis-viva, ta sama funkcja co Universe Lab)
 *     → relativeTidalStrength (∝ M/r³ przy stałym r — dokładna proporcjonalność
 *                               siły pływowej, nie oszacowanie)
 *
 * semiMajorAxisAu jest STAŁĄ sceny (1 AU = orbita Ziemi, "znajomy świat"),
 * nie węzłem — trzymamy graf minimalny i uczciwy: to, co user faktycznie
 * zmienia w prototypie, to masa gwiazdy centralnej.
 */
export const SEMI_MAJOR_AXIS_AU = 1;
export const BASELINE_MASS_SOLAR = 1;

export function buildOrbitalModelGraph(): ModelGraph {
  const graph = new ModelGraph();

  graph.addNode(
    {
      id: 'centralMassSolar',
      label: 'Masa gwiazdy centralnej',
      unit: 'M☉',
      domain: 'mechanika orbitalna',
      honesty: 'exact',
      honestyNote: 'Parametr wejściowy — nie obliczony, ustawiany bezpośrednio przez użytkownika.',
      inputs: [],
      compute: (inputs) => inputs.centralMassSolar ?? BASELINE_MASS_SOLAR,
      formula: 'M (parametr)',
    },
    BASELINE_MASS_SOLAR,
  );

  graph.addNode({
    id: 'orbitalPeriodYears',
    label: 'Okres orbitalny',
    unit: 'lat',
    domain: 'mechanika orbitalna',
    honesty: 'exact',
    honestyNote:
      'III prawo Keplera w jednostkach astronomicznych (AU, lata, masy Słońca): T = 2π√(a³/(G·M)), G=4π² w tych jednostkach — dokładny wynik, ta sama formuła co Universe Lab.',
    inputs: ['centralMassSolar'],
    compute: (inputs) => {
      const mu = G_ASTRO_YEAR * inputs.centralMassSolar;
      return 2 * Math.PI * Math.sqrt(Math.pow(SEMI_MAJOR_AXIS_AU, 3) / mu);
    },
    formula: 'T = 2π√(a³ / (4π²·M))',
  });

  graph.addNode({
    id: 'orbitalSpeedAuPerYear',
    label: 'Prędkość orbitalna',
    unit: 'AU/rok',
    domain: 'mechanika orbitalna',
    honesty: 'exact',
    honestyNote:
      'Równanie vis-viva dla orbity kołowej (r=a): v²=μ(2/r−1/a) — ta sama funkcja core/physics.ts::visVivaSpeed, którą Universe Lab liczy dla prawdziwych planet.',
    inputs: ['centralMassSolar'],
    compute: (inputs) => {
      const mu = G_ASTRO_YEAR * inputs.centralMassSolar;
      return visVivaSpeed(mu, SEMI_MAJOR_AXIS_AU, SEMI_MAJOR_AXIS_AU);
    },
    formula: 'v = √(μ(2/r − 1/a)), r=a (orbita kołowa)',
  });

  graph.addNode({
    id: 'relativeTidalStrength',
    label: 'Względna siła pływowa',
    unit: '× (bazowo 1,0)',
    domain: 'mechanika orbitalna',
    honesty: 'exact',
    honestyNote:
      'Przyspieszenie pływowe jest dokładnie proporcjonalne do M/r³ (standardowy gradient siły pływowej). Przy stałym promieniu orbity (r=1 AU, stała sceny) upraszcza się to do dokładnego stosunku M/M_bazowe — nie oszacowanie, tylko ta sama proporcjonalność zwinięta do jednej zmiennej.',
    inputs: ['centralMassSolar'],
    compute: (inputs) => inputs.centralMassSolar / BASELINE_MASS_SOLAR,
    formula: 'pływy ∝ M/r³ → (przy stałym r) M/M_bazowe',
  });

  return graph;
}
