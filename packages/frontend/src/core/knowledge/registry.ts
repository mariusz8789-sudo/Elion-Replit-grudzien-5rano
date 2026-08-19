/**
 * GENESIS KNOWLEDGE REGISTRY
 *
 * Machine-readable index of the 20 authoritative `knowledge/*.md` files.
 * It does not duplicate their scientific prose or fabricate a solver. Its job
 * is to make corpus-backed facts available to request validation, planning,
 * routing, provenance and user explanations.
 */

export const KNOWLEDGE_REGISTRY_VERSION = '1.1.0';

export const KNOWLEDGE_CORPUS_FILES = [
  'README.md',
  'ai-discovery.md',
  'atom.md',
  'biology.md',
  'chemistry.md',
  'civilization.md',
  'classical-mechanics.md',
  'discovery-timeline.md',
  'electrodynamics.md',
  'mathematics.md',
  'multiverse.md',
  'nuclear.md',
  'particle.md',
  'quantum-decision-explorer.md',
  'quantum.md',
  'scale-journey.md',
  'scientists.md',
  'spacetime-einstein.md',
  'thermodynamics.md',
  'universe.md',
] as const;

export type KnowledgeCorpusFile = (typeof KNOWLEDGE_CORPUS_FILES)[number];
export type KnowledgeScale = 'meta' | 'micro' | 'micro-meso' | 'meso' | 'macro' | 'cosmic' | 'micro-cosmic';
export type KnowledgeCapability = 'REAL_ENGINE' | 'KNOWLEDGE_ONLY' | 'CAPABILITY_SEAM' | 'ENGINE_NOT_AVAILABLE';
export type KnowledgeVisualization = 'numeric' | 'graph' | 'canvas-2d' | 'scene-3d' | 'world-3d' | 'narrative';

export interface KnowledgeDomainDescriptor {
  /** Stable domain ID used by Experiment Fabric; never infer a result from it. */
  id: string;
  title: string;
  sourceFile: KnowledgeCorpusFile;
  scale: KnowledgeScale;
  capability: KnowledgeCapability;
  /** Existing model IDs / engine targets only. An empty array means no model claim. */
  realModels: readonly string[];
  concepts: readonly string[];
  parameters: readonly string[];
  units: readonly string[];
  assumptions: readonly string[];
  possibleExperiments: readonly string[];
  requiredSolver: string;
  visualization: readonly KnowledgeVisualization[];
  dependencies: readonly string[];
  /** Conservative routing vocabulary; deterministic text matching only. */
  keywords: readonly string[];
}

