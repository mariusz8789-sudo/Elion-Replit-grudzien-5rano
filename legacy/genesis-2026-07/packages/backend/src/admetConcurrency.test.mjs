/**
 * ADMET-AI capability-detection concurrency regression (Corpus Mandate Phase 18).
 *
 * Root cause of the intermittent full-suite skips: the worker ran a full `import admet_ai`
 * (~18 s, loads torch/chemprop) for the CHEAP `detect` command. Under full-suite concurrency,
 * many worker subprocesses paid that cost simultaneously, saturated the machine, and tripped
 * the 30 s detect timeout → spurious "capability unavailable" → tests self-skipped.
 *
 * Fix: `detect` now uses importlib.find_spec + metadata (no torch import), so detection is
 * ~0.15 s and contention-free. This test drives many CONCURRENT detections and asserts they all
 * agree and succeed — the exact failure mode. Engine-gated: if ADMET-AI is genuinely absent it
 * self-skips with an explicit reason (a deterministic capability skip, not a masked failure).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as admet from './compute/admetAdapter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(__dirname, 'compute', 'admet_worker.py');
const PYTHON = process.env.GENESIS_PYTHON ?? 'python3';

function detectOnce() {
  return new Promise((resolve) => {
    execFile(PYTHON, [WORKER, JSON.stringify({ cmd: 'detect' })], { timeout: 30_000, encoding: 'utf8' }, (err, stdout) => {
      if (err) return resolve({ ok: false, error: String(err.message).slice(0, 80) });
      try { resolve(JSON.parse(stdout)); } catch { resolve({ ok: false, error: 'bad_json' }); }
    });
  });
}

test('detect is contention-free: 16 concurrent detections all agree and none time out', async (t) => {
  admet._resetDetect();
  const base = admet.detect();
  if (!base.available) { t.skip(`ADMET-AI genuinely unavailable in this runtime: ${base.reason}`); return; }

  // 16 concurrent cheap detections — with the old heavy-import detect these would contend and
  // some would ETIMEDOUT; with the fix each is ~0.15 s.
  const results = await Promise.all(Array.from({ length: 16 }, () => detectOnce()));
  const okCount = results.filter((r) => r.ok).length;
  assert.equal(okCount, 16, `all 16 concurrent detections must succeed (got ${okCount}); timeouts would indicate the heavy-import regression`);
  const versions = new Set(results.map((r) => r.version));
  assert.equal(versions.size, 1, 'all detections must report the same version (deterministic)');
});
