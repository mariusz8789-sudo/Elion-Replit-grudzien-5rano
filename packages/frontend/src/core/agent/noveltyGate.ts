import { fnv1a, canonicalJson } from '../events/hash';
import { modelSpecFingerprint, normalizeModelSpec, renderModelSpec, type ModelSpec } from './modelSpace';
import { consultFalsifiedModelRegistry, type FalsificationScope, type RegistryConsultation } from './falsifiedModelRegistry';

/**
 * E2 — NOVELTY GATE. THE CRUX OF PHASE E.
 *
 * A result may be labeled DISCOVERY only after this gate is consulted and its
 * verdict is checked by `assertValidResultLabel` — never by a caller
 * asserting the label directly. This is Genesis's answer to the single
 * biggest failure mode named in the Phase E mandate: novelty inflation.
 *
 * NO SECOND TRUTH SYSTEM — audited before writing a line of this file:
 *   - `falsifiedModelRegistry.ts` (M2) is REUSED VERBATIM via
 *     `consultFalsifiedModelRegistry` — this gate never re-derives whether a
 *     model was falsified, it only asks M2.
 *   - `scienceMemory.ts` was audited and rejected as the "known findings"
 *     store for this gate: per `falsifiedModelRegistry.ts`'s own module doc,
 *     it is per-browser-user `localStorage`, capped at the 100 most recent
 *     UI-history records, with no cross-campaign consultation semantics —
 *     the wrong shape for a durable, queryable corpus. M2 solved the
 *     identical shape problem for FALSIFIED models with a dedicated
 *     append-only, cross-campaign, in-process registry keyed on canonicalized
 *     model fingerprint. This file's `KnownFindingRecord` registry below is
 *     the mirror of that same pattern for CONFIRMED findings — a genuinely
 *     NEW registry (confirmed by audit: nothing in this repo already plays
 *     this role), but copying M2's proven shape rather than inventing a new
 *     one.
 *   - `discoveryCampaign.ts::CampaignOptions.alreadyKnownFingerprints` (the
 *     existing anti-HARK anchor a caller declares BEFORE a campaign runs) is
 *     REUSED as one of the inputs this gate consults, not re-implemented.
 *
 * EPISTEMIC BOUNDING — "not in our KB" != "scientifically new". A result can
 * only reach `NOVEL_WITHIN_CHECKED_CORPUS` (the level required for DISCOVERY)
 * when the caller names a non-empty `checkedCorpus` — what was actually
 * searched. An empty corpus caps the result at `POSSIBLY_NOVEL`, which
 * `assertValidResultLabel` refuses to let become DISCOVERY. The claim is
 * always bounded to what was checked, never extended to "novel, full stop".
 */

export const NOVELTY_GATE_CONTRACT_VERSION = '1.0.0';

export type NoveltyLevel = 'UNKNOWN' | 'NOT_NEW' | 'POSSIBLY_NOVEL' | 'NOVEL_WITHIN_CHECKED_CORPUS';

/** The only labels a Phase E result may ever carry. Never a free-text string. */
export type ResultLabel = 'DISCOVERY' | 'REPRODUCTION' | 'HYPOTHESIS_UNKNOWN' | 'NO_ACCESS_DECLARED';

export interface KnownFindingRecord {
  readonly recordId: string;
  readonly modelId: string;
  readonly modelFingerprint: string;
  readonly scope: FalsificationScope;
  /** `CAMPAIGN_DISCOVERY`: this exact model previously cleared this same gate as DISCOVERY. `DECLARED_PUBLIC_ANCHOR`: a caller declared (never inferred) that this model matches a known public/literature result. */
  readonly source: 'CAMPAIGN_DISCOVERY' | 'DECLARED_PUBLIC_ANCHOR';
  readonly campaignId: string | null;
  readonly summary: string;
  readonly recordedAt: string;
  readonly fingerprint: string;
}