const DOMAIN_REGISTRY: readonly KnowledgeDomainDescriptor[] = [
  {
    id: 'knowledge-governance', title: 'Corpus i governance wiedzy', sourceFile: 'README.md', scale: 'meta',
    capability: 'CAPABILITY_SEAM', realModels: [],
    concepts: ['źródła', 'epistemika', 'status implementacji', 'aktualizacja wiedzy z kodem'],
    parameters: [], units: [], assumptions: ['Corpus opisuje wiedzę, nie zastępuje walidacji modelu.'],
    possibleExperiments: ['walidacja pokrycia corpus', 'provenance wiedzy'], requiredSolver: 'brak — metadata governance',
    visualization: ['narrative'], dependencies: ['wszystkie domeny'], keywords: ['wiedza', 'źródło', 'provenance', 'corpus'],
  },
  {
    id: 'ai-discovery', title: 'AI Discovery i narrator', sourceFile: 'ai-discovery.md', scale: 'meta',
    capability: 'CAPABILITY_SEAM', realModels: [],
    concepts: ['narrator deterministyczny', 'LLM jako interpreter', 'pytania otwarte', 'hipoteza'],
    parameters: ['stan symulacji', 'parametry', 'statystyki'], units: [],
    assumptions: ['LLM nie liczy ani nie wymyśla wyniku fizycznego.'],
    possibleExperiments: ['wyjaśnij wynik runu', 'zaproponuj następny krok'], requiredSolver: 'istniejący model + narrator',
    visualization: ['narrative'], dependencies: ['knowledge-governance'], keywords: ['ai', 'narrator', 'odkrycie', 'hipoteza', 'wyjaśnij'],
  },
  {
    id: 'atom', title: 'Fizyka atomowa', sourceFile: 'atom.md', scale: 'micro',
    capability: 'REAL_ENGINE', realModels: ['atom-bohr'],
    concepts: ['atom wodoru', 'orbitale', 'poziomy energetyczne', 'widma', 'Rydberg'],
    parameters: ['atomicNumber', 'principalN'], units: ['eV', 'pm'],
    assumptions: ['Model Bohra jest ścisły dla układów wodoropodobnych, nie dla pełnej chemii atomów wieloelektronowych.'],
    possibleExperiments: ['pokaż atom wodoru', 'oblicz poziom energetyczny'], requiredSolver: 'ModelGraph / atom-bohr',
    visualization: ['numeric', 'graph', 'scene-3d'], dependencies: ['quantum'], keywords: ['atom', 'wodór', 'wodor', 'orbital', 'rydberg', 'widmo'],
  },
  {
    id: 'biology', title: 'Biologia i populacje', sourceFile: 'biology.md', scale: 'meso',
    capability: 'REAL_ENGINE', realModels: ['biology-logistic', 'biology.city'],
    concepts: ['populacja logistyczna', 'błona', 'DNA', 'białko', 'epidemia'],
    parameters: ['growthRate', 'carryingCapacity', 'initialPopulation', 'timeElapsed', 'r0', 'seed'], units: ['1/czas', 'osobn.', 'dni'],
    assumptions: ['Modele biologiczne są edukacyjne i nie stanowią diagnozy ani prognozy medycznej.'],
    possibleExperiments: ['zasymuluj epidemię', 'pokaż rozwój epidemii w mieście', 'wzrost populacji'], requiredSolver: 'EpidemicCitySimulation / ModelGraph',
    visualization: ['numeric', 'graph', 'world-3d'], dependencies: ['mathematics', 'thermodynamics'], keywords: ['epidemia', 'seir', 'seird', 'sir', 'zakaż', 'populacja', 'miasto', 'choroba'],
  },
  {
    id: 'chemistry', title: 'Chemia', sourceFile: 'chemistry.md', scale: 'micro-meso',
    capability: 'REAL_ENGINE', realModels: ['chemistry-arrhenius', 'chem-molecular-weight', 'chem-rdkit-descriptors'],
    concepts: ['Arrhenius', 'VSEPR', 'miareczkowanie', 'Ising', 'masa molowa'],
    parameters: ['temperatureK', 'activationEnergyKJ', 'formula', 'smiles'], units: ['K', 'kJ/mol', 'g/mol'],
    assumptions: ['Molecular dynamics, docking i quantum chemistry wymagają zewnętrznych silników.'],
    possibleExperiments: ['oblicz kinetykę reakcji', 'oblicz masę molową', 'analizuj cząsteczkę'], requiredSolver: 'ModelGraph / RDKit capability',
    visualization: ['numeric', 'graph', 'scene-3d'], dependencies: ['atom', 'quantum', 'thermodynamics'], keywords: ['chemia', 'reakcja', 'arrhenius', 'molekuła', 'molekula', 'masa molowa', 'smiles', 'wiązanie'],
  },
  {
    id: 'civilization', title: 'Cywilizacja i skale energetyczne', sourceFile: 'civilization.md', scale: 'cosmic',
    capability: 'REAL_ENGINE', realModels: ['civilization-kardashev'],
    concepts: ['Kardaszew', 'moc', 'SETI', 'Fermi'], parameters: ['kardashevType'], units: ['W'],
    assumptions: ['Skala jest narzędziem klasyfikacyjnym, nie prognozą społeczną.'],
    possibleExperiments: ['oblicz moc cywilizacji'], requiredSolver: 'civilization-kardashev',
    visualization: ['numeric', 'graph', 'narrative'], dependencies: ['universe'], keywords: ['kardaszew', 'cywilizacja', 'seti', 'fermi'],
  },
  {
    id: 'classical-mechanics', title: 'Mechanika klasyczna', sourceFile: 'classical-mechanics.md', scale: 'micro-meso',
    capability: 'REAL_ENGINE', realModels: ['universe-kepler', 'universe-three-body', 'universe-double-pendulum', 'universe-lorenz-attractor'],
    concepts: ['Newton', 'Kepler', 'N-body', 'Lagrange', 'Hamilton', 'chaos'],
    parameters: ['centralMassSolar', 'orbitalRadiusAu', 'preset', 'horizonTime', 'divergence', 'angleDeg', 'horizonSeconds', 'rho'], units: ['M☉', 'AU', 'yr', 's', 'rad'],
    assumptions: ['Model Keplera zakłada dwa ciała i orbitę kołową; trzy ciała, podwójne wahadło i Lorenz są odrębnymi, ograniczonymi modelami deterministycznymi.'],
    possibleExperiments: ['oblicz orbitę planety', 'zbadaj problem trzech ciał', 'zbadaj podwójne wahadło', 'uruchom atraktor Lorenza'], requiredSolver: 'universe-kepler / universe-three-body / universe-double-pendulum / universe-lorenz-attractor',
    visualization: ['numeric', 'graph', 'scene-3d'], dependencies: ['mathematics'], keywords: ['orbita', 'planeta', 'kepler', 'trzy ciała', 'grawitacja newtona', 'mechanika'],
  },
  {
    id: 'discovery-timeline', title: 'Oś odkryć i skala', sourceFile: 'discovery-timeline.md', scale: 'micro-cosmic',
    capability: 'KNOWLEDGE_ONLY', realModels: [],
    concepts: ['epoki kosmiczne', 'Wielki Wybuch', 'skala czasu'], parameters: [], units: ['s', 'lata'],
    assumptions: ['Timeline jest warstwą wiedzy i narracji, nie solverem kosmologicznym.'],
    possibleExperiments: ['przejdź przez historię wszechświata'], requiredSolver: 'brak — corpus/narrative',
    visualization: ['narrative', 'graph'], dependencies: ['universe', 'scale-journey'], keywords: ['oś czasu', 'timeline', 'wielki wybuch', 'epoka'],
  },
  {
    id: 'electrodynamics', title: 'Elektrodynamika i optyka', sourceFile: 'electrodynamics.md', scale: 'micro-meso',
    capability: 'CAPABILITY_SEAM', realModels: ['photon-energy'],
    concepts: ['Maxwell', 'fala elektromagnetyczna', 'Lorentz', 'foton', 'promieniowanie'], parameters: ['wavelengthNm'], units: ['nm', 'THz', 'eV', 'kJ/mol'],
    assumptions: ['Istnieje model energii fotonu; pełny solver równań Maxwella nie jest zaimplementowany.'],
    possibleExperiments: ['oblicz energię fotonu', 'przeanalizuj promieniowanie'], requiredSolver: 'photon graph / Maxwell solver required for wave field',
    visualization: ['numeric', 'graph'], dependencies: ['quantum', 'chemistry'], keywords: ['elektromagnetycz', 'fala', 'promieniowanie', 'foton', 'maxwell', 'optyka'],
  },
  {
    id: 'mathematics', title: 'Matematyka i modele numeryczne', sourceFile: 'mathematics.md', scale: 'meta',
    capability: 'REAL_ENGINE', realModels: ['math-gaussian'],
    concepts: ['algebra', 'rachunek', 'ODE', 'RK4', 'bezpieczny parser'], parameters: ['mean', 'sigma', 'xValue'], units: [],
    assumptions: ['Parser wyrażeń jest sandboxem danych, nie wykonuje kodu użytkownika.'],
    possibleExperiments: ['oblicz rozkład normalny'], requiredSolver: 'math-gaussian / safe expression parser',
    visualization: ['numeric', 'graph'], dependencies: [], keywords: ['matematyka', 'gauss', 'normalny', 'równanie', 'ode'],
  },
  {
    id: 'multiverse', title: 'Modele alternatywnych wszechświatów', sourceFile: 'multiverse.md', scale: 'cosmic',
    capability: 'KNOWLEDGE_ONLY', realModels: [],
    concepts: ['fine tuning', 'stałe fizyczne', 'interpretacje'], parameters: [], units: [],
    assumptions: ['To obszar modeli teoretycznych i hipotez; nie daje prognozy rzeczywistości.'],
    possibleExperiments: ['porównaj założenia alternatywnego modelu'], requiredSolver: 'model specyficzny dla hipotezy',
    visualization: ['narrative', 'graph'], dependencies: ['universe', 'quantum'], keywords: ['multiverse', 'wieloświat', 'fine tuning'],
  },
  {
    id: 'nuclear', title: 'Fizyka jądrowa', sourceFile: 'nuclear.md', scale: 'micro',
    capability: 'REAL_ENGINE', realModels: ['nuclear-semf'],
    concepts: ['SEMF', 'energia wiązania', 'rozpad', 'fuzja', 'reaktor'], parameters: ['protonNumber', 'neutronNumber'], units: ['MeV'],
    assumptions: ['SEMF pomija efekty powłokowe i nie jest pełnym modelem reaktora.'],
    possibleExperiments: ['oblicz energię wiązania jądra'], requiredSolver: 'nuclear-semf',
    visualization: ['numeric', 'graph', 'scene-3d'], dependencies: ['particle', 'quantum'], keywords: ['jądro', 'jadro', 'sefm', 'energia wiązania', 'nuklid', 'fuzja', 'rozpad'],
  },
  {
    id: 'particle', title: 'Fizyka cząstek', sourceFile: 'particle.md', scale: 'micro',
    capability: 'REAL_ENGINE', realModels: ['particle-relativistic-energy'],
    concepts: ['Model Standardowy', 'kwarki', 'leptony', 'bozony', 'kinematyka relatywistyczna'], parameters: ['restMassMeV', 'velocityFraction'], units: ['MeV', 'MeV/c'],
    assumptions: ['Pełna nieperturbacyjna QCD i hadronizacja nie są obliczane.'],
    possibleExperiments: ['oblicz energię relatywistyczną cząstki'], requiredSolver: 'particle-relativistic-energy',
    visualization: ['numeric', 'graph', 'scene-3d'], dependencies: ['spacetime-einstein', 'quantum'], keywords: ['cząstka', 'czastka', 'kwark', 'lepton', 'bozon', 'relatywistyczna energia', 'detektor'],
  },
  {
    id: 'quantum-decision-explorer', title: 'Quantum Decision Explorer', sourceFile: 'quantum-decision-explorer.md', scale: 'meta',
    capability: 'KNOWLEDGE_ONLY', realModels: [],
    concepts: ['notatnik refleksyjny', 'decyzja użytkownika'], parameters: [], units: [],
    assumptions: ['To nie jest model fizyczny ani predyktor przyszłości.'],
    possibleExperiments: ['zapisz refleksję użytkownika'], requiredSolver: 'brak — narzędzie narracyjne',
    visualization: ['narrative'], dependencies: [], keywords: ['decyzja', 'quantum decision'],
  },
  {
    id: 'quantum', title: 'Mechanika kwantowa', sourceFile: 'quantum.md', scale: 'micro',
    capability: 'CAPABILITY_SEAM', realModels: ['quantum-bloch', 'chsh-correlation', 'quantum-kitaev-bulk'],
    concepts: ['superpozycja', 'interferencja', 'splątanie', 'tunelowanie', 'kubit', 'bramki', 'bulk BdG', 'łańcuch Kitaeva'], parameters: ['theta', 'phi', 'chemicalPotential', 'hopping', 'pairing'], units: ['rad', 'jedn. energii'],
    assumptions: ['Jednokubitowe bramki i korelacje istnieją; Q1 oblicza wyłącznie translacyjnie niezmienny bulk model Kitaeva; solver tunelowania Schrödingera nie jest obecnie uniwersalnym engine.'],
    possibleExperiments: ['pokaż stan kubitu', 'zbadaj korelację CHSH', 'oblicz bulk gap łańcucha Kitaeva'], requiredSolver: 'quantumState / Schrödinger solver required for tunneling; Q1 Kitaev bulk dostępny dla zdefiniowanego modelu',
    visualization: ['numeric', 'graph', 'scene-3d'], dependencies: ['mathematics', 'electrodynamics'], keywords: ['kwant', 'kubit', 'bloch', 'splątanie', 'splatanie', 'tunelowanie', 'chsh', 'kitaev', 'majorana'],
  },
  {
    id: 'scale-journey', title: 'Podróż przez skale', sourceFile: 'scale-journey.md', scale: 'micro-cosmic',
    capability: 'KNOWLEDGE_ONLY', realModels: [],
    concepts: ['rząd wielkości', 'kwark do wszechświata', 'skala logarytmiczna'], parameters: [], units: ['m'],
    assumptions: ['To mapa skali, nie mechanizm przyczynowy między domenami.'],
    possibleExperiments: ['pokaż skalę mikro do kosmosu'], requiredSolver: 'brak — corpus/narrative',
    visualization: ['narrative', 'graph'], dependencies: ['discovery-timeline'], keywords: ['skala', 'micro cosmic', 'mikro kosmos'],
  },
  {
    id: 'scientists', title: 'Dossier naukowców', sourceFile: 'scientists.md', scale: 'meta',
    capability: 'KNOWLEDGE_ONLY', realModels: [],
    concepts: ['historia nauki', 'źródła', 'kontekst odkryć'], parameters: [], units: [],
    assumptions: ['Materiał jest kontekstem historycznym, nie silnikiem obliczeń.'],
    possibleExperiments: ['wyjaśnij pochodzenie modelu'], requiredSolver: 'brak — corpus/narrative',
    visualization: ['narrative'], dependencies: ['knowledge-governance'], keywords: ['naukowiec', 'einstein', 'newton', 'maxwell'],
  },
  {
    id: 'spacetime-einstein', title: 'Czasoprzestrzeń i Einstein', sourceFile: 'spacetime-einstein.md', scale: 'cosmic',
    capability: 'REAL_ENGINE', realModels: ['sr-lorentz', 'einstein-schwarzschild', 'einstein-chirp-mass'],
    concepts: ['SR', 'GR', 'Schwarzschild', 'geodezyjna', 'czarna dziura', 'fale grawitacyjne'],
    parameters: ['velocityFraction', 'massSolar', 'm1Solar', 'm2Solar'], units: ['s', 'm', 'km', 'M☉', 'Hz'],
    assumptions: ['Schwarzschild nie uwzględnia spinu/ładunku; inspiral jest ograniczony do zakresu przed połączeniem.'],
    possibleExperiments: ['oblicz promień Schwarzschilda', 'oblicz dylatację czasu', 'oblicz masę chirp'], requiredSolver: 'sr-lorentz / einstein functions',
    visualization: ['numeric', 'graph', 'scene-3d'], dependencies: ['classical-mechanics', 'universe'], keywords: ['czarna dziura', 'schwarzschild', 'czasoprzestrzeń', 'czasoprzestrzen', 'dylatacja', 'einstein', 'grawitacyj'],
  },
  {
    id: 'thermodynamics', title: 'Termodynamika i fizyka statystyczna', sourceFile: 'thermodynamics.md', scale: 'micro-meso',
    capability: 'CAPABILITY_SEAM', realModels: ['ising-model'],
    concepts: ['energia', 'entropia', 'Boltzmann', 'równowaga', 'przemiana fazowa'], parameters: ['temperature'], units: ['K'],
    assumptions: ['Brak ogólnego eksperymentu termodynamicznego / solvera transportu ciepła.'],
    possibleExperiments: ['zbadaj model Isinga'], requiredSolver: 'ising model / thermal solver required for general request',
    visualization: ['numeric', 'graph', 'canvas-2d'], dependencies: ['mathematics', 'chemistry'], keywords: ['termodynamika', 'entropia', 'ciepło', 'ising', 'temperatura'],
  },
  {
    id: 'universe', title: 'Astrofizyka i kosmologia', sourceFile: 'universe.md', scale: 'cosmic',
    capability: 'REAL_ENGINE', realModels: ['universe-kepler', 'universe-atmospheric-escape', 'universe-hubble-tension', 'universe-planet-stability', 'universe-starlife'],
    concepts: ['ΛCDM', 'ekspansja', 'galaktyki', 'ciemna materia', 'soczewkowanie', 'planety', 'życie gwiazdy'],
    parameters: ['centralMassSolar', 'orbitalRadiusAu', 'stellarLuminositySolar', 'planetMassEarth', 'extraSystematic', 'showTrgb', 'years', 'jupiter', 'saturn', 'massSolar'], units: ['AU', 'yr', 'K', 'M☉', 'M⊕', 'km/s/Mpc', 'lat', 'mld lat', 'L☉'],
    assumptions: ['Obecne modele są analityczne/uproszczone, nie pełną numeryczną kosmologią; napięcie Hubble’a porównuje ustalone wartości referencyjne, stabilność planet używa ograniczonego czteroplanetowego modelu N-ciał, a życie gwiazdy stosuje masowe skalowania L ∝ M³·⁵ i t_MS ∝ M⁻²·⁵ bez pełnej ewolucji wnętrza.'],
    possibleExperiments: ['oblicz orbitę planety', 'zbadaj ucieczkę atmosfery', 'porównaj napięcie Hubble’a', 'zbadaj stabilność planet', 'zbadaj skalowanie życia gwiazdy'], requiredSolver: 'universe-kepler / universe-atmospheric-escape / universe-hubble-tension / universe-planet-stability / universe-starlife',
    visualization: ['numeric', 'graph', 'scene-3d'], dependencies: ['classical-mechanics', 'spacetime-einstein'], keywords: ['wszechświat', 'kosmologia', 'planeta', 'orbita', 'atmosfera', 'galaktyka', 'soczewkowanie', 'gwiazda', 'supernowa', 'biały karzeł'],
  },
] as const;

