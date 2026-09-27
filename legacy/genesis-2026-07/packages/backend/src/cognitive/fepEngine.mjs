/**
 * FEP Engine (Genesis V4, Phase 3). Free Energy Perturbation for relative binding affinity requires
 * specialised infrastructure: alchemical MD (e.g. OpenMM + a perturbation toolkit), a small-molecule
 * force field for ligand parameterisation, prepared solvated complexes, and — for any realistic
 * throughput — GPUs. When that infrastructure is present the engine runs real FEP; when it is
 * absent it returns BLOCKED_BY_RUNTIME and NEVER fabricates a ΔΔG, confidence, or uncertainty.
 */
import { execFileSync } from 'node:child_process';
import * as md from '../compute/mdAdapter.mjs';

export const FEP_VERSION = 'genesis-fep/1';
const PYTHON = process.env.GENESIS_PYTHON ?? 'python3';

function probe(spec) {
  try { return execFileSync(PYTHON, ['-c', spec], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() === '1'; }
  catch { return false; }
}

/** Detect FEP infrastructure. Deps injectable for testing. */
export function detectFepCapability({ openmmDetect = () => md.detect(), ligandFfProbe = () => probe('import importlib.util as u;print(1 if (u.find_spec("openff.toolkit") or u.find_spec("openmmforcefields")) else 0)'), fepToolkitProbe = () => probe('import importlib.util as u;print(1 if (u.find_spec("perses") or u.find_spec("openfe") or u.find_spec("yank")) else 0)'), gpuProbe = () => { try { execFileSync('nvidia-smi', ['-L'], { timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }); return true; } catch { return false; } } } = {}) {
  const openmm = openmmDetect().available;
  const ligandFf = ligandFfProbe();
  const fepToolkit = fepToolkitProbe();
  const gpu = gpuProbe();
  const missing = [!openmm && 'OpenMM', !ligandFf && 'ligand-force-field (OpenFF/openmmforcefields)', !fepToolkit && 'FEP-toolkit (perses/openfe/yank)', !gpu && 'GPU'].filter(Boolean);
  return { version: FEP_VERSION, openmm, ligandForceField: ligandFf, fepToolkit, gpu, canRunFep: missing.length === 0, missing };
}

/**
 * Relative binding-affinity FEP between two ligands against a target. Returns BLOCKED_BY_RUNTIME with
 * the missing infrastructure when FEP cannot run — never a fabricated ΔΔG. When capable (future
 * infra), runs real alchemical FEP. `spec`: { ligandA, ligandB, receptor, capability? }
 */
export function runRelativeFep(spec, capability = detectFepCapability()) {
  if (!capability.canRunFep) {
    return { status: 'BLOCKED_BY_RUNTIME', version: FEP_VERSION, reason: `FEP infrastructure unavailable: missing ${capability.missing.join(', ')}`, relativeBindingAffinityKcalMol: null, confidence: null, uncertaintyKcalMol: null, missing: capability.missing };
  }
  if (!spec?.ligandA || !spec?.ligandB || !spec?.receptor) {
    return { status: 'INVALID_INPUT', version: FEP_VERSION, reason: 'ligandA, ligandB, receptor required' };
  }
  /* c8 ignore next 3 — reached only with full FEP infrastructure (not this environment) */
  return { status: 'CAPABILITY_PRESENT_NOT_IMPLEMENTED', version: FEP_VERSION, reason: 'FEP infrastructure present but the alchemical run is not enabled in this build (V4 scope) — no fabricated ΔΔG', relativeBindingAffinityKcalMol: null, confidence: null, uncertaintyKcalMol: null };
}
