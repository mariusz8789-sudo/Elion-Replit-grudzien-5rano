import { EXPERIMENT_FABRIC_VERSION, type ExperimentOperation, type ExperimentValue, type StructuredExperimentRequest } from './types';

function firstNumber(text: string, expression: RegExp): number | undefined {
  const match = text.match(expression);
  if (!match) return undefined;
  const value = Number(match[1].replace(',', '.'));
  return Number.isFinite(value) ? value : undefined;
}

function operationFor(text: string): ExperimentOperation {
  if (/\b(pokaż|pokaz|wizualizuj|zobacz)\b/.test(text)) return 'visualize';
  if (/\b(wyjaśnij|wyjasnij|dlaczego)\b/.test(text)) return 'explain';
  if (/\b(symuluj|zasymuluj|uruchom)\b/.test(text)) return 'simulate';
  return 'compute';
}

function only(parameters: Record<string, ExperimentValue>, allowed: readonly string[]): Record<string, ExperimentValue> {
  return Object.fromEntries(Object.entries(parameters).filter(([key]) => allowed.includes(key)));
}

/**
 * Deterministic NL → StructuredExperimentRequest. This is deliberately a
 * constrained router over registered real models, not an LLM. Unknown theory
 * or missing engines are returned explicitly and cannot generate a result.
 */
