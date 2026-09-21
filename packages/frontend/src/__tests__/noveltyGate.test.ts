import { describe, test, expect, beforeEach } from 'vitest';
import type { ModelSpec } from '../core/agent/modelSpace';
import type { FalsificationScope } from '../core/agent/falsifiedModelRegistry';
import { recordFalsification, resetFalsifiedModelRegistryForTests } from '../core/agent/falsifiedModelRegistry';
import { createHypothesis, updateConfidence, type Hypothesis } from '../core/experimentFabric/beliefRevision';
import type { FalsificationCriterion } from '../core/experimentFabric/scientificDiscovery';
import {
  assessNovelty,
  classifyResultLabel,
  assertValidResultLabel,
  NoveltyGateViolationError,
  recordKnownFinding,
  resetNoveltyGateRegistryForTests,
  type NoveltyAssessment,
} from '../core/agent/noveltyGate';

const SCOPE: FalsificationScope = { domain: 'TEST_DOMAIN', assumptions: ['a1'], boundary: 'x in [0,10]' };
const OTHER_SCOPE: FalsificationScope = { domain: 'OTHER_DOMAIN', assumptions: [], boundary: 'n/a' };

function spec(id: string): ModelSpec {
  return { id, terms: [{ basis: 'LINEAR', variable: 'x' }], lineage: null };
}

function criterion(metric: string): FalsificationCriterion {
  return { metric, relation: 'less-than', rationale: 'test fixture' };
}

function falsifiedHypothesis(id = 'h1'): Hypothesis {
  const h = createHypothesis(id, criterion(id), 0.5);
  return updateConfidence(h, 'FALSIFIED_WITHIN_PROTOCOL', 0.9, 'Round 1: decisively beaten by a rival model.', 1);
}

beforeEach(() => {
  resetNoveltyGateRegistryForTests();
  resetFalsifiedModelRegistryForTests();
});

// ---------------------------------------------------------------------------
// TE6 — NO DISCOVERY INFLATION (negative tests, written before the positive
// path — per the Phase E mandate's explicit instruction).
// ---------------------------------------------------------------------------
describe('TE6 — no discovery inflation (machine-enforced negatives)', () => {
  test('TE6.1 — a known (NOT_NEW) finding labeled DISCOVERY FAILS', () => {
    const assessment: NoveltyAssessment = assessNovelty({
      spec: spec('m1'),
      scope: SCOPE,
      alreadyKnownFingerprints: [],
      declaredPublicAnchorMatch: { anchorId: 'PUBCHEM-123', summary: 'Already published relation.' },
      checkedCorpus: ['falsifiedModelRegistry(M2)', 'knownFindingsRegistry'],
    });
    expect(assessment.level).toBe('NOT_NEW');

    expect(() =>
      assertValidResultLabel({
        label: 'DISCOVERY',
        assessment,
        accessDeclared: true,
        hasSupportingEvidence: true,
        hasFalsificationAttempt: true,
        hasProvenance: true,
      }),
    ).toThrow(NoveltyGateViolationError);
  });

  test('TE6.2 — NO_ACCESS declared then labeled DISCOVERY FAILS', () => {
    const assessment: NoveltyAssessment = assessNovelty({
      spec: spec('m2'),
      scope: SCOPE,
      checkedCorpus: ['falsifiedModelRegistry(M2)', 'knownFindingsRegistry'],
    });
    expect(assessment.level).toBe('NOVEL_WITHIN_CHECKED_CORPUS');

    expect(() =>
      assertValidResultLabel({
        label: 'DISCOVERY',
        assessment,
        accessDeclared: false, // NO_ACCESS_DECLARED path
        hasSupportingEvidence: true,
        hasFalsificationAttempt: true,
        hasProvenance: true,
      }),
    ).toThrow(NoveltyGateViolationError);
  });

  test('TE6.3 — a REPRODUCTION-shaped result (NOT_NEW via known-findings registry) cannot be upgraded to DISCOVERY', () => {
    const known = recordKnownFinding({
      spec: spec('m3'),
      scope: SCOPE,
      source: 'CAMPAIGN_DISCOVERY',
      campaignId: 'campaign-earlier',
      summary: 'Confirmed in an earlier campaign.',
    });
    expect(known.modelFingerprint).toBeTruthy();

    const assessment = assessNovelty({ spec: spec('m3'), scope: SCOPE, checkedCorpus: ['knownFindingsRegistry'] });
    expect(assessment.level).toBe('NOT_NEW');

    const decision = classifyResultLabel({
      accessDeclared: true,
      assessment,
      hasSupportingEvidence: true,
      hasFalsificationAttempt: true,
      hasProvenance: true,
    });
    expect(decision.label).toBe('REPRODUCTION');

    // Attempting to force DISCOVERY on the exact same evidence must fail.
    expect(() =>
      assertValidResultLabel({
        label: 'DISCOVERY',
        assessment,
        accessDeclared: true,
        hasSupportingEvidence: true,
        hasFalsificationAttempt: true,
        hasProvenance: true,
      }),
    ).toThrow(NoveltyGateViolationError);
  });

  test('a BLOCKed (M2-falsified) model cannot be labeled DISCOVERY', () => {
    recordFalsification({
      spec: spec('m4'),
      scope: SCOPE,
      reusableAs: 'NEVER',
      evidence: falsifiedHypothesis(),
      campaignId: 'c1',
      round: 1,
      observationIds: ['o1'],
    });
    const assessment = assessNovelty({ spec: spec('m4'), scope: SCOPE, checkedCorpus: ['falsifiedModelRegistry(M2)'] });
    expect(assessment.level).toBe('UNKNOWN');
    expect(assessment.falsifiedConsultation.verdict).toBe('BLOCK');

    expect(() =>
      assertValidResultLabel({
        label: 'DISCOVERY',
        assessment,
        accessDeclared: true,
        hasSupportingEvidence: true,
        hasFalsificationAttempt: true,
        hasProvenance: true,
      }),
    ).toThrow(NoveltyGateViolationError);
  });

  test('an empty checkedCorpus caps novelty at POSSIBLY_NOVEL, which cannot become DISCOVERY', () => {
    const assessment = assessNovelty({ spec: spec('m5'), scope: SCOPE, checkedCorpus: [] });
    expect(assessment.level).toBe('POSSIBLY_NOVEL');

    expect(() =>
      assertValidResultLabel({
        label: 'DISCOVERY',
        assessment,
        accessDeclared: true,
        hasSupportingEvidence: true,
        hasFalsificationAttempt: true,
        hasProvenance: true,
      }),
    ).toThrow(NoveltyGateViolationError);
  });

  test('missing falsification attempt blocks DISCOVERY even when novelty is clean', () => {
    const assessment = assessNovelty({ spec: spec('m6'), scope: SCOPE, checkedCorpus: ['falsifiedModelRegistry(M2)'] });
    expect(assessment.level).toBe('NOVEL_WITHIN_CHECKED_CORPUS');

    expect(() =>
      assertValidResultLabel({
        label: 'DISCOVERY',
        assessment,
        accessDeclared: true,
        hasSupportingEvidence: true,
        hasFalsificationAttempt: false,
        hasProvenance: true,
      }),
    ).toThrow(NoveltyGateViolationError);
  });
});

