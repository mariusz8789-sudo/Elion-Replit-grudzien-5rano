import { canonicalJson, fnv1a } from '../events/hash';
import { parseProblem, type NLInput } from './nl';
import { runScientificDiscovery } from './orchestrator';
import { createE2E01Adapters, E2E01FailClosedError, type E2E01AdapterBundle } from './govE2E01Adapters';
import { verifyEvidenceCustody, type EvidenceCustodyResult } from './evidenceCustody';
import { EvidenceConnectorStore } from '../evidenceConnectors/store';
import { sharedEvidenceConnectorStore } from '../evidenceConnectors/sharedStore';
import type { ConnectorPort, SourceConfig } from '../evidenceConnectors/contracts';
import { loadGeneratedCandidates } from '../biotechData/govDrugDiscoveryE2E';
import { E2E01_PREREGISTRATION } from '../biotechData/govDrugDiscoveryE2EPreregistration';
import type { DiscoveryRun, ProblemRecord } from './contracts';

/**
 * THE E2E-01 CANONICAL PUBLIC DISCOVERY ENTRY POINT (docs/DECISIONS.md
 * D-059, C2 gap 1b — "a second REAL domain runs end-to-end through the SAME
 * orchestrator"). Mirrors `govLowerHarmDiscovery.ts` (D-058/D-059) exactly:
 * same shape, same custody gate, same fail-closed discipline — over a
 * DIFFERENT real domain (`govE2E01Adapters.ts`, wrapping the real, already
 * historically-verified E2E-01 pipeline in `govDrugDiscoveryE2E.ts`) to
 * prove the generic `runScientificDiscovery` orchestrator (D-055) is a
 * genuine engine, not a single hardcoded scenario dressed up as one.
 *
 * NOTHING NEW IS DECIDED HERE — see `govLowerHarmDiscovery.ts`'s own header
 * for the general rationale (parseProblem/orchestrator/custody gate all
 * reused unmodified); this file only substitutes the E2E-01 adapter bundle
 * and its own real evidence source.
 */

export interface ExecutionBlockedResult {
  readonly kind: 'EXECUTION_BLOCKED';
  readonly problem: ProblemRecord;
  readonly error: string;
  readonly code: string;
  readonly fingerprint: string;
  readonly evidenceCustody: EvidenceCustodyResult | null;
}

export type RunResult = { readonly kind: 'RUN'; readonly evidenceCustody: EvidenceCustodyResult | null } & DiscoveryRun;
export type GovE2E01DiscoveryResult = RunResult | ExecutionBlockedResult;

export interface RunGovE2E01DiscoveryOptions {
  readonly mode?: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY';
  readonly nl?: string;
  /** Supplied AS-IS to `parseProblem` — see `govLowerHarmDiscovery.ts`'s header, D-059 gap 1a. Omit to keep the default E2E-01-shaped problem. */
  readonly problemInput?: NLInput;
  /** Test/override seam for the D-059 custody gate. Defaults to the shared D-057 store + a real port reading the live pinned generated-candidate-space dataset. */
  readonly evidenceStore?: EvidenceConnectorStore;
  readonly evidenceConnectorPort?: ConnectorPort;
}

const DEFAULT_NL =
  'Across the full generated incretin-axis candidate space (GLP-1R/GIPR/GCGR agonism), find the molecule with a clinically meaningful efficacy advantage over semaglutide that survives every preregistered safety and falsification attack.';

/**
 * The real evidence source this domain's PRODUCTION runs consume — the
 * pinned, SHA-256-verified GENERATED candidate space itself (2671
 * molecules; docs/DECISIONS.md D-032), stripped to RAW generation fields
 * only (never the derived Tier-1/Tier-2/TOP3/falsification/score outputs,
 * exactly mirroring `LOWER_HARM_EVIDENCE_SOURCE`'s raw/derived split) — so
 * a drift signal here means "the underlying generated space changed",
 * never "the funnel logic changed".
 */
export const E2E01_EVIDENCE_SOURCE: SourceConfig = {
  sourceId: 'E2E01_GENERATED_CANDIDATE_SPACE',
  name: 'E2E-01 pinned, generated GLP-1R/GIPR/GCGR candidate space (ChEMBL, raw generation fields actually used this run)',
  url: 'internal://gov-drug-discovery-e2e/generated-candidate-space.json',
  hashPolicy: 'sha256',
  category: 'CHEMBL_GENERATED_SPACE',
};

