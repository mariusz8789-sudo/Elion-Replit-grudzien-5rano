import assert from 'node:assert/strict';
import test from 'node:test';
import { _resetDetect, detect, zMuMuInvariantMassStats } from './compute/cmsOpenDataAdapter.mjs';
import { getModel, runModel } from './compute/engine.mjs';

const MODEL_ID = 'particle-cern-cms-zmumu-invariant-mass';
const DATA_ENV = 'GENESIS_CERN_OPEN_DATA_DIR';
const configuredDataDir = process.env[DATA_ENV];
const EXPECTED_HASH = '7782778f8417d2c732f4a64efcbfceb6192c97c3bcfd21c0cf1322d38ed965d1';

test('CMS Open Data adapter never creates a substitute result without a configured, verified source directory', () => {
  const original = process.env[DATA_ENV];
  delete process.env[DATA_ENV];
  _resetDetect();
  const runtime = detect();
  const result = zMuMuInvariantMassStats();
  assert.equal(runtime.available, false);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'DATA_REQUIRED');
  if (original === undefined) delete process.env[DATA_ENV]; else process.env[DATA_ENV] = original;
  _resetDetect();
});

test('CMS Z→μμ model is registered as checksum-bound external data and rejects when the source is unavailable', () => {
  const model = getModel(MODEL_ID);
  assert.ok(model);
  assert.equal(model.provenance.datasetLicense, 'CC0-1.0');
  assert.equal(model.provenance.sha256, EXPECTED_HASH);
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

test('CMS Z→μμ real-data analysis returns fixed descriptive statistics when approved source data are configured', { skip: !configuredDataDir }, () => {
  _resetDetect();
  const result = zMuMuInvariantMassStats();
  assert.equal(result.ok, true);
  assert.equal(result.data.eventCount, 10_000);
  assert.equal(result.data.uniqueEventCount, 10_000);
  assert.equal(result.data.dataset.sha256, EXPECTED_HASH);
  assert.equal(result.data.invariantMassGeV.events80To100GeV, 8259);
  assert.ok(Math.abs(result.data.invariantMassGeV.median - 90.28540772526225) < 1e-12);

  const run = runModel(MODEL_ID, {});
  assert.equal(run.status, 'ok');
  assert.equal(run.deterministic, true);
  assert.equal(run.outputs.eventCount, 10_000);
  assert.equal(run.outputs.peakBin90To95GeV, 4486);
  assert.equal(run.provenance.sha256, EXPECTED_HASH);
  assert.equal(run.provenance.datasetLicense, 'CC0-1.0');
});
