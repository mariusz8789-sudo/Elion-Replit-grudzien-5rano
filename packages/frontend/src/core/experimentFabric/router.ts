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
    id: 'universe-kepler', domainId: 'universe', modelVersion: '1.0.0', engine: 'genesis-model-graph@1.0.0',
    parameters: [number('centralMassSolar', 'Masa centralna', 'M☉', 0.01, 1e9, 1), number('orbitalRadiusAu', 'Promień orbity', 'AU', 0.001, 1e5, 1)],
    route: { kind: 'lab', labId: 'universe' }, knowledgeSources: ['universe.md', 'classical-mechanics.md'],
    rationale: 'Realny graf Keplera dla zagadnienia dwóch ciał i orbity kołowej.',
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
    id: 'atom-bohr', domainId: 'atom', modelVersion: '1.0.0', engine: 'genesis-model-graph@1.0.0',
    parameters: [number('atomicNumber', 'Liczba atomowa Z', '', 1, 118, 1), number('principalN', 'Główna liczba kwantowa n', '', 1, 10, 1)],
    route: { kind: 'lab', labId: 'atom' }, knowledgeSources: ['atom.md', 'quantum.md'],
    rationale: 'Realny graf Bohra; ścisły dla atomów wodoropodobnych.',
  },
  {
    id: 'photon-energy', domainId: 'electrodynamics', modelVersion: '1.0.0', engine: 'genesis-model-graph@1.0.0',
    parameters: [number('wavelengthNm', 'Długość fali', 'nm', 0.001, 1e9, 500)],
    route: { kind: 'lab', labId: 'quantum', experimentId: 'photon-graph' }, knowledgeSources: ['electrodynamics.md', 'quantum.md', 'chemistry.md'],
    rationale: 'Realny graf E = hc/λ; nie jest pełnym solverem pola Maxwella.',
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
    id: 'nuclear-semf', domainId: 'nuclear', modelVersion: '1.0.0', engine: 'genesis-model-graph@1.0.0',
    parameters: [number('protonNumber', 'Liczba protonów Z', '', 1, 118, 26), number('neutronNumber', 'Liczba neutronów N', '', 0, 180, 30)],
    route: { kind: 'lab', labId: 'nuclear' }, knowledgeSources: ['nuclear.md', 'particle.md'],
    rationale: 'Realny graf SEMF; model kroplowy energii wiązania, bez efektów powłokowych.',
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
    id: 'biology-logistic', domainId: 'biology', modelVersion: '1.0.0', engine: 'genesis-model-graph@1.0.0',
    parameters: [number('growthRate', 'Tempo wzrostu r', '1/czas', 0, 5, 0.5), number('carryingCapacity', 'Pojemność K', 'osobn.', 1, 1e9, 1000), number('initialPopulation', 'Populacja początkowa N₀', 'osobn.', 1, 1e9, 10), number('timeElapsed', 'Czas t', 'czas', 0, 1000, 10)],
    route: { kind: 'lab', labId: 'biology' }, knowledgeSources: ['biology.md', 'mathematics.md'],
    rationale: 'Realny graf wzrostu logistycznego populacji.',
  },
  {
    id: 'civilization-kardashev', domainId: 'civilization', modelVersion: '1.0.0', engine: 'genesis-physics@1.0.0',
    parameters: [number('kardashevType', 'Typ Kardaszewa K', '', 0, 3, 1)],
    route: { kind: 'lab', labId: 'universe' }, knowledgeSources: ['civilization.md', 'universe.md'],
    rationale: 'Realna funkcja klasyfikacyjnej skali mocy Kardaszewa; nie jest prognozą społeczną.',
  },
  {
    id: 'quantum-kitaev-bulk', domainId: 'quantum', modelVersion: '1.0.0', engine: 'genesis-kitaev-bulk@1.0.0',
    parameters: [
      number('chemicalPotential', 'Potencjał chemiczny μ', 'jedn. energii', -10, 10, 0),
      number('hopping', 'Hopping t', 'jedn. energii', 0.001, 10, 1),
      number('pairing', 'Pairing p-wave Δ', 'jedn. energii', 0.001, 10, 1),
    ],
    route: { kind: 'none' }, knowledgeSources: ['quantum.md'],
    rationale: 'Realny, analitycznie minimalizowany bulk model BdG łańcucha Kitaeva; nie jest symulacją nanodrutu, materiału ani urządzenia Majorana 1.',
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
    capability = 'REAL_ENGINE';
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
    runnable: intent.capability === 'REAL_ENGINE' && Boolean(model),
    route: model?.route ?? { kind: 'none' },
  };
  return { ...provisional, planId: fingerprintExperimentPlan({ ...provisional, planId: '' }) };
}
