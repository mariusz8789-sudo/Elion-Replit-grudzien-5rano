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
  const massSolar = firstNumber(normalized, /\b(\d+(?:[.,]\d+)?)\s*(?:mas(?:a|y)\s+słońca|masy slonca|m[_ ]?sun|msun|solar masses?)\b/);
  const radiusAu = firstNumber(normalized, /\b(\d+(?:[.,]\d+)?)\s*au\b/);
  const wavelengthNm = firstNumber(normalized, /\b(\d+(?:[.,]\d+)?)\s*nm\b/);
  const atomicNumber = firstNumber(normalized, /\bz\s*[=:]\s*(\d+)/);
  const principalN = firstNumber(normalized, /\bn\s*[=:]\s*(\d+)/);
  const beta = firstNumber(normalized, /\b(?:β|beta|v\s*\/\s*c)\s*[=:]?\s*(0(?:[.,]\d+)?|1(?:[.,]0+)?)/);
  const temperatureK = firstNumber(normalized, /\b(\d+(?:[.,]\d+)?)\s*k\b/);
  const activationEnergyKJ = firstNumber(normalized, /\b(\d+(?:[.,]\d+)?)\s*kj\s*\/\s*mol\b/);
  const protonNumber = firstNumber(normalized, /\b(?:protony|protonów|protonow|z)\s*[=:]?\s*(\d+)/);
  const neutronNumber = firstNumber(normalized, /\b(?:neutrony|neutronów|neutronow|n)\s*[=:]?\s*(\d+)/);
  const kardashevType = firstNumber(normalized, /\b(?:kardaszew|kardashev|typ\s*k)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  const formula = sourceText.match(/(?:wzór|wzor|formula|dla)\s+([A-Z][A-Za-z0-9]*)/)?.[1];
  const chemicalPotential = firstNumber(normalized, /\b(?:μ|mu|potencjał chemiczny|potencjal chemiczny)\s*[=:]?\s*(-?\d+(?:[.,]\d+)?)/);
  const hopping = firstNumber(normalized, /\b(?:hopping|tunelowanie|t)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  const pairing = firstNumber(normalized, /\b(?:pairing|delta|Δ|p-wave)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);

  if (seed !== undefined) params.seed = seed;
  if (r0 !== undefined) params.r0 = r0;
  if (horizonDays !== undefined) params.horizonDays = horizonDays;
  if (massSolar !== undefined) params.massSolar = massSolar;
  if (radiusAu !== undefined) params.orbitalRadiusAu = radiusAu;
  if (wavelengthNm !== undefined) params.wavelengthNm = wavelengthNm;
  if (atomicNumber !== undefined) params.atomicNumber = atomicNumber;
  if (principalN !== undefined) params.principalN = principalN;
  if (beta !== undefined) params.velocityFraction = beta;
  if (temperatureK !== undefined) params.temperatureK = temperatureK;
  if (activationEnergyKJ !== undefined) params.activationEnergyKJ = activationEnergyKJ;
  if (protonNumber !== undefined) params.protonNumber = protonNumber;
  if (neutronNumber !== undefined) params.neutronNumber = neutronNumber;
  if (kardashevType !== undefined) params.kardashevType = kardashevType;
  if (formula !== undefined) params.formula = formula;
  if (chemicalPotential !== undefined) params.chemicalPotential = chemicalPotential;
  if (hopping !== undefined) params.hopping = hopping;
  if (pairing !== undefined) params.pairing = pairing;

  const base = { contractVersion: EXPERIMENT_FABRIC_VERSION, sourceText, operation: operationFor(normalized), seed } as const;
  const request = (domainId: string, modelId: string | undefined, requestedVisualization: StructuredExperimentRequest['requestedVisualization'], allowed: readonly string[]): StructuredExperimentRequest => ({
    ...base, domainId, modelId, requestedVisualization, parameters: only(params, allowed),
  });

  if (/(?:powódź|powodz|pożar|pozar|trzęsienie|trzesienie|blackout|kaskad[a-ząćęłńóśźż]*|ewakuacj[a-ząćęłńóśźż]*)/.test(normalized)) {
    return request('hazard-cascade', undefined, 'world-3d', []);
  }
  if (/(?:efekt motyla|butterfly effect|chaos deterministyczny|warunk(?:i|ów) początkow(?:e|ych)|warunk(?:i|ow) poczatkow(?:e|ych))/.test(normalized)) {
    return request('classical-mechanics', undefined, 'graph', []);
  }
  if (/(?:tesla|silnik indukcyjny|prąd przemienny|prad przemienny|układ wielofazowy|uklad wielofazowy)/.test(normalized)) {
    return request('electrodynamics', undefined, 'graph', []);
  }
  if (/(?:podświadomość|podswadomosc|psychologiczny efekt obserwatora|wewnętrzny termostat|wewnetrzny termostat)/.test(normalized)) {
    return request('biology', undefined, 'narrative', []);
  }
  if (/(?:epidem[a-ząćęłńóśźż]*|seir|seird|\bsir\b|zakaż[a-ząćęłńóśźż]*|zakaz[a-ząćęłńóśźż]*|rozwój epidemii|rozwoj epidemii)/.test(normalized)) {
    return request('biology', 'epidemic-city', 'world-3d', ['r0', 'horizonDays', 'nAgents']);
  }
  if (/\b(przepływ wody|przeplyw wody|pompa|rurociąg|rurociag|darcy|reynolds)\b/.test(normalized)) {
    return request('engineering-water', 'water-pump-pipe', 'graph', ['volumetricFlow', 'pipeDiameter', 'pipeLength', 'pipeRoughnessMm', 'staticLift', 'fluidDensity', 'fluidViscosity', 'pumpEfficiency']);
  }
  if (/(?:masa chirp|chirp|isco|fala grawitacyjna|fale grawitacyjne)/.test(normalized)) {
    return request('spacetime-einstein', 'einstein-chirp-mass', 'scene-3d', ['m1Solar', 'm2Solar']);
  }
  if (/(?:dylatac[a-ząćęłńóśźż]*|lorentz[a-ząćęłńóśźż]*|skróceni[a-ząćęłńóśźż]* długości|skroceni[a-ząćęłńóśźż]* dlugosci|szczególn[a-ząćęłńóśźż]* teori[a-ząćęłńóśźż]* względności|szczegoln[a-ząćęłńóśźż]* teori[a-ząćęłńóśźż]* wzglednosci)/.test(normalized)) {
    return request('spacetime-einstein', 'sr-lorentz', 'graph', ['velocityFraction', 'properTimeSeconds', 'restLengthMeters']);
  }
  if (/(?:czarna dziura|schwarzschild[a-ząćęłńóśźż]*|czasoprzestrzeń|czasoprzestrzen[a-ząćęłńóśźż]*|zakrzywieni[a-ząćęłńóśźż]*)/.test(normalized)) {
    return request('spacetime-einstein', 'einstein-schwarzschild', 'scene-3d', ['massSolar']);
  }
  if (/(?:ucieczka atmosfery|atmosfer[a-ząćęłńóśźż]*|parametr jeansa|albedo)/.test(normalized)) {
    return request('universe', 'universe-atmospheric-escape', 'graph', ['stellarLuminositySolar', 'orbitalDistanceAu', 'planetAlbedo', 'planetMassEarth', 'planetRadiusEarth', 'moleculeMassAmu']);
  }
  if (/(?:orbit[a-ząćęłńóśźż]*|układ planetarny|uklad planetarny|kepler[a-ząćęłńóśźż]*|planet[a-ząćęłńóśźż]*)/.test(normalized)) {
    if (massSolar !== undefined) params.centralMassSolar = massSolar;
    return request('universe', 'universe-kepler', 'scene-3d', ['centralMassSolar', 'orbitalRadiusAu']);
  }
  if (/(?:jądr[a-ząćęłńóśźż]*|jadr[a-ząćęłńóśźż]*|nuklid[a-ząćęłńóśźż]*|energi[a-ząćęłńóśźż]* wiązani[a-ząćęłńóśźż]*|energi[a-ząćęłńóśźż]* wiazani[a-ząćęłńóśźż]*|semf)/.test(normalized)) {
    return request('nuclear', 'nuclear-semf', 'scene-3d', ['protonNumber', 'neutronNumber']);
  }
  if (/(?:cząstk[a-ząćęłńóśźż]*|czastk[a-ząćęłńóśźż]*|lepton[a-ząćęłńóśźż]*|kwark[a-ząćęłńóśźż]*|relatywistyczn[a-ząćęłńóśźż]* energi[a-ząćęłńóśźż]*|pęd cząstk[a-ząćęłńóśźż]*|ped czastk[a-ząćęłńóśźż]*)/.test(normalized)) {
    return request('particle', 'particle-relativistic-energy', 'scene-3d', ['restMassMeV', 'velocityFraction']);
  }
  if (/(?:arrhenius[a-ząćęłńóśźż]*|kinetyk[a-ząćęłńóśźż]* reakcj[a-ząćęłńóśźż]*|energi[a-ząćęłńóśźż]* aktywacj[a-ząćęłńóśźż]*|szybkoś[a-ząćęłńóśźż]* reakcj[a-ząćęłńóśźż]*|szybkos[a-ząćęłńóśźż]* reakcj[a-ząćęłńóśźż]*)/.test(normalized)) {
    return request('chemistry', 'chemistry-arrhenius', 'graph', ['temperatureK', 'activationEnergyKJ', 'preExponentialLog10']);
  }
  if (/(?:mas[a-ząćęłńóśźż]* molow[a-ząćęłńóśźż]*|wz[oó]r[a-ząćęłńóśźż]* sumaryczn[a-ząćęłńóśźż]*)/.test(normalized)) {
    return request('chemistry', 'chem-molecular-weight', 'graph', ['formula']);
  }
  if (/\b(atom|wodór|wodor|orbital atomowy|bohr)\b/.test(normalized)) {
    return request('atom', 'atom-bohr', 'scene-3d', ['atomicNumber', 'principalN']);
  }
  if (/\b(foton|energia fotonu|promieniowanie)\b/.test(normalized) && !/\bfala elektromagnetyczna\b/.test(normalized)) {
    return request('electrodynamics', 'photon-energy', 'graph', ['wavelengthNm']);
  }
  if (/\b(rozkład normalny|rozklad normalny|gauss|z-score|z score)\b/.test(normalized)) {
    return request('mathematics', 'math-gaussian', 'graph', ['mean', 'sigma', 'xValue']);
  }
  if (/\b(wzrost logistyczny|logistyczn[a-ząćęłńóśźż]* populacj|pojemność środowiska|pojemnosc srodowiska)\b/.test(normalized)) {
    return request('biology', 'biology-logistic', 'graph', ['growthRate', 'carryingCapacity', 'initialPopulation', 'timeElapsed']);
  }
  if (/\b(kardaszew|kardashev|cywilizacja typu)\b/.test(normalized)) {
    return request('civilization', 'civilization-kardashev', 'narrative', ['kardashevType']);
  }
  if (/\b(majorana\s*1|topoconductor|urządzenie majorana|urzadzenie majorana)\b/.test(normalized)) return request('quantum', undefined, 'graph', []);
  if (/(?:kitaev[a-ząćęłńóśźż]*|łańcuch kitaeva|lancuch kitaeva)/.test(normalized)) return request('quantum', 'quantum-kitaev-bulk', 'graph', ['chemicalPotential', 'hopping', 'pairing']);
  if (/\b(tunelowanie|równanie schrödingera|rownanie schrodingera)\b/.test(normalized)) return request('quantum', undefined, 'graph', []);
  if (/\b(fala elektromagnetyczna|maxwell|pole elektromagnetyczne)\b/.test(normalized)) return request('electrodynamics', undefined, 'graph', []);
  if (/\b(termodynam|entropia|ciepło|cieplo)\b/.test(normalized)) return request('thermodynamics', undefined, 'graph', []);
  return request('unknown', undefined, 'narrative', []);
}
