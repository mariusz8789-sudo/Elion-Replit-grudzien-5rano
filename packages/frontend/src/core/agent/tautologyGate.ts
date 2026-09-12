/**
 * TAUTOLOGY / CIRCULARITY GATE.
 *
 * Answers exactly one question, orthogonal to every other axis this repo
 * already has (see `docs/TAUTOLOGY_GATE_AUDIT.md`):
 *
 *   "Does this measurement/prediction pair carry independent information, or
 *    is it logically/circularly tied to the very thing it claims to test?"
 *
 * This is NOT `NO_DISCRIMINATING_PROBE` (`inquiryLoop.ts`): that asks whether
 * a genuinely independent experiment happens to give every surviving
 * hypothesis the same answer at ONE setting. This module asks whether the
 * experiment could EVER have given a different answer, by construction —
 * `entanglementInquiry.ts`'s QE1 Tsirelson-bound case (§1.1 of the audit): no
 * candidate visibility, no probe setting, and no run of
 * `quantum-entanglement-measures` could ever produce a CHSH value above 2√2,
 * because that bound is an analytic ceiling of the algebra the model
 * computes, not a fact any run discovers. A source at whiteNoise=1 (QE1's
 * OTHER not-yet-informative case) is the opposite: a real, independent
 * physical setting that happens to erase the signal THIS TIME — every other
 * setting in the candidate list does discriminate, so that is
 * non-discrimination, not circularity. Conflating the two would make a
 * broken probe choice look like a broken experiment design, or worse, let a
 * genuinely circular "test" pass as science because it also failed to
 * discriminate for an unrelated reason.
 *
 * ## Zero heuristics on raw numbers
 *
 * This module never looks at whether two computed values happen to be equal,
 * close, or correlated — that is exactly the "looks similar -> tautology"
 * heuristic §6 of the brief forbids, and it would misclassify the ENTIRE
 * QE1-3 real parameter-fitting exercise: a hypothesis's prediction and the
 * system's real measurement legitimately DO come from the same solver
 * (`quantum-entanglement-measures`) and can legitimately coincide at some
 * probe settings (that is what `NO_DISCRIMINATING_PROBE` is for) without the
 * experiment being circular. Classification here is a total function of
 * DECLARED, STRUCTURAL metadata about where a value came from
 * (`ObservableDerivation`) — supplied by whoever designed the experiment
 * (e.g. `entanglementInquiry.ts`), never inferred from its numeric output.
 * Undeclared derivation is UNTESTABLE, never guessed into either direction.
 *
 * ## No new engine, no new epistemic dictionary
 *
 * `assessTautology` is a pure function over plain data. It does not touch
 * `SavedExperiment`, evidence packs, provenance, replay or belief revision —
 * it produces one classification a caller (e.g. `inquiryLoop.ts`) reads to
 * decide whether a measurement may move confidence, using the EXISTING
 * `evidenceMagnitude` knob `beliefRevision.ts::updateConfidence` already
 * has (magnitude 0 leaves confidence unchanged — see that module). See
 * `docs/TAUTOLOGY_GATE_AUDIT.md` §2 for the explicit mapping of this gate
 * against every existing epistemic vocabulary it deliberately does not
 * replace.
 */

export type TautologyClassification = 'CONSISTENCY_CHECK' | 'EMPIRICAL_TEST' | 'MIXED_TEST' | 'UNTESTABLE';

