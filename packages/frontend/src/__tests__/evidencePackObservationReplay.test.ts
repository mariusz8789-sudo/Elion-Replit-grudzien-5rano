import { describe, expect, it } from 'vitest';
import {
  compareScientificEvidencePacks,
  getStoredEvidencePackReplayVerdict,
  type ScientificEvidencePack,
} from '../core/experimentFabric';
import { compareAme2020Observations } from '../core/observation/nuclearAme2020';

const comparison = compareAme2020Observations();

function pack(externalObservationComparison = comparison): ScientificEvidencePack {
  return {
    contractVersion: '1.0.0',
    evidencePackId: 'pack-test',
    evidenceChainId: 'chain-test',
    protocol: { protocolFingerprint: 'protocol-test', hypothesis: { modelId: 'nuclear-semf' } } as ScientificEvidencePack['protocol'],
    hypothesisAssessment: {} as ScientificEvidencePack['hypothesisAssessment'],
    runCount: 1,
    runs: [{ runId: 'run-test', status: 'completed', provenance: { runFingerprint: 'run-fingerprint' } } as ScientificEvidencePack['runs'][number]],
    reproducibility: { allArmsMatched: true, armsWithDrift: [], armsNotExecuted: [] },
    eventSummaries: [],
    externalObservationComparison,
    disclaimer: 'test',
  };
}

describe('Evidence Pack external observation replay integrity', () => {
  it('keeps MATCH only when the pinned external observation is intact', () => {
    expect(getStoredEvidencePackReplayVerdict(pack())).toBe('MATCH');
    expect(compareScientificEvidencePacks(pack(), pack())).toBe('MATCH');
  });

  it('downgrades a source-integrity DRIFT instead of reporting overall MATCH', () => {
    const drifted = { ...comparison, replay: { ...comparison.replay, status: 'DRIFT' as const } };

    expect(getStoredEvidencePackReplayVerdict(pack(drifted))).toBe('DRIFT');
    expect(compareScientificEvidencePacks(pack(), pack(drifted))).toBe('DRIFT');
  });

  it('blocks a missing or unavailable external replay rather than hiding it', () => {
    const blocked = { ...comparison, replay: { ...comparison.replay, status: 'BLOCKED' as const } };

    expect(getStoredEvidencePackReplayVerdict(pack(blocked))).toBe('BLOCKED');
    expect(compareScientificEvidencePacks(pack(), pack(blocked))).toBe('BLOCKED');
  });
});
