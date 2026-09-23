/**
 * Genesis Engine Readiness Audit (read-only).
 *
 * Produces one truthful report of which scientific engines can actually run
 * right now, by consuming — never duplicating — the canonical toolchain
 * registry (`campaign/toolchain.mjs`) and the canonical runtime probe
 * (`compute/scienceEnv.mjs` via `provenance.mjs`'s `snapshotEnvironment`).
 *
 * This module runs NO engine invocation of its own: every reference-case
 * result comes from `listToolchain()`/`getTool()`, which already ran the
 * engine's real, committed reference case. `READY` is reported only when the
 * registry's own status is `AVAILABLE` (a passing reference case) — never
 * inferred from "the package imports" or any other weaker signal.
 *
 * The one thing this module adds is a small, static, explicit mapping (below)
 * from each toolchain `toolId` to the runtime/library/executable/GPU/model
 * requirements the registry does not itself structurally encode (it only
 * carries prose in `modelDomain`/`assumptions`). This mapping never adds,
 * removes, or redescribes what an engine does or whether it is available —
 * it only annotates the ids `listToolchain()` already returns, sourced
 * verbatim from each adapter's own doc comments.
 */
import { performance } from 'node:perf_hooks';
import { getTool, listToolIds, TOOL_STATUS, _resetValidation } from '../campaign/toolchain.mjs';
import { snapshotEnvironment } from '../provenance.mjs';
import { redact, redactDeep } from '../redact.mjs';

/** Re-exported for this module's own tests; the canonical implementation lives in ../redact.mjs, shared with campaign/toolchain.mjs. */
export const _redact = redact;

export const READINESS_STATUS = Object.freeze({
  READY: 'READY',
  BLOCKED_RUNTIME: 'BLOCKED_RUNTIME',
  BLOCKED_LIBRARY: 'BLOCKED_LIBRARY',
  BLOCKED_EXECUTABLE: 'BLOCKED_EXECUTABLE',
  BLOCKED_GPU: 'BLOCKED_GPU',
  BLOCKED_MODEL: 'BLOCKED_MODEL',
  BLOCKED_CONFIGURATION: 'BLOCKED_CONFIGURATION',
  FAILED_REFERENCE_CASE: 'FAILED_REFERENCE_CASE',
  FAILED_ENGINE: 'FAILED_ENGINE',
});

/** Canonical id order, read from the registry without running an engine. */
export const TOOLCHAIN_TOOL_IDS = Object.freeze(listToolIds());

/** toolId -> the adapter module that `campaign/toolchain.mjs`'s own `validate*` function actually calls (verified against toolchain.mjs's imports, not guessed from the toolId's name). */
const ADAPTER_MODULE = Object.freeze({
  rdkit: 'packages/backend/src/compute/rdkitAdapter.mjs',
  pyscf: 'packages/backend/src/compute/qmAdapter.mjs',
  openmm: 'packages/backend/src/compute/mdAdapter.mjs',
  vina: 'packages/backend/src/compute/dockingAdapter.mjs',
  biopython: 'packages/backend/src/compute/proteinAdapter.mjs',
  pymeep: 'packages/backend/src/compute/meepAdapter.mjs',
  admet: 'packages/backend/src/compute/admetAdapter.mjs',
  toxicity: 'packages/backend/src/compute/admetAdapter.mjs',
});

