/**
 * Genesis Local AI-Video — local runtime discovery (STAGE A).
 *
 * A READ-ONLY probe of what this machine can actually run a local
 * AI-video model on. Every check:
 *   - never downloads anything from the network,
 *   - never loads a checkpoint (directory listings / stat only),
 *   - never modifies the system,
 *   - tolerates a missing command/package (reports it honestly, never throws),
 *   - never exposes secrets or unrelated environment values — the only
 *     environment variable this module ever reads or reports is
 *     `GENESIS_LOCAL_VIDEO_MODELS_DIR`, a path the operator configures
 *     themselves and expects to see echoed back.
 *
 * Every sub-probe is wrapped so a single missing tool (python3, ffmpeg,
 * nvidia-smi, …) can never take the whole probe down — the result always
 * comes back structured, with `available: false` and an honest `reason`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statfsSync } from 'node:fs';
import os from 'node:os';

const PROBE_TIMEOUT_MS = 2500;
const MODEL_EXTENSIONS = new Set(['.safetensors', '.ckpt', '.bin', '.pt', '.onnx', '.gguf']);

function run(cmd, args) {
  try {
    const out = execFileSync(cmd, args, { timeout: PROBE_TIMEOUT_MS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { ok: true, output: out };
  } catch (err) {
    return { ok: false, reason: String(err?.message ?? err).slice(0, 200) };
  }
}

function probeOperatingSystem() {
  return { platform: os.platform(), release: os.release(), arch: os.arch() };
}

function probeCpu() {
  const cpus = os.cpus() ?? [];
  return { arch: os.arch(), cores: cpus.length, model: cpus[0]?.model ?? null };
}

function probePython() {
  for (const bin of ['python3', 'python']) {
    const r = run(bin, ['--version']);
    if (r.ok) return { available: true, executable: bin, version: r.output.trim() || null };
  }
  return { available: false, executable: null, version: null, reason: 'no python3/python executable found on PATH' };
}

function probeRam() {
  return { totalBytes: os.totalmem(), freeBytes: os.freemem() };
}

function probeStorage(path = process.cwd()) {
  try {
    const s = statfsSync(path);
    return { available: true, path, availableBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
  } catch (err) {
    return { available: false, path, availableBytes: null, totalBytes: null, reason: String(err?.message ?? err).slice(0, 200) };
  }
}

/** nvidia-smi is the one portable, read-only way to ask "is there a CUDA
 *  GPU and how much VRAM does it have" without importing a Python/CUDA
 *  runtime just to find out. Absence is reported honestly, never guessed. */
function probeNvidiaGpu() {
  const r = run('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader']);
  if (!r.ok) return { available: false, gpus: [], reason: r.reason ?? 'nvidia-smi not available' };
  const gpus = r.output.trim().split('\n').filter(Boolean).map((line) => {
    const [name, memTotal, driverVersion] = line.split(',').map((s) => s.trim());
    const vramMb = memTotal ? Number.parseInt(memTotal, 10) : null;
    return { name: name ?? null, vramMb: Number.isFinite(vramMb) ? vramMb : null, driverVersion: driverVersion ?? null };
  });
  return { available: gpus.length > 0, gpus };
}

function probeCuda() {
  const r = run('nvcc', ['--version']);
  if (r.ok) {
    const match = /release\s+([\d.]+)/i.exec(r.output);
    return { available: true, version: match?.[1] ?? null, source: 'nvcc' };
  }
  const smi = run('nvidia-smi', []);
  if (smi.ok) {
    const match = /CUDA Version:\s*([\d.]+)/i.exec(smi.output);
    if (match) return { available: true, version: match[1], source: 'nvidia-smi' };
  }
  return { available: false, version: null, source: null, reason: 'neither nvcc nor nvidia-smi report a CUDA version' };
}

/** DirectML / ROCm / MPS — best-effort, never fabricated. Only ever
 *  reports what it can genuinely observe (env markers or driver files
 *  that ship with those runtimes); anything it cannot check comes back
 *  `unknown`, never a guessed `true`. */
function probeOtherAccelerators() {
  const rocm = existsSync('/opt/rocm');
  const mps = os.platform() === 'darwin' && os.arch() === 'arm64';
  return {
    rocm: { available: rocm, checked: '/opt/rocm existence' },
    directml: { available: 'unknown', reason: 'no portable read-only DirectML probe on this platform' },
    appleMps: { available: mps, checked: 'darwin + arm64' },
  };
}

function probePythonPackage(pkg) {
  const py = probePython();
  if (!py.available) return { available: false, version: null, reason: 'no python executable to import from' };
  const r = run(py.executable, ['-c', `import ${pkg}; print(getattr(${pkg}, "__version__", "unknown"))`]);
  if (!r.ok) return { available: false, version: null, reason: r.reason };
  return { available: true, version: r.output.trim() || null };
}

function probeFfmpeg() {
  const r = run('ffmpeg', ['-version']);
  if (!r.ok) return { available: false, version: null, reason: r.reason };
  const match = /ffmpeg version\s+(\S+)/i.exec(r.output);
  return { available: true, version: match?.[1] ?? null };
}

/** Lists (never loads) configured local model checkpoints. The directory
 *  is opt-in via `GENESIS_LOCAL_VIDEO_MODELS_DIR` — this is the ONLY
 *  environment variable this module ever reads or reports. */
function probeLocalModels() {
  const dir = process.env.GENESIS_LOCAL_VIDEO_MODELS_DIR ?? null;
  if (dir === null) return { configured: false, directory: null, checkpoints: [], reason: 'GENESIS_LOCAL_VIDEO_MODELS_DIR is not set' };
  if (!existsSync(dir)) return { configured: true, directory: dir, checkpoints: [], reason: 'configured directory does not exist' };
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    const checkpoints = entries
      .filter((e) => e.isFile() && MODEL_EXTENSIONS.has(entryExt(e.name)))
      .map((e) => e.name);
    return { configured: true, directory: dir, checkpoints };
  } catch (err) {
    return { configured: true, directory: dir, checkpoints: [], reason: String(err?.message ?? err).slice(0, 200) };
  }
}
function entryExt(name) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

/**
 * Runs every sub-probe and returns one structured, honest diagnostic
 * object. Never throws; a sub-probe failure is reported inline, never
 * propagated as an exception that would take down a caller.
 */
export function detectRuntime() {
  const safe = (fn, fallback) => { try { return fn(); } catch (err) { return { ...fallback, reason: String(err?.message ?? err).slice(0, 200) }; } };
  const gpu = safe(probeNvidiaGpu, { available: false, gpus: [] });
  return {
    probedAt: new Date().toISOString(),
    os: safe(probeOperatingSystem, {}),
    cpu: safe(probeCpu, {}),
    python: safe(probePython, { available: false, executable: null, version: null }),
    ram: safe(probeRam, { totalBytes: null, freeBytes: null }),
    storage: safe(() => probeStorage(), { available: false, availableBytes: null, totalBytes: null }),
    cuda: safe(probeCuda, { available: false, version: null }),
    gpu,
    vramMb: gpu.gpus?.[0]?.vramMb ?? null,
    otherAccelerators: safe(probeOtherAccelerators, {}),
    pytorch: safe(() => probePythonPackage('torch'), { available: false, version: null }),
    diffusers: safe(() => probePythonPackage('diffusers'), { available: false, version: null }),
    ffmpeg: safe(probeFfmpeg, { available: false, version: null }),
    localModels: safe(probeLocalModels, { configured: false, directory: null, checkpoints: [] }),
  };
}
