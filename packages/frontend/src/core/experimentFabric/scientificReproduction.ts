import { canonicalJson, fnv1a } from '../events/hash';
import type { ExperimentRun } from './types';

/**
 * Shared semantic fingerprint for repeated BACKEND_REAL_ENGINE executions.
 *
 * Backend run IDs are invocation-specific and are deliberately excluded. The
 * reviewed request, model/runtime identity and complete reported outcome stay
 * in scope. This fingerprint proves agreement of a bounded computation, not
 * scientific correctness, external replication, or real-world validity.
 */
export function backendSemanticReproductionFingerprint(run: ExperimentRun): string {
  return `reproduction_${fnv1a(canonicalJson({
    requestFingerprint: run.provenance.requestFingerprint,
    modelId: run.provenance.modelId ?? null,
    modelVersion: run.provenance.modelVersion ?? null,
    engine: run.provenance.engine ?? null,
    deterministic: run.provenance.deterministic,
    outputs: run.result.outputs,
    units: run.result.units,
    warnings: run.result.warnings,
    backendEngine: run.provenance.backendExecution?.backendEngine ?? null,
    backendModelVersion: run.provenance.backendExecution?.backendModelVersion ?? null,
    backendProvenance: run.provenance.backendExecution?.backendProvenance ?? null,
  }))}`;
}
