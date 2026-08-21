import {
  getKnowledgeDomain,
  knowledgeSourcesForDomain,
  type KnowledgeCapability,
  type KnowledgeCorpusFile,
} from '../knowledge/registry';
import { findSupplementalKnowledge } from '../knowledge/supplementalRegistry';
import { fingerprintExperimentPlan } from './provenance';
import {
  EXPERIMENT_FABRIC_VERSION,
  type ExperimentIntent,
  type ExperimentParameterSpec,
  type ExperimentPlan,
  type ExperimentRoute,
  type StructuredExperimentRequest,
} from './types';

export interface RequestValidation {
  ok: boolean;
  errors: readonly string[];
}

export interface RouterModel {
  id: string;
  domainId: string;
  modelVersion: string;
  engine: string;
  parameters: readonly ExperimentParameterSpec[];
  route: ExperimentRoute;
  knowledgeSources: readonly KnowledgeCorpusFile[];
  rationale: string;
  /** Domyślnie realny silnik; scenariusze legend używają jawnej capability zamiast udawać solver. */
  capability?: KnowledgeCapability;
}

const number = (id: string, label: string, unit: string, min: number, max: number, defaultValue: number): ExperimentParameterSpec =>
  ({ id, label, unit, type: 'number', required: false, min, max, default: defaultValue });
const text = (id: string, label: string, defaultValue: string): ExperimentParameterSpec =>
  ({ id, label, unit: '', type: 'string', required: false, default: defaultValue });
const boolean = (id: string, label: string, defaultValue: boolean): ExperimentParameterSpec =>
  ({ id, label, unit: '', type: 'boolean', required: false, default: defaultValue });