/** The three, and only three, honest answers to "where did this number come from". */
export type ObservableSource =
  /**
   * Mathematically forced by the model's own formalism/accepted ansatz, for
   * EVERY input in its declared domain — not something any run could vary.
   * C3 (analytically guaranteed constraint, e.g. the Tsirelson bound) and C4
   * (assumption-bound test, e.g. an MPS bounded-χ area law) are the same
   * structural fact from two angles: the bound holds because of what the
   * model IS, not because of what it was fed.
   */
  | 'model-invariant'
  /**
   * Computed by running the shared solver on ONE hypothesis's own claimed
   * parameter values (or the system's real hidden ones). Genuinely varies
   * across the declared hypothesis space — this is what makes QE1-3's real
   * parameter inquiries legitimate (simulated) experiments rather than
   * circular ones, even though prediction and measurement share a model id.
   */
  | 'hypothesis-parameter'
  /**
   * Produced by a channel that shares no code path or free parameters with
   * whatever produced the prediction — a different model, a real dataset, an
   * external observation. C5: independence must be an explicit declaration
   * here, never inferred from "these two numbers differ" or "these two
   * functions look different".
   */
  | 'independent-measurement';

export interface ObservableDerivation {
  readonly source: ObservableSource;
  /** The model/solver (or dataset id, for `independent-measurement`) that produced this value. */
  readonly modelId: string;
  /** WHY this source classification is honest — the audit trail a report or UI can quote verbatim. */
  readonly rationale: string;
}

/** One prediction/observation pair to classify. `MIXED_TEST` (C6) is what happens when several components disagree in classification. */
export interface TautologyComponent {
  readonly componentId: string;
  /** `null` when the caller genuinely does not know — see UNTESTABLE below. Never defaulted to a guessed value. */
  readonly prediction: ObservableDerivation | null;
  readonly observation: ObservableDerivation | null;
  /**
   * C2 — set ONLY when the "observation" was read back from the literal same
   * computed output the prediction itself used (e.g. asserting a
   * normalization identity against values that were normalized to satisfy
   * it). Stronger and narrower than `model-invariant`: this is about run
   * IDENTITY, not formalism identity, and fires even when both derivations
   * are otherwise `hypothesis-parameter`.
   */
  readonly derivedFromSameComputation?: boolean;
}

export interface TautologyComponentAssessment {
  readonly componentId: string;
  readonly classification: 'CONSISTENCY_CHECK' | 'EMPIRICAL_TEST' | 'UNTESTABLE';
  readonly reasons: readonly string[];
}

export interface TautologyAssessment {
  readonly classification: TautologyClassification;
  /** Every component's reasons, concatenated — the full audit trail for a report or UI. */
  readonly reasons: readonly string[];
  /** Per-component breakdown — what MIXED_TEST is actually made of, named rather than averaged away. */
  readonly components: readonly TautologyComponentAssessment[];
}

function assessComponent(component: TautologyComponent): TautologyComponentAssessment {
  const { componentId, prediction, observation, derivedFromSameComputation } = component;

  if (prediction === null || observation === null) {
    return {
      componentId,
      classification: 'UNTESTABLE',
      reasons: [
        `Derivation of ${prediction === null ? 'the prediction' : 'the observation'} was not declared. ` +
          'Classifying this as testable without that fact would be a guess, not a determination — see the gate\'s own "zero heuristics on raw numbers" rule.',
      ],
    };
  }

  const consistencyReasons: string[] = [];
  if (derivedFromSameComputation) {
    consistencyReasons.push(
      `C2 — the observation was read back from the SAME computed output the prediction itself used (${prediction.modelId}); comparing a value to itself proves nothing about the world.`,
    );
  }
  if (prediction.source === 'model-invariant') {
    consistencyReasons.push(
      `C3/C4 — the prediction is asserted to be an analytic/assumption-bound invariant of ${prediction.modelId}'s own formalism (${prediction.rationale}): no input in this model's declared domain could make it come out otherwise, so no run tests it.`,
    );
  }
  if (observation.source === 'model-invariant') {
    consistencyReasons.push(
      `C3/C4 — the observation is likewise asserted to be an analytic/assumption-bound invariant of ${observation.modelId}'s own formalism (${observation.rationale}).`,
    );
  }
  // C1 ("same derivation source, no independent channel") is not a fourth
  // check here — it is structurally subsumed by the three-way `source` enum
  // itself. There is no lazy default: a caller MUST pick 'model-invariant'
  // (C3/C4, handled above), 'independent-measurement' (C5, handled below) or
  // explicitly claim 'hypothesis-parameter' — and that claim already IS the
  // honest assertion "this value genuinely varies with which hypothesis is
  // true", which is exactly what makes a same-model pairing (QE1-3's real
  // parameter inquiries) non-circular. A caller cannot reach EMPIRICAL_TEST
  // by omission; only by declaring one of the two things that justify it.

  if (consistencyReasons.length > 0) {
    return { componentId, classification: 'CONSISTENCY_CHECK', reasons: consistencyReasons };
  }

  const empiricalReasons: string[] =
    observation.source === 'independent-measurement'
      ? [`C5 — the observation is explicitly registered as an independent channel (${observation.rationale}), separate from whatever produced the prediction.`]
      : [`The observation genuinely varies with which hypothesis is true (${observation.rationale}), so agreement or disagreement with the prediction carries information.`];
  return { componentId, classification: 'EMPIRICAL_TEST', reasons: empiricalReasons };
}

