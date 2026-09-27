import type { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { createLedgerSink } from '../scientificWorlds/biologyRunners';
import type { LabEpistemicStatus, LabEvidenceEvent, LabEvidencePort } from './labRuntime';

/**
 * D-140 real-repo binding: `LabEvidencePort` implemented on top of the ONE canonical
 * `EvidenceLedger` via the ALREADY-EXISTING `createLedgerSink` adapter
 * (`core/scientificWorlds/biologyRunners.ts`). No new ledger, no new sink logic — this only
 * translates D-140's `LabEvidenceEvent` shape into the `EvidenceRecordInput` that sink already
 * accepts.
 *
 * `ledger` is an explicit parameter, exactly like every other kernel `AnalysisProvider` factory in
 * this repo (`colliderProvider(ledger)`, `molecularBiologyProvider(ledger)`, ...) — never imported
 * as a singleton from `core/agent/cyberReasoningKernel.ts` directly, since that module is itself the
 * production caller that registers `core/lab`'s provider (`genesisLabProvider.ts`): importing
 * `kernelLedger` from there here would close an ESM import cycle back to this module tree.
 * `genesisLabProvider.ts` passes the SAME `kernelLedger` singleton it receives from
 * `cyberReasoningKernel.ts`'s registration call, so this is still the one canonical ledger — just
 * injected, not imported.
 */

/** Rough, documented confidence prior per epistemic status — MEASURED and REPLAY reproduce/observe
 * an already-real value; SIMULATION/HYBRID_DERIVED are model-mediated, so their prior is lower. */
function confidenceFor(status: LabEpistemicStatus): number {
  switch (status) {
    case 'MEASURED': return 1;
    case 'REPLAY': return 1;
    case 'HYBRID_DERIVED': return 0.85;
    case 'SIMULATION': return 0.7;
  }
}

export function createGenesisLabEvidencePort(ledger: EvidenceLedger, worldId = 'd140-real-laboratory'): LabEvidencePort {
  const sink = createLedgerSink(ledger, worldId);
  return {
    emit(event: LabEvidenceEvent): void {
      sink.addRecord({
        sourceUrl: `genesis://lab/d140/${event.type.toLowerCase().replace(/_/g, '-')}`,
        claim: `D-140 ${event.type}: modelId=${event.modelId} solverId=${event.solverId} epistemicStatus=${event.epistemicStatus} inputFingerprint=${event.inputFingerprint} resultFingerprint=${event.resultFingerprint}`,
        claimType: event.evidenceClass.toLowerCase(),
        confidence: confidenceFor(event.epistemicStatus),
        provenance: {
          evidenceClass: event.evidenceClass,
          limitations: event.limitations,
          assumptions: event.assumptions,
          sources: event.provenance,
        },
      });
    },
  };
}
