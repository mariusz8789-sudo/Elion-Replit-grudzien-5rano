import { canonicalHash } from '../provenance.mjs';
import { DISPATCH_STATE, executeCapability } from './scientificCapabilityContract.mjs';

export const LOCAL_EXECUTOR_VERSION = 'local-canonical-executor@1';

export function createLocalCanonicalScientificExecutor({ execute = executeCapability } = {}) {
  return Object.freeze({
    async execute({ capabilityId, input, signal = null }) {
      if (signal?.aborted) return { ok: false, state: DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE, error: 'REQUEST_ABORTED' };
      const outcome = execute(capabilityId, input);
      if (!outcome?.ok) return outcome;
      const environmentIdentity = canonicalHash({
        adapterVersion: LOCAL_EXECUTOR_VERSION,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        engine: outcome.engine,
      });
      return { ...outcome, state: DISPATCH_STATE.LOCAL_EXECUTION, environmentFingerprint: environmentIdentity };
    },
  });
}
