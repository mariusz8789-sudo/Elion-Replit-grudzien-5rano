import { canonicalJson, fnv1a } from '../events/hash';

/**
 * M2 — THE GLOBAL FALSIFIED-MODEL REGISTRY.
 *
 * A model killed by real observations in campaign A should not be quietly
 * re-proposed in campaign B as though nothing had happened. Until now nothing
 * remembered across campaigns: each run enumerated its grammar from scratch,
 * so the same dead model could be reborn indefinitely, and the work that
 * killed it was spent again every time.
 *
 * WHAT THIS IS: an append-only INDEX over verdicts other modules already
 * reached. It is emphatically NOT a second source of truth about what is true.
 * It stores no confidence, recomputes no fit, and overrides no belief — every
 * record points back at the campaign, round and observations that produced the
 * FALSIFIED verdict, and a reader who distrusts the index can go check them.
 * The registry's only authority is over MODEL EMISSION: it answers "has this
 * exact model already been killed, and under what assumptions?".
 *
 * WHY SCOPE MATTERS MORE THAN THE VERDICT. A model is never falsified in the
 * abstract — it is falsified against a domain, under assumptions, within a
 * boundary. `y = c·log x` failing on trapped-ion entanglement says nothing
 * about `y = c·log x` in planetary dynamics. So a record carries its scope, and
 * a lookup that does not match the scope does not block. Blocking across
 * unrelated science would be the most damaging thing this module could do:
 * it would silently shrink the hypothesis space using evidence that does not
 * apply. That is what T5 (no false-positive blocking) exists to prevent.
 *
 * THE THREE REUSE CLASSES are a judgement about WHAT WAS KILLED, made when the
 * record is written:
 *  - NEVER          the functional form itself failed → BLOCK.
 *  - VARIANT_ONLY   this parameterisation failed, the family might not
 *                   → REQUIRE_OVERRIDE: a human may proceed, but must say why
 *                     and must attach the new evidence that justifies it.
 *  - COMPONENT      it failed alone but may still be a term inside a bigger
 *                   model → ALLOW_WITH_TAG.
 */

export const FALSIFIED_MODEL_REGISTRY_CONTRACT_VERSION = '1.0.0';

/** How a killed model may be reused, decided from WHAT the observations actually refuted. */
export type FalsifiedModelReuse = 'NEVER' | 'VARIANT_ONLY' | 'COMPONENT';

/** What a lookup permits. Mirrors the reuse classes but names the ACTION rather than the judgement. */
export type RegistryGateOutcome = 'ALLOW' | 'ALLOW_WITH_TAG' | 'REQUIRE_OVERRIDE' | 'BLOCK';

/**
 * The circumstances under which the model died. Two records with the same
 * model and different scopes are different facts, and are stored as such.
 */
export interface FalsifiedModelScope {
  readonly domain: string;
  /** Assumptions in force when the verdict was reached. A different assumption set is a different scope. */
  readonly assumptions: readonly string[];
  /** The range/conditions the verdict covers. Outside it, the record says nothing. */
  readonly boundary: string;
}

export interface FalsifiedModelRecord {
  readonly contractVersion: string;
  readonly recordId: string;
  readonly modelId: string;
  readonly modelFingerprint: string;
  readonly falsifiedBy: {
    /** The real observations behind the verdict. Empty is refused: a verdict with no observations is not a falsification. */
    readonly observationIds: readonly string[];
    readonly verdict: 'FALSIFIED';
    readonly campaignId: string;
    readonly round: number;
  };
  readonly scope: FalsifiedModelScope;
  readonly reusableAs: FalsifiedModelReuse;
  /** Set when a later, better-scoped record replaces this one. The superseded record is NEVER deleted. */
  readonly supersededBy: string | null;
  readonly recordedAt: number;
  readonly fingerprint: string;
}

export interface RegistryLookup {
  readonly outcome: RegistryGateOutcome;
  /** Records that actually matched the scope — the evidence for the outcome. */
  readonly matched: readonly FalsifiedModelRecord[];
  /** Records for the same model that did NOT match scope, so a reader can see what was considered and rejected. */
  readonly outOfScope: readonly FalsifiedModelRecord[];
  readonly reason: string;
}

