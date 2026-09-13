import { fnv1a, canonicalJson } from '../events/hash';
import type { Hypothesis } from '../experimentFabric/beliefRevision';
import { modelSpecFingerprint, type ModelBasis, type ModelSpec } from './modelSpace';

/**
 * M2 — GLOBAL FALSIFIED-MODEL REGISTRY.
 *
 * WHY THIS EXISTS. `discoveryCampaign.ts` enumerates and fits a model space
 * fresh on every call to `runDiscoveryCampaign` — nothing a PREVIOUS campaign
 * concluded about a model form survives past that call's return value. Two
 * campaigns on the SAME laboratory (a resumed run, a second session exploring
 * the same problem) will independently re-derive, re-fit and re-report the
 * exact same falsified model, at real fitting cost and with no memory that the
 * question was already settled. This module is that memory: a durable record
 * of which model FINGERPRINTS (`modelSpace.ts::modelSpecFingerprint` — reused
 * verbatim, not reinvented) a REAL campaign round already falsified, consulted
 * before a new model is admitted into a live campaign.
 *
 * THE THREE SCOPES answer "falsified relative to what?", because a model form
 * is not intrinsically true or false — only true-or-false OF SOMETHING:
 *   - `NEVER`      — this exact model form is excluded in ANY laboratory
 *                    (the fingerprint alone is the key). Reserved for a model
 *                    a caller has independently established is degenerate or
 *                    nonsensical everywhere (e.g. dimensionally incoherent),
 *                    never emitted automatically by a single campaign's own
 *                    RSS comparison against sibling models in ONE lab — that
 *                    evidence only supports "worse than X here", not "false
 *                    everywhere".
 *   - `VARIANT_ONLY` — this exact model form is excluded ONLY within the one
 *                    laboratory it was tested in (default scope a campaign
 *                    records automatically: real evidence support = one lab).
 *   - `COMPONENT`   — a single basis TERM (not the whole model) is implicated;
 *                    every model in that lab still carrying that basis is
 *                    excluded, regardless of the rest of its shape — the same
 *                    idea `modelSpace.ts::ModelSpaceConstraints.excludeBases`
 *                    already expresses for campaign SETUP, extended here to a
 *                    registry entry a later campaign did not have to be told
 *                    about by hand.
 *
 * "FALSIFIED tylko z rzeczywistej ścieżki epistemicznej" (FALSIFIED only from
 * a real epistemic path): `recordFalsification` REQUIRES the caller's actual
 * `Hypothesis` (from `beliefRevision.ts`) and refuses unless its `status` is
 * literally `'FALSIFIED_WITHIN_PROTOCOL'` — the same verdict
 * `discoveryCampaign.ts::runDiscoveryCampaign` already computes from a real
 * weighted-RSS comparison, never a bare asserted string. There is no code path
 * that records a falsification without a real Hypothesis carrying that status.
 *
 * "Konsultacja przed emisją modelu" (consult before a model is emitted):
 * `consultFalsifiedModelRegistry` is meant to be called by a campaign BEFORE
 * a candidate spec is admitted into its live model set — at initial
 * enumeration and at residual-derived proposal alike — so a model already
 * settled elsewhere is skipped with a real, visible reason rather than
 * silently re-explored.
 *
 * "Append-only": entries are never mutated or deleted. An `overrideFalsification`
 * call APPENDS a new `'OVERRIDE'` entry that references the standing
 * falsification it counters; the original entry is untouched, so the full
 * history — falsified, then overridden, by what evidence, when — stays
 * readable. Consultation always resolves the CURRENT state from the append-only
 * log's chronological order, never from a mutated field.
 *
 * PERSISTENCE, deliberately NOT this module's job. This is a process-lifetime,
 * in-memory log — real, consultable and testable, and exactly that far, no
 * further. `scienceMemory.ts` (this codebase's other durable "science" store)
 * is a different shape entirely: per-BROWSER-user `localStorage`, capped at
 * the 100 most recent `SavedExperiment` UI-history records, with no
 * cross-campaign consultation semantics — bending it to fit this contract
 * would distort both. `packages/backend/src/campaign/persistence.mjs` is a
 * third, unrelated store (drug-candidate SMILES dedup across chemistry
 * campaigns, keyed by canonical SMILES, not model-form fingerprints). Wiring
 * this in-memory log to a durable backend store is future work for whoever
 * actually needs cross-PROCESS persistence; nothing here pretends otherwise.
 */

export const FALSIFIED_MODEL_REGISTRY_CONTRACT_VERSION = '1.0.0';

export type FalsificationScope = 'NEVER' | 'VARIANT_ONLY' | 'COMPONENT';

export type FalsifiedModelEntryKind = 'FALSIFICATION' | 'OVERRIDE';

