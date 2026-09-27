/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * RETROSYNTHESIS ROUTE SEARCH — Node → AiZynthFinder (MolecularAI, MIT).
 *
 * The capability the drug workflow was missing: given a molecule Genesis proposed computationally,
 * search for a synthetic route back to purchasable starting materials. The engine is the published
 * one — a Monte-Carlo tree search over disconnections from a trained template-based expansion policy,
 * terminating on a purchasable-stock query. Genesis contributes no chemistry: this adapter starts the
 * engine, records exactly which model data produced the answer, and returns what came back.
 *
 * Honest runtime states, never a substitute result:
 *  - ENGINE_NOT_INSTALLED   — the package is not importable by the configured interpreter.
 *  - MODEL_FILES_MISSING    — installed, but the published model data is not on disk. The engine's
 *                             models are ~1 GB, carry their own upstream licences and are NOT shipped
 *                             with Genesis; `GENESIS_RETRO_MODEL_DIR` must point at them.
 *  - AVAILABLE              — a route search will really run.
 * In the first two states this module returns BLOCKED_BY_RUNTIME with the missing files named. It
 * never emits a route it did not receive from the engine.
 *
 * Evidence class: MODEL_ESTIMATE. A route is a proposal from a policy trained on reaction literature.
 * It carries no conditions, quantities, yields or safety assessment, and is never a procedure to run.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePythonExecutable } from './pythonRuntime.mjs';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'retro_worker.py');
const PYTHON = resolvePythonExecutable('GENESIS_RETRO_PYTHON');
/** A tree search is bounded by its own iteration/time limits; this is the hard outer guard. */
const TIMEOUT_MS = 600_000;

export const RETRO_CAPABILITY = 'retrosynthesis-route-search';
export const RETRO_EVIDENCE_CLASS = 'MODEL_ESTIMATE';
export const RETRO_LICENSE = 'MIT (AiZynthFinder, MolecularAI)';
export const RETRO_CITATION = 'Genheden et al., AiZynthFinder: a fast, robust and flexible open-source software for retrosynthetic planning, J. Cheminform. 12, 70 (2020).';

let detectCache = null;

