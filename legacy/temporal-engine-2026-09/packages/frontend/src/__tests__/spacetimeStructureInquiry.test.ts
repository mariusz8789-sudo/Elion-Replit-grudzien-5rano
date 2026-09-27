import { describe, expect, it } from 'vitest';
import {
  buildNextActionsFromSpacetimeInquiry,
  ESTABLISHED_SPACETIME_CONSTRAINTS,
  evaluateSpacetimeHypothesis,
  registerSpacetimeHypothesis,
  replaySpacetimeStructureInquiry,
  runSpacetimeStructureInquiry,
  saveSpacetimeStructureInquiryToMemory,
  SPACETIME_DEGREE_OF_FREEDOM_HYPOTHESES,
  type SpacetimeHypothesisCandidate,
} from '../core/discovery/physics/spacetimeStructureInquiry';

const BASE: SpacetimeHypothesisCandidate = {
  hypothesisId: 'H_TEST',
  statement: 'test',
  dependencies: [],
  assertsExtraDimensionExists: false,
  assertsTimeTravelIsPhysicallyPossible: false,
  claimsEinsteinRosenOmission: false,
  knownSupportingResults: [],
  counterevidence: [],
  pathologicalOrUnphysicalRequirements: [],
  unresolvedPoints: [],
  predictedConsequences: [],
  falsifyingObservation: 'not applicable to this test fixture',
  discriminatingTest: 'not applicable to this test fixture',
};

describe('spacetime structure inquiry — forbidden-premise guard', () => {
  it('refuses to register a hypothesis that asserts a fifth dimension exists', () => {
    expect(() => registerSpacetimeHypothesis({ ...BASE, assertsExtraDimensionExists: true })).toThrow(/fifth dimension exists/);
  });

  it('refuses to register a hypothesis that asserts time travel is physically possible', () => {
    expect(() => registerSpacetimeHypothesis({ ...BASE, assertsTimeTravelIsPhysicallyPossible: true })).toThrow(/time travel is physically possible/);
  });

  it('refuses to register a hypothesis that claims Einstein and Rosen omitted something', () => {
    expect(() => registerSpacetimeHypothesis({ ...BASE, claimsEinsteinRosenOmission: true })).toThrow(/omitted something/);
  });

  it('refuses a hypothesis that depends on an undeclared constraint', () => {
    expect(() => registerSpacetimeHypothesis({ ...BASE, dependencies: [{ constraintId: 'DOES_NOT_EXIST', relation: 'SUPPORTS' }] })).toThrow(/unknown constraint/i);
  });

  it('accepts a hypothesis that only explores an idea without asserting it', () => {
    expect(() => registerSpacetimeHypothesis(BASE)).not.toThrow();
  });
});

describe('spacetime structure inquiry — constraint-driven evaluation', () => {
  it('a hypothesis resting only on confirmed facts is CONSISTENT_WITH_ALL_CONFIRMED_OBSERVATIONS', () => {
    const result = evaluateSpacetimeHypothesis({
      ...BASE,
      dependencies: [{ constraintId: 'GR_4D_SUFFICIENT_FOR_CONFIRMED_OBSERVATIONS', relation: 'SUPPORTS' }],
    });
    expect(result.verdict).toBe('CONSISTENT_WITH_ALL_CONFIRMED_OBSERVATIONS');
  });

  it('a hypothesis resting on a THEORY-level constraint is SPECULATIVE_NOT_EXCLUDED', () => {
    const result = evaluateSpacetimeHypothesis({
      ...BASE,
      dependencies: [{ constraintId: 'EXTRA_DIMENSIONS_ARE_THEORETICAL_PROPOSAL', relation: 'SUPPORTS' }],
    });
    expect(result.verdict).toBe('SPECULATIVE_NOT_EXCLUDED');
  });

  it('a hypothesis that CONTRADICTS a FACT-level constraint is CONTRADICTS_ESTABLISHED_PHYSICS', () => {
    const result = evaluateSpacetimeHypothesis({
      ...BASE,
      dependencies: [{ constraintId: 'NO_CONFIRMED_DETECTION_OF_EXTRA_DIMENSIONS', relation: 'CONTRADICTS' }],
    });
    expect(result.verdict).toBe('CONTRADICTS_ESTABLISHED_PHYSICS');
  });

  it('a hypothesis depending on a named CONJECTURE is UNRESOLVED_OPEN_QUESTION', () => {
    const result = evaluateSpacetimeHypothesis({
      ...BASE,
      dependencies: [{ constraintId: 'CHRONOLOGY_PROTECTION_IS_CONJECTURE', relation: 'DEPENDS_ON_UNRESOLVED' }],
    });
    expect(result.verdict).toBe('UNRESOLVED_OPEN_QUESTION');
  });

  it('every declared constraint carries a real citable source string', () => {
    for (const c of ESTABLISHED_SPACETIME_CONSTRAINTS) {
      expect(c.source.length).toBeGreaterThan(0);
      expect(['FACT', 'THEORY', 'CONJECTURE']).toContain(c.status);
    }
  });

  it('declares the wormhole and quantum-gravity constraints used by the newer hypotheses', () => {
    const ids = ESTABLISHED_SPACETIME_CONSTRAINTS.map((c) => c.constraintId);
    expect(ids).toContain('WORMHOLE_SOLUTIONS_EXIST_MATHEMATICALLY');
    expect(ids).toContain('NO_CONFIRMED_QUANTUM_GRAVITY_THEORY');
  });
});

