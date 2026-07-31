/**
 * Campaign-scoped Scientific Query Planner (Corpus Mandate Phases 8–9).
 * Produces a REPRODUCIBLE, deterministically-serialisable source acquisition plan from a
 * research problem. It never asks a model to "find useful science": if a model is available it
 * may PROPOSE query expansions, but those are marked model-generated PLANNING output — never
 * evidence. The final normalized plan is deterministic (stable key order, sorted queries).
 */
import { canonicalHash } from '../provenance.mjs';
import { SOURCE_SERVICE } from './sourcePort.mjs';

export const QUERY_PLAN_VERSION = 'genesis-query-plan/1';

const uniqSort = (arr) => [...new Set((arr ?? []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()))].sort();

/**
 * plan({ campaignId, projectId, researchQuestion, concepts:{target,protein,chemical,disease,organism},
 *        dateConstraints, inclusionRules, exclusionRules, modelExpansions })
 * modelExpansions (if any) are recorded SEPARATELY and labelled model-generated.
 */
export function planQueries(input = {}) {
  const concepts = input.concepts ?? {};
  const targetConcepts = uniqSort(concepts.target);
  const proteinConcepts = uniqSort(concepts.protein);
  const chemicalConcepts = uniqSort(concepts.chemical);
  const diseaseConcepts = uniqSort(concepts.disease);
  const organismConstraints = uniqSort(concepts.organism);
  const terms = uniqSort([...targetConcepts, ...proteinConcepts, ...diseaseConcepts, ...(input.terms ?? [])]);

  // Deterministic per-source queries derived from the concepts (no model call).
  const sourceQueries = [
    { sourceService: SOURCE_SERVICE.EUROPE_PMC, query: terms.join(' AND ') || null, kind: 'literature' },
    { sourceService: SOURCE_SERVICE.UNIPROT, query: proteinConcepts.join(' ') || null, kind: 'protein' },
    { sourceService: SOURCE_SERVICE.RCSB_PDB, query: proteinConcepts.join(' ') || null, kind: 'structure' },
    { sourceService: SOURCE_SERVICE.CHEMBL, query: (targetConcepts[0] ?? null), kind: 'bioactivity' },
    { sourceService: SOURCE_SERVICE.PUBCHEM, query: chemicalConcepts.join(' ') || null, kind: 'compound' },
  ].filter((q) => q.query);

  const core = {
    queryPlanVersion: QUERY_PLAN_VERSION,
    campaignId: input.campaignId ?? null, projectId: input.projectId ?? null,
    researchQuestion: input.researchQuestion ?? null,
    targetConcepts, proteinConcepts, chemicalConcepts, diseaseConcepts, organismConstraints,
    dateConstraints: input.dateConstraints ?? null,
    inclusionRules: uniqSort(input.inclusionRules), exclusionRules: uniqSort(input.exclusionRules),
    sourceQueries,
    sourceCapabilities: Object.values(SOURCE_SERVICE),
    // Model expansions are NOT part of the deterministic core hash and are clearly separated.
    modelProposedExpansions: Array.isArray(input.modelExpansions) ? input.modelExpansions.map((x) => ({ term: String(x), origin: 'MODEL_GENERATED_PLANNING (not evidence)' })) : [],
  };
  const planHash = canonicalHash({ ...core, modelProposedExpansions: undefined }); // deterministic, model-free
  return { ...core, planHash };
}
