import { fnv1a, canonicalJson } from '../events/hash';
import type { Hypothesis } from '../experimentFabric/beliefRevision';
import { modelSpecFingerprint, renderModelSpec, type ModelSpec } from './modelSpace';

/**
 * M2 — GLOBAL FALSIFIED-MODEL REGISTRY.
 *
 * Genesis must remember which models were REALLY falsified, and refuse to
 * re-propose them in a later, unrelated campaign without an explicit
 * justification and new evidence. This module is that memory: a durable,
 * cross-campaign, append-only record of falsified model FINGERPRINTS
 * (`modelSpace.ts::modelSpecFingerprint`, reused verbatim — no second
 * fingerprint scheme), consulted before a candidate model is admitted into a
 * live campaign.
 *
 * NO SECOND TRUTH SYSTEM. Audited before writing a line of this file:
 * `scienceMemory.ts` is per-BROWSER-user `localStorage`, capped at the 100
 * most recent UI-history records, with no cross-campaign consultation
 * semantics — the wrong shape entirely. `packages/backend/src/campaign/
 * persistence.mjs` is cross-campaign dedup too, but for a DIFFERENT engine
 * (drug-candidate SMILES across chemistry campaigns, keyed by canonical
 * SMILES) — a real prior-art pattern for "don't re-explore what a sibling
 * campaign already exhausted", confirming the shape of this problem, but not
 * a store this module can reuse (different identity key, different domain).
 * This module is the one and only falsified-MODEL-fingerprint store; nothing
 * else in the repo tracks this.
 *
 * "FALSIFIED tylko z rzeczywistej ścieżki epistemicznej": `recordFalsification`
 * REQUIRES the caller's actual `Hypothesis` (from `beliefRevision.ts`,
 * unmodified) and refuses unless its `status` is literally
 * `'FALSIFIED_WITHIN_PROTOCOL'` — the same verdict
 * `discoveryCampaign.ts::runDiscoveryCampaign` already computes from a real
 * weighted-RSS comparison. No code path records a falsification from an
 * asserted string.
 *
 * APPEND-ONLY. Entries are never mutated or deleted. `overrideFalsification`
 * appends a new `OverrideEntry` that references the `FalsifiedModelRecord` it
 * counters; the original record's own stored fields never change. Every
 * `FalsifiedModelRecord` returned by a query is a freshly computed VIEW with
 * `supersededBy` filled in from the override log — never a mutated stored
 * value.
 *
 * CONSULTATION VERDICT is three-valued, not a boolean, because "falsified
 * relative to what" matters:
 *   - `BLOCK` — `reusableAs: 'NEVER'`, consulted in the SAME scope (domain +
 *     assumptions + boundary) it was recorded in. The strongest verdict.
 *   - `REQUIRE_OVERRIDE` — either (a) `reusableAs: 'VARIANT_ONLY'` or
 *     `'COMPONENT'`, in ANY scope, with no standing override yet, or (b) a
 *     `NEVER` record consulted from a MATERIALLY DIFFERENT scope than it was
 *     recorded in. Silently blocking (a) would treat one lab's finding as
 *     universal; silently allowing (b) would ignore a real prior finding just
 *     because the context moved. Neither extreme is honest, so both land here
 *     instead: a human or a later explicit override decides, the registry
 *     does not.
 *   - `ALLOW` — no standing (non-superseded) record matches this model's
 *     fingerprint, or the standing record has been overridden with real new
 *     evidence.
 *
 * A model that merely shares ONE basis term with a falsified model (T5: "a
 * shared subexpression, a different core") is a DIFFERENT `ModelSpec`, hence
 * a DIFFERENT `modelSpecFingerprint`, hence matches no record at all and
 * resolves to `ALLOW` — consultation keys on the FULL model's identity, never
 * on partial structural overlap. `COMPONENT` scope exists to let a caller
 * RECORD which piece of a model it blames (for audit, and to inform a later
 * campaign's own `ModelSpaceConstraints.excludeBases` choice by hand); it
 * does not make this registry reach into OTHER models that happen to share
 * that piece — that reach is exactly what T5 forbids.
 */

export const FALSIFIED_MODEL_REGISTRY_CONTRACT_VERSION = '2.0.0';

export type ReusableAs = 'NEVER' | 'VARIANT_ONLY' | 'COMPONENT';

export interface FalsificationProvenance {
  readonly observationIds: readonly string[];
  readonly verdict: 'FALSIFIED';
  readonly campaignId: string;
  readonly round: number;
}

/** What this falsification actually establishes "relative to" — a lab/problem, the assumptions in force, and the observed-range boundary. */
export interface FalsificationScope {
  readonly domain: string;
  readonly assumptions: readonly string[];
  readonly boundary: string;
}

