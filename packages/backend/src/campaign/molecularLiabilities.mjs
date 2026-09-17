/**
 * D-074 — REAL, RDKIT-NATIVE LIABILITY SOURCE FOR THE D-069 HARD FILTERS.
 *
 * WHY THIS MODULE EXISTS. `campaign/predictionHardFilters.mjs` (D-069 Option A)
 * was built, tested and frozen — and had ZERO production callers: the audit for
 * this mission found it imported only by its own test file. The reason was a
 * missing input, not a missing rule: its designed source
 * (`multiFidelity.mjs`'s ADMET-AI / docking estimates) reports
 * BLOCKED_BY_RUNTIME in every environment where those heavy models are not
 * installed, which is the case here (ADMET-AI, AutoDock Vina, PySCF all
 * absent — verified at runtime, not assumed). With no input, the filter could
 * never run, so the campaign loop silently had no prediction gate at all.
 *
 * WHAT THIS IS. A source of REAL, deterministic, published structural rules
 * computed by the SAME RDKit engine the campaign already runs for every
 * candidate (`compute/rdkitAdapter.mjs::liabilities` -> `rdkit_worker.py`'s
 * `liabilities` command): QED (Bickerton 2012), PAINS (Baell & Holloway 2010),
 * BRENK (Brenk 2008), NIH screening-deck alerts, Lipinski and Veber rules.
 * No new engine, no new dependency, no fitted model of ours.
 *
 * WHAT THIS IS NOT — AND THE NAMING RULE THAT KEEPS IT HONEST. These are
 * STRUCTURAL LIABILITY and ORAL-BIOAVAILABILITY proxies. They are NOT an
 * ADMET prediction, NOT a toxicity model, NOT target-specific, and they do NOT
 * substitute for ADMET-AI. That is why every term produced here lands in a
 * dedicated `liab` bucket rather than being smuggled into the `admet`/`tox`
 * buckets that `multiFidelity.mjs` fills with genuine MODEL_ESTIMATE output:
 * a reader of a rejection code must always be able to tell which kind of
 * evidence rejected the candidate. `evidenceClass` is COMPUTATIONAL
 * (deterministic rule evaluation), never MODEL_ESTIMATE.
 */

import { liabilities as rdkitLiabilities } from '../compute/rdkitAdapter.mjs';

/** The terms this source can supply, for the objective guard and for freezing. */
export const LIABILITY_TERMS = Object.freeze([
  'qed',
  'structuralAlertCount',
  'lipinskiViolations',
  'veberPass',
]);

export const LIABILITY_EVIDENCE_CLASS = 'COMPUTATIONAL';

/**
 * Builds a memoised `predictionsFor(smiles)` in exactly the shape
 * `predictionHardFilters.mjs::applyPredictionHardFilters` consumes. Memoised
 * because the campaign asks for the same canonical SMILES repeatedly and RDKit
 * is a real out-of-process call; the values are deterministic per structure,
 * so caching changes cost, never the result.
 *
 * Returns `null` for a structure RDKit refuses (invalid, or the engine itself
 * unavailable) — which the filter turns into an explicit `PREDICTION_MISSING`
 * rejection rather than a silent pass. That is the intended fail-closed path.
 */
export function createLiabilityPredictionSource() {
  const cache = new Map();
  const errors = new Map();
  const predictionsFor = (smiles) => {
    if (cache.has(smiles)) return cache.get(smiles);
    const r = rdkitLiabilities(smiles);
    if (!r.ok) {
      errors.set(smiles, r.error ?? 'unknown');
      cache.set(smiles, null);
      return null;
    }
    const value = Object.freeze({
      liab: Object.freeze({ ...r.data }),
      engine: r.engine,
      catalogs: r.catalogs,
      evidenceClass: LIABILITY_EVIDENCE_CLASS,
    });
    cache.set(smiles, value);
    return value;
  };
  return {
    predictionsFor,
    /** Read-only view for audit/report — never consulted by the filter itself. */
    computed: () => new Map(cache),
    errors: () => new Map(errors),
  };
}
