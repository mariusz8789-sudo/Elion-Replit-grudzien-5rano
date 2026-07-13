/**
 * Rejestr Modeli Naukowych (Priorytet 7) + kontrakt wykonania backendowego.
 *
 * Każdy model deklaruje: id, nazwę, domenę, wersję, opis, wejścia (z jednostkami
 * i zakresem ważności), wyjścia (z jednostkami), założenia, zakres ważności,
 * klasyfikację deterministyczną/stochastyczną, proweniencję i zdolność do
 * wykonania na serwerze. Wszystkie liczby liczy WSPÓLNY rdzeń `core.bundle.mjs`
 * (ten sam kod co frontend), więc backend i przeglądarka nie mogą po cichu
 * policzyć innego wzoru.
 *
 * Dwa rodzaje modeli, jeden interfejs `execute(inputs) → { outputs, warnings }`:
 *  - 'graph'    — wykonywalny Graf Modeli (buildera z rdzenia),
 *  - 'function' — czysta funkcja z physics.ts.
 * Oba są deterministyczne. Modele stochastyczne (gdy powstaną) dostaną pole
 * `stochastic: true` i będą honorować `seed`.
 */

import * as core from './core.bundle.mjs';

const SOLAR_MASS_KG = 1.989e30;

/** Buduje model oparty o Graf Modeli. `inputs`/`outputs` mapują na id węzłów. */
function graphModel(meta, build, opts = {}) {
  return {
    ...meta,
    stochastic: false,
    backendExecutable: true,
    kind: 'graph',
    execute(values) {
      const g = build();
      const snapshot = {};
      for (const inp of meta.inputs) snapshot[inp.id] = values[inp.id];
      g.applyParameterSnapshot(snapshot);
      const outputs = {};
      for (const out of meta.outputs) outputs[out.id] = g.getValue(out.id);
      const warnings = opts.warn ? opts.warn(g, values) : [];
      return { outputs, warnings };
    },
  };
}

/** Buduje model oparty o czystą funkcję z physics.ts. */
function functionModel(meta, compute) {
  return {
    ...meta,
    stochastic: false,
    backendExecutable: true,
    kind: 'function',
    execute(values) {
      const r = compute(values);
      return { outputs: r.outputs ?? r, warnings: r.warnings ?? [] };
    },
  };
}

/* ---------------- Definicje modeli (kolejność migracji z dyrektywy) ---------------- */

