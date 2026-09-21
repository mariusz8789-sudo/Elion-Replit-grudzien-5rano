import { fitModelSpec, type ModelBasis, type ModelPoint, type ModelSpec } from './modelSpace';

/**
 * INTEGRITY GATES (F2/F5) — GOVERNMENT RESEARCH MODE.
 *
 * Every gate in this file FLAGS a suspect derivation; NONE of them blocks it.
 * That is a deliberate policy decision, not an oversight: this engine's job is
 * to find and report the truth, including when the process that reached it is
 * methodologically questionable. A gate that silently refused a model would
 * hide that judgement call inside the engine instead of putting it in front of
 * whoever reads the campaign's result — so instead, every violation this file
 * detects is recorded with its reason and provenance, stays visible on the
 * model's own round record, and the model remains live and analyzable.
 *
 * Concretely: POLICY MAY LIMIT ACTION, NOT TRUTH. Hard blocking belongs to a
 * future Government Action / Safety / Authorization layer, not to this
 * Research engine. The one standing exception, deliberately NOT in this file,
 * is `discoveryCampaign.ts`'s exact-fingerprint duplicate rejection: refusing
 * to re-register a model already live is harmless deduplication, not
 * suppressed science, so it stays a hard admission check rather than a flag.
 *
 * Flags never invent new epistemic-status or confidence math: no existing
 * mechanism in `beliefRevision.ts` accounts for "derived under a suspect
 * process", so these flags are recorded and surfaced, and nothing else. When
 * a future contract does provide for it, that adjustment belongs where the
 * contract lives, not fabricated here to fill the gap.
 */

export const INTEGRITY_GATES_CONTRACT_VERSION = '1.0.0';

export type IntegrityGate = 'TEMPORAL_LINEAGE' | 'EXCLUDED_BASIS_SMUGGLING';

export interface IntegrityFlag {
  readonly gate: IntegrityGate;
  readonly modelFingerprint: string;
  readonly round: number;
  readonly reason: string;
}

/**
 * Temporal gate (F2/F5-1). The rule: a model derived FROM a residual may only
 * be said to exist AFTER the observation that produced that residual —
 * `createdAt(newModel) > observationAt(residual)` — and must carry lineage
 * naming that observation as its source, so a pre-generated/pre-registered
 * model cannot pass itself off as a post-observation discovery.
 *
 * This engine's real clock is the round counter, not a wall-clock timestamp:
 * every derived model's `enteredAtRound` and the round in which its
 * motivating residual was computed (`residualObservationRound`, the latest
 * round any currently-admitted observation entered by) are both genuine,
 * ordered facts about when they occurred. By construction a model can only be
 * derived from residuals computed on the CURRENTLY admitted set, so this
 * ordering already holds structurally; this function is the audit that would
 * catch it if that invariant were ever broken, not a check expected to fire
 * in the ordinary case.
 */
export function checkTemporalLineage(
  model: {
    readonly fingerprint: string;
    readonly derivedFrom: string | null;
    readonly derivationOperator: string | null;
    readonly enteredAtRound: number;
  },
  residualObservationRound: number,
  round: number,
): IntegrityFlag | null {
  // A model enumerated from the declared grammar (never derived) makes no
  // claim about "after observation" at all — nothing to check.
  if (model.derivedFrom === null) return null;
  if (model.derivationOperator === null) {
    return {
      gate: 'TEMPORAL_LINEAGE',
      modelFingerprint: model.fingerprint,
      round,
      reason: `Model claims derivation from ${model.derivedFrom} but records no derivation operator — lineage cannot certify createdAt(model) > observationAt(residual) without it.`,
    };
  }
  if (model.enteredAtRound <= residualObservationRound) {
    return {
      gate: 'TEMPORAL_LINEAGE',
      modelFingerprint: model.fingerprint,
      round,
      reason: `Model entered at round ${model.enteredAtRound}, not strictly after round ${residualObservationRound} in which its motivating observations were admitted — createdAt(model) > observationAt(residual) is not established.`,
    };
  }
  return null;
}