describe('spacetime structure inquiry — the five named candidate positions', () => {
  it('registers exactly five hypotheses, none asserting a forbidden premise, each carrying a full research profile', () => {
    expect(SPACETIME_DEGREE_OF_FREEDOM_HYPOTHESES).toHaveLength(5);
    for (const h of SPACETIME_DEGREE_OF_FREEDOM_HYPOTHESES) {
      expect(h.assertsExtraDimensionExists).toBe(false);
      expect(h.assertsTimeTravelIsPhysicallyPossible).toBe(false);
      expect(h.claimsEinsteinRosenOmission).toBe(false);
      expect(h.falsifyingObservation.length).toBeGreaterThan(0);
      expect(h.discriminatingTest.length).toBeGreaterThan(0);
      expect(Array.isArray(h.knownSupportingResults)).toBe(true);
      expect(Array.isArray(h.unresolvedPoints)).toBe(true);
    }
  });

  it('runs a full inquiry with one verdict per hypothesis, never a fabricated conclusion', () => {
    const result = runSpacetimeStructureInquiry();
    expect(result.evaluations).toHaveLength(5);
    const byId = new Map(result.evaluations.map((e) => [e.hypothesisId, e.verdict]));
    expect(byId.get('H_NO_EXTRA_DOF_REQUIRED')).toBe('CONSISTENT_WITH_ALL_CONFIRMED_OBSERVATIONS');
    expect(byId.get('H_EXTRA_DOF_THEORETICALLY_POSSIBLE_NOT_CONFIRMED')).toBe('SPECULATIVE_NOT_EXCLUDED');
    expect(byId.get('H_CHRONOLOGY_PROTECTION_HOLDS')).toBe('UNRESOLVED_OPEN_QUESTION');
    expect(byId.get('H_WORMHOLE_GEOMETRY_MATHEMATICALLY_POSSIBLE_NOT_TRAVERSABLE_IN_PRACTICE')).toBe('CONSISTENT_WITH_ALL_CONFIRMED_OBSERVATIONS');
    expect(byId.get('H_DEEPER_RECONCILING_MODEL_UNRESOLVED')).toBe('UNRESOLVED_OPEN_QUESTION');
  });

  it('never claims a fifth dimension or time travel exists in its own conclusion text', () => {
    const result = runSpacetimeStructureInquiry();
    expect(result.overallConclusion).toMatch(/asserts neither that a fifth dimension exists nor that time travel is possible/);
  });

  it('is deterministic across runs', () => {
    const a = runSpacetimeStructureInquiry();
    const b = runSpacetimeStructureInquiry();
    expect(a.resultFingerprint).toBe(b.resultFingerprint);
  });
});

describe('spacetime structure inquiry — replay and memory', () => {
  it('replays MATCH against its own freshly recomputed result', () => {
    const saved = runSpacetimeStructureInquiry();
    expect(replaySpacetimeStructureInquiry(saved).status).toBe('MATCH');
  });

  it('replays DRIFT when the saved fingerprint is tampered with', () => {
    const saved = runSpacetimeStructureInquiry();
    const tampered = { ...saved, resultFingerprint: `${saved.resultFingerprint}0` };
    expect(replaySpacetimeStructureInquiry(tampered).status).toBe('DRIFT');
  });

  it('saves to memory keyed on the result fingerprint', () => {
    const result = runSpacetimeStructureInquiry();
    const saved = saveSpacetimeStructureInquiryToMemory(result);
    expect(saved.experimentId).toContain(result.resultFingerprint);
    expect(saved.honestyNote).toMatch(/asserts neither/);
  });
});

describe('spacetime structure inquiry — next scientific actions', () => {
  it('produces one ranked action per hypothesis, with the UNRESOLVED hypothesis ranked for highest discriminating power among its own tier', () => {
    const result = runSpacetimeStructureInquiry();
    const actions = buildNextActionsFromSpacetimeInquiry(result);
    expect(actions).toHaveLength(5);

    const chronologyAction = actions.find((a) => a.targetHypothesisIds.includes('H_CHRONOLOGY_PROTECTION_HOLDS'))!;
    expect(chronologyAction.expectedDiscriminatingPower).toBe('HIGH');
    expect(chronologyAction.availability).toBe('REQUIRES_THEORETICAL_ADVANCE');

    const noExtraDofAction = actions.find((a) => a.targetHypothesisIds.includes('H_NO_EXTRA_DOF_REQUIRED'))!;
    expect(noExtraDofAction.expectedDiscriminatingPower).toBe('LOW');
    expect(noExtraDofAction.availability).toBe('REQUIRES_EXTERNAL_EXPERIMENT');
  });

  it('every action fails closed: none is RUNNABLE_IN_GENESIS, and every one declares a real missing input', () => {
    const result = runSpacetimeStructureInquiry();
    const actions = buildNextActionsFromSpacetimeInquiry(result);
    for (const action of actions) {
      expect(action.availability).not.toBe('RUNNABLE_IN_GENESIS');
      expect(action.missingInputs).toContain('discriminating-test-result');
    }
  });
});
