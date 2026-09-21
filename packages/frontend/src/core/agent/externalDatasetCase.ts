import { canonicalJson, fnv1a } from '../events/hash';
import { createHypothesis, updateConfidence, type Hypothesis } from '../experimentFabric/beliefRevision';
import type { FalsificationCriterion, HypothesisAssessment } from '../experimentFabric/scientificDiscovery';
import { evidenceCeiling, type TautologyAssessment } from './tautologyGate';

/**
 * EXTERNAL DATASET CASE — the missing seam identified by the QE4 (Brydges et
 * al. 2019 / Zenodo 2527010) architecture audit: ONE external dataset that
 * yields SEVERAL independent, co-equal hypothesis verdicts, none of which is
 * a "primary" the others merely support.
 *
 * ## Why this file exists, and why it is this small
 *
 * Three existing shapes were read in full before writing a line here:
 *
 *   - `biotechData/externalAnchor.ts` — real prediction vs. real external
 *     observation, but exactly ONE metric per anchor. `runExternalAnchor`
 *     returns one `verification`, one `tautologyAssessment`, one `belief`.
 *     QE4 needs four of each, independently — forcing them through this
 *     contract would mean picking one as "the" anchor and demoting the rest.
 *   - `discovery/discoveryCase.ts` + `discoveryConclusion.ts` — DOES already
 *     have a primary+supporting, per-criterion Tautology Gate pattern (and
 *     is the canonical home for that pattern per `docs/DECISIONS.md` D-021).
 *     But `DiscoveryCase` is hard-typed to the two-arm epidemic Scenario
 *     Engine (`ScenarioId`, `ScenarioRun`, `EpidemicCityParams`) — comparison
 *     is baseline-vs-variant metric deltas, which an external dataset with no
 *     "variant arm" cannot produce. D-021 deliberately left this substrate
 *     bound to that engine rather than generalizing it prematurely.
 *   - `experimentFabric/evidencePack.ts`'s `ScientificEvidencePack` — a
 *     projection of ONE Fabric `ScientificEvidenceChain`, carrying exactly
 *     one `hypothesisAssessment` for the whole pack. Not reshapeable to N
 *     verdicts without breaking every existing consumer
 *     (`evidencePackRoCrate.ts`, `ExperimentPilotScreen.tsx`).
 *
 * None of the three can host "N independent verdicts over one external
 * dataset" without inventing new semantics on top of a substrate built for a
 * different shape. What IS genuinely missing, and genuinely small, is a
 * container that:
 *
 *   1. holds N independently-computed verdicts without collapsing them into
 *      one scalar (`verdictCounts`/`tautologyCounts` are tallies, never a
 *      single overall verdict),
 *   2. runs each one through the EXISTING, unmodified Tautology Gate
 *      (`tautologyGate.ts::assessTautology` — already domain-agnostic, and
 *      the caller supplies an already-computed `TautologyAssessment` per
 *      hypothesis; this module never calls `assessTautology` itself, so it
 *      cannot second-guess a domain's own honest derivation declaration),
 *   3. runs each one through the EXISTING, unmodified belief-revision
 *      primitives (`beliefRevision.ts::createHypothesis`/`updateConfidence`),
 *      capped by the EXISTING `evidenceCeiling` — so a CONSISTENCY_CHECK/
 *      UNTESTABLE component structurally cannot move confidence, exactly as
 *      `externalAnchor.ts` already enforces for its single component,
 *   4. gives the whole case one deterministic fingerprint
 *      (`fnv1a`/`canonicalJson`, the one hashing primitive this repo uses
 *      everywhere else), for replay.
 *
 * This module knows NOTHING about QE4, Brydges, ions, or entropy — it is a
 * pure, domain-agnostic reshaping+bookkeeping layer. The QE4-specific glue
 * (verdict vocabulary, hypothesis statements, provenance) lives entirely in
 * `biotechData/qe4EvidenceCase.ts`, which is the only file that imports both
 * this module and `qe4BrydgesAnalysis.ts`.
 *
 * ## What this module does NOT do
 *
 * It does not classify anything (no second Tautology Gate), does not revise
 * a "case-level" belief (each hypothesis gets its OWN, independent belief —
 * there is no meta-hypothesis "the dataset is right"), and does not persist
 * anything. Persistence follows `externalAnchor.ts`'s own precedent: a
 * pinned, deterministic dataset anchor with no user-triggered run is
 * rendered LIVE from a static registry (see `ExternalAnchorsSection` in
 * `EvidenceShowcaseScreen.tsx`), never written to Scientific Memory —
 * `scienceMemory.ts`'s ten `SavedExperiment` shapes exist for experiments
 * something actually RAN and a user might re-run or compare, which a pinned
 * external anchor is not. Adding an eleventh shape for this would be
 * building persistence machinery the closest existing analog does not have.
 */

