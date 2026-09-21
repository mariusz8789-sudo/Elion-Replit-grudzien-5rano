import { describe, expect, it } from 'vitest';
import { findScientificInteriorTarget } from '../core/temporalCinematic/scientificInteriorVisuals';
import { buildHistoricalWorldSpecification } from '../core/temporalCinematic/historicalWorldParameters';
import { applyGeometryRenderReadiness } from '../core/temporalCinematic/renderReadiness';
import { generateSpecifiedWorld } from '../core/worldModel/specification/compiler';

describe('V6 generated scientific interiors', () => {
  it('uses the SAME generated WorldGraph and finds a real ROOM + its canonical ASSET_SLOTs', () => {
    const spec = buildHistoricalWorldSpecification({ place: 'Geneva', year: 2026, generateInteriors: true });
    const generated = generateSpecifiedWorld(spec);
    applyGeometryRenderReadiness(generated.graph);
    const target = findScientificInteriorTarget(generated.graph);
    expect(target).not.toBeNull();
    expect(target!.roomId).toMatch(/^room:/);
    const room = generated.graph.getEntity(target!.roomId);
    expect(room.geometry?.kind).toBe('ROOM');
    for (const slotId of target!.assetSlotIds) {
      const slot = generated.graph.getEntity(slotId);
      expect(slot.geometry?.kind).toBe('ASSET_SLOT');
    }
  });

  it('has no interior target when generation explicitly leaves interiors off', () => {
    const generated = generateSpecifiedWorld(buildHistoricalWorldSpecification({ place: 'Geneva', year: 2026, generateInteriors: false }));
    expect(findScientificInteriorTarget(generated.graph)).toBeNull();
  });
});
