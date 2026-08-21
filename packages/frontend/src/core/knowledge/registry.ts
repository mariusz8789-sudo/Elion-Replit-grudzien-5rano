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
  'biology-aging-senescence-cancer.md',
  'chemistry.md',
  'civilization.md',
  'classical-mechanics.md',
  'discovery-timeline.md',
  'electrodynamics.md',
  'historical-legends-philadelphia.md',
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
export type KnowledgeCapability = 'REAL_ENGINE' | 'KNOWLEDGE_ONLY' | 'CAPABILITY_SEAM' | 'ENGINE_NOT_AVAILABLE' | 'HYPOTHETICAL_VISUALIZATION';
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
    capability: 'REAL_ENGINE', realModels: ['atom-bohr', 'atom-hydrogen-orbital'],
    concepts: ['atom wodoru', 'orbitale', 'poziomy energetyczne', 'widma', 'Rydberg'],
    parameters: ['atomicNumber', 'principalN', 'orbital', 'x', 'y', 'z'], units: ['eV', 'pm'],
    assumptions: ['Orbital wodoru jest analitycznym kształtem funkcji falowej w ustalonym punkcie, a nie pojedynczym pomiarem ani modelem wieloelektronowym.', 'Model Bohra jest ścisły dla układów wodoropodobnych, nie dla pełnej chemii atomów wieloelektronowych.'],
    possibleExperiments: ['pokaż atom wodoru', 'oblicz orbital wodoru', 'oblicz poziom energetyczny'], requiredSolver: 'ModelGraph / atom-bohr',
    visualization: ['numeric', 'graph', 'scene-3d'], dependencies: ['quantum'], keywords: ['atom', 'wodór', 'wodor', 'orbital', 'rydberg', 'widmo'],
  },
  {
    id: 'biology', title: 'Biologia i populacje', sourceFile: 'biology.md', scale: 'meso',
    capability: 'REAL_ENGINE', realModels: ['biology-logistic', 'biology-dna-helix', 'biology-protein-folding-hp', 'biology.city'],
    concepts: ['populacja logistyczna', 'błona', 'DNA', 'białko', 'epidemia'],
    parameters: ['growthRate', 'carryingCapacity', 'initialPopulation', 'timeElapsed', 'sequence', 'temperatureC', 'sequenceKey', 'temperature', 'steps', 'r0', 'seed'], units: ['1/czas', 'osobn.', 'dni', '°C', 'nm'],
    assumptions: ['Modele biologiczne są edukacyjne i nie stanowią diagnozy ani prognozy medycznej. Helisa DNA używa geometrii B-DNA oraz reguły Wallace’a dla krótkich presetów, bez pełnej termodynamiki sekwencji, atomistyki i dynamiki molekularnej. Model HP folding redukuje białko do H/P i siatki 2D; seedowany Metropolis może zatrzymać się w minimum lokalnym i nie przewiduje struktury ani funkcji realnego białka.'],
    possibleExperiments: ['zasymuluj epidemię', 'pokaż rozwój epidemii w mieście', 'oblicz helisę DNA', 'uruchom model HP fałdowania', 'wzrost populacji'], requiredSolver: 'EpidemicCitySimulation / B-DNA Wallace / HP Metropolis / ModelGraph',
    visualization: ['numeric', 'graph', 'world-3d', 'scene-3d'], dependencies: ['mathematics', 'thermodynamics'], keywords: ['epidemia', 'seir', 'seird', 'sir', 'zakaż', 'populacja', 'dna', 'helisa', 'wallace', 'miasto', 'choroba'],
  },
  {
    id: 'biology-aging-lab', title: 'Aging, senescencja i onkologia — Evidence Lab', sourceFile: 'biology-aging-senescence-cancer.md', scale: 'micro-meso',
    capability: 'CAPABILITY_SEAM', realModels: [],
    concepts: ['senescencja komórkowa', 'SASP', 'p16/p21', 'telomery', 'zegar epigenetyczny', 'senolityki', 'senomorfiki', 'częściowe przeprogramowanie', 'ryzyko onkologiczne'],
    parameters: ['evidenceQuality', 'reproducibility', 'toxicityEvidence', 'oncogenicRiskEvidence', 'dataCoverage'], units: ['score 0–1'],
    assumptions: ['Ten katalog klasyfikuje dowody i projektuje odtwarzalny protokół. Nie jest modelem pacjenta, diagnostyką, predykcją odpowiedzi na terapię ani aktywnym solverem biologicznym.', 'Senescencja jest heterogeniczna; pojedynczy marker nie stanowi dowodu odmłodzenia ani skuteczności klinicznej.', 'Dynamika komórek, omika, docking, molecular dynamics i QSAR wymagają zatwierdzonych danych oraz zwalidowanego runtime’u.'],
    possibleExperiments: ['zaprojektuj hipotezę senescencji', 'porównaj jakość dowodów kandydatów', 'zidentyfikuj brakujące dane', 'przygotuj Evidence Pack Aging Lab'], requiredSolver: 'zatwierdzony dataset biologiczny + zwalidowany solver; bez nich DATA_REQUIRED / ENGINE_NOT_AVAILABLE',
    visualization: ['numeric', 'graph', 'narrative'], dependencies: ['biology', 'chemistry', 'ai-discovery'], keywords: ['starzenie', 'aging', 'senescencja', 'senescence', 'sasp', 'p16', 'p21', 'telomer', 'senolityk', 'senolytic', 'senomorfik', 'reprogramowanie', 'oskm', 'yamanaka', 'onkologia', 'rak', 'cancer'],
  },
  {
    id: 'chemistry', title: 'Chemia', sourceFile: 'chemistry.md', scale: 'micro-meso',
    capability: 'REAL_ENGINE', realModels: ['chemistry-arrhenius', 'chemistry-ising', 'chemistry-titration', 'chem-vsepr', 'chem-molecular-weight', 'chem-rdkit-descriptors'],
    concepts: ['Arrhenius', 'VSEPR', 'miareczkowanie', 'Ising', 'magnetyzacja spontaniczna', 'masa molowa'],
    parameters: ['temperatureK', 'activationEnergyKJ', 'temperature', 'seed', 'acid', 'vb', 'shapeId', 'formula', 'smiles'], units: ['K', 'kJ/mol', 'J/k_B', 'g/mol'],
    assumptions: ['Ising używa 2D siatki kwadratowej J=1, najbliższych sąsiadów, periodycznych brzegów oraz seedowanego Metropolisa; dokładna magnetyzacja jest referencją granicy termodynamicznej, a pojedynczy run na 42×42 nie jest miarą niepewności. Miareczkowanie rozwiązuje bilans ładunku czterech lokalnych słabych kwasów przy ustalonych Ca=Cb=0,1 mol/L i Va=25 mL, więc nie jest pomiarem próbki. VSEPR zwraca istniejące wektory geometrii domen elektronowych; dla NH₃ i H₂O używa zdefiniowanych kątów zmierzonych, a dla pozostałych geometrii z wolnymi parami nie estymuje indywidualnych odchyleń. Molecular dynamics, docking i quantum chemistry wymagają zewnętrznych silników.'],
    possibleExperiments: ['oblicz kinetykę reakcji', 'uruchom 2D model Isinga', 'oblicz krzywą miareczkowania', 'pokaż geometrię VSEPR', 'oblicz masę molową', 'analizuj cząsteczkę'], requiredSolver: 'ModelGraph / Ising Metropolis / VSEPR geometry / RDKit capability',
    visualization: ['numeric', 'graph', 'canvas-2d', 'scene-3d'], dependencies: ['atom', 'quantum', 'thermodynamics'], keywords: ['chemia', 'reakcja', 'arrhenius', 'ising', 'magnetyzacja', 'przejście fazowe', 'molekuła', 'molekula', 'masa molowa', 'smiles', 'wiązanie'],
  },
  {
    id: 'civilization', title: 'Cywilizacja i skale energetyczne', sourceFile: 'civilization.md', scale: 'cosmic',
    capability: 'REAL_ENGINE', realModels: ['civilization-kardashev', 'civilization-drake-equation'],
    concepts: ['Kardaszew', 'równanie Drake’a', 'moc', 'SETI', 'Fermi'], parameters: ['kardashevType', 'starFormationRate', 'fractionWithPlanets', 'earthlikePerSystem', 'fractionDevelopingLife', 'fractionIntelligent', 'fractionCommunicative', 'lifetimeLog10Years'], units: ['W', 'gwiazd/rok', 'lat'],
    assumptions: ['Skala Kardaszewa jest narzędziem klasyfikacyjnym, nie prognozą społeczną. Równanie Drake’a jest interpretacyjną ramą: wartości fₗ, fᵢ, f𝚌 i L nie są danymi obserwacyjnymi.'],
    possibleExperiments: ['oblicz moc cywilizacji', 'przelicz równanie Drake’a'], requiredSolver: 'civilization-kardashev / civilization-drake-equation',
    visualization: ['numeric', 'graph', 'narrative'], dependencies: ['universe'], keywords: ['kardaszew', 'drake', 'cywilizacja', 'seti', 'fermi'],
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
    capability: 'REAL_ENGINE', realModels: ['math-gaussian', 'math-tesseract-4d'],
    concepts: ['algebra', 'rachunek', 'ODE', 'RK4', 'bezpieczny parser', 'rotacja 4D', 'projekcja 4D→3D'], parameters: ['mean', 'sigma', 'xValue', 'angleXWDeg', 'angleYZDeg', 'doubleRotation'], units: ['°'],
    assumptions: ['Parser wyrażeń jest sandboxem danych, nie wykonuje kodu użytkownika. Tesserakt jest dokładną geometrią w 4D oraz projekcją 4D→3D; nie stanowi twierdzenia o fizycznych dodatkowych wymiarach ani multiwersum.'],
    possibleExperiments: ['oblicz rozkład normalny', 'obróć i rzutuj tesserakt 4D'], requiredSolver: 'math-gaussian / tesseract linear algebra / safe expression parser',
    visualization: ['numeric', 'graph', 'scene-3d'], dependencies: [], keywords: ['matematyka', 'gauss', 'normalny', 'równanie', 'ode', 'tesserakt', 'tesseract', '4d', 'projekcja'],
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
    capability: 'REAL_ENGINE', realModels: ['nuclear-semf', 'nuclear-nuclide-chart', 'nuclear-tokamak-lawson'],
    concepts: ['SEMF', 'mapa nuklidów', 'energia wiązania', 'rozpad', 'fuzja', 'kryterium Lawsona', 'tokamak'], parameters: ['protonNumber', 'neutronNumber', 'densityExponent', 'temperatureKeV', 'confinementSeconds'], units: ['MeV', 'keV', 's'],
    assumptions: ['SEMF pomija efekty powłokowe i nie jest pełnym modelem reaktora. Charta nuklidów odróżnia predykcję SEMF od około 55 lokalnych rekordów zmierzonych NNDC/IAEA; brak rekordu nie jest twierdzeniem o nieistnieniu nuklidu. Tokamak ogranicza się do bilansu 0D kryterium Lawsona, bez MHD, transportu i predykcji urządzenia.'],
    possibleExperiments: ['oblicz energię wiązania jądra', 'pokaż mapę nuklidów', 'sprawdź kryterium Lawsona'], requiredSolver: 'nuclear-semf / nuclear-nuclide-chart / nuclear-tokamak-lawson',
    visualization: ['numeric', 'graph', 'canvas-2d', 'scene-3d'], dependencies: ['particle', 'quantum'], keywords: ['jądro', 'jadro', 'sefm', 'energia wiązania', 'mapa nuklidów', 'nuklid', 'fuzja', 'tokamak', 'lawson', 'rozpad'],
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
    capability: 'CAPABILITY_SEAM', realModels: ['quantum-bloch', 'quantum-bloch-circuit', 'quantum-teleportation', 'quantum-tunneling-1d', 'chsh-correlation', 'quantum-chsh-correlation', 'quantum-kitaev-bulk'],
    concepts: ['superpozycja', 'interferencja', 'splątanie', 'teleportacja kwantowa', 'tunelowanie', 'kubit', 'bramki', 'bulk BdG', 'łańcuch Kitaeva'], parameters: ['theta', 'phi', 'circuit', 'state', 'a', 'aP', 'b', 'bP', 'energy', 'barrier', 'width', 'chemicalPotential', 'hopping', 'pairing'], units: ['rad', 'jedn. energii'],
    assumptions: ['Lokalny model obwodu Blocha liczy dokładne bramki jednokubitowe H, X, Y, Z, S i T od stanu |0⟩ oraz raportuje amplitudy, ale nie losuje pomiaru ani nie obejmuje splątania; tunelowanie to ograniczony 1D split-step Fourier dla pakietu Gaussa i bariery prostokątnej, nie ogólny solver; Teleportacja wylicza dokładnie pełny wektor stanu trzech kubitów dla czterech gałęzi pomiaru i nie reprezentuje hardware ani transmisji nadświetlnej; CHSH jest dokładną analityczną korelacją idealnego singletu, nie symulacją detektorów ani testem Bella bez luk; Q1 oblicza wyłącznie translacyjnie niezmienny bulk model Kitaeva; solver tunelowania Schrödingera nie jest obecnie uniwersalnym engine.'],
    possibleExperiments: ['wykonaj obwód jednokubitowy Blocha', 'zweryfikuj teleportację kwantową', 'oblicz analityczną korelację CHSH', 'pokaż stan kubitu', 'zbadaj korelację CHSH', 'oblicz bulk gap łańcucha Kitaeva'], requiredSolver: 'single-qubit matrices / three-qubit quantumState / Schrödinger solver required for tunneling; Q1 Kitaev bulk dostępny dla zdefiniowanego modelu',
    visualization: ['numeric', 'graph', 'scene-3d'], dependencies: ['mathematics', 'electrodynamics'], keywords: ['kwant', 'kubit', 'bloch', 'bramka', 'obwód kwantowy', 'teleportacja kwantowa', 'splątanie', 'splatanie', 'tunelowanie', 'chsh', 'kitaev', 'majorana'],
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
    capability: 'REAL_ENGINE', realModels: ['sr-lorentz', 'spacetime-light-cone', 'spacetime-minkowski', 'spacetime-c-slider', 'einstein-kerr-equatorial', 'einstein-schwarzschild', 'einstein-schwarzschild-geodesic', 'einstein-point-lens', 'einstein-chirp-mass'],
    concepts: ['SR', 'GR', 'Schwarzschild', 'geodezyjna', 'czarna dziura', 'fale grawitacyjne'],
    parameters: ['velocityFraction', 'v', 'tripYears', 'beta', 'velocityMs', 'lightSpeedMs', 'distanceKm', 'spin', 'massSolar', 'impact', 'm1Solar', 'm2Solar'], units: ['s', 'm', 'km', 'M☉', 'Hz'],
    assumptions: ['Schwarzschild nie uwzględnia spinu/ładunku; geodezyjna jest pojedynczym promieniem w płaszczyźnie równikowej bez Kerra, ray tracingu 3D i fizyki dysku; soczewkowanie jest idealną soczewką punktową bez masy rozciągłej i danych obserwacyjnych; stożek świetlny jest geometrią Minkowskiego z natychmiastowym zawrotem bez profilu przyspieszenia i ogólnej OTW; diagram Minkowskiego 1+1D transformuje dwa ustalone zdarzenia przestrzennopodobne w konwencji c=1, bez przyspieszenia i grawitacji; c-Slider jest eksperymentem myślowym ważnym tylko dla v<c i zmienia założenie modelu, nie fizyczną stałą natury; Kerr obejmuje jedynie horyzont, ergosferę równikową i orbity fotonowe w płaszczyźnie równikowej, bez Q≠0 i ray tracingu 3D; inspiral jest ograniczony do zakresu przed połączeniem.'],
    possibleExperiments: ['oblicz stożek świetlny', 'pokaż diagram Minkowskiego', 'uruchom c-Slider', 'oblicz obserwowalne Kerra', 'oblicz promień Schwarzschilda', 'zintegruj geodezyjną fotonu Schwarzschilda', 'oblicz soczewkę punktową', 'oblicz dylatację czasu', 'oblicz masę chirp'], requiredSolver: 'sr-lorentz / c-Slider / Minkowski 1+1D / Kerr equatorial / einstein functions',
    visualization: ['numeric', 'graph', 'canvas-2d', 'scene-3d'], dependencies: ['classical-mechanics', 'universe'], keywords: ['czarna dziura', 'schwarzschild', 'czasoprzestrzeń', 'czasoprzestrzen', 'dylatacja', 'einstein', 'grawitacyj'],
  },
  {
    id: 'historical-legends', title: 'Legendy historyczne — scenariusze hipotetyczne', sourceFile: 'historical-legends-philadelphia.md', scale: 'meso',
    capability: 'HYPOTHETICAL_VISUALIZATION', realModels: [],
    concepts: ['Eksperyment Filadelfia', 'USS Eldridge', 'źródło historyczne', 'legenda', 'hipoteza', 'wizualizacja hipotetyczna', 'elektromagnetyzm'],
    parameters: ['viewMode'], units: [],
    assumptions: ['Scenariusz odróżnia historyczny rekord od legendy i wizualizacji założeń. Nie jest symulacją fizycznego eksperymentu, źródłem danych pomiarowych ani modelem teleportacji.', 'Znana fizyka elektromagnetyzmu jest prezentowana wyłącznie jako granica porównawcza; bez solvera Maxwella i danych nie ma real-engine.'],
    possibleExperiments: ['pokaż Eksperyment Filadelfia jako legendę', 'porównaj legendę z fizyką elektromagnetyzmu', 'pokaż wymagania realnego modelu pola'], requiredSolver: 'Brak solvera — HYPOTHETICAL_VISUALIZATION; dla fizycznej analizy wymagany zwalidowany solver Maxwella, geometria i warunki brzegowe',
    visualization: ['scene-3d', 'narrative'], dependencies: ['spacetime-einstein', 'electrodynamics'], keywords: ['eksperyment filadelfia', 'eksperyment filadelfijski', 'philadelphia experiment', 'uss eldridge', 'eldridge', 'legenda filadelfii'],
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
    capability: 'REAL_ENGINE', realModels: ['universe-kepler', 'universe-solar-system', 'universe-atmospheric-escape', 'universe-hubble-tension', 'universe-planet-stability', 'universe-starlife', 'universe-galaxy-collision', 'universe-rotation-curve'],
    concepts: ['ΛCDM', 'ekspansja', 'galaktyki', 'ciemna materia', 'soczewkowanie', 'planety', 'życie gwiazdy', 'ogony pływowe', 'krzywa rotacji'],
    parameters: ['centralMassSolar', 'orbitalRadiusAu', 'daysElapsed', 'stellarLuminositySolar', 'planetMassEarth', 'extraSystematic', 'showTrgb', 'years', 'jupiter', 'saturn', 'massSolar', 'ratio', 'retro', 'horizonMyr', 'haloVInf', 'altGravity'], units: ['AU', 'yr', 'K', 'M☉', 'M⊕', 'km/s/Mpc', 'lat', 'mld lat', 'L☉', 'mln lat (skalowanie widoku)', 'km/s', 'kpc'],
    assumptions: ['Obecne modele są analityczne/uproszczone, nie pełną numeryczną kosmologią; Układ Słoneczny używa stałych elementów orbitalnych ośmiu planet i rozwiązania Keplera, lecz umownych faz startowych bez efemerydy JPL, napięcie Hubble’a porównuje ustalone wartości referencyjne, stabilność planet używa ograniczonego czteroplanetowego modelu N-ciał, życie gwiazdy stosuje masowe skalowania L ∝ M³·⁵ i t_MS ∝ M⁻²·⁵ bez pełnej ewolucji wnętrza, zderzenie galaktyk jest restricted three-body Toomre–Toomre bez gazu, samograwitacji dysków i tarcia dynamicznego, a krzywa rotacji używa przybliżonego dysku sferycznego z halo pseudo-izotermicznym lub relacji MOND bez fitowania konkretnej galaktyki.'],
    possibleExperiments: ['oblicz orbitę planety', 'pokaż Układ Słoneczny', 'zbadaj ucieczkę atmosfery', 'porównaj napięcie Hubble’a', 'zbadaj stabilność planet', 'zbadaj skalowanie życia gwiazdy', 'zbadaj ograniczone zderzenie galaktyk', 'porównaj krzywą rotacji halo i MOND'], requiredSolver: 'universe-kepler / universe-solar-system / universe-atmospheric-escape / universe-hubble-tension / universe-planet-stability / universe-starlife / universe-galaxy-collision / universe-rotation-curve',
    visualization: ['numeric', 'graph', 'canvas-2d', 'scene-3d'], dependencies: ['classical-mechanics', 'spacetime-einstein'], keywords: ['wszechświat', 'kosmologia', 'układ słoneczny', 'uklad sloneczny', 'planeta', 'orbita', 'atmosfera', 'galaktyka', 'soczewkowanie', 'gwiazda', 'supernowa', 'biały karzeł', 'zderzenie galaktyk', 'ogony pływowe', 'krzywa rotacji', 'ciemna materia', 'mond'],
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
