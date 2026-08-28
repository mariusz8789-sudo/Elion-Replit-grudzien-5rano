import { describe, expect, it } from 'vitest';
import {
  biotechScientificFingerprint,
  isPredictiveBiotechStatus,
  type BiologicalEvidence,
} from '../core/biotechDiscoveryContract';

const evidence: BiologicalEvidence = {
  kind: 'biological-evidence',
  id: 'evidence-1',
  namespace: 'example',
  label: 'Example evidence',
  status: 'LITERATURE_SUPPORTED',
  claim: 'A bounded biological claim.',
  subjectIds: ['compound-1'],
  provenance: [{ source: 'UNSPECIFIED', sourceId: 'UNSPECIFIED', evidenceType: 'UNSPECIFIED', status: 'UNKNOWN' }],
};

describe('biotech discovery contract', () => {
  it('fingerprints scientific identity and is stable under object key order', () => {
    const reordered = { ...evidence, provenance: [{ ...evidence.provenance[0] }], subjectIds: ['compound-1'] };
    expect(biotechScientificFingerprint(evidence)).toBe(biotechScientificFingerprint(reordered));
    expect(biotechScientificFingerprint({ ...evidence, claim: 'A changed biological claim.' } as BiologicalEvidence)).not.toBe(biotechScientificFingerprint(evidence));
  });

  it('keeps predictive statuses distinct from established fact', () => {
    expect(isPredictiveBiotechStatus('PREDICTION')).toBe(true);
    expect(isPredictiveBiotechStatus('INFERENCE')).toBe(true);
    expect(isPredictiveBiotechStatus('HYPOTHESIS')).toBe(true);
    expect(isPredictiveBiotechStatus('FACT')).toBe(false);
    expect(isPredictiveBiotechStatus('UNKNOWN')).toBe(false);
  });
});