export interface FalsifiedModelRecord {
  readonly recordId: string;
  readonly modelId: string;
  readonly modelFingerprint: string;
  readonly falsifiedBy: FalsificationProvenance;
  readonly scope: FalsificationScope;
  readonly reusableAs: ReusableAs;
  /** DERIVED at query time from the override log; never a stored, mutated field. `null` while the record stands unchallenged. */
  readonly supersededBy: string | null;
  readonly recordedAt: string;
  /** Content fingerprint of this record's own identity fields (excludes `recordId`/`fingerprint` themselves). */
  readonly fingerprint: string;
}

export interface OverrideEntry {
  readonly overrideId: string;
  readonly overriddenRecordId: string;
  /** The new Hypothesis's own id — logged explicitly, never just a free-text claim. */
  readonly newEvidenceId: string;
  readonly newEvidenceStatus: Hypothesis['status'];
  readonly reason: string;
  readonly recordedAt: string;
}

type LogEntry =
  | { readonly entryType: 'RECORD'; readonly record: Omit<FalsifiedModelRecord, 'supersededBy'> }
  | { readonly entryType: 'OVERRIDE'; readonly override: OverrideEntry };

// Append-only, process-lifetime log. See module doc for exactly what this is
// (and is not) a substitute for.
let LOG: LogEntry[] = [];

/** Test-only escape hatch — production code has no reason to ever call this. */
export function resetFalsifiedModelRegistryForTests(): void {
  LOG = [];
}

function storedRecordFingerprint(input: Omit<FalsifiedModelRecord, 'recordId' | 'fingerprint' | 'supersededBy'>, sequence: number): string {
  return fnv1a(canonicalJson({ ...input, sequence }));
}

export interface RecordFalsificationInput {
  readonly spec: ModelSpec;
  readonly scope: FalsificationScope;
  readonly reusableAs: ReusableAs;
  /** The real Hypothesis whose status must be `'FALSIFIED_WITHIN_PROTOCOL'` — the real epistemic path this record traces to. */
  readonly evidence: Hypothesis;
  readonly campaignId: string;
  readonly round: number;
  readonly observationIds: readonly string[];
}

export function recordFalsification(input: RecordFalsificationInput): FalsifiedModelRecord {
  if (input.evidence.status !== 'FALSIFIED_WITHIN_PROTOCOL') {
    throw new Error(
      `falsifiedModelRegistry.recordFalsification: refusing to record — evidence Hypothesis status is "${input.evidence.status}", not "FALSIFIED_WITHIN_PROTOCOL". A record must trace to a real falsification verdict, never be asserted.`,
    );
  }
  const base = {
    modelId: renderModelSpec(input.spec),
    modelFingerprint: modelSpecFingerprint(input.spec),
    falsifiedBy: {
      observationIds: input.observationIds,
      verdict: 'FALSIFIED' as const,
      campaignId: input.campaignId,
      round: input.round,
    },
    scope: input.scope,
    reusableAs: input.reusableAs,
    recordedAt: new Date().toISOString(),
  };
  const fingerprint = storedRecordFingerprint(base, LOG.length);
  const recordId = fingerprint;
  const stored: Omit<FalsifiedModelRecord, 'supersededBy'> = { recordId, fingerprint, ...base };
  LOG.push({ entryType: 'RECORD', record: stored });
  return { ...stored, supersededBy: null };
}

export interface OverrideFalsificationInput {
  readonly recordId: string;
  /** New evidence that counts AGAINST the standing falsification — must NOT itself be another FALSIFIED_WITHIN_PROTOCOL verdict. */
  readonly newEvidence: Hypothesis;
  readonly reason: string;
}

/** "Jawnie logować override + nowe evidence ID": appends a new entry; never mutates or removes the record it counters. */
export function overrideFalsification(input: OverrideFalsificationInput): OverrideEntry {
  const target = LOG.find((e): e is Extract<LogEntry, { entryType: 'RECORD' }> => e.entryType === 'RECORD' && e.record.recordId === input.recordId);
  if (target === undefined) {
    throw new Error(`falsifiedModelRegistry.overrideFalsification: no falsification record with recordId "${input.recordId}" exists — nothing to override.`);
  }
  if (input.newEvidence.status === 'FALSIFIED_WITHIN_PROTOCOL') {
    throw new Error(
      'falsifiedModelRegistry.overrideFalsification: newEvidence must not itself be a FALSIFIED_WITHIN_PROTOCOL verdict — an override requires evidence that counts AGAINST the standing falsification, not another instance of it.',
    );
  }
  const overrideId = fnv1a(canonicalJson({ recordId: input.recordId, newEvidenceId: input.newEvidence.id, reason: input.reason, sequence: LOG.length }));
  const override: OverrideEntry = {
    overrideId,
    overriddenRecordId: input.recordId,
    newEvidenceId: input.newEvidence.id,
    newEvidenceStatus: input.newEvidence.status,
    reason: input.reason,
    recordedAt: new Date().toISOString(),
  };
  LOG.push({ entryType: 'OVERRIDE', override });
  return override;
}

