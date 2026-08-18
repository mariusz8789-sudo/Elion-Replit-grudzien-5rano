import { EXPERIMENT_FABRIC_VERSION, type ExperimentOperation, type StructuredExperimentRequest } from './types';

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

/**
 * Deterministic NL → StructuredExperimentRequest. It is deliberately a
 * constrained parser, not an LLM: an unrecognised request remains explicit
 * and cannot cause a made-up model or output.
 */
export function parseScienceChatMessage(text: string): StructuredExperimentRequest {
  const sourceText = text.trim();
  const normalized = sourceText.toLocaleLowerCase('pl-PL');
  const parameters: Record<string, number> = {};
  const seed = firstNumber(normalized, /\bseed\s*[=:]?\s*(\d+)/);
  if (seed !== undefined) parameters.seed = seed;
  const r0 = firstNumber(normalized, /\br[₀0]\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
  if (r0 !== undefined) parameters.r0 = r0;
  const horizonDays = firstNumber(normalized, /\b(\d+(?:[.,]\d+)?)\s*(?:dni|dzień|dnia|days?)\b/);
  if (horizonDays !== undefined) parameters.horizonDays = horizonDays;
  const massSolar = firstNumber(normalized, /\b(\d+(?:[.,]\d+)?)\s*(?:mas(?:a|y)\s+słońca|masy slonca|m[_ ]?sun|msun|solar masses?)\b/);
  const radiusAu = firstNumber(normalized, /\b(\d+(?:[.,]\d+)?)\s*au\b/);
  const wavelengthNm = firstNumber(normalized, /\b(\d+(?:[.,]\d+)?)\s*nm\b/);
  const atomicNumber = firstNumber(normalized, /\bz\s*[=:]\s*(\d+)/);
  const principalN = firstNumber(normalized, /\bn\s*[=:]\s*(\d+)/);
  if (massSolar !== undefined) parameters.massSolar = massSolar;
  if (radiusAu !== undefined) parameters.orbitalRadiusAu = radiusAu;
  if (wavelengthNm !== undefined) parameters.wavelengthNm = wavelengthNm;
  if (atomicNumber !== undefined) parameters.atomicNumber = atomicNumber;
  if (principalN !== undefined) parameters.principalN = principalN;

  const base = {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    sourceText,
    operation: operationFor(normalized),
    parameters,
    seed,
  } as const;

  const requestsHazardCascade = /(?:powódź|powodz|pożar|pozar|trzęsienie|trzesienie|blackout|kaskad[a-ząćęłńóśźż]*|ewakuacj[a-ząćęłńóśźż]*)/.test(normalized);
  if (requestsHazardCascade) {
    return { ...base, domainId: 'hazard-cascade', requestedVisualization: 'world-3d' };
  }
  if (/(?:epidem[a-ząćęłńóśźż]*|seir|seird|\bsir\b|zakaż[a-ząćęłńóśźż]*|zakaz[a-ząćęłńóśźż]*|rozwój epidemii|rozwoj epidemii)/.test(normalized)) {
    return { ...base, domainId: 'biology', modelId: 'epidemic-city', requestedVisualization: 'world-3d' };
  }
  if (/\b(przepływ wody|przeplyw wody|pompa|rurociąg|rurociag|darcy|reynolds)\b/.test(normalized)) {
    return { ...base, domainId: 'engineering-water', modelId: 'water-pump-pipe', requestedVisualization: 'graph' };
  }
  if (/(?:czarna dziura|schwarzschild[a-ząćęłńóśźż]*|czasoprzestrzeń|czasoprzestrzen[a-ząćęłńóśźż]*|zakrzywieni[a-ząćęłńóśźż]*)/.test(normalized)) {
    return { ...base, domainId: 'spacetime-einstein', modelId: 'einstein-schwarzschild', requestedVisualization: 'scene-3d' };
  }
  if (/(?:orbit[a-ząćęłńóśźż]*|układ planetarny|uklad planetarny|kepler[a-ząćęłńóśźż]*|planet[a-ząćęłńóśźż]*)/.test(normalized)) {
    const params = { ...parameters };
    if (massSolar !== undefined) params.centralMassSolar = massSolar;
    delete params.massSolar;
    return { ...base, parameters: params, domainId: 'universe', modelId: 'universe-kepler', requestedVisualization: 'scene-3d' };
  }
  if (/\b(atom|wodór|wodor|orbital atomowy|bohr)\b/.test(normalized)) {
    return { ...base, domainId: 'atom', modelId: 'atom-bohr', requestedVisualization: 'scene-3d' };
  }
  if (/\b(foton|energia fotonu|promieniowanie)\b/.test(normalized) && !/\bfala elektromagnetyczna\b/.test(normalized)) {
    return { ...base, domainId: 'electrodynamics', modelId: 'photon-energy', requestedVisualization: 'graph' };
  }
  if (/\b(tunelowanie|równanie schrödingera|rownanie schrodingera)\b/.test(normalized)) {
    return { ...base, domainId: 'quantum', requestedVisualization: 'graph' };
  }
  if (/\b(fala elektromagnetyczna|maxwell|pole elektromagnetyczne)\b/.test(normalized)) {
    return { ...base, domainId: 'electrodynamics', requestedVisualization: 'graph' };
  }
  if (/\b(termodynam|entropia|ciepło|cieplo)\b/.test(normalized)) {
    return { ...base, domainId: 'thermodynamics', requestedVisualization: 'graph' };
  }
  return { ...base, domainId: 'unknown', requestedVisualization: 'narrative' };
}
