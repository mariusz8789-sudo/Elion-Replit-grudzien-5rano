/**
 * Adapter kampanii DRUG_DISCOVERY (P4). Realna ścieżka RDKit: kanonizacja,
 * deterministyczne transformacje reakcyjne, walidacja struktur, deskryptory,
 * różnorodność (Tanimoto). Wektor celu to optymalizacja WIELOPARAMETROWA do
 * PROFILU DOCELOWEGO (benchmark walidujący zachowanie wyszukiwania) — NIE
 * deklaracja skuteczności terapeutycznej. Zero mutacji SMILES jako tekstu.
 */
import { transform, validate, descriptors, diversity, listTransformations, bricsRecombine } from '../compute/rdkitAdapter.mjs';

export const DOMAIN_ID = 'DRUG_DISCOVERY';

/** Domyślny profil docelowy (MPO). Oba kryteria MINIMALIZOWANE. */
export const DEFAULT_OBJECTIVES = [
  { id: 'logp-distance', label: '|logP − cel|', targetProperty: 'crippenLogP', target: 2.5, scale: 1 },
  { id: 'mw-distance', label: '|MW − cel| / 100', targetProperty: 'molWt', target: 350, scale: 100 },
];

/** Domyślne twarde ograniczenia (naruszenia zapisywane, kandydat odrzucany). */
export const DEFAULT_CONSTRAINTS = [
  { id: 'mw-max', property: 'molWt', op: 'lte', value: 500 },
  { id: 'logp-range-hi', property: 'crippenLogP', op: 'lte', value: 5 },
  { id: 'logp-range-lo', property: 'crippenLogP', op: 'gte', value: -1 },
];

/** Punkt odniesienia dla hiperobjętości (gorszy niż realny front). */
export const HV_REFERENCE = [5, 5];

export function availableTransformations() {
  const r = listTransformations();
  return r.ok ? r.transformations : [];
}

/**
 * Rekombinacja fragmentów BRICS jako ŹRÓDŁO PROPOZYCJI o tych samych prawach
 * co transformacja: ma swoją wagę w `transformationWeights`, swoje
 * attempts/successes i swój wkład do frontu Pareto. Dzięki temu cała istniejąca
 * maszyneria adaptacji strategii (`nextExperiment.mjs` wyłącza nieproduktywne
 * źródła i wzmacnia te, które trafiają na front) obejmuje ją BEZ ŻADNEJ zmiany
 * tam — nowe źródło, nie druga ścieżka obok pętli.
 */
export const RECOMBINATION_SOURCE = 'brics-recombination';

/**
 * Wszystkie źródła propozycji, którymi kampania może sterować wagami.
 * Rekombinacja dochodzi tylko wtedy, gdy RDKit realnie odpowiada — bez niego
 * lista jest pusta i kampania jest blokowana przez runtime, nie udaje.
 */
export function availableProposalSources() {
  const transformations = availableTransformations();
  return transformations.length > 0 ? [...transformations, RECOMBINATION_SOURCE].sort() : [];
}

/** Deterministyczne, nieuporządkowane pary rodziców (kanonicznie posortowane). */
export function parentPairs(parentSmilesList, maxPairs) {
  const parents = [...new Set(parentSmilesList)].sort();
  const pairs = [];
  for (let i = 0; i < parents.length; i++) {
    for (let j = i + 1; j < parents.length; j++) {
      pairs.push([parents[i], parents[j]]);
      if (pairs.length >= maxPairs) return pairs;
    }
  }
  return pairs;
}

/**
 * Propozycje z rekombinacji fragmentów. Rekombinujemy PARAMI, nie z całej puli
 * naraz, bo tylko wtedy rodowód produktu jest prawdziwy: każdy produkt pary
 * (A,B) pochodzi z fragmentów dokładnie tych dwóch cząsteczek. Rekombinacja z
 * jednej wspólnej puli byłaby wydajniejsza, ale nie dałoby się uczciwie
 * powiedzieć, od kogo pochodzi dany kandydat.
 *
 * Przy jednym rodzicu rekombinujemy jego własne fragmenty (coParentSmiles = null):
 * to nadal realne przeszukiwanie, po prostu węższe.
 */
