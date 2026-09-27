import type { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { canonicalJson, fnv1a } from '../events/hash';
import { createGenesisLabEvidencePort } from './genesisEvidencePort';
import type { LabRuntime } from './labRuntime';

/**
 * D-140 real-repo binding: `LabRuntime` built entirely from canonical Genesis primitives —
 * `canonicalJson`/`fnv1a` (`core/events/hash.ts`, the SAME determinism helpers
 * `core/scienceMemory.ts::contentHash` and every other content-addressed id in this repo already
 * use) for `deterministic`, and the real ledger-backed port for `evidence`. No second canonicalizer,
 * no second fingerprint algorithm. `ledger` is injected (the production caller,
 * `genesisLabProvider.ts`, passes the one canonical `kernelLedger`), never imported as a singleton —
 * see `genesisEvidencePort.ts`'s doc comment for why.
 */
export function createGenesisLabRuntime(ledger: EvidenceLedger, worldId = 'd140-real-laboratory'): LabRuntime {
  return {
    deterministic: {
      canonicalize: (value: unknown): string => canonicalJson(value),
      fingerprint: (value: unknown): string => `fnv32a:${fnv1a(canonicalJson(value))}`,
    },
    evidence: createGenesisLabEvidencePort(ledger, worldId),
  };
}
