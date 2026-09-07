import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — WorldFrame (minimal internal render contract)
 * ==========================================================================
 *
 * THIS IS NOT THE FINAL C1/C3 CONTRACT. Neither C1 nor C3 has published a real `WorldFrame` type
 * as of this writing (checked both `core/lookingGlass/` and `core/world/` on C1's branch before
 * writing this file — nothing there shapes entity transforms/hierarchy/scalar-state generically
 * for rendering). Inventing a large, guessed C3 API here would be exactly the "giant speculative
 * system" this engine's own rules forbid.
 *
 * What this IS: the smallest generic shape `worldFrameRenderer.ts` needs to turn a frame of
 * entities into a scene, kept in ONE small, isolated file specifically so it's cheap to replace —
 * either delete this file and re-point `worldFrameRenderer.ts` at the real contract once C1/C3
 * publish one, or (more likely) write a thin adapter that maps the real contract onto this shape,
 * since this shape only asks for what any reasonable render contract would already have: a
 * transform, a hierarchy, generic scalar/status channels, and an honesty flag.
 *
 * EVERY FIELD IS GENERIC ON PURPOSE. There is no `type: 'hospital'`, no `kind: 'agent'`. The
 * renderer that consumes this must never branch on what an entity scientifically IS — only on its
 * transform, hierarchy, scale, scalar values, and grounding. See `worldFrameRenderer.ts`'s own doc
 * for exactly where domain knowledge is allowed to enter (a caller-supplied resolver function) and
 * where it is not (anywhere inside the renderer itself).
 */

export type WorldFrameEntityId = string;

/**
 * How real this entity's rendered state actually is — directly generalizes the "provenance" idea
 * already proven in this codebase's `core/world/worldEngineInterface.ts` (`FieldProvenance`:
 * MODEL_DERIVED/WORLD_DERIVED/NOT_MODELED), but at the entity level instead of the field level,
 * and owned here rather than imported from there (that file is C1/Scientific-Core's own contract,
 * about movement/contact provenance specifically — this is a smaller, renderer-facing echo of the
 * same idea, not a dependency on it; importing across that boundary would violate the architecture
 * firewall `graphicsArchitectureBoundary.test.ts` enforces).
 *
 * `NOT_MODELED` is not "hidden" — it's the input for `worldFrameRenderer.ts`'s honest-boundary
 * placeholder (see its module doc): an entity that conceptually exists (its parent/context is real)
 * but has no real state to show yet must still be visually acknowledged, never silently dropped
 * and never rendered as if it had real detail.
 */
export type EntityGrounding = 'MODELED' | 'DERIVED' | 'NOT_MODELED';

export interface WorldFrameEntity {
  id: WorldFrameEntityId;
  /** Another entity's id in the SAME frame, or omitted/null for a root-level entity. Purely
   * structural — the renderer parents this entity's Object3D under the parent's, nothing more. */
  parentId?: WorldFrameEntityId | null;
  /** Position relative to the parent (or world space, for a root entity). */
  position: THREE_NS.Vector3Tuple;
  /** Euler angles in radians. Optional — omitted means no rotation. */
  rotation?: THREE_NS.Vector3Tuple;
  /** Characteristic scale of this entity in world units — feeds both the visual's own scale
   * transform AND, separately, a camera shot's `targetRadius` (see `cameraRig.ts`) when a caller
   * frames a shot on this entity. Default 1 when omitted. */
  scale?: number;
  /** Generic named scalar channels — e.g. `{ temperature: 37.2, risk: 0.8 }`. The renderer never
   * interprets these; a caller-supplied resolver (see `worldFrameRenderer.ts`) decides what, if
   * anything, to do with them via the existing `stateVisualization.ts` utilities. */
  scalars?: Readonly<Record<string, number>>;
  /** An opaque state string — same non-interpretation rule as `scalars`: the renderer passes it
   * through to the resolver, never branches on its value itself.
   *
   * WHAT ACTUALLY ARRIVES HERE, and why a resolver must not assume otherwise: when a frame is built
   * by the generic `worldModel/bridge/graphicsWorldFrameAdapter.ts`, this field carries C3's
   * `statusLabel`, which every real solver writes as a HUMAN-READABLE DESCRIPTION (`'Pump tripped
   * (overload protection)'`, `` `I=42 R=13 D=2 (day 7.5)` ``) — not a discrete token. A scene that
   * needs a discrete state (for an adapter's `KNOWN_STATES` allowlist) derives it deterministically
   * from a real numeric `scalars` value and puts the derived token here itself — the production
   * pattern in `genesisScientificCitySim.ts`. See `ADAPTER_CONTRACT.md` §2's RULE box and
   * `SOLVER_DATA_CONTRACT.md` Rule 3. */
  status?: string;
  /** Default `'MODELED'` when omitted (the common case: this entity has a real, resolvable
   * visual). See `EntityGrounding`'s own doc for what `'NOT_MODELED'` triggers. */
  grounding?: EntityGrounding;
  /** Free-form hint for the caller's own visual resolver (e.g. `'agent'`, `'building'`,
   * `'instanced:tree'`) — opaque to the renderer itself, which only ever passes it through. Doubles
   * as the batch key for instanced entities (see `EntityVisualSpec`'s `'instanced'` variant). */
  visualHint?: string;
  /** Default `true`. An explicit `false` removes/hides the entity without requiring the caller to
   * omit it from the frame entirely (useful when a caller wants to keep an entity's other state
   * around while it's temporarily not shown). */
  visible?: boolean;
}

/**
 * A connector between two entities, by id. Generic on purpose, exactly like every other field
 * here: there is no `type: 'bond'` — `kind` is an opaque token the renderer never branches on,
 * passed to the caller's own resolver in the same way `visualHint` and `status` already are.
 *
 * Both endpoints are entity ids present in the SAME frame, never array indices (an index breaks
 * the moment frame membership changes). A scene that wants to draw connectors builds them itself
 * once both endpoints are known — `worldFrameRenderer.ts` does not, and must not, infer a
 * connector's existence from anything else, least of all from how close two entities happen to be.
 */
export interface WorldFrameRelationship {
  from: WorldFrameEntityId;
  to: WorldFrameEntityId;
  /** Opaque edge label (e.g. `'bond-aromatic'`, `'feedsInto'`). Never interpreted by the renderer. */
  kind: string;
}

export interface WorldFrame {
  /** Simulation/model time this frame represents — opaque to the renderer (a day count, seconds,
   * whatever the eventual C3 clock uses); carried through only for a caller's own bookkeeping. */
  time: number;
  entities: readonly WorldFrameEntity[];
  /** Optional and additive: a frame without edges behaves exactly as before. Omitted or empty
   * means "this frame states no connectors", which is NOT the same as "these entities are
   * unconnected" — a producer that models no edges simply does not fill this in. */
  relationships?: readonly WorldFrameRelationship[];
}
