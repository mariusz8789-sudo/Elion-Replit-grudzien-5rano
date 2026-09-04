import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCENARIO_OVERLAY_POLICY,
  evaluateScenarioOverlayEligibility,
  type ScenarioOverlayCandidate,
  type ScenarioOverlayPolicy,
} from '../core/simulationRenderer/scenarioOverlayGate';

const COMPLETE_SCENARIO: ScenarioOverlayCandidate = {
  overlayKind: 'earthquake-scenario',
  schemaVersion: '1.0.0',
  datasetStatuses: ['SCENARIO'],
  evidence: { replayStatus: 'MATCH', missingFields: [] },
  coordinateMapping: {
    mappingId: 'fixture-coordinate-map',
    mappingVersion: '1.0.0',
    mappingFingerprint: 'map-sha256-fixture',
  },
};

const ENABLED_POLICY: ScenarioOverlayPolicy = { enabled: true, supportedSchemas: ['1.0.0'] };

describe('scenario overlay eligibility gate', () => {
  it('is disabled by default even for a complete scenario candidate', () => {
    const result = evaluateScenarioOverlayEligibility(COMPLETE_SCENARIO);
    expect(result.enabled).toBe(false);
    expect(result.reasons).toContain('INTEGRATION_DISABLED');
    expect(result.reasons).toContain('UNSUPPORTED_SCHEMA');
  });

  it('permits only an explicitly enabled, supported and fully evidenced SCENARIO overlay with a mapping', () => {
    expect(evaluateScenarioOverlayEligibility(COMPLETE_SCENARIO, ENABLED_POLICY)).toEqual({ enabled: true, reasons: [] });
  });

  it('rejects a scenario without explicit coordinate mapping rather than guessing CityWorld placement', () => {
    const result = evaluateScenarioOverlayEligibility({ ...COMPLETE_SCENARIO, coordinateMapping: null }, ENABLED_POLICY);
    expect(result.enabled).toBe(false);
    expect(result.reasons).toContain('MAPPING_UNAVAILABLE');
  });

  it('rejects drift, incomplete evidence and non-scenario statuses independently', () => {
    const result = evaluateScenarioOverlayEligibility({
      ...COMPLETE_SCENARIO,
      datasetStatuses: ['OBSERVED'],
      evidence: { replayStatus: 'DRIFT', missingFields: ['run.resultFingerprint'] },
    }, ENABLED_POLICY);
    expect(result.enabled).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining(['NON_SCENARIO_DATA', 'EVIDENCE_INCOMPLETE', 'REPLAY_NOT_MATCH']));
  });

  it('does not mutate candidate or default policy objects', () => {
    const before = JSON.stringify(COMPLETE_SCENARIO);
    evaluateScenarioOverlayEligibility(COMPLETE_SCENARIO, ENABLED_POLICY);
    expect(JSON.stringify(COMPLETE_SCENARIO)).toBe(before);
    expect(DEFAULT_SCENARIO_OVERLAY_POLICY.enabled).toBe(false);
  });
});
