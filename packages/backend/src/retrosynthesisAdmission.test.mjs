import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RETROSYNTHESIS_ARTIFACT_POLICY,
  RETROSYNTHESIS_USE_PURPOSE,
  assessRetrosynthesisAdmission,
} from './compute/retrosynthesisAdmission.mjs';

const HASH = 'a'.repeat(64);
const completeRuntime = {
  available: true,
  installed: true,
  models: {
    complete: true,
    missing: [],
    files: [
      { role: 'expansion_policy_model', required: true, present: true, sha256: HASH },
      { role: 'expansion_templates', required: true, present: true, sha256: 'b'.repeat(64) },
      { role: 'stock', required: true, present: true, sha256: 'c'.repeat(64) },
    ],
  },
};

describe('retrosynthesis admission', () => {
  it('approves only the engine code licence and leaves external artifacts UNKNOWN', () => {
    assert.equal(RETROSYNTHESIS_ARTIFACT_POLICY.engine.codeLicence, 'MIT');
    assert.equal(RETROSYNTHESIS_ARTIFACT_POLICY.engine.licenceStatus, 'APPROVED');
    assert.deepEqual(
      RETROSYNTHESIS_ARTIFACT_POLICY.artifacts.map((artifact) => artifact.licenceStatus),
      ['UNKNOWN', 'UNKNOWN', 'UNKNOWN'],
    );
    assert.equal(RETROSYNTHESIS_ARTIFACT_POLICY.outputClassification, 'MODEL_ESTIMATE');
    assert.equal(RETROSYNTHESIS_ARTIFACT_POLICY.outputKind, 'ROUTE_PROPOSAL');
    assert.equal(RETROSYNTHESIS_ARTIFACT_POLICY.procedureStatus, 'NOT_A_LABORATORY_PROCEDURE');
  });

  it('blocks commercial execution even when files exist until every artifact licence is reviewed', () => {
    const admission = assessRetrosynthesisAdmission({ runtime: completeRuntime });
    assert.equal(admission.ok, false);
    assert.equal(admission.status, 'BLOCKED_BY_LICENSE');
    assert.equal(admission.failureCode, 'RETRO_MODEL_TEMPLATE_OR_STOCK_LICENSE_UNVERIFIED');
  });

  it('distinguishes missing runtime from missing model data in technical validation', () => {
    const noRuntime = assessRetrosynthesisAdmission({
      purpose: RETROSYNTHESIS_USE_PURPOSE.TECHNICAL_VALIDATION,
      runtime: { installed: false, available: false, models: null },
    });
    assert.equal(noRuntime.status, 'BLOCKED_BY_RUNTIME');

    const noData = assessRetrosynthesisAdmission({
      purpose: RETROSYNTHESIS_USE_PURPOSE.TECHNICAL_VALIDATION,
      runtime: { installed: true, available: false, models: { complete: false, missing: ['uspto_model.onnx'], files: [] } },
    });
    assert.equal(noData.status, 'BLOCKED_BY_DATA');
    assert.equal(noData.failureCode, 'RETRO_REQUIRED_ARTIFACTS_MISSING');
  });

  it('requires hashes for every required technical-validation artifact', () => {
    const runtime = structuredClone(completeRuntime);
    runtime.models.files[1].sha256 = null;
    const admission = assessRetrosynthesisAdmission({
      purpose: RETROSYNTHESIS_USE_PURPOSE.TECHNICAL_VALIDATION,
      runtime,
    });
    assert.equal(admission.ok, false);
    assert.equal(admission.status, 'BLOCKED_BY_DATA');
    assert.equal(admission.failureCode, 'RETRO_ARTIFACT_IDENTITY_INCOMPLETE');
  });

  it('admits only bounded technical validation when all three artifacts have identities', () => {
    const admission = assessRetrosynthesisAdmission({
      purpose: RETROSYNTHESIS_USE_PURPOSE.TECHNICAL_VALIDATION,
      runtime: completeRuntime,
    });
    assert.equal(admission.ok, true);
    assert.equal(admission.status, 'AVAILABLE_FOR_TECHNICAL_VALIDATION');
    assert.deepEqual(Object.keys(admission.artifactIdentity).sort(), ['expansion_policy_model', 'expansion_templates', 'stock']);
    assert.equal(admission.policy.commercialUseStatus, 'BLOCKED_PENDING_MODEL_TEMPLATE_AND_STOCK_LICENCES');
  });

  it('reports the real local blocker without creating a route', () => {
    const admission = assessRetrosynthesisAdmission({ purpose: RETROSYNTHESIS_USE_PURPOSE.TECHNICAL_VALIDATION });
    assert.ok(['BLOCKED_BY_RUNTIME', 'BLOCKED_BY_DATA', 'AVAILABLE_FOR_TECHNICAL_VALIDATION'].includes(admission.status));
    assert.equal(admission.route, undefined);
  });
});
