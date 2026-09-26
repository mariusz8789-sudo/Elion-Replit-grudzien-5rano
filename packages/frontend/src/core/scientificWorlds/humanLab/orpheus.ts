import type { EvidenceSink } from './contracts';
import type { OrpheusRunRequest, OrpheusRunResult, Specimen } from './types';
import { seededRandom, stableHash } from './hash';

export class OrpheusAnalyzer {
  constructor(private readonly evidenceSink?: EvidenceSink) {}

  run(request: OrpheusRunRequest, specimen: Specimen): OrpheusRunResult {
    if (specimen.specimenId !== request.specimenId) throw new Error('ORPHEUS_SPECIMEN_MISMATCH');
    const rnd = seededRandom(request.seed);
    const metrics = [
      { name: 'signal_index', value: 0.15 + rnd() * 0.7, unit: 'a.u.' },
      { name: 'texture_complexity', value: 0.2 + rnd() * 0.6, unit: 'a.u.' },
      { name: 'feature_density', value: 10 + rnd() * 90, unit: 'features/mm²' },
      { name: 'model_confidence', value: 0.55 + rnd() * 0.4, unit: 'fraction' },
    ];
    const outputHash = stableHash({ request, specimen, metrics });
    const evidenceIds: string[] = [];
    const evidenceHashes: string[] = [];
    if (this.evidenceSink) {
      const ev = this.evidenceSink.addRecord({
        sourceUrl: 'genesis://orpheus',
        sourceTimestamp: new Date().toISOString(),
        claim: `ORPHEUS run ${request.runId} completed against specimen ${request.specimenId}.`,
        claimType: 'INSTRUMENT_RESULT',
        confidence: 1,
        provenance: { request, specimenId: specimen.specimenId, metrics, outputHash, epistemic: 'SIMULATION' },
      });
      evidenceIds.push(ev.record.id);
      evidenceHashes.push(ev.record.contentHash);
    }
    return {
      runId: request.runId,
      specimenId: request.specimenId,
      protocolId: request.protocolId,
      outputMetrics: metrics,
      evidenceIds,
      evidenceHashes,
      outputHash,
      status: 'COMPLETED',
      epistemic: 'SIMULATION',
      replayFingerprint: stableHash({ request, specimenId: specimen.specimenId, outputHash }),
    };
  }
}

export function orpheusOverview(): Readonly<Record<string, string>> {
  return {
    visualIdentity: 'Central sealed chamber with robotic manipulators, optical head, sample carousel, ring light and diagnostic compute display.',
    role: 'Conceptual multimodal instrument for deterministic simulation of specimen analysis.',
    rule: 'Never claims to perform physical wet-lab work or produce validated clinical findings.',
  };
}
