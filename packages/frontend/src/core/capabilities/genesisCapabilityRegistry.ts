/**
 * Canonical product capability registry.
 *
 * This is deliberately metadata and routing only. Runners, worlds, Evidence,
 * Replay and Memory stay in their existing modules. A capability may only be
 * AVAILABLE when the named public execution path exists today.
 */
export type GenesisCapabilityReadiness =
  | 'AVAILABLE'
  | 'PARTIAL'
  | 'PROTOTYPE'
  | 'BLOCKED_BY_RUNTIME'
  | 'BLOCKED_DATA'
  | 'NOT_IMPLEMENTED';

export type GenesisEpistemicLabel =
  | 'LIVE_COMPUTATIONAL_EXPERIMENT'
  | 'EXTERNAL_REAL_OBSERVATION'
  | 'EDUCATIONAL_MODEL'
  | 'TOY_MODEL'
  | 'MODEL'
  | 'SCENARIO'
  | 'THEORETICAL_MODEL'
  | 'PROTOTYPE';

export type GenesisCapabilitySelectionMode = 'FABRIC' | 'DIRECT_ROUTE' | 'CUSTOM_FLOW' | 'UNAVAILABLE';

export interface GenesisCapability {
  id: string;
  label: string;
  description: string;
  userIntents: readonly string[];
  domain: string;
  selectionMode: GenesisCapabilitySelectionMode;
  execution: { kind: 'fabric-model' | 'route' | 'worker' | 'world-director'; id: string };
  readiness: GenesisCapabilityReadiness;
  epistemicLabel: GenesisEpistemicLabel;
  visualizationRoute: string | null;
  evidenceSupport: 'CANONICAL' | 'LOCAL' | 'PARTIAL' | 'NONE';
  replaySupport: 'CANONICAL' | 'LOCAL' | 'PARTIAL' | 'NONE';
  nextExperimentSupport: boolean;
  limitations: readonly string[];
  blockedReason?: string;
  runtimeStatusSource?: string;
  showInShowcase?: boolean;
}

