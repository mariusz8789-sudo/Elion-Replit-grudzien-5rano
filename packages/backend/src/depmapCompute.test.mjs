import assert from 'node:assert/strict';
import test from 'node:test';
import { _resetDetect, detect, senescenceCellCyclePanel } from './compute/depmapAdapter.mjs';
import { getModel, runModel } from './compute/engine.mjs';

const MODEL_ID = 'biology-depmap-crispr-senescence-panel';
const DATA_ENV = 'GENESIS_DEPMAP_24Q2_DATA_DIR';
const configuredDataDir = process.env[DATA_ENV];

test('DepMap adapter never creates a substitute result without a configured, verified data directory', () => {
  const original = process.env[DATA_ENV];
  delete process.env[DATA_ENV];
  _resetDetect();
  const runtime = detect();
  const result = senescenceCellCyclePanel();
  assert.equal(runtime.available, false);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'DATA_REQUIRED');
  if (original === undefined) delete process.env[DATA_ENV]; else process.env[DATA_ENV] = original;
  _resetDetect();
});

test('DepMap 24Q2 data-backed model is registered with provenance and rejects when source data are unavailable', () => {
  const model = getModel(MODEL_ID);
  assert.ok(model);
  assert.equal(model.provenance.datasetLicense, 'CC BY 4.0');
  assert.equal(model.provenance.requiredEnvironmentVariable, DATA_ENV);
  const original = process.env[DATA_ENV];
  delete process.env[DATA_ENV];
  _resetDetect();
  const rejected = runModel(MODEL_ID, {});
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.error, 'data_required');
  if (original === undefined) delete process.env[DATA_ENV]; else process.env[DATA_ENV] = original;
  _resetDetect();
});

test('DepMap 24Q2 real-data panel passes its preregistered control calibration when an approved source directory is configured', { skip: !configuredDataDir }, () => {
  _resetDetect();
  const result = senescenceCellCyclePanel();
  assert.equal(result.ok, true);
  assert.equal(result.data.datasetVersion, 'DepMap 24Q2 Public');
  assert.equal(result.data.cellLineCount, 1150);
  assert.equal(result.data.control.predeclaredPass, true);
  assert.ok(result.data.control.medianSeparation < -0.5);
  assert.equal(result.data.panel.CDKN1A.n, 1150);

  const run = runModel(MODEL_ID, {});
  assert.equal(run.status, 'ok');
  assert.equal(run.deterministic, true);
  assert.equal(run.outputs.controlCalibrationPass, 1);
  assert.equal(run.outputs.cellLineCount, 1150);
  assert.equal(run.provenance.datasetLicense, 'CC BY 4.0');
});
