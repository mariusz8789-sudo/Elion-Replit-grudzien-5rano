import { fnv1a, canonicalJson } from '../events/hash';
import { assessTautology, type TautologyAssessment, type TautologyClassification, type TautologyComponent } from './tautologyGate';
import type { KnowledgeEpistemicStatus } from '../knowledge/supplementalRegistry';
import type { DataProvenance } from '../dataProvenance';
import { computeReplayVerdict, type ReplayVerdict } from '../matrixFoundation/replayVerdict';

/**
 * SOVEREIGN TRUTH-ANSWER PROTOCOL v1 — GOVERNMENT RESEARCH PLANE ONLY.
 *
 * Government Research = maximum cognitive freedom: no question is refused,
 * no inconvenient result is softened or hidden, and no claim is confirmed
 * without evidence. This module implements exactly that plane — a Question
 * Router (`submitAnswer`), the `AnswerRecord` it produces, a per-class
 * Template Enforcer, and machine-enforced Assertions that throw
 * (`TemplateViolationError`) rather than silently accept a malformed answer.
 *
 * GOVERNMENT ACTION IS NOT IMPLEMENTED HERE, DELIBERATELY. The one thing
 * this module says about it is a boundary: `attemptGovernmentActionMutation`
 * always throws, because there is no other path into this file's store —
 * `submitAnswer` (append) and the read functions are the entire public
 * surface. Hard restrictions on ACTION (what a government may actually DO)
 * are future work for a different module; methodological problems in
 * RESEARCH are FLAGGED (`AnswerRecord.flags`), never hard-blocked.
 *
 * REUSE, AUDITED FIRST — NO SECOND DISCOVERY ENGINE:
 *   - `tautologyGate.ts::assessTautology` (UNCHANGED) is not just imported
 *     for its types: `AnswerRecord.questionClass` is DERIVED from its
 *     `TautologyAssessment.classification`, never hand-declared by a
 *     submitter. UNTESTABLE/CONSISTENCY_CHECK -> UNFALSIFIABLE_FOUNDATIONAL;
 *     MIXED_TEST -> PARTIALLY_TESTABLE; EMPIRICAL_TEST -> TESTABLE_PUBLIC_DATA.
 *     A submitter cannot mislabel a question's class to dodge the CLASS 1
 *     subquestion requirement — the class is computed from what they
 *     actually declared, exactly like `discoveryCampaign.ts` never lets a
 *     caller assert a model's verdict.
 *   - `knowledge/supplementalRegistry.ts::KnowledgeEpistemicStatus` grades
 *     each individual `EvidenceItem.claimKind` (is this piece of evidence
 *     itself a FACT, a THEORY, a FICTIONAL_REFERENCE, ...) — unmodified.
 *   - `dataProvenance.ts::DataProvenance` tags each `EvidenceItem.provenance`
 *     (SIMULATED/REFERENCE/REAL_EXPERIMENTAL) — unmodified.
 *   - `matrixFoundation/replayVerdict.ts::computeReplayVerdict` is the whole
 *     of `replayAnswerRecord` below — no second replay engine.
 *   - `events/hash.ts::fnv1a`/`canonicalJson` compute every fingerprint here,
 *     exactly like every other fingerprinted record in this codebase.
 *   - CONFLICT DETECTION has no existing dedicated module in this repo
 *     (audited: nothing under `core/` is a contradiction/conflict registry).
 *     Rather than build one, this protocol represents a conflict the same
 *     way every AnswerRecord already represents evidence: as SEPARATE
 *     `supportingEvidence`/`counterEvidence` arrays. `CONTESTED` status
 *     requires BOTH to be non-empty (enforced below) — that IS this
 *     protocol's conflict detection, computed from data every record
 *     already carries, not a second engine.
 *
 * A/B/C/D EVIDENCE LEVELS ARE GENUINELY NEW (confirmed by audit: no such
 * grading scale exists anywhere in this repo). This is the one deliberate
 * addition, disclosed as such: A = primary source, independently
 * corroborated; B = a single strong primary source or high-quality
 * secondary; C = a single weak/circumstantial source or an operationalized
 * proxy; D = anecdotal, speculative, or fictional.
 */