/** An explicit, evidence-backed decision to emit a model the registry did not clear. */
export interface RegistryOverride {
  readonly recordId: string;
  readonly authorizedBy: string;
  readonly rationale: string;
  /** New evidence justifying the override. Without it the override is refused — "I disagree" is not evidence. */
  readonly newEvidenceIds: readonly string[];
  readonly at: number;
}

export interface RegistryWriteRefusal {
  readonly ok: false;
  readonly reason: string;
}

function recordFingerprint(core: Omit<FalsifiedModelRecord, 'fingerprint' | 'recordId' | 'supersededBy' | 'contractVersion'>): string {
  return fnv1a(canonicalJson({
    modelFingerprint: core.modelFingerprint,
    falsifiedBy: {
      observationIds: [...core.falsifiedBy.observationIds].sort(),
      verdict: core.falsifiedBy.verdict,
      campaignId: core.falsifiedBy.campaignId,
      round: core.falsifiedBy.round,
    },
    scope: { domain: core.scope.domain, assumptions: [...core.scope.assumptions].sort(), boundary: core.scope.boundary },
    reusableAs: core.reusableAs,
  }));
}

/**
 * APPEND-ONLY BY CONSTRUCTION. Every mutator returns a NEW registry; there is
 * no method that removes or rewrites a record, and `supersede` adds a pointer
 * rather than editing history. A caller holding an old reference still sees
 * exactly what it saw before.
 */
export class FalsifiedModelRegistry {
  private readonly records: readonly FalsifiedModelRecord[];

  constructor(records: readonly FalsifiedModelRecord[] = []) {
    this.records = records;
  }

  all(): readonly FalsifiedModelRecord[] {
    return this.records;
  }

  size(): number {
    return this.records.length;
  }

  /**
   * Writes a falsification. Refuses anything that is not ACTUALLY a
   * falsification — a verdict with no observations behind it, or an
   * unfalsified status dressed up as one. The registry is only as trustworthy
   * as its admission rule, so the rule is enforced here rather than assumed of
   * callers.
   */
  record(input: {
    readonly modelId: string;
    readonly modelFingerprint: string;
    readonly observationIds: readonly string[];
    readonly verdict: string;
    readonly campaignId: string;
    readonly round: number;
    readonly scope: FalsifiedModelScope;
    readonly reusableAs: FalsifiedModelReuse;
    readonly recordedAt: number;
  }): { readonly ok: true; readonly registry: FalsifiedModelRegistry; readonly record: FalsifiedModelRecord } | RegistryWriteRefusal {
    if (input.verdict !== 'FALSIFIED' && input.verdict !== 'FALSIFIED_WITHIN_PROTOCOL') {
      return { ok: false, reason: `Refused: only a falsified model enters the registry; this verdict was "${input.verdict}".` };
    }
    if (input.observationIds.length === 0) {
      return { ok: false, reason: 'Refused: a falsification with no observations behind it is a claim, not evidence.' };
    }
    if (input.modelFingerprint.length === 0) {
      return { ok: false, reason: 'Refused: a record without a model fingerprint cannot be looked up.' };
    }
    const core = {
      modelId: input.modelId,
      modelFingerprint: input.modelFingerprint,
      falsifiedBy: {
        observationIds: input.observationIds,
        verdict: 'FALSIFIED' as const,
        campaignId: input.campaignId,
        round: input.round,
      },
      scope: input.scope,
      reusableAs: input.reusableAs,
      recordedAt: input.recordedAt,
    };
    const fingerprint = recordFingerprint(core);
    const record: FalsifiedModelRecord = {
      contractVersion: FALSIFIED_MODEL_REGISTRY_CONTRACT_VERSION,
      ...core,
      recordId: `falsified:${fingerprint}`,
      supersededBy: null,
      fingerprint,
    };
    // An identical record already present is not an error and is not duplicated: the fact is already held.
    if (this.records.some((r) => r.fingerprint === fingerprint)) {
      return { ok: true, registry: this, record };
    }
    return { ok: true, registry: new FalsifiedModelRegistry([...this.records, record]), record };
  }

  /** Adds a supersession POINTER. The superseded record stays readable, exactly as written. */
  supersede(recordId: string, bySupersedingRecordId: string): FalsifiedModelRegistry {
    return new FalsifiedModelRegistry(
      this.records.map((r) => (r.recordId === recordId && r.supersededBy === null ? { ...r, supersededBy: bySupersedingRecordId } : r)),
    );
  }

