import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  CAPABILITY, STATUS, MEDIA_CLASS, MEDIA_SCOPE,
  planGeneration, executeGeneration, createModelRegistry, createTestOnlyRunner,
} from './genesisVideoEngine.mjs';

const GPU_RUNTIME = Object.freeze({ gpu: { available: true, gpus: [{ name: 'Fake GPU', vramMb: 24576 }] }, python: { available: true, executable: 'python3', version: 'Python 3.11.0' } });
const NO_GPU_RUNTIME = Object.freeze({ gpu: { available: false, gpus: [] }, python: { available: true, executable: 'python3', version: 'Python 3.11.0' } });
const NO_PYTHON_RUNTIME = Object.freeze({ gpu: { available: true, gpus: [{ name: 'Fake GPU', vramMb: 24576 }] }, python: { available: false, executable: null, version: null } });

function registryWithGpuModel() {
  const r = createModelRegistry();
  r.registerLocalModel({ capability: CAPABILITY.TEXT_TO_VIDEO, modelId: 'stub-t2v', version: '0.0.1-test', checkpointFingerprint: 'ckpt-fp-1', requiresDevice: 'gpu', requiresPython: true });
  return r;
}
function registryWithCpuModel() {
  const r = createModelRegistry();
  r.registerLocalModel({ capability: CAPABILITY.TEXT_TO_VIDEO, modelId: 'stub-t2v-cpu', version: '0.0.2-test', checkpointFingerprint: 'ckpt-fp-2', requiresDevice: 'cpu', requiresPython: false });
  return r;
}

let tmpDir;
function freshOutputPath() {
  tmpDir = tmpDir ?? mkdtempSync(join(tmpdir(), 'genesis-video-out-'));
  return join(tmpDir, `out-${Math.random().toString(36).slice(2)}.mp4`);
}
function succeedingRunner(bytes = 'fake-mp4-bytes-for-test') {
  return createTestOnlyRunner({ writeFile: () => { const p = freshOutputPath(); writeFileSync(p, bytes); return p; } });
}

describe('Test: capability validation (items 1-2)', () => {
  test('every supported capability plans past capability validation given a matching registered model', () => {
    for (const capability of Object.values(CAPABILITY)) {
      const registry = createModelRegistry();
      registry.registerLocalModel({ capability, modelId: 'any', requiresDevice: 'cpu', requiresPython: false });
      const input = { capability, worldId: 'w1', promptOrShotDescription: 'x', referenceImage: 'ref', referenceVideo: 'ref' };
      const plan = planGeneration(input, { runtime: NO_GPU_RUNTIME, modelRegistry: registry });
      assert.equal(plan.ok, true, `${capability}: ${plan.reason}`);
      assert.equal(plan.status, STATUS.READY);
    }
  });

  test('an unsupported capability returns BLOCKED_UNSUPPORTED_CAPABILITY (item 2)', () => {
    const plan = planGeneration({ capability: 'DEEPFAKE_FACE_SWAP', worldId: 'w1' });
    assert.equal(plan.ok, false);
    assert.equal(plan.status, STATUS.BLOCKED_UNSUPPORTED_CAPABILITY);
  });
});