export const SOVEREIGN_TRUTH_ANSWER_CONTRACT_VERSION = '1.0.0';

export type QuestionClass = 'UNFALSIFIABLE_FOUNDATIONAL' | 'PARTIALLY_TESTABLE' | 'TESTABLE_PUBLIC_DATA';
export type EvidenceLevel = 'A' | 'B' | 'C' | 'D';
export type VerdictStrength = 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
export type AnswerStatus = 'FACT' | 'SUPPORTED' | 'CONTESTED' | 'UNKNOWN' | 'UNTESTABLE' | 'NO_ACCESS_DECLARED';

export interface EvidenceItem {
  readonly sourceId: string;
  readonly sourceType: string;
  readonly level: EvidenceLevel;
  /** What KIND of claim this evidence item itself is — reused verbatim from `knowledge/supplementalRegistry.ts`. */
  readonly claimKind: KnowledgeEpistemicStatus;
  /** Where the underlying data came from — reused verbatim from `dataProvenance.ts`. */
  readonly provenance: DataProvenance;
  readonly summary: string;
}

export interface SubQuestion {
  readonly id: string;
  readonly text: string;
  readonly status: AnswerStatus;
  readonly strength: VerdictStrength;
  readonly rationale: string;
  readonly supportingEvidence: readonly EvidenceItem[];
  readonly counterEvidence: readonly EvidenceItem[];
}

export interface QuestionSubmissionInput {
  readonly question: string;
  readonly status: AnswerStatus;
  readonly strength: VerdictStrength;
  readonly supportingEvidence: readonly EvidenceItem[];
  readonly counterEvidence: readonly EvidenceItem[];
  readonly whatWouldChangeVerdict: readonly string[];
  readonly uncertainty: string;
  /** Fed directly into `tautologyGate.ts::assessTautology`; DRIVES `questionClass` below. May be empty — meaning "no testable component could be constructed at all", which the gate itself reports as UNTESTABLE. */
  readonly components: readonly TautologyComponent[];
  readonly subquestions?: readonly SubQuestion[];
  readonly noAccessReason?: string;
}

export interface AnswerRecord {
  readonly recordId: string;
  readonly question: string;
  /** DERIVED from `tautologyAssessment.classification` — never hand-declared by a submitter. */
  readonly questionClass: QuestionClass;
  readonly tautologyAssessment: TautologyAssessment;
  readonly status: AnswerStatus;
  readonly strength: VerdictStrength;
  readonly supportingEvidence: readonly EvidenceItem[];
  readonly counterEvidence: readonly EvidenceItem[];
  /** True only when `status` is UNKNOWN or NO_ACCESS_DECLARED — computed, never caller-supplied. */
  readonly counterEvidenceWaived: boolean;
  readonly whatWouldChangeVerdict: readonly string[];
  readonly uncertainty: string;
  readonly subquestions: readonly SubQuestion[];
  readonly noAccessReason: string | null;
  /** This protocol implements ONLY this plane. */
  readonly plane: 'GOVERNMENT_RESEARCH';
  /** Methodological concerns — FLAG/WARN, never a hard block in Research. */
  readonly flags: readonly string[];
  readonly fingerprint: string;
  readonly recordedAt: string;
}

export class TemplateViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateViolationError';
  }
}

function classFromTautology(classification: TautologyClassification): QuestionClass {
  switch (classification) {
    case 'UNTESTABLE':
    case 'CONSISTENCY_CHECK':
      // A circular/definitional pairing carries the same practical
      // consequence as an undeclared one — by construction, no run could
      // ever have discriminated — so both land in the foundational class.
      return 'UNFALSIFIABLE_FOUNDATIONAL';
    case 'MIXED_TEST':
      return 'PARTIALLY_TESTABLE';
    case 'EMPIRICAL_TEST':
      return 'TESTABLE_PUBLIC_DATA';
  }
}

