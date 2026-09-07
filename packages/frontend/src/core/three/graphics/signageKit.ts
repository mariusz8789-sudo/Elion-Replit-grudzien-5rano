import type * as THREE_NS from 'three';
import { createColumn, createPipe } from './primitives';

/**
 * GENESIS GRAPHICS RUNTIME — Signage / Wayfinding Kit
 *
 * Three reusable signage primitives, composed from `primitives.ts`'s existing column/pipe pieces
 * (same convention as `streetKit.ts`/`labKit.ts`): a post-mounted sign (a stop sign, a directional
 * placard, a parking sign), a wall-mounted sign (flush building signage — a name plate, an exit
 * sign), and a hanging bracket sign (a shop sign projecting from a wall on an arm, read from the
 * sidewalk rather than face-on). `epidemicCity3D.ts`'s own `createBuilding` already inlines one
 * hand-tuned sign mesh per building — that stays as-is (real regression risk for an already-shipped,
 * hand-tuned renderer, no measured benefit); this kit is for any OTHER signage a scene needs without
 * re-deriving that geometry, matching the exact reasoning `labKit.ts`'s own module doc gives for not
 * retrofitting `labScene3D.ts`'s bespoke hero furniture.
 *
 * Every function returns a plain `THREE.Group`/`THREE.Mesh` — geometry-and-placement only, no
 * material opinion beyond what's passed in, no scene management, matching `primitives.ts`'s own
 * convention. `position` is always where the object visually STANDS/MOUNTS (its base or wall
 * attachment point), never an arbitrary geometry origin.
 */

export interface PostSignOptions {
  /** Where the post's base stands, at the ground. */
  position: THREE_NS.Vector3Tuple;
  /** Which way the panel faces, radians around Y. Default 0 (+Z). */
  headingRadians?: number;
  panelWidth: number;
  panelHeight: number;
  panelThickness?: number;
  /** Height from the ground to the panel's vertical center. Default 1.1 (eye-level-ish for a
   * pedestrian sign; raise for a traffic-facing sign). */
  panelCenterHeight?: number;
  postRadius?: number;
  postMaterial: THREE_NS.Material;
  panelMaterial: THREE_NS.Material;
}

export interface SignHandle {
  group: THREE_NS.Group;
}

/** A sign mounted on a single vertical post — a stop sign, a directional placard, a parking-rules
 * sign. The post rises from the ground to the panel's own top edge, matching a real sign's silhouette
 * rather than floating the panel independently of its support. */
export function createPostSign(THREE: typeof THREE_NS, options: PostSignOptions): SignHandle {
  const panelCenterHeight = options.panelCenterHeight ?? 1.1;
  const postHeight = panelCenterHeight + options.panelHeight / 2;
  const group = new THREE.Group();
  group.name = 'genesis-post-sign';
  group.rotation.y = options.headingRadians ?? 0;
  group.position.set(...options.position);

  group.add(createColumn(THREE, options.postMaterial, { position: [0, 0, 0], height: postHeight, radius: options.postRadius ?? 0.025 }));

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(options.panelWidth, options.panelHeight, options.panelThickness ?? 0.02),
    options.panelMaterial,
  );
  panel.position.set(0, panelCenterHeight, 0);
  group.add(panel);

  return { group };
}

export interface WallSignOptions {
  /** Center of the sign panel, at the wall's own surface. */
  position: THREE_NS.Vector3Tuple;
  /** Outward-facing normal direction of the wall, radians around Y. Default 0 (+Z). */
  headingRadians?: number;
  width: number;
  height: number;
  thickness?: number;
  material: THREE_NS.Material;
}

/** A sign mounted flush against a wall — a building name plate, an exit/entrance sign, a unit
 * number. A thin box (not a bare plane) so it reads with real depth/edge shading under a key light,
 * offset half its thickness outward so it doesn't z-fight the wall it mounts to. */
export function createWallSign(THREE: typeof THREE_NS, options: WallSignOptions): THREE_NS.Mesh {
  const thickness = options.thickness ?? 0.02;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(options.width, options.height, thickness), options.material);
  mesh.rotation.y = options.headingRadians ?? 0;
  const [px, py, pz] = options.position;
  const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), options.headingRadians ?? 0);
  mesh.position.set(px + normal.x * (thickness / 2), py, pz + normal.z * (thickness / 2));
  return mesh;
}

export interface HangingSignOptions {
  /** Where the bracket mounts on the wall. */
  position: THREE_NS.Vector3Tuple;
  /** Outward-facing direction the bracket projects, radians around Y. Default 0 (+Z). */
  headingRadians?: number;
  /** How far the bracket projects out from the wall before the sign hangs down. */
  armLength: number;
  /** How far below the bracket's outer end the panel hangs. */
  dropHeight: number;
  panelWidth: number;
  panelHeight: number;
  bracketRadius?: number;
  bracketMaterial: THREE_NS.Material;
  panelMaterial: THREE_NS.Material;
}

/** A sign hanging from a wall-mounted bracket arm — a shop sign meant to be read from the sidewalk
 * (perpendicular to the wall), not face-on like `createWallSign`. The bracket is a real `createPipe`
 * run from the wall mount to the panel's hang point, so its length/angle always matches where the
 * panel actually ends up, rather than an independently-eyeballed decorative arm. */
export function createHangingSign(THREE: typeof THREE_NS, options: HangingSignOptions): SignHandle {
  const heading = options.headingRadians ?? 0;
  const [px, py, pz] = options.position;
  const dir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading);
  const outerPoint: THREE_NS.Vector3Tuple = [px + dir.x * options.armLength, py, pz + dir.z * options.armLength];

  const group = new THREE.Group();
  group.name = 'genesis-hanging-sign';
  group.add(createPipe(THREE, options.bracketMaterial, { from: [px, py, pz], to: outerPoint, radius: options.bracketRadius ?? 0.018 }));

  const panelCenterY = py - options.dropHeight - options.panelHeight / 2;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(options.panelWidth, options.panelHeight, 0.02), options.panelMaterial);
  panel.rotation.y = heading;
  panel.position.set(outerPoint[0], panelCenterY, outerPoint[2]);
  group.add(panel);

  // A drop of ~0 means the panel already sits right at the bracket's end — no separate vertical
  // hanger segment to draw (createPipe would otherwise reject a zero-length run).
  if (options.dropHeight > 1e-4) {
    const hanger = createPipe(THREE, options.bracketMaterial, {
      from: outerPoint, to: [outerPoint[0], panelCenterY + options.panelHeight / 2, outerPoint[2]], radius: (options.bracketRadius ?? 0.018) * 0.6,
    });
    group.add(hanger);
  }

  return { group };
}