const ROUTER_MODELS: readonly RouterModel[] = [
  {
    id: 'einstein-schwarzschild', domainId: 'spacetime-einstein', modelVersion: '1.0.0', engine: 'genesis-physics@1.0.0',
    parameters: [number('massSolar', 'Masa czarnej dziury', 'M☉', 1e-6, 1e12, 1)],
    route: { kind: 'lab', labId: 'einstein' }, knowledgeSources: ['spacetime-einstein.md'],
    rationale: 'Realny wzór Schwarzschilda dla nieobracającej się, nie naładowanej czarnej dziury.',
  },
  {
    id: 'einstein-schwarzschild-geodesic', domainId: 'spacetime-einstein', modelVersion: '1.0.0', engine: 'genesis-schwarzschild-rk4@1.0.0',
    parameters: [number('impact', 'Parametr zderzenia b/bₖ', '', 0.5, 2.2, 1.1)],
    route: { kind: 'lab', labId: 'einstein', experimentId: 'geodesics' }, knowledgeSources: ['spacetime-einstein.md'],
    rationale: 'Istniejąca geodezyjna zerowa Schwarzschilda w płaszczyźnie równikowej, całkowana współdzielonym RK4; nie jest Kerr, 3D ray tracingiem ani modelem dysku.',
  },
  {
    id: 'einstein-point-lens', domainId: 'spacetime-einstein', modelVersion: '1.0.0', engine: 'genesis-point-lens@1.0.0',
    parameters: [number('beta', 'Pozycja źródła β/θE', '', 0, 1.6, 0.8)],
    route: { kind: 'lab', labId: 'einstein', experimentId: 'lensing' }, knowledgeSources: ['spacetime-einstein.md'],
    rationale: 'Istniejąca dokładna soczewka punktowa z dwoma obrazami i mikrosoczewkowaniem; nie jest soczewką rozciągłą, wielopłaszczyznową ani dopasowaniem danych obserwacyjnych.',
  },
  {
    id: 'einstein-kerr-equatorial', domainId: 'spacetime-einstein', modelVersion: '1.0.0', engine: 'genesis-kerr-equatorial@1.0.0',
    parameters: [number('spin', 'Spin a/M', '', 0, 0.97, 0.7)],
    route: { kind: 'lab', labId: 'einstein', experimentId: 'kerr-3d' }, knowledgeSources: ['spacetime-einstein.md'],
    rationale: 'Istniejące analityczne promienie Kerra: horyzont, ergosfera równikowa i prograde/retrograde orbity fotonowe. Nie jest to pełna geodezyjna poza równikiem ani ray tracing 3D.',
  },
  {
    id: 'spacetime-light-cone', domainId: 'spacetime-einstein', modelVersion: '1.0.0', engine: 'genesis-minkowski@1.0.0',
    parameters: [number('v', 'Prędkość', 'c', 0, 0.99, 0.6), number('tripYears', 'Czas Ziemi', 'lata', 2, 60, 20)],
    route: { kind: 'lab', labId: 'spacetime', experimentId: 'lightcone-3d' }, knowledgeSources: ['spacetime-einstein.md'],
    rationale: 'Istniejący stożek Minkowskiego 2+1D oraz dylatacja Lorentza; nie obejmuje przyspieszenia końcowego ani ogólnej OTW.',
  },
  {
    id: 'spacetime-minkowski', domainId: 'spacetime-einstein', modelVersion: '1.0.0', engine: 'genesis-minkowski-1plus1@1.0.0',
    parameters: [number('beta', 'Prędkość obserwatora β', 'c', -0.9, 0.9, 0)],
    route: { kind: 'lab', labId: 'spacetime', experimentId: 'minkowski' }, knowledgeSources: ['spacetime-einstein.md'],
    rationale: 'Istniejący diagram 1+1D z dokładną transformacją Lorentza dla dwóch ustalonych zdarzeń przestrzennopodobnych; nie opisuje przyspieszenia, grawitacji ani danych obserwacyjnych.',
  },
  {
    id: 'spacetime-c-slider', domainId: 'spacetime-einstein', modelVersion: '1.0.0', engine: 'genesis-light-speed-graph@1.0.0',
    parameters: [number('velocityMs', 'Prędkość obiektu v', 'm/s', 0, 4e8, 1.5e8), number('lightSpeedMs', 'Hipotetyczna prędkość światła c', 'm/s', 5e7, 6e8, 299792458), number('distanceKm', 'Dystans', 'km', 1, 1e6, 384400)],
    route: { kind: 'lab', labId: 'spacetime', experimentId: 'c-slider' }, knowledgeSources: ['spacetime-einstein.md'],
    rationale: 'Istniejący graf szczególnej teorii względności dla jawnego eksperymentu myślowego: zmienia założoną wartość c, nie stałą fizyczną świata rzeczywistego. Działa wyłącznie dla v<c.',
  },
  {
    id: 'historical-philadelphia-legend', domainId: 'historical-legends', modelVersion: '1.0.0', engine: 'genesis-hypothetical-visualization@1.0.0',
    parameters: [text('viewMode', 'Tryb interpretacji', 'legend')],
    route: { kind: 'hypothetical-visualization', scenarioId: 'philadelphia-legend', hash: '#/hf-slice?scenario=philadelphia' }, knowledgeSources: ['historical-legends-philadelphia.md'],
    rationale: 'Hipotetyczna wizualizacja legendy o Eksperymencie Filadelfia. Historyczny rekord, legenda, założenia i granice znanej fizyki są ujawniane osobno; nie ma wyniku fizycznego ani danych pomiarowych.',
    capability: 'HYPOTHETICAL_VISUALIZATION',
  },
  {
    id: 'universe-kepler', domainId: 'universe', modelVersion: '1.0.0', engine: 'genesis-model-graph@1.0.0',
    parameters: [number('centralMassSolar', 'Masa centralna', 'M☉', 0.01, 1e9, 1), number('orbitalRadiusAu', 'Promień orbity', 'AU', 0.001, 1e5, 1)],
    route: { kind: 'lab', labId: 'universe' }, knowledgeSources: ['universe.md', 'classical-mechanics.md'],
    rationale: 'Realny graf Keplera dla zagadnienia dwóch ciał i orbity kołowej.',
  },
  {
    id: 'universe-solar-system', domainId: 'universe', modelVersion: '1.0.0', engine: 'genesis-kepler-solar-system@1.0.0',
    parameters: [number('daysElapsed', 'Czas od umownego startu', 'dni ziemskie', 0, 1_000_000, 365.256)],
    route: { kind: 'lab', labId: 'universe', experimentId: 'solar-system' }, knowledgeSources: ['universe.md', 'classical-mechanics.md'],
    rationale: 'Istniejące dane orbitalne ośmiu planet i współdzielone rozwiązanie równania Keplera; fazy startowe są umowne, więc wynik nie jest efemerydą NASA JPL Horizons.',
  },
  {
    id: 'universe-three-body', domainId: 'classical-mechanics', modelVersion: '1.0.0', engine: 'genesis-three-body@1.0.0',
    parameters: [
      text('preset', 'Układ startowy', 'figure8'),
      number('horizonTime', 'Horyzont integracji', 'jedn. bezwymiarowe', 0.01, 50, 10),
      boolean('divergence', 'Drugi start z perturbacją 10⁻⁶', false),
    ],
    route: { kind: 'lab', labId: 'universe', experimentId: 'threebody' }, knowledgeSources: ['classical-mechanics.md', 'universe.md'],
    rationale: 'Realna integracja Newtonowskiego problemu trzech ciał metodą adaptive velocity-Verlet dla udokumentowanych warunków początkowych; nie jest prognozą układu astronomicznego.',
  },
  {
    id: 'universe-double-pendulum', domainId: 'classical-mechanics', modelVersion: '1.0.0', engine: 'genesis-double-pendulum@1.0.0',
    parameters: [
      number('angleDeg', 'Kąt startowy obu wahadeł', '°', 5, 179, 120),
      number('horizonSeconds', 'Horyzont integracji', 's', 0.01, 60, 10),
      boolean('divergence', 'Drugi start z perturbacją 10⁻⁶ rad', false),
    ],
    route: { kind: 'lab', labId: 'universe', experimentId: 'doublependulum' }, knowledgeSources: ['classical-mechanics.md'],
    rationale: 'Realne równania Lagrange’a podwójnego wahadła integrowane istniejącym RK4; energia numerycznie dryfuje i jest raportowana, nie ukrywana.',
  },
  {
    id: 'universe-hubble-tension', domainId: 'universe', modelVersion: '1.0.0', engine: 'genesis-hubble-tension@1.0.0',
    parameters: [
      number('extraSystematic', 'Dodatkowa systematyka Planck', 'km/s/Mpc', 0, 3, 0),
      boolean('showTrgb', 'Uwzględnij TRGB', true),
    ],
    route: { kind: 'lab', labId: 'universe', experimentId: 'hubbletension' }, knowledgeSources: ['universe.md'],
    rationale: 'Deterministyczne porównanie utrwalonych wartości SH0ES, Planck i opcjonalnie TRGB; nie estymuje parametrów kosmologicznych ani nie rozstrzyga przyczyny napięcia.',
  },
  {
    id: 'universe-lorenz-attractor', domainId: 'classical-mechanics', modelVersion: '1.0.0', engine: 'genesis-lorenz@1.0.0',
    parameters: [
      number('rho', 'Liczba Rayleigha ρ', '', 5, 40, 28),
      number('horizonTime', 'Horyzont integracji', 'jedn. czasu Lorenza', 0.01, 60, 10),
      boolean('divergence', 'Drugi start z perturbacją 10⁻⁴', false),
    ],
    route: { kind: 'lab', labId: 'universe', experimentId: 'lorenz' }, knowledgeSources: ['classical-mechanics.md', 'universe.md'],
    rationale: 'Klasyczne równania Lorenza integrowane istniejącym RK4; to uproszczony model konwekcji i chaosu, nie prognoza pogody.',
  },
  {
    id: 'universe-planet-stability', domainId: 'universe', modelVersion: '1.0.0', engine: 'genesis-planet-stability@1.0.0',
    parameters: [
      number('years', 'Czas symulacji', 'lat', 0.01, 50, 10),
      boolean('jupiter', 'Uwzględnij Jowisza', true),
      boolean('saturn', 'Uwzględnij Saturna', true),
    ],
    route: { kind: 'lab', labId: 'universe', experimentId: 'planet-stability' }, knowledgeSources: ['universe.md'],
    rationale: 'Deterministyczny, czteroplanetowy model N-ciał z velocity-Verlet i obliczanymi elementami orbitalnymi; nie jest pełną efemerydą ośmiu planet.',
  },
  {
    id: 'universe-starlife', domainId: 'universe', modelVersion: '1.0.0', engine: 'genesis-stellar-scaling@1.0.0',
    parameters: [number('massSolar', 'Masa gwiazdy', 'M☉', 0.2, 40, 1)],
    route: { kind: 'lab', labId: 'universe', experimentId: 'starlife' }, knowledgeSources: ['universe.md'],
    rationale: 'Istniejący deterministyczny model skalujący życia gwiazdy: L ∝ M³·⁵, t_MS ≈ 10·M⁻²·⁵ oraz jawne, edukacyjne progi losu końcowego; nie jest solverem ewolucji wnętrza gwiazdy.',
  },
  {
    id: 'universe-galaxy-collision', domainId: 'universe', modelVersion: '1.0.0', engine: 'genesis-toomre-toomre@1.0.0',
    parameters: [
      number('ratio', 'Stosunek mas galaktyk', '', 0.25, 2, 1),
      boolean('retro', 'Druga galaktyka przeciwbieżna', false),
      number('horizonMyr', 'Horyzont integracji', 'mln lat (skalowanie widoku)', 0.01, 600, 240),
    ],
    route: { kind: 'lab', labId: 'universe', experimentId: 'collision' }, knowledgeSources: ['universe.md'],
    rationale: 'Istniejący, deterministyczny restricted three-body Toomre–Toomre: dwa jądra grawitują, gwiazdy są cząstkami próbnymi; nie jest pełnym N-body, hydrodynamiką ani rekonstrukcją konkretnej kolizji galaktyk.',
  },
  {
    id: 'universe-rotation-curve', domainId: 'universe', modelVersion: '1.0.0', engine: 'genesis-galaxy-rotation@1.0.0',
    parameters: [
      number('haloVInf', 'Prędkość graniczna halo', 'km/s', 0, 220, 150),
      boolean('altGravity', 'MOND zamiast halo ciemnej materii', false),
    ],
    route: { kind: 'lab', labId: 'universe', experimentId: 'rotationcurve' }, knowledgeSources: ['universe.md'],
    rationale: 'Istniejąca analityczna krzywa rotacji: wykładniczy dysk w przybliżeniu sferycznym z halo pseudo-izotermicznym albo alternatywną relacją MOND; nie jest dopasowaniem danych konkretnej galaktyki ani rozstrzygnięciem CDM kontra MOND.',
  },
  {
    id: 'atom-hydrogen-orbital', domainId: 'atom', modelVersion: '1.0.0', engine: 'genesis-hydrogen-orbitals@1.0.0',
    parameters: [text('orbital', 'Orbital wodoru', '2pz'), number('x', 'x', 'a₀', -34, 34, 0), number('y', 'y', 'a₀', -34, 34, 0), number('z', 'z', 'a₀', -34, 34, 1)],
    route: { kind: 'lab', labId: 'atom', experimentId: 'orbital-3d' }, knowledgeSources: ['atom.md', 'quantum.md'],
    rationale: 'Analityczne kształty orbitali wodoru z istniejących funkcji radialnych i kątowych; wynik jest lokalną gęstością względną, nie pojedynczym pomiarem elektronu.',
  },
  {
    id: 'atom-bohr', domainId: 'atom', modelVersion: '1.0.0', engine: 'genesis-model-graph@1.0.0',
    parameters: [number('atomicNumber', 'Liczba atomowa Z', '', 1, 118, 1), number('principalN', 'Główna liczba kwantowa n', '', 1, 10, 1)],
    route: { kind: 'lab', labId: 'atom' }, knowledgeSources: ['atom.md', 'quantum.md'],
    rationale: 'Realny graf Bohra; ścisły dla atomów wodoropodobnych.',
  },
  {
    id: 'electrodynamics-maxwell-fdtd', domainId: 'electrodynamics', modelVersion: '1.0.0', engine: 'pymeep-fdtd@1.34.0',
    parameters: [
      number('n1', 'Współczynnik załamania ośrodka 1', '', 1, 4, 1),
      number('n2', 'Współczynnik załamania ośrodka 2', '', 1, 4, 2),
      number('frequency', 'Częstotliwość Meep', 'c / jednostka długości', 0.2, 2, 1),
      number('resolution', 'Rozdzielczość FDTD', 'piksele / jednostka długości', 40, 160, 80),
    ],
    route: { kind: 'none' }, knowledgeSources: ['electrodynamics.md'],
    rationale: 'Rzeczywisty backendowy adapter PyMeep wykonuje ograniczony przypadek Maxwell/FDTD: normalne padanie w 1D na płaską, bezstratną granicę dielektryczną. Browser nie oblicza zastępczego wyniku; po potwierdzeniu istniejący endpoint /api/compute/fabric/run sprawdza GENESIS_MEEP_PYTHON oraz referencyjną walidację FDTD przed wykonaniem.',
    capability: 'BACKEND_REAL_ENGINE',
  },
  {
    id: 'electrodynamics-maxwell-fdtd-pec-reflection', domainId: 'electrodynamics', modelVersion: '1.0.0', engine: 'pymeep-fdtd@1.34.0',
    parameters: [
      number('frequency', 'Częstotliwość Meep', 'c / jednostka długości', 0.2, 2, 1),
      number('resolution', 'Rozdzielczość FDTD', 'piksele / jednostka długości', 40, 160, 80),
    ],
    route: { kind: 'none' }, knowledgeSources: ['electrodynamics.md'],
    rationale: 'Rzeczywisty, ograniczony backendowy benchmark PyMeep: impuls Ex pada normalnie na półprzestrzeń idealnego przewodnika PEC w 1D, z PML i odejmowaniem pola padającego. Wynik raportuje reflektancję oraz próbki |Ex| i |Hy|, lecz nie opisuje przewodności rzeczywistego metalu, obiektu 3D, ekranu statku, niewidzialności ani teleportacji.',
    capability: 'BACKEND_REAL_ENGINE',
  },
  {
    id: 'biology-hiv-10e8-pdb-structural-comparison', domainId: 'biology-vaccine-discovery', modelVersion: '1.1.0', engine: 'biopython-pdb-rmsd@1.88',
    parameters: [text('referencePdb', 'Struktura referencyjna PDB', '5GHW'), text('mobilePdb', 'Struktura porównywana PDB', '4G6F')],
    route: { kind: 'none' }, knowledgeSources: ['biology-vaccine-discovery.md', 'biology.md', 'chemistry.md'],
    rationale: 'Rzeczywisty backendowy Biopython oblicza Cα RMSD manifestowanych publicznych par HIV MPER / 10E8: 5GHW→4G6F albo 5GHW→5WDF. 5WDF jest eksperymentalnie zdeponowanym kompleksem wariantu 10E8v4-5R+100cF z peptydem gp41, a nie mutacją zaprojektowaną przez Genesis. Wynik jest COMPUTATIONAL_RESULT z SHA-256 obu artefaktów PDB. RMSD opisuje geometrię zdeponowanych struktur, a nie K_D, docking, neutralizację, immunogenność ani skuteczność szczepionki. Przeglądarka nie liczy wyniku; endpoint wymaga GENESIS_BIOPYTHON_PYTHON oraz GENESIS_PDB_STRUCTURES_DIR.',
    capability: 'BACKEND_REAL_ENGINE',
  },
  {
    id: 'biology-openmm-md-1vii-reference', domainId: 'biology-vaccine-discovery', modelVersion: '1.0.0', engine: 'openmm-cpu@8.6',
    parameters: [number('steps', 'Kroki MD', 'kroki', 100, 1000, 100)], route: { kind: 'none' }, knowledgeSources: ['biology-vaccine-discovery.md', 'biology.md'],
    rationale: 'Rzeczywisty, ograniczony backendowy OpenMM CPU wykonuje AMBER14 + implicit OBC2 dla publicznego białka 1VII: minimizacja i 100–1000 kroków Langevin Middle. Jeden wątek CPU i seed są częścią kontraktu odtwarzalności. Wynik jest COMPUTATIONAL_RESULT dla kontroli runtime’u, nie symulacją HIV/10E8, nanodysku, błony, kompleksu białko–ligand, dockingiem, powinowactwem ani predykcją szczepionki.',
    capability: 'BACKEND_REAL_ENGINE',
  },
  {
    id: 'biology-depmap-crispr-senescence-panel', domainId: 'biology-aging-lab', modelVersion: '1.0.0', engine: 'depmap-24q2-crispr@1.0.0',
    parameters: [], route: { kind: 'none' }, knowledgeSources: ['biology-aging-senescence-cancer.md'],
    rationale: 'Rzeczywisty, read-only backendowy audyt DepMap 24Q2 CRISPR Gene Effect dla z góry określonego panelu p53/p21 i p16/RB. Uruchamia się wyłącznie po checksumowej walidacji czterech artefaktów danych; nie jest modelem pacjenta, targetem terapeutycznym ani predykcją leku.',
    capability: 'BACKEND_REAL_ENGINE',
  },
  {
    id: 'chem-rdkit-descriptors', domainId: 'chemistry', modelVersion: '1.0.0', engine: 'rdkit@2026.03.5',
    parameters: [text('smiles', 'SMILES cząsteczki', 'CC(=O)Oc1ccccc1C(=O)O')], route: { kind: 'none' }, knowledgeSources: ['chemistry.md'],
    rationale: 'Rzeczywisty backendowy RDKit wylicza deskryptory topologiczne 2D dla jawnego SMILES: masa, logP Crippena, HBD/HBA, pierścienie, TPSA i naruszenia reguły 5 Lipińskiego. Przeglądarka nie wyprowadza tych wartości; endpoint Fabric wymaga skonfigurowanego GENESIS_RDKIT_PYTHON. Nie jest to QSAR, docking, ADMET, aktywność biologiczna ani rekomendacja chemiczna.',
    capability: 'BACKEND_REAL_ENGINE',
  },
  {
    id: 'quantum-chemistry-pyscf-h2-rhf', domainId: 'quantum-chemistry', modelVersion: '1.0.0', engine: 'pyscf@2.13.0',
    parameters: [number('bondLengthAngstrom', 'Długość wiązania H–H', 'Å', 0.5, 3, 0.74)], route: { kind: 'none' }, knowledgeSources: ['quantum.md', 'chemistry.md'],
    rationale: 'Rzeczywisty backendowy PySCF wykonuje ograniczone obliczenie single-point H₂: neutralny singlet, RHF/STO-3G i geometria liniowa o zatwierdzonej długości wiązania. Przeglądarka nie wyprowadza energii ani orbitali; endpoint Fabric wymaga GENESIS_PYSCF_PYTHON oraz zaliczonego benchmarku H₂ RHF/STO-3G. Nie jest to optymalizacja geometrii, skan powierzchni energii, ogólna chemia kwantowa, pomiar ani predykcja zastosowania chemicznego.',
    capability: 'BACKEND_REAL_ENGINE',
  },
  {
    id: 'photon-energy', domainId: 'electrodynamics', modelVersion: '1.1.0', engine: 'genesis-model-graph@1.0.0',
    parameters: [number('wavelengthNm', 'Długość fali', 'nm', 0.001, 1e9, 500)],
    route: { kind: 'none' }, knowledgeSources: ['electrodynamics.md', 'quantum.md', 'chemistry.md'],
    rationale: 'Rzeczywisty backendowy Fabric wykonuje ten sam ModelGraph E=hc/λ co Quantum Lab. Wynik opisuje energię i częstotliwość fotonu, lecz nie jest pełnym solverem pola Maxwella, modelem absorpcji, materiału ani konkretnym oddziaływaniem chemicznym.',
    capability: 'BACKEND_REAL_ENGINE',
  },
  {
    id: 'water-pump-pipe', domainId: 'engineering-water', modelVersion: '1.0.0', engine: 'genesis-engineering-graph@1.0.0',
    parameters: [
      number('volumetricFlow', 'Natężenie przepływu Q', 'm³/s', 1e-6, 10, 0.05),
      number('pipeDiameter', 'Średnica rury D', 'm', 1e-3, 10, 0.1),
      number('pipeLength', 'Długość rury L', 'm', 0.01, 1e7, 100),
      number('pipeRoughnessMm', 'Chropowatość ε', 'mm', 0, 100, 0.045),
      number('staticLift', 'Wysokość podnoszenia', 'm', -1e4, 1e6, 10),
      number('fluidDensity', 'Gęstość cieczy', 'kg/m³', 0.1, 1e5, 998),
      number('fluidViscosity', 'Lepkość dynamiczna', 'Pa·s', 1e-9, 1e4, 1.002e-3),
      number('pumpEfficiency', 'Sprawność pompy', '-', 0.001, 1, 0.7),
    ],
    route: { kind: 'lab', labId: 'engineering', experimentId: 'pump-pipe' }, knowledgeSources: ['classical-mechanics.md', 'thermodynamics.md'],
    rationale: 'Realny model pompa–rurociąg z Darcy–Weisbach i Swamee–Jain; nie jest CFD.',
  },
  {
    id: 'epidemic-city', domainId: 'biology', modelVersion: '1.0.0', engine: 'genesis-epidemic-city@1.0.0',
    parameters: [number('r0', 'Liczba reprodukcji R₀', '', 0, 20, 2.5), number('horizonDays', 'Horyzont symulacji', 'dni', 1, 365, 90), number('nAgents', 'Liczba agentów', 'osób', 10, 10000, 260)],
    route: { kind: 'live-world', target: 'epidemic-city', hash: '#/hf-slice' }, knowledgeSources: ['biology.md'],
    rationale: 'Realny agentowy EpidemicCitySimulation; renderer zachowuje się jako konsument read-only tego samego świata.',
  },
  {
    id: 'biology-dna-helix', domainId: 'biology', modelVersion: '1.0.0', engine: 'genesis-b-dna-wallace@1.0.0',
    parameters: [text('sequence', 'Preset sekwencji', 'mixed'), number('temperatureC', 'Temperatura', '°C', 0, 100, 37)],
    route: { kind: 'lab', labId: 'biology', experimentId: 'dna-helix' }, knowledgeSources: ['biology.md'],
    rationale: 'Istniejąca geometria B-DNA oraz reguła Wallace’a dla krótkich presetów; bez metody najbliższego sąsiada, atomistyki, dynamiki molekularnej i profilu biologicznego.',
  },
  {
    id: 'biology-protein-folding-hp', domainId: 'biology', modelVersion: '1.0.0', engine: 'genesis-hp-metropolis@1.0.0',
    parameters: [text('sequenceKey', 'Preset sekwencji HP', 'classic'), number('temperature', 'Temperatura Metropolisa', '', 0.05, 3, 1), number('steps', 'Kroki Monte Carlo', 'kroki', 1, 50000, 5000), number('seed', 'Seed Monte Carlo', '', 0, 0xffff_ffff, 20260819)],
    route: { kind: 'lab', labId: 'biology', experimentId: 'protein-folding' }, knowledgeSources: ['biology.md'],
    rationale: 'Istniejący seedowany Metropolis modelu HP na siatce 2D: energia to kontakty H–H poza szkieletem. Nie jest predykcją struktury prawdziwego białka, AlphaFold ani dynamiką molekularną.',
  },
  {
    id: 'nuclear-semf', domainId: 'nuclear', modelVersion: '1.0.0', engine: 'genesis-model-graph@1.0.0',
    parameters: [number('protonNumber', 'Liczba protonów Z', '', 1, 118, 26), number('neutronNumber', 'Liczba neutronów N', '', 0, 180, 30)],
    route: { kind: 'lab', labId: 'nuclear' }, knowledgeSources: ['nuclear.md', 'particle.md'],
    rationale: 'Realny graf SEMF; model kroplowy energii wiązania, bez efektów powłokowych.',
  },
  {
    id: 'nuclear-tokamak-lawson', domainId: 'nuclear', modelVersion: '1.1.0', engine: 'genesis-lawson-0d@1.0.0',
    parameters: [number('densityExponent', 'log₁₀ gęstości n', '', 19, 21.5, 20), number('temperatureKeV', 'Temperatura', 'keV', 2, 40, 15), number('confinementSeconds', 'Czas utrzymania energii', 's', 0.1, 8, 1.5)],
    route: { kind: 'none' }, knowledgeSources: ['nuclear.md'],
    rationale: 'Rzeczywisty backendowy Fabric wykonuje ten sam ograniczony 0D iloraz n·T·τ_E wobec progu Lawsona D–T co Nuclear Lab. Nie jest MHD, transportem plazmy, bilansem mocy reaktora, dowodem zapłonu ani predykcją ITER.',
    capability: 'BACKEND_REAL_ENGINE',
  },
  {
    id: 'nuclear-nuclide-chart', domainId: 'nuclear', modelVersion: '1.1.0', engine: 'genesis-semf-nuclide-catalog@1.0.0',
    parameters: [number('protonNumber', 'Liczba protonów Z', '', 1, 100, 26), number('neutronNumber', 'Liczba neutronów N', '', 0, 160, 30)],
    route: { kind: 'none' }, knowledgeSources: ['nuclear.md', 'particle.md'],
    rationale: 'Rzeczywisty backendowy Fabric wykonuje ten sam SEMF i lookup ograniczonego lokalnego katalogu mierzonych nuklidów NNDC/IAEA co Nuclear Lab. Brak wpisu katalogowego nie jest twierdzeniem o nieistnieniu; SEMF nie obejmuje efektów powłokowych, kinetyki rozpadu ani bezpieczeństwa jądrowego.',
    capability: 'BACKEND_REAL_ENGINE',
  },
  {
    id: 'sr-lorentz', domainId: 'spacetime-einstein', modelVersion: '1.0.0', engine: 'genesis-model-graph@1.0.0',
    parameters: [number('velocityFraction', 'Prędkość β = v/c', '', 0, 0.999999, 0.8), number('properTimeSeconds', 'Czas własny', 's', 0, 1e9, 1), number('restLengthMeters', 'Długość spoczynkowa', 'm', 0, 1e12, 1)],
    route: { kind: 'lab', labId: 'einstein' }, knowledgeSources: ['spacetime-einstein.md'],
    rationale: 'Realny graf Lorentza dla ruchu inercjalnego w jednej osi.',
  },
  {
    id: 'einstein-chirp-mass', domainId: 'spacetime-einstein', modelVersion: '1.0.0', engine: 'genesis-physics@1.0.0',
    parameters: [number('m1Solar', 'Masa obiektu 1', 'M☉', 0.1, 1e3, 30), number('m2Solar', 'Masa obiektu 2', 'M☉', 0.1, 1e3, 30)],
    route: { kind: 'lab', labId: 'einstein' }, knowledgeSources: ['spacetime-einstein.md'],
    rationale: 'Realna funkcja masy chirp i częstotliwości ISCO w zakresie inspiralu.',
  },
  {
    id: 'universe-atmospheric-escape', domainId: 'universe', modelVersion: '1.0.0', engine: 'genesis-model-graph@1.0.0',
    parameters: [number('stellarLuminositySolar', 'Jasność gwiazdy', 'L☉', 0.01, 100, 1), number('orbitalDistanceAu', 'Odległość orbitalna', 'AU', 0.05, 30, 1), number('planetAlbedo', 'Albedo', '', 0, 0.9, 0.3), number('planetMassEarth', 'Masa planety', 'M⊕', 0.01, 300, 1), number('planetRadiusEarth', 'Promień planety', 'R⊕', 0.1, 12, 1), number('moleculeMassAmu', 'Masa cząsteczki', 'u', 1, 50, 18)],
    route: { kind: 'lab', labId: 'universe' }, knowledgeSources: ['universe.md', 'thermodynamics.md', 'chemistry.md'],
    rationale: 'Realny graf ucieczki termicznej Jeansa; nie jest pełnym modelem klimatu.',
  },
  {
    id: 'particle-relativistic-energy', domainId: 'particle', modelVersion: '1.0.0', engine: 'genesis-model-graph@1.0.0',
    parameters: [number('restMassMeV', 'Masa spoczynkowa', 'MeV/c²', 0, 1e6, 0.511), number('velocityFraction', 'Prędkość β = v/c', '', 0, 0.999999, 0.866)],
    route: { kind: 'lab', labId: 'particle' }, knowledgeSources: ['particle.md', 'spacetime-einstein.md'],
    rationale: 'Realny graf energii relatywistycznej cząstki swobodnej.',
  },
  {
    id: 'chemistry-arrhenius', domainId: 'chemistry', modelVersion: '1.0.0', engine: 'genesis-model-graph@1.0.0',
    parameters: [number('temperatureK', 'Temperatura', 'K', 200, 1000, 350), number('activationEnergyKJ', 'Energia aktywacji', 'kJ/mol', 0, 300, 60), number('preExponentialLog10', 'log₁₀ A', 'log₁₀(1/s)', -10, 25, 11)],
    route: { kind: 'lab', labId: 'chemistry' }, knowledgeSources: ['chemistry.md', 'thermodynamics.md'],
    rationale: 'Realny graf kinetyki Arrheniusa; trend, nie pełny mechanizm reakcji.',
  },
  {
    id: 'chemistry-ising', domainId: 'chemistry', modelVersion: '1.0.0', engine: 'genesis-ising-metropolis@1.0.0',
    parameters: [number('temperature', 'Temperatura T', 'J/k_B', 0.5, 5, 2), number('seed', 'Seed Monte Carlo', '', 0, 0xffff_ffff, 20_260_819)],
    route: { kind: 'lab', labId: 'chemistry', experimentId: 'ising' }, knowledgeSources: ['chemistry.md', 'thermodynamics.md'],
    rationale: 'Istniejący 2D model Isinga J=1 na siatce kwadratowej z periodycznymi brzegami i krokami Metropolisa; skończona siatka i skończony horyzont Monte Carlo nie zastępują termodynamicznego limitu.',
  },
  {
    id: 'chemistry-titration', domainId: 'chemistry', modelVersion: '1.0.0', engine: 'genesis-charge-balance@1.0.0',
    parameters: [text('acid', 'Słaby kwas', 'acetic'), number('vb', 'Objętość NaOH', 'mL', 0, 60, 0)],
    route: { kind: 'lab', labId: 'chemistry', experimentId: 'titration' }, knowledgeSources: ['chemistry.md'],
    rationale: 'Istniejący bilans ładunku słabego kwasu i NaOH z autodysocjacją wody; parametry laboratoryjne są ustalonym scenariuszem, nie danymi jednego pomiaru.',
  },
  {
    id: 'chem-vsepr', domainId: 'chemistry', modelVersion: '1.0.0', engine: 'genesis-vsepr-geometry@1.0.0',
    parameters: [text('shapeId', 'Kształt VSEPR', 'ax4')],
    route: { kind: 'lab', labId: 'chemistry', experimentId: 'vsepr' }, knowledgeSources: ['chemistry.md'],
    rationale: 'Istniejące jawne wektory domen elektronowych VSEPR, obejmujące dokładne geometrie idealne oraz istniejące kąty NH₃/H₂O; nie jest to obliczenie struktury elektronowej ani pełna chemia kwantowa.',
  },
  {
    id: 'chem-molecular-weight', domainId: 'chemistry', modelVersion: '1.0.0', engine: 'genesis-cheminformatics@1.0.0',
    parameters: [text('formula', 'Wzór sumaryczny', 'H2O')],
    route: { kind: 'lab', labId: 'chemistry' }, knowledgeSources: ['chemistry.md'],
    rationale: 'Realny parser prostego wzoru i obliczenie masy molowej; nie obsługuje nawiasów ani izotopów.',
  },
  {
    id: 'math-gaussian', domainId: 'mathematics', modelVersion: '1.0.0', engine: 'genesis-model-graph@1.0.0',
    parameters: [number('mean', 'Średnia μ', '', -100, 100, 0), number('sigma', 'Odchylenie σ', '', 0.001, 100, 1), number('xValue', 'Wartość x', '', -100, 100, 1)],
    route: { kind: 'lab', labId: 'mathematics' }, knowledgeSources: ['mathematics.md'],
    rationale: 'Realny graf rozkładu normalnego.',
  },
  {
    id: 'math-tesseract-4d', domainId: 'mathematics', modelVersion: '1.0.0', engine: 'genesis-tesseract-linear-algebra@1.0.0',
    parameters: [number('angleXWDeg', 'Kąt rotacji XW', '°', -360, 360, 0), number('angleYZDeg', 'Kąt rotacji YZ', '°', -360, 360, 0), boolean('doubleRotation', 'Podwójna rotacja XW + YZ', false)],
    route: { kind: 'lab', labId: 'multiverse', experimentId: 'tesseract' }, knowledgeSources: ['mathematics.md', 'multiverse.md'],
    rationale: 'Istniejąca dokładna algebra liniowa: obrót tesseraktu 4D w płaszczyznach XW/YZ i perspektywiczna projekcja 4D→3D. Nie jest modelem fizycznych dodatkowych wymiarów ani teorią multiwersum.',
  },
  {
    id: 'biology-logistic', domainId: 'biology', modelVersion: '1.0.0', engine: 'genesis-model-graph@1.0.0',
    parameters: [number('growthRate', 'Tempo wzrostu r', '1/czas', 0, 5, 0.5), number('carryingCapacity', 'Pojemność K', 'osobn.', 1, 1e9, 1000), number('initialPopulation', 'Populacja początkowa N₀', 'osobn.', 1, 1e9, 10), number('timeElapsed', 'Czas t', 'czas', 0, 1000, 10)],
    route: { kind: 'lab', labId: 'biology' }, knowledgeSources: ['biology.md', 'mathematics.md'],
    rationale: 'Realny graf wzrostu logistycznego populacji.',
  },
  {
    id: 'civilization-drake-equation', domainId: 'civilization', modelVersion: '1.0.0', engine: 'genesis-model-graph-drake@1.0.0',
    parameters: [number('starFormationRate', 'Tempo formowania gwiazd', 'gwiazd/rok', 0.1, 10, 1.5), number('fractionWithPlanets', 'fₚ', '', 0, 1, 0.9), number('earthlikePerSystem', 'nₑ', '', 0, 5, 0.2), number('fractionDevelopingLife', 'fₗ', '', 0, 1, 0.5), number('fractionIntelligent', 'fᵢ', '', 0, 1, 0.1), number('fractionCommunicative', 'f𝚌', '', 0, 1, 0.1), number('lifetimeLog10Years', 'log₁₀ L', 'log₁₀ lat', 2, 9, 4)],
    route: { kind: 'lab', labId: 'civilization' }, knowledgeSources: ['civilization.md'],
    rationale: 'Istniejący ModelGraph równania Drake’a; algebra jest dokładna przy podanych parametrach, ale czynniki astrobiologiczne pozostają interpretacyjne, nie są danymi obserwacyjnymi.',
  },
  {
    id: 'civilization-kardashev', domainId: 'civilization', modelVersion: '1.0.0', engine: 'genesis-physics@1.0.0',
    parameters: [number('kardashevType', 'Typ Kardaszewa K', '', 0, 3, 1)],
    route: { kind: 'lab', labId: 'universe' }, knowledgeSources: ['civilization.md', 'universe.md'],
    rationale: 'Realna funkcja klasyfikacyjnej skali mocy Kardaszewa; nie jest prognozą społeczną.',
  },
  {
    id: 'quantum-kitaev-bulk', domainId: 'quantum', modelVersion: '1.1.0', engine: 'genesis-kitaev-bulk@1.0.0',
    parameters: [
      number('chemicalPotential', 'Potencjał chemiczny μ', 'jedn. energii', -10, 10, 0),
      number('hopping', 'Hopping t', 'jedn. energii', 0.001, 10, 1),
      number('pairing', 'Pairing p-wave Δ', 'jedn. energii', 0.001, 10, 1),
    ],
    route: { kind: 'none' }, knowledgeSources: ['quantum.md'],
    rationale: 'Rzeczywisty backendowy Fabric wywołuje ten sam analityczny minimalizator bulk BdG łańcucha Kitaeva co frontend. Wynik klasyfikuje wyłącznie idealny reżim bulk; nie jest symulacją nanodrutu, materiału, stanów brzegowych, urządzenia Majorana 1 ani hardware.',
    capability: 'BACKEND_REAL_ENGINE',
  },
  {
    id: 'quantum-teleportation', domainId: 'quantum', modelVersion: '1.0.0', engine: 'genesis-three-qubit-state-vector@1.0.0',
    parameters: [text('state', 'Stan wejściowy', 'plus')],
    route: { kind: 'lab', labId: 'quantum', experimentId: 'teleport' }, knowledgeSources: ['quantum.md'],
    rationale: 'Dokładny wspólny pełny wektor stanu trzech kubitów dla protokołu teleportacji. Po potwierdzeniu kanoniczny backend enumeruje wszystkie cztery gałęzie pomiaru; nie jest to hardware, kanał fizyczny, teleportacja materii ani transmisja nadświetlna.',
    capability: 'BACKEND_REAL_ENGINE',
  },
  {
    id: 'quantum-chsh-correlation', domainId: 'quantum', modelVersion: '1.1.0', engine: 'genesis-singlet-correlation@1.0.0',
    parameters: [number('a', 'Kąt Alicji a', 'deg', 0, 180, 0), number('aP', 'Kąt Alicji a′', 'deg', 0, 180, 90), number('b', 'Kąt Boba b', 'deg', 0, 180, 45), number('bP', 'Kąt Boba b′', 'deg', 0, 180, 135)],
    route: { kind: 'none' }, knowledgeSources: ['quantum.md'],
    rationale: 'Rzeczywisty backendowy Fabric uruchamia tę samą analityczną korelację singletu E(a,b)=−cos(a−b) i wartość CHSH co Quantum Lab. Nie są to dane z detektorów, statystyka próby, test bez luk ani transmisja informacji.',
    capability: 'BACKEND_REAL_ENGINE',
  },
  {
    id: 'quantum-tunneling-1d', domainId: 'quantum', modelVersion: '1.0.0', engine: 'genesis-split-step-fft@1.0.0',
    parameters: [number('energy', 'Energia / wysokość bariery', '', 0.2, 1.6, 0.55), number('barrier', 'Wysokość bariery', 'j. nat.', 0.4, 2.5, 1), number('width', 'Szerokość bariery', 'j. nat.', 1, 8, 3)],
    route: { kind: 'lab', labId: 'quantum', experimentId: 'tunneling' }, knowledgeSources: ['quantum.md'],
    rationale: 'Rzeczywisty, wspólny runner 1D split-step Fourier dla pakietu Gaussa i bariery prostokątnej, ħ=m=1. Po potwierdzeniu Science Chat kanoniczny backend wywołuje ten sam wydzielony runner co Canvas; przeglądarka nie generuje zastępczego wyniku. Nie jest to ogólny solver Schrödingera, model 2D/3D, symulacja materiału ani predykcja urządzenia.',
    capability: 'BACKEND_REAL_ENGINE',
  },
  {
    id: 'quantum-bloch-circuit', domainId: 'quantum', modelVersion: '1.1.0', engine: 'genesis-single-qubit@1.0.0',
    parameters: [text('circuit', 'Sekwencja bramek jednokubitowych', 'H X')],
    route: { kind: 'none' }, knowledgeSources: ['quantum.md'],
    rationale: 'Rzeczywisty backendowy Fabric wykonuje te same dokładne macierze unitarne jednokubitowych bramek H, X, Y, Z, S i T co wizualizacja sfery Blocha, startując z |0⟩. Przeglądarka nie wyprowadza zastępczego wyniku. Model nie symuluje splątania, CNOT, szumu sprzętowego ani pojedynczego wyniku pomiaru.',
    capability: 'BACKEND_REAL_ENGINE',
  },
] as const;

