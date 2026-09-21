import { fnv1a, canonicalJson } from '../events/hash';
import type { NoveltyLevel } from './noveltyGate';

/**
 * PHASE F — GENUINE DISCOVERY LAYER, CONTRACTS.
 *
 * Extends `noveltyGate.ts`'s vocabulary (E2, Phase E) with the richer
 * taxonomy a genuine-discovery claim needs: not just "is this label
 * allowed" but "how much of the discovery pipeline actually ran, and what
 * did each stage conclude". `DiscoveryStatus` is a SUPERSET of concepts
 * `ResultLabel`/`NoveltyLevel` already cover (REPRODUCTION, UNKNOWN,
 * NO_ACCESS map directly) plus stages `noveltyGate.ts` has no vocabulary
 * for at all: KNOWN_RESULT/EXTENSION (finer than NOT_NEW), NOVEL_HYPOTHESIS/
 * DISCOVERY_CANDIDATE (states BEFORE a full DISCOVERY verdict is even
 * attempted), CONFLICTING_EVIDENCE, FAILED_DISCOVERY (a replication that
 * failed — distinct from never having tried).
 *
 * THE NAMING INVARIANT THE WHOLE LAYER SERVES: Genesis must prefer
 * NO_DISCOVERY over a false discovery. There is no `DiscoveryStatus` value
 * meaning "definitely, certainly new" — the ceiling is
 * `NO_KNOWN_PRIOR_FOUND`, never `DEFINITELY_NEW`. `DISCOVERY` means
 * "every machine-verifiable gate passed"; it is not, and cannot be, a claim
 * that the scientific community would agree. `externalValidation` on every
 * `DiscoveryRecord` says so explicitly rather than letting a reader assume
 * otherwise.
 *
 * NO GENERIC EvidenceRef EXISTED IN THIS REPO BEFORE THIS FILE (confirmed
 * by search: `sovereignTruthAnswer.ts::EvidenceItem` is domain-specific to
 * the Government Research plane, `discoveryGraph.ts::DiscoveryNode` uses
 * bare `lineage`/`detail` string arrays). `EvidenceRef` here is the first
 * generic one, deliberately minimal.
 */

export const DISCOVERY_CONTRACTS_VERSION = '1.0.0';

/** A pointer to one piece of evidence — an id a caller can resolve back to its source, never the evidence text duplicated wholesale. */
export interface EvidenceRef {
  readonly id: string;
  readonly kind: string;
  readonly summary: string;
  readonly fingerprint: string;
}

export function makeEvidenceRef(id: string, kind: string, summary: string): EvidenceRef {
  return { id, kind, summary, fingerprint: fnv1a(canonicalJson({ id, kind, summary })) };
}

/**
 * The full taxonomy. `REPRODUCTION`/`UNKNOWN`/`NO_ACCESS` intentionally
 * reuse the exact spelling `noveltyGate.ts::ResultLabel` already uses for
 * the same concepts (`HYPOTHESIS_UNKNOWN` there maps to `UNKNOWN` here,
 * `NO_ACCESS_DECLARED` maps to `NO_ACCESS`) — this file does not invent a
 * second vocabulary for what E2 already names, only adds what it does not.
 */
export type DiscoveryStatus =
  | 'REPRODUCTION'
  | 'KNOWN_RESULT'
  | 'EXTENSION'
  | 'NOVEL_HYPOTHESIS'
  | 'DISCOVERY_CANDIDATE'
  | 'DISCOVERY'
  | 'UNKNOWN'
  | 'NO_ACCESS'
  | 'CONFLICTING_EVIDENCE'
  | 'FAILED_DISCOVERY';

export type DiscoveryStrategy = 'RESIDUAL' | 'ANOMALY' | 'SCALING' | 'CROSS_DOMAIN' | 'CONTRADICTION' | 'MECHANISM' | 'TEMPORAL_SPATIAL';

export interface DiscoveryChainLink {
  readonly observationId: string;
  readonly anomalyId: string | null;
  readonly gapStatement: string;
  readonly hypothesisId: string;
  readonly modelId: string;
  readonly predictionId: string;
}

export type NoveltyOverall = 'KNOWN' | 'NO_KNOWN_PRIOR_FOUND' | 'UNVERIFIABLE' | 'NO_ACCESS';

export interface SearchedCorpusEntry {
  readonly name: string;
  readonly version: string;
  readonly timestamp: string;
  readonly queryFingerprint: string;
  readonly coverageEstimate: string;
}