/** All RECORD entries, most recent last, as fully-derived views (`supersededBy` resolved). */
export function listFalsifiedModelRecords(): readonly FalsifiedModelRecord[] {
  return LOG.filter((e): e is Extract<LogEntry, { entryType: 'RECORD' }> => e.entryType === 'RECORD')
    .map((e) => resolveRecordView(e.record));
}

export function listOverrides(): readonly OverrideEntry[] {
  return LOG.filter((e): e is Extract<LogEntry, { entryType: 'OVERRIDE' }> => e.entryType === 'OVERRIDE').map((e) => e.override);
}

function resolveRecordView(record: Omit<FalsifiedModelRecord, 'supersededBy'>): FalsifiedModelRecord {
  const overridingEntry = LOG.find((e): e is Extract<LogEntry, { entryType: 'OVERRIDE' }> => e.entryType === 'OVERRIDE' && e.override.overriddenRecordId === record.recordId);
  return { ...record, supersededBy: overridingEntry?.override.overrideId ?? null };
}

/** Every un-superseded RECORD matching `modelFingerprint`, in log order. A superseded record contributes nothing to consultation. */
function standingRecordsFor(modelFingerprint: string): readonly FalsifiedModelRecord[] {
  return listFalsifiedModelRecords().filter((r) => r.modelFingerprint === modelFingerprint && r.supersededBy === null);
}

function sameAssumptionSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, i) => value === sortedB[i]);
}

/** Strict equality on all three scope facets — anything less is "materially different" (T3). */
function scopesMatch(a: FalsificationScope, b: FalsificationScope): boolean {
  return a.domain === b.domain && a.boundary === b.boundary && sameAssumptionSet(a.assumptions, b.assumptions);
}

export type ConsultationVerdict = 'ALLOW' | 'BLOCK' | 'REQUIRE_OVERRIDE';

export interface RegistryConsultation {
  readonly verdict: ConsultationVerdict;
  readonly reason: string;
  readonly matchedRecord: FalsifiedModelRecord | null;
}

export interface ConsultFalsifiedModelRegistryInput {
  readonly spec: ModelSpec;
  /** The scope this candidate model is being considered IN — compared against each standing record's own recorded scope. */
  readonly scope: FalsificationScope;
}

/**
 * "Konsultuj model PRZED jego emisją": call before admitting `input.spec` as
 * a live candidate. See the module doc for the full verdict semantics.
 */
export function consultFalsifiedModelRegistry(input: ConsultFalsifiedModelRegistryInput): RegistryConsultation {
  const modelFingerprint = modelSpecFingerprint(input.spec);
  const standing = standingRecordsFor(modelFingerprint);
  if (standing.length === 0) {
    return { verdict: 'ALLOW', reason: 'No standing falsification record matches this model.', matchedRecord: null };
  }
  // Most recent standing record for this fingerprint governs.
  const record = standing[standing.length - 1]!;
  const sameScope = scopesMatch(record.scope, input.scope);

  if (record.reusableAs === 'NEVER') {
    return sameScope
      ? { verdict: 'BLOCK', reason: `Model permanently excluded (reusableAs NEVER, recorded in domain "${record.scope.domain}", campaign ${record.falsifiedBy.campaignId} round ${record.falsifiedBy.round}).`, matchedRecord: record }
      : {
        verdict: 'REQUIRE_OVERRIDE',
        reason: `Model was recorded NEVER in a materially different scope (domain "${record.scope.domain}" vs "${input.scope.domain}"); this finding is not silently extended into a different context, but it is not ignored either — an explicit override is required.`,
        matchedRecord: record,
      };
  }

  // VARIANT_ONLY / COMPONENT: always requires an explicit override before reuse, whatever the scope.
  return {
    verdict: 'REQUIRE_OVERRIDE',
    reason: `Model already falsified (reusableAs ${record.reusableAs}${sameScope ? ', same scope' : ', different scope'}) in domain "${record.scope.domain}", campaign ${record.falsifiedBy.campaignId} round ${record.falsifiedBy.round}: no override is on record.`,
    matchedRecord: record,
  };
}
