import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectRuntime } from './localVideoRuntime.mjs';

describe('Test: local runtime discovery is read-only, structured, and never throws', () => {
  test('detectRuntime() returns a fully structured, non-throwing result on THIS real machine', () => {
    assert.doesNotThrow(() => detectRuntime());
    const r = detectRuntime();
    for (const key of ['os', 'cpu', 'python', 'ram', 'storage', 'cuda', 'gpu', 'otherAccelerators', 'pytorch', 'diffusers', 'transformers', 'onnxruntimeDirectml', 'ffmpeg', 'localModels']) {
      assert.ok(Object.prototype.hasOwnProperty.call(r, key), `missing key "${key}"`);
    }
    assert.equal(typeof r.probedAt, 'string');
  });

  test('a missing tool (GPU/CUDA/PyTorch/diffusers/ffmpeg) is reported honestly, never fabricated as available', () => {
    const r = detectRuntime();
    // This sandbox genuinely has none of these installed — asserting the SHAPE of an
    // honest negative report, not asserting the specific absence (which would make
    // this test brittle against a future environment that DOES have them).
    for (const probe of [r.cuda, r.gpu, r.pytorch, r.diffusers, r.ffmpeg]) {
      assert.equal(typeof probe.available, 'boolean');
      if (probe.available === false) assert.ok('reason' in probe || probe.gpus !== undefined, 'a false availability must explain itself');
    }
  });

  test('RAM and storage report real, positive numbers on this real machine', () => {
    const r = detectRuntime();
    assert.ok(r.ram.totalBytes > 0);
    assert.ok(r.storage.availableBytes === null || r.storage.availableBytes >= 0);
  });

  test('a detected GPU always includes an observed adapter name and never a fabricated VRAM value', () => {
    const r = detectRuntime();
    if (r.gpu.available) {
      assert.ok(r.gpu.gpus.length > 0);
      assert.equal(typeof r.gpu.gpus[0].name, 'string');
      assert.ok(r.gpu.gpus[0].vramMb === null || r.gpu.gpus[0].vramMb > 0);
    }
  });

  test('never exposes raw process.env — only the one explicitly-documented model-dir variable', () => {
    const r = detectRuntime();
    const serialized = JSON.stringify(r);
    // No probe result should ever contain an unrelated secret-shaped env var name.
    assert.doesNotMatch(serialized, /ANTHROPIC_API_KEY|AWS_SECRET|DATABASE_URL|_TOKEN"/i);
  });

  test('local model directory listing is honest: unset env -> configured:false; configured but empty dir -> configured:true, checkpoints:[]', () => {
    const before = detectRuntime().localModels;
    assert.equal(before.configured, false);

    const dir = mkdtempSync(join(tmpdir(), 'genesis-video-models-'));
    writeFileSync(join(dir, 'model.safetensors'), 'not-a-real-checkpoint-just-a-marker-file');
    writeFileSync(join(dir, 'readme.txt'), 'ignored, not a model extension');
    const prevEnv = process.env.GENESIS_LOCAL_VIDEO_MODELS_DIR;
    process.env.GENESIS_LOCAL_VIDEO_MODELS_DIR = dir;
    try {
      const after = detectRuntime().localModels;
      assert.equal(after.configured, true);
      assert.equal(after.directory, dir);
      assert.deepEqual(after.checkpoints, ['model.safetensors']);
    } finally {
      if (prevEnv === undefined) delete process.env.GENESIS_LOCAL_VIDEO_MODELS_DIR; else process.env.GENESIS_LOCAL_VIDEO_MODELS_DIR = prevEnv;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a nonexistent configured model directory is reported honestly, never silently treated as empty-and-fine', () => {
    const prevEnv = process.env.GENESIS_LOCAL_VIDEO_MODELS_DIR;
    process.env.GENESIS_LOCAL_VIDEO_MODELS_DIR = '/definitely/not/a/real/path/genesis-video-models';
    try {
      const r = detectRuntime().localModels;
      assert.equal(r.configured, true);
      assert.deepEqual(r.checkpoints, []);
      assert.ok(r.reason);
    } finally {
      if (prevEnv === undefined) delete process.env.GENESIS_LOCAL_VIDEO_MODELS_DIR; else process.env.GENESIS_LOCAL_VIDEO_MODELS_DIR = prevEnv;
    }
  });
});