const MODELS = [
  graphModel(
    {
      id: 'nuclear-semf', name: 'Energia wiązania jądra (SEMF)', domain: 'nuclear', version: '1.0.0',
      description: 'Półempiryczny wzór na masę (Weizsäcker): energia wiązania i energia na nukleon.',
      inputs: [
        { id: 'protonNumber', label: 'Liczba protonów Z', unit: '', min: 1, max: 118, default: 26 },
        { id: 'neutronNumber', label: 'Liczba neutronów N', unit: '', min: 0, max: 180, default: 30 },
      ],
      outputs: [
        { id: 'bindingEnergy', label: 'Energia wiązania B', unit: 'MeV' },
        { id: 'bindingPerNucleon', label: 'Energia na nukleon B/A', unit: 'MeV' },
        { id: 'massNumber', label: 'Liczba masowa A', unit: '' },
      ],
      assumptions: 'Model kroplowy: człony objętościowy, powierzchniowy, kulombowski, asymetrii, parowania. POMIJA efekty powłokowe.',
      validity: 'Najlepszy dla 20 < A < 250. Odchyla ~1% od pomiaru przy Fe/Ni (brak liczb magicznych).',
      provenance: { source: 'core/physics.ts:semfBindingEnergy', formula: 'B = a_V·A − a_S·A^⅔ − a_C·Z(Z−1)/A^⅓ − a_A·(A−2Z)²/A ± δ', honesty: 'simplified' },
    },
    core.buildNuclearModelGraph,
  ),

  graphModel(
    {
      id: 'atom-bohr', name: 'Model Bohra atomu', domain: 'atom', version: '1.0.0',
      description: 'Poziomy energetyczne, promień orbity i energia jonizacji dla atomu wodoropodobnego.',
      inputs: [
        { id: 'atomicNumber', label: 'Liczba atomowa Z', unit: '', min: 1, max: 118, default: 1 },
        { id: 'principalN', label: 'Główna liczba kwantowa n', unit: '', min: 1, max: 10, default: 1 },
      ],
      outputs: [
        { id: 'energyLevelEV', label: 'Energia poziomu E_n', unit: 'eV' },
        { id: 'orbitalRadiusPm', label: 'Promień orbity', unit: 'pm' },
        { id: 'ionizationPhotonEV', label: 'Energia jonizacji', unit: 'eV' },
      ],
      assumptions: 'Model jednoelektronowy (wodoropodobny). Bez struktury subtelnej, ekranowania, efektów relatywistycznych.',
      validity: 'Ścisły dla H i jonów jednoelektronowych (He⁺, Li²⁺…). Dla atomów wieloelektronowych tylko orientacyjny.',
      provenance: { source: 'core/modelGraph/bohrModelGraph.ts', formula: 'E_n = −13.606·Z²/n² eV', honesty: 'simplified' },
    },
    core.buildBohrModelGraph,
  ),

  graphModel(
    {
      id: 'sr-lorentz', name: 'Szczególna teoria względności (Lorentz)', domain: 'spacetime', version: '1.0.0',
      description: 'Czynnik Lorentza, dylatacja czasu i skrócenie długości.',
      inputs: [
        { id: 'velocityFraction', label: 'Prędkość β = v/c', unit: '', min: 0, max: 0.999999, default: 0.8 },
        { id: 'properTimeSeconds', label: 'Czas własny', unit: 's', min: 0, max: 1e9, default: 1 },
        { id: 'restLengthMeters', label: 'Długość spoczynkowa', unit: 'm', min: 0, max: 1e12, default: 1 },
      ],
      outputs: [
        { id: 'lorentzGammaFactor', label: 'Czynnik γ', unit: '' },
        { id: 'dilatedTimeSeconds', label: 'Czas dylatowany', unit: 's' },
        { id: 'contractedLengthMeters', label: 'Długość skrócona', unit: 'm' },
      ],
      assumptions: 'Ruch inercjalny wzdłuż jednej osi, próżnia.',
      validity: 'β < 1 (v < c). Przy β→1 γ→∞.',
      provenance: { source: 'core/physics.ts:lorentzGamma', formula: 'γ = 1/√(1−β²)', honesty: 'exact' },
    },
    core.buildSpecialRelativityGraph,
  ),

  graphModel(
    {
      id: 'universe-kepler', name: 'Orbita keplerowska', domain: 'universe', version: '1.0.0',
      description: 'Okres i prędkość orbitalna z III prawa Keplera (dwa ciała, kołowo).',
      inputs: [
        { id: 'centralMassSolar', label: 'Masa centralna', unit: 'M☉', min: 0.01, max: 1e9, default: 1 },
        { id: 'orbitalRadiusAu', label: 'Promień orbity', unit: 'AU', min: 0.001, max: 1e5, default: 1 },
      ],
      outputs: [
        { id: 'orbitalPeriodYears', label: 'Okres orbitalny', unit: 'yr' },
        { id: 'orbitalSpeedAuPerYear', label: 'Prędkość orbitalna', unit: 'AU/yr' },
        { id: 'relativeTidalStrength', label: 'Względna siła pływowa', unit: '' },
      ],
      assumptions: 'Zagadnienie dwóch ciał, orbita kołowa, masa próbna pomijalna.',
      validity: 'Reżim niereawistyczny; ignoruje perturbacje wielu ciał i relatywistykę.',
      provenance: { source: 'core/modelGraph/orbitalGraph.ts', formula: 'T = √(a³/M) [yr, AU, M☉]', honesty: 'exact' },
    },
    core.buildOrbitalModelGraph,
  ),

  graphModel(
    {
      id: 'universe-atmospheric-escape', name: 'Ucieczka atmosfery (Jeans)', domain: 'universe', version: '1.0.0',
      description: 'Temperatura równowagowa, prędkość ucieczki, prędkość cieplna i parametr Jeansa λ.',
      inputs: [
        { id: 'stellarLuminositySolar', label: 'Jasność gwiazdy', unit: 'L☉', min: 0.01, max: 100, default: 1 },
        { id: 'orbitalDistanceAu', label: 'Odległość orbitalna', unit: 'AU', min: 0.05, max: 30, default: 1 },
        { id: 'planetAlbedo', label: 'Albedo', unit: '', min: 0, max: 0.9, default: 0.3 },
        { id: 'planetMassEarth', label: 'Masa planety', unit: 'M⊕', min: 0.01, max: 300, default: 1 },
        { id: 'planetRadiusEarth', label: 'Promień planety', unit: 'R⊕', min: 0.1, max: 12, default: 1 },
        { id: 'moleculeMassAmu', label: 'Masa cząsteczki gazu', unit: 'u', min: 1, max: 50, default: 18 },
      ],
      outputs: [
        { id: 'equilibriumTempK', label: 'Temperatura równowagowa', unit: 'K' },
        { id: 'escapeVelocityMs', label: 'Prędkość ucieczki', unit: 'm/s' },
        { id: 'thermalVelocityMs', label: 'Prędkość cieplna', unit: 'm/s' },
        { id: 'jeansParameter', label: 'Parametr Jeansa λ', unit: '' },
      ],
      assumptions: 'Ucieczka TERMICZNA (Jeansa). Bez efektu cieplarnianego, ucieczki hydrodynamicznej i wiatru gwiazdowego.',
      validity: 'λ ≥ ~15 → atmosfera utrzymana w skali Gyr. Poniżej — model nie obowiązuje.',
      provenance: { source: 'core/modelGraph/atmosphericEscapeGraph.ts', formula: 'T_eq=278.5·((1−A)L/a²)^¼; v_esc=√(2GM/R); λ=v_esc²/v_th²', honesty: 'simplified' },
    },
    core.buildAtmosphericEscapeGraph,
    {
      warn: (g) => {
        const lambda = g.getValue('jeansParameter');
        return lambda < 15 ? [`Parametr Jeansa λ = ${lambda.toFixed(1)} < 15 — reżim szybkiej ucieczki termicznej; przybliżenie „stabilnej atmosfery" nie obowiązuje.`] : [];
      },
    },
  ),

  graphModel(
    {
      id: 'particle-relativistic-energy', name: 'Energia relatywistyczna cząstki', domain: 'particle', version: '1.0.0',
      description: 'Energia całkowita, kinetyczna i pęd cząstki o zadanej masie spoczynkowej i prędkości.',
      inputs: [
        { id: 'restMassMeV', label: 'Masa spoczynkowa', unit: 'MeV/c²', min: 0, max: 1e6, default: 0.511 },
        { id: 'velocityFraction', label: 'Prędkość β = v/c', unit: '', min: 0, max: 0.999999, default: 0.866 },
      ],
      outputs: [
        { id: 'totalEnergyMeV', label: 'Energia całkowita', unit: 'MeV' },
        { id: 'kineticEnergyMeV', label: 'Energia kinetyczna', unit: 'MeV' },
        { id: 'momentumMeVc', label: 'Pęd', unit: 'MeV/c' },
      ],
      assumptions: 'Cząstka swobodna, próżnia.',
      validity: 'β < 1.',
      provenance: { source: 'core/modelGraph/relativisticEnergyGraph.ts', formula: 'E = γmc², p = γmv', honesty: 'exact' },
    },
    core.buildRelativisticEnergyGraph,
  ),

  graphModel(
    {
      id: 'chemistry-arrhenius', name: 'Kinetyka Arrheniusa', domain: 'chemistry', version: '1.0.0',
      description: 'Stała szybkości reakcji, czas połowicznej przemiany i przyspieszenie względem temperatury pokojowej.',
      inputs: [
        { id: 'temperatureK', label: 'Temperatura', unit: 'K', min: 200, max: 1000, default: 298 },
        { id: 'activationEnergyKJ', label: 'Energia aktywacji Ea', unit: 'kJ/mol', min: 0, max: 300, default: 50 },
      ],
      outputs: [
        { id: 'rateConstant', label: 'Stała szybkości k', unit: '1/s' },
        { id: 'halfLifeFirstOrder', label: 'Czas połowiczny (I rzędu)', unit: 's' },
        { id: 'speedupVsRoom', label: 'Przyspieszenie vs 298 K', unit: '×' },
      ],
      assumptions: 'Równanie Arrheniusa ze stałym czynnikiem przedwykładniczym A. Reakcja I rzędu dla t½.',
      validity: 'Zakres, w którym A i Ea są w przybliżeniu stałe.',
      provenance: { source: 'core/modelGraph/chemistryKineticsGraph.ts', formula: 'k = A·exp(−Ea/RT)', honesty: 'simplified' },
    },
    core.buildChemistryKineticsGraph,
  ),

  graphModel(
    {
      id: 'math-gaussian', name: 'Rozkład normalny', domain: 'mathematics', version: '1.0.0',
      description: 'Z-score, gęstość i prawdopodobieństwo w przedziale ±|z| dla rozkładu N(μ,σ²).',
      inputs: [
        { id: 'mean', label: 'Średnia μ', unit: '', min: -100, max: 100, default: 0 },
        { id: 'sigma', label: 'Odchylenie σ', unit: '', min: 0.001, max: 100, default: 1 },
        { id: 'xValue', label: 'Wartość x', unit: '', min: -100, max: 100, default: 1 },
      ],
      outputs: [
        { id: 'zScore', label: 'Z-score', unit: '' },
        { id: 'pdfValue', label: 'Gęstość f(x)', unit: '' },
        { id: 'probWithinZ', label: 'P(−|z| < Z < |z|)', unit: '' },
      ],
      assumptions: 'Rozkład normalny; erf przez przybliżenie Abramowitza–Steguna.',
      validity: 'σ > 0.',
      provenance: { source: 'core/modelGraph/gaussianGraph.ts', formula: 'f(x)=exp(−½z²)/(σ√2π), P=erf(|z|/√2)', honesty: 'exact' },
    },
    core.buildGaussianGraph,
  ),

  graphModel(
    {
      id: 'biology-logistic', name: 'Wzrost logistyczny', domain: 'biology', version: '1.0.0',
      description: 'Wielkość populacji w czasie t z rozwiązania równania logistycznego.',
      inputs: [
        { id: 'growthRate', label: 'Tempo wzrostu r', unit: '1/czas', min: 0, max: 5, default: 0.5 },
        { id: 'carryingCapacity', label: 'Pojemność środowiska K', unit: 'osobn.', min: 1, max: 1e9, default: 1000 },
        { id: 'initialPopulation', label: 'Populacja początkowa N₀', unit: 'osobn.', min: 1, max: 1e9, default: 10 },
        { id: 'timeElapsed', label: 'Czas t', unit: 'czas', min: 0, max: 1000, default: 10 },
      ],
      outputs: [
        { id: 'populationAtT', label: 'Populacja N(t)', unit: 'osobn.' },
        { id: 'fractionOfCapacity', label: 'Udział pojemności', unit: '' },
      ],
      assumptions: 'Zamknięte rozwiązanie równania logistycznego (stałe r, K). Bez struktury wiekowej, opóźnień, stochastyki.',
      validity: 'N₀ ≤ K, r ≥ 0.',
      provenance: { source: 'core/modelGraph/logisticGrowthGraph.ts', formula: 'N(t)=K/(1+((K−N₀)/N₀)·e^(−rt))', honesty: 'simplified' },
    },
    core.buildLogisticGrowthGraph,
  ),

  functionModel(
    {
      id: 'einstein-schwarzschild', name: 'Promień Schwarzschilda', domain: 'einstein', version: '1.0.0',
      description: 'Promień horyzontu nieobracającej się czarnej dziury o zadanej masie.',
      inputs: [{ id: 'massSolar', label: 'Masa', unit: 'M☉', min: 1e-6, max: 1e12, default: 1 }],
      outputs: [{ id: 'radiusMeters', label: 'Promień Schwarzschilda r_s', unit: 'm' }, { id: 'radiusKm', label: 'r_s', unit: 'km' }],
      assumptions: 'Metryka Schwarzschilda (bez spinu, bez ładunku).',
      validity: 'Masa > 0. Model klasycznej OTW.',
      provenance: { source: 'core/physics.ts:schwarzschildRadius', formula: 'r_s = 2GM/c²', honesty: 'exact' },
    },
    (v) => {
      const rs = core.schwarzschildRadius(v.massSolar * SOLAR_MASS_KG);
      return { outputs: { radiusMeters: rs, radiusKm: rs / 1000 }, warnings: [] };
    },
  ),

  functionModel(
    {
      id: 'einstein-chirp-mass', name: 'Masa chirp układu podwójnego', domain: 'einstein', version: '1.0.0',
      description: 'Masa chirp dwóch obiektów zwartych — kluczowa dla sygnału fal grawitacyjnych.',
      inputs: [
        { id: 'm1Solar', label: 'Masa 1', unit: 'M☉', min: 0.1, max: 1e3, default: 30 },
        { id: 'm2Solar', label: 'Masa 2', unit: 'M☉', min: 0.1, max: 1e3, default: 30 },
      ],
      outputs: [
        { id: 'chirpMassSolar', label: 'Masa chirp ℳ', unit: 'M☉' },
        { id: 'iscoFrequencyHz', label: 'Częstotliwość ISCO', unit: 'Hz' },
      ],
      assumptions: 'Przybliżenie punktowe; ISCO dla Schwarzschilda z masy łącznej.',
      validity: 'Faza inspiralu, przed połączeniem.',
      provenance: { source: 'core/physics.ts:chirpMassSolar,iscoFrequency', formula: 'ℳ = (m₁m₂)^{3/5}/(m₁+m₂)^{1/5}', honesty: 'simplified' },
    },
    (v) => ({
      outputs: {
        chirpMassSolar: core.chirpMassSolar(v.m1Solar, v.m2Solar),
        iscoFrequencyHz: core.iscoFrequency(v.m1Solar + v.m2Solar),
      },
      warnings: [],
    }),
  ),

  {
    ...functionModel(
      {
        id: 'chem-molecular-weight', name: 'Masa molowa ze wzoru', domain: 'chemistry', version: '1.0.0',
        description: 'Masa molowa, liczba atomów i stopień nienasycenia z prostego wzoru sumarycznego (CHNOPS + wybrane pierwiastki).',
        inputs: [{ id: 'formula', label: 'Wzór sumaryczny', unit: '', type: 'string', maxLength: 120, default: 'C9H8O4' }],
        outputs: [
          { id: 'molarMassGmol', label: 'Masa molowa', unit: 'g/mol' },
          { id: 'atomCount', label: 'Liczba atomów', unit: '' },
          { id: 'degreeOfUnsaturation', label: 'Stopień nienasycenia', unit: '' },
        ],
        assumptions: 'Prosty wzór bez nawiasów, hydratów i izotopów. Standardowe masy atomowe (IUPAC 2021).',
        validity: 'Wzory zbudowane z pierwiastków tablicy mas atomowych; DoU ścisły dla CHNOX.',
        provenance: { source: 'core/compute/cheminformatics.ts', formula: 'MW=Σ nᵢ·Aᵢ; DoU=(2C+2+N−H−X)/2', honesty: 'exact' },
      },
      (v) => {
        const p = core.parseFormula(v.formula);
        return {
          outputs: {
            molarMassGmol: core.molecularWeight(p.counts),
            atomCount: core.atomCount(p.counts),
            degreeOfUnsaturation: core.degreeOfUnsaturation(p.counts),
          },
          warnings: [],
        };
      },
    ),
    // Walidacja domenowa: odrzuć niepoprawny wzór (status 'rejected', nie 'error').
    validate: (v) => {
      const p = core.parseFormula(v.formula);
      return p.ok ? { ok: true } : { ok: false, error: 'invalid_formula', message: p.error };
    },
  },

  functionModel(
    {
      id: 'civilization-kardashev', name: 'Moc cywilizacji (skala Kardaszewa)', domain: 'civilization', version: '1.0.0',
      description: 'Moc dostępna cywilizacji dla zadanego typu K w skali Kardaszewa.',
      inputs: [{ id: 'kardashevType', label: 'Typ Kardaszewa K', unit: '', min: 0, max: 3, default: 1 }],
      outputs: [{ id: 'powerWatts', label: 'Moc', unit: 'W' }],
      assumptions: 'Definicja Sagana: K = (log₁₀P − 6)/10.',
      validity: 'Skala ciągła, ekstrapolacja poza obserwacje — interpretacyjna.',
      provenance: { source: 'core/physics.ts:kardashevPower', formula: 'P = 10^{10K+6} W', honesty: 'theoretical' },
    },
    (v) => ({ outputs: { powerWatts: core.kardashevPower(v.kardashevType) }, warnings: [] }),
  ),
];

const BY_ID = new Map(MODELS.map((m) => [m.id, m]));

/** Publiczny opis modelu (bez funkcji execute / pola kind) — do API i rejestru. */
export function modelMetadata(m) {
  const meta = {};
  for (const k of Object.keys(m)) {
    if (k === 'execute' || k === 'kind' || k === 'validate') continue;
    meta[k] = m[k];
  }
  meta.deterministic = m.stochastic !== true;
  return meta;
}

export function listModels() {
  return MODELS.map(modelMetadata);
}

export function getModel(id) {
  return BY_ID.get(id) ?? null;
}