// Append-only, process-lifetime log — identical discipline to falsifiedModelRegistry.ts (M2).
// `recordedAt` is stored but EXCLUDED from the fingerprint (wall-clock time would make replay non-deterministic — same fix M2 already applied, see falsifiedModelRegistry.ts).
let KNOWN_FINDINGS: KnownFindingRecord[] = [];

/** Test-only escape hatch — production code has no reason to ever call this. */
export function resetNoveltyGateRegistryForTests(): void {
  KNOWN_FINDINGS = [];
}

function canonicalizeModel(spec: ModelSpec): ModelSpec {
  return normalizeModelSpec(spec);
}

function identityOf(spec: ModelSpec): { readonly modelId: string; readonly modelFingerprint: string } {
  const canonical = canonicalizeModel(spec);
  return { modelId: renderModelSpec(canonical), modelFingerprint: modelSpecFingerprint(canonical) };
}

export interface RecordKnownFindingInput {
  readonly spec: ModelSpec;
  readonly scope: FalsificationScope;
  readonly source: KnownFindingRecord['source'];
  readonly campaignId: string | null;
  readonly summary: string;
}

/** Records a model as a confirmed finding — call ONLY after a result has itself already passed `assertValidResultLabel` with label DISCOVERY, or for a caller-declared public anchor. This registry is consulted, never trusted on assertion alone by this gate. */
export function recordKnownFinding(input: RecordKnownFindingInput): KnownFindingRecord {
  const base = { ...identityOf(input.spec), scope: input.scope, source: input.source, campaignId: input.campaignId, summary: input.summary };
  const fingerprint = fnv1a(canonicalJson({ ...base, sequence: KNOWN_FINDINGS.length }));
  const recordId = fingerprint;
  const stored: KnownFindingRecord = { recordId, fingerprint, ...base, recordedAt: new Date().toISOString() };
  KNOWN_FINDINGS.push(stored);
  return stored;
}

export function listKnownFindings(): readonly KnownFindingRecord[] {
  return KNOWN_FINDINGS;
}

function sameAssumptionSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, i) => value === sortedB[i]);
}

function scopesMatch(a: FalsificationScope, b: FalsificationScope): boolean {
  return a.domain === b.domain && a.boundary === b.boundary && sameAssumptionSet(a.assumptions, b.assumptions);
}

function consultKnownFindingsRegistry(spec: ModelSpec, scope: FalsificationScope): KnownFindingRecord | null {
  const { modelFingerprint } = identityOf(spec);
  return KNOWN_FINDINGS.find((r) => r.modelFingerprint === modelFingerprint && scopesMatch(r.scope, scope)) ?? null;
}

export interface NoveltyGateInput {
  readonly spec: ModelSpec;
  readonly scope: FalsificationScope;
  /** REUSED from `discoveryCampaign.ts::CampaignOptions.alreadyKnownFingerprints` — fingerprints the caller declared known BEFORE the campaign ran (anti-HARK anchor). */
  readonly alreadyKnownFingerprints?: readonly string[];
  /** A caller-DECLARED match to a known public/literature anchor — never inferred by this gate. `null` when no such declaration is made. */
  readonly declaredPublicAnchorMatch?: { readonly anchorId: string; readonly summary: string } | null;
  /**
   * What was actually searched for a prior match, named explicitly (e.g.
   * `['falsifiedModelRegistry(M2)', 'knownFindingsRegistry', 'PubChem anchor via externalAnchor.ts']`).
   * Required non-empty for the result to ever reach `NOVEL_WITHIN_CHECKED_CORPUS` — see module doc.
   */
  readonly checkedCorpus: readonly string[];
}

export interface NoveltyAssessment {
  readonly level: NoveltyLevel;
  readonly reason: string;
  readonly matchedFinding: KnownFindingRecord | null;
  readonly falsifiedConsultation: RegistryConsultation;
  readonly checkedCorpus: readonly string[];
}

