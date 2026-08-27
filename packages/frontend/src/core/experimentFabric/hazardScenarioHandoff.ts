/**
 * Ephemeral pointer handoff for a single confirmed Earthquake scenario
 * request, mirroring `worldHandoff.ts`'s epidemic-only pattern for the one
 * other route kind that needs to carry data across a hash navigation.
 *
 * This is deliberately NOT an Evidence/Replay/Provenance registry: it holds
 * a plain, unvalidated parameter spec (already validated once by
 * `validateStructuredExperimentRequest` before this point) for exactly long
 * enough for the Earthquake Command Center to read it once on mount and run
 * it through the existing, unmodified hazard pipeline. No HazardRun,
 * ImpactResult, DamageAssessment, or fingerprint is computed or stored here.
 */
export interface PendingEarthquakeScenario {
  readonly runId: string;
  readonly hazardType: 'earthquake';
  readonly magnitude: number;
  readonly depthKm: number;
  readonly epicenterX: number;
  readonly epicenterY: number;
  readonly seed: number;
}

const PENDING_SCENARIOS = new Map<string, PendingEarthquakeScenario>();
let pendingRunId: string | null = null;
const MAX_RETAINED_SCENARIOS = 8;

export function registerPendingHazardScenario(runId: string, scenario: Omit<PendingEarthquakeScenario, 'runId'>): void {
  PENDING_SCENARIOS.set(runId, { runId, ...scenario });
  while (PENDING_SCENARIOS.size > MAX_RETAINED_SCENARIOS) {
    const oldestId = PENDING_SCENARIOS.keys().next().value as string | undefined;
    if (!oldestId) break;
    PENDING_SCENARIOS.delete(oldestId);
  }
}

export function setPendingHazardScenario(runId: string): boolean {
  if (!PENDING_SCENARIOS.has(runId)) return false;
  pendingRunId = runId;
  return true;
}

/** Consumption removes the entry so a later City3D visit never silently re-applies stale parameters. */
export function consumePendingHazardScenario(): PendingEarthquakeScenario | null {
  if (!pendingRunId) return null;
  const runId = pendingRunId;
  pendingRunId = null;
  const scenario = PENDING_SCENARIOS.get(runId) ?? null;
  if (scenario) PENDING_SCENARIOS.delete(runId);
  return scenario;
}

export function clearPendingHazardScenarios(): void {
  pendingRunId = null;
  PENDING_SCENARIOS.clear();
}
