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
 * Łańcuch (2 parametry → 3 wielkości pochodne):
 *   centralMassSolar  (parametr, masy Słońca) ┐
 *   orbitalRadiusAu   (parametr, AU)          ┴→ orbitalPeriodYears
 *                                              → orbitalSpeedAuPerYear
 *                                              → relativeTidalStrength
 *
 * Wszystkie trzy pochodne zależą od OBU parametrów — to jest realny graf
 * wieloparametrowy (III prawo Keplera z ZMIENNĄ półosią a, nie stałą sceny),
 * a więc gałęzie rzeczywistości mogą się rozchodzić po dwóch niezależnych
 * osiach (masa gwiazdy ORAZ promień orbity) i faktycznie różnić się
 * przewidywaniami. To jest fizycznie dokładne (Kepler dopuszcza tylko
 * założenie orbity kołowej, e=0), nie sztuczne rozszerzenie.
 */
export const BASELINE_MASS_SOLAR = 1;
export const BASELINE_RADIUS_AU = 1;

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
      derivation: 'direct',
      inputs: [],
      compute: (inputs) => inputs.centralMassSolar ?? BASELINE_MASS_SOLAR,
      formula: 'M (parametr)',
    },
    BASELINE_MASS_SOLAR,
  );

  graph.addNode(
    {
      id: 'orbitalRadiusAu',
      label: 'Promień orbity',
      unit: 'AU',
      domain: 'mechanika orbitalna',
      honesty: 'exact',
      honestyNote: 'Parametr wejściowy — półoś wielka orbity (kołowej, e=0). Ustawiany bezpośrednio.',
      derivation: 'direct',
      inputs: [],
      compute: (inputs) => inputs.orbitalRadiusAu ?? BASELINE_RADIUS_AU,
      formula: 'a (parametr)',
    },
    BASELINE_RADIUS_AU,
  );

  graph.addNode({
    id: 'orbitalPeriodYears',
    label: 'Okres orbitalny',
    unit: 'lat',
    domain: 'mechanika orbitalna',
    honesty: 'exact',
    honestyNote:
      'III prawo Keplera w jednostkach astronomicznych (AU, lata, masy Słońca): T = 2π√(a³/(G·M)), G=4π² w tych jednostkach — dokładny wynik, ta sama formuła co Universe Lab. Zależy od OBU parametrów (masa i promień).',
    derivation: 'direct',
    inputs: ['centralMassSolar', 'orbitalRadiusAu'],
    compute: (inputs) => {
      const mu = G_ASTRO_YEAR * inputs.centralMassSolar;
      return 2 * Math.PI * Math.sqrt(Math.pow(inputs.orbitalRadiusAu, 3) / mu);
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
      'Równanie vis-viva dla orbity kołowej (r=a): v²=μ(2/r−1/a) — ta sama funkcja core/physics.ts::visVivaSpeed, którą Universe Lab liczy dla prawdziwych planet. Zależy od OBU parametrów.',
    derivation: 'direct',
    inputs: ['centralMassSolar', 'orbitalRadiusAu'],
    compute: (inputs) => {
      const mu = G_ASTRO_YEAR * inputs.centralMassSolar;
      return visVivaSpeed(mu, inputs.orbitalRadiusAu, inputs.orbitalRadiusAu);
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
      'Przyspieszenie pływowe jest dokładnie proporcjonalne do M/r³ (standardowy gradient siły pływowej). Odniesione do stanu bazowego (1 M☉ przy 1 AU) — dokładna proporcja (M/M_bazowe)·(r_bazowe/r)³, nie oszacowanie. Zależy od OBU parametrów.',
    derivation: 'direct',
    inputs: ['centralMassSolar', 'orbitalRadiusAu'],
    compute: (inputs) =>
      (inputs.centralMassSolar / BASELINE_MASS_SOLAR) * Math.pow(BASELINE_RADIUS_AU / inputs.orbitalRadiusAu, 3),
    formula: 'pływy ∝ M/r³ → (M/M₀)·(r₀/r)³',
  });

  return graph;
}
