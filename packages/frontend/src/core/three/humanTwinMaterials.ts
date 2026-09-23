import type * as THREE_NS from 'three';

/**
 * HUMAN DIGITAL TWIN — MATERIAL / EFFECT LAYER (D-131).
 *
 * The premium look of the reference renders comes from four cheap, standard
 * techniques, all applied on top of the asset's own PBR materials so the licensed
 * asset is never rewritten:
 *
 *   rim light / fresnel   a view-dependent edge glow injected into the standard
 *                         shader (`onBeforeCompile`), so the silhouette separates
 *                         from a dark lab instead of sinking into it;
 *   x-ray                 the same fresnel, inverted: the body becomes a
 *                         translucent shell that is brightest at grazing angles,
 *                         so organs read through it;
 *   selection highlight   an emissive pulse on the selected object only;
 *   section plane         a real clipping plane (see `humanTwinCutaway`).
 *
 * NOTHING HERE IS A MEASUREMENT. An X-ray view built from a fresnel term is a
 * STYLISED VIEW of a model, not a radiograph; the HUD labels it, and no code in
 * this file may upgrade an epistemic status.
 */

/** How the twin's surface is presented. `NORMAL` leaves the asset's own PBR materials alone. */
export type TwinSurfaceMode = 'NORMAL' | 'XRAY' | 'TRANSLUCENT' | 'GHOST';

export interface RimLightOptions {
  /** Rim colour; the lab's cyan by default. */
  readonly color: THREE_NS.Color;
  /** Rim sharpness: higher = thinner edge. 2–5 reads well. */
  readonly power: number;
  /** Rim strength, 0 disables. */
  readonly intensity: number;
}

interface RimUniforms {
  uRimColor: { value: THREE_NS.Color };
  uRimPower: { value: number };
  uRimIntensity: { value: number };
  uXray: { value: number };
}

/** Materials this module has already patched, with the handle to drive them per frame. */
const PATCHED = new WeakMap<THREE_NS.Material, RimUniforms>();

/**
 * Inject a fresnel rim into a standard/physical material without replacing it. The asset keeps
 * its own base colour, normal and roughness maps; we only add an edge term to the emissive output.
 */
export function applyRimLight(THREE: typeof THREE_NS, material: THREE_NS.Material, opts: RimLightOptions): void {
  const existing = PATCHED.get(material);
  if (existing) {
    existing.uRimColor.value.copy(opts.color);
    existing.uRimPower.value = opts.power;
    existing.uRimIntensity.value = opts.intensity;
    return;
  }
  const uniforms: RimUniforms = {
    uRimColor: { value: new THREE.Color().copy(opts.color) },
    uRimPower: { value: opts.power },
    uRimIntensity: { value: opts.intensity },
    uXray: { value: 0 },
  };
  material.onBeforeCompile = (shader: { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string }) => {
    shader.uniforms.uRimColor = uniforms.uRimColor;
    shader.uniforms.uRimPower = uniforms.uRimPower;
    shader.uniforms.uRimIntensity = uniforms.uRimIntensity;
    shader.uniforms.uXray = uniforms.uXray;
    shader.vertexShader = `varying vec3 vGenesisViewPos;\nvarying vec3 vGenesisNormal;\n${shader.vertexShader}`
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n  vGenesisViewPos = - mvPosition.xyz;\n  vGenesisNormal = normalize( transformedNormal );');
    shader.fragmentShader = `uniform vec3 uRimColor;\nuniform float uRimPower;\nuniform float uRimIntensity;\nuniform float uXray;\nvarying vec3 vGenesisViewPos;\nvarying vec3 vGenesisNormal;\n${shader.fragmentShader}`
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  // Fresnel: 1 at grazing angles, 0 head-on. One term drives both the rim light and the x-ray shell.
  float genesisFresnel = pow( clamp( 1.0 - abs( dot( normalize( vGenesisNormal ), normalize( vGenesisViewPos ) ) ), 0.0, 1.0 ), uRimPower );
  // Add in linear HDR space so ACES, fog and premultiplied alpha treat the rim like the rest of the material.
  totalEmissiveRadiance += uRimColor * genesisFresnel * uRimIntensity;
  // X-ray: the surface fades head-on and survives at the edges, so interior objects read through it.
  // Preserve the material/texture opacity budget, especially the 6% GHOST shell.
  diffuseColor.a *= mix( 1.0, clamp( genesisFresnel * 0.9 + 0.06, 0.0, 1.0 ), uXray );`,
      );
  };
  material.needsUpdate = true;
  PATCHED.set(material, uniforms);
}

/** Drive the x-ray amount (0..1) of an already patched material. */
export function setMaterialXray(material: THREE_NS.Material, amount: number): void {
  const u = PATCHED.get(material);
  if (!u) return;
  u.uXray.value = Math.max(0, Math.min(1, amount));
}

/** Drive the rim intensity of an already patched material (used by the selection pulse). */
export function setMaterialRimIntensity(material: THREE_NS.Material, intensity: number): void {
  const u = PATCHED.get(material);
  if (u) u.uRimIntensity.value = Math.max(0, intensity);
}

export function isRimPatched(material: THREE_NS.Material): boolean { return PATCHED.has(material); }

/** The current rim intensity of a patched material (null if unpatched) — read-back for the selection highlight. */
export function getMaterialRimIntensity(material: THREE_NS.Material): number | null { return PATCHED.get(material)?.uRimIntensity.value ?? null; }

/**
 * Put a material into one of the four surface modes. Transparency is turned on only where a mode
 * needs it, so the opaque path stays fast for NORMAL.
 */
export function setSurfaceMode(material: THREE_NS.Material, mode: TwinSurfaceMode): void {
  const m = material as THREE_NS.MeshStandardMaterial;
  switch (mode) {
    case 'NORMAL':
      m.transparent = false; m.opacity = 1; m.depthWrite = true; setMaterialXray(m, 0); break;
    case 'TRANSLUCENT':
      m.transparent = true; m.opacity = 0.34; m.depthWrite = false; setMaterialXray(m, 0); break;
    case 'XRAY':
      m.transparent = true; m.opacity = 1; m.depthWrite = false; setMaterialXray(m, 1); break;
    case 'GHOST':
      m.transparent = true; m.opacity = 0.06; m.depthWrite = false; setMaterialXray(m, 0.4); break;
  }
  m.needsUpdate = true;
}

/**
 * A smooth 0..1 easing for scale/opacity transitions (macro → micro, isolate, cutaway).
 * Deterministic and frame-rate independent: callers pass elapsed/duration, not a per-frame delta.
 */
export function easeInOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** A selection pulse amount in 0..1 from scene time — presentation only, never part of a session. */
export function selectionPulse(timeSeconds: number): number {
  return 0.5 + 0.5 * Math.sin(timeSeconds * 3.2);
}
