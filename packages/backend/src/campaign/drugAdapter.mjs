/**
 * Adapter kampanii DRUG_DISCOVERY (P4). Realna ścieżka RDKit: kanonizacja,
 * deterministyczne transformacje reakcyjne, walidacja struktur, deskryptory,
 * różnorodność (Tanimoto). Wektor celu to optymalizacja WIELOPARAMETROWA do
 * PROFILU DOCELOWEGO (benchmark walidujący zachowanie wyszukiwania) — NIE
 * deklaracja skuteczności terapeutycznej. Zero mutacji SMILES jako tekstu.
 */
import { transform, validate, descriptors, diversity, listTransformations } from '../compute/rdkitAdapter.mjs';

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
  for (const parent of parentSmilesList) {
    for (const t of enabled) {
      attempts[t] = (attempts[t] ?? 0) + 1;
      const r = transform(parent, t);
      if (!r.ok) continue;
      const products = [...new Set(r.products)].sort().slice(0, maxPerTransform);
      for (const p of products) {
        proposals.push({ parentSmiles: r.parentCanonical, transformation: t, canonicalSmiles: p });
        successes[t] = (successes[t] ?? 0) + 1;
      }
    }
  }
  return { proposals, attempts, successes };
}