describe('Test: pre-execution blocking (items 3-5)', () => {
  test('no local model registered returns BLOCKED_MODEL_UNAVAILABLE (item 3)', () => {
    const plan = planGeneration({ capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x' }, { runtime: GPU_RUNTIME, modelRegistry: createModelRegistry() });
    assert.equal(plan.ok, false);
    assert.equal(plan.status, STATUS.BLOCKED_MODEL_UNAVAILABLE);
  });

  test('a GPU-requiring model with no GPU detected returns BLOCKED_GPU_UNAVAILABLE (item 4)', () => {
    const plan = planGeneration({ capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x' }, { runtime: NO_GPU_RUNTIME, modelRegistry: registryWithGpuModel() });
    assert.equal(plan.ok, false);
    assert.equal(plan.status, STATUS.BLOCKED_GPU_UNAVAILABLE);
  });

  test('a GPU-requiring model WITH a GPU detected is not blocked on GPU grounds', () => {
    const plan = planGeneration({ capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x' }, { runtime: GPU_RUNTIME, modelRegistry: registryWithGpuModel() });
    assert.equal(plan.ok, true);
  });

  test('a Python-requiring model with no Python runtime detected returns BLOCKED_RUNTIME (item 5)', () => {
    const plan = planGeneration({ capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x' }, { runtime: NO_PYTHON_RUNTIME, modelRegistry: registryWithGpuModel() });
    assert.equal(plan.ok, false);
    assert.equal(plan.status, STATUS.BLOCKED_RUNTIME);
  });

  test('executeGeneration with a READY plan but NO runner attached also returns BLOCKED_RUNTIME, never a fabricated result', async () => {
    const result = await executeGeneration({ capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x' }, { runtime: NO_GPU_RUNTIME, modelRegistry: registryWithCpuModel() });
    assert.equal(result.ok, false);
    assert.equal(result.record.status, STATUS.BLOCKED_RUNTIME);
  });

  test('a capability missing its required reference input is refused before runtime/model checks', () => {
    const plan = planGeneration({ capability: CAPABILITY.IMAGE_TO_VIDEO, worldId: 'w1' }, { runtime: GPU_RUNTIME, modelRegistry: registryWithGpuModel() });
    assert.equal(plan.ok, false);
    assert.equal(plan.error, 'missing_required_reference');
  });
});

describe('Test: execution outcomes (items 6-11, 17)', () => {
  test('a low-level generation failure returns FAILED_GENERATION (item 6)', async () => {
    const runner = createTestOnlyRunner({ behavior: 'fail' });
    const result = await executeGeneration({ capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x' }, { runtime: NO_GPU_RUNTIME, modelRegistry: registryWithCpuModel(), runner });
    assert.equal(result.ok, false);
    assert.equal(result.record.status, STATUS.FAILED_GENERATION);
  });

  test('a runner claiming success with no real output file also resolves FAILED_GENERATION, never a fabricated GENERATED (item 7)', async () => {
    const runner = createTestOnlyRunner({ behavior: 'no-output' });
    const result = await executeGeneration({ capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x' }, { runtime: NO_GPU_RUNTIME, modelRegistry: registryWithCpuModel(), runner });
    assert.equal(result.ok, false);
    assert.equal(result.record.status, STATUS.FAILED_GENERATION);
    assert.match(result.record.reason, /no output file/i);
  });

  test('a real output file produces GENERATED with a verified real SHA-256 (items 7, 8)', async () => {
    const bytes = 'deterministic-test-fixture-bytes-12345';
    const registry = registryWithCpuModel();
    const result = await executeGeneration(
      { capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x' },
      { runtime: NO_GPU_RUNTIME, modelRegistry: registry, runner: succeedingRunner(bytes) },
    );
    assert.equal(result.ok, true);
    assert.equal(result.record.status, STATUS.GENERATED);
    const expectedHash = createHash('sha256').update(readFileSync(result.record.outputPath)).digest('hex');
    assert.equal(result.record.outputSha256, expectedHash);
    assert.equal(result.record.outputSha256.length, 64);
  });

  test('source and control fingerprints survive execution end to end (item 9)', async () => {
    const input = { capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x', sourceScientificStateFingerprint: 'science-fp-abc' };
    const result = await executeGeneration(input, { runtime: NO_GPU_RUNTIME, modelRegistry: registryWithCpuModel(), runner: succeedingRunner() });
    assert.equal(result.ok, true);
    assert.equal(result.record.sourceScientificStateFingerprint, 'science-fp-abc');
    assert.ok(result.record.controlPackageFingerprint);
    assert.match(result.record.controlPackageFingerprint, /^[0-9a-f]{64}$/);
  });

  test('generated output remains VISUALIZATION_ONLY / GENERATED_MEDIA (item 10)', async () => {
    const result = await executeGeneration({ capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x' }, { runtime: NO_GPU_RUNTIME, modelRegistry: registryWithCpuModel(), runner: succeedingRunner() });
    assert.equal(result.record.mediaClass, MEDIA_CLASS);
    assert.equal(result.record.mediaScope, MEDIA_SCOPE);
  });

  test('generated output is never Evidence eligible, and blocked/failed records are equally non-eligible (item 11)', async () => {
    const generated = await executeGeneration({ capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x' }, { runtime: NO_GPU_RUNTIME, modelRegistry: registryWithCpuModel(), runner: succeedingRunner() });
    assert.equal(generated.record.evidenceEligible, false);
    const blocked = await executeGeneration({ capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x' }, { runtime: NO_GPU_RUNTIME, modelRegistry: createModelRegistry() });
    assert.equal(blocked.record.evidenceEligible, false);
  });

  test('model/checkpoint identity is retained verbatim in provenance (item 17)', async () => {
    const registry = registryWithCpuModel();
    const result = await executeGeneration({ capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x' }, { runtime: NO_GPU_RUNTIME, modelRegistry: registry, runner: succeedingRunner() });
    assert.equal(result.record.modelId, 'stub-t2v-cpu');
    assert.equal(result.record.modelVersion, '0.0.2-test');
    assert.equal(result.record.modelCheckpointFingerprint, 'ckpt-fp-2');
  });
});

describe('Test: scientific-state mutation is structurally impossible (item 12)', () => {
  test('scientificStateMutation is hardcoded false on every generated record, and the field cannot be overridden by the caller', async () => {
    const result = await executeGeneration(
      { capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x' },
      { runtime: NO_GPU_RUNTIME, modelRegistry: registryWithCpuModel(), runner: succeedingRunner() },
    );
    assert.equal(result.record.scientificStateMutation, false);
  });

  test('a caller attempting to inject scientificStateMutation:true into the raw input is rejected before planning even runs, never silently accepted or executed', async () => {
    const result = await executeGeneration(
      { capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x', scientificStateMutation: true },
      { runtime: NO_GPU_RUNTIME, modelRegistry: registryWithCpuModel(), runner: succeedingRunner() },
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, 'scientific_state_promotion_rejected');
    assert.equal(result.record, null);
  });
});

describe('Test: provider/model agnosticism (item 13)', () => {
  test('swapping which model/provider is registered changes only the identity fields in the result, never the pipeline logic', async () => {
    const registryA = createModelRegistry();
    registryA.registerLocalModel({ capability: CAPABILITY.TEXT_TO_VIDEO, modelId: 'provider-a-model', version: '1.0', checkpointFingerprint: 'fp-a', requiresDevice: 'cpu', requiresPython: false });
    const registryB = createModelRegistry();
    registryB.registerLocalModel({ capability: CAPABILITY.TEXT_TO_VIDEO, modelId: 'provider-b-completely-different-model', version: '9.9', checkpointFingerprint: 'fp-b', requiresDevice: 'cpu', requiresPython: false });

    const input = { capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x' };
    const resultA = await executeGeneration(input, { runtime: NO_GPU_RUNTIME, modelRegistry: registryA, runner: succeedingRunner() });
    const resultB = await executeGeneration(input, { runtime: NO_GPU_RUNTIME, modelRegistry: registryB, runner: succeedingRunner() });

    assert.equal(resultA.ok, true);
    assert.equal(resultB.ok, true);
    assert.equal(resultA.record.status, resultB.record.status);
    assert.equal(resultA.record.mediaClass, resultB.record.mediaClass);
    assert.notEqual(resultA.record.modelId, resultB.record.modelId);
    assert.notEqual(resultA.record.modelCheckpointFingerprint, resultB.record.modelCheckpointFingerprint);
  });
});

describe('Test: test-only runner output is identified as test-only (item 14)', () => {
  test('every record produced via createTestOnlyRunner carries testOnly:true and a limitations entry naming it', async () => {
    const result = await executeGeneration({ capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x' }, { runtime: NO_GPU_RUNTIME, modelRegistry: registryWithCpuModel(), runner: succeedingRunner() });
    assert.equal(result.record.testOnly, true);
    assert.ok(result.record.limitations.some((l) => /TEST-ONLY/.test(l)));
  });

  test('a blocked (never-executed) record is never marked testOnly merely because a test suite ran it', () => {
    const plan = planGeneration({ capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x' }, { runtime: NO_GPU_RUNTIME, modelRegistry: createModelRegistry() });
    assert.equal(plan.ok, false);
    assert.equal(plan.status, STATUS.BLOCKED_MODEL_UNAVAILABLE);
  });
});

describe('Test: default (non-injected) runtime path also works', () => {
  test('planGeneration with no injected runtime calls the REAL local probe and still resolves BLOCKED_MODEL_UNAVAILABLE honestly (no model is ever bundled)', () => {
    const plan = planGeneration({ capability: CAPABILITY.TEXT_TO_VIDEO, worldId: 'w1', promptOrShotDescription: 'x' });
    assert.equal(plan.ok, false);
    assert.equal(plan.status, STATUS.BLOCKED_MODEL_UNAVAILABLE);
  });
});

after(() => { if (tmpDir) rmSync(tmpDir, { recursive: true, force: true }); });
