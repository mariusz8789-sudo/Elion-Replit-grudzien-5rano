/**
 * Molecular Dynamics + MM-GBSA integration (Genesis V3, Phases 2 & 3). After docking, MD runs ONLY
 * on top-ranked candidates to assess complex stability (RMSD/RMSF/H-bonds/interaction persistence),
 * and MM-GBSA rescoring runs ONLY after MD to estimate binding free energy — kept strictly separate
 * from the docking score.
 *
 * HONESTY (critical): a protein-ligand MD system requires a small-molecule force field to
 * parameterise the ligand. When that capability is absent at runtime (no OpenFF / openmmforcefields
 * / GAFF), the complex cannot be built, so MD returns BLOCKED_BY_RUNTIME and MM-GBSA (which depends
 * on an MD trajectory) returns BLOCKED_BY_RUNTIME — NEVER a fabricated trajectory, RMSD, or ΔG.
 */
import { execFileSync } from 'node:child_process';
import * as md from '../compute/mdAdapter.mjs';

export const MD_VERSION = 'genesis-md/1';
export const MMGBSA_VERSION = 'genesis-mmgbsa/1';
const PYTHON = process.env.GENESIS_PYTHON ?? 'python3';

/** Probe whether a small-molecule force field for ligand parameterisation is importable. */
function defaultLigandFfProbe() {
  try {
    const out = execFileSync(PYTHON, ['-c', 'import importlib.util as u;print(1 if (u.find_spec("openff.toolkit") or u.find_spec("openmmforcefields")) else 0)'], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return { available: out === '1' };
  } catch (e) { return { available: false, reason: String(e?.message ?? e).slice(0, 120) }; }
}

/**
 * Runtime capability for protein-ligand MD: OpenMM engine + ligand force field. Both required to
 * build the complex. Deps injectable for testing.
 */
export function detectMdCapability({ openmmDetect = () => md.detect(), ligandFfProbe = defaultLigandFfProbe } = {}) {
  const engine = openmmDetect();
  const ligandFf = ligandFfProbe();
  const canRunComplexMd = Boolean(engine.available && ligandFf.available);
  return {
    version: MD_VERSION, openmm: engine, ligandForceField: ligandFf, canRunComplexMd,
    reason: canRunComplexMd ? null
      : !engine.available ? `OpenMM unavailable: ${engine.reason}`
        : 'ligand force-field parameterisation unavailable (no OpenFF / openmmforcefields) — a protein-ligand MD system cannot be built',
  };
}

/**
 * Run MD on ONE docked candidate. Returns a stability report when the capability exists; otherwise
 * BLOCKED_BY_RUNTIME with the precise runtime reason — never a fabricated trajectory.
 * `spec`: { candidateId, ligandSmiles, receptorPdbqtPath, ns?, capability? }
 */
export function runComplexMd(spec, capability = detectMdCapability()) {
  if (!capability.canRunComplexMd) {
    return { status: 'BLOCKED_BY_RUNTIME', version: MD_VERSION, candidateId: spec?.candidateId ?? null, reason: capability.reason, blockedStage: capability.openmm?.available ? 'ligand_parameterisation' : 'openmm_engine', metrics: null };
  }
  // Execution path (reached only when a ligand force field is genuinely installed). Not exercised in
  // this environment; it must build the complex, run MD, and compute real metrics — never stubbed data.
  /* c8 ignore next 3 */
  return { status: 'CAPABILITY_PRESENT_NOT_IMPLEMENTED', version: MD_VERSION, candidateId: spec?.candidateId ?? null,
    reason: 'ligand force field present but the complex-MD execution path is not enabled in this build (V3 scope) — no fabricated metrics', metrics: null };
}

/**
 * MM-GBSA rescoring — runs ONLY after a completed MD trajectory. Kept strictly separate from the
 * docking score. Blocked when MD did not run (never fabricates a binding free energy).
 */
export function mmgbsaRescore({ mdResult, dockingScoreKcalMol = null } = {}) {
  if (!mdResult || mdResult.status !== 'COMPLETED') {
    return { status: 'BLOCKED_BY_RUNTIME', version: MMGBSA_VERSION, reason: 'MM-GBSA requires a completed MD trajectory; MD did not run — no fabricated binding free energy', dockingScoreKcalMol, bindingFreeEnergyKcalMol: null, perResidue: null };
  }
  /* c8 ignore next 2 */
  return { status: 'CAPABILITY_PRESENT_NOT_IMPLEMENTED', version: MMGBSA_VERSION, reason: 'MD trajectory available but MM-GBSA computation is not enabled in this build (V3 scope)', dockingScoreKcalMol, bindingFreeEnergyKcalMol: null, perResidue: null };
}

/**
 * Campaign integration: run MD (then MM-GBSA) on the top-N docked candidates. Returns per-candidate
 * results + a stability summary. Honest BLOCKED status flows through; docking and MM-GBSA scores are
 * kept separate. `dockedCandidates`: [{ candidateId, canonicalSmiles, docking:{bestAffinityKcalMol} }].
 */
export function runMdStage(dockedCandidates, { topN = 3, capability = detectMdCapability(), receptorPdbqtPath = null } = {}) {
  const targets = (dockedCandidates ?? []).slice(0, Math.max(0, topN));
  const results = targets.map((c) => {
    const mdResult = runComplexMd({ candidateId: c.candidateId, ligandSmiles: c.canonicalSmiles, receptorPdbqtPath }, capability);
    const mmgbsa = mmgbsaRescore({ mdResult, dockingScoreKcalMol: c.docking?.bestAffinityKcalMol ?? null });
    return { candidateId: c.candidateId, dockingScoreKcalMol: c.docking?.bestAffinityKcalMol ?? null, md: mdResult, mmgbsa };
  });
  const status = capability.canRunComplexMd ? 'COMPLETED' : 'BLOCKED_BY_RUNTIME';
  return {
    version: MD_VERSION, status, capability: { openmm: capability.openmm?.available ?? false, ligandForceField: capability.ligandForceField?.available ?? false, canRunComplexMd: capability.canRunComplexMd, reason: capability.reason },
    candidatesConsidered: targets.length, results,
    note: 'Docking score (empirical) and MM-GBSA binding free energy are reported separately and are never conflated.',
  };
}
