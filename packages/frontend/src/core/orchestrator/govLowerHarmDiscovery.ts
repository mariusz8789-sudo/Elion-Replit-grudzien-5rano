import { canonicalJson, fnv1a } from '../events/hash';
import { parseProblem } from './nl';
import { runScientificDiscovery } from './orchestrator';
import { createProductionLowerHarmAdapters, createSyntheticWinnerLowerHarmAdapters, LowerHarmFailClosedError, type LowerHarmAdapterBundle } from './govLowerHarmAdapters';
import type { DiscoveryRun, ProblemRecord } from './contracts';

/**
 * THE CANONICAL PUBLIC DISCOVERY ENTRY POINT (docs/DECISIONS.md D-058,
 * "Winner Promotion Gate E2E completion", mandate item 2).
 *
 * `runGovLowerHarmDiscovery` is the one function a caller (a script, a test,
 * a UI screen) needs: NL text in, a structured, auditable, replayable
 * result out, with an explicit terminal state — `RUN` (carrying the
 * existing `DiscoveryRun.verdict`: `WINNER` | `NO_WINNER` |
 * `CONFLICTING_EVIDENCE` | `INSUFFICIENT_EVIDENCE` | `ABORTED`) or
 * `EXECUTION_BLOCKED` (a port genuinely refused to proceed — e.g. TOP2 has
 * fewer than 2 real candidates to falsify).
 *
 * NOTHING NEW IS DECIDED HERE. This wraps three already-existing,
 * unmodified pieces: `parseProblem` (D-055, fail-closed NL parsing),
 * `createProductionLowerHarmAdapters`/`createSyntheticWinnerLowerHarmAdapters`
 * (D-058, real adapters over real decision functions), and
 * `runScientificDiscovery` (D-055, unmodified — already applies the D-057
 * Winner Promotion Gate generically at its own stage 18, for ANY adapter).
 * The only genuinely new behaviour is catching an adapter's fail-closed
 * throw and presenting it as a structured `EXECUTION_BLOCKED` result rather
 * than an uncaught exception — `runScientificDiscovery`'s own contract is
 * untouched, so every existing D-055/D-057 test keeps passing unmodified.
 */

export interface ExecutionBlockedResult {
  readonly kind: 'EXECUTION_BLOCKED';
  readonly problem: ProblemRecord;
  readonly error: string;
  readonly code: string;
  readonly fingerprint: string;
}

export type RunResult = { readonly kind: 'RUN' } & DiscoveryRun;
export type GovLowerHarmDiscoveryResult = RunResult | ExecutionBlockedResult;

export interface RunGovLowerHarmDiscoveryOptions {
  readonly mode?: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY';
  readonly nl?: string;
}

const DEFAULT_NL =
  'Among candidates in the GLP-1R/GIPR/GCGR mechanistic space, find the alternative that achieves clinically meaningful efficacy at the lowest achievable burden of harm relative to semaglutide.';

function buildBundle(mode: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY'): LowerHarmAdapterBundle {
  return mode === 'PRODUCTION' ? createProductionLowerHarmAdapters() : createSyntheticWinnerLowerHarmAdapters();
}

function buildProblem(mode: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY', nl: string, hash: (v: unknown) => string): ProblemRecord {
  return parseProblem(
    `LOWER-HARM-${mode}`,
    {
      text: nl,
      objectives: [
        { metric: 'efficacy_margin_above_floor', direction: 'maximize' },
        { metric: 'safety_score', direction: 'maximize' },
      ],
      constraints: ['legal', 'feasible'],
      harmAxes: ['toxicity_organ_burden', 'severe_adverse_events', 'gastrointestinal_burden'],
      evidenceMinimum: '>=3 real observations, >=1 DIRECT_RANDOMISED or INDIRECT_RANDOMISED',
    },
    hash,
  );
}

export function runGovLowerHarmDiscovery(opts: RunGovLowerHarmDiscoveryOptions = {}): GovLowerHarmDiscoveryResult {
  const mode = opts.mode ?? 'PRODUCTION';
  const bundle = buildBundle(mode);
  const problem = buildProblem(mode, opts.nl ?? DEFAULT_NL, bundle.adapters.hash);

  try {
    const run = runScientificDiscovery(problem, bundle.adapters, mode);
    return Object.freeze({ kind: 'RUN', ...run });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = err instanceof LowerHarmFailClosedError ? err.code : 'UNKNOWN_FAIL_CLOSED';
    return Object.freeze({
      kind: 'EXECUTION_BLOCKED',
      problem,
      error: message,
      code,
      fingerprint: fnv1a(canonicalJson({ problemId: problem.problemId, error: message, code })),
    });
  }
}

/**
 * Real re-run through the SAME entry point (a fresh adapter bundle each
 * time, exactly as any real caller would invoke it) — proves the whole
 * pipeline, including a genuine EXECUTION_BLOCKED path, is reproducible.
 * Fails closed (returns `ok: false`) on any mismatch rather than asserting
 * success.
 */
export function replayGovLowerHarmDiscovery(opts: RunGovLowerHarmDiscoveryOptions = {}): { readonly ok: boolean; readonly first: GovLowerHarmDiscoveryResult; readonly second: GovLowerHarmDiscoveryResult } {
  const first = runGovLowerHarmDiscovery(opts);
  const second = runGovLowerHarmDiscovery(opts);
  let ok = false;
  if (first.kind === 'EXECUTION_BLOCKED' && second.kind === 'EXECUTION_BLOCKED') {
    ok = first.fingerprint === second.fingerprint;
  } else if (first.kind === 'RUN' && second.kind === 'RUN') {
    ok = first.auditFingerprint === second.auditFingerprint && first.verdict === second.verdict;
  }
  return { ok, first, second };
}
