import { atomCount, degreeOfUnsaturation, molecularWeight, parseFormula } from '../compute/cheminformatics';
import { buildPumpPipeModel } from '../engineeringGraph/pumpPipe';
import { solveKitaevBulk } from '../compute/kitaevBulk';
import { runBlochCircuitScenario } from '../../labs/experiments/quantum-bloch';
import { runTunnelingScenario } from '../../labs/experiments/quantum-tunneling';
import { runChshCorrelationScenario } from '../../labs/experiments/quantum-chsh';
import { runSchwarzschildGeodesicScenario } from '../../labs/experiments/einstein-geodesics';
import { runTitrationScenario } from '../../labs/experiments/chemistry-titration';
import { runVseprScenario } from '../../labs/experiments/chemistry-vsepr';
import { runPointLensScenario } from '../../labs/experiments/einstein-lensing';
import { runLightConeScenario } from '../../labs/experiments/spacetime-lightcone-3d';
import { runMinkowskiScenario } from '../../labs/experiments/spacetime-minkowski';
import { runLightSpeedScenario } from '../../labs/experiments/spacetime-cslider';
import { runProteinFoldingScenario } from '../../labs/experiments/biology-proteinfolding';
import { runChirpInspiralScenario } from '../../labs/experiments/einstein-chirp';
import { runTesseractProjectionScenario } from '../../labs/experiments/multiverse-tesseract';
import { runNuclideChartScenario } from '../../labs/experiments/nuclear-chart';
import { runKerrScenario } from '../../labs/experiments/einstein-kerr3d';
import { runQuantumTeleportScenario } from '../../labs/experiments/quantum-teleport';
import { runTokamakLawsonScenario } from '../../labs/experiments/nuclear-tokamak';
import { runDnaHelixScenario } from '../../labs/experiments/biology-dnahelix';
import { runDrakeEquationScenario } from '../../labs/experiments/civilization-drake-consequence';
import { runHydrogenOrbitalScenario } from '../../labs/experiments/atom-orbital-3d';
import { runDoublePendulumScenario } from '../../labs/experiments/universe-doublependulum';
import { runHubbleTensionScenario } from '../../labs/experiments/universe-hubbletension';
import { runLorenzScenario } from '../../labs/experiments/universe-lorenz3d';
import { runPlanetStabilityScenario } from '../../labs/experiments/universe-planetstability';
import { runRotationCurveScenario } from '../../labs/experiments/universe-rotationcurve';
import { runCollisionScenario } from '../../labs/experiments/universe-collision';
import { runStarLifeScenario } from '../../labs/experiments/universe-starlife';
import { runSolarSystemScenario } from '../../labs/experiments/universe-solar-system';
import { runThreeBodyScenario, type ThreeBodyPreset } from '../../labs/experiments/universe-threebody';
import { EventRegistry, EventStream, ingestTransmissions } from '../events';
import { buildAtmosphericEscapeGraph } from '../modelGraph/atmosphericEscapeGraph';
import { buildBohrModelGraph } from '../modelGraph/bohrModelGraph';
import { buildChemistryKineticsGraph } from '../modelGraph/chemistryKineticsGraph';
import { buildGaussianGraph } from '../modelGraph/gaussianGraph';
import { buildLogisticGrowthGraph } from '../modelGraph/logisticGrowthGraph';
import { buildNuclearModelGraph } from '../modelGraph/nuclearGraph';
import { buildOrbitalModelGraph } from '../modelGraph/orbitalGraph';
import { buildRelativisticEnergyGraph } from '../modelGraph/relativisticEnergyGraph';
import { buildSpecialRelativityGraph } from '../modelGraph/specialRelativityGraph';
import { buildPhotonGraph } from '../modelGraph/photonGraph';
import { kardashevPower, schwarzschildRadius } from '../physics';
import { runIsingMetropolisScenario } from '../isingModel';
import { EpidemicCitySimulation, DEFAULT_CITY_PARAMS } from '../simulation/epidemicCity';
import { createExperimentProvenance, statusForCapability } from './provenance';
import { createExperimentIntent, createExperimentPlan, getRouterModel, validateStructuredExperimentRequest } from './router';
import { registerLiveExperimentWorld } from './worldHandoff';
import {
  EXPERIMENT_FABRIC_VERSION,
  type ExperimentResult,
  type ExperimentRoute,
  type ExperimentRun,
  type ExperimentValue,
  type StructuredExperimentRequest,
} from './types';

const SOLAR_MASS_KG = 1.989e30;

type ExecutableGraph = {
  getParameterNodeIds(): readonly string[];
  applyParameterSnapshot(snapshot: Record<string, number>): void;
  getValue(id: string): number;
  getNode(id: string): { unit: string; honestyNote: string } | undefined;
};

function routeForUnavailable(): ExperimentRoute { return { kind: 'none' }; }

function unavailableResult(status: Exclude<ExperimentResult['status'], 'completed' | 'rejected' | 'failed'>, summary: string, route: ExperimentRoute): ExperimentResult {
  return {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    status,
    summary,
    outputs: {},
    units: {},
    warnings: [summary],
    assumptions: [],
    visualization: [],
    route,
  };
}

function rejectedResult(errors: readonly string[]): ExperimentResult {
  return {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    status: 'rejected',
    summary: `Eksperyment odrzucony przez walidację: ${errors.join(' ')}`,
    outputs: {}, units: {}, warnings: [], assumptions: [], visualization: [], route: routeForUnavailable(),
  };
}

function graphOutputs(
  graph: ExecutableGraph,
  params: Record<string, ExperimentValue>,
  outputIds: readonly string[],
): { outputs: Record<string, number>; units: Record<string, string>; assumptions: string[] } {
  const snapshot: Record<string, number> = {};
  for (const id of graph.getParameterNodeIds()) {
    const candidate = params[id];
    if (typeof candidate === 'number') snapshot[id] = candidate;
  }
  graph.applyParameterSnapshot(snapshot);
  const outputs: Record<string, number> = {};
  const units: Record<string, string> = {};
  const assumptions: string[] = [];
  for (const id of outputIds) {
    outputs[id] = graph.getValue(id);
    const node = graph.getNode(id);
    if (node) { units[id] = node.unit; assumptions.push(node.honestyNote); }
  }
  return { outputs, units, assumptions };
}

