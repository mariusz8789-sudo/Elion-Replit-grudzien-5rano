import {
  getKnowledgeDomain,
  knowledgeSourcesForDomain,
  type KnowledgeCapability,
  type KnowledgeCorpusFile,
} from '../knowledge/registry';
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
  const domain = getKnowledgeDomain(request.domainId);
  let capability: KnowledgeCapability = 'ENGINE_NOT_AVAILABLE';
  let rationale = 'Nie znaleziono zarejestrowanego modelu ani bezpiecznego adaptera dla tej prośby.';
  let requiredSolver = 'Zarejestrowany solver dla wskazanej domeny';
  if (model) {
    capability = 'REAL_ENGINE';
    rationale = model.rationale;
    requiredSolver = model.engine;
  } else if (domain) {
    capability = domain.capability;
    rationale = domain.assumptions[0] ?? 'Domena jest zarejestrowana w corpus Genesis.';
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
