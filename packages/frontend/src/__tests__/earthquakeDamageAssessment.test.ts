import { describe, expect, it } from 'vitest';
import { EARTHQUAKE_DAMAGE_REQUIRED_DATA, computeDamageAssessments } from '../core/hazard/earthquake/earthquakeDamageAssessment';
import { buildEarthquakeDemoEnvelope } from '../core/hazard/earthquake/earthquakeDemoEnvelope';
import { buildHazardEvidencePack } from '../core/hazard/earthquake/earthquakeEvidence';
import { runEarthquakeScenario, verifyDerivedLayerDeterminism, type EarthquakeScenarioSpec } from '../core/hazard/earthquake/earthquakeScenario';
import type { DamageAssessment } from '../core/hazard/contracts';

const BASE_SPEC: EarthquakeScenarioSpec = {
  scenarioLabel: 'SYNTHETIC-EQ-DAMAGE-001',
  magnitude: 6.5,
  depthKm: 12,
  epicenter: { x: 3, y: -1 },
  seed: 42,
};

describe('Earthquake Damage Assessment — honest NOT_MODELED disclosure', () => {
  it('produces exactly one DamageAssessment per ImpactResult, every one status NOT_MODELED', async () => {
    const result = await runEarthquakeScenario(BASE_SPEC, 'test-commit-hash');
    expect(result.damageAssessments.length).toBe(result.impacts.length);
    for (const assessment of result.damageAssessments) {
      expect(assessment.status).toBe('NOT_MODELED');
      expect(assessment.datasetStatus).toBe('NOT_MODELED');
      expect(assessment.notModeledReason.length).toBeGreaterThan(0);
      expect(assessment.requiredData.length).toBeGreaterThan(0);
    }
  });

  it('links every DamageAssessment back to its exact HazardRun and ImpactResult by id', async () => {
    const result = await runEarthquakeScenario(BASE_SPEC, 'test-commit-hash');
    const impactIds = new Set(result.impacts.map((impact) => impact.impactResultId));
    for (const assessment of result.damageAssessments) {
      expect(assessment.hazardRunId).toBe(result.run.hazardRunId);
      expect(assessment.provenance.hazardRunId).toBe(result.run.hazardRunId);
      expect(impactIds.has(assessment.impactResultId)).toBe(true);
    }
  });

  it('the required-data disclosure names concrete missing model/data, not a vague placeholder', () => {
    expect(EARTHQUAKE_DAMAGE_REQUIRED_DATA.length).toBeGreaterThan(0);
    for (const requirement of EARTHQUAKE_DAMAGE_REQUIRED_DATA) {
      expect(requirement.requirement.length).toBeGreaterThan(0);
      expect(requirement.rationale.length).toBeGreaterThan(10);
    }
    const requirementNames = EARTHQUAKE_DAMAGE_REQUIRED_DATA.map((r) => r.requirement);
    expect(requirementNames).toContain('building-inventory-with-structural-typology');
    expect(requirementNames).toContain('calibrated-fragility-or-vulnerability-curves');
    expect(requirementNames).toContain('occupancy-and-casualty-model');
  });

  it('is a pure function: identical run+impacts produce byte-identical (deep-equal) output every call', async () => {
    const result = await runEarthquakeScenario({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-DAMAGE-DETERMINISM' }, 'test-commit-hash');
    const first = computeDamageAssessments(result.run, result.impacts);
    const second = computeDamageAssessments(result.run, result.impacts);
    expect(first).toEqual(second);
  });

  it('handles an empty impacts array without throwing, producing no fabricated assessments', async () => {
    const result = await runEarthquakeScenario({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-DAMAGE-EMPTY' }, 'test-commit-hash');
    expect(computeDamageAssessments(result.run, [])).toEqual([]);
  });

  it('returns frozen records: mutating a returned assessment or its requiredData array throws in strict mode', async () => {
    const result = await runEarthquakeScenario({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-DAMAGE-FROZEN' }, 'test-commit-hash');
    const [assessment] = result.damageAssessments;
    expect(Object.isFrozen(assessment)).toBe(true);
    expect(Object.isFrozen(assessment.requiredData)).toBe(true);
    expect(() => {
      (assessment as { status: string }).status = 'MODELED';
    }).toThrow();
  });
});

describe('Earthquake Damage Assessment — evidence completeness gate', () => {
  it('a complete scenario admits with no missing damageAssessments fields', async () => {
    const result = await runEarthquakeScenario({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-DAMAGE-EVIDENCE-OK' }, 'test-commit-hash');
    const pack = await buildHazardEvidencePack(result);
    expect(pack.missingFields).toEqual([]);
  });

  it('flags a missing damageAssessments set as an incomplete pack rather than silently admitting it', async () => {
    const result = await runEarthquakeScenario({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-DAMAGE-EVIDENCE-EMPTY' }, 'test-commit-hash');
    const broken = { ...result, damageAssessments: [] };
    const pack = await buildHazardEvidencePack(broken);
    expect(pack.missingFields).toContain('damageAssessments');
  });

  it('rejects a tampered assessment that claims a non-NOT_MODELED status rather than trusting it', async () => {
    const result = await runEarthquakeScenario({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-DAMAGE-EVIDENCE-TAMPERED' }, 'test-commit-hash');
    const tampered: DamageAssessment = { ...result.damageAssessments[0], status: 'MODELED' as unknown as 'NOT_MODELED' };
    const broken = { ...result, damageAssessments: [tampered, ...result.damageAssessments.slice(1)] };
    const pack = await buildHazardEvidencePack(broken);
    expect(pack.missingFields).toContain('damageAssessments[0].status');
  });

  it('rejects an assessment missing its notModeledReason or requiredData disclosure', async () => {
    const result = await runEarthquakeScenario({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-DAMAGE-EVIDENCE-NOREASON' }, 'test-commit-hash');
    const tampered: DamageAssessment = { ...result.damageAssessments[0], notModeledReason: '', requiredData: [] };
    const broken = { ...result, damageAssessments: [tampered, ...result.damageAssessments.slice(1)] };
    const pack = await buildHazardEvidencePack(broken);
    expect(pack.missingFields).toContain('damageAssessments[0].notModeledReason');
    expect(pack.missingFields).toContain('damageAssessments[0].requiredData');
  });
});

describe('Earthquake derived-layer replay (Impact/DamageAssessment determinism proof)', () => {
  it('a freshly re-projected impact/damage layer matches the originally computed fingerprints', async () => {
    const result = await runEarthquakeScenario({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-DAMAGE-REPLAY-MATCH' }, 'test-commit-hash');
    const check = await verifyDerivedLayerDeterminism(result);
    expect(check.matches).toBe(true);
    expect(check.differences).toEqual([]);
  });

  it('detects a tampered impactSetFingerprint as a genuine drift rather than a false MATCH', async () => {
    const result = await runEarthquakeScenario({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-DAMAGE-REPLAY-DRIFT-IMPACT' }, 'test-commit-hash');
    const tampered = { ...result, impactSetFingerprint: 'deliberately-wrong-fingerprint' };
    const check = await verifyDerivedLayerDeterminism(tampered);
    expect(check.matches).toBe(false);
    expect(check.differences.join(' ')).toContain('impact set fingerprint differs');
  });

  it('detects a tampered damageAssessmentSetFingerprint as a genuine drift rather than a false MATCH', async () => {
    const result = await runEarthquakeScenario({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-DAMAGE-REPLAY-DRIFT-DAMAGE' }, 'test-commit-hash');
    const tampered = { ...result, damageAssessmentSetFingerprint: 'deliberately-wrong-fingerprint' };
    const check = await verifyDerivedLayerDeterminism(tampered);
    expect(check.matches).toBe(false);
    expect(check.differences.join(' ')).toContain('damage assessment set fingerprint differs');
  });
});

describe('Earthquake demo envelope — DamageAssessment surfaced end-to-end', () => {
  it('a READY envelope carries damageAssessments in its projection, one per site, all NOT_MODELED', async () => {
    const envelope = await buildEarthquakeDemoEnvelope({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-DAMAGE-ENVELOPE' }, 'test-commit-hash');
    expect(envelope.status).toBe('READY');
    expect(envelope.projection?.damageAssessments.length).toBe(envelope.projection?.sites.length);
    for (const assessment of envelope.projection?.damageAssessments ?? []) {
      expect(assessment.status).toBe('NOT_MODELED');
      expect(assessment.requiredData.length).toBeGreaterThan(0);
    }
  });
});
