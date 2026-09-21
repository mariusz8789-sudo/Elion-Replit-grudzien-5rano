/**
 * VIRTUAL SPLIT-BRAIN — negative-first. The tests that matter are the ones
 * that would fail if the toy started claiming more than it can support.
 */
import { describe, expect, it } from 'vitest';

import { respond, routeStimulus, SPLIT_BRAIN_LABEL } from '../core/neuro/splitBrain';
import {
  adjudicateConsciousness,
  checkToyConsistency,
  CONSCIOUSNESS_HYPOTHESES,
  INTACT,
  probeCircularity,
  runChimeric,
  runInterpreterAction,
  runLateralisedWord,
  SEVERED,
  SEVERED_NO_INTERPRETER,
} from '../core/neuro/splitBrainExperiments';

describe('split-brain toy — the classic paradigms', () => {
  it('severed + LVF: nothing spoken, the left hand knows, the interpreter fills the gap', () => {
    const r = runLateralisedWord('KEY', 'LVF', SEVERED);
    expect(r.verbal).toBeNull();
    expect(r.leftHand).toBe('KEY');
    expect(r.confabulation).toBe(true);
    expect(r.interpreterNarrative).toContain('KEY');
  });

  it('severed + RVF: spoken normally, nothing to confabulate', () => {
    const r = runLateralisedWord('KEY', 'RVF', SEVERED);
    expect(r.verbal).toBe('KEY');
    expect(r.rightHand).toBe('KEY');
    expect(r.confabulation).toBe(false);
  });

  it('chimeric HE|ART while severed: speech reports ART, the left hand points to HE', () => {
    const r = runChimeric('HE', 'ART', SEVERED);
    expect(r.verbal).toBe('ART');
    expect(r.leftHand).toBe('HE');
  });

  it('chimeric while INTACT reaches both hemispheres — the branch the proposal could not reach', () => {
    const r = runChimeric('HE', 'ART', INTACT);
    expect(r.verbal).toBe(r.leftHand);
    expect(r.verbal).toContain('HE');
    expect(r.verbal).toContain('ART');
    expect(r.confabulation).toBe(false);
  });

  it('the intact control removes the asymmetry — the toy\'s falsification hook', () => {
    const r = runLateralisedWord('KEY', 'LVF', INTACT);
    expect(r.verbal).toBe('KEY');
    expect(r.leftHand).toBe('KEY');
    expect(r.confabulation).toBe(false);
  });

  it('an action by the right hemisphere is narrated by a hemisphere that never received it', () => {
    const r = runInterpreterAction('pick-apple', SEVERED);
    expect(r.verbal).toBeNull();
    expect(r.confabulation).toBe(true);
    expect(r.interpreterNarrative).toContain('pick-apple');
  });

  it('lesioning the interpreter removes the narrative but NOT the dissociation', () => {
    const r = runLateralisedWord('KEY', 'LVF', SEVERED_NO_INTERPRETER);
    expect(r.interpreterNarrative).toBeNull();
    expect(r.confabulation).toBe(false);
    expect(r.verbal).toBeNull();
    expect(r.leftHand).toBe('KEY');
  });

  it('severing the callosum does not reroute vision — LVF still reaches RH', () => {
    for (const config of [SEVERED, INTACT]) {
      expect(routeStimulus({ content: 'X', field: 'LVF', kind: 'word' }, config).RH).toContain('X');
    }
  });

  it('confabulation is derived from the gap, never settable by a caller', () => {
    const noGap = respond({ LH: ['A'], RH: ['A'] }, SEVERED);
    expect(noGap.confabulation).toBe(false);
    const gap = respond({ LH: [], RH: ['A'] }, SEVERED);
    expect(gap.confabulation).toBe(true);
  });
});

describe('split-brain toy — what it refuses to conclude', () => {
  it('every consciousness verdict is NOT_ADJUDICABLE, and none is a hardcoded SUPPORTED/CONTRADICTED', () => {
    const verdicts = adjudicateConsciousness();
    expect(verdicts).toHaveLength(2);
    for (const v of verdicts) expect(v.verdict).toBe('NOT_ADJUDICABLE_BY_THIS_SIMULATION');
    expect(verdicts.map((v) => v.hypothesisId).sort()).toEqual(['CANONICAL_SPLIT_CONSCIOUSNESS', 'PINTO_UNIFIED_CONSCIOUSNESS']);
  });

  it('BOTH sides of the dispute are carried, neither is deleted', () => {
    expect(CONSCIOUSNESS_HYPOTHESES).toHaveLength(2);
    for (const h of CONSCIOUSNESS_HYPOTHESES) expect(h.whyThisSimulationCannotDecide.length).toBeGreaterThan(20);
  });

  it('the circularity is demonstrated, not merely asserted: the probe follows the config switch', () => {
    const probe = probeCircularity();
    expect(probe.determinedByConfigAlone).toBe(true);
    expect(probe.underSevered).not.toBe(probe.underIntact);
  });

  it('the simulator is permanently barred from adjudicating consciousness', () => {
    expect(SPLIT_BRAIN_LABEL.canAdjudicateConsciousness).toBe(false);
    expect(SPLIT_BRAIN_LABEL.clinical).toBe(false);
    expect(SPLIT_BRAIN_LABEL.epistemic).toBe('SIMULATION');
    expect(SPLIT_BRAIN_LABEL.class).toBe('TOY');
  });

  it('provenance is labelled UNPINNED rather than dressed up as verified citation', () => {
    expect(SPLIT_BRAIN_LABEL.pinStatus).toContain('NOT_PINNED');
    for (const entry of SPLIT_BRAIN_LABEL.provenance) expect(entry.pinned).toBe(false);
  });
});

describe('split-brain toy — self-consistency', () => {
  it('all four internal checks hold', () => {
    for (const check of checkToyConsistency()) expect(check.holds, `${check.name}: ${check.detail}`).toBe(true);
  });
});