export interface FalsifiedModelEntry {
  readonly entryId: string;
  readonly kind: FalsifiedModelEntryKind;
  readonly labId: string;
  readonly fingerprint: string;
  readonly scope: FalsificationScope;
  readonly componentBasis: ModelBasis | null;
  readonly reason: string;
  readonly evidenceHypothesisId: string;
  readonly evidenceStatus: Hypothesis['status'];
  readonly evidenceRoundFingerprint: string;
  readonly recordedAt: string;
  /** Set only for `kind === 'OVERRIDE'`: the `entryId` of the falsification this overrides. */
  readonly overridesEntryId: string | null;
}

// Append-only, process-lifetime log. See module doc for exactly what this is
// (and is not) a substitute for.
let LOG: FalsifiedModelEntry[] = [];

/** Test-only escape hatch — production code has no reason to ever call this. */
export function resetFalsifiedModelRegistryForTests(): void {
  LOG = [];
}

export function listFalsifiedModelRegistryEntries(): readonly FalsifiedModelEntry[] {
  return LOG;
}

/**
 * `sequence` (the entry's own future index in `LOG`) breaks ties between two
 * otherwise-identical entries appended within the same millisecond —
 * `recordedAt` alone is not fine-grained enough to guarantee two real, separate
 * appends get distinct ids, and a shared id between distinct log rows would
 * make override linkage (`overridesEntryId`) ambiguous.
 */
function computeEntryId(input: Omit<FalsifiedModelEntry, 'entryId'>, sequence: number): string {
  return fnv1a(canonicalJson({ ...input, sequence }));
}

export interface RecordFalsificationInput {
  readonly labId: string;
  readonly spec: ModelSpec;
  readonly scope: FalsificationScope;
  /** Required, and only meaningful, when `scope === 'COMPONENT'`. */
  readonly componentBasis?: ModelBasis;
  /** The real Hypothesis whose status must be `'FALSIFIED_WITHIN_PROTOCOL'` — the real epistemic path this entry traces to. */
  readonly evidence: Hypothesis;
  /** The real campaign round's own `roundFingerprint` that produced `evidence`'s falsifying update — proof this was not asserted out of thin air. */
  readonly evidenceRoundFingerprint: string;
}

export function recordFalsification(input: RecordFalsificationInput): FalsifiedModelEntry {
  if (input.evidence.status !== 'FALSIFIED_WITHIN_PROTOCOL') {
    throw new Error(
      `falsifiedModelRegistry.recordFalsification: refusing to record — evidence Hypothesis status is "${input.evidence.status}", not "FALSIFIED_WITHIN_PROTOCOL". A registry entry must trace to a real falsification verdict, never be asserted.`,
    );
  }
  if (input.scope === 'COMPONENT' && input.componentBasis === undefined) {
    throw new Error('falsifiedModelRegistry.recordFalsification: scope "COMPONENT" requires componentBasis (which basis term was implicated).');
  }
  const lastUpdate = input.evidence.history[input.evidence.history.length - 1] ?? null;
  const base = {
    kind: 'FALSIFICATION' as const,
    labId: input.labId,
    fingerprint: modelSpecFingerprint(input.spec),
    scope: input.scope,
    componentBasis: input.scope === 'COMPONENT' ? input.componentBasis! : null,
    reason: lastUpdate?.reason ?? `Falsified: confidence ${input.evidence.confidence.toFixed(4)}.`,
    evidenceHypothesisId: input.evidence.id,
    evidenceStatus: input.evidence.status,
    evidenceRoundFingerprint: input.evidenceRoundFingerprint,
    recordedAt: new Date().toISOString(),
    overridesEntryId: null,
  };
  const entry: FalsifiedModelEntry = { entryId: computeEntryId(base, LOG.length), ...base };
  LOG.push(entry);
  return entry;
}

export interface OverrideFalsificationInput {
  readonly labId: string;
  readonly spec: ModelSpec;
  /** New evidence that counts AGAINST the standing falsification — must NOT itself be another FALSIFIED_WITHIN_PROTOCOL verdict. */
  readonly newEvidence: Hypothesis;
  readonly evidenceRoundFingerprint: string;
  readonly reason: string;
}