export interface MatchedPriorArt {
  readonly ref: EvidenceRef;
  readonly similarity: number;
  readonly matchedClaim: string;
}

/**
 * L1-L6 layered novelty evidence — the reusable part is `noveltyGate.ts`'s
 * own `assessNovelty` (L1 internal memory via `falsifiedModelRegistry`/
 * `knownFindingsRegistry`, L4 declared anchors via
 * `declaredPublicAnchorMatch`); L2/L3 are the campaign's own
 * `alreadyKnownFingerprints`/pinned-dataset provenance, already inputs to
 * that same function. L5 (external literature search) and L6 (post-
 * discovery recheck) are genuinely new — built in
 * `literatureNoveltyAdapter.ts` — and are the two layers this file's own
 * `overall` field refuses to call `KNOWN`-absent without.
 */
export interface NoveltyEvidence {
  readonly l1InternalMemory: NoveltyLevel | 'NOT_RUN';
  readonly l2PreregisteredCorpus: NoveltyLevel | 'NOT_RUN';
  readonly l3PinnedPublicDatasets: NoveltyLevel | 'NOT_RUN';
  readonly l4DeclaredAnchors: NoveltyLevel | 'NOT_RUN';
  readonly l5ExternalLiteratureSearch: NoveltyOverall | 'NOT_RUN';
  readonly l6PostDiscoveryRecheck: NoveltyOverall | 'NOT_RUN';
  readonly overall: NoveltyOverall;
  readonly searchedCorpus: readonly SearchedCorpusEntry[];
  readonly matchedPriorArt: readonly MatchedPriorArt[];
  readonly unresolvedMatches: readonly string[];
  /** NEVER empty — see `assertNoveltyEvidenceHonest`. What this evidence does NOT establish, stated plainly. */
  readonly limitations: readonly string[];
  readonly confidence: number;
}

export class DiscoveryContractViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscoveryContractViolationError';
  }
}

/**
 * Machine-enforced honesty check on `NoveltyEvidence` — the Phase F
 * analogue of `noveltyGate.ts::assertValidResultLabel`. Refuses:
 *  - `overall === 'KNOWN'` with no matched prior art (a KNOWN verdict must
 *    point at what it matched).
 *  - `overall === 'NO_KNOWN_PRIOR_FOUND'` without L5 AND L6 having actually
 *    run (`NOT_RUN` in either means the search that would justify this
 *    ceiling never happened).
 *  - `limitations` empty for anything other than `KNOWN` (a bounded search
 *    always has a boundary worth stating; only a definite match needs none).
 */
export function assertNoveltyEvidenceHonest(evidence: NoveltyEvidence): void {
  if (evidence.overall === 'KNOWN' && evidence.matchedPriorArt.length === 0) {
    throw new DiscoveryContractViolationError('discoveryContracts: overall=KNOWN but matchedPriorArt is empty — a KNOWN verdict must point at what it matched.');
  }
  if (evidence.overall === 'NO_KNOWN_PRIOR_FOUND' && (evidence.l5ExternalLiteratureSearch === 'NOT_RUN' || evidence.l6PostDiscoveryRecheck === 'NOT_RUN')) {
    throw new DiscoveryContractViolationError('discoveryContracts: overall=NO_KNOWN_PRIOR_FOUND requires L5 and L6 to have actually run — "not in our KB" without a literature search and a recheck is not this verdict.');
  }
  if (evidence.overall !== 'KNOWN' && evidence.limitations.length === 0) {
    throw new DiscoveryContractViolationError(`discoveryContracts: overall=${evidence.overall} but limitations is empty — a bounded novelty search must state its boundary.`);
  }
}

export type DisjointnessProof = 'DIFFERENT_SOURCE' | 'DIFFERENT_TIME_WINDOW' | 'DISJOINT_SKY_REGION' | 'HELD_OUT_SPLIT';

export interface AdversarialAttempt {
  readonly attack: string;
  readonly result: 'WITHSTOOD' | 'BROKE_CLAIM';
  readonly detail: string;
}

/**
 * AC5's guard, kept here (not only in `discoveryReplicationEngine.ts`) so
 * NOTHING can construct a `DiscoveryRecord` around a replication that
 * reused the discovery's own dataset — the identical-fingerprint case is a
 * pure data-identity check, not something that needs the engine's fetch
 * logic to detect.
 */
