import { createHash } from 'node:crypto';
/** Deterministic helpers. NO Math.random, NO Date.now. */
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export const G = 6.67430e-11; export const C = 299792458;
export interface Clock { now(): number; }

export interface PortalParams { readonly massKg: number; readonly spin: number; readonly energyJ: number; readonly throatRadiusM: number; readonly seed: number; }
export interface Point5D { readonly t: number; readonly x: number; readonly y: number; readonly z: number; readonly w: number; }
export interface Trajectory5D { readonly points: readonly Point5D[]; readonly horizonM: number; readonly dilationAtStart: number; readonly dataLabel: 'RELATIVISTIC_SIMULATION'; readonly fingerprint: string; }
export interface PortalGeometry { readonly positions: Float32Array; readonly indices: Uint32Array; readonly rings: number; readonly segments: number; }

export const schwarzschildM = (massKg: number): number => (G * massKg) / (C * C);
export const kerrOuterHorizon = (massKg: number, spin: number): number => { const m = schwarzschildM(massKg); const a = Math.min(Math.abs(spin), 1) * m; return m + Math.sqrt(Math.max(0, m * m - a * a)); };
export const warpFactor = (massKg: number, r: number): number => { const rs = 2 * schwarzschildM(massKg); return 1 / Math.sqrt(Math.max(1e-9, 1 - rs / Math.max(r, rs + 1e-9))); };

type V5 = [number, number, number, number, number];
/** 5D geodesic-like derivative: GR attraction + Lense-Thirring tangential drag + warped 5th-dim coupling. */
function deriv5(y: V5, p: PortalParams): V5 {
  const [t, x, yy, z, w] = y;
  const r = Math.max(1e-6, Math.hypot(x, yy, z));
  const m = schwarzschildM(p.massKg); const rs = 2 * m;
  const g = -(G * p.massKg) / (r * r);
  const drag = (p.spin * rs * rs) / (r * r * r) * 1e3; // frame-dragging tangential term (model-scaled)
  const warp = Math.min(50, warpFactor(p.massKg, r));
  const wAcc = -4 * w + 0.5 * (rs / r) * Math.sin(w * 2 + t); // extra-dim oscillator coupled to curvature
  const dilation = 1 / warp;
  return [dilation, g * (x / r) - drag * (yy / r), g * (yy / r) + drag * (x / r), g * (z / r), wAcc];
}
const addV = (a: V5, b: V5, s: number): V5 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s, a[3] + b[3] * s, a[4] + b[4] * s];
/** Deterministic RK4 fixed-step integrator over 5D state. */
export function solveTrajectory(p: PortalParams, steps: number, h: number): Trajectory5D {
  const rng = mulberry32(p.seed);
  const r0 = Math.max(p.throatRadiusM * 3, 1);
  const vTan = Math.sqrt((G * p.massKg) / r0) * (0.8 + rng() * 0.4);
  let y: V5 = [0, r0, 0, 0, 0.1 + rng() * 0.1];
  let vy: V5 = [1, 0, vTan, 0, 0];
  const points: Point5D[] = [];
  for (let i = 0; i < steps; i++) {
    points.push({ t: +y[0].toFixed(6), x: +y[1].toFixed(4), y: +y[2].toFixed(4), z: +y[3].toFixed(4), w: +y[4].toFixed(6) });
    const k1 = deriv5(y, p);
    const k2 = deriv5(addV(y, k1, h / 2) , p);
    const k3 = deriv5(addV(y, k2, h / 2), p);
    const k4 = deriv5(addV(y, k3, h), p);
    const dy: V5 = [(h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]), (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]), (h / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]), (h / 6) * (k1[4] + 2 * k2[4] + 2 * k3[4] + k4[4])];
    y = addV(y, vy, h); vy = addV(vy, dy, 1);
    if (!y.every(Number.isFinite)) break;
  }
  const horizon = kerrOuterHorizon(p.massKg, p.spin);
  const partial = { points, horizonM: +horizon.toFixed(4), dilationAtStart: +warpFactor(p.massKg, r0).toFixed(6), dataLabel: 'RELATIVISTIC_SIMULATION' as const };
  return { ...partial, fingerprint: sha256hex(stableStringify({ seed: p.seed, massKg: p.massKg, spin: p.spin, n: points.length })) };
}
/** Procedural warped portal ring mesh (deterministic from params). */
export function generatePortalGeometry(p: PortalParams, rings = 24, segments = 48): PortalGeometry {
  const positions = new Float32Array(rings * segments * 3); const indices: number[] = [];
  const horizon = kerrOuterHorizon(p.massKg, p.spin);
  for (let i = 0; i < rings; i++) {
    const u = i / (rings - 1);
    const radius = p.throatRadiusM + horizon * 2 * u + Math.sin(u * Math.PI * 2 + p.spin * 3) * horizon * 0.3;
    for (let j = 0; j < segments; j++) {
      const v = (j / segments) * Math.PI * 2;
      const twist = p.spin * u * Math.PI * 2;
      const idx = (i * segments + j) * 3;
      positions[idx] = Math.cos(v + twist) * radius;
      positions[idx + 1] = Math.sin(v + twist) * radius * (0.6 + 0.4 * Math.sin(u * Math.PI));
      positions[idx + 2] = (u - 0.5) * horizon * 4 + Math.cos(v * 3 + twist) * horizon * 0.2;
      if (i < rings - 1) { const a = i * segments + j, b = i * segments + (j + 1) % segments, c = (i + 1) * segments + (j + 1) % segments, d = (i + 1) * segments + j; indices.push(a, b, c, a, c, d); }
    }
  }
  return { positions, indices: new Uint32Array(indices), rings, segments };
}
