/**
 * Adapter Maxwell/FDTD: Node → realny PyMeep w krótkotrwałym procesie Python.
 *
 * Status AVAILABLE wymaga zarówno importu PyMeep, jak i przejścia referencyjnej
 * transmisji Fresnela na granicy dielektrycznej. Gdy runtime nie jest skonfigurowany,
 * adapter zwraca BLOCKED_BY_RUNTIME — nigdy wzór analityczny podszywający się pod FDTD.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'meep_worker.py');
const PYTHON = process.env.GENESIS_MEEP_PYTHON ?? process.env.GENESIS_PYTHON ?? 'python3';
const TIMEOUT_MS = 120_000;

let detectCache = null;

function invoke(request, timeout = TIMEOUT_MS) {
  const output = execFileSync(PYTHON, [WORKER, JSON.stringify(request)], {
    timeout,
    maxBuffer: 4 * 1024 * 1024,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(output);
}

/** Returns `{ available, version?, engine?, reason? }` based on an actual import. */
export function detect() {
  if (detectCache) return detectCache;
  try {
    const result = invoke({ cmd: 'detect' }, 30_000);
    detectCache = result.ok
      ? { available: true, version: result.version, engine: `PyMeep ${result.version}` }
      : { available: false, reason: result.error ?? 'pymeep_unavailable' };
  } catch (error) {
    detectCache = {
      available: false,
      reason: `python/pymeep niedostępne w runtime: ${String(error?.message ?? error).slice(0, 180)}`,
    };
  }
  return detectCache;
}

/** Test helper / runtime refresh. */
export function _resetDetect() {
  detectCache = null;
}

/** Runs the actual n1=1 → n2=2 FDTD Fresnel reference case. */
export function referenceCase() {
  const runtime = detect();
  if (!runtime.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: runtime.reason };
  try {
    const result = invoke({ cmd: 'reference' });
    if (!result.ok) return { ok: false, error: result.error ?? 'reference_failed' };
    return {
      ok: true,
      pass: Boolean(result.pass),
      case: result.case,
      expectedTransmittance: result.expectedTransmittance,
      actualTransmittance: result.actualTransmittance,
      tolerance: result.tolerance,
      version: result.version,
      data: result.data,
    };
  } catch (error) {
    return { ok: false, error: 'execution_failed', reason: String(error?.message ?? error).slice(0, 180) };
  }
}

/**
 * Executes the declared, limited real FDTD experiment. Input scope is intentionally
 * small: lossless non-dispersive planar n1/n2 interface at normal incidence.
 */
/** Runs the real 1D normal-incidence ideal-conductor reflection reference case. */
export function pecReflection(spec = {}) {
  const runtime = detect();
  if (!runtime.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: runtime.reason };
  try {
    const result = invoke({
      cmd: 'pec_reflection',
      frequency: spec.frequency ?? 1,
      resolution: spec.resolution ?? 80,
    });
    return result.ok
      ? { ok: true, data: result.data, meta: result.meta, version: result.version, pass: result.pass, tolerance: result.tolerance }
      : { ok: false, error: result.error ?? 'meep_execution_failed' };
  } catch (error) {
    return { ok: false, error: 'execution_failed', reason: String(error?.message ?? error).slice(0, 180) };
  }
}

export function interfaceTransmission(spec = {}) {
  const runtime = detect();
  if (!runtime.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: runtime.reason };
  try {
    const result = invoke({
      cmd: 'interface',
      n1: spec.n1 ?? 1,
      n2: spec.n2 ?? 2,
      frequency: spec.frequency ?? 1,
      resolution: spec.resolution ?? 80,
    });
    return result.ok
      ? { ok: true, data: result.data, meta: result.meta, version: result.version }
      : { ok: false, error: result.error ?? 'meep_execution_failed' };
  } catch (error) {
    return { ok: false, error: 'execution_failed', reason: String(error?.message ?? error).slice(0, 180) };
  }
}