function executeRealModel(request: StructuredExperimentRequest, onLiveWorld?: (simulation: EpidemicCitySimulation) => void): ExperimentResult {
  const model = request.modelId ? getRouterModel(request.modelId) : undefined;
  if (!model) throw new Error('Brak lokalnego adaptera realnego modelu.');
  const params = request.parameters;
  switch (model.id) {
    case 'atom-hydrogen-orbital': {
      const orbital = String(params.orbital ?? '2pz');
      const solved = runHydrogenOrbitalScenario({ orbital, x: numberParam(params, 'x', 0), y: numberParam(params, 'y', 0), z: numberParam(params, 'z', 1) });
      return { contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: `Obliczono analityczną amplitudę orbitalu ${solved.label} i gęstość względną w zadanym punkcie.`, outputs: solved, units: { extentBohr: 'a₀', x: 'a₀', y: 'a₀', z: 'a₀', radiusBohr: 'a₀', radial: '', angular: '', psi: '', relativeDensity: '' }, warnings: ['Gęstość jest względna dla istniejących kształtów orbitalnych; nie jest wynikiem pojedynczego pomiaru elektronu.'], validity: 'Analityczne funkcje radialne i kątowe istniejącego zestawu orbitali wodoru. Brak wieloelektronowej korelacji, dynamiki czasowej, pomiaru i pełnej normalizacji obserwacyjnej.', assumptions: ['Punkt jest podany w promieniach Bohra w zakresie istniejącej wizualizacji.', 'Chmura Monte Carlo jest wyłącznie rendererem i nie wpływa na wynik.'], visualization: ['numeric', 'canvas-2d', 'scene-3d'], route: model.route };
    }
    case 'spacetime-light-cone': {
      const solved = runLightConeScenario({ v: numberParam(params, 'v', 0.6), tripYears: numberParam(params, 'tripYears', 20) });
      return { contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: `Dla v=${solved.v.toFixed(2)}c współczynnik Lorentza wynosi γ=${solved.gamma.toFixed(6)}, a czas własny podróżnika ${solved.travelerYears.toFixed(3)} lat.`, outputs: solved, units: { v: 'c', tripYears: 'lata', gamma: '', travelerYears: 'lata', turnaroundFraction: '', turnaroundRadiusFraction: '', causal: '' }, warnings: ['To idealizowany, natychmiastowy zawrót w szczególnej teorii względności; brak profilu przyspieszenia i ogólnej OTW.'], validity: 'Stożek światła 2+1D x²+z²=(ct)² i dylatacja Lorentza dla v<c. Brak dynamiki napędu, przyspieszenia końcowego i grawitacji.', assumptions: ['c=1 w geometrii sceny.', 'Wizualne skalowanie czasu nie zmienia relacji Lorentza raportowanej liczbowo.'], visualization: ['numeric', 'scene-3d'], route: model.route };
    }
    case 'einstein-point-lens': {
      const solved = runPointLensScenario({ beta: numberParam(params, 'beta', 0.8) });
      return { contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: solved.einsteinRing ? 'Obliczono granicę pierścienia Einsteina idealnej soczewki punktowej.' : `Obliczono dwa obrazy soczewki punktowej; wzmocnienie całkowite ${solved.totalMagnification.toFixed(6)}×.`, outputs: solved, units: { beta: '', u: '', thetaPlus: 'θE', thetaMinus: 'θE', magnificationPlus: '', magnificationMinus: '', totalMagnification: '', einsteinRing: '' }, warnings: ['To idealna soczewka punktowa; wynik nie jest dopasowaniem do obrazu teleskopowego ani pomiarem ciemnej materii.'], validity: 'Dokładne wzory soczewki punktowej dla punktowego źródła i pojedynczej masy. Brak rozciągłej masy, wielopłaszczyznowości, efektów skończonego źródła, dynamiki i danych obserwacyjnych.', assumptions: ['β jest bezwymiarową pozycją źródła w jednostkach promienia Einsteina.', 'Dla β=0 raportowany jest idealny limit pierścienia z odcięciem numerycznym u=0,001.'], visualization: ['numeric', 'graph', 'canvas-2d'], route: model.route };
    }
    case 'einstein-schwarzschild-geodesic': {
      const solved = runSchwarzschildGeodesicScenario({ impact: numberParam(params, 'impact', 1.1) });
      return { contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: `Zintegrowano geodezyjną zerową: ${solved.outcome === 'captured' ? 'foton został pochłonięty' : solved.outcome === 'escaped' ? 'foton uciekł' : 'osiągnięto limit integracji'}.`, outputs: solved, units: { impact: '', b: 'jedn. ekranu', criticalImpact: 'jedn. ekranu', outcome: '', steps: 'kroki RK4', minRadius: 'jedn. ekranu', turns: 'obroty' }, warnings: ['Model dotyczy pojedynczego promienia w płaszczyźnie równikowej; rendering dysku jest poza wynikiem obliczeniowym.'], validity: 'Równanie geodezyjnej zerowej Schwarzschilda w płaszczyźnie równikowej, rozwiązywane istniejącym krokiem RK4. Brak Kerra, ray tracingu 3D, pełnego soczewkowania obrazu i fizyki dysku.', assumptions: ['Promień Schwarzschilda jest jednostką wizualnego scenariusza, nie estymacją masy obserwowanej czarnej dziury.', 'Klasyfikacja opiera się na istniejących progach horyzontu i ucieczki Canvasu.'], visualization: ['numeric', 'graph', 'canvas-2d'], route: model.route };
    }
    case 'einstein-schwarzschild': {
      const massSolar = typeof params.massSolar === 'number' ? params.massSolar : 1;
      const radiusMeters = schwarzschildRadius(massSolar * SOLAR_MASS_KG);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Promień Schwarzschilda obliczony dla masy ${massSolar} M☉.`,
        outputs: { radiusMeters, radiusKm: radiusMeters / 1000 }, units: { radiusMeters: 'm', radiusKm: 'km' }, warnings: [],
        validity: 'Metryka Schwarzschilda: czarna dziura nieobracająca się i nie naładowana.',
        assumptions: ['r_s = 2GM/c²', 'Brak spinu i ładunku.'], visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'universe-kepler': {
      const details = graphOutputs(buildOrbitalModelGraph(), params, ['orbitalPeriodYears', 'orbitalSpeedAuPerYear', 'relativeTidalStrength']);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano graf orbitalny Keplera.',
        outputs: details.outputs, units: details.units, warnings: [], validity: 'Zagadnienie dwóch ciał; orbita kołowa.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'universe-three-body': {
      const requestedPreset = params.preset;
      if (requestedPreset !== undefined && requestedPreset !== 'figure8' && requestedPreset !== 'pythagorean') {
        throw new Error('preset problemu trzech ciał musi mieć wartość figure8 albo pythagorean.');
      }
      const preset: ThreeBodyPreset = requestedPreset === 'pythagorean' ? 'pythagorean' : 'figure8';
      const horizonTime = numberParam(params, 'horizonTime', 10);
      const divergence = params.divergence === true;
      const solved = runThreeBodyScenario({ preset, horizonTime, divergence });
      const warnings = solved.relativeEnergyDrift > 0.01
        ? [`Względny drift energii wyniósł ${(solved.relativeEnergyDrift * 100).toPrecision(3)}%; zwiększ precyzję przez skrócenie horyzontu.`]
        : [];
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Wykonano deterministyczną integrację problemu trzech ciał: ${preset === 'pythagorean' ? 'układ pitagorejski' : 'orbita ósemkowa'}, t=${horizonTime}.`,
        outputs: {
          preset,
          horizonTime: solved.horizonTime,
          initialEnergy: solved.initialEnergy,
          finalEnergy: solved.finalEnergy,
          relativeEnergyDrift: solved.relativeEnergyDrift,
          finalMinPairDistance: solved.finalMinPairDistance,
          ...(solved.finalSeparation === undefined ? {} : { finalSeparation: solved.finalSeparation }),
        },
        units: {
          preset: '', horizonTime: 'jedn. bezwymiarowe', initialEnergy: 'jedn. energii', finalEnergy: 'jedn. energii',
          relativeEnergyDrift: '', finalMinPairDistance: 'jedn. odległości', finalSeparation: 'jedn. odległości',
        },
        warnings,
        validity: 'Newtonowskie trzy ciała w 2D, G=1, zmiękczenie 10⁻⁶ i ustalone warunki początkowe; nie jest prognozą konkretnego układu astronomicznego.',
        assumptions: [
          'Integracja adaptive velocity-Verlet z istniejącego Universe Lab.',
          preset === 'pythagorean' ? 'Masy 3:4:5 startują ze spoczynku.' : 'Trzy równe masy startują z warunku orbity ósemkowej.',
          divergence ? 'Drugi start różni się wyłącznie przesunięciem 10⁻⁶ pierwszego ciała.' : 'Nie uruchomiono drugiego startu do pomiaru rozjazdu.',
        ],
        visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'universe-double-pendulum': {
      const angleDeg = numberParam(params, 'angleDeg', 120);
      const horizonSeconds = numberParam(params, 'horizonSeconds', 10);
      const divergence = params.divergence === true;
      const solved = runDoublePendulumScenario({ angleDeg, horizonSeconds, divergence });
      const warnings = solved.relativeEnergyDrift > 0.001
        ? [`Względny drift energii RK4 wyniósł ${(solved.relativeEnergyDrift * 100).toPrecision(3)}%; wynik numeryczny należy interpretować w obrębie tego horyzontu.`]
        : [];
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Wykonano deterministyczną integrację podwójnego wahadła: kąt ${angleDeg}°, t=${horizonSeconds} s.`,
        outputs: {
          initialAngleDeg: solved.initialAngleDeg,
          horizonSeconds: solved.horizonSeconds,
          initialEnergy: solved.initialEnergy,
          finalEnergy: solved.finalEnergy,
          relativeEnergyDrift: solved.relativeEnergyDrift,
          finalTheta1Rad: solved.finalTheta1Rad,
          finalTheta2Rad: solved.finalTheta2Rad,
          ...(solved.finalAngularSeparation === undefined ? {} : { finalAngularSeparation: solved.finalAngularSeparation }),
        },
        units: {
          initialAngleDeg: '°', horizonSeconds: 's', initialEnergy: 'J/kg', finalEnergy: 'J/kg', relativeEnergyDrift: '',
          finalTheta1Rad: 'rad', finalTheta2Rad: 'rad', finalAngularSeparation: 'rad',
        },
        warnings,
        validity: 'Dwa idealne wahadła w płaszczyźnie: m₁=m₂=1 kg, L₁=L₂=1 m, g=9,81 m/s², bez tarcia; RK4 nie jest symplektyczny i energia numerycznie dryfuje.',
        assumptions: [
          'Równania Lagrange’a i istniejący krok RK4 z Universe Lab.',
          divergence ? 'Drugi start różni się wyłącznie perturbacją kąta pierwszego wahadła o 10⁻⁶ rad.' : 'Nie uruchomiono drugiego startu do pomiaru rozjazdu.',
        ],
        visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'universe-hubble-tension': {
      const extraSystematic = numberParam(params, 'extraSystematic', 0);
      const showTrgb = params.showTrgb !== false;
      const solved = runHubbleTensionScenario({ extraSystematic, showTrgb });
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Porównano utrwalone wartości H₀: napięcie SH0ES–Planck wynosi ${solved.tensionSigma.toFixed(2)}σ.`,
        outputs: {
          tensionSigma: solved.tensionSigma,
          shoesH0: solved.shoesH0,
          planckH0: solved.planckH0,
          gapPercent: solved.gapPercent,
          extraSystematic: solved.extraSystematic,
          ...(solved.trgbH0 === undefined ? {} : { trgbH0: solved.trgbH0 }),
        },
        units: {
          tensionSigma: 'σ', shoesH0: 'km/s/Mpc', planckH0: 'km/s/Mpc', gapPercent: '%',
          extraSystematic: 'km/s/Mpc', trgbH0: 'km/s/Mpc',
        },
        warnings: ['Wynik porównuje utrwalone wartości referencyjne i podane niepewności; nie ustala, czy rozbieżność pochodzi z systematyki, czy nowej fizyki.'],
        validity: 'Statystyczne porównanie trzech opublikowanych zestawów H₀ w granicach ich ustalonych wartości i niepewności; nie jest fitowaniem ΛCDM, analizą pełnych danych CMB ani predykcją kosmologiczną.',
        assumptions: [
          'Napięcie = różnica H₀ podzielona przez niepewności złożone w kwadraturze.',
          'Dodatkowa systematyka jest hipotetycznie dodawana tylko do niepewności Planck.',
          showTrgb ? 'TRGB jest widocznym trzecim punktem referencyjnym, nie rozstrzygnięciem sporu.' : 'TRGB jest świadomie ukryte w tej projekcji.',
        ],
        visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'universe-lorenz-attractor': {
      const rho = numberParam(params, 'rho', 28);
      const horizonTime = numberParam(params, 'horizonTime', 10);
      const divergence = params.divergence === true;
      const solved = runLorenzScenario({ rho, horizonTime, divergence });
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Wykonano deterministyczną integrację atraktora Lorenza: ρ=${rho}, t=${horizonTime}.`,
        outputs: {
          rho: solved.rho,
          horizonTime: solved.horizonTime,
          chaosThreshold: solved.chaosThreshold,
          finalX: solved.finalX,
          finalY: solved.finalY,
          finalZ: solved.finalZ,
          ...(solved.finalSeparation === undefined ? {} : { finalSeparation: solved.finalSeparation }),
        },
        units: { rho: '', horizonTime: 'jedn. czasu Lorenza', chaosThreshold: '', finalX: '', finalY: '', finalZ: '', finalSeparation: '' },
        warnings: ['Model Lorenza opisuje uproszczoną konwekcję. Czułość na warunki początkowe ogranicza predykcję; wynik nie jest prognozą pogody.'],
        validity: 'Klasyczny, trójwymiarowy model Lorenza z σ=10 i β=8/3, integrowany RK4; nie zawiera danych meteorologicznych, wymuszeń ani kalibracji klimatycznej.',
        assumptions: [
          'dx/dt=σ(y−x), dy/dt=x(ρ−z)−y, dz/dt=xy−βz.',
          divergence ? 'Drugi start różni się wyłącznie przesunięciem x o 10⁻⁴.' : 'Nie uruchomiono drugiego startu do pomiaru rozjazdu.',
        ],
        visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'universe-planet-stability': {
      const years = numberParam(params, 'years', 10);
      const jupiter = params.jupiter !== false;
      const saturn = params.saturn !== false;
      const solved = runPlanetStabilityScenario({ years, jupiter, saturn });
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Wykonano czteroplanetową integrację N-ciał przez ${years} lat: Jowisz=${jupiter ? 'wł.' : 'wył.'}, Saturn=${saturn ? 'wł.' : 'wył.'}.`,
        outputs: {
          years: solved.years,
          earthEccentricity: solved.earthEccentricity,
          earthEccentricityDelta: solved.earthEccentricityDelta,
          marsEccentricity: solved.marsEccentricity,
          marsEccentricityDelta: solved.marsEccentricityDelta,
        },
        units: { years: 'lat', earthEccentricity: '', earthEccentricityDelta: '', marsEccentricity: '', marsEccentricityDelta: '' },
        warnings: ['Model ma tylko Słońce, Ziemię, Marsa oraz opcjonalnie Jowisza i Saturna; pozycje startowe są jakościowe, nie efemerydą dla konkretnej daty.'],
        validity: 'Newtonowski, płaski model N-ciał z velocity-Verlet w AU/latach/masach Słońca; nie obejmuje ośmiu planet, relatywistyki, księżyców ani pełnych efemeryd.',
        assumptions: [
          'Wszystkie planety startują w peryhelium z prędkością vis-viva.',
          'Mimośrody Ziemi i Marsa są obliczane z chwilowego stanu, nie zadawane jako wynik.',
          `Zaburzacze aktywne: ${[jupiter && 'Jowisz', saturn && 'Saturn'].filter(Boolean).join(', ') || 'brak'}.`,
        ],
        visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'universe-starlife': {
      const massSolar = numberParam(params, 'massSolar', 1);
      const solved = runStarLifeScenario({ massSolar });
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Wykonano istniejący model skalujący życia gwiazdy dla ${solved.massSolar.toFixed(2)} M☉; prognozowany los w granicach modelu: ${solved.finalFateLabel}.`,
        outputs: {
          massSolar: solved.massSolar,
          relativeLuminositySolar: solved.relativeLuminositySolar,
          mainSequenceLifetimeGyr: solved.mainSequenceLifetimeGyr,
          finalFate: solved.finalFate,
          finalFateLabel: solved.finalFateLabel,
        },
        units: {
          massSolar: 'M☉', relativeLuminositySolar: 'L☉', mainSequenceLifetimeGyr: 'mld lat', finalFate: '', finalFateLabel: '',
        },
        warnings: ['Los końcowy wynika z uproszczonych progów masy modelu; nie jest predykcją konkretnej gwiazdy ani oceną supernowej.'],
        validity: 'Skalowania L ∝ M³·⁵ i t_MS ≈ 10·M⁻²·⁵ w zakresie 0,2–40 M☉ z edukacyjnymi progami 8 i 22 M☉; bez integracji wnętrza, metaliczności, utraty masy, rotacji, binarności i pełnej ewolucji jądrowej.',
        assumptions: [
          'Masa jest jedynym parametrem wejściowym; jasność i czas ciągu głównego są relacjami skalującymi względem Słońca.',
          'Progi białego karła, gwiazdy neutronowej i czarnej dziury są takie same jak w istniejącym Universe Lab i mają charakter edukacyjny.',
        ],
        visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'universe-galaxy-collision': {
      const ratio = numberParam(params, 'ratio', 1);
      const retro = params.retro === true;
      const horizonMyr = numberParam(params, 'horizonMyr', 240);
      const solved = runCollisionScenario({ ratio, retro, horizonMyr });
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Wykonano ograniczony model Toomre–Toomre zderzenia galaktyk przez ${solved.horizonMyr} mln lat skalowania widoku; minimalna separacja jąder: ${solved.minCoreSeparationSceneUnits.toFixed(2)} jednostek sceny.`,
        outputs: {
          ratio: solved.ratio,
          retro: solved.retro,
          horizonMyr: solved.horizonMyr,
          seed: solved.seed,
          starCount: solved.starCount,
          initialCoreSeparationSceneUnits: solved.initialCoreSeparationSceneUnits,
          minCoreSeparationSceneUnits: solved.minCoreSeparationSceneUnits,
          finalCoreSeparationSceneUnits: solved.finalCoreSeparationSceneUnits,
        },
        units: {
          ratio: '', retro: '', horizonMyr: 'mln lat (skalowanie widoku)', seed: '', starCount: 'cząstki próbne',
          initialCoreSeparationSceneUnits: 'jedn. sceny', minCoreSeparationSceneUnits: 'jedn. sceny', finalCoreSeparationSceneUnits: 'jedn. sceny',
        },
        warnings: ['Skala czasu i odległości ma charakter wizualno-edukacyjny; restricted three-body nie modeluje gazu, samograwitacji dysków, tarcia dynamicznego ani gwiazdotworzenia.'],
        validity: 'Dwa punktowe jądra galaktyk z grawitacją Newtonowską i zmiękczeniem w jednostkach sceny; gwiazdy są bezmasowymi cząstkami próbnymi. Nie jest to pełny N-body, model hydrodynamiczny ani predykcja zderzenia konkretnej pary galaktyk.',
        assumptions: [
          'Warunki początkowe cząstek są deterministyczne dla ratio i retro; seed jest zapisywany w wyniku.',
          'Integrator używa tego samego kroku do 0,03 co istniejący Canvas Universe Lab.',
          retro ? 'Drugi dysk startuje z orbitalnym ruchem przeciwbieżnym.' : 'Drugi dysk startuje ze współbieżnym ruchem orbitalnym.',
        ],
        visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'universe-rotation-curve': {
      const haloVInf = numberParam(params, 'haloVInf', 150);
      const altGravity = params.altGravity === true;
      const solved = runRotationCurveScenario({ haloVInf, altGravity });
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Obliczono krzywą rotacji przy r=${solved.markerRadiusKpc} kpc w trybie ${solved.altGravity ? 'MOND' : 'halo pseudo-izotermicznego'}: ${solved.modeledVelocityKmS.toFixed(1)} km/s wobec ${solved.visibleDiskVelocityKmS.toFixed(1)} km/s dla samego dysku.`,
        outputs: {
          haloVInf: solved.haloVInf,
          altGravity: solved.altGravity,
          markerRadiusKpc: solved.markerRadiusKpc,
          visibleDiskVelocityKmS: solved.visibleDiskVelocityKmS,
          modeledVelocityKmS: solved.modeledVelocityKmS,
          gapPercent: solved.gapPercent,
          mondAsymptoticVelocityKmS: solved.mondAsymptoticVelocityKmS,
        },
        units: {
          haloVInf: 'km/s', altGravity: '', markerRadiusKpc: 'kpc', visibleDiskVelocityKmS: 'km/s',
          modeledVelocityKmS: 'km/s', gapPercent: '%', mondAsymptoticVelocityKmS: 'km/s',
        },
        warnings: ['Stałe dysku i halo są typowymi wartościami edukacyjnymi, nie fitowaniem obserwacyjnej krzywej konkretnej galaktyki; wynik nie rozstrzyga CDM kontra MOND.'],
        validity: 'Masa dysku jest przybliżona sferycznie; CDM używa pseudo-izotermicznego halo, a MOND relacji przy małym przyspieszeniu. Brak dopasowania danych, gazu, bulge, geometrii cienkiego dysku i analizy gromad/CMB.',
        assumptions: [
          'Punkt raportowania znajduje się przy r=20 kpc, identycznie jak w istniejącym Canvasie.',
          solved.altGravity ? 'Wybrano alternatywną relację MOND zamiast dodania halo ciemnej materii.' : 'Wybrano wykładniczy dysk oraz pseudo-izotermiczne halo ciemnej materii.',
        ],
        visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'atom-bohr': {
      const details = graphOutputs(buildBohrModelGraph(), params, ['energyLevelEV', 'orbitalRadiusPm', 'ionizationPhotonEV']);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano model Bohra dla układu wodoropodobnego.',
        outputs: details.outputs, units: details.units, warnings: [], validity: 'Ścisły dla atomów i jonów jednoelektronowych.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'photon-energy': {
      const details = graphOutputs(buildPhotonGraph(), params, ['photonEnergyEV', 'photonFrequencyTHz', 'photonEnergyKJmol']);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Obliczono energię i częstotliwość fotonu z długości fali.',
        outputs: details.outputs, units: details.units, warnings: [], validity: 'Model opisuje pojedynczy foton E = hc/λ, nie pole elektromagnetyczne.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'nuclear-semf': {
      const details = graphOutputs(buildNuclearModelGraph(), params, ['massNumber', 'bindingEnergy', 'bindingPerNucleon', 'stabilityGradient']);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano istniejący model jądrowy SEMF.',
        outputs: details.outputs, units: details.units, warnings: [], validity: 'Model kroplowy; pomija efekty powłokowe.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'sr-lorentz': {
      const details = graphOutputs(buildSpecialRelativityGraph(), params, ['lorentzGammaFactor', 'dilatedTimeSeconds', 'contractedLengthMeters', 'dopplerApproaching']);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano istniejący graf szczególnej teorii względności.',
        outputs: details.outputs, units: details.units, warnings: [], validity: 'Ruch inercjalny wzdłuż jednej osi; β < 1.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'universe-solar-system': {
      const solved = runSolarSystemScenario({ daysElapsed: numberParam(params, 'daysElapsed', 365.256) });
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Obliczono pozycje ${solved.planetCount} planet po ${solved.daysElapsed.toFixed(3)} dniach od umownego startu Keplerowskiego.`,
        outputs: { ...solved, positions: JSON.stringify(solved.positions) },
        units: { daysElapsed: 'dni ziemskie', planetCount: 'planets', mercuryOrbits: 'orbits', earthOrbits: 'orbits', mercuryRadiusAu: 'AU', earthRadiusAu: 'AU', neptuneRadiusAu: 'AU', positions: 'AU (JSON)' },
        warnings: ['Fazy startowe są umowne. Wynik pokazuje pozycje względem modelu Keplera, a nie bieżącą efemerydę ani pozycję planety na datę kalendarzową.'],
        validity: 'Rozwiązanie równania Keplera dla danych orbitalnych ośmiu planet. Pomija wzajemne zaburzenia planet, inklinacje, precesję, relatywistykę oraz aktualizowane elementy efemerydalne.',
        assumptions: ['Płaszczyznowe, niezależne orbity Keplera o stałych elementach.', 'Czas startowy jest umowny, nie powiązany z datą UTC ani NASA JPL Horizons.'],
        visualization: ['numeric', 'canvas-2d'], route: model.route,
      };
    }
    case 'universe-atmospheric-escape': {
      const details = graphOutputs(buildAtmosphericEscapeGraph(), params, ['equilibriumTempK', 'escapeVelocityMs', 'thermalVelocityMs', 'jeansParameter', 'thermalToEscapeRatio']);
      const lambda = details.outputs.jeansParameter;
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano istniejący model ucieczki atmosferycznej Jeansa.',
        outputs: details.outputs, units: details.units,
        warnings: lambda < 15 ? ['Parametr Jeansa < 15: przybliżenie stabilnej atmosfery nie obowiązuje.'] : [],
        validity: 'Ucieczka termiczna Jeansa; bez efektu cieplarnianego, hydrodynamiki i wiatru gwiazdowego.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'einstein-kerr-equatorial': {
      const solved = runKerrScenario({ spin: numberParam(params, 'spin', 0.7) });
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Obliczono analityczne promienie Kerra dla a/M=${solved.spin.toFixed(3)}; różnica orbit fotonowych prograde/retrograde wynosi ${solved.frameDraggingGap.toFixed(6)} M.`,
        outputs: solved,
        units: { spin: '', mass: 'M', rPlus: 'M', rErgoEquator: 'M', rPro: 'M', rRetro: 'M', frameDraggingGap: 'M', criticalImpactPrograde: 'M', criticalImpactRetrograde: 'M' },
        warnings: ['Wynik opisuje jedynie analityczne obserwowalne Kerra w płaszczyźnie równikowej, a nie losowe ślady fotonów renderera.'],
        validity: 'Horyzont, ergosfera równikowa oraz kołowe orbity fotonowe Kerra dla 0 ≤ a/M ≤ 0,97. Brak geodezyjnych poza równikiem, stałej Cartera Q≠0, dysku akrecyjnego, ray tracingu 3D i danych obserwacyjnych.',
        assumptions: ['Masa geometryczna M=1.', 'Orbity fotonowe są równikowe; brak precesji w θ.'],
        visualization: ['numeric', 'scene-3d'], route: model.route,
      };
    }
    case 'biology-dna-helix': {
      const sequence = typeof params.sequence === 'string' ? params.sequence : 'mixed';
      const solved = runDnaHelixScenario({ sequence, temperatureC: numberParam(params, 'temperatureC', 37) });
      return { contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: `Obliczono B-DNA dla ${solved.basePairs} par zasad (${solved.gcPairs} G/C): Tm=${solved.tmC.toFixed(1)}°C, frakcja rozdzielona=${(solved.denaturedFraction * 100).toFixed(2)}%.`, outputs: solved, units: { sequence: '', basePairs: 'bp', gcPairs: 'bp', tmC: '°C', temperatureC: '°C', denaturedFraction: '', risePerBasePairNm: 'nm/bp', radiusNm: 'nm', basePairsPerTurn: 'bp/turn' }, warnings: ['Frakcja denaturacji używa ilustracyjnej szerokości logistycznej; nie jest pomiarem ani parametrem termodynamicznym konkretnej sekwencji.'], validity: 'Geometria B-DNA oraz reguła Wallace’a dla krótkich presetów. Bez metody najbliższego sąsiada, parametrów soli, pełnej termodynamiki, struktury atomowej, dynamiki molekularnej i biologii komórkowej.', assumptions: ['Sekwencja jest jednym z trzech lokalnych presetów długości 20 bp.', 'Temperatura w zakresie 0–100°C.'], visualization: ['numeric', 'scene-3d'], route: model.route };
    }
    case 'nuclear-tokamak-lawson': {
      const solved = runTokamakLawsonScenario({ densityExponent: numberParam(params, 'densityExponent', 20), temperatureKeV: numberParam(params, 'temperatureKeV', 15), confinementSeconds: numberParam(params, 'confinementSeconds', 1.5) });
      return { contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: `Obliczono nTτ_E = ${solved.tripleProduct.toExponential(4)} keV·s/m³, czyli ${solved.lawsonRatio.toFixed(6)}× progu Lawsona.`, outputs: solved, units: { densityExponent: '', densityPerM3: 'm⁻³', temperatureKeV: 'keV', confinementSeconds: 's', tripleProduct: 'keV·s/m³', lawsonThreshold: 'keV·s/m³', lawsonRatio: '', ignitionCriterionMet: '' }, warnings: ['Spełnienie kryterium 0D nie jest predykcją zapłonu konkretnego urządzenia.'], validity: 'Ograniczone kryterium Lawsona D-T nTτ_E / 3×10²¹. Bez MHD, profili plazmy, transportu, strat promienistych, geometrii reaktora, bilansu mocy i kalibracji eksperymentalnej.', assumptions: ['Jednorodny bilans 0D.', 'Próg Lawsona jest stałą referencyjną tego modelu.'], visualization: ['numeric', 'canvas-2d'], route: model.route };
    }
    case 'nuclear-nuclide-chart': {
      const solved = runNuclideChartScenario({
        protonNumber: numberParam(params, 'protonNumber', 26),
        neutronNumber: numberParam(params, 'neutronNumber', 30),
      });
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: solved.knownNuclide
          ? `Obliczono SEMF dla A=${solved.massNumber}; lokalny katalog zawiera rekord ${solved.measuredSymbol}.`
          : `Obliczono predykcję SEMF dla Z=${solved.protonNumber}, N=${solved.neutronNumber}; lokalny katalog nie zawiera rekordu pomiarowego.`,
        outputs: solved,
        units: { protonNumber: '', neutronNumber: '', massNumber: '', bindingPerNucleonMeV: 'MeV/nucleon', stabilityGradient: 'model gradient', knownNuclide: '', measuredSymbol: '', measuredDecayMode: '', measuredHalfLife: '' },
        warnings: solved.knownNuclide ? [] : ['Brak wpisu w lokalnym katalogu nie oznacza, że nuklid nie istnieje; oznacza wyłącznie brak rekordu w ograniczonym zbiorze około 55 wpisów.'],
        validity: 'SEMF jest modelem kroplowym energii wiązania i pomija efekty powłokowe. Dane o rozpadzie są ujawniane wyłącznie dla rekordów istniejącego lokalnego katalogu NNDC/IAEA; nie są interpolowane.',
        assumptions: ['1 ≤ Z ≤ 100 oraz 0 ≤ N ≤ 160.', 'Model SEMF i katalog pomiarowy pozostają źródłowo rozdzielone.'],
        visualization: ['numeric', 'canvas-2d'], route: model.route,
      };
    }
    case 'spacetime-minkowski': {
      const solved = runMinkowskiScenario({ beta: numberParam(params, 'beta', 0) });
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Przekształcono dwa ustalone zdarzenia w diagramie Minkowskiego dla β=${solved.beta.toFixed(3)}; kolejność: ${solved.ordering}.`,
        outputs: solved,
        units: { beta: 'c', gamma: '', tA: 'ct (unit convention)', tB: 'ct (unit convention)', ordering: '', intervalSquared: 'c²t²−x² (unit convention)' },
        warnings: ['Wynik dotyczy wyłącznie dwóch ustalonych zdarzeń A/B i konwencji c=1; nie jest obserwacją ani predykcją fizycznego układu.'],
        validity: 'Dokładna szczególna transformacja Lorentza 1+1D dla β ∈ [−0,9; 0,9]. Bez przyspieszenia, ogólnej OTW, dynamiki ciał i danych obserwacyjnych.',
        assumptions: ['Zdarzenia A i B są ustalone i przestrzennopodobnie rozdzielone.', 'Jednostki diagramu są umowne oraz przyjmują c=1.'],
        visualization: ['numeric', 'canvas-2d'], route: model.route,
      };
    }
    case 'spacetime-c-slider': {
      const velocityMs = numberParam(params, 'velocityMs', 1.5e8);
      const lightSpeedMs = numberParam(params, 'lightSpeedMs', 299792458);
      const distanceKm = numberParam(params, 'distanceKm', 384400);
      if (velocityMs >= lightSpeedMs) {
        return {
          contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'rejected',
          summary: 'Eksperyment myślowy odrzucony: model szczególnej teorii względności nie ma rozwiązania dla v≥c.',
          outputs: {}, units: {}, warnings: ['Zmień parametry tak, aby velocityMs było mniejsze od lightSpeedMs.'],
          validity: 'Graf c-Slider jest ważny wyłącznie dla β=v/c<1.',
          assumptions: ['Parametr c jest hipotetyczny i nie zmienia fizycznej stałej prędkości światła w próżni.'],
          visualization: [], route: model.route,
        };
      }
      const solved = runLightSpeedScenario({ velocityMs, lightSpeedMs, distanceKm });
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Wykonano istniejący graf c-Slider dla β=${solved.betaFraction.toFixed(6)} i jawnie hipotetycznej wartości c.`,
        outputs: solved,
        units: { velocityMs: 'm/s', lightSpeedMs: 'm/s', distanceKm: 'km', betaFraction: '', lorentzGammaFactor: '', secondsPerProperSecond: 's per s własną', lengthContractionPercent: '%', dopplerApproaching: '×', lightTravelTimeSeconds: 's' },
        warnings: ['To eksperyment myślowy: parametr lightSpeedMs zmienia założenie modelu, nie rzeczywistą stałą fizyczną.'],
        validity: 'Dokładne relacje szczególnej teorii względności dla inercjalnego ruchu i β<1, przy jawnie zadanej hipotetycznej wartości c. Nie jest obserwacją, pomiarem ani zmianą stałych natury.',
        assumptions: ['v, c i dystans są parametrami wejściowymi.', 'Brak przyspieszenia, grawitacji, danych obserwacyjnych i interpretacji świata rzeczywistego.'],
        visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'particle-relativistic-energy': {
      const details = graphOutputs(buildRelativisticEnergyGraph(), params, ['lorentzGammaFactor', 'totalEnergyMeV', 'kineticEnergyMeV', 'momentumMeVc']);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano istniejący model energii relatywistycznej cząstki.',
        outputs: details.outputs, units: details.units, warnings: [], validity: 'Cząstka swobodna w próżni; β < 1.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'chemistry-titration': {
      const acid = typeof params.acid === 'string' ? params.acid : 'acetic';
      const solved = runTitrationScenario({ acid, vb: numberParam(params, 'vb', 0) });
      return { contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: `Obliczono pH=${solved.ph.toFixed(4)} dla ${solved.acidName} po dodaniu ${solved.vb.toFixed(2)} mL NaOH.`, outputs: solved, units: { acid: '', acidName: '', ka: 'mol/L', vb: 'mL', ph: '', veq: 'mL', pKa: '' }, warnings: ['To deterministyczny scenariusz laboratoryjny o stałych stężeniach i temperaturze; nie jest pomiarem konkretnej próbki ani automatyczną identyfikacją kwasu.'], validity: 'Bilans ładunku słabego kwasu i NaOH z autodysocjacją wody, rozwiązywany istniejącą funkcją Canvasu. Brak aktywności jonowych, temperatury zmiennej, CO₂, wieloprotonowości i niepewności pomiarowej.', assumptions: ['Ca=Cb=0,1 mol/L; Va=25 mL; NaOH jest mocną zasadą.', 'Dozwolone są tylko cztery istniejące słabe kwasy z lokalnymi Ka.'], visualization: ['numeric', 'graph', 'canvas-2d'], route: model.route };
    }
    case 'chem-vsepr': {
      const shapeId = typeof params.shapeId === 'string' ? params.shapeId : 'ax4';
      const solved = runVseprScenario({ shapeId });
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Odczytano geometrię VSEPR ${solved.name} (${solved.example}): ${solved.bonding} domen wiążących i ${solved.lone} wolnych par.`,
        outputs: { ...solved, bondingVecs: JSON.stringify(solved.bondingVecs), loneVecs: JSON.stringify(solved.loneVecs) },
        units: { shapeId: '', name: '', example: '', bonding: 'domains', lone: 'domains', angleLabel: '', angleMeasured: '', bondingVecs: 'unit-vector[] (JSON)', loneVecs: 'unit-vector[] (JSON)' },
        warnings: solved.angleMeasured ? [] : ['Dla kształtów z wolnymi parami, poza NH₃ i H₂O, model zwraca istniejącą idealizację geometrii rodzica, a nie indywidualny zmierzony kąt związku.'],
        validity: 'Deterministyczne wektory domen elektronowych VSEPR. Model nie oblicza funkcji falowej, energii wiązań, widm, struktury elektronowej ani dynamiki molekularnej.',
        assumptions: ['shapeId musi wskazywać jeden z istniejących 13 kształtów VSEPR.', 'Geometrie bez wolnych par są idealne; odchylenia dla innych związków nie są estymowane.'],
        visualization: ['numeric', 'scene-3d'], route: model.route,
      };
    }
    case 'chemistry-ising': {
      const temperature = numberParam(params, 'temperature', 2);
      const seed = numberParam(params, 'seed', 20_260_819);
      const solved = runIsingMetropolisScenario({ temperature, seed });
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Wykonano ${solved.sweeps} sweepów Metropolisa 2D Isinga dla T=${solved.temperature.toFixed(3)}; |M|=${solved.magnetization.toFixed(3)} wobec dokładnej referencji ${solved.exactMagnetization.toFixed(3)}.`,
        outputs: {
          temperature: solved.temperature,
          seed: solved.seed,
          latticeSize: solved.latticeSize,
          sweeps: solved.sweeps,
          magnetization: solved.magnetization,
          energyPerSite: solved.energyPerSite,
          exactMagnetization: solved.exactMagnetization,
          magnetizationDelta: solved.magnetizationDelta,
        },
        units: { temperature: 'J/k_B', seed: '', latticeSize: 'spiny / bok', sweeps: 'sweeps', magnetization: '', energyPerSite: 'J/spin', exactMagnetization: '', magnetizationDelta: '' },
        warnings: ['Pojedynczy seed i skończone 100 sweepów nie są oszacowaniem niepewności ani dowodem termalizacji; blisko T_c występuje realne critical slowing down.'],
        validity: '2D Ising J=1, bez pola zewnętrznego, z najbliższymi sąsiadami i periodycznymi brzegami. Dokładna magnetyzacja Onsagera/Yanga dotyczy granicy termodynamicznej; run Monte Carlo działa na siatce 42×42.',
        assumptions: [
          'Stan początkowy przybliża nieskorelowaną siatkę T=∞ i jest generowany z zapisanego seeda.',
          '100 sweepów po 42² próby Metropolisa używa tego samego kroku co istniejący model Canvas.',
        ],
        visualization: ['numeric', 'graph', 'canvas-2d'], route: model.route,
      };
    }
    case 'chemistry-arrhenius': {
      const details = graphOutputs(buildChemistryKineticsGraph(), params, ['rateConstant', 'halfLifeFirstOrder', 'speedupVsRoom']);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano istniejący graf kinetyki Arrheniusa.',
        outputs: details.outputs, units: details.units, warnings: [], validity: 'Stały czynnik A i energia aktywacji; model reakcji I rzędu dla t½.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'math-gaussian': {
      const details = graphOutputs(buildGaussianGraph(), params, ['zScore', 'pdfValue', 'probWithinZ']);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano istniejący graf rozkładu normalnego.',
        outputs: details.outputs, units: details.units, warnings: [], validity: 'σ > 0; rozkład normalny.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'biology-protein-folding-hp': {
      const sequenceKey = typeof params.sequenceKey === 'string' ? params.sequenceKey : 'classic';
      const solved = runProteinFoldingScenario({
        sequenceKey: sequenceKey as 'classic' | 'blockH' | 'alternating' | 'mostlyP',
        temperature: numberParam(params, 'temperature', 1),
        steps: numberParam(params, 'steps', 5000),
        seed: numberParam(params, 'seed', 20_260_819),
      });
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Wykonano seedowany run Metropolisa HP: najlepsza energia kontaktowa ${solved.bestEnergy} po ${solved.steps} krokach.`,
        outputs: solved,
        units: { sequenceKey: '', sequenceLength: 'reszty HP', temperature: 'jednostki zredukowane', steps: 'kroki Monte Carlo', seed: '', initialEnergy: 'jednostki energii HP', finalEnergy: 'jednostki energii HP', bestEnergy: 'jednostki energii HP', finalHydrophobicContacts: 'kontakty H–H', acceptedMoves: 'kroki', acceptanceRate: '' },
        warnings: ['To model HP: tylko reszty H/P i siatka 2D. Najniższa znaleziona energia może być minimum lokalnym, nie globalną strukturą białka.'],
        validity: 'Istniejący model HP (Hydrophobic–Polar) na siatce 2D, uruchomiony seedowanym Metropolisem. Opisuje wyłącznie kontakty hydrofobowe H–H poza szkieletem; nie jest predykcją struktury, funkcji ani dynamiki prawdziwego białka.',
        assumptions: ['Sekwencja jest jednym z czterech lokalnych presetów H/P.', 'Seed ujawnia trajektorię Monte Carlo; nie ma danych eksperymentalnych, geometrii 3D ani pełnej energii molekularnej.'],
        visualization: ['numeric', 'canvas-2d'], route: model.route,
      };
    }
    case 'math-tesseract-4d': {
      const solved = runTesseractProjectionScenario({
        angleXWDeg: numberParam(params, 'angleXWDeg', 0),
        angleYZDeg: numberParam(params, 'angleYZDeg', 0),
        doubleRotation: params.doubleRotation === true,
      });
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Obliczono dokładną rotację tesseraktu 4D w XW${solved.doubleRotation ? ' i YZ' : ''} oraz projekcję 4D→3D dla ${solved.vertexCount} wierzchołków.`,
        outputs: {
          angleXWDeg: solved.angleXWDeg,
          angleYZDeg: solved.angleYZDeg,
          doubleRotation: solved.doubleRotation,
          viewerDistance: solved.viewerDistance,
          vertexCount: solved.vertexCount,
          edgeCount: solved.edgeCount,
          maxProjectedRadius: solved.maxProjectedRadius,
          projectedVerticesJson: JSON.stringify(solved.projectedVertices),
        },
        units: { angleXWDeg: '°', angleYZDeg: '°', doubleRotation: '', viewerDistance: 'jednostki projekcji', vertexCount: 'wierzchołki', edgeCount: 'krawędzie', maxProjectedRadius: 'jednostki projekcji', projectedVerticesJson: 'JSON [x,y,z][]' },
        warnings: ['To dokładna geometria i projekcja, lecz nie model fizycznych dodatkowych wymiarów, teoria strun ani hipoteza multiwersum.'],
        validity: 'Dokładna algebra liniowa obrotu w 4D oraz perspektywicznej projekcji 4D→3D dla ustalonego tesseraktu. Wynik nie opisuje obiektu fizycznego ani danych obserwacyjnych.',
        assumptions: ['Tesserakt ma ustalone 16 wierzchołków i 32 krawędzie.', 'Odległość obserwatora projekcji wynosi 3; nie jest to pomiar ani parametr kosmologiczny.'],
        visualization: ['numeric', 'scene-3d'], route: model.route,
      };
    }
    case 'biology-logistic': {
      const details = graphOutputs(buildLogisticGrowthGraph(), params, ['populationAtT', 'fractionOfCapacity']);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano istniejący model wzrostu logistycznego.',
        outputs: details.outputs, units: details.units, warnings: [], validity: 'Stałe r i K; bez struktury wiekowej, opóźnień i stochastyki.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'einstein-chirp-mass': {
      const m1Solar = numberParam(params, 'm1Solar', 30);
      const m2Solar = numberParam(params, 'm2Solar', 30);
      const solved = runChirpInspiralScenario({ m1Solar, m2Solar });
      if (!solved.startsBeforeIsco) {
        return {
          contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'rejected',
          summary: 'Eksperyment inspiralu odrzucony: dla tych mas stały start 20 Hz leży na lub powyżej ISCO, poza zakresem wczesnego inspiralu.',
          outputs: {}, units: {}, warnings: ['Zmniejsz sumę mas, aby startFrequencyHz=20 Hz był mniejsze niż iscoFrequencyHz.'],
          validity: 'Wiodąca formuła kwadrupolowa jest tu raportowana wyłącznie przed ISCO.',
          assumptions: ['Brak ekstrapolacji do połączenia lub ringdownu.'], visualization: [], route: model.route,
        };
      }
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Obliczono istniejący wczesny inspiral od ${solved.startFrequencyHz} Hz do ISCO; czas modelu do ISCO wynosi ${solved.timeToIscoSeconds.toPrecision(5)} s.`,
        outputs: solved,
        units: { m1Solar: 'M☉', m2Solar: 'M☉', totalMassSolar: 'M☉', chirpMassSolar: 'M☉', startFrequencyHz: 'Hz', iscoFrequencyHz: 'Hz', startsBeforeIsco: '', timeToIscoSeconds: 's', midInspiralFrequencyHz: 'Hz', startSeparationMeters: 'm', iscoSeparationMeters: 'm' },
        warnings: ['Model kończy się na ISCO. Połączenie i ringdown wymagają pełnej relatywistyki numerycznej i nie są obliczane.'],
        validity: 'Wiodąca formuła kwadrupolowa dla punktowego, nieobracającego się binarnego inspiralu do granicy ISCO Schwarzschilda. Nie jest dopasowaniem danych LIGO ani pełnym waveformem.',
        assumptions: ['Start częstotliwości jest stały i wynosi 20 Hz.', 'Brak spinu, ekscentryczności, precesji, pełnej numerycznej relatywistyki i danych obserwacyjnych.'], visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'chem-molecular-weight': {
      const formula = typeof params.formula === 'string' ? params.formula : 'H2O';
      const parsed = parseFormula(formula);
      if (!parsed.ok) throw new Error(parsed.error ?? 'Niepoprawny wzór sumaryczny.');
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Obliczono masę molową z istniejącego parsera wzoru sumarycznego.',
        outputs: { molarMassGmol: molecularWeight(parsed.counts), atomCount: atomCount(parsed.counts), degreeOfUnsaturation: degreeOfUnsaturation(parsed.counts) },
        units: { molarMassGmol: 'g/mol', atomCount: '', degreeOfUnsaturation: '' }, warnings: [],
        validity: 'Wzory bez nawiasów, hydratów i izotopów; stopień nienasycenia dla CHNOX.',
        assumptions: ['Parser cheminformatyczny Genesis v1.'], visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'civilization-drake-equation': {
      const solved = runDrakeEquationScenario({ starFormationRate: numberParam(params, 'starFormationRate', 1.5), fractionWithPlanets: numberParam(params, 'fractionWithPlanets', 0.9), earthlikePerSystem: numberParam(params, 'earthlikePerSystem', 0.2), fractionDevelopingLife: numberParam(params, 'fractionDevelopingLife', 0.5), fractionIntelligent: numberParam(params, 'fractionIntelligent', 0.1), fractionCommunicative: numberParam(params, 'fractionCommunicative', 0.1), lifetimeLog10Years: numberParam(params, 'lifetimeLog10Years', 4) });
      return { contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: `Przeliczono warunkową ramę Drake’a: N=${solved.civilizationCount.toExponential(3)} dla jawnych założeń wejściowych.`, outputs: solved, units: { starFormationRate: 'gwiazd/rok', fractionWithPlanets: '', earthlikePerSystem: '', fractionDevelopingLife: '', fractionIntelligent: '', fractionCommunicative: '', lifetimeLog10Years: 'log₁₀ lat', assumedLifetimeYears: 'lat', civilizationCount: '' }, warnings: ['To wynik algebraiczny warunkowy względem założeń, nie estymacja liczby cywilizacji ani dowód kontaktu pozaziemskiego.'], validity: 'Równanie Drake’a jako interpretacyjna rama ModelGraph. fₗ, fᵢ, f𝚌 i L są praktycznie nieograniczone obserwacyjnie; wynik nie jest prognozą.', assumptions: ['Wszystkie siedem parametrów jest jawnie podane przez użytkownika lub bazowy preset.', 'Algebra N=R⋆·fₚ·nₑ·fₗ·fᵢ·f𝚌·L jest wykonywana przez istniejący graf.'], visualization: ['numeric', 'graph', 'narrative'], route: model.route };
    }
    case 'civilization-kardashev': {
      const kardashevType = numberParam(params, 'kardashevType', 1);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Obliczono istniejącą klasyfikacyjną skalę mocy Kardaszewa.',
        outputs: { powerWatts: kardashevPower(kardashevType) }, units: { powerWatts: 'W' }, warnings: [],
        validity: 'Skala klasyfikacyjna Sagana; ekstrapolacja interpretacyjna, nie prognoza społeczna.',
        assumptions: ['P = 10^(10K+6) W.'], visualization: ['numeric', 'graph', 'narrative'], route: model.route,
      };
    }
    case 'quantum-teleportation': {
      const state = typeof params.state === 'string' ? params.state : 'plus';
      const solved = runQuantumTeleportScenario({ state });
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Zweryfikowano ${solved.branchCount} gałęzie teleportacji dla ${solved.stateLabel}; minimalna wierność wynosi ${solved.minFidelity.toFixed(12)}.`,
        outputs: { ...solved, branches: JSON.stringify(solved.branches) },
        units: { state: '', stateLabel: '', branchCount: '', minFidelity: '', averageFidelity: '', allRecovered: '', branches: 'JSON' },
        warnings: ['Fabric wylicza wszystkie gałęzie pomiaru deterministycznie; nie reprezentuje pojedynczego losowego wyniku sprzętowego.'],
        validity: 'Idealny pełny wektor stanu trzech kubitów dla teleportacji Bennett et al. i czterech gałęzi pomiaru. Nie obejmuje szumu, dekoherencji, bramek niedoskonałych, transmisji sieciowej, hardware’u ani teleportacji materii lub informacji nadświetlnej.',
        assumptions: ['Stan wejściowy jest jednym z sześciu normalizowanych presetów modelu.', 'Dwa bity klasyczne są wymagane do korekty Boba.'],
        visualization: ['numeric', 'canvas-2d'], route: model.route,
      };
    }
    case 'quantum-chsh-correlation': {
      const solved = runChshCorrelationScenario({ a: numberParam(params, 'a', 0), aP: numberParam(params, 'aP', 90), b: numberParam(params, 'b', 45), bP: numberParam(params, 'bP', 135) });
      return { contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: `Obliczono analitycznie |S|=${solved.absS.toFixed(6)} dla korelacji singletu.`, outputs: solved, units: { a: 'deg', aP: 'deg', b: 'deg', bP: 'deg', eAB: '', eABP: '', eAPB: '', eAPBP: '', s: '', absS: '', tsirelsonBound: '' }, warnings: ['To wynik idealnej korelacji singletu, nie statystyka wykrytych par ani dowód eksperymentalny.'], validity: 'Dokładna korelacja dwukubitowego singletu dla czterech kątów; brak modelu detektora, niesprawności, losowego wyboru ustawień, luk eksperymentalnych i hardware.', assumptions: ['E(a,b)=−cos(a−b).', 'Wartość CHSH nie umożliwia transmisji informacji.'], visualization: ['numeric', 'graph', 'canvas-2d'], route: model.route };
    }
    case 'quantum-tunneling-1d': {
      const solved = runTunnelingScenario({ energy: numberParam(params, 'energy', 0.55), barrier: numberParam(params, 'barrier', 1), width: numberParam(params, 'width', 3) });
      return { contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: `Wykonano 1D split-step Fourier: transmisja ${(solved.transmission * 100).toFixed(2)}%, odbicie ${(solved.reflection * 100).toFixed(2)}%.`, outputs: { ...solved }, units: { energy: '', barrier: 'j. nat.', width: 'j. nat.', frames: 'kroki', transmission: '', reflection: '', remainingProbability: '' }, warnings: ['Tłumiąca maska przy brzegach redukuje odbicia numeryczne; pozostałe prawdopodobieństwo obejmuje falę w barierze i absorpcję brzegu.'], validity: 'Pakiet Gaussa 1D i pojedyncza bariera prostokątna, ħ=m=1, N=512; nie jest ogólnym solverem Schrödingera, obliczeniem 3D ani modelem materiałowym.', assumptions: ['Integrator i pomiar są współdzielone z istniejącym Canvasem.', 'Horyzont 1200 kroków jest ustalony dla porównywalnego scenariusza.'], visualization: ['numeric', 'graph', 'canvas-2d'], route: model.route };
    }
    case 'quantum-bloch-circuit': {
      const circuit = typeof params.circuit === 'string' ? params.circuit : 'H X';
      const solved = runBlochCircuitScenario({ circuit });
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Wykonano dokładny obwód jednokubitowy |0⟩ → ${solved.gates.join(' → ')}; P(0)=${solved.probability0.toFixed(4)}, P(1)=${solved.probability1.toFixed(4)}.`,
        outputs: {
          circuit: solved.gates.join(' '),
          amplitude0Re: solved.finalAmplitude0[0], amplitude0Im: solved.finalAmplitude0[1],
          amplitude1Re: solved.finalAmplitude1[0], amplitude1Im: solved.finalAmplitude1[1],
          probability0: solved.probability0, probability1: solved.probability1,
          blochX: solved.bloch[0], blochY: solved.bloch[1], blochZ: solved.bloch[2], normSquared: solved.normSquared,
        },
        units: { circuit: '', amplitude0Re: '', amplitude0Im: '', amplitude1Re: '', amplitude1Im: '', probability0: '', probability1: '', blochX: '', blochY: '', blochZ: '', normSquared: '' },
        warnings: ['Wynik podaje amplitudy i prawdopodobieństwa; nie jest pojedynczym losowym pomiarem, runem na hardware ani eksperymentem splątania.'],
        validity: 'Dokładna ewolucja macierzy unitarnej pojedynczego kubitu rozpoczynającego w |0⟩. Brak wielokubitowych bramek, splątania, dekoherencji, szumu, kalibracji i dostępu do sprzętu kwantowego.',
        assumptions: ['Dozwolone są wyłącznie H, X, Y, Z, S i T; globalna faza nie jest obserwowalna.', 'Norma stanu musi pozostać równa 1 w granicach arytmetyki zmiennoprzecinkowej.'],
        visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'quantum-kitaev-bulk': {
      const chemicalPotential = numberParam(params, 'chemicalPotential', 0);
      const hopping = numberParam(params, 'hopping', 1);
      const pairing = numberParam(params, 'pairing', 1);
      const solved = solveKitaevBulk({ chemicalPotential, hopping, pairing });
      const warning = solved.phase === 'CRITICAL_BOUNDARY'
        ? ['Bulk gap zamyka się na granicy fazy; klasyfikacja topologiczna nie jest tam stabilna.']
        : [];
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Wykonano analityczny bulk model BdG łańcucha Kitaeva: ${solved.phase}.`,
        outputs: {
          bulkGap: solved.bulkGap,
          momentumAtGapRad: solved.momentumAtGap,
          topologicalInvariant: solved.topologicalInvariant,
          phaseClass: solved.phase,
          criticalChemicalPotentialNegative: solved.criticalChemicalPotentialNegative,
          criticalChemicalPotentialPositive: solved.criticalChemicalPotentialPositive,
        },
        units: {
          bulkGap: 'jedn. energii', momentumAtGapRad: 'rad', topologicalInvariant: '', phaseClass: '',
          criticalChemicalPotentialNegative: 'jedn. energii', criticalChemicalPotentialPositive: 'jedn. energii',
        },
        warnings: warning,
        validity: 'Bezinterakcyjny, translacyjnie niezmienny 1D spinless p-wave bulk model BdG; nie jest modelem nanodrutu, materiału, urządzenia ani wyniku eksperymentu Majorana 1.',
        assumptions: [
          'E(k)=±√((-2t cos k−μ)²+4Δ² sin²k).',
          'Klasyfikacja bulk: |μ|<2|t| przy Δ≠0.',
          solved.finiteSizeCaveat,
        ],
        visualization: ['numeric'], route: model.route,
      };
    }
    case 'water-pump-pipe': {
      const defaults = {
        volumetricFlow: numberParam(params, 'volumetricFlow', 0.05), pipeDiameter: numberParam(params, 'pipeDiameter', 0.1),
        pipeLength: numberParam(params, 'pipeLength', 100), pipeRoughnessMm: numberParam(params, 'pipeRoughnessMm', 0.045),
        staticLift: numberParam(params, 'staticLift', 10), fluidDensity: numberParam(params, 'fluidDensity', 998),
        fluidViscosity: numberParam(params, 'fluidViscosity', 1.002e-3), pumpEfficiency: numberParam(params, 'pumpEfficiency', 0.7),
      };
      const engineering = buildPumpPipeModel(defaults);
      const ids = ['flowVelocity', 'reynolds', 'frictionFactor', 'headLoss', 'totalHead', 'hydraulicPower', 'shaftPower'];
      const outputs: Record<string, number> = {};
      const units: Record<string, string> = {};
      const assumptions: string[] = [];
      for (const id of ids) {
        outputs[id] = engineering.getValue(id);
        const node = engineering.graph.getNode(id);
        if (node) { units[id] = node.unit; assumptions.push(node.honestyNote); }
      }
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano rzeczywisty model pompa–rurociąg.',
        outputs, units, warnings: [], validity: 'Swamee–Jain obowiązuje w zadanym zakresie przepływu; wynik nie jest CFD.',
        assumptions, visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'epidemic-city': {
      const seed = request.seed ?? numberParam(params, 'seed', DEFAULT_CITY_PARAMS.seed);
      const horizonDays = numberParam(params, 'horizonDays', 90);
      const sim = new EpidemicCitySimulation({
        r0: numberParam(params, 'r0', DEFAULT_CITY_PARAMS.r0),
        nAgents: numberParam(params, 'nAgents', DEFAULT_CITY_PARAMS.nAgents),
        seed,
      });
      const registry = new EventRegistry({ modelId: 'biology.city', experimentId: 'epidemic-city', seed });
      const steps = Math.round(horizonDays * 4);
      for (let step = 0; step < steps; step++) {
        sim.tick(0.25);
        ingestTransmissions(registry, sim.lastTransmissions(), {
          simTime: step * 0.25,
          modelId: 'biology.city', experimentId: 'epidemic-city', seed, params: sim.getParams(),
        });
      }
      const stream = new EventStream(registry);
      const events = stream.all();
      onLiveWorld?.(sim);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Wykonano ${horizonDays}-dniowy, deterministyczny przebieg EpidemicCitySimulation.`,
        outputs: sim.stats(), units: { dzien: 'dni', agenci: 'osób', S: 'osób', E: 'osób', I: 'osób', R: 'osób', D: 'osób' },
        warnings: ['Model przedstawia abstrakcyjny Pathogen X i jest edukacyjny, nie prognostyczny.'],
        validity: 'Agentowy model SEIRD z kontaktami przestrzennymi i stałymi parametrami runu.',
        assumptions: ['Jeden realny model EpidemicCitySimulation.', 'GenesisEvent powstaje wyłącznie z lastTransmissions().'],
        visualization: ['world-3d', 'graph'], route: model.route,
        eventSummary: { count: events.length, types: [...new Set(events.map((event) => event.type))] },
      };
    }
  }
  throw new Error(`Nieobsługiwany adapter ${model.id}.`);
}

function numberParam(params: Record<string, ExperimentValue>, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === 'number' ? value : fallback;
}

/** Full deterministic request → result/provenance execution path for local real models. */
export function runExperiment(request: StructuredExperimentRequest): ExperimentRun {
  const validation = validateStructuredExperimentRequest(request);
  const intent = createExperimentIntent(request);
  const plan = createExperimentPlan(intent);
  let result: ExperimentResult;
  let liveWorld: EpidemicCitySimulation | undefined;
  if (!validation.ok) result = rejectedResult(validation.errors);
  else {
    const status = statusForCapability(intent.capability);
    if (status === 'knowledge_only') result = unavailableResult(status, `Corpus Genesis opisuje domenę „${request.domainId}”, ale nie ma dla niej wykonawczego solvera.`, routeForUnavailable());
    else if (status === 'capability_seam') result = unavailableResult(status, `${intent.rationale} Wymagany solver: ${intent.requiredSolver}.`, routeForUnavailable());
    else if (status === 'engine_not_available') result = unavailableResult(status, `${intent.rationale} Wymagany solver: ${intent.requiredSolver}.`, routeForUnavailable());
    else {
      try { result = executeRealModel(request, (simulation) => { liveWorld = simulation; }); }
      catch (error) {
        result = {
          contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'failed', summary: 'Realny silnik zwrócił błąd wykonania.',
          outputs: {}, units: {}, warnings: [], assumptions: [], visualization: [], route: routeForUnavailable(),
          validity: String(error instanceof Error ? error.message : error),
        };
      }
    }
  }
  const provenance = createExperimentProvenance({
    request, plan, result, knowledgeSources: intent.knowledgeSources,
    supplementalKnowledgeIds: intent.supplementalKnowledgeIds,
    deterministic: result.status === 'completed',
  });
  const run: ExperimentRun = {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    runId: provenance.runFingerprint,
    request,
    intent,
    plan,
    result,
    provenance,
  };
  if (liveWorld && result.status === 'completed') registerLiveExperimentWorld(run.runId, liveWorld);
  return run;
}
