import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateModelDescriptor, toRegistryDescriptor, toAdapterConfig, requiredDescriptorFields } from './localVideoModelDescriptor.mjs';
import { createModelRegistry, CAPABILITY } from './genesisVideoEngine.mjs';

const tmpDirs = [];
function freshDir() { const d = mkdtempSync(join(tmpdir(), 'genesis-descriptor-')); tmpDirs.push(d); return d; }
function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

function realDescriptor(overrides = {}) {
  const dir = freshDir();
  const checkpointPath = join(dir, 'model.safetensors');
  writeFileSync(checkpointPath, 'real-checkpoint-bytes-for-descriptor-test');
  return {
    capability: CAPABILITY.TEXT_TO_VIDEO, modelId: 'desc-model', version: '1.0.0',
    checkpointFingerprint: sha256(Buffer.from('real-checkpoint-bytes-for-descriptor-test')),
    checkpointPath, requiresDevice: 'cpu', requiresPython: false, requiresPackages: [],
    requiredAccelerator: null, supportedResolutions: ['512x512'], supportedDurationSeconds: 4,
    supportedFps: 8, vramRequirementMb: 0, limitations: ['test fixture only'],
    ...overrides,
  };
}

describe('Test: model descriptor never admits an unverified checkpoint', () => {
  test('a fully real, hash-matching descriptor validates', () => {
    const r = validateModelDescriptor(realDescriptor());
    assert.equal(r.ok, true);
  });

  test('a descriptor whose checkpoint file does not exist is rejected', () => {
    const r = validateModelDescriptor(realDescriptor({ checkpointPath: '/definitely/not/real/checkpoint.safetensors' }));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'checkpoint_not_present');
  });

  test('a descriptor whose checkpoint hash does not match is rejected', () => {
    const r = validateModelDescriptor(realDescriptor({ checkpointFingerprint: '0'.repeat(64) }));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'checkpoint_hash_mismatch');
  });

  test('a modelId containing path traversal is rejected', () => {
    const r = validateModelDescriptor(realDescriptor({ modelId: '../outside' }));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'invalid_model_id');
  });

  test('every required field is individually required', () => {
    for (const field of requiredDescriptorFields()) {
      const d = realDescriptor(); delete d[field];
      const r = validateModelDescriptor(d);
      assert.equal(r.ok, false, `field "${field}" should be required`);
    }
  });

  test('a checkpoint outside an explicitly configured checkpointRoot is rejected', () => {
    const d = realDescriptor();
    const r = validateModelDescriptor(d, { checkpointRoot: freshDir() }); // a DIFFERENT root than the checkpoint lives in
    assert.equal(r.ok, false);
    assert.equal(r.error, 'checkpoint_outside_approved_root');
  });
});

describe('Test: descriptor projects cleanly onto the canonical registry and the adapter', () => {
  test('toRegistryDescriptor + real registerLocalModel resolves via planGeneration', () => {
    const d = realDescriptor();
    const validated = validateModelDescriptor(d);
    assert.equal(validated.ok, true);
    const registry = createModelRegistry();
    registry.registerLocalModel(toRegistryDescriptor(validated.descriptor));
    const resolved = registry.resolveModel({ capability: CAPABILITY.TEXT_TO_VIDEO, modelId: 'desc-model' });
    assert.equal(resolved.exists, true);
    assert.equal(resolved.checkpointFingerprint, d.checkpointFingerprint);
  });

  test('toAdapterConfig carries the checkpoint identity through to the adapter config shape', () => {
    const d = realDescriptor();
    const cfg = toAdapterConfig(d, { approvedModelsRoot: '/models', outputRoot: '/out', workerScript: '/worker.py' });
    assert.equal(cfg.modelId, d.modelId);
    assert.equal(cfg.checkpointPath, d.checkpointPath);
    assert.equal(cfg.checkpointFingerprint, d.checkpointFingerprint);
    assert.equal(cfg.approvedModelsRoot, '/models');
  });
});

after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
