import { describe, expect, it } from 'vitest';
import {
  buildExternalDatasetCase,
  compareExternalDatasetCaseReplay,
  type ExternalDatasetHypothesisInput,
  type ExternalDatasetProvenance,
} from '../core/agent/externalDatasetCase';
import type { HypothesisAssessment, FalsificationCriterion } from '../core/experimentFabric/scientificDiscovery';
import type { TautologyAssessment } from '../core/agent/tautologyGate';

const PROVENANCE: ExternalDatasetProvenance = {
  datasetId: 'fixture-dataset',
  sourceUrl: 'https://example.invalid/fixture',
  sourceVersion: 'v1',
  retrievedAt: '2026-01-01',
  license: 'cc-by-4.0',
};

function criterion(metric: string): FalsificationCriterion {
  return { metric, relation: 'equal-within-tolerance', rationale: 'fixture criterion' };
}

function empiricalTautology(componentId: string): TautologyAssessment {
  return {
    classification: 'EMPIRICAL_TEST',
    reasons: ['fixture — independent channel'],
    components: [{ componentId, classification: 'EMPIRICAL_TEST', reasons: ['fixture'] }],
  };
}

function consistencyTautology(componentId: string): TautologyAssessment {
  return {
    classification: 'CONSISTENCY_CHECK',
    reasons: ['fixture — analytic invariant'],
    components: [{ componentId, classification: 'CONSISTENCY_CHECK', reasons: ['fixture'] }],
  };
}

const IDENTITY_MAP: Record<string, HypothesisAssessment> = {
  SUPPORTED: 'SUPPORTED_WITHIN_PROTOCOL',
  FALSIFIED: 'FALSIFIED_WITHIN_PROTOCOL',
  UNSURE: 'INCONCLUSIVE',
};

function hyp(id: string, verdict: keyof typeof IDENTITY_MAP, tautology: TautologyAssessment): ExternalDatasetHypothesisInput {
  return {
    id,
    statement: `Fixture hypothesis ${id}`,
    verdict,
    reasons: [`fixture reason for ${id}`],
    tautology,
    toHypothesisAssessment: (v) => IDENTITY_MAP[v]!,
    criterion: criterion(`fixture-${id}`),
  };
}

describe('externalDatasetCase — generic multi-verdict container', () => {
  it('preserves every hypothesis independently — never collapses N verdicts into one', () => {
    const result = buildExternalDatasetCase({
      caseId: 'fixture-case',
      provenance: PROVENANCE,
      hypotheses: [
        hyp('H1', 'SUPPORTED', empiricalTautology('h1')),
        hyp('H2', 'SUPPORTED', empiricalTautology('h2')),
        hyp('H3', 'FALSIFIED', empiricalTautology('h3')),
        hyp('H4', 'UNSURE', empiricalTautology('h4')),
      ],
      domainResultFingerprint: 'domain-fp-1',
    });

    expect(result.hypotheses).toHaveLength(4);
    expect(result.hypotheses.map((h) => h.verdict)).toEqual(['SUPPORTED', 'SUPPORTED', 'FALSIFIED', 'UNSURE']);
    // No single "case verdict" field exists anywhere on the result — only tallies.
    expect(result).not.toHaveProperty('verdict');
    expect(result.verdictCounts).toEqual({ SUPPORTED: 2, FALSIFIED: 1, UNSURE: 1 });
  });

  it('runs belief revision per hypothesis, moving confidence up for SUPPORTED and down for FALSIFIED', () => {
    const result = buildExternalDatasetCase({
      caseId: 'fixture-case-belief',
      provenance: PROVENANCE,
      hypotheses: [
        hyp('SUP', 'SUPPORTED', empiricalTautology('sup')),
        hyp('FAL', 'FALSIFIED', empiricalTautology('fal')),
      ],
      domainResultFingerprint: 'domain-fp-2',
    });
    const supported = result.hypotheses.find((h) => h.id === 'SUP')!;
    const falsified = result.hypotheses.find((h) => h.id === 'FAL')!;
    expect(supported.belief.before).toBeCloseTo(0.5, 6);
    expect(supported.belief.after).toBeGreaterThan(supported.belief.before);
    expect(falsified.belief.before).toBeCloseTo(0.5, 6);
    expect(falsified.belief.after).toBeLessThan(falsified.belief.before);
  });

  it('a CONSISTENCY_CHECK component never moves belief, regardless of its verdict (evidenceCeiling=0)', () => {
    const result = buildExternalDatasetCase({
      caseId: 'fixture-case-tautology',
      provenance: PROVENANCE,
      hypotheses: [hyp('INERT', 'SUPPORTED', consistencyTautology('inert'))],
      domainResultFingerprint: 'domain-fp-3',
    });
    const only = result.hypotheses[0]!;
    expect(only.belief.before).toBeCloseTo(only.belief.after, 9);
    expect(result.tautologyCounts).toEqual({ CONSISTENCY_CHECK: 1 });
  });

  it('produces a next-question for every hypothesis, tailored to its assessment', () => {
    const result = buildExternalDatasetCase({
      caseId: 'fixture-case-next',
      provenance: PROVENANCE,
      hypotheses: [
        hyp('SUP', 'SUPPORTED', empiricalTautology('sup')),
        hyp('FAL', 'FALSIFIED', empiricalTautology('fal')),
        hyp('UNS', 'UNSURE', empiricalTautology('uns')),
      ],
      domainResultFingerprint: 'domain-fp-4',
    });
    expect(result.hypotheses.find((h) => h.id === 'SUP')!.nextQuestion).toMatch(/strains this hypothesis/);
    expect(result.hypotheses.find((h) => h.id === 'FAL')!.nextQuestion).toMatch(/FALSIFIED/);
    expect(result.hypotheses.find((h) => h.id === 'UNS')!.nextQuestion).toMatch(/INCONCLUSIVE/);
  });

  it('is deterministic: identical input produces an identical caseFingerprint (replay MATCH)', () => {
    const buildOnce = () =>
      buildExternalDatasetCase({
        caseId: 'fixture-case-replay',
        provenance: PROVENANCE,
        hypotheses: [hyp('H1', 'SUPPORTED', empiricalTautology('h1'))],
        domainResultFingerprint: 'domain-fp-5',
      });
    const first = buildOnce();
    const second = buildOnce();
    expect(first.caseFingerprint).toBe(second.caseFingerprint);
    expect(compareExternalDatasetCaseReplay(first, second)).toBe('MATCH');
  });

  it('detects drift when the domain result fingerprint changes', () => {
    const build = (domainResultFingerprint: string) =>
      buildExternalDatasetCase({
        caseId: 'fixture-case-drift',
        provenance: PROVENANCE,
        hypotheses: [hyp('H1', 'SUPPORTED', empiricalTautology('h1'))],
        domainResultFingerprint,
      });
    const first = build('fp-a');
    const second = build('fp-b');
    expect(compareExternalDatasetCaseReplay(first, second)).toBe('DRIFT');
  });
});
