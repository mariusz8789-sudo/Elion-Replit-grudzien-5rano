/**
 * Genesis Local AI-Video — Stage-B worker adapter (Claude Stage-B branch).
 *
 * The smallest real local model adapter that consumes the EXISTING
 * `genesisVideoEngine.mjs` contract: `runner.generate({ capability,
 * controlInput, model, runtime })`. This file creates NO second engine, NO
 * second runtime-discovery system, and NO second model registry — it is a
 * `runner` implementation you attach to the canonical
 * `executeGeneration(rawInput, { runner, modelRegistry })`, exactly the
 * seam `genesisVideoEngine.mjs` already documents.
 *
 * It spawns an explicitly-configured local Python worker
 * (tools/genesis-local-video/worker/genesis_local_video_worker.py by
 * default) as a bounded, single-shot subprocess per generation attempt:
 * one JSON request line on stdin, one JSON response line on stdout, a
 * hard timeout that kills the process if exceeded. With no real model
 * plugged into that worker (the case today), every call honestly resolves
 * to `{ ok: false, reason: '... BLOCKED_MODEL_UNAVAILABLE ...' }`, which
 * `genesisVideoEngine.mjs` — unchanged, not touched by this branch — maps
 * to `FAILED_GENERATION` at the top-level `executeGeneration` result
 * (the canonical `BLOCKED_*` vocabulary only exists at the
 * `planGeneration` layer, before any runner is ever invoked; this
 * adapter's own `available()` method is where a caller or test can see a
 * BLOCKED-shaped reason directly — see docs/GENESIS_LOCAL_AI_VIDEO_STAGE_B.md).
 *
 * This adapter NEVER returns a `GENERATED_MEDIA` classification, a
 * `status`, or anything resembling the canonical `STATUS.GENERATED`
 * value itself — only `{ ok: true, outputPath, limitations }` or
 * `{ ok: false, reason }`, exactly the shape `executeGeneration` expects
 * from any runner. `genesisVideoEngine.mjs` alone verifies the output
 * file and computes its real SHA-256, and alone assigns the final status.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes — a real local video generation can be slow.

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** Resolves `candidate` against `root` and refuses anything that would
 *  escape it (path traversal, absolute path outside the root, symlink
 *  tricks are NOT resolved here — callers should keep roots on
 *  operator-controlled storage). Returns the resolved absolute path, or
 *  `null` if it escapes. */
function resolveWithinRoot(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);
  if (resolved === resolvedRoot) return null; // the root itself is never a valid file target
  if (!resolved.startsWith(resolvedRoot + path.sep)) return null;
  return resolved;
}

/**
 * Creates a `runner` compatible with `genesisVideoEngine.mjs`'s
 * `executeGeneration({ runner })`.
 *
 * Required config:
 *  - modelId, checkpointPath, checkpointFingerprint (64-hex SHA-256)
 *  - approvedModelsRoot — checkpointPath must resolve inside this
 *  - outputRoot — every generated file is written inside this only
 *  - workerScript — absolute path to the Python worker script
 *
 * Optional:
 *  - pythonExecutable (default: 'python' on win32, else 'python3')
 *  - timeoutMs (default 10 minutes)
 *  - device ('auto' | 'cuda' | 'directml' | 'cpu', default 'auto')
 */
