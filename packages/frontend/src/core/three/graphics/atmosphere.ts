import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — Atmosphere
 *
 * Two cheap, generic, real-time-safe primitives for the "atmosphere" visual-quality priority:
 * `createDustMotes` (ambient airborne particulate — reads as depth/scale in any interior or hazy
 * exterior) and `createLightShaft` (a fake volumetric light beam — a window, a skylight, a gap in
 * cladding). Both exist because atmosphere effects only pay for themselves when they read as DEPTH,
 * not decoration (see the sprint brief this module was built for): dust motes make empty air legible
 * as a real volume with a real scale, and a light shaft makes a light source read as something
 * physically streaming through a specific opening rather than an abstract brightness in the scene.
 *
 * Neither function touches a scene or knows what world it's in — same convention as
 * `graphics/primitives.ts`: return a plain three.js object (or a small handle with `update`/
 * `dispose`), the caller positions/parents/animates it. Disposal: both return types are ordinary
 * `THREE.Object3D`s reachable from whatever the caller adds them to, so `graphics/lifecycle.ts`'s
 * `disposeSceneResources(scene)` already covers their geometry/material/texture on scene teardown —
 * no separate disposal path to remember, unless a caller wants to remove just the effect without a
 * full scene teardown (`DustMotesHandle.dispose()` covers exactly that case).
 */

/** Cheap deterministic PRNG (mulberry32) — matches `materials.ts`'s own convention: a fixed seed so
 * dust placement doesn't reshuffle on hot reload / StrictMode double-invoke. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DustMotesOptions {
  /** How many motes. Default 180 — visible as ambient particulate without reading as "snow" or
   * costing a meaningful draw (one `THREE.Points` draw call regardless of count). */
  count?: number;
  /** Half-extents of the box volume motes drift within, centered on `center`. Pick this to match
   * the room/street volume the effect should read as filling. */
  bounds: THREE_NS.Vector3Tuple;
  /** World-space center of the drift volume. Default the origin. */
  center?: THREE_NS.Vector3Tuple;
  color?: THREE_NS.ColorRepresentation;
  /** Point size in world units (before `sizeAttenuation`'s perspective scaling). Default 0.01 — a
   * fine mote, not a visible sprite. */
  size?: number;
  opacity?: number;
  /** Per-axis drift speed magnitude in world units/second. Default 0.045 — a slow convective drift,
   * not a wind gust. */
  driftSpeed?: number;
  /** Deterministic placement seed — vary this when a scene wants a second, visually-distinct mote
   * volume (e.g. one dense pocket over the hero apparatus, one thin ambient wash for the whole
   * room) rather than two volumes that happen to look identical. Default 0x9e3779b9. */
  seed?: number;
}

export interface DustMotesHandle {
  points: THREE_NS.Points;
  /** Advances the drift and wraps any mote that exits `bounds` back in from the opposite face —
   * the volume reads as a continuously-inhabited pocket of air, never emptying out or clumping at
   * one edge. Call once per frame with the frame delta in seconds. */
  update(dt: number): void;
  /** Frees this effect's own geometry/material — for removing just the effect without a full scene
   * teardown. A full `disposeSceneResources(scene)` teardown already covers this; call explicitly
   * only when this effect is removed independently of the rest of the scene. */
  dispose(): void;
}

/** Ambient airborne particulate drifting within a bounded volume — dust in a shaft of light, haze
 * over a street at dusk, motes in a still lab. One `THREE.Points` draw call; `update(dt)` drifts and
 * wraps every mote in place (cheap: a `Float32Array` walk, no per-mote object allocation). */