function invoke(request, timeout = TIMEOUT_MS) {
  const out = execFileSync(PYTHON, [WORKER, JSON.stringify(request)], {
    timeout, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

/**
 * Runtime capability. `available` is true only when the engine is importable AND every required model
 * file is on disk — a route cannot be produced without the model that ranks the disconnections.
 */
export function detect() {
  if (detectCache) return detectCache;
  try {
    const r = invoke({ cmd: 'detect' }, 60_000);
    if (!r.ok) {
      detectCache = { available: false, installed: false, reason: `${r.error}: ${r.detail ?? ''}`.trim(), models: null };
      return detectCache;
    }
    const version = r.versions?.aizynthfinder ?? null;
    detectCache = {
      available: Boolean(r.runnable),
      installed: true,
      engine: version ? `AiZynthFinder ${version}` : 'AiZynthFinder',
      engineVersion: version,
      versions: r.versions,
      models: r.models,
      reason: r.runnable ? null : r.reason,
    };
  } catch (err) {
    detectCache = {
      available: false, installed: false, models: null,
      reason: `AiZynthFinder not usable by the configured interpreter (GENESIS_RETRO_PYTHON): ${String(err?.message ?? err).slice(0, 200)}`,
    };
  }
  return detectCache;
}

/** Test seam: forget the cached probe. */
export function _resetDetect() { detectCache = null; }

/**
 * The documented reference case the registry validates the engine against: acetylsalicylic acid, whose
 * textbook disconnection (salicylic acid + an acetylating agent) is well inside the training
 * literature. The engine passes only if it SOLVES the target — every leaf of at least one route being
 * a purchasable starting material. A planner that cannot solve aspirin is not a working planner, and
 * the registry refuses to call it available.
 */
export const REFERENCE_CASE = { id: 'retro-aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O', name: 'acetylsalicylic acid' };

export function referenceCase(opts = {}) {
  const r = planRoute(REFERENCE_CASE.smiles, { iterationLimit: 100, maxRoutes: 3, ...opts });
  if (!r.ok) return { ok: false, case: REFERENCE_CASE.id, error: r.status, reason: r.reason, missingModelFiles: r.missingModelFiles ?? null };
  const solvedRoute = r.outputs.routes.find((route) => route.allStartingMaterialsInStock) ?? null;
  return {
    ok: true, case: REFERENCE_CASE.id, pass: Boolean(r.outputs.solved && solvedRoute),
    version: r.engineVersion, solved: r.outputs.solved, routeCount: r.outputs.routeCount,
    steps: solvedRoute?.steps ?? null,
    startingMaterials: solvedRoute?.startingMaterials.map((m) => m.smiles) ?? [],
    stoppedBy: r.outputs.stoppedBy, modelChecksums: r.provenance.modelChecksums,
  };
}

/**
 * Runs ONE route search. Returns the engine's own answer plus the identity of the model data that
 * produced it, so the run can be replayed and drift can be detected when the models change.
 *
 * Determinism: the search is bounded by `iterationLimit`; a wall-clock cutoff would make a replay
 * machine-dependent, so the engine reports which limit stopped it and that is carried into the result.
 */
export function planRoute(smiles, opts = {}) {
  const d = detect();
  if (!d.available) {
    return {
      ok: false, status: 'BLOCKED_BY_RUNTIME', capability: RETRO_CAPABILITY,
      reason: d.reason, missingModelFiles: d.models?.missing ?? null,
      requiredModelFiles: d.models?.files?.filter((f) => f.required).map((f) => ({ filename: f.filename, upstream: f.upstream })) ?? null,
    };
  }
  const request = {
    cmd: 'plan', smiles,
    iterationLimit: Number.isFinite(opts.iterationLimit) ? opts.iterationLimit : 100,
    timeLimitSeconds: Number.isFinite(opts.timeLimitSeconds) ? opts.timeLimitSeconds : 600,
    maxRoutes: Number.isFinite(opts.maxRoutes) ? opts.maxRoutes : 5,
    returnFirst: Boolean(opts.returnFirst),
  };
  const startedAt = Date.now();
  let r;
  try {
    r = invoke(request);
  } catch (err) {
    return { ok: false, status: 'ENGINE_FAILED', capability: RETRO_CAPABILITY, reason: String(err?.message ?? err).slice(0, 300) };
  }
  if (!r.ok) return { ok: false, status: r.error === 'MODEL_FILES_MISSING' ? 'BLOCKED_BY_RUNTIME' : 'ENGINE_FAILED', capability: RETRO_CAPABILITY, reason: r.error, detail: r.detail ?? null, missingModelFiles: r.models?.missing ?? null };
  const modelChecksums = Object.fromEntries((r.models?.files ?? []).filter((f) => f.present).map((f) => [f.role, f.sha256]));
  return {
    ok: true, status: 'OK', capability: RETRO_CAPABILITY, evidenceClass: RETRO_EVIDENCE_CLASS,
    engine: 'AiZynthFinder', engineVersion: r.versions?.aizynthfinder ?? null,
    method: `${r.search.algorithm} tree search, expansion policy ${r.search.policies.join('+')}`,
    inputs: { smiles, ...request, cmd: undefined },
    outputs: {
      solved: r.solved, routeCount: r.routeCount, routes: r.routes,
      iterations: r.search.iterations, stoppedBy: r.search.stoppedBy,
    },
    provenance: {
      engine: `AiZynthFinder ${r.versions?.aizynthfinder ?? '?'}`,
      license: RETRO_LICENSE, citation: RETRO_CITATION,
      versions: r.versions, modelChecksums, modelDir: r.models?.modelDir ?? null,
      determinism: r.search.stoppedBy === 'ITERATION_LIMIT'
        ? 'Bounded by the iteration limit — a replay on the same models reproduces the search.'
        : 'Stopped by the wall-clock limit — a replay may explore a different number of nodes and is NOT expected to match.',
      claimBoundary: 'A proposed route is a MODEL_ESTIMATE from a policy trained on reaction literature: no conditions, quantities, yields or safety assessment, and never an instruction to perform chemistry.',
    },
    durationMs: Date.now() - startedAt,
  };
}
