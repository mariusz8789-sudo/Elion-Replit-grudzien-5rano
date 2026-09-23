import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createLocalWorkerAdapter } from './localVideoWorkerAdapter.mjs';
import { normalizeControlInput } from './videoControlContract.mjs';
import * as engine from './genesisVideoEngine.mjs';
import * as adapterModule from './localVideoWorkerAdapter.mjs';
import * as descriptorModule from './localVideoModelDescriptor.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_WORKER_SCRIPT = join(HERE, '..', '..', '..', '..', 'tools', 'genesis-local-video', 'worker', 'genesis_local_video_worker.py');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

const tmpDirs = [];
function freshDir(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

/** Copies the real worker tree into an isolated tmp dir and writes a
 *  custom adapters/<modelId>.py so each test can plug in whatever tiny,
 *  clearly-fake behavior it needs without touching the real tools/ tree. */
function withPluggedWorker(modelId, adapterPySource) {
  const workerDir = freshDir('genesis-worker-');
  cpSync(join(HERE, '..', '..', '..', '..', 'tools', 'genesis-local-video', 'worker', 'genesis_local_video_worker.py'), join(workerDir, 'genesis_local_video_worker.py'));
  mkdirSync(join(workerDir, 'adapters'));
  writeFileSync(join(workerDir, 'adapters', `${modelId}.py`), adapterPySource);
  return join(workerDir, 'genesis_local_video_worker.py');
}

function makeCheckpoint() {
  const modelsRoot = freshDir('genesis-models-');
  const checkpointPath = join(modelsRoot, 'fake.safetensors');
  writeFileSync(checkpointPath, 'fake-checkpoint-bytes-for-testing');
  const checkpointFingerprint = sha256(readFileSync(checkpointPath));
  return { modelsRoot, checkpointPath, checkpointFingerprint };
}

const validControlInput = () => normalizeControlInput({
  capability: 'TEXT_TO_VIDEO', worldId: 'w1', sourceScientificStateFingerprint: 'fp-1', promptOrShotDescription: 'a slow dolly through a foggy lab',
}).input;

describe('Test: adapter pre-flight (available()) — BLOCKED-shaped reasons (items 1-3, 5)', () => {
  test('missing checkpoint file is BLOCKED (item 1)', () => {
    const { modelsRoot } = makeCheckpoint();
    const adapter = createLocalWorkerAdapter({
      modelId: 'm1', checkpointPath: join(modelsRoot, 'does-not-exist.safetensors'), checkpointFingerprint: '0'.repeat(64),
      approvedModelsRoot: modelsRoot, outputRoot: freshDir('genesis-out-'), workerScript: REAL_WORKER_SCRIPT,
    });
    const r = adapter.available();
    assert.equal(r.ok, false);
    assert.match(r.reason, /checkpoint file does not exist/);
  });

  test('wrong checkpoint SHA-256 is BLOCKED (item 2)', () => {
    const { modelsRoot, checkpointPath } = makeCheckpoint();
    const adapter = createLocalWorkerAdapter({
      modelId: 'm1', checkpointPath, checkpointFingerprint: '0'.repeat(64),
      approvedModelsRoot: modelsRoot, outputRoot: freshDir('genesis-out-'), workerScript: REAL_WORKER_SCRIPT,
    });
    const r = adapter.available();
    assert.equal(r.ok, false);
    assert.match(r.reason, /SHA-256 mismatch/);
  });

  test('missing worker script is BLOCKED (item 3)', () => {
    const { modelsRoot, checkpointPath, checkpointFingerprint } = makeCheckpoint();
    const adapter = createLocalWorkerAdapter({
      modelId: 'm1', checkpointPath, checkpointFingerprint,
      approvedModelsRoot: modelsRoot, outputRoot: freshDir('genesis-out-'), workerScript: join(modelsRoot, 'no-such-worker.py'),
    });
    const r = adapter.available();
    assert.equal(r.ok, false);
    assert.match(r.reason, /worker script not found/);
  });

  test('an unsupported capability is BLOCKED at the worker level too (item 5, defense in depth)', async () => {
    const { modelsRoot, checkpointPath, checkpointFingerprint } = makeCheckpoint();
    const adapter = createLocalWorkerAdapter({
      modelId: 'm1', checkpointPath, checkpointFingerprint,
      approvedModelsRoot: modelsRoot, outputRoot: freshDir('genesis-out-'), workerScript: REAL_WORKER_SCRIPT,
    });
    const result = await adapter.generate({ capability: 'HOLOGRAM_PROJECTION', controlInput: validControlInput(), model: {}, runtime: {} });
    assert.equal(result.ok, false);
  });
});

describe('Test: unsafe path rejection (item 6)', () => {
  test('a checkpointPath escaping the approved models root is refused', () => {
    const { modelsRoot } = makeCheckpoint();
    const outsideFile = join(tmpdir(), `outside-checkpoint-${Date.now()}.safetensors`);
    writeFileSync(outsideFile, 'escape attempt');
    const adapter = createLocalWorkerAdapter({
      // checkpointPath is a real, absolute file, but OUTSIDE approvedModelsRoot — the adapter must
      // refuse it even though the file genuinely exists and even if its hash were made to match.
      modelId: 'm1', checkpointPath: outsideFile, checkpointFingerprint: sha256(readFileSync(outsideFile)),
      approvedModelsRoot: modelsRoot, outputRoot: freshDir('genesis-out-'), workerScript: REAL_WORKER_SCRIPT,
    });
    const r = adapter.available();
    assert.equal(r.ok, false);
    assert.match(r.reason, /outside the approved models root/);
    rmSync(outsideFile, { force: true });
  });

  test('an outputLocation escaping the approved output root is refused', async () => {
    const { modelsRoot, checkpointPath, checkpointFingerprint } = makeCheckpoint();
    const outputRoot = freshDir('genesis-out-');
    const adapter = createLocalWorkerAdapter({ modelId: 'm1', checkpointPath, checkpointFingerprint, approvedModelsRoot: modelsRoot, outputRoot, workerScript: REAL_WORKER_SCRIPT });
    const controlInput = normalizeControlInput({ capability: 'TEXT_TO_VIDEO', worldId: 'w1', sourceScientificStateFingerprint: 'fp', promptOrShotDescription: 'x', outputLocation: '../../../etc/genesis-escape.mp4' }).input;
    const result = await adapter.generate({ capability: 'TEXT_TO_VIDEO', controlInput, model: {}, runtime: {} });
    assert.equal(result.ok, false);
    assert.match(result.reason, /outside the approved output root/);
  });
});

describe('Test: worker execution outcomes (items 4, 7, 8, 9, 10)', () => {
  test('a plugged adapter that raises ImportError for a missing package never becomes GENERATED (item 4)', async () => {
    const { modelsRoot, checkpointPath, checkpointFingerprint } = makeCheckpoint();
    const workerScript = withPluggedWorker('missing-pkg-model', 'def generate(request):\n    import genesis_definitely_missing_package_xyz\n    return {"ok": True}\n');
    const adapter = createLocalWorkerAdapter({ modelId: 'missing-pkg-model', checkpointPath, checkpointFingerprint, approvedModelsRoot: modelsRoot, outputRoot: freshDir('genesis-out-'), workerScript, pythonExecutable: PYTHON });
    const result = await adapter.generate({ capability: 'TEXT_TO_VIDEO', controlInput: validControlInput(), model: {}, runtime: {} });
    assert.equal(result.ok, false);
    assert.match(result.reason, /raised/i);
  });

  test('a timeout kills the worker and reports failure, never a fabricated success (item 7)', { timeout: 10_000 }, async () => {
    const { modelsRoot, checkpointPath, checkpointFingerprint } = makeCheckpoint();
    const workerScript = withPluggedWorker('slow-model', 'import time\ndef generate(request):\n    time.sleep(5)\n    return {"ok": True, "outputPath": request["outputPath"]}\n');
    const adapter = createLocalWorkerAdapter({ modelId: 'slow-model', checkpointPath, checkpointFingerprint, approvedModelsRoot: modelsRoot, outputRoot: freshDir('genesis-out-'), workerScript, pythonExecutable: PYTHON, timeoutMs: 300 });
    const result = await adapter.generate({ capability: 'TEXT_TO_VIDEO', controlInput: validControlInput(), model: {}, runtime: {} });
    assert.equal(result.ok, false);
    assert.match(result.reason, /timed out/);
  });

  test('a plugged adapter explicitly reporting failure never becomes GENERATED (item 8)', async () => {
    const { modelsRoot, checkpointPath, checkpointFingerprint } = makeCheckpoint();
    const workerScript = withPluggedWorker('failing-model', 'def generate(request):\n    return {"ok": False, "reason": "simulated real model failure"}\n');
    const adapter = createLocalWorkerAdapter({ modelId: 'failing-model', checkpointPath, checkpointFingerprint, approvedModelsRoot: modelsRoot, outputRoot: freshDir('genesis-out-'), workerScript, pythonExecutable: PYTHON });
    const result = await adapter.generate({ capability: 'TEXT_TO_VIDEO', controlInput: validControlInput(), model: {}, runtime: {} });
    assert.equal(result.ok, false);
    assert.match(result.reason, /simulated real model failure/);
  });

  test('a plugged adapter claiming success but writing NOTHING never becomes GENERATED (item 9)', async () => {
    const { modelsRoot, checkpointPath, checkpointFingerprint } = makeCheckpoint();
    const workerScript = withPluggedWorker('empty-output-model', 'def generate(request):\n    return {"ok": True, "outputPath": request["outputPath"]}\n');
    const adapter = createLocalWorkerAdapter({ modelId: 'empty-output-model', checkpointPath, checkpointFingerprint, approvedModelsRoot: modelsRoot, outputRoot: freshDir('genesis-out-'), workerScript, pythonExecutable: PYTHON });
    const result = await adapter.generate({ capability: 'TEXT_TO_VIDEO', controlInput: validControlInput(), model: {}, runtime: {} });
    assert.equal(result.ok, false);
    assert.match(result.reason, /no real output file/);
  });

  test('a plugged adapter claiming success but writing an EMPTY file never becomes GENERATED (item 9)', async () => {
    const { modelsRoot, checkpointPath, checkpointFingerprint } = makeCheckpoint();
    const workerScript = withPluggedWorker('empty-file-model', 'from pathlib import Path\ndef generate(request):\n    Path(request["outputPath"]).write_bytes(b"")\n    return {"ok": True, "outputPath": request["outputPath"]}\n');
    const adapter = createLocalWorkerAdapter({ modelId: 'empty-file-model', checkpointPath, checkpointFingerprint, approvedModelsRoot: modelsRoot, outputRoot: freshDir('genesis-out-'), workerScript, pythonExecutable: PYTHON });
    const result = await adapter.generate({ capability: 'TEXT_TO_VIDEO', controlInput: validControlInput(), model: {}, runtime: {} });
    assert.equal(result.ok, false);
    assert.match(result.reason, /empty/);
  });

  test('a real (test-fixture) output file is passed back for canonical hashing (item 10)', async () => {
    const { modelsRoot, checkpointPath, checkpointFingerprint } = makeCheckpoint();
    const workerScript = withPluggedWorker('real-output-model', 'from pathlib import Path\ndef generate(request):\n    Path(request["outputPath"]).write_bytes(b"deterministic-fixture-video-bytes")\n    return {"ok": True, "outputPath": request["outputPath"], "limitations": ["test fixture, not a real model"]}\n');
    const outputRoot = freshDir('genesis-out-');
    const adapter = createLocalWorkerAdapter({ modelId: 'real-output-model', checkpointPath, checkpointFingerprint, approvedModelsRoot: modelsRoot, outputRoot, workerScript, pythonExecutable: PYTHON });
    const result = await adapter.generate({ capability: 'TEXT_TO_VIDEO', controlInput: validControlInput(), model: {}, runtime: {} });
    assert.equal(result.ok, true);
    assert.ok(existsSync(result.outputPath));
    const bytes = readFileSync(result.outputPath);
    assert.equal(bytes.toString('utf8'), 'deterministic-fixture-video-bytes');
    // genesisVideoEngine.mjs alone computes the canonical, verified SHA-256 — the adapter never hashes or classifies.
    const expectedHash = sha256(bytes);
    assert.equal(sha256(readFileSync(result.outputPath)), expectedHash);
  });
});

describe('Test: full canonical pipeline with a real (test-fixture) plugged model (items 10, 11, 12)', () => {
  test('executeGeneration reaches GENERATED with a verified hash, and every safety flag still holds (items 11, 12)', async () => {
    const { modelsRoot, checkpointPath, checkpointFingerprint } = makeCheckpoint();
    const workerScript = withPluggedWorker('pipeline-model', 'from pathlib import Path\ndef generate(request):\n    Path(request["outputPath"]).write_bytes(b"real-pipeline-fixture-bytes")\n    return {"ok": True, "outputPath": request["outputPath"], "limitations": ["Stage-B test fixture only"]}\n');
    const outputRoot = freshDir('genesis-out-');
    const adapter = createLocalWorkerAdapter({ modelId: 'pipeline-model', checkpointPath, checkpointFingerprint, approvedModelsRoot: modelsRoot, outputRoot, workerScript, pythonExecutable: PYTHON });

    const registry = engine.createModelRegistry();
    registry.registerLocalModel({ capability: engine.CAPABILITY.TEXT_TO_VIDEO, modelId: 'pipeline-model', version: '0.0.1-fixture', checkpointFingerprint, requiresDevice: 'cpu', requiresPython: false });

    const result = await engine.executeGeneration(
      { capability: 'TEXT_TO_VIDEO', worldId: 'w1', sourceScientificStateFingerprint: 'fp-real', promptOrShotDescription: 'x', modelConfiguration: { modelId: 'pipeline-model' } },
      { runtime: { gpu: { available: false }, python: { available: true } }, modelRegistry: registry, runner: adapter },
    );

    assert.equal(result.ok, true);
    assert.equal(result.record.status, engine.STATUS.GENERATED);
    assert.equal(result.record.outputSha256, sha256(readFileSync(result.record.outputPath)));
    assert.equal(result.record.mediaClass, engine.MEDIA_CLASS);
    assert.equal(result.record.mediaScope, engine.MEDIA_SCOPE);
    // item 11: scientific-state mutation remains impossible.
    assert.equal(result.record.scientificStateMutation, false);
    // item 12: Evidence eligibility remains false.
    assert.equal(result.record.evidenceEligible, false);
  });

  test('a promotion attempt in the raw input is rejected before the real adapter is ever invoked (item 11)', async () => {
    const { modelsRoot, checkpointPath, checkpointFingerprint } = makeCheckpoint();
    const workerScript = withPluggedWorker('never-called-model', 'from pathlib import Path\ndef generate(request):\n    Path(request["outputPath"]).write_bytes(b"should never run")\n    return {"ok": True, "outputPath": request["outputPath"]}\n');
    const adapter = createLocalWorkerAdapter({ modelId: 'never-called-model', checkpointPath, checkpointFingerprint, approvedModelsRoot: modelsRoot, outputRoot: freshDir('genesis-out-'), workerScript, pythonExecutable: PYTHON });
    const registry = engine.createModelRegistry();
    registry.registerLocalModel({ capability: engine.CAPABILITY.TEXT_TO_VIDEO, modelId: 'never-called-model', checkpointFingerprint, requiresDevice: 'cpu', requiresPython: false });

    const result = await engine.executeGeneration(
      { capability: 'TEXT_TO_VIDEO', worldId: 'w1', sourceScientificStateFingerprint: 'fp', promptOrShotDescription: 'x', evidenceEligible: true },
      { runtime: { gpu: { available: false } }, modelRegistry: registry, runner: adapter },
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, 'scientific_state_promotion_rejected');
    assert.equal(result.record, null);
  });
});

describe('Test: adapter accepts the existing canonical control package (item 13)', () => {
  test('the FROZEN output of videoControlContract.normalizeControlInput can be handed to adapter.generate() unmodified', async () => {
    const { modelsRoot, checkpointPath, checkpointFingerprint } = makeCheckpoint();
    const workerScript = withPluggedWorker('canonical-input-model', 'from pathlib import Path\ndef generate(request):\n    assert request["promptOrShotDescription"] == "a slow dolly through a foggy lab"\n    Path(request["outputPath"]).write_bytes(b"ok")\n    return {"ok": True, "outputPath": request["outputPath"]}\n');
    const adapter = createLocalWorkerAdapter({ modelId: 'canonical-input-model', checkpointPath, checkpointFingerprint, approvedModelsRoot: modelsRoot, outputRoot: freshDir('genesis-out-'), workerScript, pythonExecutable: PYTHON });
    const controlInput = validControlInput();
    assert.ok(Object.isFrozen(controlInput), 'normalizeControlInput must still return a frozen object — proving nothing here mutates it');
    const result = await adapter.generate({ capability: controlInput.capability, controlInput, model: {}, runtime: {} });
    assert.equal(result.ok, true);
  });
});

describe('Test: no second engine/runtime/registry was introduced (item 14)', () => {
  test('the adapter module exports only adapter-shaped symbols, never redefining canonical engine/runtime/registry functions', () => {
    const adapterExports = Object.keys(adapterModule);
    for (const forbidden of ['createModelRegistry', 'detectRuntime', 'planGeneration', 'executeGeneration', 'normalizeControlInput', 'CAPABILITY', 'STATUS']) {
      assert.equal(adapterExports.includes(forbidden), false, `localVideoWorkerAdapter.mjs must not redefine "${forbidden}"`);
    }
    assert.deepEqual(adapterExports.sort(), ['createLocalWorkerAdapter']);
  });

  test('the descriptor module exports only descriptor-shaped symbols, never a competing registry', () => {
    const descriptorExports = Object.keys(descriptorModule);
    for (const forbidden of ['createModelRegistry', 'detectRuntime', 'planGeneration', 'executeGeneration']) {
      assert.equal(descriptorExports.includes(forbidden), false, `localVideoModelDescriptor.mjs must not redefine "${forbidden}"`);
    }
  });

  test('the adapter reuses genesisVideoEngine.mjs\'s real createModelRegistry rather than shipping its own', async () => {
    const registry = engine.createModelRegistry();
    assert.equal(typeof registry.registerLocalModel, 'function');
    assert.equal(typeof registry.resolveModel, 'function');
    // The adapter module itself has no registry concept at all — confirmed by the export-shape test above.
  });
});

after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
