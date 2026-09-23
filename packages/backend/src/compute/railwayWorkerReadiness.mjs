/**
 * Railway scientific worker readiness matrix (P8). Read-only: classifies every
 * canonical engine (campaign/toolchain.mjs) plus the two non-toolchain,
 * stdlib-only data adapters (CMS Open Data, DepMap) by WHERE it deploys and
 * WHETHER its local reference case has actually passed in this runtime.
 *
 * Vocabulary is intentionally different from engineReadinessReport.mjs's
 * (READY/BLOCKED_LIBRARY/...): that module answers "is this engine ready in
 * THIS process". This module answers "what does Railway need to run it, and
 * has anything beyond the current process been proven" — so a passing local
 * reference case is reported as LOCAL_REFERENCE_PASS_PENDING_RAILWAY, never
 * as a claim that the engine works on Railway (nothing here has run there).
 */
import { getTool, TOOL_STATUS } from '../campaign/toolchain.mjs';
import { detect as cmsDetect } from './cmsOpenDataAdapter.mjs';
import { detect as depmapDetect } from './depmapAdapter.mjs';
import { redact } from '../redact.mjs';

export const DEPLOYMENT_CLASS = Object.freeze({
  EMBEDDED_MAIN_SERVICE: 'EMBEDDED_MAIN_SERVICE',
  RAILWAY_CPU_WORKER: 'RAILWAY_CPU_WORKER',
  EXTERNAL_WORKER: 'EXTERNAL_WORKER',
  GENUINE_EXTERNAL_BLOCKER: 'GENUINE_EXTERNAL_BLOCKER',
});

export const READINESS_STATUS = Object.freeze({
  RAILWAY_WORKER_CANDIDATE: 'RAILWAY_WORKER_CANDIDATE',
  LOCAL_REFERENCE_PASS_PENDING_RAILWAY: 'LOCAL_REFERENCE_PASS_PENDING_RAILWAY',
  BLOCKED_RUNTIME: 'BLOCKED_RUNTIME',
  BLOCKED_LICENSE: 'BLOCKED_LICENSE',
  BLOCKED_DATA: 'BLOCKED_DATA',
  FAILED_REFERENCE_CASE: 'FAILED_REFERENCE_CASE',
});

function statusFromToolStatus(toolStatus) {
  switch (toolStatus) {
    case TOOL_STATUS.AVAILABLE:
      return READINESS_STATUS.LOCAL_REFERENCE_PASS_PENDING_RAILWAY;
    case TOOL_STATUS.VALIDATION_FAILED:
      return READINESS_STATUS.FAILED_REFERENCE_CASE;
    case TOOL_STATUS.BLOCKED_BY_LICENSE:
      return READINESS_STATUS.BLOCKED_LICENSE;
    case TOOL_STATUS.BLOCKED_BY_RUNTIME:
    case TOOL_STATUS.BLOCKED_BY_RESOURCES:
    case TOOL_STATUS.CAPABILITY_GAP:
    case TOOL_STATUS.UNVALIDATED:
    default:
      return READINESS_STATUS.BLOCKED_RUNTIME;
  }
}

/**
 * Canonical toolId -> (deployment class, worker group, resource note).
 * Grouping rationale (RWK-3): PySCF+Biopython are small, fast-installing,
 * numpy/scipy-class stacks sharing one "chem-light" worker; OpenMM+Vina share
 * the RDKit-dependent docking/MD "structural" pipeline; ADMET/toxicity are
 * isolated in their own worker because admet-ai pulls a ~1.2GB PyTorch
 * install (verified in this runtime) that must not destabilize the other
 * workers' memory footprint. RDKit itself stays embedded in the main service
 * Dockerfile (already installed there; not duplicated by this task). PyMeep
 * has no working Railway/CPU-worker path today (see below) — it is a genuine
 * external blocker, not merely unassigned to a worker.
 */
const ENGINE_DEPLOYMENT = Object.freeze({
  rdkit: { deploymentClass: DEPLOYMENT_CLASS.EMBEDDED_MAIN_SERVICE, workerGroup: null },
  pyscf: { deploymentClass: DEPLOYMENT_CLASS.RAILWAY_CPU_WORKER, workerGroup: 'chem-light' },
  biopython: { deploymentClass: DEPLOYMENT_CLASS.RAILWAY_CPU_WORKER, workerGroup: 'chem-light' },
  openmm: { deploymentClass: DEPLOYMENT_CLASS.RAILWAY_CPU_WORKER, workerGroup: 'structural' },
  vina: { deploymentClass: DEPLOYMENT_CLASS.RAILWAY_CPU_WORKER, workerGroup: 'structural' },
  admet: { deploymentClass: DEPLOYMENT_CLASS.RAILWAY_CPU_WORKER, workerGroup: 'admet' },
  toxicity: { deploymentClass: DEPLOYMENT_CLASS.RAILWAY_CPU_WORKER, workerGroup: 'admet' },
  pymeep: { deploymentClass: DEPLOYMENT_CLASS.GENUINE_EXTERNAL_BLOCKER, workerGroup: null },
});

