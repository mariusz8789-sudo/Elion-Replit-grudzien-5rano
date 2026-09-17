/**
 * VIRTUAL SPLIT-BRAIN — the classic paradigms, plus a refusal.
 *
 * ================== WHAT WAS CHANGED IN THE PROPOSAL ==================
 *
 * The reviewed package shipped a `CONSCIOUSNESS_ARENA` whose verdicts were
 * STRING LITERALS: the canonical account frozen as `'CONTRADICTED'`, the Pinto
 * account as `'SUPPORTED'`. Nothing computed them. That is a verdict asserted
 * rather than derived — the same defect class as writing `winner = candidate`
 * — and it would have had Genesis publish an adjudication of a live scientific
 * dispute on the authority of a toy that contains no evidence about it.
 *
 * It is also circular in a way worth stating precisely, because the
 * circularity is mechanical rather than philosophical. `splitBrain.ts`
 * implements the canonical disconnection account. Its output under any probe
 * is a deterministic function of `callosumIntact` — a switch WE set. So the
 * "evidence" the arena would weigh is the input, restated. `probeCircularity`
 * demonstrates exactly this by flipping the switch and showing the verdict
 * follow it.
 *
 * The honest verdict for BOTH accounts is therefore
 * `NOT_ADJUDICABLE_BY_THIS_SIMULATION`, and it is computed, not typed.
 *
 * What the simulator IS good for stands unchanged: running the paradigms,
 * seeing what the canonical account predicts, and using the intact control as
 * a falsification hook on the toy itself.
 */
import {
  respond,
  routeStimuli,
  routeStimulus,
  SPLIT_BRAIN_LABEL,
  type ResponseChannels,
  type SplitBrainConfig,
  type VisualField,
} from './splitBrain';

export const SEVERED: SplitBrainConfig = Object.freeze({ callosumIntact: false, interpreterEnabled: true });
export const INTACT: SplitBrainConfig = Object.freeze({ callosumIntact: true, interpreterEnabled: true });
/** Interpreter lesioned: isolates how much of the pattern the interpreter is responsible for. */
export const SEVERED_NO_INTERPRETER: SplitBrainConfig = Object.freeze({ callosumIntact: false, interpreterEnabled: false });

/** Single lateralised word — the Sperry hemifield paradigm. */
export function runLateralisedWord(word: string, field: VisualField, config: SplitBrainConfig): ResponseChannels {
  return respond(routeStimulus({ content: word, field, kind: 'word' }, config), config);
}

/**
 * Chimeric presentation (the "HE|ART" paradigm): two different strings, one per
 * hemifield, shown at once. Routed through `routeStimuli` rather than a nested
 * ternary — the reviewed version's condition was always truthy, so its second
 * branch was unreachable and the intact case was handled by accident.
 */
export function runChimeric(lvf: string, rvf: string, config: SplitBrainConfig): ResponseChannels {
  return respond(routeStimuli([
    { content: lvf, field: 'LVF', kind: 'word' },
    { content: rvf, field: 'RVF', kind: 'word' },
  ], config), config);
}

/** The right hemisphere acts; the speaking hemisphere must account for an action it did not originate. */
export function runInterpreterAction(rightHemisphereAction: string, config: SplitBrainConfig): ResponseChannels {
  return respond(Object.freeze({ LH: Object.freeze([]), RH: Object.freeze([rightHemisphereAction]) }), config);
}

/** Whole-field probe: the Pinto-style test in which the patient responds across the entire visual field. */
export function runWholeFieldProbe(content: string, config: SplitBrainConfig): ResponseChannels {
  return respond(routeStimulus({ content, field: 'BILATERAL', kind: 'object' }, config), config);
}

// ---------------------------------------------------------------------------
// ADJUDICATION — derived, and the derivation says no.
// ---------------------------------------------------------------------------

export type ConsciousnessHypothesisId = 'CANONICAL_SPLIT_CONSCIOUSNESS' | 'PINTO_UNIFIED_CONSCIOUSNESS';

export type AdjudicationVerdict = 'SUPPORTED' | 'CONTRADICTED' | 'NOT_ADJUDICABLE_BY_THIS_SIMULATION';

export interface ConsciousnessHypothesis {
  readonly id: ConsciousnessHypothesisId;
  readonly prediction: string;
  readonly whyThisSimulationCannotDecide: string;
}

export const CONSCIOUSNESS_HYPOTHESES: readonly ConsciousnessHypothesis[] = Object.freeze([
  Object.freeze({
    id: 'CANONICAL_SPLIT_CONSCIOUSNESS' as const,
    prediction: 'commissurotomy yields two independent conscious agents',
    whyThisSimulationCannotDecide:
      'the simulator implements the disconnection account it would be tested against, so agreement is a property of the source code',
  }),
  Object.freeze({
    id: 'PINTO_UNIFIED_CONSCIOUSNESS' as const,
    prediction: 'one conscious agent, divided perception',
    whyThisSimulationCannotDecide:
      'the simulator has no representation of an agent or of unity at all; it maps stimuli to response channels, and no arrangement of those channels measures either',
  }),
]);