export function assessNovelty(input: NoveltyGateInput): NoveltyAssessment {
  const falsifiedConsultation = consultFalsifiedModelRegistry({ spec: input.spec, scope: input.scope });
  const { modelFingerprint } = identityOf(input.spec);

  if (falsifiedConsultation.verdict === 'BLOCK') {
    return {
      level: 'UNKNOWN',
      reason: `Model is permanently excluded by falsifiedModelRegistry (M2): ${falsifiedConsultation.reason}. A blocked model cannot be presented as any finding.`,
      matchedFinding: null,
      falsifiedConsultation,
      checkedCorpus: input.checkedCorpus,
    };
  }

  if ((input.alreadyKnownFingerprints ?? []).includes(modelFingerprint)) {
    return {
      level: 'NOT_NEW',
      reason: 'Model fingerprint was declared already-known BEFORE this campaign began (anti-HARK anchor, discoveryCampaign.ts::CampaignOptions.alreadyKnownFingerprints).',
      matchedFinding: null,
      falsifiedConsultation,
      checkedCorpus: input.checkedCorpus,
    };
  }

  if (input.declaredPublicAnchorMatch) {
    return {
      level: 'NOT_NEW',
      reason: `Model matches a caller-declared public anchor "${input.declaredPublicAnchorMatch.anchorId}": ${input.declaredPublicAnchorMatch.summary}.`,
      matchedFinding: null,
      falsifiedConsultation,
      checkedCorpus: input.checkedCorpus,
    };
  }

  const matchedFinding = consultKnownFindingsRegistry(input.spec, input.scope);
  if (matchedFinding) {
    return {
      level: 'NOT_NEW',
      reason: `Model already recorded as a known finding (${matchedFinding.source}, campaign ${matchedFinding.campaignId ?? 'n/a'}): ${matchedFinding.summary}.`,
      matchedFinding,
      falsifiedConsultation,
      checkedCorpus: input.checkedCorpus,
    };
  }

  if (input.checkedCorpus.length === 0) {
    return {
      level: 'POSSIBLY_NOVEL',
      reason: 'No matching prior finding in the (automatically consulted) falsifiedModelRegistry or knownFindingsRegistry, but the caller named no additional checked corpus — the claim cannot be bounded beyond "possibly novel".',
      matchedFinding: null,
      falsifiedConsultation,
      checkedCorpus: input.checkedCorpus,
    };
  }

  return {
    level: 'NOVEL_WITHIN_CHECKED_CORPUS',
    reason: `No matching prior finding in any of the checked corpus: ${input.checkedCorpus.join(', ')}. This bounds the claim to what was searched — it is not a claim of novelty against all of science.`,
    matchedFinding: null,
    falsifiedConsultation,
    checkedCorpus: input.checkedCorpus,
  };
}

export interface ClassifyResultLabelInput {
  readonly accessDeclared: boolean;
  readonly noAccessReason?: string;
  readonly assessment: NoveltyAssessment;
  readonly hasSupportingEvidence: boolean;
  readonly hasFalsificationAttempt: boolean;
  readonly hasProvenance: boolean;
}

export interface ResultLabelDecision {
  readonly label: ResultLabel;
  readonly reason: string;
}

/**
 * Derives the label a caller MAY propose — this function's own output must
 * still pass `assertValidResultLabel` before being stored or displayed.
 * Kept as a separate step (rather than folded into the assertion) so a
 * caller can read WHY a label was denied without triggering a throw.
 */
