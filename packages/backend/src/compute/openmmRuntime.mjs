/** One process boundary for every OpenMM use-case. Adapters own scientific cases; this owns runtime admission/execution. */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePythonExecutable } from './pythonRuntime.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 180_000;
const detectCache = new Map();

function pythonExecutable() {
  return resolvePythonExecutable('GENESIS_OPENMM_PYTHON');
}

export function invokeOpenMm(workerFile, request, options = {}) {
  if (!['md_worker.py', 'openmm_worker.py'].includes(workerFile)) throw new Error('OPENMM_WORKER_NOT_ALLOWLISTED');
  const worker = path.join(ROOT, workerFile);
  const output = execFileSync(pythonExecutable(), [worker, JSON.stringify(request)], {
    timeout: options.timeout ?? TIMEOUT_MS,
    maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, OPENMM_CPU_THREADS: '1' },
  });
  return JSON.parse(output);
}

export function detectOpenMmRuntime(workerFile) {
  const cached = detectCache.get(workerFile);
  if (cached) return cached;
  let result;
  try {
    const response = invokeOpenMm(workerFile, { cmd: 'detect' }, { timeout: 30_000 });
    result = response.ok
      ? { available: true, version: response.version, platforms: response.platforms, pdbSha256: response.pdbSha256, engine: `OpenMM ${response.version} CPU` }
      : { available: false, reason: response.error || 'openmm_runtime_unavailable' };
  } catch (error) {
    result = { available: false, reason: `OpenMM runtime niedostępny: ${String(error?.message ?? error).slice(0, 160)}` };
  }
  detectCache.set(workerFile, result);
  return result;
}

export function resetOpenMmRuntimeDetection(workerFile) {
  if (workerFile) detectCache.delete(workerFile);
  else detectCache.clear();
}