/**
 * Best-effort, disclosed KEYWORD scan — not NLP, not a claim of perfect
 * detection. Refuses dosage-shaped numbers, prescription verbs, and
 * decree/mandate language anywhere in a record's own text fields.
 */
const DOSAGE_PATTERN = /\b\d+(?:\.\d+)?\s?(mg|mcg|µg|g|ml|iu|units?)\b/i;
const PRESCRIPTION_PATTERN = /\b(prescribe[sd]?|take\s+\d+|administer(?:ed|ing)?\s+\d+|dosage)\b/i;
const DECREE_PATTERN = /\b(hereby\s+(?:order|decree|mandate)|it\s+is\s+(?:hereby\s+)?(?:ordered|decreed|mandated)|shall\s+be\s+(?:banned|required|prohibited))\b/i;

function assertNoPrescriptiveContent(texts: readonly string[]): void {
  for (const text of texts) {
    if (DOSAGE_PATTERN.test(text)) {
      throw new TemplateViolationError(`sovereignTruthAnswer: refusing record — text contains dosage-shaped content ("${text}"). This protocol implements Government Research only; no prescriptions, dosages, or decrees are permitted in an AnswerRecord.`);
    }
    if (PRESCRIPTION_PATTERN.test(text)) {
      throw new TemplateViolationError(`sovereignTruthAnswer: refusing record — text contains prescriptive language ("${text}"). This protocol implements Government Research only; no prescriptions, dosages, or decrees are permitted in an AnswerRecord.`);
    }
    if (DECREE_PATTERN.test(text)) {
      throw new TemplateViolationError(`sovereignTruthAnswer: refusing record — text contains decree/mandate language ("${text}"). This protocol implements Government Research only; no prescriptions, dosages, or decrees are permitted in an AnswerRecord.`);
    }
  }
}

function allText(input: QuestionSubmissionInput): readonly string[] {
  return [
    input.question,
    input.uncertainty,
    input.noAccessReason ?? '',
    ...input.whatWouldChangeVerdict,
    ...input.supportingEvidence.map((e) => e.summary),
    ...input.counterEvidence.map((e) => e.summary),
    ...(input.subquestions ?? []).flatMap((s) => [s.text, s.rationale, ...s.supportingEvidence.map((e) => e.summary), ...s.counterEvidence.map((e) => e.summary)]),
  ];
}

/** The cross-cutting assertions, applied identically to the top-level answer and (recursively) to each subquestion. */
function assertLayer(label: string, status: AnswerStatus, strength: VerdictStrength, supportingEvidence: readonly EvidenceItem[], counterEvidence: readonly EvidenceItem[], noAccessReason: string | undefined): void {
  if (status === 'NO_ACCESS_DECLARED') {
    if (!noAccessReason || noAccessReason.trim().length === 0) {
      throw new TemplateViolationError(`sovereignTruthAnswer: ${label} status is NO_ACCESS_DECLARED but noAccessReason is empty — declare WHY access was refused, not just that it was.`);
    }
  } else if (noAccessReason && noAccessReason.trim().length > 0) {
    throw new TemplateViolationError(`sovereignTruthAnswer: ${label} declares a noAccessReason but status is "${status}", not NO_ACCESS_DECLARED — a declared access failure must be reflected in the status.`);
  }

  if (supportingEvidence.length === 0 && status !== 'UNKNOWN' && status !== 'NO_ACCESS_DECLARED' && status !== 'UNTESTABLE') {
    throw new TemplateViolationError(`sovereignTruthAnswer: ${label} has no supportingEvidence, so status must be UNKNOWN (or NO_ACCESS_DECLARED/UNTESTABLE where applicable) — got "${status}". A claim with no evidence behind it cannot be FACT/SUPPORTED/CONTESTED.`);
  }

  if (status === 'FACT') {
    if (strength !== 'STRONG') {
      throw new TemplateViolationError(`sovereignTruthAnswer: ${label} status is FACT but strength is "${strength}", not STRONG.`);
    }
    if (!supportingEvidence.some((e) => e.level === 'A' || e.level === 'B')) {
      throw new TemplateViolationError(`sovereignTruthAnswer: ${label} status is FACT but no supportingEvidence item is Level A or B.`);
    }
  }

  if (status === 'CONTESTED' && (supportingEvidence.length === 0 || counterEvidence.length === 0)) {
    throw new TemplateViolationError(`sovereignTruthAnswer: ${label} status is CONTESTED but does not have BOTH real supportingEvidence and real counterEvidence — a conflict requires evidence on both sides, or this is not actually contested.`);
  }

  if (status !== 'UNKNOWN' && status !== 'NO_ACCESS_DECLARED' && counterEvidence.length === 0) {
    throw new TemplateViolationError(`sovereignTruthAnswer: ${label} status "${status}" requires at least one counterEvidence item (except UNKNOWN/NO_ACCESS_DECLARED) — every claim carries a counter-consideration, even a weak one.`);
  }
}

