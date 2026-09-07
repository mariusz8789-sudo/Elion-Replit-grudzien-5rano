import type * as THREE_NS from 'three';
import { createPipe } from './primitives';

/**
 * GENESIS GRAPHICS RUNTIME — Molecule Kit
 *
 * GRAPHICS V3, item 1: the ball-and-stick primitives for rendering real RDKit-materialised atoms
 * and bonds (`worldModel/domains/molecularStructure.ts`, `SOLVER_DATA_CONTRACT.md` §C). Every
 * cylinder here is `primitives.ts`'s own `createPipe` — the same from/to-world-point pipe run
 * `waterInfrastructure.ts`/`electricalKit.ts`/`signageKit.ts` already use for a pump's plumbing, a
 * conduit run, and a sign's mounting bracket respectively. A bond IS a pipe run, geometrically; this
 * module adds nothing to that primitive except the per-order/aromatic multi-cylinder layout and the
 * element color/radius table, not a second cylinder-orientation implementation.
 *
 * CPK COLORING IS A REAL CONVENTION, NOT FABRICATED DATA — worth stating because this whole engine's
 * rule is "never fabricate a scientific reading." Element→color (Corey-Pauling-Koltun, the standard
 * used by every molecular viewer: PyMOL, Jmol, RDKit's own drawing code) and the approximate
 * covalent-radius-derived ball sizes below are a REPRESENTATION convention — exactly the same
 * honesty tier as `waterInfrastructureBridge.ts` mapping a `FAILED` status to red geometry. They
 * carry no claim about a specific measured atom; they are how *any* atom of that element is drawn.
 *
 * WHAT THIS MODULE DOES NOT DO: decide which pairs of atoms are bonded, or with what order. That is
 * `domains/molecularStructure.ts`'s `bondKindOf`/real RDKit topology, carried through
 * `SOLVER_DATA_CONTRACT.md` §C's edge channel — this module only draws whatever pair/order it is
 * given. It never infers a bond from atom distance; see `SOLVER_DATA_CONTRACT.md` §C for exactly
 * why a distance-guessed bond is worse than no bond at all.
 */

/** Real, standard CPK element colors + approximate ball radii (a fraction of covalent radius — the
 * standard ball-and-stick convention, since a true van-der-Waals sphere would swallow the bonds).
 * Covers the common organic/biochemistry elements (Phase 4's own scope: user-supplied SMILES);
 * anything outside this table uses `DEFAULT_ELEMENT_STYLE` rather than guessing a color. */
export interface ElementStyle {
  /** CPK color, standard convention. */
  color: number;
  /** Ball radius in world units at `angstromPerWorldUnit = 1` (matches
   * `molecularStructure.ts`'s `DEFAULT_ANGSTROM_PER_WORLD_UNIT`) — roughly 25-30% of the element's
   * real covalent radius, the same visual proportion every standard molecular viewer uses so bonds
   * stay visible between the balls. */
  radius: number;
}

export const ELEMENT_STYLE: Readonly<Record<string, ElementStyle>> = {
  H: { color: 0xffffff, radius: 0.11 },
  C: { color: 0x404040, radius: 0.20 },
  N: { color: 0x3050f8, radius: 0.19 },
  O: { color: 0xff0d0d, radius: 0.18 },
  F: { color: 0x90e050, radius: 0.17 },
  P: { color: 0xff8000, radius: 0.25 },
  S: { color: 0xffff30, radius: 0.24 },
  CL: { color: 0x1ff01f, radius: 0.24 },
  BR: { color: 0xa62929, radius: 0.28 },
  I: { color: 0x940094, radius: 0.31 },
  NA: { color: 0xab5cf2, radius: 0.30 },
  K: { color: 0x8f40d4, radius: 0.35 },
  MG: { color: 0x8aff00, radius: 0.28 },
  CA: { color: 0x3dff00, radius: 0.32 },
  FE: { color: 0xe06633, radius: 0.26 },
  ZN: { color: 0x7d80b0, radius: 0.25 },
};

/** Anything not in `ELEMENT_STYLE` — a real, visible fallback, never an invented per-element guess. */
export const DEFAULT_ELEMENT_STYLE: ElementStyle = { color: 0xe040e0, radius: 0.2 };

export function elementStyleOf(element: string): ElementStyle {
  return ELEMENT_STYLE[element.toUpperCase()] ?? DEFAULT_ELEMENT_STYLE;
}

export interface AtomSphereOptions {
  element: string;
  material?: THREE_NS.Material;
  /** Overrides `elementStyleOf(element).radius` — for a caller with its own scale convention. */
  radius?: number;
}