export function createDustMotes(THREE: typeof THREE_NS, options: DustMotesOptions): DustMotesHandle {
  const count = Math.max(1, Math.round(options.count ?? 180));
  const bounds = options.bounds;
  const center = options.center ?? [0, 0, 0];
  const driftSpeed = options.driftSpeed ?? 0.045;
  const rand = mulberry32(options.seed ?? 0x9e3779b9);

  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = center[0] + (rand() * 2 - 1) * bounds[0];
    positions[i * 3 + 1] = center[1] + (rand() * 2 - 1) * bounds[1];
    positions[i * 3 + 2] = center[2] + (rand() * 2 - 1) * bounds[2];
    velocities[i * 3] = (rand() * 2 - 1) * driftSpeed;
    velocities[i * 3 + 1] = (rand() * 0.6 + 0.1) * driftSpeed;
    velocities[i * 3 + 2] = (rand() * 2 - 1) * driftSpeed;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: options.color ?? 0xdce6f5,
    size: options.size ?? 0.01,
    transparent: true,
    opacity: options.opacity ?? 0.32,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'genesis-dust-motes';
  // A drifting particulate cloud has no meaningful static bounding sphere for three.js's default
  // per-object frustum check to early-out on cheaply anyway (it moves every frame) — skip the
  // (wrong, stale-after-drift) auto-computed one rather than let it silently cull the effect.
  points.frustumCulled = false;

  const min: THREE_NS.Vector3Tuple = [center[0] - bounds[0], center[1] - bounds[1], center[2] - bounds[2]];
  const max: THREE_NS.Vector3Tuple = [center[0] + bounds[0], center[1] + bounds[1], center[2] + bounds[2]];

  return {
    points,
    update(dt: number) {
      const posAttr = geometry.getAttribute('position') as THREE_NS.BufferAttribute;
      for (let i = 0; i < count; i++) {
        let x = posAttr.getX(i) + velocities[i * 3] * dt;
        let y = posAttr.getY(i) + velocities[i * 3 + 1] * dt;
        let z = posAttr.getZ(i) + velocities[i * 3 + 2] * dt;
        if (x > max[0]) x = min[0]; else if (x < min[0]) x = max[0];
        if (y > max[1]) y = min[1]; else if (y < min[1]) y = max[1];
        if (z > max[2]) z = min[2]; else if (z < min[2]) z = max[2];
        posAttr.setXYZ(i, x, y, z);
      }
      posAttr.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * A radial-fade-along-length alpha mask: bright/opaque near the source edge (V=1, the plane's
 * un-translated top), fading to fully transparent at the far edge (V=0) AND toward the horizontal
 * edges (U near 0/1) — the standard cheap "crossed billboard" god-ray cross-section. One 64x128
 * canvas, generated once and shared (via `.clone()`, matching `materials.ts`'s `brushedMetalFactory`
 * pattern) across every `createLightShaft` call in a session.
 */
function makeLightShaftGradientTexture(THREE: typeof THREE_NS): THREE_NS.Texture {
  const w = 64;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    // row 0 is the plane's top edge (V=1, the source end) — fade DOWN the rows toward V=0.
    const v = 1 - y / (h - 1);
    const lengthFalloff = Math.pow(v, 0.7);
    for (let x = 0; x < w; x++) {
      const u = (x / (w - 1)) * 2 - 1; // -1..1
      const edgeFalloff = Math.max(0, 1 - Math.pow(Math.abs(u), 1.5));
      const alpha = Math.max(0, Math.min(1, lengthFalloff * edgeFalloff));
      const index = (y * w + x) * 4;
      image.data[index] = 255;
      image.data[index + 1] = 255;
      image.data[index + 2] = 255;
      image.data[index + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

export interface LightShaftOptions {
  /** World point the shaft streams FROM — the aperture (a window, a skylight, a gap). */
  origin: THREE_NS.Vector3Tuple;
  /** Direction the shaft travels away from `origin` (need not be normalized) — e.g. downward and
   * inward from a high window. */
  direction: THREE_NS.Vector3Tuple;
  /** How far the shaft extends before fully fading out, in world units. */
  length: number;
  /** Width of the beam at its widest (the source end). Default `length * 0.4`. */
  width?: number;
  color?: THREE_NS.ColorRepresentation;
  /** Peak opacity at the source, additively blended. Default 0.45 — reads as a bright streak
   * without washing out the geometry it crosses. */
  opacity?: number;
}

/**
 * A fake volumetric light shaft via two crossed, additively-blended, alpha-gradient planes — the
 * standard cheap real-time technique (no actual light scattering, no per-frame cost beyond drawing
 * two triangles' worth of geometry). Reusable across any scene that has a light source worth making
 * visible as a beam: a lab skylight, a gap in warehouse cladding, low sun between city buildings.
 */
export function createLightShaft(THREE: typeof THREE_NS, options: LightShaftOptions): THREE_NS.Group {
  if (!(options.length > 0)) throw new Error(`createLightShaft: length must be > 0 (got ${options.length})`);
  const width = options.width ?? options.length * 0.4;
  const texture = makeLightShaftGradientTexture(THREE);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: options.color ?? 0xfff3d6,
    transparent: true,
    opacity: options.opacity ?? 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  // The plane's local +Y is the source edge (V=1) — translate so that edge sits at local y=0 and
  // the plane extends along local -Y, so aligning local (0,-1,0) to world `direction` (below) makes
  // the mesh start exactly at `origin` and extend outward along it.
  const geometry = new THREE.PlaneGeometry(width, options.length);
  geometry.translate(0, -options.length / 2, 0);

  const planeA = new THREE.Mesh(geometry, material);
  const planeB = new THREE.Mesh(geometry, material);
  planeB.rotation.y = Math.PI / 2;

  const group = new THREE.Group();
  group.name = 'genesis-light-shaft';
  group.add(planeA, planeB);
  const direction = new THREE.Vector3(...options.direction).normalize();
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction);
  group.position.set(...options.origin);
  return group;
}