/**
 * Anti-smuggling / prereg gate (F2/F5-3), the "excluded basis reappears"
 * case. A laboratory's `excludeBases` freezes which structures are meaningful
 * at round 0 (e.g. LOG where x can be 0); residual-derived proposals
 * (`residualStructure.ts::proposeModelsFromResiduals`) pick their candidate
 * terms from a fixed, small list keyed only to the residual FINDING, not to
 * that frozen exclusion list — so a derived model CAN legitimately end up
 * carrying a basis the campaign explicitly excluded at the start. Flagged,
 * not rejected: the model may still be exactly what the data supports: this
 * records that its grammar reintroduced something the campaign's own frozen
 * rules said was meaningless here, so a reader can judge it accordingly.
 */
export function checkExcludedBasisSmuggling(
  spec: ModelSpec,
  excludeBases: readonly ModelBasis[] | undefined,
  fingerprint: string,
  round: number,
): IntegrityFlag | null {
  if (!excludeBases || excludeBases.length === 0) return null;
  const excluded = new Set(excludeBases);
  const smuggled = [...new Set(spec.terms.filter((t) => excluded.has(t.basis)).map((t) => t.basis))];
  if (smuggled.length === 0) return null;
  return {
    gate: 'EXCLUDED_BASIS_SMUGGLING',
    modelFingerprint: fingerprint,
    round,
    reason: `Model contains ${smuggled.join(', ')}, which this campaign's frozen grammar excluded (excludeBases) from the start — reintroduced via a residual-derived proposal, which selects candidate terms by residual finding and does not re-check the frozen exclusion list.`,
  };
}

/**
 * Hold-out diagnostic (F2/F5-6 + F2/F5-7). Additive and read-only: it does
 * NOT replace, narrow, or influence the campaign's real fit/ranking, which
 * still uses every admitted point exactly as before. It fits `spec` a SECOND
 * time, on every admitted point EXCEPT the most recently admitted one, and
 * reports how far that held-out point's real, later observation fell from
 * what the reduced fit would have predicted — a genuine held-out check kept
 * strictly separate from the fit that actually selects and ranks models.
 *
 * `method` is F2/F5-7's "seed in provenance": a disclosed, FIXED split
 * identifier rather than a random seed. This engine's fit is exact,
 * deterministic weighted least squares with no RNG anywhere in it — inventing
 * a random seed for a process that has no randomness to seed would itself be
 * fabricated precision. What real provenance means here is disclosing HOW the
 * split was chosen, so `method` names that rule (leave-the-latest-admission
 * out) rather than a number nothing downstream ever uses.
 */
export const HOLDOUT_SPLIT_METHOD = 'LEAVE_LAST_ADMITTED_OUT_V1';

export interface HoldoutDiagnostic {
  readonly method: string;
  readonly heldOutX: number;
  /** Null when the reduced fit itself failed (e.g. underdetermined without the held-out point) — an honest "cannot assess", not a fabricated value. */
  readonly standardizedResidual: number | null;
}

export function holdoutDiagnostic(spec: ModelSpec, admitted: readonly ModelPoint[]): HoldoutDiagnostic | null {
  if (admitted.length < 2) return null;
  const heldOut = admitted[admitted.length - 1]!;
  const rest = admitted.slice(0, -1);
  const fit = fitModelSpec(spec, rest);
  if (!fit.ok) return { method: HOLDOUT_SPLIT_METHOD, heldOutX: heldOut.x, standardizedResidual: null };
  const predicted = fit.predict(heldOut.vars ?? heldOut.x);
  if (!Number.isFinite(predicted)) return { method: HOLDOUT_SPLIT_METHOD, heldOutX: heldOut.x, standardizedResidual: null };
  return {
    method: HOLDOUT_SPLIT_METHOD,
    heldOutX: heldOut.x,
    standardizedResidual: (heldOut.y - predicted) / Math.max(heldOut.sigma, 1e-12),
  };
}