export function generateRecombinationProposals(parentSmilesList, { maxPairs = 3, maxProductsPerPair = 3 } = {}) {
  const proposals = [];
  let attempts = 0;
  const unique = [...new Set(parentSmilesList)].sort();
  const groups = unique.length < 2 ? unique.map((p) => [p]) : parentPairs(unique, maxPairs);
  for (const group of groups) {
    attempts += 1;
    const r = bricsRecombine(group, { maxProducts: maxProductsPerPair });
    if (!r.ok) continue;
    // Rodowód zapisujemy w formie KANONICZNEJ, którą zwrócił sam RDKit — nie w tej,
    // w której wejście przyszło; inaczej ten sam rodzic miałby dwa zapisy w rodowodzie.
    const canonicalParents = Object.keys(r.fragmentsByParent ?? {});
    for (const product of r.products) {
      proposals.push({
        parentSmiles: canonicalParents[0] ?? group[0],
        coParentSmiles: canonicalParents[1] ?? null,
        transformation: RECOMBINATION_SOURCE,
        canonicalSmiles: product,
      });
    }
  }
  return { proposals, attempts, successes: proposals.length };
}

export function canonicalize(smiles) {
  const r = validate(smiles);
  return r.ok ? { ok: true, canonicalSmiles: r.canonicalSmiles } : { ok: false, error: r.error, reason: r.reason };
}

export function describe(smiles) {
  const r = descriptors(smiles);
  return r.ok ? { ok: true, data: r.data, engine: r.engine } : { ok: false, error: r.error, reason: r.reason };
}

export function objectiveVector(desc, objectives = DEFAULT_OBJECTIVES) {
  return objectives.map((o) => Math.abs((desc[o.targetProperty] ?? 0) - o.target) / (o.scale || 1));
}

export function constraintViolations(desc, constraints = DEFAULT_CONSTRAINTS) {
  const violations = [];
  for (const c of constraints) {
    const v = desc[c.property];
    if (v === undefined) continue;
    const ok = c.op === 'lte' ? v <= c.value : c.op === 'gte' ? v >= c.value : true;
    if (!ok) violations.push({ constraint: c.id, property: c.property, value: v, op: c.op, limit: c.value });
  }
  return violations;
}

export function populationDiversity(smilesList) {
  const r = diversity(smilesList);
  return r.ok ? r.meanPairwiseDistance : null;
}

/**
 * Generuje propozycje potomków z rodziców, honorując wagi transformacji
 * (waga 0 = transformacja WYŁĄCZONA — ważne dla dowodu, że strategia zmienia
 * wykonanie). Deterministyczne: transformacje enumerują pozycje, sortujemy
 * kanonicznie. Zwraca płaską listę { parentSmiles, transformation, canonicalSmiles }.
 */
export function generateProposals(parentSmilesList, transformationWeights, { maxPerTransform = 3 } = {}) {
  const enabled = Object.entries(transformationWeights)
    .filter(([, w]) => w > 0)
    .map(([t]) => t)
    .sort();
  const proposals = [];
  const attempts = {}; // transformation -> attempts
  const successes = {}; // transformation -> valid unique products

  // Rekombinacja jest sterowana tą samą wagą co transformacje: waga 0 = wyłączona.
  if (transformationWeights[RECOMBINATION_SOURCE] > 0) {
    const rec = generateRecombinationProposals(parentSmilesList, { maxProductsPerPair: maxPerTransform });
    attempts[RECOMBINATION_SOURCE] = rec.attempts;
    successes[RECOMBINATION_SOURCE] = rec.successes;
    proposals.push(...rec.proposals);
  }

  for (const parent of parentSmilesList) {
    for (const t of enabled) {
      if (t === RECOMBINATION_SOURCE) continue; // obsłużone wyżej, nie jest transformacją jednorodzicielską
      attempts[t] = (attempts[t] ?? 0) + 1;
      const r = transform(parent, t);
      if (!r.ok) continue;
      const products = [...new Set(r.products)].sort().slice(0, maxPerTransform);
      for (const p of products) {
        proposals.push({ parentSmiles: r.parentCanonical, coParentSmiles: null, transformation: t, canonicalSmiles: p });
        successes[t] = (successes[t] ?? 0) + 1;
      }
    }
  }
  return { proposals, attempts, successes };
}