// ---------------------------------------------------------------------------
// Positive control — genuinely new fixture -> NOVELTY_CONFIRMED -> DISCOVERY
// only after the rest of the criteria are also met.
// ---------------------------------------------------------------------------
describe('positive path — a genuinely new, fully-evidenced result', () => {
  test('reaches DISCOVERY only once novelty + evidence + falsification + provenance all hold', () => {
    const assessment = assessNovelty({
      spec: spec('new-model'),
      scope: SCOPE,
      alreadyKnownFingerprints: [],
      declaredPublicAnchorMatch: null,
      checkedCorpus: ['falsifiedModelRegistry(M2)', 'knownFindingsRegistry', 'declared public anchors: none matched'],
    });
    expect(assessment.level).toBe('NOVEL_WITHIN_CHECKED_CORPUS');

    const decision = classifyResultLabel({
      accessDeclared: true,
      assessment,
      hasSupportingEvidence: true,
      hasFalsificationAttempt: true,
      hasProvenance: true,
    });
    expect(decision.label).toBe('DISCOVERY');

    expect(() =>
      assertValidResultLabel({
        label: decision.label,
        assessment,
        accessDeclared: true,
        hasSupportingEvidence: true,
        hasFalsificationAttempt: true,
        hasProvenance: true,
      }),
    ).not.toThrow();
  });

  test('classifyResultLabel downgrades to HYPOTHESIS_UNKNOWN when evidence is incomplete, never inflates', () => {
    const assessment = assessNovelty({ spec: spec('new-model-2'), scope: SCOPE, checkedCorpus: ['falsifiedModelRegistry(M2)'] });
    const decision = classifyResultLabel({
      accessDeclared: true,
      assessment,
      hasSupportingEvidence: true,
      hasFalsificationAttempt: false,
      hasProvenance: true,
    });
    expect(decision.label).toBe('HYPOTHESIS_UNKNOWN');
  });
});

describe('scope sensitivity — a different scope is not silently treated as the same finding', () => {
  test('a known finding in one scope does not suppress novelty in a materially different scope', () => {
    recordKnownFinding({ spec: spec('m7'), scope: SCOPE, source: 'CAMPAIGN_DISCOVERY', campaignId: 'c1', summary: 'Known in TEST_DOMAIN.' });
    const assessment = assessNovelty({ spec: spec('m7'), scope: OTHER_SCOPE, checkedCorpus: ['knownFindingsRegistry'] });
    expect(assessment.level).toBe('NOVEL_WITHIN_CHECKED_CORPUS');
  });
});

describe('NO_ACCESS_DECLARED is never fabricated', () => {
  test('classifyResultLabel requires a real reason, refuses a silent NO_ACCESS', () => {
    const assessment = assessNovelty({ spec: spec('m8'), scope: SCOPE, checkedCorpus: [] });
    expect(() =>
      classifyResultLabel({
        accessDeclared: false,
        noAccessReason: '',
        assessment,
        hasSupportingEvidence: false,
        hasFalsificationAttempt: false,
        hasProvenance: false,
      }),
    ).toThrow();
  });

  test('a real declared reason produces NO_ACCESS_DECLARED, not silently HYPOTHESIS_UNKNOWN', () => {
    const assessment = assessNovelty({ spec: spec('m9'), scope: SCOPE, checkedCorpus: [] });
    const decision = classifyResultLabel({
      accessDeclared: false,
      noAccessReason: 'ChEMBL endpoint unreachable in this sandbox.',
      assessment,
      hasSupportingEvidence: false,
      hasFalsificationAttempt: false,
      hasProvenance: false,
    });
    expect(decision.label).toBe('NO_ACCESS_DECLARED');
  });
});
