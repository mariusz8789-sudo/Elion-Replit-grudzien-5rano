import { registerRecipe } from './recipe';

/**
 * Startowy katalog przepisów MVP — każdy wskazuje ISTNIEJĄCY, realny silnik
 * obliczeniowy Genesis (żadnej atrapy animacji). Presety parametrów ustawiane
 * tylko tam, gdzie klucz jest pewny; w pozostałych przypadkach otwieramy
 * eksperyment na jego wartościach domyślnych. Kolejne zjawiska (paradoks
 * dziadka, most Einsteina-Rosena, modele alternatywne) dochodzą jako nowe
 * przepisy — patrz docs/SIMULATION_GENERATOR.md.
 */
export function registerCatalog(): void {
  // ---- Kosmologia / grawitacja (Universe + Einstein) ----
  registerRecipe({
    id: 'orbit-star-mass',
    title: 'Orbita a masa gwiazdy',
    category: 'cosmology',
    aliases: ['orbita', 'masa gwiazdy', 'zwieksz mase gwiazdy', 'okres orbitalny', 'kepler', 'orbit'],
    labId: 'universe',
    experimentId: 'universe.orbital-consequence',
    params: { centralMassSolar: 2, orbitalRadiusAu: 1 },
    honesty: 'exact',
    summary: 'Zmień masę gwiazdy centralnej i promień orbity — okres, prędkość orbitalna i siła pływowa przeliczają się przez wykonywalny graf.',
    equations: ['P² = a³ / M (III prawo Keplera)', 'v = √(GM(2/r − 1/a)) (vis-viva)', 'F_pływowa ∝ M / r³'],
    assumptions: ['Orbita kołowa wokół dominującej masy', 'Brak perturbacji od innych ciał'],
  });
  registerRecipe({
    id: 'star-life',
    title: 'Ewolucja gwiazdy',
    category: 'cosmology',
    aliases: ['ewolucja gwiazdy', 'cykl zycia gwiazdy', 'zycie gwiazdy', 'star life', 'gwiazda'],
    labId: 'universe',
    experimentId: 'starlife',
    honesty: 'simplified',
    summary: 'Ścieżka gwiazdy na diagramie H-R zależnie od masy początkowej — od ciągu głównego do stanu końcowego.',
    assumptions: ['Skalowania z modeli ewolucji gwiazd, nie pełna symulacja wnętrza'],
  });
  registerRecipe({
    id: 'universe-expansion',
    title: 'Ekspansja Wszechświata (napięcie Hubble\'a)',
    category: 'cosmology',
    aliases: ['ekspansja wszechswiata', 'rozszerzanie wszechswiata', 'napiecie hubble', 'hubble', 'stala hubble'],
    labId: 'universe',
    experimentId: 'shoes',
    honesty: 'exact',
    summary: 'Rozbieżność między lokalnym a wczesnym pomiarem stałej Hubble\'a — realne dane, realny konflikt.',
  });
  registerRecipe({
    id: 'black-hole',
    title: 'Czarna dziura',
    category: 'physics',
    aliases: ['czarna dziura', 'czarna dziure', 'czarnej dziury', 'powstawanie czarnej dziury', 'horyzont zdarzen', 'black hole'],
    labId: 'einstein',
    honesty: 'simplified',
    summary: 'Zakrzywienie światła i horyzont zdarzeń wokół masy — scena 3D na parametryzowanej masie.',
    equations: ['r_s = 2GM/c² (promień Schwarzschilda)'],
    assumptions: ['Metryka Schwarzschilda (bez rotacji w tej scenie bazowej)'],
  });
  registerRecipe({
    id: 'gravitational-lensing',
    title: 'Soczewkowanie grawitacyjne',
    category: 'physics',
    aliases: ['soczewkowanie grawitacyjne', 'soczewka grawitacyjna', 'soczewkowanie', 'lensing'],
    labId: 'einstein',
    experimentId: 'lensing',
    honesty: 'simplified',
    summary: 'Ugięcie promieni światła przez masę — pierścienie i łuki Einsteina.',
    equations: ['α = 4GM / (c²b) (kąt ugięcia)'],
  });
  registerRecipe({
    id: 'gravitational-waves',
    title: 'Fale grawitacyjne',
    category: 'physics',
    aliases: ['fale grawitacyjne', 'chirp', 'gravitational waves', 'ligo'],
    labId: 'einstein',
    experimentId: 'chirp',
    honesty: 'simplified',
    summary: 'Sygnał „chirp" ze zlewających się mas — częstotliwość i amplituda rosną do koalescencji.',
  });

  // ---- Relatywistyka (Space-Time) ----
  registerRecipe({
    id: 'time-dilation',
    title: 'Dylatacja czasu',
    category: 'physics',
    aliases: ['dylatacja czasu', 'predkosci bliskiej swiatla', 'spowolnienie czasu', 'time dilation', 'lorentz'],
    labId: 'spacetime',
    experimentId: 'spacetime.c-slider',
    params: { speed: 0.9 },
    honesty: 'exact',
    summary: 'Zegary świetlne w dwóch układach — im bliżej c, tym wolniej płynie czas własny.',
    equations: ['γ = 1/√(1 − v²/c²)', 'Δt = γ · Δτ'],
    assumptions: ['Szczególna teoria względności (płaska czasoprzestrzeń)'],
  });
  registerRecipe({
    id: 'twin-paradox',
    title: 'Paradoks bliźniąt',
    category: 'physics',
    aliases: ['paradoks bliznat', 'blizniat', 'twin paradox', 'bliznieta'],
    labId: 'spacetime',
    experimentId: 'spacetime.sr-consequence',
    honesty: 'exact',
    summary: 'Bliźniak w podróży starzeje się wolniej — asymetria wynika z przyspieszenia przy zawracaniu.',
    equations: ['γ = 1/√(1 − v²/c²)'],
  });

  // ---- Matematyka / chaos (Universe) ----
  registerRecipe({
    id: 'lorenz',
    title: 'Atraktor Lorenza (chaos)',
    category: 'math',
    aliases: ['atraktor lorenza', 'lorenz', 'chaos', 'efekt motyla'],
    labId: 'universe',
    experimentId: 'lorenz',
    honesty: 'exact',
    summary: 'Deterministyczny chaos — dwie prawie identyczne trajektorie wykładniczo się rozjeżdżają.',
    equations: ['ẋ = σ(y−x)', 'ẏ = x(ρ−z)−y', 'ż = xy−βz'],
  });
  registerRecipe({
    id: 'three-body',
    title: 'Problem trzech ciał',
    category: 'math',
    aliases: ['problem trzech cial', 'trzech cial', 'three body', 'trzy ciala'],
    labId: 'universe',
    experimentId: 'threebody',
    honesty: 'exact',
    summary: 'Trzy masy grawitujące — brak rozwiązania analitycznego, ruch całkowany numerycznie.',
    equations: ['a_i = Σ_j G·m_j·(r_j − r_i)/|r_j − r_i|³'],
  });
  registerRecipe({
    id: 'double-pendulum',
    title: 'Podwójne wahadło',
    category: 'math',
    aliases: ['podwojne wahadlo', 'wahadlo', 'double pendulum'],
    labId: 'universe',
    experimentId: 'doublependulum',
    honesty: 'exact',
    summary: 'Kanoniczny układ chaotyczny — wrażliwość na warunki początkowe widoczna gołym okiem.',
    equations: ['θ̇₁ = ω₁, θ̇₂ = ω₂', 'θ̈₁, θ̈₂: równania Lagrange’a dla m₁=m₂=1 kg, L₁=L₂=1 m, g=9,81 m/s²', 'E = T + V; względny dryf energii jest raportowany'],
    assumptions: ['Dwa idealne wahadła w płaszczyźnie', 'm₁=m₂=1 kg, L₁=L₂=1 m', 'Brak tarcia', 'Całkowanie klasycznym RK4; metoda nie jest symplektyczna, więc energia może numerycznie dryfować'],
  });

  // ---- Kwanty (Quantum) ----
  registerRecipe({
    id: 'double-slit',
    title: 'Doświadczenie z dwiema szczelinami',
    category: 'quantum',
    aliases: ['dwie szczeliny', 'double slit', 'interferencja', 'mechanika kwantowa'],
    labId: 'quantum',
    honesty: 'educational',
    summary: 'Interferencja pojedynczych cząstek — obraz prążków buduje się kwant po kwancie.',
  });
  registerRecipe({
    id: 'quantum-tunneling',
    title: 'Tunelowanie kwantowe',
    category: 'quantum',
    aliases: ['tunelowanie kwantowe', 'tunelowanie', 'quantum tunneling', 'bariera potencjalu'],
    labId: 'quantum',
    experimentId: 'tunneling',
    honesty: 'educational',
    summary: 'Pakiet falowy częściowo przenika barierę potencjału — prawdopodobieństwo transmisji zależy od jej wysokości i szerokości.',
    equations: ['i∂ψ/∂t = (−½∂²/∂x² + V(x))ψ (ħ=m=1)', 'T = ∫ za barierą |ψ(x,t)|² dx', 'R = ∫ przed barierą |ψ(x,t)|² dx'],
    assumptions: ['1D split-step Fourier', 'Pakiet Gaussa i bariera prostokątna', 'Jednostki zredukowane ħ=m=1', 'Nie jest to ogólny solver Schrödingera ani model urządzenia'],
  });

  // ---- Kosmologia SETI (Civilization) ----
  registerRecipe({
    id: 'fermi-paradox',
    title: 'Paradoks Fermiego (równanie Drake\'a)',
    category: 'cosmology',
    aliases: ['paradoks fermiego', 'fermi', 'rownanie drake', 'drake', 'seti', 'cywilizacje'],
    labId: 'civilization',
    experimentId: 'civilization.drake-consequence',
    honesty: 'theoretical',
    summary: 'Ile komunikujących się cywilizacji przewiduje równanie Drake\'a — i dlaczego szacunki rozjeżdżają się o rzędy wielkości.',
    equations: ['N = R⋆ · f_p · n_e · f_l · f_i · f_c · L'],
    assumptions: ['Wartości czynników są słabo ograniczone — to model niepewności, nie predykcja'],
  });

  // ---- Chemia ----
  registerRecipe({
    id: 'reaction-kinetics',
    title: 'Kinetyka reakcji',
    category: 'chemistry',
    aliases: ['kinetyka reakcji', 'szybkosc reakcji', 'reaction kinetics', 'stala szybkosci'],
    labId: 'chemistry',
    experimentId: 'chemistry.kinetics-consequence',
    honesty: 'exact',
    summary: 'Jak temperatura i energia aktywacji sterują szybkością reakcji (Arrhenius) — łańcuch konsekwencji.',
    equations: ['k = A · e^(−Ea/RT) (Arrhenius)'],
  });
  // ---- Epidemiologia (DEMO B) ----
  registerRecipe({
    id: 'epidemic-sir',
    title: 'Epidemia na wyspie (SIR/SEIR)',
    category: 'physics',
    aliases: ['epidemia', 'epidemie', 'pandemia', 'sir', 'seir', 'model epidemii', 'zaraza', 'wirus', 'rozprzestrzenianie choroby', 'fikcyjna wyspa'],
    labId: 'biology',
    experimentId: 'biology.epidemic',
    honesty: 'simplified',
    epistemicStatus: 'WELL_SUPPORTED_MODEL',
    summary: 'Model przedziałowy SIR/SEIR/SEIRD na fikcyjnej wyspie — zmień R0, inkubację, śmiertelność i interwencje, obserwuj krzywą i populację.',
    equations: ['dS/dt = −β·S·I/N', 'dI/dt = β·S·I/N − γ·I', 'dR/dt = γ·I', 'R0 = β·D_zakaźności'],
    assumptions: ['Mieszanie jednorodne, stała populacja', 'Bez struktury wiekowej/przestrzennej', 'Patogen abstrakcyjny „Pathogen X" — model, nie prognoza'],
  });
  registerRecipe({
    id: 'epidemic-airport',
    title: 'Epidemia na lotnisku (model agentowy)',
    category: 'physics',
    aliases: [
      'lotnisko', 'lotnisku', 'lotniska', 'na lotnisku',
      'epidemia na lotnisku', 'epidemie na lotnisku',
      'model agentowy', 'agentowy', 'agentowa', 'agentowego', 'symulacja agentowa',
      'agenci', 'agentami', 'agentow', 'agentach', 'agent based', 'individual based',
      'kwarantanna', 'izolacja', 'kontakty', 'terminal', 'tlum', 'w tlumie', 'rozprzestrzenianie w tlumie',
    ],
    labId: 'biology',
    experimentId: 'biology.airport',
    honesty: 'educational',
    epistemicStatus: 'WELL_SUPPORTED_MODEL',
    summary: 'Model AGENTOWY: setki wirtualnych agentów przechodzą przez strefy lotniska, a zakażenie przenosi się przez kontakty (bliskość). Włącz izolację objawowych i porównaj z modelem przedziałowym.',
    equations: ['β = R0/D_zak (jak w modelu przedziałowym)', 'P(zakażenie na kontakt) = 1 − e^(−β·Δt)'],
    assumptions: ['Agenci to wirtualne punkty modelu, NIE realni ludzie', 'Ruch proceduralny przez strefy; kontakt = bliskość', 'Patogen abstrakcyjny „Pathogen X" — symulacja edukacyjna, nie prognoza'],
  });
  registerRecipe({
    id: 'ising-phase',
    title: 'Przejście fazowe (model Isinga)',
    category: 'chemistry',
    aliases: ['przejscie fazowe', 'model isinga', 'ising', 'magnetyzm', 'namagnesowanie'],
    labId: 'chemistry',
    experimentId: 'ising',
    honesty: 'simplified',
    summary: 'Spiny 2D — poniżej temperatury krytycznej pojawia się spontaniczne namagnesowanie.',
    equations: ['T_c ≈ 2.269 J/k_B (rozwiązanie Onsagera, sieć kwadratowa)'],
  });
}