export const defaultE2E01EvidencePort: ConnectorPort = {
  async fetchBytes(): Promise<Uint8Array> {
    const raw = loadGeneratedCandidates().map((c) => ({
      moleculeChemblId: c.moleculeChemblId,
      prefName: c.prefName,
      moleculeType: c.moleculeType,
      maxPhase: c.maxPhase,
      medianPotencyNMByTarget: c.medianPotencyNMByTarget,
      qualifyingAssayCounts: c.qualifyingAssayCounts,
      distinctAssayCount: c.distinctAssayCount,
      generatedBy: c.generatedBy,
      provenance: { source: c.provenance.source, identifier: c.provenance.identifier, retrievalTime: c.provenance.retrievalTime },
    }));
    return new TextEncoder().encode(canonicalJson(raw));
  },
};

function buildBundle(_mode: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY', evidenceCustody: EvidenceCustodyResult | null): E2E01AdapterBundle {
  // Same real pipeline for both modes — SYNTHETIC_TEST_ONLY differs only in
  // that it never goes through the D-059 custody gate (see this module's
  // header); there is no separate/engineered E2E-01 fixture (unlike
  // LOWER-HARM's D-058 synthetic-winner demo) because this domain's own
  // real pinned data already produces the historical NO_WINNER anchor —
  // manufacturing a second, engineered E2E-01 winner fixture is exactly the
  // duplicate-engine risk the C2 scope lock forbids.
  return createE2E01Adapters({ evidenceCustody });
}

function buildProblem(mode: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY', opts: RunGovE2E01DiscoveryOptions, hash: (v: unknown) => string): ProblemRecord {
  const input: NLInput = opts.problemInput ?? {
    text: opts.nl ?? DEFAULT_NL,
    objectives: [
      { metric: 'efficacy_delta_pp_vs_semaglutide', direction: 'maximize' },
      { metric: 'safety_veto_status', direction: 'minimize' },
    ],
    constraints: ['legal', 'feasible', 'preregistered_generation_method'],
    harmAxes: ['severe_adverse_events', 'safety_veto'],
    evidenceMinimum: `>=1 DIRECT_RANDOMISED, all 6 preregistered falsification attacks attempted (preregistration ${E2E01_PREREGISTRATION.fingerprint})`,
  };
  return parseProblem(`E2E01-${mode}`, input, hash);
}

export async function runGovE2E01Discovery(opts: RunGovE2E01DiscoveryOptions = {}): Promise<GovE2E01DiscoveryResult> {
  const mode = opts.mode ?? 'PRODUCTION';
  const hash = (v: unknown): string => fnv1a(canonicalJson(v));
  const problem = buildProblem(mode, opts, hash);

  let evidenceCustody: EvidenceCustodyResult | null = null;
  if (mode === 'PRODUCTION') {
    const store = opts.evidenceStore ?? sharedEvidenceConnectorStore;
    const port = opts.evidenceConnectorPort ?? defaultE2E01EvidencePort;
    evidenceCustody = await verifyEvidenceCustody(store, E2E01_EVIDENCE_SOURCE, port);
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
    return Object.freeze({ kind: 'RUN', evidenceCustody, ...run });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = err instanceof E2E01FailClosedError ? err.code : 'UNKNOWN_FAIL_CLOSED';
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
 * Real re-run through the SAME entry point — proves the E2E-01 pipeline,
 * including a genuine EXECUTION_BLOCKED path, is reproducible. Fails
 * closed (`ok: false`) on any mismatch rather than asserting success.
 */
export async function replayGovE2E01Discovery(opts: RunGovE2E01DiscoveryOptions = {}): Promise<{ readonly ok: boolean; readonly first: GovE2E01DiscoveryResult; readonly second: GovE2E01DiscoveryResult }> {
  const first = await runGovE2E01Discovery(opts);
  const second = await runGovE2E01Discovery(opts);
  let ok = false;
  if (first.kind === 'EXECUTION_BLOCKED' && second.kind === 'EXECUTION_BLOCKED') {
    ok = first.fingerprint === second.fingerprint;
  } else if (first.kind === 'RUN' && second.kind === 'RUN') {
    ok = first.auditFingerprint === second.auditFingerprint && first.verdict === second.verdict;
  }
  return { ok, first, second };
}