/** "Jawny override z nowym dowodem": appends a new entry; never mutates or removes the falsification it counters. */
export function overrideFalsification(input: OverrideFalsificationInput): FalsifiedModelEntry {
  if (input.newEvidence.status === 'FALSIFIED_WITHIN_PROTOCOL') {
    throw new Error(
      'falsifiedModelRegistry.overrideFalsification: newEvidence must not itself be a FALSIFIED_WITHIN_PROTOCOL verdict — an override requires evidence that counts AGAINST the standing falsification, not another instance of it.',
    );
  }
  const fingerprint = modelSpecFingerprint(input.spec);
  const standing = currentStateFor(input.labId, fingerprint);
  if (standing === null) {
    throw new Error(`falsifiedModelRegistry.overrideFalsification: no standing falsification found for lab "${input.labId}", fingerprint "${fingerprint}" — nothing to override.`);
  }
  const base = {
    kind: 'OVERRIDE' as const,
    labId: input.labId,
    fingerprint,
    scope: standing.scope,
    componentBasis: standing.componentBasis,
    reason: input.reason,
    evidenceHypothesisId: input.newEvidence.id,
    evidenceStatus: input.newEvidence.status,
    evidenceRoundFingerprint: input.evidenceRoundFingerprint,
    recordedAt: new Date().toISOString(),
    overridesEntryId: standing.entryId,
  };
  const entry: FalsifiedModelEntry = { entryId: computeEntryId(base, LOG.length), ...base };
  LOG.push(entry);
  return entry;
}

/** The most recent FALSIFICATION for (labId, fingerprint), unless a later OVERRIDE supersedes it. `null` when nothing currently stands. */
function currentStateFor(labId: string, fingerprint: string): FalsifiedModelEntry | null {
  const relevant = LOG.filter((e) => e.labId === labId && e.fingerprint === fingerprint);
  const latest = relevant[relevant.length - 1] ?? null;
  return latest && latest.kind === 'FALSIFICATION' ? latest : null;
}

/** The most recent NEVER-scope FALSIFICATION for `fingerprint` in ANY lab, unless a later OVERRIDE for that same (labId, fingerprint) supersedes it. `null` when none currently stands. */
function currentGlobalNeverState(fingerprint: string): FalsifiedModelEntry | null {
  const neverEntries = LOG.filter((e) => e.fingerprint === fingerprint && e.scope === 'NEVER');
  // Group by labId so each lab's own override history resolves independently,
  // then report the first lab where a NEVER ban currently stands.
  const labIds = [...new Set(neverEntries.map((e) => e.labId))];
  for (const labId of labIds) {
    const standing = currentStateFor(labId, fingerprint);
    if (standing !== null && standing.scope === 'NEVER') return standing;
  }
  return null;
}

/** Standing COMPONENT bans for `labId`, i.e. not superseded by a later OVERRIDE for the same (labId, componentBasis). */
function standingComponentBans(labId: string): readonly FalsifiedModelEntry[] {
  const relevant = LOG.filter((e) => e.labId === labId && e.scope === 'COMPONENT');
  const byBasis = new Map<ModelBasis, FalsifiedModelEntry[]>();
  for (const entry of relevant) {
    const basis = entry.componentBasis!;
    byBasis.set(basis, [...(byBasis.get(basis) ?? []), entry]);
  }
  const standing: FalsifiedModelEntry[] = [];
  for (const entries of byBasis.values()) {
    const latest = entries[entries.length - 1]!;
    if (latest.kind === 'FALSIFICATION') standing.push(latest);
  }
  return standing;
}

export interface RegistryConsultation {
  readonly allowed: boolean;
  readonly reason: string;
  readonly matchedEntry: FalsifiedModelEntry | null;
}

/**
 * "Konsultacja przed emisją modelu": call before admitting `spec` as a live
 * candidate in laboratory `labId`. Resolution order: a standing `NEVER` ban on
 * this fingerprint (any lab) forbids it everywhere; otherwise a standing
 * `VARIANT_ONLY` ban on (labId, fingerprint) forbids it in this lab only;
 * otherwise a standing `COMPONENT` ban on any basis this spec still contains
 * forbids it in this lab only. Anything else is allowed.
 */
export function consultFalsifiedModelRegistry(labId: string, spec: ModelSpec): RegistryConsultation {
  const fingerprint = modelSpecFingerprint(spec);

  const neverBan = currentGlobalNeverState(fingerprint);
  if (neverBan !== null) {
    return {
      allowed: false,
      reason: `Model permanently excluded (scope NEVER, first recorded in lab "${neverBan.labId}"): ${neverBan.reason}`,
      matchedEntry: neverBan,
    };
  }

  const variantBan = currentStateFor(labId, fingerprint);
  if (variantBan !== null && variantBan.scope === 'VARIANT_ONLY') {
    return {
      allowed: false,
      reason: `Model already falsified in lab "${labId}" (scope VARIANT_ONLY): ${variantBan.reason}`,
      matchedEntry: variantBan,
    };
  }

  for (const ban of standingComponentBans(labId)) {
    if (spec.terms.some((term) => term.basis === ban.componentBasis)) {
      return {
        allowed: false,
        reason: `Model contains basis "${ban.componentBasis}", falsified as a COMPONENT in lab "${labId}": ${ban.reason}`,
        matchedEntry: ban,
      };
    }
  }

  return { allowed: true, reason: 'No standing falsification applies to this model in this laboratory.', matchedEntry: null };
}