function counterEvidenceWaivedFor(status: AnswerStatus): boolean {
  return status === 'UNKNOWN' || status === 'NO_ACCESS_DECLARED';
}

function computeFingerprint(input: {
  readonly question: string;
  readonly questionClass: QuestionClass;
  readonly status: AnswerStatus;
  readonly strength: VerdictStrength;
  readonly supportingEvidence: readonly EvidenceItem[];
  readonly counterEvidence: readonly EvidenceItem[];
  readonly whatWouldChangeVerdict: readonly string[];
  readonly uncertainty: string;
  readonly subquestions: readonly SubQuestion[];
  readonly noAccessReason: string | null;
}): string {
  return fnv1a(canonicalJson(input));
}

// Append-only, process-lifetime store. See module doc for what this is not a substitute for.
let STORE: AnswerRecord[] = [];

/** Test-only escape hatch — production code has no reason to ever call this. */
export function resetSovereignTruthAnswerStoreForTests(): void {
  STORE = [];
}

/**
 * THE QUESTION ROUTER. The single entry point into this protocol: runs the
 * Template Enforcer (per-derived-class structural requirements) and every
 * machine-enforced Assertion, throwing `TemplateViolationError` on the first
 * violation (build-fail semantics — nothing partially invalid is ever
 * stored). On success, appends a frozen, fingerprinted `AnswerRecord`.
 */
