import type { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { canonicalJson } from '../../events/hash';
import type { ExperimentRunResult, ExperimentRunner, SessionInputs } from '../experimentSession';
import { regenerativeBayExperimentRunner } from './regenerativeMedicineBayRunner';
import type { RegenerativeBayArtifact, RegenerativeBayRunResult } from './regenerativeMedicineBay';

/**
 * Canonical Evidence-backed adapter for the bay.
 * The deterministic model runner stays pure; this adapter attaches the single existing EvidenceLedger.
 * The claim is explicitly model/simulation and never promotes output to REAL_OBSERVATION.
 */
export function createRegenerativeBayExperimentRunner(worldId: string, ledger: EvidenceLedger): ExperimentRunner<RegenerativeBayArtifact> {
  return (experimentId, seed, inputs: SessionInputs): ExperimentRunResult<RegenerativeBayArtifact> => {
    const result: RegenerativeBayRunResult = regenerativeBayExperimentRunner(experimentId, seed, inputs);
    // FIX ON INTEGRATION: the delivered package's `provenance` object literal carried `worldId`/
    // `experimentId`/`seed`/`epistemicStatus` fields the real `ProvenanceInfo` type
    // (`packages/core/src/knowledge/evidenceTypes.ts`) does not declare — TypeScript's excess-property
    // check on an object literal would reject this call outright. `biologyRunners.ts`'s own
    // `addRecord` wrapper hits the exact same shape and already solves it the same way: fold the
    // extra context into the claim string instead of the provenance object.
    const record = ledger.addRecord({
      sourceUrl: `genesis://worlds/${worldId}/regenerative-bay/${experimentId}`,
      sourceTimestamp: null,
      claim: `Deterministic ${result.epistemicStatus.toLowerCase()} run ${experimentId} seed=${seed} outputs=${canonicalJson(result.outputs)} worldId=${worldId} epistemicStatus=${result.epistemicStatus}`,
      claimType: 'model',
      confidence: 1,
      provenance: {
        sourceKind: 'dataset',
        retrievedBy: 'genesis-regenerative-bay-model',
        independentSourceIds: [],
      },
    });
    return { ...result, evidenceHashes: [record.record.contentHash], artifact: result.artifact };
  };
}