export interface CircularityProbe {
  /** The observation an adjudicator would weigh. */
  readonly observation: string;
  readonly underSevered: string;
  readonly underIntact: string;
  /** True when the observation tracks the config switch rather than any evidence. */
  readonly determinedByConfigAlone: boolean;
}

/**
 * Demonstrates the circularity instead of asserting it: run the discriminating
 * probe under both configurations. If the output follows `callosumIntact`, then
 * the "finding" is the input we supplied, and no verdict can be read off it.
 */
export function probeCircularity(): CircularityProbe {
  const severed = runWholeFieldProbe('lamp', SEVERED);
  const intact = runWholeFieldProbe('lamp', INTACT);
  const severedSignature = `verbal=${String(severed.verbal)}|leftHand=${String(severed.leftHand)}`;
  const intactSignature = `verbal=${String(intact.verbal)}|leftHand=${String(intact.leftHand)}`;
  const lateralisedSevered = runLateralisedWord('lamp', 'LVF', SEVERED);
  const lateralisedIntact = runLateralisedWord('lamp', 'LVF', INTACT);
  return Object.freeze({
    observation: 'response channels under a whole-field probe, and under a left-hemifield probe',
    underSevered: `${severedSignature} :: LVF verbal=${String(lateralisedSevered.verbal)}`,
    underIntact: `${intactSignature} :: LVF verbal=${String(lateralisedIntact.verbal)}`,
    // The lateralised probe flips with the switch; that flip IS the circularity.
    determinedByConfigAlone: lateralisedSevered.verbal !== lateralisedIntact.verbal,
  });
}

export interface ConsciousnessAdjudication {
  readonly hypothesisId: ConsciousnessHypothesisId;
  readonly verdict: AdjudicationVerdict;
  readonly reason: string;
  readonly circularity: CircularityProbe;
}

/**
 * Returns a verdict per hypothesis. Every branch that could return SUPPORTED or
 * CONTRADICTED is gated on `SPLIT_BRAIN_LABEL.canAdjudicateConsciousness`,
 * which is permanently false — so the function has no reachable path to either,
 * and a future edit that wanted one would have to change the label and trip the
 * test that pins it.
 */
export function adjudicateConsciousness(): readonly ConsciousnessAdjudication[] {
  const circularity = probeCircularity();
  return Object.freeze(CONSCIOUSNESS_HYPOTHESES.map((hypothesis) => Object.freeze({
    hypothesisId: hypothesis.id,
    verdict: (SPLIT_BRAIN_LABEL.canAdjudicateConsciousness
      ? 'SUPPORTED'
      : 'NOT_ADJUDICABLE_BY_THIS_SIMULATION') as AdjudicationVerdict,
    reason: hypothesis.whyThisSimulationCannotDecide,
    circularity,
  })));
}

// ---------------------------------------------------------------------------
// FALSIFICATION HOOK — the toy's own self-check.
// ---------------------------------------------------------------------------

export interface ToyConsistencyCheck {
  readonly name: string;
  readonly holds: boolean;
  readonly detail: string;
}

/**
 * Checks the simulator against the constraints it claims to obey. These can
 * FAIL: they compare runs against each other, and a wrong routing rule or a
 * leaking intact control breaks them.
 */
export function checkToyConsistency(): readonly ToyConsistencyCheck[] {
  const intactLvf = runLateralisedWord('KEY', 'LVF', INTACT);
  const severedLvf = runLateralisedWord('KEY', 'LVF', SEVERED);
  const severedRvf = runLateralisedWord('KEY', 'RVF', SEVERED);
  const noInterpreter = runLateralisedWord('KEY', 'LVF', SEVERED_NO_INTERPRETER);
  return Object.freeze([
    Object.freeze({
      name: 'intact callosum shows no hemifield asymmetry',
      holds: intactLvf.verbal === intactLvf.leftHand && intactLvf.confabulation === false,
      detail: `verbal=${String(intactLvf.verbal)} leftHand=${String(intactLvf.leftHand)} confabulation=${String(intactLvf.confabulation)}`,
    }),
    Object.freeze({
      name: 'severed + LVF: no verbal report, left hand knows',
      holds: severedLvf.verbal === null && severedLvf.leftHand === 'KEY',
      detail: `verbal=${String(severedLvf.verbal)} leftHand=${String(severedLvf.leftHand)}`,
    }),
    Object.freeze({
      name: 'severed + RVF: verbal report present, no confabulation',
      holds: severedRvf.verbal === 'KEY' && severedRvf.confabulation === false,
      detail: `verbal=${String(severedRvf.verbal)} confabulation=${String(severedRvf.confabulation)}`,
    }),
    Object.freeze({
      name: 'lesioning the interpreter removes the narrative but not the dissociation',
      holds: noInterpreter.interpreterNarrative === null && noInterpreter.leftHand === 'KEY' && noInterpreter.verbal === null,
      detail: `narrative=${String(noInterpreter.interpreterNarrative)} leftHand=${String(noInterpreter.leftHand)}`,
    }),
  ]);
}