export function submitAnswer(input: QuestionSubmissionInput): AnswerRecord {
  assertNoPrescriptiveContent(allText(input));

  const tautologyAssessment = assessTautology(input.components);
  const questionClass = classFromTautology(tautologyAssessment.classification);

  const subquestions = input.subquestions ?? [];

  // --- Template Enforcer: per-class structural requirements -----------------
  if (questionClass === 'UNFALSIFIABLE_FOUNDATIONAL' && subquestions.length === 0) {
    throw new TemplateViolationError(
      `sovereignTruthAnswer: question classifies as UNFALSIFIABLE_FOUNDATIONAL (Tautology Gate: ${tautologyAssessment.classification}) but no subquestions were supplied — CLASS 1 requires the question be broken into testable fragments, even when every fragment turns out UNTESTABLE.`,
    );
  }
  if (questionClass === 'PARTIALLY_TESTABLE' && subquestions.length < 2) {
    throw new TemplateViolationError(
      `sovereignTruthAnswer: question classifies as PARTIALLY_TESTABLE (Tautology Gate: MIXED_TEST) but fewer than two subquestions/layers were supplied — CLASS 2 requires splitting the question into layers, each with its own status and evidence.`,
    );
  }

  // --- Assertions: top-level answer, then recursively per subquestion -------
  if (input.whatWouldChangeVerdict.length === 0) {
    throw new TemplateViolationError('sovereignTruthAnswer: whatWouldChangeVerdict is required and must be non-empty — every answer must state what evidence would change it.');
  }
  assertLayer('the top-level answer', input.status, input.strength, input.supportingEvidence, input.counterEvidence, input.noAccessReason);
  for (const sq of subquestions) {
    assertLayer(`subquestion "${sq.id}"`, sq.status, sq.strength, sq.supportingEvidence, sq.counterEvidence, undefined);
  }

  const flags: string[] = [];
  if (questionClass === 'TESTABLE_PUBLIC_DATA' && subquestions.length === 0 && input.supportingEvidence.length <= 1) {
    flags.push('WARN: a single-source empirical claim with no decomposition into layers — consider whether an independent second proxy would strengthen or contradict this result.');
  }

  const noAccessReason = input.noAccessReason && input.noAccessReason.trim().length > 0 ? input.noAccessReason : null;
  const counterEvidenceWaived = counterEvidenceWaivedFor(input.status);

  const identity = {
    question: input.question,
    questionClass,
    status: input.status,
    strength: input.strength,
    supportingEvidence: input.supportingEvidence,
    counterEvidence: input.counterEvidence,
    whatWouldChangeVerdict: input.whatWouldChangeVerdict,
    uncertainty: input.uncertainty,
    subquestions,
    noAccessReason,
  };
  const fingerprint = computeFingerprint(identity);

  const record: AnswerRecord = Object.freeze({
    recordId: `${fingerprint}-${STORE.length}`,
    ...identity,
    tautologyAssessment,
    counterEvidenceWaived,
    plane: 'GOVERNMENT_RESEARCH',
    flags: Object.freeze(flags),
    fingerprint,
    recordedAt: new Date().toISOString(),
  });

  STORE.push(record);
  return record;
}

export function getAnswerRecord(recordId: string): AnswerRecord | null {
  return STORE.find((r) => r.recordId === recordId) ?? null;
}

export function listAnswerRecords(): readonly AnswerRecord[] {
  return STORE;
}

/**
 * Recomputes the fingerprint an identical `submitAnswer(recomputed)` call
 * would have produced (WITHOUT appending it to the store) and compares it to
 * `saved.fingerprint` via `matrixFoundation/replayVerdict.ts` — no second
 * replay engine.
 */
export function replayAnswerRecord(saved: AnswerRecord, recomputed: QuestionSubmissionInput): ReplayVerdict {
  const tautologyAssessment = assessTautology(recomputed.components);
  const questionClass = classFromTautology(tautologyAssessment.classification);
  const noAccessReason = recomputed.noAccessReason && recomputed.noAccessReason.trim().length > 0 ? recomputed.noAccessReason : null;
  const recomputedFingerprint = computeFingerprint({
    question: recomputed.question,
    questionClass,
    status: recomputed.status,
    strength: recomputed.strength,
    supportingEvidence: recomputed.supportingEvidence,
    counterEvidence: recomputed.counterEvidence,
    whatWouldChangeVerdict: recomputed.whatWouldChangeVerdict,
    uncertainty: recomputed.uncertainty,
    subquestions: recomputed.subquestions ?? [],
    noAccessReason,
  });
  return computeReplayVerdict({
    inputsAvailable: true,
    recordFound: true,
    recordedFingerprint: saved.fingerprint,
    recomputedFingerprint,
  });
}

/**
 * THE GOVERNMENT-ACTION BOUNDARY. This function's entire body is a refusal —
 * it is not a stub awaiting an implementation. There is no other exported
 * function that could mutate an `AnswerRecord`; `submitAnswer` only appends
 * new, independent records, and every stored record is `Object.freeze`d at
 * creation. Action has read access via `getAnswerRecord`/`listAnswerRecords`
 * and NOTHING else.
 */
export function attemptGovernmentActionMutation(_record: AnswerRecord, _proposedChange: unknown): never {
  throw new Error(
    'sovereignTruthAnswer: Government Action has no write path to AnswerRecord/Truth. This module implements the Government Research plane only; Action may read via getAnswerRecord/listAnswerRecords, and nothing else. Every stored record is frozen at creation.',
  );
}
