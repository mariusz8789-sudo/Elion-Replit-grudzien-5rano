import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, describe } from 'node:test';

const fixturePath = path.join(import.meta.dirname, 'fixtures', 'campaignEvidenceReferenceCase.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

describe('Campaign evidence interoperability reference fixture', () => {
  test('is explicitly contract-only and deterministic', () => {
    assert.equal(fixture.fixtureOnly, true);
    assert.equal(fixture.status, 'MANUAL_REVIEW');
    assert.equal(fixture.campaign.deterministic, true);
    assert.equal(fixture.scienceRun.evidenceClass, 'MODEL_ESTIMATE');
    assert.equal(fixture.scienceRun.provenance.resultOrigin, 'NOT_EXECUTED');
    assert.equal(fixture.scienceRun.outputs.fixtureValue, 'NOT_PROVIDED');
  });

  test('preserves Campaign lineage fields without claiming Fabric compatibility', () => {
    assert.equal(fixture.candidate.runIds[0], fixture.scienceRun.runId);
    assert.deepEqual(fixture.lineage.eventOrder, [
      'campaign_created',
      'candidate_retained',
      'science_run_recorded',
    ]);
    assert.equal(fixture.lossReportForFabricEvidencePack.lossless, false);
    assert.equal(fixture.lossReportForFabricEvidencePack.status, 'BLOCKED');
    assert.ok(fixture.lossReportForFabricEvidencePack.missingOrIncompatible.length >= 5);
    assert.ok(fixture.lossReportForFabricEvidencePack.requiredBeforeManualReview.length >= 5);
  });
});