export function assertReplicationDisjoint(discoveryDatasetFingerprint: string, replicationDatasetFingerprint: string): void {
  if (discoveryDatasetFingerprint === replicationDatasetFingerprint) {
    throw new DiscoveryContractViolationError('discoveryContracts: replication dataset fingerprint is IDENTICAL to the discovery dataset — a replication must run on a genuinely disjoint dataset, never the same one twice.');
  }
}

export interface IndependentReplicationRecord {
  readonly discoveryDatasetFingerprint: string;
  readonly replicationDatasetFingerprint: string;
  readonly disjointnessProof: DisjointnessProof;
  /** Must be true — see `discoveryReplicationEngine.ts::freezeBeforeReplication`, which is the only place this is legitimately set. */
  readonly frozenBeforeReplicationAccess: true;
  readonly adversarialAttempts: readonly AdversarialAttempt[];
  readonly result: 'REPLICATED' | 'PARTIAL' | 'FAILED';
  readonly effectComparison: {
    readonly discoveryEffect: number;
    readonly replicationEffect: number;
    readonly agreementWithinUncertainty: boolean;
  };
  readonly outcomeFingerprint: string;
}

export type SelfFalsificationProbeName =
  | 'LEAKAGE'
  | 'SELECTION_BIAS'
  | 'MULTIPLE_TESTING'
  | 'OVERFITTING'
  | 'HIDDEN_PREREG'
  | 'DATASET_CONTAMINATION'
  | 'TAUTOLOGY'
  | 'CONFOUNDING'
  | 'ALTERNATIVE_MODEL'
  | 'MEASUREMENT_ARTIFACT'
  | 'NUMERICAL_ARTIFACT'
  | 'PREPROCESSING_ARTIFACT'
  | 'TEMPORAL_LEAKAGE';

export const ALL_SELF_FALSIFICATION_PROBES: readonly SelfFalsificationProbeName[] = [
  'LEAKAGE', 'SELECTION_BIAS', 'MULTIPLE_TESTING', 'OVERFITTING', 'HIDDEN_PREREG',
  'DATASET_CONTAMINATION', 'TAUTOLOGY', 'CONFOUNDING', 'ALTERNATIVE_MODEL',
  'MEASUREMENT_ARTIFACT', 'NUMERICAL_ARTIFACT', 'PREPROCESSING_ARTIFACT', 'TEMPORAL_LEAKAGE',
];

export interface SelfFalsificationProbeResult {
  readonly name: SelfFalsificationProbeName;
  readonly method: 'DETERMINISTIC_PROBE' | 'STATISTICAL_TEST' | 'STRUCTURAL_REVIEW';
  readonly result: 'PASS' | 'FAIL' | 'UNRESOLVED';
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly detail: string;
}

export interface SelfFalsificationReport {
  readonly probes: readonly SelfFalsificationProbeResult[];
  readonly allPassed: boolean;
  readonly reportFingerprint: string;
}

/** All 13 probes named, in the mandate's own declared order, none missing. */
export function assertSelfFalsificationComplete(report: SelfFalsificationReport): void {
  const names = new Set(report.probes.map((p) => p.name));
  const missing = ALL_SELF_FALSIFICATION_PROBES.filter((n) => !names.has(n));
  if (missing.length > 0) {
    throw new DiscoveryContractViolationError(`discoveryContracts: SelfFalsificationReport is missing probe(s): ${missing.join(', ')} — all 13 are mandatory, never a subset.`);
  }
}

export type ExternalValidationStatus = 'NOT_SOUGHT' | 'PENDING' | 'CONFIRMED' | 'REFUTED';

export interface DiscoveryRecord {
  readonly recordId: string;
  readonly campaignId: string;
  readonly directionId: string;
  readonly status: DiscoveryStatus;
  readonly strategy: DiscoveryStrategy;
  readonly anomaly: { readonly evidenceRefs: readonly EvidenceRef[]; readonly detectionFingerprint: string } | null;
  readonly chain: readonly DiscoveryChainLink[];
  readonly preregFreeze: { readonly hypothesisFingerprint: string; readonly predictionFingerprint: string; readonly frozenAt: number };
  readonly noveltyEvidence: NoveltyEvidence;
  readonly replication: IndependentReplicationRecord | null;
  readonly selfFalsification: SelfFalsificationReport;
  readonly graphRootId: string;
  /** The sufficiency ceiling: internal DISCOVERY means "every machine-verifiable gate passed", never a claim the scientific community has agreed. */
  readonly externalValidation: ExternalValidationStatus;
  readonly outcomeFingerprint: string;
  readonly replayHandle: string;
}

