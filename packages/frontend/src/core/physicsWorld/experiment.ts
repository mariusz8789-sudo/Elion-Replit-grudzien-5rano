import { FailClosedError, type ExperimentDefinition, type ExperimentRecord, type ResultDataset } from './contracts';
import { fingerprintOf, mulberry32, sealModelCard, validateParams } from './core';
import { requireBackend } from './backends';
import { MODEL_REGISTRY } from './models';

const EMPTY_RESULT = (observable: string): ResultDataset => ({ observable, unit: 'none', values: [], summary: {}, uncertainty: {} });

/**
 * Runs one experiment. Validates parameters, requires a genuinely available
 * backend (never a silent toy fallback — see `backends.ts`), seals the
 * model's card, and computes a `reproducibilityFingerprint` covering the
 * definition, the sealed card hash, and the result — so any later change to
 * any of the three is detectable. Throws `FailClosedError` on any failure;
 * never returns a substitute or partial result.
 *
 * HARDENING (found while porting the R-test suite, not present in the
 * source bundle): `validateParams` only checks params that ARE present in
 * `def.parameters` — a param a model needs but the caller omitted entirely
 * slips past it and previously surfaced as a raw, untyped `Error` from
 * inside the model's own run function (e.g. `models.ts`'s `P()` helper),
 * breaking the "every failure is a `FailClosedError`" contract this module
 * exists to guarantee. The try/catch below closes that gap: any error the
 * model itself throws is now surfaced as `FailClosedError('PARAMS', ...)`,
 * since with a validated, available backend already confirmed, a failure
 * inside the model can only be a parameter/domain problem.
 */
export function runExperiment(def: ExperimentDefinition, createdAt = '1970-01-01T00:00:00Z'): ExperimentRecord {
  validateParams(def.parameters);
  const entry = MODEL_REGISTRY[def.modelId];
  if (!entry) throw new FailClosedError(`unknown model '${def.modelId}'`, 'MODEL');
  requireBackend(entry.card, def);

  const modelCardHash = sealModelCard(entry.card);
  let result: ResultDataset;
  try {
    result = entry.run(def, mulberry32(def.seed));
  } catch (e) {
    if (e instanceof FailClosedError) throw e;
    throw new FailClosedError(`model '${entry.card.modelId}' failed to run: ${String(e instanceof Error ? e.message : e)}`, 'PARAMS');
  }

  const rec: ExperimentRecord = {
    experimentId: def.experimentId,
    modelId: entry.card.modelId,
    modelVersion: entry.card.modelVersion,
    parameters: def.parameters,
    assumptions: entry.card.assumptions,
    numericalMethod: entry.card.numericalMethod,
    seed: def.seed,
    provenance: def.provenance,
    uncertainty: result.uncertainty,
    result,
    modelCardHash,
    reproducibilityFingerprint: fingerprintOf({ def, card: modelCardHash, result }),
    createdAt,
    status: 'COMPLETED',
    disclosure: entry.card.disclosure,
    toy: entry.card.toy,
  };
  return Object.freeze(rec);
}

/**
 * Never throws. On any failure returns an explicit, frozen record with an
 * empty result and `status` of `FAILED_CLOSED` or `ADAPTER_UNAVAILABLE` —
 * the honest "no result" record `requireBackend`/`validateParams` already
 * guarantee, never a faked or partial one.
 */
export function runExperimentSafe(def: ExperimentDefinition, createdAt = '1970-01-01T00:00:00Z'): ExperimentRecord {
  try {
    return runExperiment(def, createdAt);
  } catch (e) {
    const code = e instanceof FailClosedError ? e.code : 'MODEL';
    const status = code === 'ADAPTER_UNAVAILABLE' ? 'ADAPTER_UNAVAILABLE' : 'FAILED_CLOSED';
    const entry = MODEL_REGISTRY[def.modelId];
    const rec: ExperimentRecord = {
      experimentId: def.experimentId,
      modelId: def.modelId,
      modelVersion: entry?.card.modelVersion ?? 'unknown',
      parameters: def.parameters,
      assumptions: entry?.card.assumptions ?? [],
      numericalMethod: entry?.card.numericalMethod ?? 'none',
      seed: def.seed,
      provenance: def.provenance,
      uncertainty: {},
      result: EMPTY_RESULT(def.observable),
      modelCardHash: entry ? sealModelCard(entry.card) : 'none',
      reproducibilityFingerprint: fingerprintOf({ def, failed: String(e) }),
      createdAt,
      status,
      disclosure: entry?.card.disclosure ?? 'NO RESULT — failed closed; nothing was computed',
      toy: entry?.card.toy ?? false,
      failReason: String(e),
    };
    return Object.freeze(rec);
  }
}

/** Real re-run (item 4/R10-R11): re-executes `def` and compares the resulting fingerprint and status against `original`. Never a stubbed `return true`. */
export function replay(def: ExperimentDefinition, original: ExperimentRecord): boolean {
  const again = runExperiment(def, original.createdAt);
  return again.reproducibilityFingerprint === original.reproducibilityFingerprint && again.status === original.status;
}
