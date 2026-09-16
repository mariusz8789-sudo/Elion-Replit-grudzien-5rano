import { canonicalJson, fnv1a } from '../events/hash';
import { parseProblem, type NLInput } from './nl';
import { runScientificDiscovery } from './orchestrator';
import { createProductionLowerHarmAdapters, createSyntheticWinnerLowerHarmAdapters, LowerHarmFailClosedError, type LowerHarmAdapterBundle } from './govLowerHarmAdapters';
import { verifyEvidenceCustody, type EvidenceCustodyResult } from './evidenceCustody';
import { EvidenceConnectorStore } from '../evidenceConnectors/store';
import { sharedEvidenceConnectorStore } from '../evidenceConnectors/sharedStore';
import type { ConnectorPort, SourceConfig } from '../evidenceConnectors/contracts';
import { runA2Analysis } from '../biotechData/a2OzempicSubstitute';
import { LOWER_HARM_SCENARIO_ID } from '../biotechData/govDrugLowerHarmPreregistration';
import { buildLowerHarmRunDetail, buildLowerHarmWinnerRecord, type LowerHarmRunDetail, type LowerHarmWinnerRecord, type NoWinnerBlocker } from './winnerRecord';
import type { DiscoveryRun, ProblemRecord } from './contracts';

/**
 * THE CANONICAL PUBLIC DISCOVERY ENTRY POINT (docs/DECISIONS.md D-058/D-059).
 *
 * `runGovLowerHarmDiscovery` is the one function a caller (a script, a test,
 * a UI screen) needs: NL text in, a structured, auditable, replayable
 * result out, with an explicit terminal state — `RUN` (carrying the
 * existing `DiscoveryRun.verdict`: `WINNER` | `NO_WINNER` |
 * `CONFLICTING_EVIDENCE` | `INSUFFICIENT_EVIDENCE` | `ABORTED`) or
 * `EXECUTION_BLOCKED` (a port, or the D-059 evidence-custody gate,
 * genuinely refused to proceed).
 *
 * NOTHING NEW IS DECIDED HERE. This wraps: `parseProblem` (D-055,
 * fail-closed NL parsing, unmodified), `createProductionLowerHarmAdapters`/
 * `createSyntheticWinnerLowerHarmAdapters` (D-058, real adapters over real
 * decision functions), `runScientificDiscovery` (D-055, unmodified —
 * already applies the D-057 Winner Promotion Gate generically), and
 * `verifyEvidenceCustody` (D-059, over the real, unmodified D-057
 * `EvidenceConnectorStore`). `runScientificDiscovery`'s own contract is
 * untouched, so every existing D-055/D-057/D-058 test keeps passing
 * unmodified.
 *
 * D-059 GAP 1a — NL GENERALITY, GENUINELY REACHABLE. Before this entry, the
 * LOWER-HARM `ProblemRecord`'s structured fields (objectives/constraints/
 * harmAxes/evidenceMinimum) were ALWAYS hardcoded by this file regardless
 * of what the caller supplied — so `parseProblem`'s own real fail-closed
 * `NEEDS_INPUT` path was structurally unreachable in practice, even though
 * it is real code. `opts.problemInput`, when supplied, is passed to
 * `parseProblem` AS-IS (no defaults merged in) — an operator who submits a
 * genuinely vague/underspecified problem now gets a real, visible
 * `NEEDS_INPUT` abort, not a silently-filled-in one. Omitting
 * `problemInput` keeps today's default-filled LOWER-HARM problem exactly
 * as before (fully backward compatible with every existing caller/test).
 *
 * D-059 GAP 2 — EVIDENCE CUSTODY FOR REAL RUNS. `OrchestratorAdapters`
 * ports are synchronous (contracts.ts, untouched); `EvidenceConnectorStore`
 * is real async I/O. This entry point runs the D-059 custody gate
 * (`verifyEvidenceCustody`) BEFORE starting the synchronous decision
 * pipeline for `PRODUCTION` mode only — if the real evidence this run is
 * about to consume cannot be frozen and replay-verified, the run is
 * `EXECUTION_BLOCKED` and no verdict is ever computed from unverified
 * bytes. `SYNTHETIC_TEST_ONLY` never goes through this gate — there is no
 * real custody to verify for engineered evidence, and routing it through
 * the real store would risk exactly the synthetic-as-real blurring this
 * repo's discipline forbids.
 */

export interface ExecutionBlockedResult {
  readonly kind: 'EXECUTION_BLOCKED';
  readonly problem: ProblemRecord;
  readonly error: string;
  readonly code: string;
  readonly fingerprint: string;
  readonly evidenceCustody: EvidenceCustodyResult | null;
}

export type RunResult = {
  readonly kind: 'RUN';
  readonly evidenceCustody: EvidenceCustodyResult | null;
  /**
   * D-116 — read-only projection of what this run's real adapters computed
   * (candidate space, TOP2, the three Winner Gate conjuncts, every gate
   * decision incl. REQUIRES_HUMAN_APPROVAL, G2, evidence rows, recipe body).
   * Optional so the E2E01 domain's structurally-identical RunResult stays
   * assignable to the shared registry union; always present for LOWER-HARM.
   */
  readonly detail?: LowerHarmRunDetail;
  /** The first-class WinnerRecord when the run really promoted a winner and built a recipe; otherwise the exact blocker. */
  readonly winnerRecord?: LowerHarmWinnerRecord | NoWinnerBlocker;
} & DiscoveryRun;
export type GovLowerHarmDiscoveryResult = RunResult | ExecutionBlockedResult;