export function createLocalWorkerAdapter(config) {
  const {
    modelId,
    checkpointPath,
    checkpointFingerprint,
    approvedModelsRoot,
    outputRoot,
    workerScript,
    pythonExecutable = process.platform === 'win32' ? 'python' : 'python3',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    device = 'auto',
  } = config ?? {};

  let currentChild = null;

  /** Synchronous, side-effect-free (besides ensuring outputRoot exists)
   *  pre-flight check. Never loads the checkpoint into memory — existence
   *  + SHA-256 of the file only. This is the "BLOCKED"-shaped surface: a
   *  caller (or this file's own tests) can inspect `reason` directly here,
   *  even though a `runner.generate()` failure always maps to
   *  FAILED_GENERATION one layer up through executeGeneration. */
  function available() {
    if (!modelId) return { ok: false, reason: 'adapter misconfigured: modelId is required' };
    if (!workerScript || !existsSync(workerScript)) {
      return { ok: false, reason: `worker script not found at "${workerScript}"` };
    }
    if (!approvedModelsRoot || !outputRoot) {
      return { ok: false, reason: 'adapter misconfigured: approvedModelsRoot and outputRoot are required' };
    }
    if (!checkpointPath) {
      return { ok: false, reason: 'no checkpointPath configured for this model' };
    }
    const resolvedCheckpoint = resolveWithinRoot(approvedModelsRoot, path.isAbsolute(checkpointPath) ? path.relative(approvedModelsRoot, checkpointPath) : checkpointPath);
    if (resolvedCheckpoint === null) {
      return { ok: false, reason: 'checkpointPath resolves outside the approved models root — refused' };
    }
    if (!existsSync(resolvedCheckpoint) || !statSync(resolvedCheckpoint).isFile()) {
      return { ok: false, reason: `checkpoint file does not exist at "${resolvedCheckpoint}"` };
    }
    if (!checkpointFingerprint || !/^[a-f0-9]{64}$/i.test(checkpointFingerprint)) {
      return { ok: false, reason: 'no valid 64-hex checkpointFingerprint configured for this model' };
    }
    const actualHash = sha256File(resolvedCheckpoint);
    if (actualHash.toLowerCase() !== checkpointFingerprint.toLowerCase()) {
      return { ok: false, reason: `checkpoint SHA-256 mismatch: expected ${checkpointFingerprint}, got ${actualHash}` };
    }
    try {
      mkdirSync(outputRoot, { recursive: true });
    } catch (err) {
      return { ok: false, reason: `cannot create/access outputRoot "${outputRoot}": ${String(err?.message ?? err).slice(0, 160)}` };
    }
    return { ok: true, resolvedCheckpoint, checkpointSha256: actualHash };
  }

  /** Kills the currently in-flight worker process, if any. The canonical
   *  `runner.generate()` signature carries no cancellation channel, so
   *  this is the adapter's own bounded-execution mechanism: a caller that
   *  holds a reference to this adapter object (not just to `executeGeneration`)
   *  can cancel proactively; every call is additionally bounded by `timeoutMs`
   *  regardless. */
  function cancelCurrent(signal = 'SIGTERM') {
    if (currentChild !== null) {
      currentChild.kill(signal);
      return true;
    }
    return false;
  }

  // `genesisVideoEngine.mjs` calls `runner.generate({ capability, controlInput, model, runtime })`
  // — `model` (the resolved registry entry) is part of that canonical shape but is not
  // destructured here: this adapter already knows its own checkpoint identity from its closure
  // config, not from the registry's copy of it.
  async function generate({ capability, controlInput, runtime }) {
    const pre = available();
    if (!pre.ok) return { ok: false, reason: pre.reason };

    let outputPath;
    const requestedLocation = controlInput?.outputLocation;
    if (typeof requestedLocation === 'string' && requestedLocation.length > 0) {
      const resolved = resolveWithinRoot(outputRoot, path.isAbsolute(requestedLocation) ? path.relative(outputRoot, requestedLocation) : requestedLocation);
      if (resolved === null) return { ok: false, reason: 'requested outputLocation resolves outside the approved output root — refused' };
      outputPath = resolved;
    } else {
      outputPath = path.join(path.resolve(outputRoot), `${randomUUID()}.mp4`);
    }

    const request = {
      requestId: randomUUID(),
      capability,
      modelId,
      checkpointPath: pre.resolvedCheckpoint,
      checkpointFingerprint,
      promptOrShotDescription: controlInput?.promptOrShotDescription ?? null,
      referenceImage: controlInput?.referenceImage ?? null,
      referenceVideo: controlInput?.referenceVideo ?? null,
      depthReference: controlInput?.depthReference ?? null,
      normalsReference: controlInput?.normalsReference ?? null,
      segmentationReference: controlInput?.segmentationReference ?? null,
      cameraTrajectory: controlInput?.cameraTrajectory ?? null,
      cameraMetadata: controlInput?.cameraMetadata ?? null,
      deterministicSeed: controlInput?.deterministicSeed ?? null,
      timingFps: controlInput?.timingFps ?? null,
      durationSeconds: controlInput?.durationSeconds ?? null,
      config: controlInput?.modelConfiguration ?? null,
      outputPath,
      device: runtime?.gpu?.available && device === 'auto' ? 'cuda' : device,
    };

    const outcome = await runWorkerOnce({ pythonExecutable, workerScript, request, timeoutMs, onSpawn: (child) => { currentChild = child; }, onSettle: () => { currentChild = null; } });
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    if (!existsSync(outputPath) || !statSync(outputPath).isFile()) {
      return { ok: false, reason: 'worker reported success but no real output file exists at the declared path — refused' };
    }
    if (statSync(outputPath).size === 0) {
      return { ok: false, reason: 'worker reported success but the output file is empty — refused' };
    }

    return { ok: true, outputPath, limitations: Array.isArray(outcome.limitations) ? outcome.limitations : [] };
  }

  return { modelId, checkpointFingerprint, available, cancelCurrent, generate };
}

/** Spawns the worker once, writes one JSON request line, reads one JSON
 *  response line, enforces `timeoutMs` (SIGTERM then SIGKILL), and never
 *  throws — every failure path returns `{ ok:false, reason }`. */
function runWorkerOnce({ pythonExecutable, workerScript, request, timeoutMs, onSpawn, onSettle }) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      onSettle();
      resolve(value);
    };

    let child;
    try {
      child = spawn(pythonExecutable, [workerScript], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      settle({ ok: false, reason: `failed to spawn worker: ${String(err?.message ?? err).slice(0, 200)}` });
      return;
    }
    onSpawn(child);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already exited */ } }, 3000);
      settle({ ok: false, reason: `worker timed out after ${timeoutMs}ms and was terminated` });
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      settle({ ok: false, reason: `worker process error: ${String(err?.message ?? err).slice(0, 200)}` });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return; // already resolved via timeout
      if (code !== 0) {
        settle({ ok: false, reason: `worker exited with code ${code}: ${stderr.slice(0, 300) || '(no stderr)'}` });
        return;
      }
      const line = stdout.trim().split('\n').filter(Boolean).pop();
      if (!line) {
        settle({ ok: false, reason: 'worker produced no output' });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        settle({ ok: false, reason: 'worker produced an unparsable response' });
        return;
      }
      if (!parsed || parsed.ok !== true) {
        settle({ ok: false, reason: parsed?.reason ?? 'worker reported failure' });
        return;
      }
      settle({ ok: true, limitations: parsed.limitations });
    });

    try {
      child.stdin.write(`${JSON.stringify(request)}\n`);
      child.stdin.end();
    } catch (err) {
      clearTimeout(timer);
      settle({ ok: false, reason: `failed to write request to worker stdin: ${String(err?.message ?? err).slice(0, 200)}` });
    }
  });
}
