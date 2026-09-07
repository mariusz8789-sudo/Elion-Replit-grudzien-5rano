import type * as THREE_NS from 'three';
import type { WorldFrameEntity } from './worldFrame';
import type { EntityVisualSpec } from './worldFrameRenderer';
import { createAtomSphere } from './moleculeKit';

/**
 * GENESIS GRAPHICS RUNTIME — Molecule WorldFrame Bridge (C3 integration seam)
 * ==========================================================================
 *
 * GRAPHICS V3, item 1. `ADAPTER_CONTRACT.md`-shaped resolver/updater pair for the two visual-hint
 * families `domains/molecularStructure.ts` actually produces once a molecule is materialised:
 *
 *  - `'molecule'` — the molecule ROOT entity. It has no geometry of its own (the atoms are what's
 *    visible); this resolves it to an empty, invisible anchor `Group` at local origin so it still
 *    participates in the frame (parenting, `WorldFrameRenderer` bookkeeping) without drawing
 *    anything extra.
 *  - `atom-<element>` — one real atom (`ref.kind` in `molecularStructure.ts`, e.g. `atom-c`,
 *    `atom-h`). Note this is an OPEN family, not a closed enum: an element symbol is one of ~118
 *    possible values, so the guard below is a PREFIX check (`startsWith('atom-')`), not a
 *    `KNOWN_STATES`-style `Set` — the one deliberate deviation from `ADAPTER_CONTRACT.md` §1's
 *    "enumerate every hint" convention, and it's deviated for the same reason Rule 4 in
 *    `SOLVER_DATA_CONTRACT.md` lets `ref.kind` double as an open per-element batch key.
 *
 * WHY THIS ADAPTER'S `isReallyModeled()` GATE IS SIMPLER THAN THE WATER BRIDGE'S: an atom entity
 * does not exist in the graph AT ALL until it is really materialised — `applyMoleculeGeometry`
 * only ever creates atom entities from real RDKit output, never a placeholder atom with an unset
 * status. There is no "atom exists but its state is unknown" case to gate against with a
 * `KNOWN_STATES` allowlist (unlike a pump, which exists in the world whether or not its FAILED/
 * NORMAL reading is known). So the gate here collapses to the one condition that still matters —
 * `entity.grounding !== 'NOT_MODELED'` — which is also, per `worldFrameRenderer.ts`'s own doc,
 * almost always already true by the time an entity reaches this resolver at all (a `NOT_MODELED`
 * entity is intercepted earlier and never calls in here). Re-checked anyway in `updateVisual`,
 * matching every other adapter in this engine, since grounding can change between syncs.
 *
 * BONDS ARE DELIBERATELY NOT BUILT HERE. `ADAPTER_CONTRACT.md` rule 4/8 is explicit: a real
 * cross-entity connector (this domain's bond, the water bridge's pump-to-building pipe) cannot be
 * built inside a single-entity `resolveVisual` — it needs both endpoints' positions at once, which
 * only the SCENE has. The scene that owns a molecule's `TemporalEngine` (`moleculeScene3D.ts`)
 * builds bonds directly via `graphics/moleculeKit.ts`'s `createBond`, gated on the real
 * `bondsMaterialised` numeric scalar and decoding real `bondOrderOf`/`MOLECULAR_BOND_KIND` values
 * from `worldModel/domains/molecularStructure.ts` — a module this file may NOT import
 * (`graphicsArchitectureBoundary.test.ts` forbids `graphics/**` from reaching into `worldModel/**`;
 * the scene lives outside `graphics/` specifically so it can).
 */

export type MoleculeVisualHint = 'molecule' | `atom-${string}`;

/** Prefix-based, not a `Set`: element symbols are an open family (see module doc). */
export function isMoleculeVisualHint(hint: string | undefined): hint is MoleculeVisualHint {
  return hint === 'molecule' || (hint !== undefined && hint.startsWith('atom-'));
}

function elementOfAtomHint(hint: string): string {
  return hint.slice('atom-'.length);
}

function isReallyModeled(entity: WorldFrameEntity): boolean {
  return entity.grounding !== 'NOT_MODELED';
}

export interface MoleculeAdapterMaterials {
  /** Shared per-element atom material, keyed by UPPERCASE element symbol (`'C'`, `'H'`, ...).
   * Missing entries fall back to `graphics/moleculeKit.ts`'s own `elementStyleOf` default color —
   * this map only exists so a caller can share ONE material instance per element across every atom
   * of that element (the same "one shared instance per category" convention `materials.ts` uses),
   * not to override the CPK convention itself. */
  atomMaterials?: Readonly<Record<string, THREE_NS.Material>>;
}

export interface MoleculeAdapter {
  resolveVisual(entity: WorldFrameEntity): EntityVisualSpec;
  updateVisual(entity: WorldFrameEntity, object: THREE_NS.Object3D): void;
  dispose(): void;
}

export function createMoleculeAdapter(
  THREE: typeof THREE_NS,
  materials: MoleculeAdapterMaterials = {},
): MoleculeAdapter {
  function build(entity: WorldFrameEntity): THREE_NS.Object3D {
    const hint = entity.visualHint as MoleculeVisualHint | undefined;
    if (hint === 'molecule') {
      const anchor = new THREE.Group();
      anchor.name = 'genesis-molecule-root';
      return anchor;
    }
    const element = elementOfAtomHint(hint ?? 'atom-?');
    const material = materials.atomMaterials?.[element.toUpperCase()];
    return createAtomSphere(THREE, { element, material });
  }

  return {
    resolveVisual(entity) {
      const object = build(entity);
      object.userData.moleculeVisualHint = entity.visualHint;
      // Set once at creation; `updateVisual` re-sets it every sync too, since grounding can change
      // between one sync and the next (see module doc).
      object.userData.notModeled = !isReallyModeled(entity);
      return { kind: 'object', object };
    },
    updateVisual(entity, object) {
      // A conformer is static (`molecularStructure.ts`'s own solver "deliberately advances
      // nothing") — there is no per-frame state transition to drive here, only the honesty tag,
      // re-checked every sync per ADAPTER_CONTRACT.md rule 3.
      object.userData.notModeled = !isReallyModeled(entity);
    },
    dispose() {
      // No per-entity bookkeeping is kept (unlike the water bridge's `setState` handles) — an atom
      // has no state-transition method to look up later.
    },
  };
}
