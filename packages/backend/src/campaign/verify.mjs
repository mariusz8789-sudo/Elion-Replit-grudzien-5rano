/**
 * Scientific Run replay / verification (Priority B, Scientific Reproducibility).
 *
 * The flagship capability of this milestone: given a persisted Scientific
 * Run, RE-EXECUTE the same real engine call with the exact stored inputs and
 * compare the result against the stored output hash. This turns
 * "reproducibility" from a data-collection exercise (hashes sitting in a
 * database, unverified) into a checkable claim.
 *
 * Verdicts are deliberately not binary pass/fail — collapsing them would
 * misrepresent what was actually observed:
 *   MATCH                 — same engine version, output identical (or within
 *                           the capability's documented numerical tolerance
 *                           — see TOLERANCE below; docking/QM are engineered
 *                           to be bit-exact given identical inputs, so their
 *                           tolerance is 0, while ADMET-AI's batched neural-
 *                           network inference has a MEASURED ~1e-6 relative
 *                           batch-composition sensitivity, so a hash mismatch
 *                           alone would falsely flag noise as drift).
 *   DRIFT                 — same engine version, output differs beyond the
 *                           capability's tolerance. Real, measured numerical
 *                           drift (e.g. an engine with inherent floating-
 *                           point sensitivity — see docs/BENCHMARK_SUITE.md's
 *                           MD minimization finding for the same phenomenon
 *                           in a different engine).
 *   ENGINE_VERSION_CHANGED — the installed engine version differs from the one
 *                           that produced the original run. A hash difference
 *                           here cannot be cleanly attributed to drift vs.
 *                           environment change, so it is reported under its
 *                           own verdict rather than folded into DRIFT.
 *   BLOCKED_BY_RUNTIME     — the engine is not available in this runtime right
 *                           now; cannot replay (honest, not a failure).
 *   REPLAY_UNSUPPORTED     — this run's capability has no wired replay path.
 *
 * Only the capabilities actually persisted as Scientific Runs today are
 * wired: molecular-docking, quantum-chemistry, admet-estimation,
 * toxicity-risk-estimation (see campaign/multiFidelity.mjs). Every
 * verification attempt is persisted (append-only) via
 * store.saveScienceRunVerification — a run may be re-verified more than once.
 */
import { getScienceRun, saveScienceRunVerification, listScienceRunVerifications } from '../store.mjs';
import * as docking from '../compute/dockingAdapter.mjs';
import * as qm from '../compute/qmAdapter.mjs';
import * as admet from '../compute/admetAdapter.mjs';
import { embed3d } from '../compute/rdkitAdapter.mjs';
import { capabilityAvailable } from './toolchain.mjs';
import { endpointCategories, splitAdmetPrediction } from './multiFidelity.mjs';
import { sha256Hex16 as sha16, maxRelativeDiff } from '../provenance.mjs';

export const VERDICT = {
  MATCH: 'MATCH',
  DRIFT: 'DRIFT',
  ENGINE_VERSION_CHANGED: 'ENGINE_VERSION_CHANGED',
  BLOCKED_BY_RUNTIME: 'BLOCKED_BY_RUNTIME',
  REPLAY_UNSUPPORTED: 'REPLAY_UNSUPPORTED',
};

/**
 * Per-capability relative-difference tolerance for classifying MATCH vs
 * DRIFT. 0 means "must be bit-exact" (docking with a fixed seed and QM with
 * a fixed geometry/basis both measured exact-reproducible — see this
 * module's construction notes). ADMET-AI's tolerance is set from a directly
 * measured ceiling: predicting the same molecule alone vs. as part of a
 * larger batch differs by up to ~7.6e-6 absolute (~7e-7 relative) on stored
 * (non-percentile) endpoints — ordinary batched-inference floating-point
 * non-associativity, not a different answer. 1e-4 leaves >100x margin above
 * that measured noise floor while still catching a genuinely different result.
 */
const TOLERANCE = {
  'molecular-docking': 0,
  'quantum-chemistry': 0,
  'admet-estimation': 1e-4,
  'toxicity-risk-estimation': 1e-4,
};