/** toolId -> declared runtime/library/executable/GPU/model requirements, sourced from each adapter's own doc comment (see module header). */
const REQUIREMENTS = Object.freeze({
  rdkit: { runtime: 'Python 3 interpreter (GENESIS_RDKIT_PYTHON, falls back to system python3)', library: 'rdkit (pip)', executable: 'NONE', gpu: 'NONE_DECLARED', model: 'NONE', envVar: 'GENESIS_RDKIT_PYTHON' },
  pyscf: { runtime: 'Python 3 interpreter (GENESIS_PYSCF_PYTHON, falls back to system python3)', library: 'pyscf (pip)', executable: 'NONE', gpu: 'NONE_DECLARED', model: 'NONE', envVar: 'GENESIS_PYSCF_PYTHON' },
  openmm: { runtime: 'Python 3 interpreter (GENESIS_OPENMM_PYTHON, falls back to system python3); adapter forces OPENMM_CPU_THREADS=1', library: 'openmm (pip/conda)', executable: 'NONE', gpu: 'NONE_DECLARED — adapter explicitly pins the CPU platform, no GPU platform is ever requested', model: 'NONE', envVar: 'GENESIS_OPENMM_PYTHON' },
  vina: { runtime: 'Python 3 interpreter (GENESIS_DOCKING_PYTHON, falls back to system python3)', library: 'vina + meeko (pip, AutoDock Vina Python bindings)', executable: 'NONE (bundled Python bindings, no separate CLI invoked)', gpu: 'NONE_DECLARED', model: 'NONE', envVar: 'GENESIS_DOCKING_PYTHON' },
  biopython: { runtime: 'Python 3 interpreter (falls back to system python3)', library: 'biopython (pip, imported as Bio)', executable: 'NONE', gpu: 'NONE_DECLARED', model: 'NONE', envVar: null },
  pymeep: { runtime: 'Python 3 interpreter (GENESIS_MEEP_PYTHON, falls back to system python3)', library: 'meep (conda-forge pymeep; rarely pip-installable)', executable: 'NONE', gpu: 'NONE_DECLARED', model: 'NONE', envVar: 'GENESIS_MEEP_PYTHON' },
  admet: { runtime: 'Python 3 interpreter (GENESIS_ADMET_PYTHON, falls back to system python3)', library: 'admet-ai (pip; ships a bundled Chemprop D-MPNN ensemble)', executable: 'NONE', gpu: 'NONE_DECLARED — adapter runs inference on CPU', model: 'BUNDLED_WITH_PACKAGE (weights ship inside the installed package; no separate download at inference)', envVar: 'GENESIS_ADMET_PYTHON' },
  toxicity: { runtime: 'Python 3 interpreter (GENESIS_ADMET_PYTHON, falls back to system python3)', library: 'admet-ai (pip; ships a bundled Chemprop D-MPNN ensemble)', executable: 'NONE', gpu: 'NONE_DECLARED — adapter runs inference on CPU', model: 'BUNDLED_WITH_PACKAGE (same engine and process as `admet`; a different endpoint category, not a separate install)', envVar: 'GENESIS_ADMET_PYTHON' },
});

/** Backend-registered engines this audit expected to find but did not — never silently omitted. */
const KNOWN_GAPS = Object.freeze([
  {
    name: 'SEIR (epidemiology compartmental model)',
    reason: 'No SEIR engine is registered in the backend toolchain registry (campaign/toolchain.mjs) or the compute model registry (compute/registry.mjs); grep for "SEIR" across packages/backend/src returns zero hits. Any SEIR simulation in this repository is frontend-only (packages/frontend/src/core/worldModel) and was never registered as a backend scientific engine — out of scope for this backend-only audit.',
  },
  {
    name: 'CERN collision engine (toy Monte Carlo particle collider)',
    reason: 'Not registered in any backend registry — it runs entirely client-side (packages/core/src/cern/ComputeColliderEngine.ts, packages/core/src/collider/QuantumColliderEngine.ts) behind a frontend-only KernelProviderRegistry. The backend does register a genuinely different, real thing that happens to also be CERN-related — the CMS Open Data Z→μμ adapter (compute/cmsOpenDataAdapter.mjs, compute model id particle-cern-cms-zmumu-invariant-mass in compute/registry.mjs), a real checksum-verified external dataset, not a collision-generation engine — but it is not part of the validated toolchain (campaign/toolchain.mjs) either, so it is not one of the audited engines below.',
  },
]);

// Populated only by current, unresolved inconsistencies. The stale capability
// manifest discovered during the audit is now fixed by deriving its live
// statuses from this same canonical toolchain.
const REGISTRY_BUGS = Object.freeze([]);

/** env_probe.py key -> the toolId it corresponds to, so the broader probe sweep does not re-list an engine already covered by the validated toolchain entries above. */
const PROBE_KEY_TO_TOOL_ID = Object.freeze({ rdkit: 'rdkit', pyscf: 'pyscf', openmm: 'openmm', pymeep: 'pymeep', biopython: 'biopython', vina_py: 'vina', meeko: 'vina', admet_ai: 'admet' });