/**
 * Classifies one experiment from its declared components. A single-component
 * list is the common case (one prediction, one observable — e.g. an
 * `inquiryLoop.ts` system's `observedMetric`); several components is how a
 * genuinely `MIXED_TEST` (C6) is expressed — part of the claim is
 * consistency-only, part is independently measured, and this reports both,
 * naming which is which, rather than averaging them into one number.
 */
export function assessTautology(components: readonly TautologyComponent[]): TautologyAssessment {
  if (components.length === 0) {
    return { classification: 'UNTESTABLE', reasons: ['No component was supplied to assess.'], components: [] };
  }
  const assessed = components.map(assessComponent);
  const reasons = assessed.flatMap((a) => a.reasons);
  const classifications = new Set(assessed.map((a) => a.classification));

  if (classifications.size === 1) {
    return { classification: [...classifications][0], reasons, components: assessed };
  }
  if (classifications.has('CONSISTENCY_CHECK') && classifications.has('UNTESTABLE') && !classifications.has('EMPIRICAL_TEST')) {
    // A consistency-only part plus an unknown part: no CONFIRMED empirical
    // component exists, so this cannot honestly be called MIXED_TEST — that
    // would silently promise evidence nobody has established.
    return {
      classification: 'UNTESTABLE',
      reasons: [...reasons, 'At least one component could not be classified and none was confirmed empirical — the mixture cannot be called MIXED_TEST without guessing.'],
      components: assessed,
    };
  }
  if (classifications.has('CONSISTENCY_CHECK') && classifications.has('EMPIRICAL_TEST')) {
    return { classification: 'MIXED_TEST', reasons, components: assessed };
  }
  // Only remaining combination: EMPIRICAL_TEST + UNTESTABLE. The confirmed
  // empirical component is real evidence; the untestable one just contributes
  // nothing — reported plainly via `components`, not folded into a downgrade.
  return { classification: 'EMPIRICAL_TEST', reasons, components: assessed };
}

/** Convenience for the common single-component case. */
export function assessSingleTautology(component: TautologyComponent): TautologyAssessment {
  return assessTautology([component]);
}

/**
 * The maximum evidence magnitude a classification may ever contribute to a
 * confidence update — the one function a caller needs to honor "a
 * consistency check must never raise scientific confidence" (see the audit's
 * §2.1/§11) without re-deriving the rule itself. `null` means uncapped.
 *
 * `MIXED_TEST` returns `null` deliberately: an aggregate cap would either
 * throw away the real empirical component or let the tautological one leak
 * through, and this gate exists precisely to keep those two apart. A caller
 * with a mixed result must consult `TautologyAssessment.components` and cap
 * each one individually.
 */
export function evidenceCeiling(classification: TautologyClassification): number | null {
  switch (classification) {
    case 'CONSISTENCY_CHECK':
      return 0;
    case 'UNTESTABLE':
      return 0;
    case 'EMPIRICAL_TEST':
      return null;
    case 'MIXED_TEST':
      return null;
  }
}
