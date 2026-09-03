import { describe, expect, it } from 'vitest';
import {
  checkGeneratedHypothesis,
  formalizeGeneratedHypothesis,
  replayGeneratedHypothesis,
  testGeneratedHypothesis,
  type GeneratedHypothesisDraft,
} from '../core/discovery/hypothesisGeneration';

const VALID_DRAFT: GeneratedHypothesisDraft = {
  hypothesisId: 'h-test-1',
  domainId: 'TEST',
  statement: 'test statement',
  strategy: 'CONSTRAINT_COMBINATION',
  dependencyIds: ['C1', 'C2'],
  assumptions: ['assumption 1'],
  generationRationale: 'combined C1 and C2',
  expectedPrediction: 'prediction text',
  falsificationCriteria: 'falsification text',
  requiredComputation: [],
  requiredData: [],
  provenance: ['strategy:CONSTRAINT_COMBINATION'],
};

describe('hypothesisGeneration — formalization is a real, failable gate', () => {
  it('a well-formed draft reaches FORMALIZED with noveltyStatus NOVELTY_NOT_ESTABLISHED', () => {
    const candidate = formalizeGeneratedHypothesis(VALID_DRAFT);
    expect(candidate.status).toBe('FORMALIZED');
    expect(candidate.formalization.ok).toBe(true);
    expect(candidate.noveltyStatus).toBe('NOVELTY_NOT_ESTABLISHED');
    expect(candidate.verdict).toBeNull();
  });

  it('a duplicate dependency id is rejected: stays GENERATED, verdict BLOCKED', () => {
    const candidate = formalizeGeneratedHypothesis({ ...VALID_DRAFT, dependencyIds: ['C1', 'C1'] });
    expect(candidate.status).toBe('GENERATED');
    expect(candidate.formalization.ok).toBe(false);
    expect(candidate.formalization.reason).toMatch(/Duplicate dependency/);
    expect(candidate.verdict).toBe('BLOCKED');
  });

  it('a candidate with no dependencies is rejected', () => {
    const candidate = formalizeGeneratedHypothesis({ ...VALID_DRAFT, dependencyIds: [] });
    expect(candidate.formalization.ok).toBe(false);
    expect(candidate.formalization.reason).toMatch(/dependencyIds/);
  });

  it('a candidate with no falsification criteria is rejected — untestable is not a hypothesis here', () => {
    const candidate = formalizeGeneratedHypothesis({ ...VALID_DRAFT, falsificationCriteria: '   ' });
    expect(candidate.formalization.ok).toBe(false);
    expect(candidate.formalization.reason).toMatch(/falsificationCriteria/);
  });

  it('two identical drafts produce the identical fingerprint; a changed statement changes it', () => {
    const a = formalizeGeneratedHypothesis(VALID_DRAFT);
    const b = formalizeGeneratedHypothesis(VALID_DRAFT);
    expect(a.fingerprint).toBe(b.fingerprint);
    const c = formalizeGeneratedHypothesis({ ...VALID_DRAFT, statement: 'different statement' });
    expect(c.fingerprint).not.toBe(a.fingerprint);
  });
});

describe('hypothesisGeneration — CHECKED and TESTED only advance from a real prior stage', () => {
  it('checkGeneratedHypothesis is a no-op on a candidate that never reached FORMALIZED', () => {
    const blocked = formalizeGeneratedHypothesis({ ...VALID_DRAFT, dependencyIds: [] });
    const checked = checkGeneratedHypothesis(blocked, () => ({ ok: true, reason: '' }));
    expect(checked.status).toBe('GENERATED');
  });

  it('a failing check blocks the candidate with the real reason, never silently passing', () => {
    const formalized = formalizeGeneratedHypothesis(VALID_DRAFT);
    const checked = checkGeneratedHypothesis(formalized, () => ({ ok: false, reason: 'dependency C1 does not exist in the current registry' }));
    expect(checked.status).toBe('FORMALIZED');
    expect(checked.verdict).toBe('BLOCKED');
    expect(checked.verdictReasoning).toMatch(/does not exist/);
  });

  it('a passing check advances to CHECKED, still with no verdict', () => {
    const formalized = formalizeGeneratedHypothesis(VALID_DRAFT);
    const checked = checkGeneratedHypothesis(formalized, () => ({ ok: true, reason: 'all dependencies exist' }));
    expect(checked.status).toBe('CHECKED');
    expect(checked.verdict).toBeNull();
  });

  it('testGeneratedHypothesis is a no-op on a candidate that never reached CHECKED', () => {
    const formalized = formalizeGeneratedHypothesis(VALID_DRAFT);
    const tested = testGeneratedHypothesis(formalized, () => ({ verdict: 'SUPPORTED', reasoning: 'should not run' }));
    expect(tested.status).toBe('FORMALIZED');
    expect(tested.verdict).toBeNull();
  });

  it('a full pipeline reaches TESTED with the real supplied verdict', () => {
    const formalized = formalizeGeneratedHypothesis(VALID_DRAFT);
    const checked = checkGeneratedHypothesis(formalized, () => ({ ok: true, reason: 'ok' }));
    const tested = testGeneratedHypothesis(checked, () => ({ verdict: 'UNRESOLVED', reasoning: 'depends on an open conjecture' }));
    expect(tested.status).toBe('TESTED');
    expect(tested.verdict).toBe('UNRESOLVED');
  });
});

describe('hypothesisGeneration — replay', () => {
  function fullyTested(overrides: Partial<GeneratedHypothesisDraft> = {}) {
    const formalized = formalizeGeneratedHypothesis({ ...VALID_DRAFT, ...overrides });
    const checked = checkGeneratedHypothesis(formalized, () => ({ ok: true, reason: 'ok' }));
    return testGeneratedHypothesis(checked, () => ({ verdict: 'SUPPORTED', reasoning: 'both dependencies are established facts' }));
  }

  it('replays MATCH against an identically recomputed candidate', () => {
    const saved = fullyTested();
    const recomputed = fullyTested();
    expect(replayGeneratedHypothesis(saved, recomputed, true).status).toBe('MATCH');
  });

  it('replays DRIFT when recomputation yields a different fingerprint', () => {
    const saved = fullyTested();
    const recomputed = fullyTested({ statement: 'a different statement now' });
    expect(replayGeneratedHypothesis(saved, recomputed, true).status).toBe('DRIFT');
  });

  it('replays NOT_COMPARABLE when a dependency no longer exists, never silently MATCH', () => {
    const saved = fullyTested();
    const recomputed = fullyTested();
    expect(replayGeneratedHypothesis(saved, recomputed, false).status).toBe('NOT_COMPARABLE');
  });
});
