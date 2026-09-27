import { FailClosedError, type BioExperimentDefinition, type BioExperimentRecord, type BioResult } from './contracts';
import { fingerprintOf, sealModelCard, validateParams } from './core';
import { BIO_REGISTRY } from './models';

const EMPTY_RESULT = (observable: string): BioResult => ({ observable, unit: 'none', values: [], summary: {}, uncertainty: {} });

/**
 * Runs one in-silico experiment. Validates parameters, requires explicit
 * `toyAccepted: true` (every model here is a toy — pipeline-validation
 * only), seals the model's card, and computes a `reproducibilityFingerprint`
 * covering the definition, the sealed card hash, and the result. Throws
 * `FailClosedError` on any failure; never returns a substitute result.
 *
 * The model's own `run()` is wrapped so any error it throws (e.g. a
 * required parameter silently omitted from the definition, which slips
 * past `validateParams` because it only checks params that ARE present —
 * the same hardening gap found and fixed in the retired physicsWorld runtime (removed),
 * D-052) is re-surfaced as `FailClosedError('PARAMS', ...)`, not a raw,
 * untyped `Error`.
 */
export function runBioExperiment(def: BioExperimentDefinition, createdAt = '1970-01-01T00:00:00Z'): BioExperimentRecord {
  validateParams(def.parameters);
  const entry = BIO_REGISTRY[def.modelId];
  if (!entry) throw new FailClosedError(`unknown model '${def.modelId}'`, 'MODEL');
  if (def.toyAccepted !== true) {
    throw new FailClosedError(`toy model '${def.modelId}' requires explicit def.toyAccepted=true (pipeline-validation ONLY)`, 'TOY_NOT_ACCEPTED');
  }

  const cardHash = sealModelCard(entry.card);
  let result: BioResult;
  try {
    result = entry.run(def);
  } catch (e) {
    if (e instanceof FailClosedError) throw e;
    throw new FailClosedError(`model '${entry.card.modelId}' failed to run: ${String(e instanceof Error ? e.message : e)}`, 'PARAMS');
  }

  const rec: BioExperimentRecord = {
    experimentId: def.experimentId,
    pillar: def.pillar,
    modelId: entry.card.modelId,
    modelVersion: entry.card.modelVersion,
    parameters: def.parameters,
    assumptions: entry.card.assumptions,
    numericalMethod: entry.card.numericalMethod,
    seed: def.seed,
    provenance: def.provenance,
    uncertainty: result.uncertainty,
    result,
    modelCardHash: cardHash,
    reproducibilityFingerprint: fingerprintOf({ def, card: cardHash, result }),
    createdAt,
    status: 'COMPLETED',
    disclosure: entry.card.disclosure,
    toy: true,
    evidenceClass: 'IN_SILICO_MODEL',
  };
  return Object.freeze(rec);
}

/** Never throws. On any failure returns an explicit, frozen FAILED_CLOSED record with an empty result — never faked. */
export function runBioSafe(def: BioExperimentDefinition, createdAt = '1970-01-01T00:00:00Z'): BioExperimentRecord {
  try {
    return runBioExperiment(def, createdAt);
  } catch (e) {
    const entry = BIO_REGISTRY[def.modelId];
    const rec: BioExperimentRecord = {
      experimentId: def.experimentId,
      pillar: def.pillar,
      modelId: def.modelId,
      modelVersion: entry?.card.modelVersion ?? 'unknown',
      parameters: def.parameters,
      assumptions: entry?.card.assumptions ?? [],
      numericalMethod: 'none',
      seed: def.seed,
      provenance: def.provenance,
      uncertainty: {},
      result: EMPTY_RESULT(def.observable),
      modelCardHash: 'none',
      reproducibilityFingerprint: fingerprintOf({ def, failed: String(e) }),
      createdAt,
      status: 'FAILED_CLOSED',
      disclosure: entry?.card.disclosure ?? 'NO RESULT — failed closed; nothing was computed',
      toy: true,
      evidenceClass: 'IN_SILICO_MODEL',
      failReason: String(e),
    };
    return Object.freeze(rec);
  }
}

/** Real re-run: re-executes `def` and compares the resulting fingerprint against `original`. */
export const replayBio = (def: BioExperimentDefinition, original: BioExperimentRecord): boolean =>
  runBioExperiment(def, original.createdAt).reproducibilityFingerprint === original.reproducibilityFingerprint;

/**
 * Mandate item 3: IN_SILICO_MODEL evidence never satisfies evidence-minimum
 * for a WINNER. Since every record this module produces carries
 * `evidenceClass: 'IN_SILICO_MODEL'` unconditionally, this predicate is
 * true for any set of records from this module — asserted explicitly
 * (rather than left implicit) so a future change that widens the type
 * cannot silently break the guarantee without this check catching it.
 */
export const inSilicoOnlyInsufficient = (records: readonly BioExperimentRecord[]): boolean =>
  records.every((r) => r.evidenceClass === 'IN_SILICO_MODEL');