/**
 * One atom, at LOCAL ORIGIN (per `ADAPTER_CONTRACT.md` rule 4 — `WorldFrameRenderer.applyTransform`
 * owns absolute position). `material` defaults to a plain `MeshStandardMaterial` in the element's
 * CPK color; pass one in to share a single material instance across every atom of that element
 * (the `InstancedMesh`-free equivalent of `materials.ts`'s "one shared instance per category").
 */
export function createAtomSphere(THREE: typeof THREE_NS, options: AtomSphereOptions): THREE_NS.Mesh {
  const style = elementStyleOf(options.element);
  const radius = options.radius ?? style.radius;
  const material = options.material ?? new THREE.MeshStandardMaterial({ color: style.color, roughness: 0.45, metalness: 0.08 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 16), material);
  mesh.name = `genesis-molecule-atom-${options.element.toLowerCase()}`;
  return mesh;
}

/** Perpendicular unit offset to `direction`, for laying multiple parallel bond cylinders side by
 * side. Picks a reference axis not parallel to `direction` (world-up, falling back to world-X for a
 * vertical bond) so the cross product is never degenerate. */
function perpendicularOffset(THREE: typeof THREE_NS, direction: THREE_NS.Vector3): THREE_NS.Vector3 {
  const reference = Math.abs(direction.y) > 0.98 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3().crossVectors(direction, reference).normalize();
}

export interface BondOptions {
  from: THREE_NS.Vector3Tuple;
  to: THREE_NS.Vector3Tuple;
  /** RDKit bond order: 1, 2, or 3 (aromatic's 1.5 is carried by `aromatic`, not this — see below). */
  order: number;
  /** `bondKindOf`'s aromatic case. Rendered as a SINGLE cylinder in a distinct material (never a
   * fake "1.5 cylinders") — the same real convention molecular viewers use to flag a ring bond as
   * aromatic without literally drawing a fractional bond, since aromaticity is a delocalization
   * property of the ring, not a stick count. */
  aromatic?: boolean;
  material: THREE_NS.Material;
  /** Material for the aromatic case — defaults to `material` if omitted (still renders, just
   * without the visual distinction a caller gets by supplying one). */
  aromaticMaterial?: THREE_NS.Material;
  radius?: number;
}

const DEFAULT_BOND_RADIUS = 0.035;
/** How far apart parallel double/triple-bond cylinders sit, as a fraction of the bond radius. */
const MULTI_BOND_SPACING = 2.4;

/**
 * A real bond: 1 cylinder for a single bond, 1 (distinctly materialed) for aromatic, 2 parallel for
 * double, 3 for triple — `createPipe` called once per cylinder, never a second orientation
 * implementation. Direct scene decoration (`ADAPTER_CONTRACT.md` rule 4/8): takes real WORLD
 * endpoints, like `createPipeNetwork`'s pump-to-building run, because a bond connects two entities
 * that `WorldFrameRenderer`'s single-entity `resolveVisual` cannot see both of at once.
 */
export function createBond(THREE: typeof THREE_NS, options: BondOptions): THREE_NS.Group {
  const group = new THREE.Group();
  group.name = 'genesis-molecule-bond';
  const radius = options.radius ?? DEFAULT_BOND_RADIUS;

  if (options.aromatic) {
    group.add(createPipe(THREE, options.aromaticMaterial ?? options.material, { from: options.from, to: options.to, radius: radius * 1.15 }));
    return group;
  }

  const strandCount = options.order >= 3 ? 3 : options.order === 2 ? 2 : 1;
  if (strandCount === 1) {
    group.add(createPipe(THREE, options.material, { from: options.from, to: options.to, radius }));
    return group;
  }

  const start = new THREE.Vector3(...options.from);
  const end = new THREE.Vector3(...options.to);
  const direction = end.clone().sub(start).normalize();
  const offsetAxis = perpendicularOffset(THREE, direction).multiplyScalar(radius * MULTI_BOND_SPACING);
  const strandRadius = radius * 0.6;
  for (let i = 0; i < strandCount; i++) {
    // Centered spread: e.g. 2 strands at [-0.5, +0.5] * offsetAxis, 3 at [-1, 0, +1] * offsetAxis.
    const t = i - (strandCount - 1) / 2;
    const offset = offsetAxis.clone().multiplyScalar(t);
    group.add(createPipe(THREE, options.material, {
      from: [start.x + offset.x, start.y + offset.y, start.z + offset.z],
      to: [end.x + offset.x, end.y + offset.y, end.z + offset.z],
      radius: strandRadius,
    }));
  }
  return group;
}