export function parseScienceChatMessage(text: string): StructuredExperimentRequest {
  const sourceText = text.trim();
  const normalized = sourceText.toLocaleLowerCase('pl-PL');
  const params: Record<string, ExperimentValue> = {};
  const seed = firstNumber(normalized, /\bseed\s*[=:]?\s*(\d+)/);
  const r0 = firstNumber(normalized, /\br[₀0]\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  const horizonDays = firstNumber(normalized, /\b(\d+(?:[.,]\d+)?)\s*(?:dni|dzień|dnia|days?)\b/);
  const proteinSteps = firstNumber(normalized, /\b(?:kroki\s*(?:mc|monte carlo)?|steps)\s*[=:]?\s*(\d+)\b/);
  const massSolar = firstNumber(normalized, /\b(\d+(?:[.,]\d+)?)\s*(?:mas(?:a|y)\s+słońca|masy slonca|m[_ ]?sun|msun|solar masses?)\b/);
  const chirpMass1Solar = firstNumber(normalized, /\b(?:m1|masa\s*1|pierwsza\s*masa)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  const chirpMass2Solar = firstNumber(normalized, /\b(?:m2|masa\s*2|druga\s*masa)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  const radiusAu = firstNumber(normalized, /\b(\d+(?:[.,]\d+)?)\s*au\b/);
  const wavelengthNm = firstNumber(normalized, /\b(\d+(?:[.,]\d+)?)\s*nm\b/);
  const atomicNumber = firstNumber(normalized, /\bz\s*[=:]\s*(\d+)/);
  const principalN = firstNumber(normalized, /\bn\s*[=:]\s*(\d+)/);
  const beta = firstNumber(normalized, /\b(?:β|beta|v\s*\/\s*c)\s*[=:]?\s*(0(?:[.,]\d+)?|1(?:[.,]0+)?)/);
  const lightSpeedVelocityMs = firstNumber(normalized, /\b(?:v|prędkość obiektu|predkosc obiektu)\s*[=:]?\s*(\d+(?:[.,]\d+)?)\s*(?:m\s*\/\s*s|mps)\b/);
  const hypotheticalLightSpeedMs = firstNumber(normalized, /\b(?:c|prędkość światła|predkosc swiatla)\s*[=:]?\s*(\d+(?:[.,]\d+)?)\s*(?:m\s*\/\s*s|mps)\b/);
  const lightSpeedDistanceKm = firstNumber(normalized, /\b(?:dystans|odległość|odleglosc)\s*[=:]?\s*(\d+(?:[.,]\d+)?)\s*km\b/);
  const tesseractAngleXWDeg = firstNumber(normalized, /\b(?:xw|kąt\s*xw|kat\s*xw|angle\s*xw)\s*[=:]?\s*(-?\d+(?:[.,]\d+)?)/);
  const tesseractAngleYZDeg = firstNumber(normalized, /\b(?:yz|kąt\s*yz|kat\s*yz|angle\s*yz)\s*[=:]?\s*(-?\d+(?:[.,]\d+)?)/);
  const tesseractDoubleRotation = /(?:podwójn[a-ząćęłńóśźż]*\s+rotac[a-ząćęłńóśźż]*|podwojn[a-ząćęłńóśźż]*\s+rotac[a-ząćęłńóśźż]*|double rotation)/.test(normalized);
  const kerrSpin = firstNumber(normalized, /\b(?:spin|a\s*\/\s*m)\s*[=:]?\s*(0(?:[.,]\d+)?|1(?:[.,]0+)?)/);
  const temperatureK = firstNumber(normalized, /\b(\d+(?:[.,]\d+)?)\s*k\b/);
  const isingTemperature = firstNumber(normalized, /\b(?:t|temperatura)\s*[=:]?\s*(\d+(?:[.,]\d+)?)(?!\s*k\b)/);
  const activationEnergyKJ = firstNumber(normalized, /\b(\d+(?:[.,]\d+)?)\s*kj\s*\/\s*mol\b/);
  const protonNumber = firstNumber(normalized, /\b(?:protony|protonów|protonow|z)\s*[=:]?\s*(\d+)/);
  const neutronNumber = firstNumber(normalized, /\b(?:neutrony|neutronów|neutronow|n)\s*[=:]?\s*(\d+)/);
  const kardashevType = firstNumber(normalized, /\b(?:kardaszew|kardashev|typ\s*k)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  const formula = sourceText.match(/(?:wzór|wzor|formula|dla)\s+([A-Z][A-Za-z0-9]*)/)?.[1];
  const smiles = sourceText.match(/\bsmiles\s*(?:=|:)?\s*([^\s,;]+)/i)?.[1];
  const blochCircuit = sourceText.match(/(?:obw[oó]d(?:\s+kubitowy)?|circuit|bramki)\s*(?:=|:)?\s*((?:[HXYZSThxyzst]\s*[,;>→-]?\s*)+)/i)?.[1]?.trim();
  const teleportStateMatch = sourceText.match(/(?:stan|state)\s*[=:]?\s*(zero|one|plus|minus|plusi|minusi)\b/i)?.[1]?.toLowerCase();
  const teleportState = teleportStateMatch === 'plusi' ? 'plusI' : teleportStateMatch === 'minusi' ? 'minusI' : teleportStateMatch;
  const chemicalPotential = firstNumber(normalized, /\b(?:μ|mu|potencjał chemiczny|potencjal chemiczny)\s*[=:]?\s*(-?\d+(?:[.,]\d+)?)/);
  const hopping = firstNumber(normalized, /\b(?:hopping|tunelowanie|t)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  const pairing = firstNumber(normalized, /\b(?:pairing|delta|Δ|p-wave)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  const integrationHorizon = firstNumber(normalized, /(?:\bhoryzont\b|\bczas\b|(?:^|[\s,;])t)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  const threeBodyHorizon = integrationHorizon;
  const pendulumAngleDeg = firstNumber(normalized, /\b(?:kąt|kat|angle)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  const pendulumHorizonSeconds = integrationHorizon;
  const extraSystematic = firstNumber(normalized, /\b(?:dodatkowa systematyka|systematyka|extra systematic)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  const hideTrgb = /(?:ukryj trgb|bez trgb|nie pokazuj trgb)/.test(normalized);
  const lorenzRho = firstNumber(normalized, /\b(?:ρ|rho|liczba rayleigha)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  const planetYears = firstNumber(normalized, /(?:\b(?:lata|years)\b\s*[=:]?\s*|przez\s+)(\d+(?:[.,]\d+)?)(?:\s+lat)?/);
  const galaxyRatio = firstNumber(normalized, /\b(?:stosunek mas|ratio)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  const galaxyHorizonMyr = firstNumber(normalized, /\b(\d+(?:[.,]\d+)?)\s*(?:mln\s*lat|myr)\b/);
  const haloVInf = firstNumber(normalized, /\b(?:halo|v∞|vinf|prędkość graniczna|predkosc graniczna)\s*[=:]?\s*(\d+(?:[.,]\d+)?)(?:\s*km\s*\/\s*s)?/);
  const useMond = /\bmond\b/.test(normalized);
  const retrogradeGalaxy = /(?:przeciwbieżn[a-ząćęłńóśźż]*|przeciwbiezn[a-ząćęłńóśźż]*|retrograd[a-ząćęłńóśźż]*)/.test(normalized);
  const disableJupiter = /(?:bez jowisza|wyłącz jowisza|wylacz jowisza)/.test(normalized);
  const disableSaturn = /(?:bez saturna|wyłącz saturna|wylacz saturna)/.test(normalized);
  const threeBodyPreset = /(?:pitagorejsk[a-ząćęłńóśźż]*|burrau)/.test(normalized)
    ? 'pythagorean'
    : /(?:ósemk[a-ząćęłńóśźż]*|osemk[a-ząćęłńóśźż]*|figure[- ]?eight)/.test(normalized)
      ? 'figure8'
      : undefined;
  const threeBodyDivergence = /(?:drugi start|dwa starty|perturbac[a-ząćęłńóśźż]*|rozjazd|wrażliwoś[a-ząćęłńóśźż]* na warunki|wrazliwos[a-ząćęłńóśźż]* na warunki)/.test(normalized);
  const meepN1 = firstNumber(normalized, /\b(?:n1|n₁|współczynnik\s*(?:załamania\s*)?(?:ośrodka\s*)?1)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  const meepN2 = firstNumber(normalized, /\b(?:n2|n₂|współczynnik\s*(?:załamania\s*)?(?:ośrodka\s*)?2)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  const meepFrequency = firstNumber(normalized, /\b(?:częstotliwość\s*meep|czestotliwosc\s*meep|frequency)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  const meepResolution = firstNumber(normalized, /\b(?:rozdzielczość\s*fdtd|rozdzielczosc\s*fdtd|resolution)\s*[=:]?\s*(\d+)/);
  const h2BondLengthAngstrom = firstNumber(normalized, /\b(?:r(?:\s*h[−-]?h)?|długość\s+wiązania|dlugosc\s+wiazania|bond\s+length)\s*[=:]?\s*(\d+(?:[.,]\d+)?)\s*(?:å|a|angstrom|angstroem)/);
  const tunnelingEnergy = firstNumber(normalized, /\b(?:energy|energia)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  const tunnelingBarrier = firstNumber(normalized, /\b(?:barrier|bariera)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  const tunnelingWidth = firstNumber(normalized, /\b(?:width|szerokość(?:\s+barier[ya])?|szerokosc(?:\s+barier[ya])?)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);

  if (seed !== undefined) params.seed = seed;
  if (r0 !== undefined) params.r0 = r0;
  if (horizonDays !== undefined) params.horizonDays = horizonDays;
  if (proteinSteps !== undefined) params.steps = proteinSteps;
  if (massSolar !== undefined) params.massSolar = massSolar;
  if (chirpMass1Solar !== undefined) params.m1Solar = chirpMass1Solar;
  if (chirpMass2Solar !== undefined) params.m2Solar = chirpMass2Solar;
  if (radiusAu !== undefined) params.orbitalRadiusAu = radiusAu;
  if (wavelengthNm !== undefined) params.wavelengthNm = wavelengthNm;
  if (atomicNumber !== undefined) params.atomicNumber = atomicNumber;
  if (principalN !== undefined) params.principalN = principalN;
  if (beta !== undefined) {
    params.velocityFraction = beta;
    params.beta = beta;
  }
  if (lightSpeedVelocityMs !== undefined) params.velocityMs = lightSpeedVelocityMs;
  if (hypotheticalLightSpeedMs !== undefined) params.lightSpeedMs = hypotheticalLightSpeedMs;
  if (lightSpeedDistanceKm !== undefined) params.distanceKm = lightSpeedDistanceKm;
  if (tesseractAngleXWDeg !== undefined) params.angleXWDeg = tesseractAngleXWDeg;
  if (tesseractAngleYZDeg !== undefined) params.angleYZDeg = tesseractAngleYZDeg;
  if (tesseractDoubleRotation) params.doubleRotation = true;
  if (kerrSpin !== undefined) params.spin = kerrSpin;
  if (temperatureK !== undefined) params.temperatureK = temperatureK;
  if (isingTemperature !== undefined) params.temperature = isingTemperature;
  if (activationEnergyKJ !== undefined) params.activationEnergyKJ = activationEnergyKJ;
  if (protonNumber !== undefined) params.protonNumber = protonNumber;
  if (neutronNumber !== undefined) params.neutronNumber = neutronNumber;
  if (kardashevType !== undefined) params.kardashevType = kardashevType;
  if (formula !== undefined) params.formula = formula;
  if (smiles !== undefined) params.smiles = smiles;
  if (blochCircuit !== undefined) params.circuit = blochCircuit;
  if (teleportState !== undefined) params.state = teleportState;
  if (chemicalPotential !== undefined) params.chemicalPotential = chemicalPotential;
  if (hopping !== undefined) params.hopping = hopping;
  if (pairing !== undefined) params.pairing = pairing;
  if (threeBodyHorizon !== undefined) params.horizonTime = threeBodyHorizon;
  if (pendulumAngleDeg !== undefined) params.angleDeg = pendulumAngleDeg;
  if (pendulumHorizonSeconds !== undefined) params.horizonSeconds = pendulumHorizonSeconds;
  if (extraSystematic !== undefined) params.extraSystematic = extraSystematic;
  if (hideTrgb) params.showTrgb = false;
  if (lorenzRho !== undefined) params.rho = lorenzRho;
  if (planetYears !== undefined) params.years = planetYears;
  if (disableJupiter) params.jupiter = false;
  if (disableSaturn) params.saturn = false;
  if (galaxyRatio !== undefined) params.ratio = galaxyRatio;
  if (galaxyHorizonMyr !== undefined) params.horizonMyr = galaxyHorizonMyr;
  if (haloVInf !== undefined) params.haloVInf = haloVInf;
  if (useMond) params.altGravity = true;
  if (retrogradeGalaxy) params.retro = true;
  if (threeBodyPreset !== undefined) params.preset = threeBodyPreset;
  if (threeBodyDivergence) params.divergence = true;
  if (meepN1 !== undefined) params.n1 = meepN1;
  if (meepN2 !== undefined) params.n2 = meepN2;
  if (meepFrequency !== undefined) params.frequency = meepFrequency;
  if (meepResolution !== undefined) params.resolution = meepResolution;
  if (h2BondLengthAngstrom !== undefined) params.bondLengthAngstrom = h2BondLengthAngstrom;
  if (tunnelingEnergy !== undefined) params.energy = tunnelingEnergy;
  if (tunnelingBarrier !== undefined) params.barrier = tunnelingBarrier;
  if (tunnelingWidth !== undefined) params.width = tunnelingWidth;

  const base = { contractVersion: EXPERIMENT_FABRIC_VERSION, sourceText, operation: operationFor(normalized), seed } as const;
  const request = (domainId: string, modelId: string | undefined, requestedVisualization: StructuredExperimentRequest['requestedVisualization'], allowed: readonly string[]): StructuredExperimentRequest => ({
    ...base, domainId, modelId, requestedVisualization, parameters: only(params, allowed),
  });

  if (/(?:eksperyment\s+filadelf(?:ia|ijski)|philadelphia\s+experiment|uss\s+eldridge|\beldridge\b|legend[a-ząćęłńóśźż]*\s+filadelf[a-ząćęłńóśźż]*)/.test(normalized)) {
    params.viewMode = /(?:zgodne\s+ze\s+(?:znan[a-ząćęłńóśźż]*\s+)?fizyk[a-ząćęłńóśźż]*|porównaj\s+legend[a-ząćęłńóśźż]*\s+z\s+fizyk[a-ząćęłńóśźż]*|porownaj\s+legend[a-ząćęłńóśźż]*\s+z\s+fizyk[a-ząćęłńóśźż]*|czego\s+potrzeba)/.test(normalized) ? 'physics' : 'legend';
    return request('historical-legends', 'historical-philadelphia-legend', 'scene-3d', ['viewMode']);
  }
  if (/(?:powódź|powodz|pożar|pozar|trzęsienie|trzesienie|blackout|kaskad[a-ząćęłńóśźż]*|ewakuacj[a-ząćęłńóśźż]*)/.test(normalized)) {
    return request('hazard-cascade', undefined, 'world-3d', []);
  }
  if (/(?:zderzeni[a-ząćęłńóśźż]* galaktyk|zderzeni[a-ząćęłńóśźż]* galaktyk|kolizj[a-ząćęłńóśźż]* galaktyk|merger galaktyk|toomre)/.test(normalized)) {
    return request('universe', 'universe-galaxy-collision', 'graph', ['ratio', 'retro', 'horizonMyr']);
  }
  if (/(?:krzyw[a-ząćęłńóśźż]* rotacji|ciemna materia|\bmond\b|halo galaktyczn[a-ząćęłńóśźż]*)/.test(normalized)) {
    return request('universe', 'universe-rotation-curve', 'graph', ['haloVInf', 'altGravity']);
  }
  if (/\b(układ słoneczny|uklad sloneczny|słońc[a-ząćęłńóśźż]* i planet[a-ząćęłńóśźż]*|slonc[a-ząćęłńóśźż]* i planet[a-ząćęłńóśźż]*)\b/.test(normalized)) {
    if (horizonDays !== undefined) params.daysElapsed = horizonDays;
    return request('universe', 'universe-solar-system', 'canvas-2d', ['daysElapsed']);
  }
  if (/(?:stabilność planet|stabilnosc planet|układ planetarn[a-ząćęłńóśźż]*|uklad planetarn[a-ząćęłńóśźż]*|planetarna stabilność|planetarna stabilnosc|n[- ]?ciał planet)/.test(normalized)) {
    return request('universe', 'universe-planet-stability', 'scene-3d', ['years', 'jupiter', 'saturn']);
  }
  if (/(?:życi[a-ząćęłńóśźż]* gwiazd[a-ząćęłńóśźż]*|zyci[a-ząćęłńóśźż]* gwiazd[a-ząćęłńóśźż]*|ewolucj[a-ząćęłńóśźż]* gwiazd[a-ząćęłńóśźż]*|ewolucj[a-ząćęłńóśźż]* gwiazd[a-ząćęłńóśźż]*|los(?:u|y) gwiazd[a-ząćęłńóśźż]*|biały karzeł|bialy karzel|gwiazda neutronowa|supernow[a-ząćęłńóśźż]*)/.test(normalized)) {
    return request('universe', 'universe-starlife', 'graph', ['massSolar']);
  }
  if (/(?:atraktor lorenz[a-ząćęłńóśźż]*|atraktor lorenza|równani[a-ząćęłńóśźż]* lorenz[a-ząćęłńóśźż]*|rownani[a-ząćęłńóśźż]* lorenz[a-ząćęłńóśźż]*|lorenz\s+attractor)/.test(normalized)) {
    return request('classical-mechanics', 'universe-lorenz-attractor', 'scene-3d', ['rho', 'horizonTime', 'divergence']);
  }
  if (/(?:napięcie hubble[a-ząćęłńóśźż]*|napiecie hubble[a-ząćęłńóśźż]*|hubble tension|\bh[₀0]\b)/.test(normalized)) {
    return request('universe', 'universe-hubble-tension', 'graph', ['extraSystematic', 'showTrgb']);
  }
  if (/(?:podwójne wahadło|podwojne wahadlo|double pendulum)/.test(normalized)) {
    return request('classical-mechanics', 'universe-double-pendulum', 'graph', ['angleDeg', 'horizonSeconds', 'divergence']);
  }
  if (/(?:problem trzech ciał|problem trzech cial|three[- ]?body|orbita ósemk[a-ząćęłńóśźż]*|orbita osemk[a-ząćęłńóśźż]*|układ pitagorejsk[a-ząćęłńóśźż]*|uklad pitagorejsk[a-ząćęłńóśźż]*|burrau)/.test(normalized)) {
    return request('classical-mechanics', 'universe-three-body', 'graph', ['preset', 'horizonTime', 'divergence']);
  }
  if (/(?:efekt motyla|butterfly effect|chaos deterministyczny|warunk(?:i|ów) początkow(?:e|ych)|warunk(?:i|ow) poczatkow(?:e|ych))/.test(normalized)) {
    // Jedyny obsługiwany eksperyment „efektu motyla”: rzeczywista, niewielka perturbacja
    // w istniejącym Newtonowskim problemie trzech ciał. Nie jest to ogólny solver chaosu.
    if (params.preset === undefined) params.preset = 'pythagorean';
    params.divergence = true;
    return request('classical-mechanics', 'universe-three-body', 'graph', ['preset', 'horizonTime', 'divergence']);
  }
  if (/(?:\bpec\b|idealn[a-ząćęłńóśźż]* przewodnik[a-ząćęłńóśźż]*|perfect electric conductor|odbici[a-ząćęłńóśźż]*.*przewodnik|przewodnik.*odbici[a-ząćęłńóśźż]*)/.test(normalized)) {
    return request('electrodynamics', 'electrodynamics-maxwell-fdtd-pec-reflection', 'graph', ['frequency', 'resolution']);
  }
  if (/(?:meep|fdtd|różnic skończon[a-ząćęłńóśźż]* w dziedzinie czasu|roznic skonczon[a-ząćęłńóśźż]* w dziedzinie czasu|granica dielektryczn[a-ząćęłńóśźż]*|transmisj[a-ząćęłńóśźż]* fresnela|refleksj[a-ząćęłńóśźż]* fresnela|maxwell.*dielektryk|dielektryk.*maxwell)/.test(normalized)) {
    return request('electrodynamics', 'electrodynamics-maxwell-fdtd', 'graph', ['n1', 'n2', 'frequency', 'resolution']);
  }
  if (/(?:tesla|silnik indukcyjny|prąd przemienny|prad przemienny|układ wielofazowy|uklad wielofazowy)/.test(normalized)) {
    return request('electrodynamics', undefined, 'graph', []);
  }
  if (/(?:podświadomość|podswadomosc|psychologiczny efekt obserwatora|wewnętrzny termostat|wewnetrzny termostat)/.test(normalized)) {
    return request('biology', undefined, 'narrative', []);
  }
  if (/(?:\b(?:rmsd|pdb)\b.*(?:10e8|mper|hiv)|(?:10e8|mper|hiv).*(?:\brmsd\b|pdb|porównaj struktur)|porównaj\s+(?:struktury|strukture)\s+(?:5ghw|4g6f|5wdf))/i.test(normalized)) {
    params.referencePdb = '5GHW';
    params.mobilePdb = /\b5wdf\b|10e8v4|5r\+100cf/.test(normalized) ? '5WDF' : '4G6F';
    return request('biology-vaccine-discovery', 'biology-hiv-10e8-pdb-structural-comparison', 'graph', ['referencePdb', 'mobilePdb']);
  }
  if (/(?:\bopenmm\b|(?:dynamik[a-ząćęłńóśźż]*\s+molekularn[a-ząćęłńóśźż]*|molecular dynamics|\bmd\b).*(?:1vii|benchmark|referencyjn)|(?:1vii|benchmark\s+md).*(?:openmm|dynamik[a-ząćęłńóśźż]*))/i.test(normalized)) {
    return request('biology-vaccine-discovery', 'biology-openmm-md-1vii-reference', 'graph', ['steps']);
  }
  if (/(?:\bdepmap\b|crispr\s+(?:gene\s+)?effect|panel\s+(?:p53|p21|p16|rb)|(?:p53|p21|p16|rb)\s*(?:\/|i|oraz|and)\s*(?:p21|p16|rb)|senescence\s+panel\s+crispr)/.test(normalized)) {
    return request('biology-aging-lab', 'biology-depmap-crispr-senescence-panel', 'graph', []);
  }
  if (smiles !== undefined && /(?:\brdkit\b|deskryptor[a-ząćęłńóśźż]*\s+(?:molekularn[a-ząćęłńóśźż]*|smiles)|(?:analizuj|oblicz|uruchom)\s+smiles)/.test(normalized)) {
    return request('chemistry', 'chem-rdkit-descriptors', 'graph', ['smiles']);
  }
  if (/(?:\bpyscf\b|hartree[ -]?fock|\brhf\b)/.test(normalized) && /(?:\bh2\b|h₂|wod(?:ó|o)r\s+dwuatomow[a-ząćęłńóśźż]*)/.test(normalized)) {
    return request('quantum-chemistry', 'quantum-chemistry-pyscf-h2-rhf', 'graph', ['bondLengthAngstrom']);
  }
  if (/\b(fałdowani[a-ząćęłńóśźż]* białk[a-ząćęłńóśźż]*|faldowani[a-ząćęłńóśźż]* bialk[a-ząćęłńóśźż]*|protein folding|model hp|hydrofobow[a-ząćęłńóśźż]* rdze[nń])\b/.test(normalized)) return request('biology', 'biology-protein-folding-hp', 'canvas-2d', ['sequenceKey', 'temperature', 'steps', 'seed']);
  if (/\b(dna|helis[a-ząćęłńóśźż]* dna|b[- ]?dna|temperatur[a-ząćęłńóśźż]* topnieni[a-ząćęłńóśźż]* dna|wallace)\b/.test(normalized)) return request('biology', 'biology-dna-helix', 'scene-3d', ['sequence', 'temperatureC']);
  if (/(?:epidem[a-ząćęłńóśźż]*|seir|seird|\bsir\b|zakaż[a-ząćęłńóśźż]*|zakaz[a-ząćęłńóśźż]*|rozwój epidemii|rozwoj epidemii)/.test(normalized)) {
    return request('biology', 'epidemic-city', 'world-3d', ['r0', 'horizonDays', 'nAgents']);
  }
  if (/\b(przepływ wody|przeplyw wody|pompa|rurociąg|rurociag|darcy|reynolds)\b/.test(normalized)) {
    return request('engineering-water', 'water-pump-pipe', 'graph', ['volumetricFlow', 'pipeDiameter', 'pipeLength', 'pipeRoughnessMm', 'staticLift', 'fluidDensity', 'fluidViscosity', 'pumpEfficiency']);
  }
  if (/(?:masa chirp|chirp|isco|fala grawitacyjna|fale grawitacyjne)/.test(normalized)) {
    return request('spacetime-einstein', 'einstein-chirp-mass', 'scene-3d', ['m1Solar', 'm2Solar']);
  }
  if (/(?:c[- ]?slider|gdyby\s+(?:c|prędkość światła|predkosc swiatla)|hipotetyczn[a-ząćęłńóśźż]*\s+(?:c|prędkość światła|predkosc swiatla)|zmień\s+(?:c|prędkość światła)|zmien\s+(?:c|predkosc swiatla))/.test(normalized)) return request('spacetime-einstein', 'spacetime-c-slider', 'graph', ['velocityMs', 'lightSpeedMs', 'distanceKm']);
  if (/\b(diagram minkowskiego|minkowski|względnoś[a-ząćęłńóśźż]* równoczesnoś[a-ząćęłńóśźż]*|wzglednos[a-ząćęłńóśźż]* rownoczesnos[a-ząćęłńóśźż]*)\b/.test(normalized)) return request('spacetime-einstein', 'spacetime-minkowski', 'canvas-2d', ['beta']);
  if (/\b(stożek świetlny|stożek swietlny|light cone|paradoks bliźni[a-ząćęłńóśźż]*|paradoks blizni[a-ząćęłńóśźż]*)\b/.test(normalized)) return request('spacetime-einstein', 'spacetime-light-cone', 'scene-3d', ['v', 'tripYears']);
  if (/(?:dylatac[a-ząćęłńóśźż]*|lorentz[a-ząćęłńóśźż]*|skróceni[a-ząćęłńóśźż]* długości|skroceni[a-ząćęłńóśźż]* dlugosci|szczególn[a-ząćęłńóśźż]* teori[a-ząćęłńóśźż]* względności|szczegoln[a-ząćęłńóśźż]* teori[a-ząćęłńóśźż]* wzglednosci)/.test(normalized)) {
    return request('spacetime-einstein', 'sr-lorentz', 'graph', ['velocityFraction', 'properTimeSeconds', 'restLengthMeters']);
  }
  if (/\b(soczewkow[a-ząćęłńóśźż]*|pierścień einsteina|pierscien einsteina|mikrosoczewkow[a-ząćęłńóśźż]*)\b/.test(normalized)) return request('spacetime-einstein', 'einstein-point-lens', 'canvas-2d', ['beta']);
  if (/\b(geodezyjn[a-ząćęłńóśźż]*|tor foton[a-ząćęłńóśźż]*|parametr zderzenia)\b/.test(normalized) && /(?:czarna dziura|schwarzschild[a-ząćęłńóśźż]*)/.test(normalized)) {
    return request('spacetime-einstein', 'einstein-schwarzschild-geodesic', 'canvas-2d', ['impact']);
  }
  if (/\b(kerr[a-ząćęłńóśźż]*|wirując[a-ząćęłńóśźż]* czarn[a-ząćęłńóśźż]* dziur[a-ząćęłńóśźż]*|wirujac[a-ząćęłńóśźż]* czarn[a-ząćęłńóśźż]* dziur[a-ząćęłńóśźż]*|frame[ -]?dragging|wleczeni[a-ząćęłńóśźż]* układ[a-ząćęłńóśźż]* inercjaln[a-ząćęłńóśźż]*)\b/.test(normalized)) return request('spacetime-einstein', 'einstein-kerr-equatorial', 'scene-3d', ['spin']);
  if (/(?:czarna dziura|schwarzschild[a-ząćęłńóśźż]*|czasoprzestrzeń|czasoprzestrzen[a-ząćęłńóśźż]*|zakrzywieni[a-ząćęłńóśźż]*)/.test(normalized)) {
    return request('spacetime-einstein', 'einstein-schwarzschild', 'scene-3d', ['massSolar']);
  }
  if (/(?:ucieczka atmosfery|atmosfer[a-ząćęłńóśźż]*|parametr jeansa|albedo)/.test(normalized)) {
    return request('universe', 'universe-atmospheric-escape', 'graph', ['stellarLuminositySolar', 'orbitalDistanceAu', 'planetAlbedo', 'planetMassEarth', 'planetRadiusEarth', 'moleculeMassAmu']);
  }
  if (/\b(orbital atomowy|chmura elektron[a-ząćęłńóśźż]*|funkcja falow[a-ząćęłńóśźż]*)\b/.test(normalized)) return request('atom', 'atom-hydrogen-orbital', 'scene-3d', ['orbital', 'x', 'y', 'z']);
  if (/(?:orbit[a-ząćęłńóśźż]*|układ planetarny|uklad planetarny|kepler[a-ząćęłńóśźż]*|planet[a-ząćęłńóśźż]*)/.test(normalized)) {
    if (massSolar !== undefined) params.centralMassSolar = massSolar;
    return request('universe', 'universe-kepler', 'scene-3d', ['centralMassSolar', 'orbitalRadiusAu']);
  }
  if (/\b(tokamak[a-ząćęłńóśźż]*|kryterium lawson[a-ząćęłńóśźż]*|fuzj[a-ząćęłńóśźż]* d[- ]?t)\b/.test(normalized)) {
    return request('nuclear', 'nuclear-tokamak-lawson', 'canvas-2d', ['densityExponent', 'temperatureKeV', 'confinementSeconds']);
  }
  if (/\b(map[a-ząćęłńóśźż]* nuklid[a-ząćęłńóśźż]*|chart of nuclides|karta nuklid[a-ząćęłńóśźż]*)\b/.test(normalized)) {
    return request('nuclear', 'nuclear-nuclide-chart', 'canvas-2d', ['protonNumber', 'neutronNumber']);
  }
  if (/(?:jądr[a-ząćęłńóśźż]*|jadr[a-ząćęłńóśźż]*|nuklid[a-ząćęłńóśźż]*|energi[a-ząćęłńóśźż]* wiązani[a-ząćęłńóśźż]*|energi[a-ząćęłńóśźż]* wiazani[a-ząćęłńóśźż]*|semf)/.test(normalized)) {
    return request('nuclear', 'nuclear-semf', 'scene-3d', ['protonNumber', 'neutronNumber']);
  }
  if (/(?:cząstk[a-ząćęłńóśźż]*|czastk[a-ząćęłńóśźż]*|lepton[a-ząćęłńóśźż]*|kwark[a-ząćęłńóśźż]*|relatywistyczn[a-ząćęłńóśźż]* energi[a-ząćęłńóśźż]*|pęd cząstk[a-ząćęłńóśźż]*|ped czastk[a-ząćęłńóśźż]*)/.test(normalized)) {
    return request('particle', 'particle-relativistic-energy', 'scene-3d', ['restMassMeV', 'velocityFraction']);
  }
  if (/\b(vsepr|geometri[a-ząćęłńóśźż]* cząstecz[a-ząćęłńóśźż]*|geometri[a-ząćęłńóśźż]* czastecz[a-ząćęłńóśźż]*|kształt[a-ząćęłńóśźż]* molekularn[a-ząćęłńóśźż]*|ksztalt[a-ząćęłńóśźż]* molekularn[a-ząćęłńóśźż]*)\b/.test(normalized)) return request('chemistry', 'chem-vsepr', 'scene-3d', ['shapeId']);
  if (/\b(miareczkow[a-ząćęłńóśźż]*|titration|kwas[owo-]*zasadow[a-ząćęłńóśźż]*|naoh)\b/.test(normalized)) return request('chemistry', 'chemistry-titration', 'canvas-2d', ['acid', 'vb']);
  if (/(?:ising[a-ząćęłńóśźż]*|model izinga|przejści[a-ząćęłńóśźż]* fazow[a-ząćęłńóśźż]* magnetyczn[a-ząćęłńóśźż]*|przejsc[a-ząćęłńóśźż]* fazow[a-ząćęłńóśźż]* magnetyczn[a-ząćęłńóśźż]*)/.test(normalized)) {
    return request('chemistry', 'chemistry-ising', 'canvas-2d', ['temperature', 'seed']);
  }
  if (/(?:arrhenius[a-ząćęłńóśźż]*|kinetyk[a-ząćęłńóśźż]* reakcj[a-ząćęłńóśźż]*|energi[a-ząćęłńóśźż]* aktywacj[a-ząćęłńóśźż]*|szybkoś[a-ząćęłńóśźż]* reakcj[a-ząćęłńóśźż]*|szybkos[a-ząćęłńóśźż]* reakcj[a-ząćęłńóśźż]*)/.test(normalized)) {
    return request('chemistry', 'chemistry-arrhenius', 'graph', ['temperatureK', 'activationEnergyKJ', 'preExponentialLog10']);
  }
  if (/(?:mas[a-ząćęłńóśźż]* molow[a-ząćęłńóśźż]*|wz[oó]r[a-ząćęłńóśźż]* sumaryczn[a-ząćęłńóśźż]*)/.test(normalized)) {
    return request('chemistry', 'chem-molecular-weight', 'graph', ['formula']);
  }
  if (/\b(orbital[a-ząćęłńóśźż]*|chmura elektron[a-ząćęłńóśźż]*|funkcja falow[a-ząćęłńóśźż]*)\b/.test(normalized)) return request('atom', 'atom-hydrogen-orbital', 'scene-3d', ['orbital', 'x', 'y', 'z']);
  if (/\b(atom|wodór|wodor|orbital atomowy|bohr)\b/.test(normalized)) {
    return request('atom', 'atom-bohr', 'scene-3d', ['atomicNumber', 'principalN']);
  }
  if (/\b(foton[a-ząćęłńóśźż]*|energia fotonu|promieniowanie)\b/.test(normalized) && !/\bfala elektromagnetyczna\b/.test(normalized)) {
    return request('electrodynamics', 'photon-energy', 'graph', ['wavelengthNm']);
  }
  if (/\b(tesserakt|tesseract|hipersześcian|hiperszescian|hiper[- ]?sześcian|hiper[- ]?szescian)\b/.test(normalized)) return request('mathematics', 'math-tesseract-4d', 'scene-3d', ['angleXWDeg', 'angleYZDeg', 'doubleRotation']);
  if (/\b(rozkład normalny|rozklad normalny|gauss|z-score|z score)\b/.test(normalized)) {
    return request('mathematics', 'math-gaussian', 'graph', ['mean', 'sigma', 'xValue']);
  }
  if (/\b(wzrost logistyczny|logistyczn[a-ząćęłńóśźż]* populacj|pojemność środowiska|pojemnosc srodowiska)\b/.test(normalized)) {
    return request('biology', 'biology-logistic', 'graph', ['growthRate', 'carryingCapacity', 'initialPopulation', 'timeElapsed']);
  }
  if (/\b(równani[a-ząćęłńóśźż]* drake[a-ząćęłńóśźż]*|rownani[a-ząćęłńóśźż]* drake[a-ząćęłńóśźż]*|drake equation)\b/.test(normalized)) return request('civilization', 'civilization-drake-equation', 'graph', ['starFormationRate', 'fractionWithPlanets', 'earthlikePerSystem', 'fractionDevelopingLife', 'fractionIntelligent', 'fractionCommunicative', 'lifetimeLog10Years']);
  if (/\b(kardaszew|kardashev|cywilizacja typu)\b/.test(normalized)) {
    return request('civilization', 'civilization-kardashev', 'narrative', ['kardashevType']);
  }
  if (/\b(majorana\s*1|topoconductor|urządzenie majorana|urzadzenie majorana)\b/.test(normalized)) return request('quantum', undefined, 'graph', []);
  if (/\b(teleportacj[a-ząćęłńóśźż]* kwantow[a-ząćęłńóśźż]*|quantum teleportation|protokół bennett[a-ząćęłńóśźż]*|protokol bennett[a-ząćęłńóśźż]*)\b/.test(normalized)) return request('quantum', 'quantum-teleportation', 'canvas-2d', ['state']);
  if (/\b(chsh|bella|nierówność bella|nierownosc bella|splątanie.*korelac|splatanie.*korelac)\b/.test(normalized)) return request('quantum', 'quantum-chsh-correlation', 'canvas-2d', ['a', 'aP', 'b', 'bP']);
  if (/(?:sfera blocha|bloch|bramk[a-ząćęłńóśźż]* kwantow[a-ząćęłńóśźż]*|obw[oó]d kubitow[a-ząćęłńóśźż]*|jednokubitow[a-ząćęłńóśźż]*|hadamard)/.test(normalized)) return request('quantum', 'quantum-bloch-circuit', 'scene-3d', ['circuit']);
  if (/(?:kitaev[a-ząćęłńóśźż]*|łańcuch kitaeva|lancuch kitaeva)/.test(normalized)) return request('quantum', 'quantum-kitaev-bulk', 'graph', ['chemicalPotential', 'hopping', 'pairing']);
  if (/\btunelowanie\b/.test(normalized)) return request('quantum', 'quantum-tunneling-1d', 'canvas-2d', ['energy', 'barrier', 'width']);
  if (/\b(równanie schrödingera|rownanie schrodingera)\b/.test(normalized)) return request('quantum', undefined, 'graph', []);
  if (/\b(fala elektromagnetyczna|maxwell|pole elektromagnetyczne)\b/.test(normalized)) return request('electrodynamics', undefined, 'graph', []);
  if (/\b(termodynam|entropia|ciepło|cieplo)\b/.test(normalized)) return request('thermodynamics', undefined, 'graph', []);
  return request('unknown', undefined, 'narrative', []);
}
