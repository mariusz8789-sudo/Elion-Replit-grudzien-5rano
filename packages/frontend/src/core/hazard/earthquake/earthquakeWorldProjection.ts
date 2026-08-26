/**
 * EARTHQUAKE MODULE — read-only Digital Twin projection contract.
 *
 * This is the ONLY file in the earthquake vertical slice concerned with how
 * results might eventually reach a renderer. It is a pure, read-only
 * mapping from a completed `EarthquakeScenarioResult` to a flat, versioned
 * view — it does not import, touch, or know about City3D, Three.js, or any
 * rendering code, and nothing calls it from a UI component. Wiring this
 * into `#/city3d` is explicitly Manus's later task (per
 * docs/MULTI_HAZARD_ARCHITECTURE_AUDIT.md's ownership model: "Manus: One
 * City3D renderer, read-only projections..."), same as the existing
 * `projectWorldState(simulation)` boundary for the epidemic core.
 *
 * `notModeled` follows the same honesty convention `WorldEngineContract`
 * already uses for the epidemic projection: an explicit list of what this
 * view deliberately does not represent, rather than silence that could be
 * misread as "not applicable."
 */
import type { EarthquakePoint } from './earthquakeModel';
import type { ImpactSeverityClass, HazardDatasetStatus } from '../contracts';
import type { EarthquakeScenarioResult } from './earthquakeScenario';
import { readEarthquakeOutputFields } from './earthquakeImpact';

export const EARTHQUAKE_WORLD_PROJECTION_SCHEMA_VERSION = '1.0.0';

export interface EarthquakeWorldProjectionSite {
  readonly siteId: string;
  readonly assetLabel: string;
  readonly x: number;
  readonly y: number;
  readonly severity: ImpactSeverityClass;
  readonly severityValue: number;
  readonly uncertaintyLow: number;
  readonly uncertaintyHigh: number;
  readonly datasetStatus: HazardDatasetStatus;
}

export interface EarthquakeWorldStateView {
  readonly schemaVersion: string;
  readonly hazardRunId: string;
  readonly hazardModuleVersion: string;
  readonly generatedAt: number;
  readonly epicenter: EarthquakePoint;
  readonly magnitude: number;
  readonly sites: readonly EarthquakeWorldProjectionSite[];
  readonly notModeled: readonly string[];
}

/**
 * Exported so the Hazard Module Registry descriptor can reuse this exact
 * list rather than duplicating it and risking drift. Genuinely frozen
 * (`Object.freeze`, not just TypeScript's `readonly`) so a consumer cannot
 * silently mutate what this module claims not to model.
 */
export const EARTHQUAKE_NOT_MODELED: readonly string[] = Object.freeze([
  'building-level structural damage',
  'aftershock sequence',
  'infrastructure/utility cascade effects',
  'population casualty estimation',
  'evacuation or emergency response guidance',
]);

/** Pure mapping — no I/O, no rendering, no mutation of its input. */
export function projectEarthquakeWorldState(result: EarthquakeScenarioResult): EarthquakeWorldStateView {
  const output = readEarthquakeOutputFields(result.run);
  const sitesBySiteId = new Map(result.exposure.sites.map((site) => [site.siteId, site] as const));

  const sites: EarthquakeWorldProjectionSite[] = result.impacts.map((impact) => {
    const site = sitesBySiteId.get(impact.siteId);
    return {
      siteId: impact.siteId,
      assetLabel: site?.assetLabel ?? impact.siteId,
      x: site?.x ?? 0,
      y: site?.y ?? 0,
      severity: impact.severity,
      severityValue: impact.severityValue,
      uncertaintyLow: impact.uncertainty.low,
      uncertaintyHigh: impact.uncertainty.high,
      datasetStatus: impact.datasetStatus,
    };
  });

  return {
    schemaVersion: EARTHQUAKE_WORLD_PROJECTION_SCHEMA_VERSION,
    hazardRunId: result.run.hazardRunId,
    hazardModuleVersion: result.run.hazardModuleVersion,
    generatedAt: result.run.createdAt,
    epicenter: output.epicenter,
    magnitude: output.magnitude,
    sites,
    notModeled: EARTHQUAKE_NOT_MODELED,
  };
}