export const EXTERNAL_DATASET_CASE_CONTRACT_VERSION = '1.0.0';

export interface ExternalDatasetProvenance {
  readonly datasetId: string;
  readonly sourceUrl: string;
  readonly sourceVersion: string;
  readonly retrievedAt: string;
  readonly license: string;
  readonly archiveSha256?: string;
}

export interface ExternalDatasetHypothesisInput {
  readonly id: string;
  readonly statement: string;
  /** The domain's own verdict, in the domain's own vocabulary — stored and rendered verbatim, never renamed. */
  readonly verdict: string;
  readonly reasons: readonly string[];
  /** Already computed by the domain's own tautology declaration; `assessTautology` is never called again here. */
  readonly tautology: TautologyAssessment;
  /**
   * Maps THIS hypothesis's own verdict string onto the shared
   * `HypothesisAssessment` vocabulary, for belief-revision bookkeeping ONLY.
   * Never changes `verdict` itself or what is stored/rendered for it — a
   * pure translation the domain states explicitly, exactly like
   * `externalAnchor.ts` already reuses `verifyPredictionAgainstRealExperiment`'s
   * own `HypothesisAssessment` output rather than inventing a second one.
   */
  readonly toHypothesisAssessment: (verdict: string) => HypothesisAssessment;
  /** A descriptive `FalsificationCriterion` for belief-revision bookkeeping only — the domain's own statistical procedure already decided `verdict`, not this criterion. */
  readonly criterion: FalsificationCriterion;
  /** 0..1, defaults to 0.5 — a fresh, neutral prior per hypothesis, matching `externalAnchor.ts`'s own convention. */
  readonly priorConfidence?: number;
  /** 0..1, defaults to 1 (full weight) — how decisively the domain's own procedure already settled this verdict. Still capped by `evidenceCeiling`. */
  readonly evidenceMagnitude?: number;
}

export interface ExternalDatasetHypothesisVerdict {
  readonly id: string;
  readonly statement: string;
  readonly verdict: string;
  readonly reasons: readonly string[];
  readonly tautology: TautologyAssessment;
  readonly belief: { readonly before: number; readonly after: number; readonly status: Hypothesis['status'] };
  readonly nextQuestion: string;
}

export interface ExternalDatasetCase {
  readonly contractVersion: string;
  readonly caseId: string;
  readonly provenance: ExternalDatasetProvenance;
  /** Every hypothesis, independently — never collapsed into one verdict. */
  readonly hypotheses: readonly ExternalDatasetHypothesisVerdict[];
  /** Tally by verdict string. A "3 SUPPORTED_WITHIN_MODEL, 1 FALSIFIED" case reports exactly that, never an averaged or majority verdict. */
  readonly verdictCounts: Readonly<Record<string, number>>;
  /** Tally by Tautology Gate classification, across all hypotheses. */
  readonly tautologyCounts: Readonly<Record<string, number>>;
  /** The domain's own deterministic result fingerprint (e.g. QE4's `resultFingerprint`), passed through unchanged. */
  readonly domainResultFingerprint: string;
  /** This module's own identity over the whole case — provenance + every hypothesis's id/verdict/tautology + the domain fingerprint. Used for replay. */
  readonly caseFingerprint: string;
}