export function classifyResultLabel(input: ClassifyResultLabelInput): ResultLabelDecision {
  if (!input.accessDeclared) {
    if (!input.noAccessReason || input.noAccessReason.trim().length === 0) {
      throw new Error('noveltyGate.classifyResultLabel: accessDeclared is false but noAccessReason is empty — declare WHY access was refused.');
    }
    return { label: 'NO_ACCESS_DECLARED', reason: input.noAccessReason };
  }

  if (input.assessment.level === 'NOT_NEW') {
    return input.hasSupportingEvidence
      ? { label: 'REPRODUCTION', reason: input.assessment.reason }
      : { label: 'HYPOTHESIS_UNKNOWN', reason: `Model is NOT_NEW (${input.assessment.reason}) but carries no supporting evidence from THIS run — nothing to reproduce yet.` };
  }

  if (input.assessment.level === 'UNKNOWN') {
    return { label: 'HYPOTHESIS_UNKNOWN', reason: input.assessment.reason };
  }

  // POSSIBLY_NOVEL or NOVEL_WITHIN_CHECKED_CORPUS from here.
  const missing: string[] = [];
  if (!input.hasSupportingEvidence) missing.push('supporting evidence');
  if (!input.hasFalsificationAttempt) missing.push('a documented falsification attempt');
  if (!input.hasProvenance) missing.push('provenance');
  if (input.assessment.level !== 'NOVEL_WITHIN_CHECKED_CORPUS') missing.push('a fully checked corpus (currently only POSSIBLY_NOVEL)');

  if (missing.length > 0) {
    return { label: 'HYPOTHESIS_UNKNOWN', reason: `Candidate for DISCOVERY but missing: ${missing.join('; ')}.` };
  }

  return { label: 'DISCOVERY', reason: `NOVEL_WITHIN_CHECKED_CORPUS with supporting evidence, a documented falsification attempt, and provenance: ${input.assessment.reason}` };
}

export class NoveltyGateViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoveltyGateViolationError';
  }
}

export interface AssertValidResultLabelInput {
  readonly label: ResultLabel;
  readonly assessment: NoveltyAssessment;
  readonly accessDeclared: boolean;
  readonly hasSupportingEvidence: boolean;
  readonly hasFalsificationAttempt: boolean;
  readonly hasProvenance: boolean;
}

/**
 * THE MACHINE-ENFORCED ASSERTION (TE6). Throws `NoveltyGateViolationError`
 * rather than letting an inflated label through. Every code path in Phase E
 * that stores or displays a `ResultLabel` MUST call this first — no path may
 * assert DISCOVERY on its own authority.
 *
 * TE6.1 — a known finding (NOT_NEW) labeled DISCOVERY FAILS.
 * TE6.2 — NO_ACCESS_DECLARED (accessDeclared=false) labeled DISCOVERY FAILS.
 * TE6.3 — REPRODUCTION-shaped evidence (NOT_NEW) attempting to upgrade to
 *         DISCOVERY FAILS (same check as TE6.1 — there is no separate
 *         "upgrade" code path, which is itself the guarantee: nothing can
 *         silently promote a NOT_NEW model to DISCOVERY after the fact).
 */
export function assertValidResultLabel(input: AssertValidResultLabelInput): void {
  if (input.label !== 'DISCOVERY') return;

  if (!input.accessDeclared) {
    throw new NoveltyGateViolationError('noveltyGate: refusing label DISCOVERY — accessDeclared is false. A result with no declared data access must be NO_ACCESS_DECLARED, never DISCOVERY.');
  }
  if (input.assessment.level === 'NOT_NEW') {
    throw new NoveltyGateViolationError(`noveltyGate: refusing label DISCOVERY — novelty level is NOT_NEW (${input.assessment.reason}). A known finding must be labeled REPRODUCTION, never DISCOVERY.`);
  }
  if (input.assessment.level === 'UNKNOWN') {
    throw new NoveltyGateViolationError(`noveltyGate: refusing label DISCOVERY — novelty level is UNKNOWN (${input.assessment.reason}).`);
  }
  if (input.assessment.level !== 'NOVEL_WITHIN_CHECKED_CORPUS') {
    throw new NoveltyGateViolationError('noveltyGate: refusing label DISCOVERY — novelty level is only POSSIBLY_NOVEL, not NOVEL_WITHIN_CHECKED_CORPUS. Name a checked corpus before claiming discovery.');
  }
  if (!input.hasSupportingEvidence) {
    throw new NoveltyGateViolationError('noveltyGate: refusing label DISCOVERY — no supporting evidence.');
  }
  if (!input.hasFalsificationAttempt) {
    throw new NoveltyGateViolationError('noveltyGate: refusing label DISCOVERY — no documented falsification attempt.');
  }
  if (!input.hasProvenance) {
    throw new NoveltyGateViolationError('noveltyGate: refusing label DISCOVERY — no provenance.');
  }
}