  /**
   * THE GATE. Called before a model is emitted, with the scope the emitting
   * campaign is working under. A record only counts when its scope matches:
   * same domain, and an assumption set the new campaign has not changed.
   * Changing an assumption is precisely how a falsified model may honestly
   * return, so a changed assumption set puts the record out of scope and the
   * emission is allowed — that is T3, not a loophole.
   */
  check(modelFingerprint: string, scope: FalsifiedModelScope): RegistryLookup {
    const forModel = this.records.filter((r) => r.modelFingerprint === modelFingerprint && r.supersededBy === null);
    const matched = forModel.filter((r) => sameScope(r.scope, scope));
    const outOfScope = forModel.filter((r) => !sameScope(r.scope, scope));

    if (matched.length === 0) {
      return {
        outcome: 'ALLOW',
        matched: [],
        outOfScope,
        reason: forModel.length === 0
          ? 'No falsification is on record for this model.'
          : `This model was falsified ${forModel.length} time(s), but never under this domain and assumption set, so those verdicts do not apply here.`,
      };
    }
    // The strictest matching record decides: one NEVER outweighs any number of softer verdicts.
    const strictest = matched.some((r) => r.reusableAs === 'NEVER')
      ? 'NEVER'
      : matched.some((r) => r.reusableAs === 'VARIANT_ONLY')
        ? 'VARIANT_ONLY'
        : 'COMPONENT';
    const cite = matched.map((r) => `${r.falsifiedBy.campaignId}#${r.falsifiedBy.round}`).join(', ');
    switch (strictest) {
      case 'NEVER':
        return { outcome: 'BLOCK', matched, outOfScope, reason: `Blocked: this model's functional form was falsified in ${cite} under the same assumptions, and recorded as NEVER reusable.` };
      case 'VARIANT_ONLY':
        return { outcome: 'REQUIRE_OVERRIDE', matched, outOfScope, reason: `This parameterisation was falsified in ${cite}. The family may still be viable, so emission requires an explicit override citing new evidence.` };
      case 'COMPONENT':
        return { outcome: 'ALLOW_WITH_TAG', matched, outOfScope, reason: `Falsified standalone in ${cite}, but recorded as reusable as a COMPONENT — allowed here, and tagged so the record follows it.` };
    }
  }

  /**
   * Applies an override to a lookup. An override can lift REQUIRE_OVERRIDE and
   * nothing else: a NEVER record stays blocked, because the point of NEVER is
   * that no amount of authorisation makes refuted physics work again. Lifting
   * it would need a NEW record under changed assumptions, which `check` already
   * treats as a different scope.
   */
  applyOverride(lookup: RegistryLookup, override: RegistryOverride | null): RegistryLookup {
    if (override === null) return lookup;
    if (lookup.outcome !== 'REQUIRE_OVERRIDE') {
      return { ...lookup, reason: `${lookup.reason} An override was supplied but does not apply to a ${lookup.outcome} outcome.` };
    }
    if (override.newEvidenceIds.length === 0) {
      return { ...lookup, reason: `${lookup.reason} Override REFUSED: it cites no new evidence, and disagreement is not evidence.` };
    }
    if (override.rationale.trim().length === 0) {
      return { ...lookup, reason: `${lookup.reason} Override REFUSED: an override with no stated rationale is not auditable.` };
    }
    return {
      ...lookup,
      outcome: 'ALLOW_WITH_TAG',
      reason: `Override by ${override.authorizedBy}: ${override.rationale} (new evidence: ${override.newEvidenceIds.join(', ')}). The original falsification stays on record.`,
    };
  }
}

/** Same domain AND same assumption set: change either and the old verdict no longer speaks to the new question. */
function sameScope(a: FalsifiedModelScope, b: FalsifiedModelScope): boolean {
  if (a.domain !== b.domain) return false;
  const left = [...a.assumptions].sort();
  const right = [...b.assumptions].sort();
  return left.length === right.length && left.every((v, i) => v === right[i]);
}

/** One deterministic fingerprint over the whole registry, in write order, for replay. */
export function registryFingerprint(registry: FalsifiedModelRegistry): string {
  return fnv1a(canonicalJson(registry.all().map((r) => r.fingerprint)));
}