function isNonEmptyEnv(name) {
  if (!name) return false;
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

/** Sub-classifies a BLOCKED_BY_RUNTIME reason into the required granular vocabulary, from the actual adapter error text — never guessed. */
function classifyBlockedRuntime(reason, envVarConfigured) {
  if (envVarConfigured) return READINESS_STATUS.BLOCKED_CONFIGURATION;
  const r = String(reason ?? '');
  if (/ENOENT|command not found|no such file or directory|not found in PATH/i.test(r)) return READINESS_STATUS.BLOCKED_EXECUTABLE;
  if (/ModuleNotFoundError|ImportError|No module named/i.test(r)) return READINESS_STATUS.BLOCKED_LIBRARY;
  return READINESS_STATUS.BLOCKED_RUNTIME;
}

function mapReadiness(tool, envVarConfigured) {
  switch (tool.status) {
    case TOOL_STATUS.AVAILABLE:
      return READINESS_STATUS.READY;
    case TOOL_STATUS.BLOCKED_BY_RUNTIME:
      return classifyBlockedRuntime(tool.reason, envVarConfigured);
    case TOOL_STATUS.BLOCKED_BY_LICENSE:
    case TOOL_STATUS.BLOCKED_BY_RESOURCES:
    case TOOL_STATUS.CAPABILITY_GAP:
    case TOOL_STATUS.UNVALIDATED:
      // Reserved statuses in the registry's own vocabulary; none of the eight
      // audited tools currently returns them, but a future one honestly could.
      return READINESS_STATUS.BLOCKED_CONFIGURATION;
    case TOOL_STATUS.VALIDATION_FAILED:
      // A reference case that ran and produced scored evidence (some assertion
      // failed) is FAILED_REFERENCE_CASE; a top-level exception from the
      // adapter itself (no evidence array — runValidation's catch path) is
      // FAILED_ENGINE. Distinguished purely from fields the registry already returns.
      return (Array.isArray(tool.validation) && tool.validation.length > 0) ? READINESS_STATUS.FAILED_REFERENCE_CASE : READINESS_STATUS.FAILED_ENGINE;
    default:
      return READINESS_STATUS.FAILED_ENGINE;
  }
}

function referenceCaseStatus(tool) {
  if (tool.status === TOOL_STATUS.AVAILABLE) return 'PASSED';
  if (Array.isArray(tool.validation) && tool.validation.length > 0) return 'FAILED';
  return 'NOT_EXECUTED';
}

function round2(ms) {
  return Math.round(ms * 100) / 100;
}

function toEngineEntry(toolId, durationMs) {
  const tool = getTool(toolId);
  const req = REQUIREMENTS[toolId];
  const envVarConfigured = isNonEmptyEnv(req.envVar);
  const readiness = mapReadiness(tool, envVarConfigured);
  return {
    toolId: tool.toolId,
    engineName: tool.engineName,
    version: redact(tool.version),
    capability: tool.capabilityId,
    domain: tool.domain,
    adapterModule: ADAPTER_MODULE[toolId],
    runtimeRequirement: req.runtime,
    libraryRequirement: req.library,
    executableRequirement: req.executable,
    gpuRequirement: req.gpu,
    modelCheckpointRequirement: req.model,
    availability: tool.availability,
    readiness,
    sourceStatus: tool.status,
    referenceCaseStatus: referenceCaseStatus(tool),
    blocker: readiness === READINESS_STATUS.READY ? null : redact(tool.reason ?? tool.failureReason ?? null),
    limitations: tool.assumptions,
    evidenceClass: tool.evidenceClass,
    license: tool.license,
    evidence: tool.validation ?? null,
    provenance: { ...tool.provenance, environment: redact(tool.environment) },
    fingerprint: tool.fingerprint,
    durationMs,
  };
}

function measuredToolchainEntries() {
  _resetValidation();
  return TOOLCHAIN_TOOL_IDS.map((toolId) => {
    const t0 = performance.now();
    const entry = toEngineEntry(toolId, 0);
    entry.durationMs = round2(performance.now() - t0);
    return entry;
  });
}

/** Python/binary libraries the generic runtime probe (env_probe.py) also checks, that are NOT one of the eight validated toolchain entries above — surfaced for completeness, clearly labelled as unvalidated (detected, not reference-case-proven). */
function additionalProbedLibraries(probedEngines) {
  const out = [];
  for (const [key, info] of Object.entries(probedEngines ?? {})) {
    if (PROBE_KEY_TO_TOOL_ID[key]) continue;
    out.push({
      probeKey: key,
      kind: info.kind ?? null,
      module: info.module ?? null,
      binary: info.binary ?? null,
      status: info.status ?? null,
      version: redact(info.version ?? null),
      note: 'Detected by the generic runtime probe (compute/scienceEnv.mjs); not a validated entry in the toolchain registry (campaign/toolchain.mjs) — no reference case has run against it.',
    });
  }
  out.sort((a, b) => a.probeKey.localeCompare(b.probeKey));
  return out;
}

/**
 * Builds the full, deterministic (aside from `generatedAt`/`durationMs`)
 * readiness report. Read-only: runs only the registry's own already-existing
 * reference cases, never a new engine invocation of its own.
 */
export function buildEngineReadinessReport() {
  const envSnapshot = snapshotEnvironment();
  const engines = measuredToolchainEntries();
  return {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    runtime: envSnapshot.ok ? redactDeep(envSnapshot.snapshot.runtime) : null,
    runtimeEnvironmentHash: envSnapshot.ok ? envSnapshot.hash : null,
    runtimeProbeError: envSnapshot.ok ? null : envSnapshot.error,
    engines,
    additionalProbedLibraries: envSnapshot.ok ? additionalProbedLibraries(envSnapshot.snapshot.engines) : [],
    knownGaps: KNOWN_GAPS,
    registryBugsDiscovered: REGISTRY_BUGS,
  };
}
