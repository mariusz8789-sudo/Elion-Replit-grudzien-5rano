import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { _resetDetect, detect } from './compute/depmapAdapter.mjs';

const DATA_ENV = 'GENESIS_DEPMAP_24Q2_DATA_DIR';
const configuredDataDir = process.env[DATA_ENV];
const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'biology-depmap-crispr-senescence-panel',
  domainId: 'biology',
  sourceText: 'Uruchom opisowy panel DepMap osi p53 p21 oraz p16 RB.',
  inputs: {},
};

test('Fabric contract exposes the bounded real-data DepMap model and its source requirement', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === request.modelId);
  assert.ok(model);
  assert.equal(model.domain, 'biology');
  assert.equal(model.deterministic, true);
  assert.ok(model.outputs.some((output) => output.id === 'controlCalibrationPass'));
  assert.ok(model.outputs.some((output) => output.id === 'cdkn1aMedian'));
});

test('Fabric API returns a source-data rejection instead of a fabricated DepMap result without a verified directory', () => {
  const original = process.env[DATA_ENV];
  delete process.env[DATA_ENV];
  _resetDetect();
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'data_required');
  if (original === undefined) delete process.env[DATA_ENV]; else process.env[DATA_ENV] = original;
  _resetDetect();
});

test('Fabric API runs the checksum-verified DepMap panel through the canonical compute registry', { skip: !configuredDataDir }, () => {
  _resetDetect();
  assert.equal(detect().available, true);
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.contractVersion, '1.0.0');
  assert.equal(response.body.run.status, 'ok');
  assert.equal(response.body.run.modelId, request.modelId);
  assert.equal(response.body.run.outputs.cellLineCount, 1150);
  assert.equal(response.body.run.outputs.controlCalibrationPass, 1);
  assert.ok(response.body.run.outputs.controlMedianSeparation < -0.5);
  assert.equal(response.body.run.provenance.datasetLicense, 'CC BY 4.0');
  assert.equal(response.body.persisted, false);
});