/** Re-executes the underlying engine for one capability. Returns { ok, error?, engineVersion?, outputHash?, output? }. */
const REPLAYERS = {
  'molecular-docking': (inputs) => {
    if (!capabilityAvailable('molecular-docking')) return { ok: false, error: 'BLOCKED_BY_RUNTIME' };
    const r = docking.dock({
      ligandSmiles: inputs.ligandSmiles, receptorSmiles: inputs.receptorSmiles, receptorPdbqt: inputs.receptorPdbqt,
      center: inputs.center, boxSize: inputs.boxSize, exhaustiveness: inputs.exhaustiveness, nPoses: inputs.nPoses, seed: inputs.seed,
    });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, engineVersion: r.data.vinaVersion, outputHash: sha16(r.data.poses), output: { bestAffinityKcalMol: r.data.bestAffinityKcalMol, nPoses: r.data.nPoses } };
  },
  'quantum-chemistry': (inputs) => {
    if (!capabilityAvailable('quantum-chemistry')) return { ok: false, error: 'BLOCKED_BY_RUNTIME' };
    const emb = embed3d(inputs.smiles);
    if (!emb.ok) return { ok: false, error: 'embed_failed' };
    const r = qm.singlePoint({ atoms: emb.atoms, charge: inputs.charge ?? emb.charge ?? 0, method: inputs.method, basis: inputs.basis });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, engineVersion: (r.meta.engine || '').replace('PySCF ', ''), outputHash: sha16(r.data), output: r.data };
  },
  'admet-estimation': (inputs) => replayAdmet(inputs, 'admet'),
  'toxicity-risk-estimation': (inputs) => replayAdmet(inputs, 'toxicity'),
};

function replayAdmet(inputs, kind) {
  if (!capabilityAvailable('admet-estimation')) return { ok: false, error: 'BLOCKED_BY_RUNTIME' };
  const r = admet.predict([inputs.smiles]);
  if (!r.ok) return { ok: false, error: r.error };
  const full = r.predictions[inputs.smiles] ?? {};
  const { admetOut, toxOut } = splitAdmetPrediction(full, endpointCategories());
  const out = kind === 'toxicity' ? toxOut : admetOut;
  return { ok: true, engineVersion: r.version, outputHash: sha16(out), output: out };
}

/**
 * Replays one Scientific Run and classifies the result. Does NOT persist —
 * see verifyScienceRun for the persisted, primary entry point. Exposed
 * separately so tests / dry-run tooling can inspect a verdict without
 * writing an audit row.
 */
export function replayScienceRun(db, runId) {
  const run = getScienceRun(db, runId);
  if (!run) return { ok: false, error: 'run_not_found' };

  const replayer = REPLAYERS[run.capability];
  if (!replayer) {
    return { ok: true, run, verdict: VERDICT.REPLAY_UNSUPPORTED, detail: { reason: `no replay path wired for capability '${run.capability}'` } };
  }

  const replay = replayer(run.inputs);
  if (!replay.ok) {
    const blocked = replay.error === 'BLOCKED_BY_RUNTIME';
    return {
      ok: true, run,
      verdict: blocked ? VERDICT.BLOCKED_BY_RUNTIME : VERDICT.REPLAY_UNSUPPORTED,
      detail: { reason: replay.error ?? 'replay_failed' },
    };
  }

  const versionChanged = run.engineVersion != null && replay.engineVersion != null && run.engineVersion !== replay.engineVersion;
  const hashMatch = run.outputHash != null && run.outputHash === replay.outputHash;
  const tolerance = TOLERANCE[run.capability] ?? 0;
  const relDiff = hashMatch ? 0 : maxRelativeDiff(run.outputs, replay.output);
  const withinTolerance = hashMatch || (Number.isFinite(relDiff) && relDiff <= tolerance);

  let verdict;
  if (versionChanged) verdict = VERDICT.ENGINE_VERSION_CHANGED;
  else if (withinTolerance) verdict = VERDICT.MATCH;
  else verdict = VERDICT.DRIFT;

  return {
    ok: true, run, verdict,
    originalOutputHash: run.outputHash, replayOutputHash: replay.outputHash,
    originalEngineVersion: run.engineVersion, replayEngineVersion: replay.engineVersion,
    detail: { hashMatch, versionChanged, maxRelativeDiff: relDiff, tolerance, replayOutput: replay.output },
  };
}

/** Replays a run AND persists the verification as an append-only audit row. Primary entry point. */
export function verifyScienceRun(db, runId) {
  const result = replayScienceRun(db, runId);
  if (!result.ok) return result;
  const saved = saveScienceRunVerification(db, {
    scienceRunId: runId,
    verdict: result.verdict,
    originalOutputHash: result.originalOutputHash ?? null,
    replayOutputHash: result.replayOutputHash ?? null,
    originalEngineVersion: result.originalEngineVersion ?? result.run.engineVersion ?? null,
    replayEngineVersion: result.replayEngineVersion ?? null,
    detail: result.detail ?? {},
  });
  return { ok: true, verification: saved };
}

export function getVerificationHistory(db, runId) {
  return listScienceRunVerifications(db, runId);
}
