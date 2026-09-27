import { sha256HexSync } from '@genesis/core/knowledge/sha256.js';
import { canonicalJson } from '../events/hash';
import type { ReplayVerdict as ReplayVocabulary } from '../matrixFoundation/replayVerdict';

/**
 * SCIENTIFIC WORLDS — THE EXPERIMENT SESSION.
 *
 * One deterministic record owns an experiment from request to result: the
 * exact inputs, the exact solver invocation (experimentId + seed), the
 * steps that were executed, the resulting values, the evidence hashes the
 * engine committed to the EvidenceLedger, a content hash over all of it and
 * a replay fingerprint over the part that must reproduce. The 3D world
 * shows THIS session's result and nothing else — the rendered artifact and
 * the reported numbers are the same run by construction.
 *
 * A hash proves identity of the stored record, never truth of the claim:
 * `epistemicStatus` says what kind of statement the outputs are.
 */

export type EpistemicStatus =
  | 'REAL_OBSERVATION'
  | 'VERIFIED_SOURCE'
  | 'MODEL'
  | 'SIMULATION'
  | 'HYPOTHESIS'
  | 'SPECULATIVE'
  | 'FICTION_INSPIRED_SCENARIO'
  | 'NOT_MODELED'
  | 'INSUFFICIENT_EVIDENCE';

export const EPISTEMIC_STATUSES: readonly EpistemicStatus[] = [
  'REAL_OBSERVATION', 'VERIFIED_SOURCE', 'MODEL', 'SIMULATION', 'HYPOTHESIS', 'SPECULATIVE', 'FICTION_INSPIRED_SCENARIO', 'NOT_MODELED', 'INSUFFICIENT_EVIDENCE',
];

export type SessionOutputValue = number | string | boolean;
export type SessionInputs = Readonly<Record<string, unknown>>;

export interface ExperimentSession {
  readonly sessionId: string;
  readonly worldId: string;
  readonly stationId?: string;
  readonly experimentId: string;
  readonly seed: number;
  readonly inputs: SessionInputs;
  readonly steps: readonly string[];
  readonly outputs: Readonly<Record<string, SessionOutputValue>>;
  readonly evidenceHashes: readonly string[];
  readonly contentHash: string;
  readonly epistemicStatus: EpistemicStatus;
  /** The engine's own label of the result (e.g. TOY_MC_MODEL, EMPIRICAL_ESTIMATE_MODEL, speculative). */
  readonly engineLabel: string;
  readonly replayFingerprint: string;
  readonly createdAtLogicalTime: number;
}

/** What a runner returns: the outputs plus everything the session needs to say what they are. */
export interface ExperimentRunResult<A = unknown> {
  readonly outputs: Readonly<Record<string, SessionOutputValue>>;
  readonly evidenceHashes: readonly string[];
  readonly epistemicStatus: EpistemicStatus;
  readonly engineLabel: string;
  readonly steps: readonly string[];
  /** The renderable payload of THE SAME run (lattice sites, event tracks, SEIR series...). Never re-generated for display. */
  readonly artifact: A;
}

export type ExperimentRunner<A = unknown> = (experimentId: string, seed: number, inputs: SessionInputs) => ExperimentRunResult<A>;

export interface ExperimentSessionSpec {
  readonly worldId: string;
  readonly stationId?: string;
  readonly experimentId: string;
  readonly seed: number;
  readonly inputs: SessionInputs;
  readonly logicalTime: number;
}

export interface SessionWithArtifact<A = unknown> {
  readonly session: ExperimentSession;
  readonly artifact: A;
}

/** A session replay either reproduces the fingerprint or drifts — a subset of the one replay vocabulary. */
export type ReplayStatus = Extract<ReplayVocabulary, 'MATCH' | 'DRIFT'>;

export interface ReplayVerdict {
  readonly status: ReplayStatus;
  readonly message: string;
  readonly originalFingerprint: string;
  readonly rerunFingerprint: string;
  /** Output keys whose values differed, when DRIFT. */
  readonly driftedKeys: readonly string[];
}

