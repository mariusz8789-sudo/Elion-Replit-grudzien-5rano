import type { MetaEvidenceEvent } from './types.js';

/**
 * PRODUCTION CONTRACT: in the real Genesis repo, this port MUST be bound to the
 * canonical Evidence Ledger (`packages/core/src/knowledge/EvidenceLedger.ts`, via the
 * same `openKernelLedger`/`kernelLedger` persistence pattern D-140's
 * `genesisEvidencePort.ts` already established). `AppendOnlyMetaMemory`
 * (`memory.ts`) is NOT a substitute for this binding — see its file header.
 */
export interface EvidencePort {
  append(event: MetaEvidenceEvent): Promise<void>;
}

export interface CanonicalCapabilityPort {
  listCapabilities(): Promise<readonly {
    capabilityId: string;
    availability: 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN';
    provider?: string;
    reason?: string;
  }[]>;
}

export interface CanonicalGoalPort {
  listGoals(): Promise<readonly {
    goalId: string;
    description: string;
    status: 'ACTIVE' | 'BLOCKED' | 'SATISFIED' | 'ABANDONED';
    requiredCapabilities: readonly string[];
    successCriteria: readonly string[];
  }[]>;
}
