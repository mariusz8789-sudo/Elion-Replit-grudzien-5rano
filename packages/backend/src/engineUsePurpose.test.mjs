import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEngineUsePurpose } from './compute/engineUsePurpose.mjs';

test('engines default to technical validation; commercial is opt-in only', () => {
  assert.deepEqual(resolveEngineUsePurpose({}), { admet: 'TECHNICAL_VALIDATION', retrosynthesis: 'TECHNICAL_VALIDATION' });
  assert.deepEqual(resolveEngineUsePurpose({ GENESIS_ENGINE_USE_PURPOSE: 'COMMERCIAL_PRODUCT' }), { admet: 'COMMERCIAL_PRODUCT', retrosynthesis: 'COMMERCIAL_PRODUCT' });
  assert.equal(resolveEngineUsePurpose({ GENESIS_ENGINE_USE_PURPOSE: 'nonsense' }).admet, 'TECHNICAL_VALIDATION');
});