const BY_MODEL = new Map(ROUTER_MODELS.map((model) => [model.id, model]));

export function listRouterModels(): readonly RouterModel[] { return ROUTER_MODELS; }
export function getRouterModel(modelId: string): RouterModel | undefined { return BY_MODEL.get(modelId); }

export function validateStructuredExperimentRequest(request: StructuredExperimentRequest): RequestValidation {
  const errors: string[] = [];
  if (request.contractVersion !== EXPERIMENT_FABRIC_VERSION) errors.push(`Nieobsługiwana wersja kontraktu: ${request.contractVersion}.`);
  if (!request.sourceText.trim()) errors.push('Pole sourceText nie może być puste.');
  if (!request.domainId) errors.push('Brak domainId.');
  if (!request.parameters || typeof request.parameters !== 'object' || Array.isArray(request.parameters)) errors.push('parameters musi być płaskim obiektem.');
  if (Object.keys(request.parameters ?? {}).length > 24) errors.push('parameters przekracza limit 24 pól.');
  for (const [key, value] of Object.entries(request.parameters ?? {})) {
    if (!key || key.length > 80) errors.push(`Nieprawidłowa nazwa parametru: ${key}.`);
    if (!['number', 'string', 'boolean'].includes(typeof value)) errors.push(`Parametr ${key} nie jest wartością prostą.`);
    if (typeof value === 'number' && !Number.isFinite(value)) errors.push(`Parametr ${key} musi być liczbą skończoną.`);
  }
  if (request.seed !== undefined && (!Number.isInteger(request.seed) || request.seed < 0)) errors.push('seed musi być nieujemną liczbą całkowitą.');
  const model = request.modelId ? getRouterModel(request.modelId) : undefined;
  if (request.modelId && !model && request.domainId !== 'unknown' && request.domainId !== 'hazard-cascade') {
    errors.push(`Model ${request.modelId} nie jest zarejestrowanym adapterem Experiment Fabric.`);
  }
  if (model) {
    const specs = new Map(model.parameters.map((spec) => [spec.id, spec]));
    for (const [key, value] of Object.entries(request.parameters)) {
      if (key === 'seed' || key === 'horizonDays') continue;
      const spec = specs.get(key);
      if (!spec) { errors.push(`Parametr ${key} nie należy do modelu ${model.id}.`); continue; }
      if (spec.type !== typeof value) { errors.push(`Parametr ${key} ma niewłaściwy typ.`); continue; }
      if (typeof value === 'number' && ((spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max))) {
        errors.push(`Parametr ${key} jest poza zakresem ${spec.min ?? '−∞'}–${spec.max ?? '∞'} ${spec.unit}.`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

function intentSources(request: StructuredExperimentRequest, model?: RouterModel): readonly KnowledgeCorpusFile[] {
  if (model) return model.knowledgeSources;
  if (getKnowledgeDomain(request.domainId)) return knowledgeSourcesForDomain(request.domainId);
  return [];
}

export function createExperimentIntent(request: StructuredExperimentRequest): ExperimentIntent {
  const model = request.modelId ? getRouterModel(request.modelId) : undefined;
  const supplementalKnowledgeIds = findSupplementalKnowledge(request.sourceText).map((entry) => entry.id);
  const domain = getKnowledgeDomain(request.domainId);
  let capability: KnowledgeCapability = 'ENGINE_NOT_AVAILABLE';
  let rationale = 'Nie znaleziono zarejestrowanego modelu ani bezpiecznego adaptera dla tej prośby.';
  let requiredSolver = 'Zarejestrowany solver dla wskazanej domeny';
  if (model) {
    capability = model.capability ?? 'REAL_ENGINE';
    rationale = model.rationale;
    requiredSolver = model.engine;
  } else if (domain) {
    capability = domain.capability === 'REAL_ENGINE' ? 'ENGINE_NOT_AVAILABLE' : domain.capability;
    rationale = domain.capability === 'REAL_ENGINE'
      ? `Domena zawiera działające modele, ale prośba nie wskazuje zarejestrowanego adaptera dla tego zjawiska. ${domain.assumptions[0] ?? ''}`
      : (domain.assumptions[0] ?? 'Domena jest zarejestrowana w corpus Genesis.');
    requiredSolver = domain.requiredSolver;
  } else if (request.domainId === 'hazard-cascade') {
    capability = 'ENGINE_NOT_AVAILABLE';
    rationale = 'Kontrakt GenesisEvent deklaruje hazardy, ale repozytorium nie zawiera modelu powodzi, pożaru ani kaskady infrastruktury.';
    requiredSolver = 'Zweryfikowany model hazardu + WorldAdapter + adapter konsekwencji';
  }
  return {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    request,
    capability,
    confidence: model ? 'high' : domain ? 'medium' : 'low',
    rationale,
    requiredSolver,
    knowledgeSources: intentSources(request, model),
    supplementalKnowledgeIds,
  };
}

export function createExperimentPlan(intent: ExperimentIntent): ExperimentPlan {
  const model = intent.request.modelId ? getRouterModel(intent.request.modelId) : undefined;
  const provisional: Omit<ExperimentPlan, 'planId'> = {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    intent,
    engine: model?.engine ?? null,
    modelVersion: model?.modelVersion ?? null,
    parameterSchema: model?.parameters ?? [],
    runnable: (intent.capability === 'REAL_ENGINE' || intent.capability === 'BACKEND_REAL_ENGINE' || intent.capability === 'HYPOTHETICAL_VISUALIZATION') && Boolean(model),
    route: model?.route ?? { kind: 'none' },
  };
  return { ...provisional, planId: fingerprintExperimentPlan({ ...provisional, planId: '' }) };
}
