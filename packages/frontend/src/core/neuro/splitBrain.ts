/**
 * VIRTUAL SPLIT-BRAIN — a TOY simulator of the classic commissurotomy
 * paradigms (hemifield routing, lateralised response channels, the left-
 * hemisphere interpreter).
 *
 * =========================== WHAT THIS IS =============================
 *
 * A mechanism toy. Given a stimulus in a visual hemifield and a callosum
 * that is intact or severed, it produces the response channels the classic
 * paradigms read out: verbal report (left hemisphere), left hand (right
 * hemisphere), right hand (left hemisphere).
 *
 * The routing rule it implements is ordinary visual anatomy: fibres from the
 * left visual field of BOTH eyes project to the RIGHT hemisphere, and vice
 * versa. Splitting the corpus callosum does not change that routing; it
 * removes the channel by which the two hemispheres would otherwise share what
 * each received. That single fact produces the whole classic pattern, which is
 * why a toy this small reproduces it.
 *
 * ========================= WHAT THIS IS NOT ===========================
 *
 * NOT a clinical model. NOT a model of any patient. NOT evidence about
 * consciousness — see `splitBrainExperiments.ts`, which refuses to adjudicate
 * that question and says why in machine-checkable form.
 *
 * The distinction that matters: this simulator IMPLEMENTS the canonical
 * disconnection account. Anything it "shows" about that account is a
 * restatement of its own source code. It can be used to explore what the
 * canonical account PREDICTS. It cannot be used to decide whether the
 * canonical account is TRUE.
 *
 * ========================== PROVENANCE ================================
 *
 * The literature entries below are UNPINNED: this runtime has no egress, so
 * no byte of any cited source was retrieved or hashed. They are labels for
 * where the paradigms come from, and they are marked as such rather than
 * dressed up as citations Genesis has verified.
 */

/** SIMULATION-only label. `clinical` and `canAdjudicateConsciousness` are both false, permanently. */
export const SPLIT_BRAIN_LABEL = Object.freeze({
  epistemic: 'SIMULATION' as const,
  class: 'TOY' as const,
  clinical: false as const,
  /**
   * Hard-wired false. The simulator implements one of the competing accounts,
   * so using it to adjudicate between them would be circular. See
   * `probeCircularity` for the mechanical demonstration.
   */
  canAdjudicateConsciousness: false as const,
  provenance: Object.freeze([
    Object.freeze({ id: 'sperry-commissurotomy', claim: 'hemispheric specialisation for speech; each hemisphere with its own perceptual domain after commissurotomy', source: 'Sperry, split-brain studies 1959-1968; Nobel Prize in Physiology or Medicine 1981', pinned: false }),
    Object.freeze({ id: 'gazzaniga-interpreter', claim: 'left-hemisphere interpreter: narrative completion of information the speaking hemisphere did not receive', source: 'Gazzaniga, interpreter account', pinned: false }),
    Object.freeze({ id: 'pinto-2017', claim: 'divided perception without divided consciousness; patients respond accurately across the whole visual field', source: 'Pinto et al. 2017, Brain', pinned: false }),
  ]),
  pinStatus: 'NOT_PINNED — no egress in this runtime; no source byte was retrieved or hashed',
});

export interface SplitBrainConfig {
  /** false = commissurotomy. The one lever the classic paradigms manipulate. */
  readonly callosumIntact: boolean;
  readonly interpreterEnabled: boolean;
}

export type VisualField = 'LVF' | 'RVF' | 'BILATERAL';

export interface Stimulus {
  readonly content: string;
  readonly field: VisualField;
  readonly kind: 'word' | 'face' | 'object';
}

export interface Hemispheres {
  readonly LH: readonly string[];
  readonly RH: readonly string[];
}

/**
 * Anatomy first, then the callosum. LVF projects to RH and RVF to LH in every
 * configuration — severing the callosum does NOT reroute vision. With the
 * callosum intact the hemispheres share what each received, which is why the
 * intact control shows no asymmetry and is the falsification hook for the
 * whole toy: if an intact run ever produced the split pattern, the simulator
 * would be wrong on its own terms.
 */
export function routeStimulus(stimulus: Stimulus, config: SplitBrainConfig): Hemispheres {
  let lh: string[] = [];
  let rh: string[] = [];
  if (stimulus.field === 'LVF') rh = [stimulus.content];
  else if (stimulus.field === 'RVF') lh = [stimulus.content];
  else { lh = [stimulus.content]; rh = [stimulus.content]; }

  if (config.callosumIntact) {
    const shared = [...new Set([...lh, ...rh])];
    return Object.freeze({ LH: Object.freeze(shared), RH: Object.freeze([...shared]) });
  }
  return Object.freeze({ LH: Object.freeze(lh), RH: Object.freeze(rh) });
}

/** Routes several stimuli at once, so chimeric presentations need no special case. */
export function routeStimuli(stimuli: readonly Stimulus[], config: SplitBrainConfig): Hemispheres {
  const lh: string[] = [];
  const rh: string[] = [];
  for (const stimulus of stimuli) {
    const routed = routeStimulus(stimulus, config);
    for (const item of routed.LH) if (!lh.includes(item)) lh.push(item);
    for (const item of routed.RH) if (!rh.includes(item)) rh.push(item);
  }
  return Object.freeze({ LH: Object.freeze(lh), RH: Object.freeze(rh) });
}

export interface ResponseChannels {
  /** Speech is produced by the left hemisphere, so it reports only what LH holds. */
  readonly verbal: string | null;
  /** Left hand is controlled by the right hemisphere. */
  readonly leftHand: string | null;
  /** Right hand is controlled by the left hemisphere — same source as speech. */
  readonly rightHand: string | null;
  readonly interpreterNarrative: string | null;
  /**
   * True when the narrative asserts content the speaking hemisphere never
   * received. The flag is DERIVED from that gap, never set by a caller.
   */
  readonly confabulation: boolean;
}

/**
 * Reads the response channels off the hemispheres.
 *
 * The interpreter fires exactly when the left hemisphere lacks content that
 * the right hemisphere acted on — that gap is the mechanism, not a mood. With
 * the callosum intact the gap cannot arise, so the interpreter never fires,
 * which is what makes the intact control a real control.
 */
export function respond(hemispheres: Hemispheres, config: SplitBrainConfig): ResponseChannels {
  const verbal = hemispheres.LH.length > 0 ? hemispheres.LH.join('+') : null;
  const leftHand = hemispheres.RH.length > 0 ? hemispheres.RH.join('+') : null;
  const rightHand = verbal;

  const lhLacksWhatRhHas = hemispheres.RH.some((item) => !hemispheres.LH.includes(item));
  let interpreterNarrative: string | null = null;
  let confabulation = false;
  if (config.interpreterEnabled && lhLacksWhatRhHas && leftHand !== null) {
    const unseen = hemispheres.RH.filter((item) => !hemispheres.LH.includes(item)).join('+');
    interpreterNarrative = `I did not see anything on that side; I suppose it was ${unseen}.`;
    confabulation = true;
  }

  return Object.freeze({ verbal, leftHand, rightHand, interpreterNarrative, confabulation });
}