const capabilities: readonly GenesisCapability[] = [
  {
    id: 'main-laboratory', label: 'Main 3D Laboratory', description: 'Canonical laboratory world with stations, central digital twin and session evidence.',
    userIntents: ['otwórz główne laboratorium', 'pokaż laboratorium genesis', 'main laboratory', 'genesis laboratory'], domain: 'product', selectionMode: 'DIRECT_ROUTE',
    execution: { kind: 'route', id: '#/scientific-worlds' }, readiness: 'AVAILABLE', epistemicLabel: 'MODEL', visualizationRoute: '#/scientific-worlds',
    evidenceSupport: 'CANONICAL', replaySupport: 'CANONICAL', nextExperimentSupport: true, limitations: ['Wet-lab execution requires connected physical hardware.'], showInShowcase: true,
  },
  {
    id: 'drug-discovery', label: 'Drug Discovery', description: 'Source-backed candidate comparison with RDKit when its public worker reports AVAILABLE.',
    userIntents: ['znajdź naturalnych kandydatów', 'wyszukaj naturalne zamienniki', 'natural replacement', 'natural candidate comparison', 'drug discovery'], domain: 'drug-discovery', selectionMode: 'CUSTOM_FLOW',
    execution: { kind: 'worker', id: 'rdkit' }, readiness: 'PARTIAL', epistemicLabel: 'LIVE_COMPUTATIONAL_EXPERIMENT', visualizationRoute: '#/drug',
    evidenceSupport: 'CANONICAL', replaySupport: 'CANONICAL', nextExperimentSupport: true,
    limitations: ['Candidate coverage depends on compatible source records.', 'Heavy compute workers may be blocked independently of RDKit.'], runtimeStatusSource: '/api/health/compute', showInShowcase: true,
  },
  {
    id: 'chemistry-titration', label: 'Chemistry', description: 'Existing deterministic acid-base titration through Experiment Fabric and the Chemistry station.',
    userIntents: ['uruchom miareczkowanie', 'pokaż miareczkowanie', 'titration experiment', 'chemistry experiment'], domain: 'chemistry', selectionMode: 'FABRIC',
    execution: { kind: 'fabric-model', id: 'chemistry-titration' }, readiness: 'AVAILABLE', epistemicLabel: 'LIVE_COMPUTATIONAL_EXPERIMENT', visualizationRoute: '#/scientific-worlds?station=st-titration',
    evidenceSupport: 'CANONICAL', replaySupport: 'CANONICAL', nextExperimentSupport: true, limitations: ['Educational computational chemistry; not a physical measurement.'], showInShowcase: true,
  },
  {
    id: 'physics-black-hole', label: 'Black hole physics', description: 'Existing Schwarzschild/Kerr model and 3D visualization with explicit scope labels.',
    userIntents: ['pokaż czarną dziurę', 'wirująca czarna dziura', 'black hole simulation', 'black hole'], domain: 'physics', selectionMode: 'FABRIC',
    execution: { kind: 'fabric-model', id: 'einstein-schwarzschild' }, readiness: 'AVAILABLE', epistemicLabel: 'MODEL', visualizationRoute: '#/lab/einstein',
    evidenceSupport: 'CANONICAL', replaySupport: 'CANONICAL', nextExperimentSupport: true, limitations: ['Model scope varies by experiment; UI labels approximations.'], showInShowcase: true,
  },
  {
    id: 'physics-three-body', label: 'Three-body dynamics', description: 'Existing deterministic restricted three-body integrator through Experiment Fabric.',
    userIntents: ['pokaż problem trzech ciał', 'zbadaj problem trzech ciał', 'three body problem', 'three-body simulation'], domain: 'physics', selectionMode: 'FABRIC',
    execution: { kind: 'fabric-model', id: 'universe-three-body' }, readiness: 'AVAILABLE', epistemicLabel: 'LIVE_COMPUTATIONAL_EXPERIMENT', visualizationRoute: '#/lab/universe',
    evidenceSupport: 'CANONICAL', replaySupport: 'CANONICAL', nextExperimentSupport: true, limitations: ['Restricted model; not a general high-body-count astrophysics solver.'], showInShowcase: true,
  },
  {
    id: 'cern-cms-open-data', label: 'CMS Open Data', description: 'Published CMS event data in the existing analysis route.',
    userIntents: ['pokaż prawdziwe dane cms', 'uruchom cms open data', 'cms open data', 'real cms data'], domain: 'cern', selectionMode: 'DIRECT_ROUTE',
    execution: { kind: 'route', id: '#/physics/cms-z' }, readiness: 'AVAILABLE', epistemicLabel: 'EXTERNAL_REAL_OBSERVATION', visualizationRoute: '#/physics/cms-z',
    evidenceSupport: 'CANONICAL', replaySupport: 'CANONICAL', nextExperimentSupport: true, limitations: ['Opublikowany zewnętrzny zbiór historycznych danych offline; to nie jest transmisja na żywo z detektora LHC.'], showInShowcase: true,
  },
  {
    id: 'cern-toy-collision', label: 'CERN collision model', description: 'Immediate toy collision in the existing CERN complex.',
    userIntents: ['uruchom zabawkowe zderzenie cern', 'uruchom toy collision', 'toy cern collision', 'zderzenie protonów cern'], domain: 'cern', selectionMode: 'DIRECT_ROUTE',
    execution: { kind: 'route', id: '#/cern-complex?action=collision' }, readiness: 'AVAILABLE', epistemicLabel: 'TOY_MODEL', visualizationRoute: '#/cern-complex?action=collision',
    evidenceSupport: 'LOCAL', replaySupport: 'LOCAL', nextExperimentSupport: true, limitations: ['Toy event, not CMS Open Data and not PYTHIA/Geant4.'],
  },
  {
    id: 'cern-complex', label: 'CERN', description: 'Existing detector, accelerator and collider visualization.',
    userIntents: ['otwórz cern', 'pokaż cern', 'cern complex'], domain: 'cern', selectionMode: 'DIRECT_ROUTE',
    execution: { kind: 'route', id: '#/cern-complex' }, readiness: 'PARTIAL', epistemicLabel: 'MODEL', visualizationRoute: '#/cern-complex',
    evidenceSupport: 'PARTIAL', replaySupport: 'PARTIAL', nextExperimentSupport: true, limitations: ['Full PYTHIA/Geant4 chain is not implemented.'], showInShowcase: true,
  },
  {
    id: 'world-director', label: 'World Director', description: 'Canonical prompt-to-world flow over the existing WorldGraph and renderer.',
    userIntents: ['otwórz world director', 'open world director', 'generator świata genesis'], domain: 'world-generation', selectionMode: 'DIRECT_ROUTE',
    execution: { kind: 'world-director', id: '#/world-director' }, readiness: 'AVAILABLE', epistemicLabel: 'SCENARIO', visualizationRoute: '#/world-director',
    evidenceSupport: 'CANONICAL', replaySupport: 'CANONICAL', nextExperimentSupport: true, limitations: ['Generated worlds are reconstructions/scenarios unless backed by identified observations.'], showInShowcase: true,
  },
  {
    id: 'sw4', label: 'SW-4 Digital Twin', description: 'Existing deterministic epidemic city scenario in World Director.',
    userIntents: ['pokaż sw-4', 'otwórz sw4', 'epidemia sw 4', 'sw-4 epidemic city'], domain: 'cities', selectionMode: 'DIRECT_ROUTE',
    execution: { kind: 'world-director', id: '#/world-director?prompt=SW-4%20epidemic%20city' }, readiness: 'AVAILABLE', epistemicLabel: 'SCENARIO', visualizationRoute: '#/world-director?prompt=SW-4%20epidemic%20city',
    evidenceSupport: 'CANONICAL', replaySupport: 'CANONICAL', nextExperimentSupport: true, limitations: ['Scenario simulation, not an epidemic forecast.'], showInShowcase: true,
  },
  {
    id: 'reality-navigator', label: 'Reality Navigator', description: 'Existing branch and counterfactual scenario navigator.',
    userIntents: ['otwórz reality navigator', 'nawigator rzeczywistości', 'reality navigator'], domain: 'advanced-worlds', selectionMode: 'DIRECT_ROUTE',
    execution: { kind: 'route', id: '#/reality' }, readiness: 'AVAILABLE', epistemicLabel: 'SCENARIO', visualizationRoute: '#/reality',
    evidenceSupport: 'PARTIAL', replaySupport: 'CANONICAL', nextExperimentSupport: true, limitations: ['Scenario comparison is not evidence of parallel physical realities.'], showInShowcase: true,
  },
  {
    id: 'multiverse', label: 'Multiverse Nexus', description: 'Existing mathematical/scenario comparison world.',
    userIntents: ['otwórz multiverse', 'pokaż multiwersum', 'multiverse nexus', 'wieloświat'], domain: 'advanced-worlds', selectionMode: 'DIRECT_ROUTE',
    execution: { kind: 'route', id: '#/lab/multiverse' }, readiness: 'AVAILABLE', epistemicLabel: 'THEORETICAL_MODEL', visualizationRoute: '#/lab/multiverse',
    evidenceSupport: 'PARTIAL', replaySupport: 'CANONICAL', nextExperimentSupport: true, limitations: ['No claim that a physical multiverse has been observed.'], showInShowcase: true,
  },
  {
    id: 'spacetime', label: 'Spacetime', description: 'Existing spacetime model graph and visualization.',
    userIntents: ['otwórz laboratorium czasoprzestrzeni', 'pokaż czasoprzestrzeń', 'spacetime lab'], domain: 'advanced-worlds', selectionMode: 'DIRECT_ROUTE',
    execution: { kind: 'route', id: '#/lab/spacetime' }, readiness: 'AVAILABLE', epistemicLabel: 'MODEL', visualizationRoute: '#/lab/spacetime',
    evidenceSupport: 'CANONICAL', replaySupport: 'CANONICAL', nextExperimentSupport: true, limitations: ['Individual experiments state their own approximation boundary.'],
  },
  {
    id: 'manifold-5d', label: '5D Manifold', description: 'Existing backend manifold evaluation shown in the Matrix Stage.',
    userIntents: ['pokaż silnik 5d', 'otwórz 5d', '5d manifold', 'matrix stage'], domain: 'advanced-worlds', selectionMode: 'FABRIC',
    execution: { kind: 'fabric-model', id: 'math-manifold-5d' }, readiness: 'AVAILABLE', epistemicLabel: 'MODEL', visualizationRoute: null,
    evidenceSupport: 'CANONICAL', replaySupport: 'CANONICAL', nextExperimentSupport: true, limitations: ['GEOMETRIC_MODEL in R⁵; no claim of a physical fifth dimension.'], runtimeStatusSource: '/api/manifold/evaluate',
  },
  {
    id: 'biology-lung-impact', label: 'Educational lung impact', description: 'Qualitative healthy-versus-exposure lung presentation inside the existing Human Laboratory.',
    userIntents: ['pokaż wpływ palenia papierosów na płuca', 'pokaż wpływ e-papierosów na płuca', 'pokaż wpływ marihuany na płuca', 'porównaj zdrowe płuca i płuca po paleniu', 'show smoking effects on lungs'], domain: 'human-biology', selectionMode: 'FABRIC',
    execution: { kind: 'fabric-model', id: 'biology-lung-exposure' }, readiness: 'AVAILABLE', epistemicLabel: 'EDUCATIONAL_MODEL', visualizationRoute: '#/human-biology-lab?simulation=lung-exposure',
    evidenceSupport: 'CANONICAL', replaySupport: 'CANONICAL', nextExperimentSupport: true, limitations: ['MODEL / EDUCATIONAL SIMULATION / NOT CLINICAL DIAGNOSIS.', 'Timeline controls presentation intensity and is not an individual prognosis.'], showInShowcase: true,
  },
  {
    id: 'school-health-prevention-lab', label: 'School Health / Prevention Lab', description: 'Age-appropriate prevention education for smoking, vaping, alcohol, cannabis and generic harmful-drug risks inside the existing Human Laboratory.',
    userIntents: ['pokaż co palenie robi z płucami', 'pokaż wpływ e-papierosów', 'pokaż wpływ alkoholu na mózg', 'pokaż wpływ marihuany na organizm', 'pokaż wpływ narkotyków na organizm'], domain: 'human-biology', selectionMode: 'FABRIC',
    execution: { kind: 'fabric-model', id: 'biology-prevention-education' }, readiness: 'AVAILABLE', epistemicLabel: 'EDUCATIONAL_MODEL', visualizationRoute: '#/human-biology-lab?simulation=prevention-lab',
    evidenceSupport: 'CANONICAL', replaySupport: 'CANONICAL', nextExperimentSupport: true,
    limitations: ['EDUCATIONAL MODEL / SIMULATION / NOT MEDICAL DIAGNOSIS.', 'No dose advice, toxicology calculation, patient prediction or instructions for harmful use.', 'Generic harmful-drug requests return EDUCATIONAL_OVERVIEW_ONLY.'], showInShowcase: true,
  },
  {
    id: 'virtual-animals', label: 'Virtual animals', description: 'Planned comparative anatomy simulations for dog, cat, horse, cow, bird and fish.',
    userIntents: ['pokaż wirtualnego psa', 'pokaż anatomię kota', 'wirtualny koń', 'wirtualna krowa', 'wirtualny ptak', 'wirtualna ryba', 'porównaj człowieka ze zwierzęciem'], domain: 'comparative-biology', selectionMode: 'UNAVAILABLE',
    execution: { kind: 'route', id: 'NOT_IMPLEMENTED' }, readiness: 'NOT_IMPLEMENTED', epistemicLabel: 'MODEL', visualizationRoute: null,
    evidenceSupport: 'NONE', replaySupport: 'NONE', nextExperimentSupport: false, limitations: ['No animal anatomy or disease state is fabricated.'], blockedReason: 'No governed comparative-anatomy assets or registered animal simulation model are present in the repository.',
  },
  {
    id: 'wormhole', label: 'Wormhole', description: 'Existing World Director spacetime scene, clearly labelled theoretical.',
    userIntents: ['pokaż wormhole', 'pokaż tunel czasoprzestrzenny', 'most einsteina rosena', 'einstein rosen bridge'], domain: 'theoretical-physics', selectionMode: 'DIRECT_ROUTE',
    execution: { kind: 'world-director', id: '#/world-director?prompt=wormhole' }, readiness: 'PARTIAL', epistemicLabel: 'THEORETICAL_MODEL', visualizationRoute: '#/world-director?prompt=wormhole',
    evidenceSupport: 'PARTIAL', replaySupport: 'CANONICAL', nextExperimentSupport: true, limitations: ['Visualization of a theoretical metric; no physical wormhole or travel claim.'], showInShowcase: true,
  },
  {
    id: 'time-machine', label: 'Time Machine models', description: 'Existing theoretical spacetime sandbox.',
    userIntents: ['pokaż maszynę czasu', 'wehikuł czasu', 'podróż w czasie', 'time machine'], domain: 'theoretical-physics', selectionMode: 'DIRECT_ROUTE',
    execution: { kind: 'route', id: '#/myths-theories' }, readiness: 'PARTIAL', epistemicLabel: 'THEORETICAL_MODEL', visualizationRoute: '#/myths-theories',
    evidenceSupport: 'PARTIAL', replaySupport: 'PARTIAL', nextExperimentSupport: true, limitations: ['No physical time machine; hypotheses and models only.'],
  },
  {
    id: 'genesis-9d', label: 'Genesis 9D package', description: 'Deterministic library modules without one public runtime consumer.',
    userIntents: ['otwórz 9d', 'pokaż silnik 9d', 'genesis 9d'], domain: 'advanced-worlds', selectionMode: 'UNAVAILABLE',
    execution: { kind: 'route', id: 'NOT_IMPLEMENTED' }, readiness: 'PROTOTYPE', epistemicLabel: 'PROTOTYPE', visualizationRoute: null,
    evidenceSupport: 'NONE', replaySupport: 'NONE', nextExperimentSupport: false, limitations: ['Modules must be reviewed and connected individually.'], blockedReason: 'No canonical public runtime consumer; mounting the package as a second product is rejected.',
  },
  ...([
    ['pyscf', 'AVAILABLE', 'CANONICAL'],
    ['openmm', 'AVAILABLE', 'PARTIAL'],
    ['vina', 'AVAILABLE', 'CANONICAL'],
    ['biopython', 'AVAILABLE', 'PARTIAL'],
    ['admet', 'AVAILABLE', 'CANONICAL'],
    ['toxicity', 'AVAILABLE', 'CANONICAL'],
    ['pymeep', 'AVAILABLE', 'CANONICAL'],
  ] as const).map(([worker, readiness, replaySupport]): GenesisCapability => ({
    id: `worker-${worker}`, label: `${worker} worker`, description: readiness === 'AVAILABLE'
      ? 'Existing private Railway worker with a successful canonical real execution proof.'
      : 'Optional scientific worker awaiting a deployed and verified runtime.',
    userIntents: [], domain: 'compute-worker', selectionMode: readiness === 'AVAILABLE' ? 'CUSTOM_FLOW' : 'UNAVAILABLE',
    execution: { kind: 'worker', id: worker }, readiness, epistemicLabel: 'MODEL', visualizationRoute: '#/drug',
    evidenceSupport: readiness === 'AVAILABLE' ? 'CANONICAL' : 'NONE', replaySupport,
    nextExperimentSupport: readiness === 'AVAILABLE',
    limitations: replaySupport === 'PARTIAL'
      ? ['Real execution and canonical Evidence are available; deterministic replay is not supported for this capability.']
      : ['Availability requires both current worker health and a persisted real remote ScienceRun proof.'],
    ...(readiness === 'AVAILABLE' ? {} : { blockedReason: 'No configured, live Railway worker with a successful canonical execution proof.' }),
    runtimeStatusSource: '/api/health',
  })),
];

function normalizeIntent(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function listGenesisCapabilities(): readonly GenesisCapability[] {
  return capabilities;
}

export function getGenesisCapability(id: string): GenesisCapability | undefined {
  return capabilities.find((capability) => capability.id === id);
}

export function matchGenesisCapabilityIntent(message: string): GenesisCapability | undefined {
  const normalized = normalizeIntent(message);
  if (!normalized) return undefined;
  const matches = capabilities.flatMap((capability) => capability.userIntents
    .map((intent) => ({ capability, intent: normalizeIntent(intent) }))
    .filter(({ intent }) => intent.length > 0 && normalized.includes(intent)));
  matches.sort((a, b) => b.intent.length - a.intent.length);
  return matches[0]?.capability;
}
