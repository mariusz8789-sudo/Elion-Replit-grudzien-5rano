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
import { detect as rdkitDetect, descriptors as rdkitDescriptors, validate as rdkitValidate } from './rdkitAdapter.mjs';
import { detect as meepDetect, interfaceTransmission as meepInterfaceTransmission, pecReflection as meepPecReflection } from './meepAdapter.mjs';
import { detect as pyscfDetect, referenceCase as pyscfReferenceCase, singlePoint as pyscfSinglePoint } from './qmAdapter.mjs';
import { detect as depmapDetect, senescenceCellCyclePanel } from './depmapAdapter.mjs';
import { detect as structuralDetect, compare10e8Mper } from './structuralAdapter.mjs';
import { detect as openmmDetect, referenceBenchmark as openmmReferenceBenchmark } from './openmmAdapter.mjs';

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
function functionModel(meta, compute, opts = {}) {
  return {
    ...meta,
    stochastic: false,
    backendExecutable: true,
    kind: 'function',
    ...(typeof opts.validate === 'function' ? { validate: opts.validate } : {}),
    execute(values) {
      const r = compute(values);
      return { outputs: r.outputs ?? r, warnings: r.warnings ?? [], ...(r.provenance ? { provenance: r.provenance } : {}) };
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
      id: 'photon-energy', name: 'Energia fotonu', domain: 'electrodynamics', version: '1.1.0',
      description: 'Dokładne wyprowadzenie energii i częstotliwości pojedynczego fotonu z długości fali oraz konwersja energii na skalę molową.',
      inputs: [{ id: 'wavelengthNm', label: 'Długość fali λ', unit: 'nm', min: 0.001, max: 1e9, default: 500 }],
      outputs: [
        { id: 'photonEnergyEV', label: 'Energia fotonu E', unit: 'eV' },
        { id: 'photonFrequencyTHz', label: 'Częstotliwość f', unit: 'THz' },
        { id: 'photonEnergyKJmol', label: 'Energia fotonu w skali molowej', unit: 'kJ/mol' },
      ],
      assumptions: 'Pojedynczy foton w próżni; długość fali jest parametrem wejściowym. Konwersja eV→kJ/mol jest przeliczeniem jednostek.',
      validity: 'λ > 0. Wynik opisuje energię i częstotliwość, nie absorpcję, przekrój czynny, fluorescencję, emisję, rozkład widmowy, materiał ani rozerwanie konkretnego wiązania.',
      provenance: { source: 'core/modelGraph/photonGraph.ts via compute/core.bundle.mjs', formula: 'E=hc/λ; f=c/λ; E[kJ/mol]=E[eV]·96.485332', honesty: 'exact', engine: 'Genesis photon-energy ModelGraph (shared frontend/backend graph)' },
    },
    core.buildPhotonGraph,
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

  {
    ...functionModel(
      {
        id: 'chem-rdkit-descriptors', name: 'Deskryptory molekularne (RDKit)', domain: 'chemistry', version: '1.0.0',
        description: 'Realne deskryptory ze SMILES przez RDKit: masa, logP (Crippen), HBD/HBA, wiązania obrotowe, pierścienie, TPSA, frakcja Csp3, liczba naruszeń reguły 5 Lipińskiego.',
        inputs: [{ id: 'smiles', label: 'SMILES', unit: '', type: 'string', maxLength: 500, default: 'CC(=O)Oc1ccccc1C(=O)O' }],
        outputs: [
          { id: 'molWt', label: 'Masa molowa', unit: 'g/mol' },
          { id: 'exactMolWt', label: 'Masa dokładna', unit: 'g/mol' },
          { id: 'crippenLogP', label: 'logP (Crippen)', unit: '' },
          { id: 'hbd', label: 'Donory wiązań wodorowych', unit: '' },
          { id: 'hba', label: 'Akceptory wiązań wodorowych', unit: '' },
          { id: 'rotatableBonds', label: 'Wiązania obrotowe', unit: '' },
          { id: 'ringCount', label: 'Liczba pierścieni', unit: '' },
          { id: 'aromaticRings', label: 'Pierścienie aromatyczne', unit: '' },
          { id: 'fractionCsp3', label: 'Frakcja Csp3', unit: '' },
          { id: 'tpsa', label: 'TPSA', unit: 'Å²' },
          { id: 'heavyAtomCount', label: 'Atomy ciężkie', unit: '' },
          { id: 'heteroatomCount', label: 'Heteroatomy', unit: '' },
          { id: 'formalCharge', label: 'Ładunek formalny', unit: '' },
          { id: 'lipinskiViolations', label: 'Naruszenia reguły 5 Lipińskiego', unit: '' },
        ],
        assumptions: 'RDKit (open-source, walidowany). logP metodą wkładów atomowych Crippena; deskryptory topologiczne 2D (bez konformacji 3D).',
        validity: 'Poprawny SMILES ORAZ RDKit dostępny przez skonfigurowany interpreter GENESIS_RDKIT_PYTHON.',
        provenance: { source: 'RDKit via compute/rdkitAdapter.mjs', formula: 'RDKit Descriptors / Lipinski / Crippen', honesty: 'real_external_engine', engine: 'RDKit runtime (version reported per run)', requiredEnvironmentVariable: 'GENESIS_RDKIT_PYTHON' },
      },
      (v) => {
        const r = rdkitDescriptors(v.smiles);
        if (!r.ok) throw new Error(r.error + (r.reason ? `: ${r.reason}` : ''));
        const d = r.data;
        return {
          outputs: {
            molWt: d.molWt, exactMolWt: d.exactMolWt, crippenLogP: d.crippenLogP, hbd: d.hbd, hba: d.hba,
            rotatableBonds: d.rotatableBonds, ringCount: d.ringCount, aromaticRings: d.aromaticRings,
            fractionCsp3: d.fractionCsp3, tpsa: d.tpsa, heavyAtomCount: d.heavyAtomCount,
            heteroatomCount: d.heteroatomCount, formalCharge: d.formalCharge, lipinskiViolations: d.lipinskiViolations,
            canonicalSmiles: d.canonicalSmiles, molecularFormula: d.molecularFormula,
          },
          warnings: [],
          provenance: { engine: r.engine, requiredEnvironmentVariable: 'GENESIS_RDKIT_PYTHON' },
        };
      },
    ),
    // Walidacja: RDKit obecny + poprawny SMILES. Bez RDKit → 'rejected' z jawną przyczyną (nie fałszywy wynik).
    validate: (v) => {
      const det = rdkitDetect();
      if (!det.available) return { ok: false, error: 'capability_unavailable', message: `RDKit niedostępny (${det.reason}). Skonfiguruj GENESIS_RDKIT_PYTHON do zwalidowanego interpretera RDKit.` };
      const val = rdkitValidate(v.smiles);
      return val.ok ? { ok: true } : { ok: false, error: 'invalid_smiles', message: 'Nieprawidłowy SMILES.' };
    },
  },

  functionModel(
    {
      id: 'nuclear-tokamak-lawson', name: 'Kryterium Lawsona D–T (0D)', domain: 'nuclear', version: '1.1.0',
      description: 'Ograniczony, deterministyczny iloraz n·T·τ_E względem jawnego progu Lawsona 3×10²¹ keV·s/m³ dla scenariusza D–T.',
      inputs: [
        { id: 'densityExponent', label: 'log₁₀ gęstości n', type: 'number', unit: '', min: 19, max: 21.5, default: 20 },
        { id: 'temperatureKeV', label: 'Temperatura', type: 'number', unit: 'keV', min: 2, max: 40, default: 15 },
        { id: 'confinementSeconds', label: 'Czas utrzymania energii τ_E', type: 'number', unit: 's', min: 0.1, max: 8, default: 1.5 },
      ],
      outputs: [
        { id: 'densityExponent', label: 'log₁₀ n', unit: '' }, { id: 'densityPerM3', label: 'Gęstość n', unit: 'm⁻³' },
        { id: 'temperatureKeV', label: 'Temperatura T', unit: 'keV' }, { id: 'confinementSeconds', label: 'τ_E', unit: 's' },
        { id: 'tripleProduct', label: 'n·T·τ_E', unit: 'keV·s/m³' }, { id: 'lawsonThreshold', label: 'Próg Lawsona', unit: 'keV·s/m³' },
        { id: 'lawsonRatio', label: 'Iloraz wobec progu', unit: '' }, { id: 'ignitionCriterionMet', label: 'Kryterium zapłonu spełnione', unit: '' },
      ],
      assumptions: 'Jednorodny, 0D scenariusz D–T z ustalonym progiem n·T·τ_E = 3×10²¹ keV·s/m³.',
      validity: 'Tylko zadany zakres n, T i τ_E. Wynik nie obejmuje MHD, transportu, profili plazmy, strat promienistych, geometrii, bilansu mocy, niestabilności, materiałów, technologii magnesów ani predykcji ITER/NIF czy innego reaktora.',
      provenance: {
        source: 'labs/experiments/nuclear-tokamak.ts via compute/core.bundle.mjs',
        formula: 'n·T·τ_E / (3×10²¹ keV·s/m³)',
        honesty: 'bounded_0d_lawson_criterion',
        engine: 'Genesis D–T Lawson 0D criterion (shared frontend/backend runner)',
      },
    },
    (v) => {
      const result = core.runTokamakLawsonScenario({ densityExponent: v.densityExponent, temperatureKeV: v.temperatureKeV, confinementSeconds: v.confinementSeconds });
      return {
        outputs: result,
        warnings: ['Przekroczenie progu w tym modelu 0D oznacza wyłącznie spełnienie zadanego kryterium n·T·τ_E; nie dowodzi zapłonu, zysku energetycznego ani wykonalności reaktora.'],
      };
    },
  ),

  functionModel(
    {
      id: 'quantum-chsh-correlation', name: 'Korelacja singletu i nierówność CHSH', domain: 'quantum', version: '1.1.0',
      description: 'Dokładne, analityczne korelacje singletu E(a,b)=−cos(a−b) oraz wartość CHSH dla czterech ustawień kątowych.',
      inputs: [
        { id: 'a', label: 'Kąt Alicji a', type: 'number', unit: 'deg', min: 0, max: 180, default: 0 },
        { id: 'aP', label: 'Kąt Alicji a′', type: 'number', unit: 'deg', min: 0, max: 180, default: 90 },
        { id: 'b', label: 'Kąt Boba b', type: 'number', unit: 'deg', min: 0, max: 180, default: 45 },
        { id: 'bP', label: 'Kąt Boba b′', type: 'number', unit: 'deg', min: 0, max: 180, default: 135 },
      ],
      outputs: [
        { id: 'eAB', label: 'E(a,b)', unit: '' }, { id: 'eABP', label: 'E(a,b′)', unit: '' },
        { id: 'eAPB', label: 'E(a′,b)', unit: '' }, { id: 'eAPBP', label: 'E(a′,b′)', unit: '' },
        { id: 's', label: 'S CHSH', unit: '' }, { id: 'absS', label: '|S|', unit: '' },
        { id: 'tsirelsonBound', label: 'Granica Tsirelsona', unit: '' },
      ],
      assumptions: 'Idealny stan singletowy dwóch kubitów, idealne ustawienia pomiarowe i reguła korelacji E(a,b)=−cos(a−b).',
      validity: 'Kąty 0–180°. Wynik jest analityczną predykcją mechaniki kwantowej; nie obejmuje próbki par, detektorów, wydajności detekcji, przypadkowości pojedynczych pomiarów, luk lokalności/detekcji ani transmisji informacji.',
      provenance: {
        source: 'labs/experiments/quantum-chsh.ts via compute/core.bundle.mjs',
        formula: 'E(a,b)=−cos(a−b); S=E(a,b)−E(a,b′)+E(a′,b)+E(a′,b′)',
        honesty: 'exact_ideal_singlet_correlation',
        engine: 'Genesis analytical singlet CHSH correlation (shared frontend/backend runner)',
      },
    },
    (v) => {
      const result = core.runChshCorrelationScenario({ a: v.a, aP: v.aP, b: v.b, bP: v.bP });
      return {
        outputs: { eAB: result.eAB, eABP: result.eABP, eAPB: result.eAPB, eAPBP: result.eAPBP, s: result.s, absS: result.absS, tsirelsonBound: result.tsirelsonBound },
        warnings: ['To dokładna predykcja idealnego singletu, nie wynik eksperymentu detektorowego ani test Bella bez luk. Splątanie nie przesyła informacji.'],
      };
    },
  ),

  functionModel(
    {
      id: 'quantum-kitaev-bulk', name: 'Bulk łańcucha Kitaeva p-wave', domain: 'quantum', version: '1.1.0',
      description: 'Analityczne minimum dodatniej gałęzi pasma BdG translacyjnie niezmiennego, spinless łańcucha Kitaeva p-wave; klasyfikuje jedynie reżim bulk względem |μ|=2|t|.',
      inputs: [
        { id: 'chemicalPotential', label: 'Potencjał chemiczny μ', type: 'number', unit: 'jedn. energii', min: -10, max: 10, default: 0 },
        { id: 'hopping', label: 'Hopping t', type: 'number', unit: 'jedn. energii', min: 0.001, max: 10, default: 1 },
        { id: 'pairing', label: 'Pairing p-wave Δ', type: 'number', unit: 'jedn. energii', min: 0.001, max: 10, default: 1 },
      ],
      outputs: [
        { id: 'bulkGap', label: 'Luka bulk', unit: 'jedn. energii' },
        { id: 'momentumAtGap', label: 'Pęd przy minimum luki', unit: 'rad' },
        { id: 'topologicalInvariant', label: 'Niezmiennik topologiczny bulk', unit: '' },
        { id: 'phase', label: 'Klasyfikacja reżimu bulk', unit: '' },
        { id: 'criticalChemicalPotentialNegative', label: 'Krytyczne μ−', unit: 'jedn. energii' },
        { id: 'criticalChemicalPotentialPositive', label: 'Krytyczne μ+', unit: 'jedn. energii' },
      ],
      assumptions: 'Nieskończony, translacyjnie niezmienny, bezspinowy łańcuch p-wave z idealną parą BdG. Minimum E(k)² jest liczone analitycznie dla cos(k)∈[−1,1].',
      validity: 't ≠ 0, Δ ≠ 0 i parametry w zadanym zakresie. Wynik klasyfikuje wyłącznie bulk model; nie symuluje skończonego przewodu, stanów brzegowych, materiału, nanodrutu, urządzenia Majorana 1, pomiaru ani hardware.',
      provenance: {
        source: 'core/compute/kitaevBulk.ts via compute/core.bundle.mjs',
        formula: 'E(k)² = (−2t cos k − μ)² + 4Δ² sin²k; bulk phase boundary |μ|=2|t|',
        honesty: 'exact_bounded_analytic_bulk_model',
        engine: 'Genesis Kitaev bulk BdG analytical minimizer (shared frontend/backend runner)',
      },
    },
    (v) => {
      const result = core.solveKitaevBulk({ chemicalPotential: v.chemicalPotential, hopping: v.hopping, pairing: v.pairing });
      return {
        outputs: {
          bulkGap: result.bulkGap, momentumAtGap: result.momentumAtGap, topologicalInvariant: result.topologicalInvariant,
          phase: result.phase, criticalChemicalPotentialNegative: result.criticalChemicalPotentialNegative,
          criticalChemicalPotentialPositive: result.criticalChemicalPotentialPositive,
        },
        warnings: [result.finiteSizeCaveat],
      };
    },
  ),

  functionModel(
    {
      id: 'quantum-bloch-circuit', name: 'Obwód jednokubitowy i sfera Blocha', domain: 'quantum', version: '1.1.0',
      description: 'Dokładna, deterministyczna ewolucja pojedynczego kubitu od |0⟩ przez sekwencję bramek H, X, Y, Z, S i T; wykonuje wspólny runner macierzy unitarnej używany przez wizualizację sfery Blocha.',
      inputs: [{ id: 'circuit', label: 'Sekwencja bramek jednokubitowych', type: 'string', unit: '', maxLength: 128, default: 'H X' }],
      outputs: [
        { id: 'gates', label: 'Zastosowane bramki', unit: '' },
        { id: 'finalAmplitude0Re', label: 'Re amplitudy |0⟩', unit: '' },
        { id: 'finalAmplitude0Im', label: 'Im amplitudy |0⟩', unit: '' },
        { id: 'finalAmplitude1Re', label: 'Re amplitudy |1⟩', unit: '' },
        { id: 'finalAmplitude1Im', label: 'Im amplitudy |1⟩', unit: '' },
        { id: 'probability0', label: 'P(|0⟩)', unit: '' },
        { id: 'probability1', label: 'P(|1⟩)', unit: '' },
        { id: 'blochX', label: 'Składowa Blocha x', unit: '' },
        { id: 'blochY', label: 'Składowa Blocha y', unit: '' },
        { id: 'blochZ', label: 'Składowa Blocha z', unit: '' },
        { id: 'normSquared', label: 'Norma² stanu', unit: '' },
      ],
      assumptions: 'Stan początkowy |0⟩ i idealne bramki jednokubitowe H, X, Y, Z, S, T. Wynik zawiera amplitudy i Bornowskie prawdopodobieństwa, lecz nie losuje wyniku pomiaru.',
      validity: 'Od 1 do 32 bramek z dozwolonego alfabetu. Nie obejmuje splątania, CNOT, szumu, dekoherencji, sprzętu kwantowego, detektorów ani transmisji informacji.',
      provenance: {
        source: 'labs/experiments/quantum-bloch.ts via compute/core.bundle.mjs',
        formula: '|ψ_final⟩ = U_n · … · U_2 · U_1 · |0⟩; exact 2×2 complex unitary matrices',
        honesty: 'exact_ideal_single_qubit_state_vector',
        engine: 'Genesis single-qubit unitary state-vector (shared Canvas/backend runner)',
      },
    },
    (v) => {
      const scenario = core.runBlochCircuitScenario({ circuit: v.circuit });
      return {
        outputs: {
          gates: scenario.gates.join(' '),
          finalAmplitude0Re: scenario.finalAmplitude0[0], finalAmplitude0Im: scenario.finalAmplitude0[1],
          finalAmplitude1Re: scenario.finalAmplitude1[0], finalAmplitude1Im: scenario.finalAmplitude1[1],
          probability0: scenario.probability0, probability1: scenario.probability1,
          blochX: scenario.bloch[0], blochY: scenario.bloch[1], blochZ: scenario.bloch[2],
          normSquared: scenario.normSquared,
        },
        warnings: ['Prawdopodobieństwa wynikają z reguły Borna dla idealnego wektora stanu. Fabric nie losuje pojedynczego wyniku pomiaru ani nie wykonuje obwodu na hardware.'],
      };
    },
    {
      validate(values) {
        try {
          core.parseSingleQubitCircuit(values.circuit);
          return { ok: true };
        } catch (error) {
          return { ok: false, error: 'invalid_circuit', message: error instanceof Error ? error.message : 'Nieprawidłowy obwód jednokubitowy.' };
        }
      },
    },
  ),

  functionModel(
    {
      id: 'quantum-tunneling-1d', name: 'Tunelowanie pakietu falowego 1D', domain: 'quantum', version: '1.0.0',
      description: 'Rzeczywista numeryczna ewolucja pakietu Gaussa przez pojedynczą barierę prostokątną, liczona współdzielonym integratorem split-step Fourier.',
      inputs: [
        { id: 'energy', label: 'Energia pakietu / wysokość bariery', type: 'number', unit: '', min: 0.2, max: 1.6, default: 0.55 },
        { id: 'barrier', label: 'Wysokość bariery', type: 'number', unit: 'j. nat.', min: 0.4, max: 2.5, default: 1 },
        { id: 'width', label: 'Szerokość bariery', type: 'number', unit: 'j. nat.', min: 1, max: 8, default: 3 },
      ],
      outputs: [
        { id: 'energy', label: 'Energia pakietu / wysokość bariery', unit: '' },
        { id: 'barrier', label: 'Wysokość bariery', unit: 'j. nat.' },
        { id: 'width', label: 'Szerokość bariery', unit: 'j. nat.' },
        { id: 'frames', label: 'Kroki scenariusza', unit: 'kroki' },
        { id: 'transmission', label: 'Prawdopodobieństwo transmisji', unit: '' },
        { id: 'reflection', label: 'Prawdopodobieństwo odbicia', unit: '' },
        { id: 'remainingProbability', label: 'Pozostałe prawdopodobieństwo', unit: '' },
      ],
      assumptions: 'Jednowymiarowy pakiet Gaussa i jedna bariera prostokątna; ħ=m=1; siatka 512 punktów; horyzont 1200 kroków po 0,02; tłumiąca maska przy brzegach.',
      validity: 'Tylko ustalony scenariusz 1D i zakresy wejść. Nie jest ogólnym solverem Schrödingera, obliczeniem 2D/3D, modelem materiałowym, eksperymentem detektorowym ani predykcją urządzenia.',
      provenance: {
        source: 'core/quantum/tunnelingRunner.ts via compute/core.bundle.mjs',
        formula: 'ψ(t+dt)=V½·F⁻¹[K·F[V½·ψ]]; split-step Fourier, ħ=m=1',
        honesty: 'real_shared_numerical_engine',
        engine: 'Genesis split-step Fourier 1D (shared Canvas/backend runner)',
      },
    },
    (v) => {
      const result = core.runTunnelingScenario({ energy: v.energy, barrier: v.barrier, width: v.width });
      return {
        outputs: result,
        warnings: ['Maska pochłaniająca przy brzegach redukuje numeryczne odbicia. Pozostałe prawdopodobieństwo obejmuje falę w barierze i absorpcję brzegu.'],
      };
    },
  ),

  functionModel(
    {
      id: 'quantum-teleportation', name: 'Teleportacja kwantowa trzech kubitów', domain: 'quantum', version: '1.0.0',
      description: 'Dokładny protokół teleportacji dla jednego z sześciu znormalizowanych stanów wejściowych, wykonywany pełnym wektorem stanu trzech kubitów i enumerujący wszystkie cztery gałęzie pomiaru.',
      inputs: [{ id: 'state', label: 'Stan wejściowy', type: 'string', unit: '', maxLength: 10, default: 'plus' }],
      outputs: [
        { id: 'state', label: 'Preset stanu', unit: '' },
        { id: 'stateLabel', label: 'Opis stanu', unit: '' },
        { id: 'branchCount', label: 'Liczba gałęzi pomiaru', unit: '' },
        { id: 'minFidelity', label: 'Minimalna wierność gałęzi', unit: '' },
        { id: 'averageFidelity', label: 'Średnia wierność gałęzi', unit: '' },
        { id: 'allRecovered', label: 'Wszystkie gałęzie odtworzone', unit: '' },
        { id: 'branch00Correction', label: 'Korekta dla m₀=0,m₁=0', unit: '' },
        { id: 'branch01Correction', label: 'Korekta dla m₀=0,m₁=1', unit: '' },
        { id: 'branch10Correction', label: 'Korekta dla m₀=1,m₁=0', unit: '' },
        { id: 'branch11Correction', label: 'Korekta dla m₀=1,m₁=1', unit: '' },
        { id: 'branch00Fidelity', label: 'Wierność dla m₀=0,m₁=0', unit: '' },
        { id: 'branch01Fidelity', label: 'Wierność dla m₀=0,m₁=1', unit: '' },
        { id: 'branch10Fidelity', label: 'Wierność dla m₀=1,m₁=0', unit: '' },
        { id: 'branch11Fidelity', label: 'Wierność dla m₀=1,m₁=1', unit: '' },
      ],
      assumptions: 'Idealny stan czysty trzech kubitów, bramki H/CNOT oraz idealny pomiar projektorowy; wszystkie cztery gałęzie są enumerowane deterministycznie.',
      validity: 'Dowodzi własności idealnego protokołu dla wymienionych presetów. Nie symuluje hardware, szumu, dekoherencji, strat kanału, odczytu detektora, komunikacji sieciowej, teleportacji materii ani transmisji nadświetlnej.',
      provenance: {
        source: 'core/quantum/teleportationRunner.ts → core/quantumState.ts via compute/core.bundle.mjs',
        formula: 'Bell pair + CNOT + H + two projective measurements + conditional I/X/Z/XZ; full 2³ complex state vector',
        honesty: 'exact_ideal_state_vector_protocol',
        engine: 'Genesis three-qubit state-vector teleportation (shared Canvas/backend runner)',
      },
    },
    (v) => {
      const scenario = core.runQuantumTeleportScenario({ state: v.state });
      const outputs = {
        state: scenario.state,
        stateLabel: scenario.stateLabel,
        branchCount: scenario.branchCount,
        minFidelity: scenario.minFidelity,
        averageFidelity: scenario.averageFidelity,
        allRecovered: scenario.allRecovered,
      };
      for (const branch of scenario.branches) {
        const suffix = `${branch.outcome0}${branch.outcome1}`;
        outputs[`branch${suffix}Correction`] = branch.correction;
        outputs[`branch${suffix}Fidelity`] = branch.fidelity;
      }
      return {
        outputs,
        warnings: ['Wierność równa 1 wynika z idealnego protokołu stanu-wektora. Nie jest to wynik hardware ani kanału fizycznego. Do odzyskania stanu Bob potrzebuje dwóch klasycznych bitów od Alicji.'],
      };
    },
    {
      validate(values) {
        return ['zero', 'one', 'plus', 'minus', 'plusI', 'minusI'].includes(values.state)
          ? { ok: true }
          : { ok: false, error: 'invalid_input', message: 'Nieznany preset stanu teleportacji.' };
      },
    },
  ),

  {
    ...functionModel(
      {
        id: 'quantum-chemistry-pyscf-h2-rhf', name: 'H₂ RHF/STO-3G (PySCF)', domain: 'quantum-chemistry', version: '1.0.0',
        description: 'Rzeczywiste obliczenie single-point Hartreego–Focka dla neutralnego H₂ w zadanej odległości między jądrami przez PySCF.',
        inputs: [{ id: 'bondLengthAngstrom', label: 'Długość wiązania H–H', type: 'number', unit: 'Å', min: 0.5, max: 3, default: 0.74 }],
        outputs: [
          { id: 'energyHartree', label: 'Energia całkowita RHF', unit: 'Hartree' },
          { id: 'homoHartree', label: 'Orbital HOMO', unit: 'Hartree' },
          { id: 'lumoHartree', label: 'Orbital LUMO', unit: 'Hartree' },
          { id: 'homoLumoGapHartree', label: 'Luka HOMO–LUMO', unit: 'Hartree' },
          { id: 'homoLumoGapEv', label: 'Luka HOMO–LUMO', unit: 'eV' },
          { id: 'dipoleDebye', label: 'Moment dipolowy', unit: 'D' },
          { id: 'nElectrons', label: 'Liczba elektronów', unit: '' },
          { id: 'nBasisFunctions', label: 'Liczba funkcji bazowych', unit: '' },
        ],
        assumptions: 'Neutralny H₂, singlet, geometria liniowa H(0,0,0)–H(0,0,R), metoda restricted Hartree–Fock i minimalna baza STO-3G. Jest to obliczenie modelowe single-point, nie pomiar ani predykcja własności biologicznej, klinicznej lub materiałowej.',
        validity: 'Wyłącznie H₂ w przedziale 0,5–3,0 Å oraz dostępny interpreter PySCF wskazany przez GENESIS_PYSCF_PYTHON. Nie jest to skan pełnej powierzchni energii, optymalizacja geometrii, chemia wielocząsteczkowa ani wynik wysokiego poziomu ab initio.',
        provenance: {
          source: 'compute/qm_worker.py via compute/qmAdapter.mjs',
          formula: 'PySCF RHF single-point; H₂ singlet; STO-3G; R = bondLengthAngstrom',
          honesty: 'real_external_engine',
          engine: 'PySCF runtime (version reported per run)',
          requiredEnvironmentVariable: 'GENESIS_PYSCF_PYTHON',
        },
      },
      (v) => {
        const result = pyscfSinglePoint({
          atoms: [
            { element: 'H', x: 0, y: 0, z: 0 },
            { element: 'H', x: 0, y: 0, z: v.bondLengthAngstrom },
          ],
          charge: 0,
          spin: 0,
          basis: 'sto-3g',
          method: 'RHF',
        });
        if (!result.ok) throw new Error(result.error + (result.reason ? `: ${result.reason}` : ''));
        const d = result.data;
        return {
          outputs: {
            energyHartree: d.energyHartree,
            homoHartree: d.homoHartree,
            lumoHartree: d.lumoHartree,
            homoLumoGapHartree: d.homoLumoGapHartree,
            homoLumoGapEv: d.homoLumoGapEv,
            dipoleDebye: d.dipoleDebye,
            nElectrons: d.nElectrons,
            nBasisFunctions: d.nBasisFunctions,
          },
          warnings: [
            `${result.meta.engine}; ${result.meta.method}/${result.meta.basis}; neutralny H₂ singlet.`,
            'Wynik jest ograniczonym obliczeniem modelowym H₂ i nie stanowi potwierdzenia eksperymentalnego ani predykcji zastosowania chemicznego.',
          ],
          provenance: {
            engine: result.meta.engine,
            method: result.meta.method,
            basis: result.meta.basis,
            charge: String(result.meta.charge),
            multiplicity: String(result.meta.multiplicity),
            requiredEnvironmentVariable: 'GENESIS_PYSCF_PYTHON',
          },
        };
      },
    ),
    validate: () => {
      const runtime = pyscfDetect();
      if (!runtime.available) return { ok: false, error: 'capability_unavailable', message: `PySCF niedostępny (${runtime.reason}). Skonfiguruj GENESIS_PYSCF_PYTHON do zwalidowanego interpretera PySCF.` };
      const reference = pyscfReferenceCase();
      return reference.ok && reference.pass
        ? { ok: true }
        : { ok: false, error: 'reference_validation_failed', message: `PySCF nie przeszedł przypadku referencyjnego H₂ RHF/STO-3G (${reference.reason ?? reference.error ?? 'unknown'}).` };
    },
  },

  {
    id: 'electrodynamics-maxwell-fdtd',
    name: 'Transmisja fali elektromagnetycznej FDTD (PyMeep)',
    domain: 'electrodynamics',
    version: '1.0.0',
    description: 'Rzeczywista symulacja Maxwell/FDTD normalnego padania na bezstratną, płaską granicę dwóch dielektryków przez PyMeep.',
    inputs: [
      { id: 'n1', label: 'Współczynnik załamania ośrodka 1', unit: '', min: 1, max: 4, default: 1 },
      { id: 'n2', label: 'Współczynnik załamania ośrodka 2', unit: '', min: 1, max: 4, default: 2 },
      { id: 'frequency', label: 'Częstotliwość Meep', unit: 'c / jednostka długości', min: 0.2, max: 2, default: 1 },
      { id: 'resolution', label: 'Rozdzielczość FDTD', unit: 'piksele / jednostka długości', min: 40, max: 160, default: 80 },
    ],
    outputs: [
      { id: 'computedTransmittance', label: 'Transmitancja mocy FDTD T', unit: '' },
      { id: 'computedReflectance', label: 'Reflektancja mocy FDTD R', unit: '' },
      { id: 'analyticTransmittance', label: 'Transmitancja Fresnela T', unit: '' },
      { id: 'analyticReflectance', label: 'Reflektancja Fresnela R', unit: '' },
      { id: 'transmittanceAbsoluteError', label: 'Błąd bezwzględny T', unit: '' },
      { id: 'reflectanceAbsoluteError', label: 'Błąd bezwzględny R', unit: '' },
      { id: 'energyClosure', label: 'Domknięcie energii R+T', unit: '' },
      { id: 'incidentFlux', label: 'Strumień fali padającej', unit: 'jednostki Meep' },
      { id: 'reflectedFlux', label: 'Strumień fali odbitej', unit: 'jednostki Meep' },
    ],
    assumptions: 'Dwa jednorodne, bezstratne i niedyspersyjne dielektryki; płaska granica, normalne padanie, 1D oraz polaryzacja Ex. Transmisja jest liczona jako 1−R tylko dlatego, że ośrodki są jawnie zadane jako bezstratne.',
    validity: 'Wyłącznie 1D planarnej granicy dielektrycznej w zakresie 1≤n₁,n₂≤4, częstotliwości Meep 0,2–2 i rozdzielczości 40–160. Nie jest to symulacja 2D/3D, materiałów dyspersyjnych, metamateriałów, ekranowania okrętu ani teleportacji.',
    provenance: {
      source: 'compute/meep_worker.py via compute/meepAdapter.mjs',
      formula: 'Maxwell FDTD + reflected-flux incident-field subtraction; analytical check T=4n₁n₂/(n₁+n₂)²',
      honesty: 'real_external_engine',
      engine: 'PyMeep',
      requiredEnvironmentVariable: 'GENESIS_MEEP_PYTHON',
    },
    stochastic: false,
    backendExecutable: true,
    kind: 'external-engine',
    validate() {
      const runtime = meepDetect();
      return runtime.available
        ? { ok: true }
        : { ok: false, error: 'capability_unavailable', message: `PyMeep niedostępny (${runtime.reason}). Skonfiguruj GENESIS_MEEP_PYTHON do zwalidowanego interpretera PyMeep.` };
    },
    execute(values) {
      const result = meepInterfaceTransmission(values);
      if (!result.ok) throw new Error(result.error + (result.reason ? `: ${result.reason}` : ''));
      const data = result.data;
      return {
        outputs: {
          computedTransmittance: data.computedTransmittance,
          computedReflectance: data.computedReflectance,
          analyticTransmittance: data.analyticTransmittance,
          analyticReflectance: data.analyticReflectance,
          transmittanceAbsoluteError: data.transmittanceAbsoluteError,
          reflectanceAbsoluteError: data.reflectanceAbsoluteError,
          energyClosure: data.energyClosure,
          incidentFlux: data.incidentFlux,
          reflectedFlux: data.reflectedFlux,
        },
        warnings: [
          `PyMeep ${result.version}; ${result.meta.measurement}.`,
          'Wynik dotyczy wyłącznie zadanej granicy dielektrycznej. Nie jest modelem niewidzialności, teleportacji ani legendy Filadelfii.',
        ],
      };
    },
  },

  {
    id: 'electrodynamics-maxwell-fdtd-pec-reflection',
    name: 'Maxwell FDTD — odbicie od idealnego przewodnika (PyMeep)',
    domain: 'electrodynamics',
    version: '1.0.0',
    description: 'Rzeczywisty benchmark PyMeep FDTD: impuls Ex pada normalnie na półprzestrzeń idealnego przewodnika PEC, z PML oraz odejmowaniem pola padającego.',
    inputs: [
      { id: 'frequency', label: 'Częstotliwość Meep', unit: 'c / jednostka długości', min: 0.2, max: 2, default: 1 },
      { id: 'resolution', label: 'Rozdzielczość FDTD', unit: 'piksele / jednostka długości', min: 40, max: 160, default: 80 },
    ],
    outputs: [
      { id: 'computedReflectance', label: 'Reflektancja mocy FDTD R', unit: '' },
      { id: 'expectedReflectance', label: 'Oczekiwana reflektancja PEC', unit: '' },
      { id: 'reflectanceAbsoluteError', label: 'Błąd bezwzględny R', unit: '' },
      { id: 'incidentFlux', label: 'Strumień fali padającej', unit: 'jednostki Meep' },
      { id: 'reflectedFlux', label: 'Strumień fali odbitej', unit: 'jednostki Meep' },
      { id: 'peakAbsExAtSample', label: 'Szczyt |Ex| w próbce', unit: 'jednostki Meep' },
      { id: 'peakAbsHyAtSample', label: 'Szczyt |Hy| w próbce', unit: 'jednostki Meep' },
    ],
    assumptions: '1D, normalne padanie impulsu Ex na półprzestrzeń idealnego przewodnika `mp.metal` dla z>0; PML; punkt próbki pola z<0.',
    validity: 'Tylko idealny przewodnik PEC w 1D i zadane zakresy wejść. Nie modeluje przewodności skończonej, dyspersji metalu, 2D/3D obiektu, geometrii okrętu, ekranowania ani teleportacji.',
    provenance: { source: 'compute/meep_worker.py via compute/meepAdapter.mjs', formula: 'Maxwell FDTD + reflected-flux incident-field subtraction; PEC reference R=1', honesty: 'real_external_engine', engine: 'PyMeep', requiredEnvironmentVariable: 'GENESIS_MEEP_PYTHON' },
    stochastic: false,
    backendExecutable: true,
    kind: 'external-engine',
    validate() {
      const runtime = meepDetect();
      return runtime.available
        ? { ok: true }
        : { ok: false, error: 'capability_unavailable', message: `PyMeep niedostępny (${runtime.reason}). Skonfiguruj GENESIS_MEEP_PYTHON do zwalidowanego interpretera PyMeep.` };
    },
    execute(values) {
      const result = meepPecReflection(values);
      if (!result.ok) throw new Error(result.error + (result.reason ? `: ${result.reason}` : ''));
      const data = result.data;
      if (!result.pass) throw new Error(`pec_reference_failed: |R-1|=${data.reflectanceAbsoluteError} > ${result.tolerance}`);
      return {
        outputs: {
          computedReflectance: data.computedReflectance, expectedReflectance: data.expectedReflectance,
          reflectanceAbsoluteError: data.reflectanceAbsoluteError, incidentFlux: data.incidentFlux,
          reflectedFlux: data.reflectedFlux, peakAbsExAtSample: data.peakAbsExAtSample,
          peakAbsHyAtSample: data.peakAbsHyAtSample,
        },
        warnings: [`PyMeep ${result.version}; ${result.meta.measurement}.`, 'To ograniczony benchmark idealnego przewodnika PEC w 1D; nie jest wynikiem dla rzeczywistego metalu, obiektu 3D, niewidzialności, teleportacji ani legendy Filadelfii.'],
      };
    },
  },

  {
    id: 'biology-hiv-10e8-pdb-structural-comparison',
    name: 'HIV MPER / 10E8 — porównanie struktur PDB (Biopython)',
    domain: 'biology-vaccine-discovery',
    version: '1.1.0',
    description: 'Rzeczywiste porównanie Cα RMSD manifestowanych par publicznych struktur 10E8/MPER: 5GHW→4G6F albo 5GHW→5WDF. Oblicza geometrię Fab oraz wspólnych identycznych atomów Cα MPER w ramie wyrównanej do Fab.',
    inputs: [
      { id: 'referencePdb', label: 'Referencyjna struktura PDB', type: 'string', unit: '', maxLength: 8, default: '5GHW' },
      { id: 'mobilePdb', label: 'Porównywana struktura PDB', type: 'string', unit: '', maxLength: 8, default: '4G6F' },
    ],
    outputs: [
      { id: 'fab10e8RmsdAngstrom', label: 'Fab 10E8 RMSD po superpozycji Cα', unit: 'Å' },
      { id: 'fabMatchedCaAtoms', label: 'Dopasowane atomy Cα Fab', unit: 'atomy' },
      { id: 'mperInFabAlignedFrameRmsdAngstrom', label: 'MPER RMSD w ramie wyrównanego Fab', unit: 'Å' },
      { id: 'mperMatchedIdenticalCaAtoms', label: 'Dopasowane identyczne atomy Cα MPER', unit: 'atomy' },
    ],
    assumptions: 'Biopython PDBParser; least-squares superposition atomów Cα identycznych reszt. Referencyjny Fab 10E8 (H/L) ustala ramę, w której porównywany jest wspólny segment MPER (P).',
    validity: 'Wyłącznie manifestowane, kierunkowe pary publicznych artefaktów 5GHW→4G6F oraz 5GHW→5WDF. Druga para obejmuje eksperymentalnie zdeponowany wariant 10E8v4-5R+100cF i peptyd gp41; Genesis nie projektuje mutacji. RMSD opisuje różnicę geometrii struktur zdeponowanych eksperymentalnie; nie jest dockingiem, dynamiką molekularną, predykcją K_D/off-rate, neutralizacji, immunogenności ani skuteczności szczepionki.',
    provenance: {
      source: 'RCSB PDB 5GHW / 4G6F / 5WDF; compute/structural_worker.py via compute/structuralAdapter.mjs',
      formula: 'Cα least-squares superposition (Biopython Superimposer) + RMSD in antibody-aligned frame',
      honesty: 'real_external_engine_computational_result',
      engine: 'Biopython',
      sourcePublication: 'RCSB 5GHW/4G6F public 10E8 complexes; RCSB 5WDF: deposited 10E8v4-5R+100cF Fab in complex with HIV-1 gp41 peptide',
      requiredEnvironmentVariables: ['GENESIS_BIOPYTHON_PYTHON', 'GENESIS_PDB_STRUCTURES_DIR'],
    },
    stochastic: false,
    backendExecutable: true,
    kind: 'external-engine',
    validate(values) {
      const runtime = structuralDetect();
      if (!runtime.available) {
        return { ok: false, error: 'capability_unavailable', message: `Biopython/PDB runtime niedostępny (${runtime.reason}). Skonfiguruj GENESIS_BIOPYTHON_PYTHON oraz GENESIS_PDB_STRUCTURES_DIR do zweryfikowanych artefaktów 5GHW, 4G6F i 5WDF.` };
      }
      const ref = values.referencePdb.toUpperCase();
      const mobile = values.mobilePdb.toUpperCase();
      if (ref !== '5GHW' || !['4G6F', '5WDF'].includes(mobile)) {
        return { ok: false, error: 'unsupported_pdb_pair', message: 'Wersja 1.1.0 dopuszcza wyłącznie odtwarzalne pary 5GHW (reference) → 4G6F lub 5WDF (mobile).' };
      }
      values.referencePdb = ref;
      values.mobilePdb = mobile;
      return { ok: true };
    },
    execute(values) {
      const result = compare10e8Mper(values.referencePdb, values.mobilePdb);
      if (!result.ok) throw new Error(result.error + (result.reason ? `: ${result.reason}` : ''));
      return {
        outputs: result.data,
        warnings: [
          'COMPUTATIONAL_RESULT: RMSD opisuje różnicę geometrii zdeponowanych struktur po wyrównaniu, a nie powinowactwo, neutralizację, immunogenność ani skuteczność szczepionki.',
          'AutoDock Vina i molecular dynamics są poza zakresem tego modelu; score dockingowy nie jest dołączany jako wynik zastępczy.',
        ],
        provenance: { engine: result.engine, ...result.provenance },
      };
    },
  },

  {
    id: 'biology-openmm-md-1vii-reference',
    name: 'OpenMM MD — benchmark publicznego białka 1VII',
    domain: 'biology-vaccine-discovery',
    version: '1.0.0',
    description: 'Rzeczywisty, ograniczony benchmark OpenMM MD CPU dla publicznej struktury małego białka 1VII: AMBER14, implicit OBC2, minimizacja i krótki przebieg Langevin Middle.',
    inputs: [{ id: 'steps', label: 'Kroki MD', type: 'number', unit: 'kroki', min: 100, max: 1000, default: 100 }],
    outputs: [
      { id: 'atomCountAfterHydrogenAddition', label: 'Atomy po dodaniu wodoru', unit: 'atomy' },
      { id: 'potentialEnergyBeforeKjPerMol', label: 'Energia potencjalna przed minimizacją', unit: 'kJ/mol' },
      { id: 'potentialEnergyMinimizedKjPerMol', label: 'Energia potencjalna po minimizacji', unit: 'kJ/mol' },
      { id: 'potentialEnergyAfterKjPerMol', label: 'Energia potencjalna po MD', unit: 'kJ/mol' },
      { id: 'simulatedPicoseconds', label: 'Czas symulowany', unit: 'ps' },
    ],
    assumptions: 'Publiczny PDB 1VII; AMBER14-all.xml + implicit/obc2.xml; CPU OpenMM z OPENMM_CPU_THREADS=1; constraints=HBonds; LangevinMiddle 300 K, γ=1/ps, dt=0,002 ps, seed 20260821.',
    validity: 'Tylko benchmark PDB 1VII, 100–1000 kroków na CPU i zweryfikowany artefakt źródłowy. Krótki run kontroluje runtime i odtwarzalność, nie równowagę, sampling konformacyjny, model HIV Env/10E8, nanodysk, błonę, kompleks białko–ligand, docking, powinowactwo ani skuteczność szczepionki.',
    provenance: {
      source: 'RCSB PDB 1VII via compute/openmm_worker.py and compute/openmmAdapter.mjs',
      formula: 'AMBER14 implicit OBC2 energy minimization + LangevinMiddle molecular dynamics',
      honesty: 'real_external_engine_computational_result', engine: 'OpenMM CPU',
      requiredEnvironmentVariables: ['GENESIS_OPENMM_PYTHON', 'GENESIS_OPENMM_DATA_DIR'],
    },
    stochastic: false,
    backendExecutable: true,
    kind: 'external-engine',
    validate() {
      const runtime = openmmDetect();
      return runtime.available
        ? { ok: true }
        : { ok: false, error: 'capability_unavailable', message: `OpenMM CPU runtime niedostępny (${runtime.reason}). Skonfiguruj GENESIS_OPENMM_PYTHON i GENESIS_OPENMM_DATA_DIR do zweryfikowanego runtime’u oraz PDB 1VII.` };
    },
    execute(values) {
      const result = openmmReferenceBenchmark(values.steps);
      if (!result.ok) throw new Error(result.error + (result.reason ? `: ${result.reason}` : ''));
      return {
        outputs: result.data,
        warnings: [
          'COMPUTATIONAL_RESULT: to krótki benchmark runtime’u OpenMM MD dla 1VII, nie badanie równowagi, wiązania, HIV, nanodysku ani szczepionki.',
          'Energie potencjalne force field nie są wolnymi energiami wiązania ani obserwowalnymi eksperymentalnymi.',
        ],
        provenance: { engine: result.engine, ...result.provenance },
      };
    },
  },

  {
    id: 'biology-depmap-crispr-senescence-panel',
    name: 'DepMap CRISPR — panel osi p53/p21 i p16/RB',
    domain: 'biology',
    version: '1.0.0',
    description: 'Odtwarzalna, read-only analiza opisowa danych DepMap 24Q2 CRISPR Gene Effect dla z góry określonego panelu CDKN1A, CDKN2A, TP53, RB1, CDK4, CDK6 i MDM2, skalibrowana oficjalnymi kontrolami esencjalnymi i nieesencjalnymi.',
    inputs: [],
    outputs: [
      { id: 'cellLineCount', label: 'Modele komórkowe z wynikiem', unit: 'modele komórkowe' },
      { id: 'matrixGeneCount', label: 'Geny w macierzy CRISPR', unit: 'geny' },
      { id: 'commonEssentialControlMedian', label: 'Mediana kontroli wspólnie esencjalnych', unit: 'CERES gene effect' },
      { id: 'nonessentialControlMedian', label: 'Mediana kontroli nieesencjalnych', unit: 'CERES gene effect' },
      { id: 'controlMedianSeparation', label: 'Różnica median kontroli', unit: 'CERES gene effect' },
      { id: 'controlCalibrationPass', label: 'Kontrola kalibracji zaliczona', unit: '0/1' },
      { id: 'cdkn1aMedian', label: 'CDKN1A — mediana gene effect', unit: 'CERES gene effect' },
      { id: 'cdkn2aMedian', label: 'CDKN2A — mediana gene effect', unit: 'CERES gene effect' },
      { id: 'tp53Median', label: 'TP53 — mediana gene effect', unit: 'CERES gene effect' },
      { id: 'rb1Median', label: 'RB1 — mediana gene effect', unit: 'CERES gene effect' },
      { id: 'cdk4Median', label: 'CDK4 — mediana gene effect', unit: 'CERES gene effect' },
      { id: 'cdk6Median', label: 'CDK6 — mediana gene effect', unit: 'CERES gene effect' },
      { id: 'mdm2Median', label: 'MDM2 — mediana gene effect', unit: 'CERES gene effect' },
    ],
    assumptions: 'Wersjonowany artefakt DepMap 24Q2, predefiniowany panel genów oraz oficjalne kontrolne listy Achilles. Wynik jest opisem CRISPR knockout gene-effect w liniach komórkowych raka.',
    validity: 'Tylko dane DepMap 24Q2 o czterech wymaganych artefaktach SHA-256; bez inferencji dotyczącej pacjentów, mechanizmu senescencji, celu terapeutycznego, leku, bezpieczeństwa ani korzyści klinicznej.',
    provenance: {
      source: 'DepMap 24Q2 Public, DOI:10.25452/figshare.plus.25880521 via compute/depmap_worker.py',
      formula: 'Descriptive corrected CERES gene-effect summaries; preregistered control separation common-essential versus nonessential genes.',
      honesty: 'real_versioned_dataset',
      engine: 'DepMap 24Q2 CRISPR Gene Effect (Chronos/CERES)',
      datasetLicense: 'CC BY 4.0',
      requiredEnvironmentVariable: 'GENESIS_DEPMAP_24Q2_DATA_DIR',
    },
    stochastic: false,
    backendExecutable: true,
    kind: 'external-data',
    validate() {
      const runtime = depmapDetect();
      return runtime.available
        ? { ok: true }
        : { ok: false, error: 'data_required', message: `DepMap 24Q2 jest niedostępny lub niezweryfikowany (${runtime.reason}). Skonfiguruj GENESIS_DEPMAP_24Q2_DATA_DIR do kompletnego zestawu źródłowego.` };
    },
    execute() {
      const result = senescenceCellCyclePanel();
      if (!result.ok) throw new Error(result.error + (result.reason ? `: ${result.reason}` : ''));
      const { data } = result;
      if (!data.control.predeclaredPass) throw new Error('DepMap control calibration failed; source result is not admitted as an experiment output.');
      return {
        outputs: {
          cellLineCount: data.cellLineCount,
          matrixGeneCount: data.matrixGeneCount,
          commonEssentialControlMedian: data.control.commonEssentialMedian,
          nonessentialControlMedian: data.control.nonessentialMedian,
          controlMedianSeparation: data.control.medianSeparation,
          controlCalibrationPass: data.control.predeclaredPass ? 1 : 0,
          cdkn1aMedian: data.panel.CDKN1A.median,
          cdkn2aMedian: data.panel.CDKN2A.median,
          tp53Median: data.panel.TP53.median,
          rb1Median: data.panel.RB1.median,
          cdk4Median: data.panel.CDK4.median,
          cdk6Median: data.panel.CDK6.median,
          mdm2Median: data.panel.MDM2.median,
        },
        warnings: [...data.interpretationBoundary, `Dataset ${data.datasetVersion}; DOI:${data.datasetDoi}; panel ${data.panelId}.`],
      };
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
