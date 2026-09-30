import type { EpistemicStatus } from '../generator/recipe';
import type { SceneBasis, SceneManifest } from './sceneBasis';

/**
 * U0-b — one manifest per laboratory scene: what on screen is a measurement,
 * what is computed from theory, what is only drawn for the eye, and where the
 * simulation (not the theory) stops being valid.
 *
 * Written from each experiment's own honestyNote, which stays the detailed
 * text; nothing here raises a claim above what that note already says.
 * Scene id: `lab:<labId>:<experimentId>`; the base experiment of a lab uses
 * the lab id (`lab:universe:universe`). Custom lab screens with several
 * modes get one id per mode (`lab:atom:orbitals`, `lab:mathematics:ode`).
 */

type Fields = Partial<Omit<SceneManifest, 'sceneId' | 'basis' | 'reliability'>>;

function scene(sceneId: string, basis: SceneBasis, reliability: EpistemicStatus, f: Fields): SceneManifest {
  return {
    sceneId,
    basis,
    reliability,
    measuredDataRefs: f.measuredDataRefs ?? [],
    modelRefs: f.modelRefs ?? [],
    ...(f.sourceRefs ? { sourceRefs: f.sourceRefs } : {}),
    assumptions: f.assumptions ?? [],
    speculativeElements: f.speculativeElements ?? [],
    visualizationOnlyElements: f.visualizationOnlyElements ?? [],
    simulationLimits: f.simulationLimits ?? [],
    theoryLimits: f.theoryLimits ?? [],
  };
}

export function labSceneId(labId: string, experimentId: string): string {
  return `lab:${labId}:${experimentId === '__base' ? labId : experimentId}`;
}

const HORIZON_IS_CAUSAL = 'Horyzont zdarzeń jest granicą przyczynową, a nie granicą znanej fizyki: spadający obserwator nie zauważa przy nim niczego lokalnie szczególnego.';
const GR_INTERIOR = 'Ogólna teoria względności działa także pod horyzontem; oczekuje się, że zawodzi dopiero przy krzywiźnie rzędu skali Plancka, w pobliżu osobliwości w centrum (tam potrzebna byłaby kwantowa teoria grawitacji).';
const NASA_PLANETS = 'NASA Planetary Fact Sheet: półosie wielkie, mimośrody, okresy, nachylenia osi';
const PDG = 'Particle Data Group: masy i szerokości rezonansów';
const NNDC = 'NNDC: ok. 55 zmierzonych izotopów (energie wiązania)';
const GRAPH = 'Wykonywalny Graf Modeli (core/modelGraph)';