/**
 * THE MASTER GATE (Section 2's "reguły przejścia"). Computes the status a
 * `DiscoveryRecord` MAY carry from its own already-computed fields — never
 * caller-asserted. Mirrors `noveltyGate.ts::classifyResultLabel` +
 * `assertValidResultLabel`'s split (derive, then a separate throwing
 * assertion) at the richer Phase F granularity.
 */
export function classifyDiscoveryStatus(input: {
  readonly noveltyEvidence: NoveltyEvidence;
  readonly replication: IndependentReplicationRecord | null;
  readonly selfFalsification: SelfFalsificationReport;
  readonly hasConflictingEvidence: boolean;
  readonly accessDeclared: boolean;
}): DiscoveryStatus {
  if (!input.accessDeclared) return 'NO_ACCESS';
  if (input.hasConflictingEvidence) return 'CONFLICTING_EVIDENCE';
  if (input.noveltyEvidence.overall === 'KNOWN') {
    // A match against a DECLARED PUBLIC ANCHOR (L4 — e.g. Kepler's third
    // law, the same anchor TE5 in Phase E uses) is a REPRODUCTION of
    // established public knowledge. A match against Genesis's own internal
    // memory/preregistered corpus (L1/L2) with no public anchor involved is
    // a narrower claim: Genesis already knows this, which is not the same
    // as it being publicly established — reported as KNOWN_RESULT instead.
    return input.noveltyEvidence.l4DeclaredAnchors === 'NOT_NEW' ? 'REPRODUCTION' : 'KNOWN_RESULT';
  }

  if (input.replication !== null && input.replication.result === 'FAILED') return 'FAILED_DISCOVERY';

  if (input.noveltyEvidence.overall === 'UNVERIFIABLE' || input.noveltyEvidence.overall === 'NO_ACCESS') return 'UNKNOWN';

  // overall === 'NO_KNOWN_PRIOR_FOUND' from here.
  if (input.replication === null) return 'DISCOVERY_CANDIDATE';
  if (input.replication.result === 'PARTIAL') return 'DISCOVERY_CANDIDATE';

  // replication REPLICATED.
  assertSelfFalsificationComplete(input.selfFalsification);
  if (!input.selfFalsification.allPassed) return 'DISCOVERY_CANDIDATE';

  return 'DISCOVERY';
}

/**
 * THE FINAL ASSERTION. Every code path that stores or displays a
 * `DiscoveryStatus` of `DISCOVERY` MUST call this first. Redundant with
 * `classifyDiscoveryStatus`'s own logic by design — belt-and-suspenders,
 * matching `noveltyGate.ts`'s split between derivation and assertion, so a
 * caller cannot reach DISCOVERY by constructing the status directly.
 */
export function assertValidDiscoveryStatus(input: {
  readonly status: DiscoveryStatus;
  readonly noveltyEvidence: NoveltyEvidence;
  readonly replication: IndependentReplicationRecord | null;
  readonly selfFalsification: SelfFalsificationReport;
}): void {
  if (input.status !== 'DISCOVERY') return;
  assertNoveltyEvidenceHonest(input.noveltyEvidence);
  if (input.noveltyEvidence.overall !== 'NO_KNOWN_PRIOR_FOUND') {
    throw new DiscoveryContractViolationError(`discoveryContracts: refusing status DISCOVERY — noveltyEvidence.overall is ${input.noveltyEvidence.overall}, not NO_KNOWN_PRIOR_FOUND.`);
  }
  if (input.replication === null || input.replication.result !== 'REPLICATED') {
    throw new DiscoveryContractViolationError(`discoveryContracts: refusing status DISCOVERY — replication is ${input.replication === null ? 'absent' : input.replication.result}, not REPLICATED on a disjoint dataset.`);
  }
  if (!input.replication.frozenBeforeReplicationAccess) {
    throw new DiscoveryContractViolationError('discoveryContracts: refusing status DISCOVERY — replication was not frozen before replication-dataset access.');
  }
  assertSelfFalsificationComplete(input.selfFalsification);
  if (!input.selfFalsification.allPassed) {
    throw new DiscoveryContractViolationError('discoveryContracts: refusing status DISCOVERY — not all 13 self-falsification probes passed.');
  }
}
