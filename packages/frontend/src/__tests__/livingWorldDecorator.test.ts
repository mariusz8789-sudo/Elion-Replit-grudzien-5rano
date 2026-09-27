import { describe, expect, it } from 'vitest';
import { buildLivingWorldPlan } from '../core/temporalCinematic/livingWorldDecorator';
import { buildHistoricalWorldSpecification } from '../core/temporalCinematic/historicalWorldParameters';
import { generateSpecifiedWorld } from '../core/worldModel/specification/compiler';

describe('V5.2 living world decorator — pure canonical plan', () => {
  it('derives ambience from the real generated road graph and never invents vehicles for 1900', () => {
    const early = generateSpecifiedWorld(buildHistoricalWorldSpecification({ place: 'Warsaw', year: 1900 }));
    const modern = generateSpecifiedWorld(buildHistoricalWorldSpecification({ place: 'Warsaw', year: 2026 }));
    const a = buildLivingWorldPlan(early.graph, { year: 1900 });
    const b = buildLivingWorldPlan(modern.graph, { year: 2026 });
    expect(a.roads.length).toBeGreaterThan(0);
    expect(a.vehicleCount).toBe(0);
    expect(b.vehicleCount).toBeGreaterThan(0);
    expect(b.streetLightCount).toBeGreaterThan(0);
    expect(b.roads.map((r) => [r.start, r.end, r.widthM])).toEqual(a.roads.map((r) => [r.start, r.end, r.widthM]));
  });

  it('is deterministic and respects hard density caps', () => {
    const world = generateSpecifiedWorld(buildHistoricalWorldSpecification({ place: 'London', year: 2026 }));
    const opts = { year: 2026, maxStreetLights: 3, maxVehicles: 2, maxBenches: 1, maxTreeFields: 1 } as const;
    expect(buildLivingWorldPlan(world.graph, opts)).toEqual(buildLivingWorldPlan(world.graph, opts));
    const plan = buildLivingWorldPlan(world.graph, opts);
    expect(plan.streetLightCount).toBeLessThanOrEqual(3);
    expect(plan.vehicleCount).toBeLessThanOrEqual(2);
    expect(plan.benchCount).toBeLessThanOrEqual(1);
    expect(plan.parkFields.length).toBeLessThanOrEqual(1);
  });
});