const MANIFESTS: readonly SceneManifest[] = [
  // ---------------- Universe Lab ----------------
  scene('lab:universe:universe', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    measuredDataRefs: [NASA_PLANETS, 'NASA Planetary Satellite Fact Sheet: okresy orbitalne księżyców'],
    modelRefs: ['Równanie Keplera (orbity eliptyczne)', 'III prawo Keplera dla pasa planetoid'],
    assumptions: ['Orbity planet współpłaszczyznowe (pominięte inklinacje 0,003°–7°)', 'Orbity księżyców kołowe'],
    visualizationOnlyElements: ['Skala odległości skompresowana (√a), rozmiary planet symboliczne', 'Tekstury planet i Słońca proceduralne, nie zdjęcia', 'Wzór pasm pierścieni', 'Populacja pasa planetoid', 'Przelot kamery do planety', 'Poświata (bloom)'],
    simulationLimits: ['Kąty startowe dowolne: to nie jest efemeryda na konkretną datę', 'Planety nie przyciągają się nawzajem (niezależne elipsy)'],
  }),
  scene('lab:universe:expansion-2d', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    modelRefs: ['Równanie Friedmanna, płaski wszechświat (materia + ciemna energia)'],
    assumptions: ['Pominięte promieniowanie, powstawanie struktur i lokalna grawitacja'],
    speculativeElements: ['Natura ciemnej energii jest nieznana; model przyjmuje stałą kosmologiczną'],
    visualizationOnlyElements: ['Kolory galaktyk ilustrują redshift'],
    simulationLimits: ['Brak ery promieniowania: nie opisuje wczesnego wszechświata'],
    theoryLimits: ['Napięcie Hubble\'a pokazuje, że model ΛCDM może wymagać poprawek'],
  }),
  scene('lab:universe:solar-system', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    measuredDataRefs: [NASA_PLANETS],
    modelRefs: ['Dokładne rozwiązanie równania Keplera'],
    visualizationOnlyElements: ['Skala odległości skompresowana (√a), rozmiary planet symboliczne'],
    simulationLimits: ['Kąty startowe dowolne: to nie jest żywa efemeryda NASA JPL Horizons', 'Niezależne elipsy, bez wzajemnych zaburzeń planet'],
  }),
  scene('lab:universe:collision', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    modelRefs: ['Ograniczony problem trzech ciał (Toomre & Toomre 1972)'],
    assumptions: ['Gwiazdy są cząstkami próbnymi, oddziałują tylko jądra'],
    simulationLimits: ['Brak tarcia dynamicznego: jądra nie łączą się tak szybko jak w naturze', 'Brak samograwitacji dysków', 'Skala czasu przybliżona'],
  }),
  scene('lab:universe:starlife', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    modelRefs: ['Skalowania t ∝ M⁻²·⁵ i L ∝ M³·⁵', 'Progi losu końcowego ~8 i ~20 mas Słońca'],
    visualizationOnlyElements: ['Grafika gwiazdy symboliczna', 'Oś czasu nieliniowa'],
    simulationLimits: ['Zgodność tylko co do rzędu wielkości, bez modelu wnętrza gwiazdy'],
  }),
  scene('lab:universe:threebody', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Grawitacja Newtona, całkowanie velocity-Verlet'],
    assumptions: ['Jednostki bezwymiarowe (G=1), nie prawdziwe masy i odległości'],
    simulationLimits: ['Układ chaotyczny: błąd numeryczny rośnie z czasem'],
    theoryLimits: ['Fizyka Newtona pomija efekty relatywistyczne (ważne dopiero przy silnych polach)'],
  }),
  scene('lab:universe:rotationcurve', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    modelRefs: ['Masa zamknięta w sferze (przybliżenie dysku)', 'Halo pseudo-izotermiczne (Begeman 1989)'],
    assumptions: ['Stałe typowe dla galaktyki spiralnej, nie dane jednej zmierzonej galaktyki'],
    speculativeElements: ['Natura ciemnej materii pozostaje nieznana (cząstka czy zmiana grawitacji)'],
    simulationLimits: ['Brak dokładnego rozwiązania cienkiego dysku (funkcje Bessela)'],
  }),
  scene('lab:universe:doublependulum', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Równania Lagrange\'a dla dwóch sztywnych prętów', 'Całkowanie RK4'],
    assumptions: ['Brak tarcia, pręty bez masy, g=9,81 m/s², L=1 m, m=1 kg'],
    simulationLimits: ['RK4 nie jest symplektyczne: energia powoli dryfuje (widoczne w odczycie)'],
  }),
  scene('lab:universe:lorenz', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Równania Lorenza (1963), σ=10, β=8/3', 'Próg chaosu ρ_h (Sparrow 1982)'],
    assumptions: ['Trzy zmienne zamiast prawdziwej atmosfery'],
    simulationLimits: ['RK4 z krokiem 0,01: długi tor rozjeżdża się z rozwiązaniem dokładnym'],
    theoryLimits: ['To model konwekcji, nie symulacja prawdziwej pogody'],
  }),
  scene('lab:universe:planet-stability', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Grawitacja N ciał, velocity-Verlet', 'Równanie vis-viva'],
    measuredDataRefs: [NASA_PLANETS],
    assumptions: ['Cztery planety zamiast ośmiu', 'Start w peryhelium, nie z efemerydy na datę'],
    simulationLimits: ['Brak Merkurego, Wenus, Urana i Neptuna'],
  }),
  scene('lab:universe:hubbletension', 'MEASURED_DATA', 'WELL_SUPPORTED_MODEL', {
    measuredDataRefs: ['Riess i in. 2022 (SH0ES)', 'Planck Collaboration 2020', 'Freedman i in. 2021 (TRGB)'],
    modelRefs: ['Napięcie liczone jako różnica / niepewności w kwadraturze'],
    speculativeElements: ['Czy napięcie oznacza nową fizykę, czy nieznaną systematykę: otwarta debata'],
    visualizationOnlyElements: ['Krzywe znormalizowane do tej samej wysokości szczytu, nie pola'],
    simulationLimits: ['Pokazuje trzy opublikowane pomiary, nie wszystkie istniejące'],
  }),
  scene('lab:universe:universe.orbital-consequence', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: [GRAPH, 'III prawo Keplera, vis-viva, skalowanie pływów ∝ M/r³'],
    assumptions: ['Orbita kołowa wokół dominującej masy'],
    simulationLimits: ['Nie obejmuje orbit eliptycznych ani wielu ciał'],
  }),
  scene('lab:universe:universe.atmospheric-escape', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    modelRefs: [GRAPH, 'Ucieczka Jeansa, temperatura równowagowa'],
    assumptions: ['Brak efektu cieplarnianego'],
    simulationLimits: ['Brak ucieczki hydrodynamicznej i wiatru gwiazdowego'],
  }),

  // ---------------- Spacetime Lab ----------------
  scene('lab:spacetime:spacetime', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Szczególna teoria względności: dylatacja czasu'],
    assumptions: ['Paradoks bliźniąt ze stałą prędkością i natychmiastowym zawrotem'],
    visualizationOnlyElements: ['Grafika zegarów'],
    simulationLimits: ['Brak fazy przyspieszania i hamowania'],
    theoryLimits: ['STW nie obejmuje grawitacji (to OTW)'],
  }),
  scene('lab:spacetime:minkowski', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Transformacja Lorentza'],
    assumptions: ['Jednostki umowne (c = 1)'],
    simulationLimits: ['Jeden wymiar przestrzenny'],
  }),
  scene('lab:spacetime:lightcone-3d', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Stożek świetlny x² + z² = (ct)²', 'Linie świata o nachyleniu v'],
    assumptions: ['Natychmiastowy zawrót podróżnika'],
    visualizationOnlyElements: ['Podróż wyskalowana do stałej wysokości ekranu (lata podane liczbowo)'],
    simulationLimits: ['Tylko ruch jednostajny, bez grawitacji'],
  }),
  scene('lab:spacetime:spacetime.sr-consequence', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: [GRAPH, 'γ, dylatacja czasu, skrócenie długości, relatywistyczny Doppler'],
    simulationLimits: ['Traci ważność przy β → 1', 'Brak przyspieszeń'],
    theoryLimits: ['STW nie obejmuje grawitacji (to OTW)'],
  }),
  scene('lab:spacetime:spacetime.c-slider', 'COMPUTED_MODEL', 'THOUGHT_EXPERIMENT', {
    modelRefs: [GRAPH, 'Szczególna teoria względności przy zmienionej wartości c'],
    assumptions: ['Prędkość światła jest suwakiem, a nie stałą przyrody'],
    speculativeElements: ['Świat z inną wartością c jest eksperymentem myślowym'],
    simulationLimits: ['Dla v ≥ c model traci ważność i to sygnalizuje'],
    theoryLimits: ['Zmiana c zmieniłaby też chemię i jądra atomów, czego model nie liczy'],
  }),

  // ---------------- Einstein Lab ----------------
  scene('lab:einstein:einstein', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Geodezyjna zerowa Schwarzschilda d²u/dφ² = −u + 1,5 r_s u² (RK4)', 'Soczewka punktowa słabego pola θ = β + θ_E²/β', 'Krytyczny parametr zderzenia b = 2,598 r_s'],
    assumptions: ['Czarna dziura bez obrotu i ładunku', 'Masa zmienia się płynnie, bez dynamicznej metryki'],
    speculativeElements: [],
    visualizationOnlyElements: ['Wyginanie tła jest przybliżeniem słabego pola (bez wtórnych obrazów)', 'Korona nad dyskiem', 'Blask pierścienia fotonowego', 'Mgławice w tle i rozjaśnienie przy wejściu', 'Poświata (bloom)'],
    simulationLimits: [
      'Fotony znikają z rysunku po przejściu pod horyzont: symulacja dalej ich nie śledzi',
      'Dysk: kierunki efektów prawdziwe, profil prędkości i transfer promieniowania nie',
      'Tor fotonu rysowany od ok. 15 r_s',
    ],
    theoryLimits: [HORIZON_IS_CAUSAL, GR_INTERIOR],
  }),
  scene('lab:einstein:weak-field-2d', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    modelRefs: ['Ugięcie światła w słabym polu α = 4GM/c²b'],
    speculativeElements: ['Metryka Alcubierre\'a: wymaga egzotycznej materii, której nie potwierdzono'],
    visualizationOnlyElements: ['Siatka czasoprzestrzeni', 'Frame-dragging Kerra'],
    simulationLimits: ['Przybliżenie poprawne tylko z dala od horyzontu'],
    theoryLimits: [HORIZON_IS_CAUSAL],
  }),
  scene('lab:einstein:geodesics', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Geodezyjna zerowa Schwarzschilda (RK4)'],
    visualizationOnlyElements: ['Dysk akrecyjny z góry i jego jasność'],
    simulationLimits: ['Tory liczone w płaszczyźnie; fotony pod horyzontem nie są dalej śledzone'],
    theoryLimits: [HORIZON_IS_CAUSAL, GR_INTERIOR],
  }),
  scene('lab:einstein:kerr-3d', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Geodezyjne Kerra w płaszczyźnie równikowej (Boyer–Lindquist, Carter 1968)', 'Horyzont M+√(M²−a²), ergosfera', 'Orbity fotonowe (Bardeen 1972, Teo 2003)'],
    visualizationOnlyElements: ['Dysk akrecyjny', 'Poświata (bloom)'],
    simulationLimits: ['Tylko fotony w płaszczyźnie równikowej (Q = 0)', 'ISCO Kerra nie jest liczone'],
    theoryLimits: [HORIZON_IS_CAUSAL, 'Wnętrze wirującej czarnej dziury (horyzont Cauchy\'ego) jest niepewne teoretycznie'],
  }),
  scene('lab:einstein:lensing', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Soczewka punktowa: pozycje obrazów, wzmocnienia, krzywa blasku'],
    assumptions: ['Źródło punktowe, pojedyncza masa'],
    simulationLimits: ['Galaktyki-soczewki wymagają modeli rozciągłych, których tu nie ma'],
  }),
  scene('lab:einstein:chirp', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    modelRefs: ['Formuła kwadrupolowa wiodącego rzędu (jak przy GW150914)', 'ISCO r = 6GM/c²'],
    visualizationOnlyElements: ['Błysk połączenia', 'Dźwięk rozciągnięty w czasie (częstotliwości prawdziwe)'],
    simulationLimits: ['Model kończy się na ISCO; połączenie i ringdown nie są symulowane'],
    theoryLimits: ['OTW opisuje połączenie, ale wymaga pełnej relatywistyki numerycznej'],
  }),
  scene('lab:einstein:einstein.gw-sr-consequence', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    modelRefs: [GRAPH, 'Masa ćwierkowa, ISCO Schwarzschilda', 'Relatywistyczny Doppler'],
    assumptions: ['Brak spinu'],
    simulationLimits: ['ISCO bez spinu jest przybliżeniem'],
  }),

  // ---------------- Quantum Lab ----------------
  scene('lab:quantum:quantum', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Interferencja dwuszczelinowa, trafienia losowane z |ψ|²'],
    assumptions: ['Skale odległości umowne'],
    simulationLimits: ['Trajektorie cząstek celowo nie są rysowane'],
  }),
  scene('lab:quantum:tunneling', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Równanie Schrödingera, split-step Fourier, siatka 512 punktów'],
    assumptions: ['ħ = m = 1', 'Bariera idealnie prostokątna'],
    simulationLimits: ['Brzeg siatki pochłania falę (ok. 13% po dłuższym czasie); to ograniczenie siatki, nie fizyka', 'Brak stanu stabilnego: prawdopodobieństwo z czasem odpływa'],
  }),
  scene('lab:quantum:bloch', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Stan kubitu i macierze bramek unitarnych', 'SU(2) → SO(3)'],
    assumptions: ['Dekoherencja jako model fenomenologiczny'],
    visualizationOnlyElements: ['Panel przycisków bramek'],
    simulationLimits: ['Tylko jeden kubit: brak bramek dwukubitowych i splątania'],
  }),
  scene('lab:quantum:chsh', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Korelacje singletu E(a,b) = −cos(a−b)', 'Model lokalnych ukrytych zmiennych'],
    simulationLimits: ['Statystyka z losowanych prób, nie z prawdziwego detektora'],
  }),
  scene('lab:quantum:teleport', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Protokół Bennetta i in. (1993), pełny wektor stanu 3 kubitów'],
    simulationLimits: ['Brak szumu i strat prawdziwego sprzętu'],
    theoryLimits: ['Nie przenosi materii ani informacji szybciej niż światło: potrzebne są 2 bity klasyczne'],
  }),
  scene('lab:quantum:quantum.photon-consequence', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: [GRAPH, 'E = hc/λ, f = c/λ'],
    simulationLimits: ['Pojedynczy foton, bez oddziaływania z materią'],
  }),
  scene('lab:quantum:kitaev-bulk', 'COMPUTED_MODEL', 'THEORETICAL_MODEL', {
    modelRefs: ['Spektrum łańcucha Kitaeva (bez oddziaływań, translacyjnie niezmienny)'],
    speculativeElements: ['Mody Majorany w prawdziwych urządzeniach są przedmiotem sporu'],
    simulationLimits: ['Model bulk: to nie jest nanodrut, materiał InAs–Al ani urządzenie Majorana 1'],
  }),

  // ---------------- Atom Lab (custom screen, one id per mode) ----------------
  scene('lab:atom:atom', 'COMPUTED_MODEL', 'THEORETICAL_MODEL', {
    modelRefs: ['Model powłokowy w konwencji Bohra, reguła Aufbau'],
    visualizationOnlyElements: ['Skala jądro/powłoki złamana dla czytelności'],
    simulationLimits: ['Kilka pierwiastków ma odstępstwa od reguły Aufbau'],
    theoryLimits: ['Prawdziwe elektrony opisują orbitale kwantowe, nie orbity Bohra'],
  }),
  scene('lab:atom:orbitals', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Dokładne rozwiązania równania Schrödingera dla wodoru', 'Próbkowanie Monte Carlo |ψ|²'],
    visualizationOnlyElements: ['Kamera i skala kadru'],
    simulationLimits: ['Tylko atom wodoru (jeden elektron)'],
  }),
  scene('lab:atom:orbitals2d', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Dokładne rozwiązania równania Schrödingera dla wodoru (przekrój)'],
    visualizationOnlyElements: ['Jasność skompresowana, by uwidocznić węzły'],
    simulationLimits: ['Tylko atom wodoru, jedna płaszczyzna'],
  }),
  scene('lab:atom:atom.bohr-consequence', 'COMPUTED_MODEL', 'THEORETICAL_MODEL', {
    modelRefs: [GRAPH, 'Model Bohra: E_n = −13,606·Z²/n² eV, r_n = 52,9·n²/Z pm'],
    simulationLimits: ['Ścisły tylko dla układów jednoelektronowych (H, He⁺ …)'],
    theoryLimits: ['Model Bohra zastąpiła mechanika kwantowa (orbitale)'],
  }),
  scene('lab:atom:trends', 'MEASURED_DATA', 'ESTABLISHED_SCIENCE', {
    measuredDataRefs: ['CRC Handbook of Chemistry and Physics', 'NIST Atomic Spectra Database', 'Promień atomowy: Slater 1964'],
    simulationLimits: ['Tylko okresy 1–4 (Z = 1–36)', 'Gazy szlachetne bez promienia empirycznego są pominięte'],
  }),

  // ---------------- Nuclear Lab ----------------
  scene('lab:nuclear:nuclear', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Prawo rozpadu promieniotwórczego, losowość pojedynczych jąder'],
    visualizationOnlyElements: ['Czas skompresowany (6 s ekranu = 1 okres półtrwania)'],
    simulationLimits: ['Pominięte produkty pośrednie łańcuchów rozpadu'],
  }),
  scene('lab:nuclear:chart', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    measuredDataRefs: [NNDC],
    modelRefs: ['Półempiryczny wzór na masę (Weizsäcker)'],
    simulationLimits: ['Tło z modelu pomija efekty powłokowe'],
    theoryLimits: ['Wzór kroplowy nie przewiduje liczb magicznych'],
  }),
  scene('lab:nuclear:chart-3d', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    measuredDataRefs: [NNDC],
    modelRefs: ['Półempiryczny wzór na masę (Weizsäcker)'],
    simulationLimits: ['Powierzchnia z modelu pomija efekty powłokowe (maksimum przy Ni-62/Fe-58)'],
    theoryLimits: ['Wzór kroplowy nie przewiduje liczb magicznych'],
  }),
  scene('lab:nuclear:nuclear.semf-consequence', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    modelRefs: [GRAPH, 'Półempiryczny wzór na masę (model kroplowy)'],
    simulationLimits: ['Brak efektów powłokowych'],
    theoryLimits: ['Wzór kroplowy nie przewiduje liczb magicznych'],
  }),
  scene('lab:nuclear:chain', 'COMPUTED_MODEL', 'THEORETICAL_MODEL', {
    modelRefs: ['Model cząsteczkowy reakcji łańcuchowej, ~2,4 neutronu na rozszczepienie U-235'],
    simulationLimits: ['Brak przekrojów czynnych i transportu Monte Carlo'],
  }),
  scene('lab:nuclear:tokamak', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    modelRefs: ['Kryterium Lawsona (bilans 0-wymiarowy)'],
    simulationLimits: ['Pominięte profil plazmy, niestabilności MHD i straty promieniste'],
  }),

  // ---------------- Particle Lab (Particle Lab, not the CERN world) ----------------
  scene('lab:particle:particle', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    modelRefs: ['Tor cząstki naładowanej w polu solenoidu: helisa, r = p_t/(qB)'],
    visualizationOnlyElements: ['Warstwy detektora (tracker/ECAL/HCAL) i ich proporcje'],
    simulationLimits: ['Rodzaje i liczba cząstek losowane: to nie są zderzenia z LHC'],
  }),
  scene('lab:particle:detector-2d', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    modelRefs: ['Krzywizna toru r = p/(qB)'],
    visualizationOnlyElements: ['Rysunek detektora'],
    simulationLimits: ['Rodzaje i liczba cząstek losowane: to nie są zderzenia z LHC'],
  }),
  scene('lab:particle:invmass', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    measuredDataRefs: [PDG],
    modelRefs: ['Histogram masy niezmienniczej par mionów', 'Rozkład Breita–Wignera plus tło'],
    simulationLimits: ['Zdarzenia są SYNTETYCZNE, nie prawdziwe dane CMS (dane CERN Open Data nie są tu podpięte)'],
  }),
  scene('lab:particle:particle.relativistic-energy', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    measuredDataRefs: ['Masy elektronu i protonu (CODATA)'],
    modelRefs: [GRAPH, 'γ, E = γmc², p = γmβc'],
    simulationLimits: ['Cząstka swobodna, bez oddziaływań'],
  }),

  // ---------------- Chemistry Lab ----------------
  scene('lab:chemistry:chemistry', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    measuredDataRefs: ['Kąty wiązań NH₃ (106,8°) i H₂O (104,5°): NIST CCCBDB'],
    modelRefs: ['Teoria VSEPR (Gillespie & Nyholm 1957)'],
    visualizationOnlyElements: ['Kolory atomów schematyczne'],
    simulationLimits: ['SF₄, ClF₃, XeF₂, BrF₅, XeF₄: pozycje idealne, prawdziwe kąty różnią się o kilka stopni'],
  }),
  scene('lab:chemistry:bond-polarity-2d', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    measuredDataRefs: ['Elektroujemność Paulinga (CRC Handbook)'],
    modelRefs: ['Procent charakteru jonowego: Hannay–Smyth (1946)'],
    assumptions: ['Progi 0,4 / 1,7 to konwencja dydaktyczna'],
    visualizationOnlyElements: ['Rozmiary atomów symboliczne (log Z)'],
    simulationLimits: ['Charakter jonowy jest przybliżeniem, nie pomiarem'],
  }),
  scene('lab:chemistry:titration', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    measuredDataRefs: ['Stałe Ka (CRC Handbook)'],
    modelRefs: ['Równanie bilansu ładunku z autodysocjacją wody'],
    assumptions: ['Typowe stężenia i objętości, nie jeden konkretny eksperyment'],
    simulationLimits: ['Roztwór idealny (bez współczynników aktywności)'],
  }),
  scene('lab:chemistry:ising', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Model Isinga 2D, algorytm Metropolisa', 'Rozwiązanie Onsagera (1944)'],
    assumptions: ['Tylko najbliżsi sąsiedzi, klasyczne spiny ±1'],
    simulationLimits: ['Siatka 42×42 rozmywa punkt krytyczny'],
    theoryLimits: ['Prawdziwe ferromagnetyki są bardziej złożone niż model Isinga'],
  }),
  scene('lab:chemistry:chemistry.kinetics-consequence', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    modelRefs: [GRAPH, 'Równanie Arrheniusa'],
    assumptions: ['A i Eₐ niezależne od temperatury, reakcja elementarna'],
    simulationLimits: ['Nie opisuje reakcji złożonych'],
  }),

  // ---------------- Multiverse Lab ----------------
  scene('lab:multiverse:multiverse', 'COMPUTED_MODEL', 'SPECULATIVE_MODEL', {
    modelRefs: ['Skalowania rzędu wielkości z literatury fine-tuningu'],
    speculativeElements: ['Istnienie innych wszechświatów nie ma potwierdzenia obserwacyjnego'],
    visualizationOnlyElements: ['Migotanie gwiazdy przy niestabilnej syntezie', 'Skalowania promienia gwiazdy i ekosfery kalibrowane pod widoczność'],
    simulationLimits: ['Tylko szacunki rzędu wielkości, nie precyzyjne wzory astrofizyczne'],
  }),
  scene('lab:multiverse:altstar-2d', 'COMPUTED_MODEL', 'SPECULATIVE_MODEL', {
    modelRefs: ['Szacunki rzędu wielkości z literatury fine-tuningu'],
    speculativeElements: ['Inne wszechświaty i interpretacja wielu światów to hipotezy bez potwierdzenia'],
    simulationLimits: ['Szacunki rzędu wielkości, nie przewidywania'],
  }),
  scene('lab:multiverse:nexus', 'COMPUTED_MODEL', 'SPECULATIVE_MODEL', {
    modelRefs: ['Równania Friedmanna przy skrajnych Ω_Λ (portale do Universe Lab)', 'Szacunki fine-tuningu'],
    speculativeElements: ['Inne wszechświaty są hipotezą'],
    visualizationOnlyElements: ['Sala z portalami: metafora nawigacyjna Genesis, nie hipoteza fizyczna'],
    simulationLimits: ['Portale lokalne to szacunki rzędu wielkości'],
  }),
  scene('lab:multiverse:tesseract', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Obrót 4D i rzut perspektywiczny 4D → 3D (algebra liniowa)'],
    speculativeElements: ['Scena nie twierdzi, że fizyczne dodatkowe wymiary istnieją'],
    visualizationOnlyElements: ['Kolor krawędzi koduje współrzędną w'],
    simulationLimits: ['To geometria, nie model fizyczny'],
  }),

  // ---------------- Civilization Lab ----------------
  scene('lab:civilization:civilization', 'COMPUTED_MODEL', 'SPECULATIVE_MODEL', {
    modelRefs: ['Wzór Sagana na skalę Kardaszewa'],
    speculativeElements: ['Wszystko powyżej dzisiejszej ludzkości (K ≈ 0,73): rój Dysona, cywilizacje galaktyczne'],
    visualizationOnlyElements: ['Etapy planeta/gwiazda/galaktyka nie w prawdziwej skali'],
    simulationLimits: ['Rozkład roju Dysona to ilustracja geometrii, nie projekt inżynieryjny'],
  }),
  scene('lab:civilization:kardashev-2d', 'COMPUTED_MODEL', 'SPECULATIVE_MODEL', {
    modelRefs: ['Skala Kardaszewa, wzór Sagana'],
    speculativeElements: ['Technologie powyżej K ≈ 0,73 są hipotezami'],
    simulationLimits: ['Skala mierzy tylko zużycie energii'],
  }),
  scene('lab:civilization:colonization', 'COMPUTED_MODEL', 'SPECULATIVE_MODEL', {
    modelRefs: ['Model perkolacyjny ekspansji (literatura paradoksu Fermiego)'],
    speculativeElements: ['Motywacje i technologia cywilizacji'],
    simulationLimits: ['Czas ekspansji rzetelny tylko co do rzędu wielkości'],
  }),
  scene('lab:civilization:civilization.drake-consequence', 'COMPUTED_MODEL', 'THOUGHT_EXPERIMENT', {
    modelRefs: [GRAPH, 'Równanie Drake\'a'],
    speculativeElements: ['Czynniki f_l, f_i, f_c i L są praktycznie nieznane'],
    simulationLimits: ['Rama pojęciowa: N zmienia się o wiele rzędów wielkości, to nie przewidywanie'],
  }),

  // ---------------- Biology Lab ----------------
  scene('lab:biology:biology', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    measuredDataRefs: ['Geometria B-DNA: Watson & Crick 1953, Franklin & Gosling 1953, Wang 1979'],
    modelRefs: ['Reguła Wallace\'a dla temperatury topnienia (1979)'],
    visualizationOnlyElements: ['Szerokość przejścia topnienia'],
    simulationLimits: ['Reguła Wallace\'a tylko dla krótkich sekwencji', 'Szerokości rowków pominięte'],
  }),
  scene('lab:biology:membrane-transport-2d', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    measuredDataRefs: ['Stechiometria pompy Na⁺/K⁺ 3:2 na 1 ATP (Skou)'],
    modelRefs: ['Model płynnej mozaiki (Singer & Nicolson 1972)'],
    visualizationOnlyElements: ['Liczby cząstek, tempo dyfuzji i czas cyklu pompy'],
    simulationLimits: ['Brak prawdziwych stężeń molowych i stałych kinetycznych'],
  }),
  scene('lab:biology:protein-folding', 'COMPUTED_MODEL', 'THEORETICAL_MODEL', {
    modelRefs: ['Model HP (Dill 1985; Lau & Dill 1989), Monte Carlo'],
    assumptions: ['Dwa rodzaje aminokwasów, siatka 2D, energia = kontakty H–H'],
    simulationLimits: ['To nie jest przewidywanie struktury prawdziwego białka', 'Monte Carlo może utknąć w minimum lokalnym'],
  }),
  scene('lab:biology:biology.logistic-consequence', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    modelRefs: [GRAPH, 'Wzrost logistyczny dN/dt = rN(1 − N/K)'],
    assumptions: ['Stałe r i K'],
    simulationLimits: ['Brak struktury wiekowej, opóźnień, drapieżnictwa i losowości'],
  }),
  scene('lab:biology:biology.epidemic', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    modelRefs: ['Model przedziałowy SIR/SEIR/SEIRD, RK4 (core/epidemic/sir.ts)'],
    assumptions: ['Mieszanie jednorodne, stała populacja'],
    speculativeElements: ['Patogen abstrakcyjny („Pathogen X”)'],
    visualizationOnlyElements: ['Wyspa pokazuje proporcje przedziałów, nie ludzi'],
    simulationLimits: ['To nie jest prognoza żadnej prawdziwej epidemii'],
  }),
  scene('lab:biology:biology.airport', 'COMPUTED_MODEL', 'THEORETICAL_MODEL', {
    modelRefs: ['Model agentowy (core/epidemic/agents.ts)'],
    speculativeElements: ['Patogen abstrakcyjny („Pathogen X”)'],
    visualizationOnlyElements: ['Agenci nie są prawdziwymi ludźmi, lotnisko nie jest prawdziwe'],
    simulationLimits: ['To nie jest prognoza epidemii ani model realnego lotniska'],
  }),

  // ---------------- Mathematics Lab (custom screen, one id per mode) ----------------
  scene('lab:mathematics:graph', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Pochodna symboliczna', 'Całka numeryczna (Simpson)', 'Pierwiastki: próbkowanie i bisekcja'],
    simulationLimits: ['Nie znajduje pierwiastków parzystej krotności'],
  }),
  scene('lab:mathematics:ode', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['Rozwiązanie numeryczne RK4', 'Pole kierunkowe dy/dx'],
    simulationLimits: ['Rozwiązanie numeryczne, nie symboliczne'],
  }),
  scene('lab:mathematics:surface', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: ['f(x, y) liczone bezpiecznym parserem w każdym wierzchołku'],
    visualizationOnlyElements: ['Wysokość przeskalowana do stałego kadru'],
    simulationLimits: ['Skala pionowa nie jest 1:1 względem osi x i y'],
  }),

  scene('lab:mathematics:mathematics.gaussian-consequence', 'COMPUTED_MODEL', 'ESTABLISHED_SCIENCE', {
    modelRefs: [GRAPH, 'Rozkład normalny: z = (x − μ)/σ, gęstość f(x), erf'],
    simulationLimits: ['erf liczone przybliżeniem numerycznym (błąd < 1,5·10⁻⁷)'],
  }),

  // ---------------- AI Discovery Lab ----------------
  scene('lab:discovery:discovery', 'COMPUTED_MODEL', 'WELL_SUPPORTED_MODEL', {
    modelRefs: ['Deterministyczny silnik narracji liczący wielkości z parametrów symulacji'],
    speculativeElements: ['Odpowiedzi modelu językowego („Zapytaj AI”) są oznaczone osobno i nie są dowodem'],
    visualizationOnlyElements: ['Diagram architektury warstwy AI'],
    simulationLimits: ['Narracja jest tak dobra, jak model laboratorium, z którego liczy'],
  }),
];

const BY_ID: ReadonlyMap<string, SceneManifest> = new Map(MANIFESTS.map((m) => [m.sceneId, m]));

export function allLabSceneManifests(): readonly SceneManifest[] {
  return MANIFESTS;
}

export function getSceneManifest(sceneId: string): SceneManifest | undefined {
  return BY_ID.get(sceneId);
}