export interface RunGovLowerHarmDiscoveryOptions {
  readonly mode?: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY';
  readonly nl?: string;
  /** Supplied AS-IS to `parseProblem` — see this module's own header, D-059 gap 1a. Omit to keep the default LOWER-HARM-shaped problem. */
  readonly problemInput?: NLInput;
  /** Test/override seam for the D-059 custody gate. Defaults to the shared D-057 store + a real port reading the live pinned dataset. */
  readonly evidenceStore?: EvidenceConnectorStore;
  readonly evidenceConnectorPort?: ConnectorPort;
}

const DEFAULT_NL =
  'Among candidates in the GLP-1R/GIPR/GCGR mechanistic space, find the alternative that achieves clinically meaningful efficacy at the lowest achievable burden of harm relative to semaglutide.';

/** The real evidence source this domain's PRODUCTION runs consume — RAW data only (summary/efficacy/safety), never the derived score/falsification/belief fields, so a drift signal means "the underlying data changed", never "a scoring formula changed". */
export const LOWER_HARM_EVIDENCE_SOURCE: SourceConfig = {
  sourceId: 'LOWER_HARM_A2_PINNED_DATASET',
  name: 'A2 Ozempic-substitute pinned ChEMBL + ClinicalTrials.gov dataset (candidate reports actually used this run)',
  url: 'internal://a2-ozempic-substitute/candidates-with-trials.json',
  hashPolicy: 'sha256',
  category: 'CLINICAL_TRIALS',
};

export const defaultLowerHarmEvidencePort: ConnectorPort = {
  async fetchBytes(): Promise<Uint8Array> {
    const raw = runA2Analysis().candidateReports.map((r) => ({ summary: r.summary, efficacy: r.efficacy, safety: r.safety }));
    return new TextEncoder().encode(canonicalJson(raw));
  },
};

function buildBundle(mode: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY', evidenceCustody: EvidenceCustodyResult | null): LowerHarmAdapterBundle {
  return mode === 'PRODUCTION' ? createProductionLowerHarmAdapters(evidenceCustody) : createSyntheticWinnerLowerHarmAdapters();
}

function buildProblem(mode: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY', opts: RunGovLowerHarmDiscoveryOptions, hash: (v: unknown) => string): ProblemRecord {
  const input: NLInput = opts.problemInput ?? {
    text: opts.nl ?? DEFAULT_NL,
    objectives: [
      { metric: 'efficacy_margin_above_floor', direction: 'maximize' },
      { metric: 'safety_score', direction: 'maximize' },
    ],
    constraints: ['legal', 'feasible'],
    harmAxes: ['toxicity_organ_burden', 'severe_adverse_events', 'gastrointestinal_burden'],
    evidenceMinimum: '>=3 real observations, >=1 DIRECT_RANDOMISED or INDIRECT_RANDOMISED',
  };
  return parseProblem(`LOWER-HARM-${mode}`, input, hash);
}

export async function runGovLowerHarmDiscovery(opts: RunGovLowerHarmDiscoveryOptions = {}): Promise<GovLowerHarmDiscoveryResult> {
  const mode = opts.mode ?? 'PRODUCTION';
  const hash = (v: unknown): string => fnv1a(canonicalJson(v));
  const problem = buildProblem(mode, opts, hash);

  let evidenceCustody: EvidenceCustodyResult | null = null;
  if (mode === 'PRODUCTION') {
    const store = opts.evidenceStore ?? sharedEvidenceConnectorStore;
    const port = opts.evidenceConnectorPort ?? defaultLowerHarmEvidencePort;
    evidenceCustody = await verifyEvidenceCustody(store, LOWER_HARM_EVIDENCE_SOURCE, port);
    if (!evidenceCustody.ok) {
      return Object.freeze({
        kind: 'EXECUTION_BLOCKED',
        problem,
        error: evidenceCustody.reason,
        code: 'EVIDENCE_CUSTODY_FAILED',
        fingerprint: hash({ problemId: problem.problemId, custodyReason: evidenceCustody.reason }),
        evidenceCustody,
      });
    }
  }

  const bundle = buildBundle(mode, evidenceCustody);

  try {
    const run = runScientificDiscovery(problem, bundle.adapters, mode);
    // Projection only — computed AFTER the unmodified orchestrator returned, from the adapters'
    // diagnostics side-channel; never fed back into any decision, never part of auditFingerprint.
    const detail = buildLowerHarmRunDetail(LOWER_HARM_SCENARIO_ID, bundle.diagnostics);
    const winnerRecord = run.verdict === 'ABORTED' ? undefined : buildLowerHarmWinnerRecord(run, detail, evidenceCustody);
    return Object.freeze({ kind: 'RUN', evidenceCustody, ...run, detail, winnerRecord });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = err instanceof LowerHarmFailClosedError ? err.code : 'UNKNOWN_FAIL_CLOSED';
    return Object.freeze({
      kind: 'EXECUTION_BLOCKED',
      problem,
      error: message,
      code,
      fingerprint: hash({ problemId: problem.problemId, error: message, code }),
      evidenceCustody,
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
export async function replayGovLowerHarmDiscovery(opts: RunGovLowerHarmDiscoveryOptions = {}): Promise<{ readonly ok: boolean; readonly first: GovLowerHarmDiscoveryResult; readonly second: GovLowerHarmDiscoveryResult }> {
  const first = await runGovLowerHarmDiscovery(opts);
  const second = await runGovLowerHarmDiscovery(opts);
  let ok = false;
  if (first.kind === 'EXECUTION_BLOCKED' && second.kind === 'EXECUTION_BLOCKED') {
    ok = first.fingerprint === second.fingerprint;
  } else if (first.kind === 'RUN' && second.kind === 'RUN') {
    ok = first.auditFingerprint === second.auditFingerprint && first.verdict === second.verdict;
  }
  return { ok, first, second };
}
