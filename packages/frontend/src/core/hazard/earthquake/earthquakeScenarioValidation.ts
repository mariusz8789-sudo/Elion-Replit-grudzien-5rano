/**
 * EARTHQUAKE MODULE — scenario input validation.
 *
 * Independent-audit remediation: `runEarthquakeScenario()` previously
 * accepted any numeric field without runtime checks. Phase 0's admission
 * gate (`hazardEvidenceGate.ts`) validates RECORD COMPLETENESS (are the
 * required fields present and well-formed), not whether a scenario's own
 * numbers are physically sane — `NaN`, `Infinity`, or a negative depth would
 * have sailed straight through the fingerprinting/evidence pipeline and
 * only surfaced as a garbage `SourceArtifact`/`HazardInput` already saved to
 * the evidence store.
 *
 * This is a narrow SCENARIO-CONTRACT guard, not a claim of scientific
 * calibration: it rejects numerically nonsensical requests before they ever
 * become a frozen record. It says nothing about whether a given
 * finite magnitude/depth/epicenter is realistic.
 */
import type { EarthquakeScenarioSpec } from './earthquakeScenario';

export interface EarthquakeScenarioValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateEarthquakeScenarioSpec(spec: EarthquakeScenarioSpec): EarthquakeScenarioValidationResult {
  const errors: string[] = [];
  if (!spec.scenarioLabel) errors.push('scenarioLabel must be a non-empty string');
  if (!Number.isFinite(spec.magnitude)) errors.push('magnitude must be a finite number');
  if (!Number.isFinite(spec.depthKm) || spec.depthKm < 0) errors.push('depthKm must be a finite number >= 0');
  if (!spec.epicenter || !Number.isFinite(spec.epicenter.x) || !Number.isFinite(spec.epicenter.y)) {
    errors.push('epicenter.x and epicenter.y must be finite numbers');
  }
  if (!Number.isFinite(spec.seed)) errors.push('seed must be a finite number');
  return { valid: errors.length === 0, errors };
}

export class EarthquakeScenarioValidationError extends Error {
  constructor(public readonly errors: readonly string[]) {
    super(`Invalid earthquake scenario spec: ${errors.join('; ')}`);
    this.name = 'EarthquakeScenarioValidationError';
  }
}

export function assertValidEarthquakeScenarioSpec(spec: EarthquakeScenarioSpec): void {
  const result = validateEarthquakeScenarioSpec(spec);
  if (!result.valid) throw new EarthquakeScenarioValidationError(result.errors);
}
