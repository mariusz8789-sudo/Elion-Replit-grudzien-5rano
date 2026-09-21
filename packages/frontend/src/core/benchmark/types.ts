/**
 * EXTERNAL BENCHMARK HARNESS (A10) — generic types.
 *
 * A measurement tool, not a second epistemic layer. Everything here describes
 * how to load a frozen external benchmark, run Genesis's EXISTING engines
 * against it, and report what happened — never a new confidence/replay/
 * fingerprint scheme of its own. Fingerprints below reuse `events/hash.ts`'s
 * `fnv1a`/`canonicalJson`, exactly like every other fingerprinted record in
 * this codebase (`discoveryCampaign.ts`, `observationGap.ts`,
 * `falsifiedModelRegistry.ts`). A case's "reasoning" is produced by
 * `runDiscoveryCampaign`/`fitModelSpec` (`core/agent/`), unmodified; this
 * module only adapts inputs in and reads results out.
 *
 * GOVERNANCE (per this codebase's Government Research principle, reused
 * verbatim — see `core/agent/integrityGates.ts`): a benchmark run FLAGS
 * methodological issues (a case this harness cannot honestly attempt, a
 * metric this sandbox cannot compute without a private API) rather than
 * silently dropping them or coercing them into a false PASS/FAIL. See
 * `CaseOutcome` below: `UNKNOWN` and `NO_ACCESS` are first-class outcomes,
 * never collapsed into `INCORRECT`.
 */

export const BENCHMARK_HARNESS_CONTRACT_VERSION = '1.0.0';

/** Where a frozen dataset file came from, so a case's provenance survives being copied into this repo as a fixture. */
export interface BenchmarkSource {
  readonly repo: string;
  readonly commit: string;
  readonly originalPath: string;
  readonly license: string;
}

/** One file this benchmark case's input depends on, with the checksum it was frozen at. */
export interface BenchmarkDatasetFile {
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
}

/**
 * The rule a case's outcome is judged against — written down BEFORE the run,
 * never adjusted after seeing Genesis's answer (§11's "may not change
 * criteria after running"). Deliberately a closed union: every rule kind this
 * harness supports must be able to say what would make it PASS, FAIL, or
 * genuinely UNKNOWN, in code, not in a human's head.
 */
export type ExpectedEvaluationRule =
  | {
      readonly kind: 'COEFFICIENT_SIGN';
      /** Variable(s) this rule's claim concerns, each with the gold-hypothesis sign and (when the source states one) coefficient. */
      readonly claims: readonly {
        readonly variable: string;
        readonly sign: 'POSITIVE' | 'NEGATIVE';
        readonly claimedCoefficient: number | null;
      }[];
    }
  | {
      readonly kind: 'NOT_SIGNIFICANT';
      readonly variable: string;
    };

export interface BenchmarkCase {
  readonly benchmarkId: string;
  readonly benchmarkVersion: string;
  readonly caseId: string;
  readonly task: string;
  readonly goldHypothesisText: string;
  readonly expected: ExpectedEvaluationRule;
  readonly source: BenchmarkSource;
  readonly datasetFiles: readonly BenchmarkDatasetFile[];
  /** Identity of the CASE DEFINITION itself (task+expected+source+file checksums) — independent of any run. */
  readonly fingerprint: string;
}

/** A frozen, ordered collection of cases plus the dataset-level facts that must not drift between runs. */
export interface BenchmarkDataset {
  readonly benchmarkId: string;
  readonly benchmarkVersion: string;
  readonly cases: readonly BenchmarkCase[];
  /** fnv1a(canonicalJson(cases.map(c => c.fingerprint))) in FROZEN order — the "did the dataset change" fingerprint. */
  readonly datasetFingerprint: string;
}

/** A first-class result other than PASS/FAIL — never silently coerced to a false claim (§5's "brak odpowiedzi ≠ false"). */
export type CaseOutcome = 'CORRECT' | 'INCORRECT' | 'PARTIAL' | 'UNKNOWN' | 'NO_ACCESS';

export interface BenchmarkCaseResult {
  readonly caseId: string;
  readonly outcome: CaseOutcome;
  /** Did Genesis produce a usable answer at all — `null` only when the case itself could not be attempted (NO_ACCESS). */
  readonly taskSuccess: boolean | null;
  /** Does the produced answer match the expected evaluation rule — `null` when outcome is UNKNOWN/NO_ACCESS, never coerced to false. */
  readonly scientificCorrectness: boolean | null;
  /** Did the two independent Genesis facets (declared-covariate fit vs. autonomous campaign search) agree — a real check that the "reasoning", not just the final number, held together. */
  readonly reasoningValidity: boolean | null;
  readonly evidenceUse: string;
  /** Null when falsification is not meaningful for this case kind (declared-facts-only regression comparison). */
  readonly falsificationBehavior: string | null;
  readonly rationale: string;
  readonly runFingerprint: string;
}

export interface BenchmarkScoreSummary {
  readonly totalCases: number;
  readonly byOutcome: Readonly<Record<CaseOutcome, number>>;
  readonly taskSuccessRate: number | null;
  readonly scientificCorrectnessRate: number | null;
  readonly reasoningValidityRate: number | null;
  readonly failureCount: number;
  readonly unknownOrNoAccessCount: number;
}

export interface BenchmarkResult {
  readonly benchmarkId: string;
  readonly benchmarkVersion: string;
  readonly datasetFingerprint: string;
  readonly genesisContractVersions: Readonly<Record<string, string>>;
  readonly configFingerprint: string;
  readonly caseResults: readonly BenchmarkCaseResult[];
  readonly summary: BenchmarkScoreSummary;
  /** fnv1a over dataset+config+genesisVersions+ordered per-case runFingerprints — the one number a replay must reproduce exactly. */
  readonly runFingerprint: string;
}

export type ReplayVerdict = 'MATCH' | 'MISMATCH';
