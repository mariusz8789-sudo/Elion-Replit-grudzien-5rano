import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  admitCommercialRelease,
  COMMERCIAL_DECISION_STATUS,
  COMMERCIAL_RELEASE_STATUS,
} from './commercialReleaseAdmission.mjs';

const TERMS_HASH = 'a'.repeat(64);
const ARTIFACT_HASH = 'b'.repeat(64);

function item(overrides = {}) {
  return {
    itemId: 'engine:rdkit@2026.03.6',
    category: 'SCIENTIFIC_ENGINE',
    identity: { version: '2026.03.6', sha256: ARTIFACT_HASH },
    intendedUses: ['CUSTOMER_REPORT_EXPORT'],
    status: COMMERCIAL_DECISION_STATUS.APPROVED,
    licenceEvidence: { sourceUrl: 'https://example.test/licence', termsSha256: TERMS_HASH },
    obligations: [],
    decision: { owner: 'commercial-rights-reviewer', decidedAt: '2026-10-01T00:00:00.000Z' },
    evidenceRefs: ['licence-snapshot:rdkit-2026.03.6'],
    ...overrides,
  };
}

describe('commercial release admission', () => {
  it('admits only an exact manifest reviewed for the declared use', () => {
    const out = admitCommercialRelease({
      releaseId: 'release-001',
      researchRunId: 'rr-001',
      declaredUse: 'CUSTOMER_REPORT_EXPORT',
      items: [item()],
    });
    assert.equal(out.status, COMMERCIAL_RELEASE_STATUS.ADMITTED);
    assert.equal(out.exportAllowed, true);
    assert.match(out.manifestHash, /^[a-f0-9]{64}$/);
    assert.equal(out.decisions[0].status, 'ADMITTED');
  });

  it('keeps UNKNOWN and BLOCKED rights fail-closed even with a named approver', () => {
    for (const status of [COMMERCIAL_DECISION_STATUS.UNKNOWN, COMMERCIAL_DECISION_STATUS.BLOCKED]) {
      const out = admitCommercialRelease({
        releaseId: `release-${status}`,
        researchRunId: 'rr-002',
        declaredUse: 'CUSTOMER_REPORT_EXPORT',
        items: [item({ status })],
      });
      assert.equal(out.status, COMMERCIAL_RELEASE_STATUS.BLOCKED);
      assert.equal(out.exportAllowed, false);
      assert.ok(out.decisions[0].errors.includes(status === 'UNKNOWN' ? 'RIGHTS_UNKNOWN' : 'RIGHTS_BLOCKED'));
    }
  });

  it('blocks conditional items until every obligation is resolved', () => {
    const out = admitCommercialRelease({
      releaseId: 'release-conditional',
      researchRunId: 'rr-003',
      declaredUse: 'CUSTOMER_REPORT_EXPORT',
      items: [item({
        status: COMMERCIAL_DECISION_STATUS.CONDITIONAL,
        obligations: [{ id: 'ATTRIBUTION', resolved: true }, { id: 'SHARE_ALIKE_REVIEW', resolved: false }],
      })],
    });
    assert.equal(out.exportAllowed, false);
    assert.deepEqual(out.decisions[0].unresolvedObligations, ['SHARE_ALIKE_REVIEW']);
    assert.ok(out.decisions[0].errors.includes('CONDITIONS_UNRESOLVED'));
  });

  it('blocks mutable or incomplete release items and duplicate identities', () => {
    const incomplete = item({
      identity: {},
      licenceEvidence: { sourceUrl: 'https://example.test/licence', termsSha256: 'not-a-hash' },
      decision: { owner: '', decidedAt: '' },
      evidenceRefs: [],
    });
    const out = admitCommercialRelease({
      releaseId: 'release-incomplete',
      researchRunId: 'rr-004',
      declaredUse: 'CUSTOMER_REPORT_EXPORT',
      items: [incomplete, incomplete],
    });
    assert.equal(out.exportAllowed, false);
    assert.ok(out.decisions[0].errors.includes('IMMUTABLE_IDENTITY_REQUIRED'));
    assert.ok(out.decisions[0].errors.includes('LICENCE_TERMS_HASH_REQUIRED'));
    assert.ok(out.decisions[1].errors.includes('DUPLICATE_ITEM_ID'));
  });

  it('binds the admission hash to use, run and exact item decisions', () => {
    const base = { releaseId: 'release-hash', researchRunId: 'rr-005', declaredUse: 'CUSTOMER_REPORT_EXPORT', items: [item()] };
    const a = admitCommercialRelease(base);
    const b = admitCommercialRelease({ ...base, declaredUse: 'MODEL_TRAINING' });
    assert.notEqual(a.manifestHash, b.manifestHash);
    assert.equal(b.exportAllowed, false);
    assert.ok(b.decisions[0].errors.includes('DECLARED_USE_NOT_REVIEWED'));
  });
});