function buildNextQuestion(hypothesisId: string, assessment: HypothesisAssessment): string {
  switch (assessment) {
    case 'SUPPORTED_WITHIN_PROTOCOL':
      return `This held for ${hypothesisId} — the natural next test is a case that strains this hypothesis's own stated boundary, not another easy confirmation of the same regime.`;
    case 'FALSIFIED_WITHIN_PROTOCOL':
      return `${hypothesisId} was FALSIFIED within the preregistered protocol — the next question is WHY: re-check the analysis pipeline and thresholds before concluding the underlying model is wrong.`;
    case 'CANDIDATE':
    case 'INCONCLUSIVE':
      return `${hypothesisId} is ${assessment} — resolve that first (missing/ambiguous data or too-wide uncertainty) before drawing any conclusion from it.`;
  }
}

/**
 * Builds one `ExternalDatasetCase` from N already-computed hypothesis
 * results. Pure function: same input always produces the same
 * `caseFingerprint` — the property `compareExternalDatasetCaseReplay` below
 * checks.
 */
export function buildExternalDatasetCase(input: {
  readonly caseId: string;
  readonly provenance: ExternalDatasetProvenance;
  readonly hypotheses: readonly ExternalDatasetHypothesisInput[];
  readonly domainResultFingerprint: string;
}): ExternalDatasetCase {
  const hypotheses: ExternalDatasetHypothesisVerdict[] = input.hypotheses.map((h) => {
    const assessment = h.toHypothesisAssessment(h.verdict);
    const hypothesis = createHypothesis(`${input.caseId}:${h.id}`, h.criterion, h.priorConfidence ?? 0.5);
    const cap = evidenceCeiling(h.tautology.classification);
    const rawMagnitude = h.evidenceMagnitude ?? 1;
    const magnitude = cap === null ? rawMagnitude : Math.min(rawMagnitude, cap);
    const revised = updateConfidence(
      hypothesis,
      assessment,
      magnitude,
      `${h.id}: ${h.verdict} (Tautology Gate: ${h.tautology.classification}).`,
      0,
    );
    return {
      id: h.id,
      statement: h.statement,
      verdict: h.verdict,
      reasons: h.reasons,
      tautology: h.tautology,
      belief: { before: hypothesis.confidence, after: revised.confidence, status: revised.status },
      nextQuestion: buildNextQuestion(h.id, assessment),
    };
  });

  const verdictCounts: Record<string, number> = {};
  const tautologyCounts: Record<string, number> = {};
  for (const h of hypotheses) {
    verdictCounts[h.verdict] = (verdictCounts[h.verdict] ?? 0) + 1;
    tautologyCounts[h.tautology.classification] = (tautologyCounts[h.tautology.classification] ?? 0) + 1;
  }

  const caseFingerprint = fnv1a(
    canonicalJson({
      caseId: input.caseId,
      provenance: input.provenance,
      hypotheses: hypotheses.map((h) => ({ id: h.id, verdict: h.verdict, tautology: h.tautology.classification })),
      domainResultFingerprint: input.domainResultFingerprint,
    }),
  );

  return {
    contractVersion: EXTERNAL_DATASET_CASE_CONTRACT_VERSION,
    caseId: input.caseId,
    provenance: input.provenance,
    hypotheses,
    verdictCounts,
    tautologyCounts,
    domainResultFingerprint: input.domainResultFingerprint,
    caseFingerprint,
  };
}

export type ExternalDatasetCaseReplayStatus = 'MATCH' | 'DRIFT';

/**
 * Replay: rebuild the case from a freshly recomputed domain analysis and
 * compare fingerprints — the same "build twice, compare" pattern
 * `runExternalAnchor` already uses, never a comparison of a fingerprint with
 * itself.
 */
export function compareExternalDatasetCaseReplay(
  first: Pick<ExternalDatasetCase, 'caseFingerprint'>,
  second: Pick<ExternalDatasetCase, 'caseFingerprint'>,
): ExternalDatasetCaseReplayStatus {
  return first.caseFingerprint === second.caseFingerprint ? 'MATCH' : 'DRIFT';
}