const BY_ID = new Map(DOMAIN_REGISTRY.map((entry) => [entry.id, entry]));

export function listKnowledgeDomains(): readonly KnowledgeDomainDescriptor[] {
  return DOMAIN_REGISTRY;
}

export function getKnowledgeDomain(id: string): KnowledgeDomainDescriptor | undefined {
  return BY_ID.get(id);
}

/** Deterministic, vocabulary-only discovery. It is intentionally not an LLM. */
export function findKnowledgeDomains(text: string): readonly KnowledgeDomainDescriptor[] {
  const normalized = text.toLocaleLowerCase('pl-PL');
  const matches = DOMAIN_REGISTRY.filter((entry) => entry.keywords.some((keyword) => normalized.includes(keyword)));
  return matches.length > 0 ? matches : [];
}

export function knowledgeSourcesForDomain(id: string): readonly KnowledgeCorpusFile[] {
  const entry = getKnowledgeDomain(id);
  if (!entry) return [];
  const dependentFiles = entry.dependencies
    .map((dependency) => getKnowledgeDomain(dependency)?.sourceFile)
    .filter((file): file is KnowledgeCorpusFile => Boolean(file));
  return [...new Set([entry.sourceFile, ...dependentFiles])];
}

/** Validates that the authoritative 20-file corpus is represented once and only once. */
export function validateKnowledgeRegistry(): { ok: boolean; missing: KnowledgeCorpusFile[]; duplicateFiles: KnowledgeCorpusFile[] } {
  const counts = new Map<KnowledgeCorpusFile, number>();
  for (const entry of DOMAIN_REGISTRY) counts.set(entry.sourceFile, (counts.get(entry.sourceFile) ?? 0) + 1);
  const missing = KNOWLEDGE_CORPUS_FILES.filter((file) => !counts.has(file));
  const duplicateFiles = KNOWLEDGE_CORPUS_FILES.filter((file) => (counts.get(file) ?? 0) !== 1);
  return { ok: missing.length === 0 && duplicateFiles.length === 0, missing, duplicateFiles };
}
