import type * as THREE_NS from 'three';
import type { WorldFrameEntity } from './worldFrame';
import type { EntityVisualSpec } from './worldFrameRenderer';
import { createPump, createValve, createStorageTank, type WaterInfrastructureState } from './waterInfrastructure';

/**
 * GENESIS GRAPHICS RUNTIME — Water Infrastructure WorldFrame Bridge (C3 integration seam)
 * ==========================================================================================
 *
 * THIS IS THE SEAM, NOT THE SCIENCE. There is currently no real, city-spatial, stateful water/pump
 * entity anywhere in C1/C3 — the only "pump" that exists today (`core/engineeringGraph/pumpPipe.ts`)
 * is an isolated, static engineering-sensitivity demo with no id, no position, no failure state, and
 * no connection to any WorldFrame or hospital. Building a fake one here (an invented pump id, a
 * guessed position, a `fail()` method with no model behind it) would be exactly the kind of
 * fabricated Trinity integration this engine's own rules forbid — see `waterInfrastructure.ts`'s own
 * module doc for the same boundary stated at the kit level.
 *
 * What this file IS: the `WorldFrameRenderer` resolver/updater pair a REAL future C3 water-system
 * WorldFrame producer plugs into, so that the day C3 publishes a real pump/valve/tank entity, wiring
 * it into a production scene is "pass its WorldFrame through this adapter" — not "write a new
 * renderer." Until that day, this module has exactly one honest behavior for an entity with no real
 * state: render the correct real geometry (via `waterInfrastructure.ts`, not a placeholder box) at
 * the correct position, but NEVER invent a dynamic state — no entity, or an entity with
 * `grounding: 'NOT_MODELED'` or an unrecognized `status`, always stays visually neutral and is
 * tagged `userData.notModeled = true` so a caller (a test, an inspector panel) can tell at a glance
 * that this component's appearance is not backed by any real model.
 *
 * VISUAL HINTS THIS RESOLVER UNDERSTANDS: `'object:water-pump'`, `'object:water-valve'`,
 * `'object:water-tank'` — a `WorldFrameEntity` with any other `visualHint` is not this module's
 * concern (a caller composing multiple domains would only route matching entities here).
 *
 * STATE CONTRACT: only a `status` that is one of `waterInfrastructure.ts`'s own
 * `WaterInfrastructureState` values (`'NORMAL' | 'WARNING' | 'FAILED' | 'OFFLINE'`) AND
 * `grounding !== 'NOT_MODELED'` (the default `'MODELED'`/omitted case) drives the pump's real status
 * light. Anything else — missing status, an unrecognized string, explicit `'NOT_MODELED'` grounding —
 * leaves the component at its safe default appearance. This is the one and only place a red
 * "FAILED" look can legitimately appear: driven by a real caller-supplied status, never by this
 * module's own initiative.
 *
 * THIS FILE IS THE REFERENCE IMPLEMENTATION of a general pattern, written up separately as
 * `graphics/ADAPTER_CONTRACT.md` — read that document before building the next domain's adapter
 * (weather/structural/fire/traffic/quantum/whatever C3's consolidation audit ships next), so its
 * honesty rules are followed from a written standard instead of re-derived from scratch.
 */

export type WaterInfrastructureVisualHint = 'object:water-pump' | 'object:water-valve' | 'object:water-tank';

const WATER_INFRASTRUCTURE_VISUAL_HINTS: ReadonlySet<string> = new Set<WaterInfrastructureVisualHint>([
  'object:water-pump', 'object:water-valve', 'object:water-tank',
]);

/** Whether `hint` is one this bridge renders — lets a multi-domain caller route only matching
 * entities here without duplicating the hint list. */
export function isWaterInfrastructureVisualHint(hint: string | undefined): hint is WaterInfrastructureVisualHint {
  return hint !== undefined && WATER_INFRASTRUCTURE_VISUAL_HINTS.has(hint);
}

const KNOWN_STATES: ReadonlySet<string> = new Set<WaterInfrastructureState>(['NORMAL', 'WARNING', 'FAILED', 'OFFLINE']);

function isReallyModeled(entity: WorldFrameEntity): entity is WorldFrameEntity & { status: WaterInfrastructureState } {
  return entity.grounding !== 'NOT_MODELED' && KNOWN_STATES.has(entity.status ?? '');
}

export interface WaterInfrastructureAdapterMaterials {
  housingMaterial: THREE_NS.Material;
  pipeMaterial?: THREE_NS.Material;
  valveMaterial?: THREE_NS.Material;
  tankMaterial?: THREE_NS.Material;
}

interface TrackedHandle {
  setState?(state: WaterInfrastructureState): void;
}

export interface WaterInfrastructureAdapter {
  /** Plug directly into `new WorldFrameRenderer(THREE, scene, { resolveVisual: adapter.resolveVisual })`. */
  resolveVisual(entity: WorldFrameEntity): EntityVisualSpec;
  /** Plug directly into the SAME renderer's `updateVisual` option. */
  updateVisual(entity: WorldFrameEntity, object: THREE_NS.Object3D): void;
  /** Forgets per-entity handles — call when the owning `WorldFrameRenderer` is disposed (the objects
   * themselves are disposed by the renderer; this only releases this adapter's own bookkeeping). */
  dispose(): void;
}

/**
 * Builds the resolver/updater pair described in the module doc. `materials` are caller-owned (this
 * module never disposes them), matching every other kit in this engine.
 */
export function createWaterInfrastructureAdapter(
  THREE: typeof THREE_NS,
  materials: WaterInfrastructureAdapterMaterials,
): WaterInfrastructureAdapter {
  const handles = new Map<string, TrackedHandle>();

  function build(entity: WorldFrameEntity): { object: THREE_NS.Object3D; handle: TrackedHandle } {
    switch (entity.visualHint as WaterInfrastructureVisualHint) {
      case 'object:water-valve': {
        const object = createValve(THREE, { position: [0, 0, 0], material: materials.valveMaterial ?? materials.housingMaterial });
        return { object, handle: {} };
      }
      case 'object:water-tank': {
        const object = createStorageTank(THREE, { position: [0, 0, 0], radius: 0.3, height: 0.6, bodyMaterial: materials.tankMaterial ?? materials.housingMaterial });
        return { object, handle: {} };
      }
      case 'object:water-pump':
      default: {
        // Default case only reachable if a caller sends an unrecognized hint through this adapter
        // anyway (see isWaterInfrastructureVisualHint for the intended guard) — a real pump is still
        // the most honest fallback geometry (never an empty group).
        const pump = createPump(THREE, {
          position: [0, 0, 0], housingMaterial: materials.housingMaterial, pipeMaterial: materials.pipeMaterial, state: 'NORMAL',
        });
        return { object: pump.group, handle: { setState: pump.setState } };
      }
    }
  }

  return {
    resolveVisual(entity) {
      const { object, handle } = build(entity);
      handles.set(entity.id, handle);
      object.userData.waterInfrastructureVisualHint = entity.visualHint;
      // Set once at creation; `updateVisual` (below) keeps it correct on every later sync too, since
      // an entity can transition from real-backed to not (or vice versa) between frames.
      object.userData.notModeled = !isReallyModeled(entity);
      return { kind: 'object', object };
    },
    updateVisual(entity, object) {
      const grounded = isReallyModeled(entity);
      object.userData.notModeled = !grounded;
      if (!grounded) return; // never drive a state transition from absent/unmodeled data
      handles.get(entity.id)?.setState?.(entity.status as WaterInfrastructureState);
    },
    dispose() {
      handles.clear();
    },
  };
}