const PYMEEP_BLOCK_REASON =
  'Real PyMeep (MIT electromagnetic FDTD) is distributed only via the conda-forge ' +
  'channel with a native dependency chain (HDF5, MPICH/OpenMPI, harminv, libctl, ' +
  'guile, swig, GSL); it is not on PyPI. The PyPI package named "meep" (checked in ' +
  'this sandbox: version 1.0.6) is an unrelated release-automation tool, not the ' +
  'electromagnetics engine, and installing it would collide with the adapter\'s ' +
  '`import meep` without providing FDTD support. No conda/mamba/micromamba is present ' +
  'in this build environment and the Docker daemon is not reachable here (client-only ' +
  'Docker CLI, no /var/run/docker.sock) to build/test a conda-forge-based image. A ' +
  'proposed, UNTESTED worker Dockerfile is committed at ' +
  'packages/backend/workers/pymeep/Dockerfile.proposal for Codex or a Docker-capable ' +
  'environment to actually build and validate against meep_worker.py\'s reference case.';

function toolchainReadinessEntries() {
  return Object.keys(ENGINE_DEPLOYMENT).map((toolId) => {
    const tool = getTool(toolId);
    const deployment = ENGINE_DEPLOYMENT[toolId];
    const readinessStatus =
      toolId === 'pymeep' && tool.status !== TOOL_STATUS.AVAILABLE
        ? READINESS_STATUS.BLOCKED_RUNTIME
        : statusFromToolStatus(tool.status);
    return {
      toolId,
      engineName: tool.engineName,
      license: tool.license,
      package: tool.package,
      version: tool.version,
      deploymentClass: deployment.deploymentClass,
      workerGroup: deployment.workerGroup,
      readinessStatus,
      localToolStatus: tool.status,
      fingerprint: tool.fingerprint,
      validation: tool.validation,
      reason: toolId === 'pymeep' && tool.status !== TOOL_STATUS.AVAILABLE ? PYMEEP_BLOCK_REASON : tool.reason,
      limitations: tool.assumptions,
    };
  });
}

/**
 * The two non-toolchain, stdlib-only data adapters. Neither needs a pinned
 * Python package or a dedicated worker image — both already run wherever the
 * main service's python3 runs. Their only real blocker is DATA: is the
 * checksum-verified source file present.
 */
function dataAdapterEntries() {
  const cms = cmsDetect();
  const depmap = depmapDetect();
  return [
    {
      toolId: 'cms-open-data-zmumu',
      engineName: 'CMS Open Data Z→μμ (record 5208)',
      license: 'CC0-1.0 (dataset); repository code MIT',
      package: null,
      version: cms.version ?? null,
      deploymentClass: DEPLOYMENT_CLASS.EMBEDDED_MAIN_SERVICE,
      workerGroup: null,
      readinessStatus: cms.available ? READINESS_STATUS.LOCAL_REFERENCE_PASS_PENDING_RAILWAY : READINESS_STATUS.BLOCKED_DATA,
      localToolStatus: cms.available ? 'AVAILABLE' : 'DATA_REQUIRED',
      fingerprint: null,
      validation: null,
      reason: cms.available ? null : redact(cms.reason),
      limitations: 'Python stdlib only (csv/hashlib/statistics); the checksum-verified CSV is committed in-repo, so this needs no pinned package and no dedicated worker.',
    },
    {
      toolId: 'depmap-24q2',
      engineName: 'DepMap 24Q2 senescence/cell-cycle panel',
      license: 'DepMap Public 24Q2 terms (dataset); repository code MIT',
      package: null,
      version: depmap.version ?? null,
      deploymentClass: depmap.available ? DEPLOYMENT_CLASS.EMBEDDED_MAIN_SERVICE : DEPLOYMENT_CLASS.GENUINE_EXTERNAL_BLOCKER,
      workerGroup: null,
      readinessStatus: depmap.available ? READINESS_STATUS.LOCAL_REFERENCE_PASS_PENDING_RAILWAY : READINESS_STATUS.BLOCKED_DATA,
      localToolStatus: depmap.available ? 'AVAILABLE' : 'DATA_REQUIRED',
      fingerprint: null,
      validation: null,
      reason: depmap.available ? null : redact(depmap.reason),
      limitations: 'Python stdlib only. Unlike the CMS CSV, the multi-file DepMap 24Q2 CRISPR dataset is NOT committed in-repo (large, versioned figshare release) — genuinely external until an operator sets GENESIS_DEPMAP_24Q2_DATA_DIR to a hash-verified copy.',
    },
  ];
}

/** Full matrix: canonical toolchain engines + the two stdlib data adapters. */
export function buildRailwayWorkerReadiness() {
  const engines = [...toolchainReadinessEntries(), ...dataAdapterEntries()];
  const byWorkerGroup = {};
  for (const e of engines) {
    if (!e.workerGroup) continue;
    (byWorkerGroup[e.workerGroup] ??= []).push(e.toolId);
  }
  return {
    generatedAt: new Date().toISOString(),
    engines,
    workerGroups: byWorkerGroup,
    counts: {
      total: engines.length,
      localReferencePassPendingRailway: engines.filter((e) => e.readinessStatus === READINESS_STATUS.LOCAL_REFERENCE_PASS_PENDING_RAILWAY).length,
      blockedRuntime: engines.filter((e) => e.readinessStatus === READINESS_STATUS.BLOCKED_RUNTIME).length,
      blockedData: engines.filter((e) => e.readinessStatus === READINESS_STATUS.BLOCKED_DATA).length,
      blockedLicense: engines.filter((e) => e.readinessStatus === READINESS_STATUS.BLOCKED_LICENSE).length,
      failedReferenceCase: engines.filter((e) => e.readinessStatus === READINESS_STATUS.FAILED_REFERENCE_CASE).length,
    },
  };
}
