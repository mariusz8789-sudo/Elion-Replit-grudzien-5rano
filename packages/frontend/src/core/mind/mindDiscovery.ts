import { runScientificDiscovery } from '../orchestrator/orchestrator';
import type { DiscoveryRun, ProblemRecord } from '../orchestrator/contracts';
import { verifyEvidenceCustody, type EvidenceCustodyResult } from '../orchestrator/evidenceCustody';
import { EvidenceConnectorStore } from '../evidenceConnectors/store';
import type { ConnectorPort, SourceConfig } from '../evidenceConnectors/contracts';
import { canonicalJson, fnv1a } from '../events/hash';
import { createMindAdapters, MindBackendUnavailableError, type CreateMindAdaptersOptions } from './mindAdapters';

/**
 * THE MIND DISCOVERY ENTRY POINT (docs/DECISIONS.md D-060).
 *
 * Mirrors `govLowerHarmDiscovery.ts`/`govE2E01Discovery.ts` exactly — same
 * result union, same `EXECUTION_BLOCKED` terminal state, same frozen results,
 * same async-shell/synchronous-pipeline split. `runScientificDiscovery`
 * (D-055) is called unmodified; every existing D-055/D-057/D-058/D-059 test
 * keeps passing.
 *
 * NOTHING NEW IS DECIDED HERE. The verdict comes from the injected real
 * adjudicator via the adapters; promotion to a `WinnerRecord` is still
 * decided by `orchestrator.ts`'s own D-057 Winner Promotion Gate, which this
 * file never inspects, bypasses, or second-guesses.
 */

export type MindFailClosedCode =
  | 'MALFORMED_PROBLEM'
  | 'INSUFFICIENT_KNOWLEDGE_PROVENANCE'
  | 'INCONSISTENT_MODEL'
  | 'MISSING_PREDICTION'
  | 'MISSING_FALSIFICATION_CRITERION'
  | 'UNABLE_TO_FREEZE'
  | 'BACKEND_UNAVAILABLE'
  | 'INVALID_EVIDENCE_PROVENANCE'
  | 'REPLAY_MISMATCH'
  | 'MISSING_EXPERIMENT_RESULT'
  | 'CORRUPTED_RESEARCH_STATE'
  | 'AMBIGUOUS_TERMINAL'
  | 'UNKNOWN_DOMAIN';

export class MindFailClosedError extends Error {
  constructor(
    message: string,
    public readonly code: MindFailClosedCode,
  ) {
    super(`FAIL_CLOSED[${code}]: ${message}`);
    this.name = 'MindFailClosedError';
  }
}

export interface MindEvidenceSource {
  readonly store: EvidenceConnectorStore;
  readonly source: SourceConfig;
  readonly port: ConnectorPort;
}

export interface RunMindDiscoveryOptions extends CreateMindAdaptersOptions {
  readonly mode?: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY';
  /** PRODUCTION only. Omit to run without a custody gate — which is itself refused in PRODUCTION (see below). */
  readonly evidence?: MindEvidenceSource;
}

export interface MindExecutionBlocked {
  readonly kind: 'EXECUTION_BLOCKED';
  readonly problem: ProblemRecord;
  readonly error: string;
  readonly code: MindFailClosedCode;
  readonly fingerprint: string;
  readonly evidenceCustody: EvidenceCustodyResult | null;
}

export type MindRunResult = { readonly kind: 'RUN'; readonly evidenceCustody: EvidenceCustodyResult | null } & DiscoveryRun;
export type MindDiscoveryResult = MindRunResult | MindExecutionBlocked;

export async function runMindDiscovery(options: RunMindDiscoveryOptions): Promise<MindDiscoveryResult> {
  const mode = options.mode ?? 'PRODUCTION';
  let custody: EvidenceCustodyResult | null = null;

  try {
    // parseProblem (D-055) already decided this; we only refuse to proceed on its finding.
    if (options.problem.status !== 'FORMALIZED') {
      throw new MindFailClosedError(`problem is ${options.problem.status}: ${options.problem.missingInputs.join('; ')}`, 'MALFORMED_PROBLEM');
    }

    if (mode === 'PRODUCTION') {
      // A real run over unverified bytes is exactly what D-059 exists to refuse.
      if (options.evidence === undefined) {
        throw new MindFailClosedError('PRODUCTION mode requires a custody-verified evidence source; none was supplied', 'INVALID_EVIDENCE_PROVENANCE');
      }
      custody = await verifyEvidenceCustody(options.evidence.store, options.evidence.source, options.evidence.port);
      if (!custody.ok) throw new MindFailClosedError(custody.reason, 'INVALID_EVIDENCE_PROVENANCE');
      if (!options.ports.backend.available) {
        throw new MindFailClosedError('required execution backend is unavailable', 'BACKEND_UNAVAILABLE');
      }
    }

    // Async work is finished; everything below is the synchronous D-055 pipeline.
    const bundle = createMindAdapters(options);
    const run = runScientificDiscovery(options.problem, bundle.adapters, mode);
    return Object.freeze({ ...run, kind: 'RUN' as const, evidenceCustody: custody });
  } catch (error) {
    const failure = toFailClosed(error);
    return Object.freeze({
      kind: 'EXECUTION_BLOCKED' as const,
      problem: options.problem,
      error: failure.message,
      code: failure.code,
      fingerprint: fnv1a(canonicalJson({ problemId: options.problem.problemId, code: failure.code, error: failure.message })),
      evidenceCustody: custody,
    });
  }
}

function toFailClosed(error: unknown): { readonly message: string; readonly code: MindFailClosedCode } {
  if (error instanceof MindFailClosedError) return { message: error.message, code: error.code };
  if (error instanceof MindBackendUnavailableError) return { message: error.message, code: 'BACKEND_UNAVAILABLE' };
  const message = error instanceof Error ? error.message : String(error);
  // The real predictionRegistry's own guards surface here rather than being re-implemented as a second check.
  if (message.includes('predictionRegistry')) return { message, code: 'MISSING_PREDICTION' };
  return { message, code: 'AMBIGUOUS_TERMINAL' };
}

/** Real re-run through the SAME entry point. Fails closed (`ok:false`) on any mismatch rather than assuming success. */
export async function replayMindDiscovery(
  options: RunMindDiscoveryOptions,
): Promise<{ readonly ok: boolean; readonly first: MindDiscoveryResult; readonly second: MindDiscoveryResult }> {
  const first = await runMindDiscovery(options);
  const second = await runMindDiscovery(options);
  let ok = false;
  if (first.kind === 'RUN' && second.kind === 'RUN') {
    ok = first.auditFingerprint === second.auditFingerprint && first.verdict === second.verdict;
  } else if (first.kind === 'EXECUTION_BLOCKED' && second.kind === 'EXECUTION_BLOCKED') {
    ok = first.fingerprint === second.fingerprint;
  }
  return { ok, first, second };
}
