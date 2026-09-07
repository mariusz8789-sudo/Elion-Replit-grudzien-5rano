import type { EntityGrounding as GraphicsEntityGrounding, WorldFrame as GraphicsWorldFrame, WorldFrameEntity as GraphicsWorldFrameEntity } from '../../three/graphics/worldFrame';
import type { GroundingLevel } from '../ecs/types';
import type { WorldFrameEntity, WorldFrameState } from './worldFrameState';

/**
 * C1/C2 INTEGRATION (Genesis Scientific World Model 3.0, section 15) — the
 * REAL adapter between C3's canonical `WorldFrameState` (this module's own
 * `getFrameState`) and C2's `core/three/graphics/worldFrame.ts::WorldFrame`,
 * the actual input the graphics engine's `WorldFrameRenderer` consumes.
 *
 * These are two independently-designed, same-intent, different-shaped
 * contracts (C2's `worldFrame.ts` was written before C3 existed on this
 * branch, and says so in its own doc comment: "write a thin adapter that
 * maps the real contract onto this shape... since this shape only asks for
 * what any reasonable render contract would already have"). This file IS
 * that thin adapter — it does not change either contract, does not
 * redesign C2's renderer, and is not a second render-state system: it only
 * maps field-for-field, once, in one direction (C3 -> C2), since C2 never
 * needs to know how a frame was produced.
 *
 * `core/three/graphics/graphicsArchitectureBoundary.test.ts` forbids
 * `core/three/graphics/**` from importing anything scientific — it does
 * NOT forbid the reverse (C3 importing C2's plain-data `WorldFrame` TYPE
 * for adaptation purposes), which is exactly what this file does; nothing
 * here imports a THREE.js runtime value, only the type-only `Vector3Tuple`
 * `worldFrame.ts` itself already re-exports the shape of.
 */

/** C3's four-tier scientific honesty disclosure collapses onto C2's three-tier rendering-honesty disclosure: both `GROUNDED_EXACT` and `MODEL_ESTIMATE` come from a REAL solver (just different honesty tiers) and are `'MODELED'`; `PROCEDURAL_APPROXIMATION` is a real fallback heuristic, still `'DERIVED'`; only `UNGROUNDED_APPROXIMATION` (no domain binding at all) is honestly `'NOT_MODELED'`. */
export function toGraphicsGrounding(grounding: GroundingLevel): GraphicsEntityGrounding {
  switch (grounding) {
    case 'GROUNDED_EXACT':
      return 'MODELED';
    case 'MODEL_ESTIMATE':
      return 'MODELED';
    case 'PROCEDURAL_APPROXIMATION':
      return 'DERIVED';
    case 'UNGROUNDED_APPROXIMATION':
      return 'NOT_MODELED';
  }
}

function toGraphicsEntity(entity: WorldFrameEntity): GraphicsWorldFrameEntity {
  const { position, rotation, scale } = entity.transform;
  return {
    id: entity.id,
    parentId: entity.parentId,
    position: [position.x, position.y, position.z],
    rotation: [rotation.x, rotation.y, rotation.z],
    // C2's `scale` is a single characteristic scalar, not per-axis — C3's `SpatialComponent.scale`
    // is currently never set non-uniformly by any real domain/template, so `.x` is representative
    // today; a genuinely anisotropic entity would need a real per-axis contract on EITHER side
    // before this could do better than approximate it (documented limitation, not silently wrong).
    scale: scale.x,
    scalars: entity.scalars,
    status: entity.statusLabel,
    grounding: toGraphicsGrounding(entity.grounding),
    // Opaque hint for C2's own caller-supplied visual resolver (worldFrameRenderer.ts) — never
    // interpreted here or inside the renderer itself, exactly as that module's contract requires.
    visualHint: entity.ref.kind,
  };
}

/**
 * Converts a real C3 `WorldFrameState` into C2's `WorldFrame` — the only
 * function C1/C2 integration code needs to call. Uses `simulatedTime` (the
 * real elapsed simulated clock C3 already tracks) for C2's opaque `time`
 * field, rather than the raw tick count, since "a day count, seconds,
 * whatever the eventual C3 clock uses" (worldFrame.ts's own doc) already
 * describes `simulatedTime` exactly.
 */
export function toGraphicsWorldFrame(frame: WorldFrameState): GraphicsWorldFrame {
  return {
    time: frame.simulatedTime,
    entities: frame.entities.map(toGraphicsEntity),
  };
}