const PRIMITIVE = (v: unknown): v is SessionOutputValue => typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));

export function replayFingerprintOf(experimentId: string, seed: number, inputs: SessionInputs, outputs: Readonly<Record<string, SessionOutputValue>>): string {
  return sha256HexSync(canonicalJson({ experimentId, seed, inputs, outputs }));
}

function assertOutputs(outputs: Readonly<Record<string, unknown>>): void {
  for (const [k, v] of Object.entries(outputs)) {
    if (!PRIMITIVE(v)) throw new Error(`ExperimentSession: output ${k} must be a finite number, string or boolean`);
  }
}

/**
 * Runs the experiment ONCE through `runner` and seals the result. The
 * artifact returned alongside is the same run's payload; a display layer
 * must render it rather than call the engine again.
 */
export function createExperimentSession<A>(spec: ExperimentSessionSpec, runner: ExperimentRunner<A>): SessionWithArtifact<A> {
  if (!Number.isInteger(spec.seed) || spec.seed < 0) throw new Error('ExperimentSession: seed must be a non-negative integer');
  const result = runner(spec.experimentId, spec.seed, spec.inputs);
  assertOutputs(result.outputs);
  if (!EPISTEMIC_STATUSES.includes(result.epistemicStatus)) throw new Error(`ExperimentSession: unknown epistemic status ${String(result.epistemicStatus)}`);
  const sessionId = 'ses-' + sha256HexSync(canonicalJson({ worldId: spec.worldId, experimentId: spec.experimentId, seed: spec.seed, inputs: spec.inputs, logicalTime: spec.logicalTime })).slice(0, 16);
  const replayFingerprint = replayFingerprintOf(spec.experimentId, spec.seed, spec.inputs, result.outputs);
  const body = {
    sessionId, worldId: spec.worldId, stationId: spec.stationId, experimentId: spec.experimentId, seed: spec.seed, inputs: spec.inputs,
    steps: result.steps, outputs: result.outputs, evidenceHashes: result.evidenceHashes, epistemicStatus: result.epistemicStatus,
    engineLabel: result.engineLabel, replayFingerprint, createdAtLogicalTime: spec.logicalTime,
  };
  const contentHash = sha256HexSync(canonicalJson(body));
  const session: ExperimentSession = { ...body, contentHash };
  return { session, artifact: result.artifact };
}

/**
 * run → save session → rebuild → rerun → compare. MATCH is reported only
 * because the rerun was actually performed and compared; DRIFT is a real
 * reproducibility failure and is named as one.
 */
export function replayExperimentSession<A>(session: ExperimentSession, runner: ExperimentRunner<A>): ReplayVerdict & { readonly artifact: A } {
  const rerun = runner(session.experimentId, session.seed, session.inputs);
  assertOutputs(rerun.outputs);
  const rerunFingerprint = replayFingerprintOf(session.experimentId, session.seed, session.inputs, rerun.outputs);
  const keys = new Set([...Object.keys(session.outputs), ...Object.keys(rerun.outputs)]);
  const driftedKeys = [...keys].filter((k) => canonicalJson(session.outputs[k]) !== canonicalJson(rerun.outputs[k])).sort();
  const match = rerunFingerprint === session.replayFingerprint && driftedKeys.length === 0;
  return {
    status: match ? 'MATCH' : 'DRIFT',
    message: match
      ? `Rebuilt from the saved session (experiment ${session.experimentId}, seed ${session.seed}) and re-executed: every output matched the original.`
      : `Re-execution of ${session.experimentId} with seed ${session.seed} diverged on ${driftedKeys.length ? driftedKeys.join(', ') : 'the fingerprint'} — a real reproducibility failure, not reported as a match.`,
    originalFingerprint: session.replayFingerprint,
    rerunFingerprint,
    driftedKeys,
    artifact: rerun.artifact,
  };
}

/** Recomputes the content hash of a stored session and says whether the record is intact. */
export function verifySessionIntegrity(session: ExperimentSession): boolean {
  const { contentHash, ...body } = session;
  return sha256HexSync(canonicalJson(body)) === contentHash;
}
