/* Proprietary / All Rights Reserved - Genesis OS */
import type { Clock } from '../../knowledge/evidenceTypes.js';
import { sha256hex, stableStringify } from '../../knowledge/EvidenceLedger.js';

/**
 * GENESIS 5D MANIFOLD ENGINE — discrete differential geometry of a path in R^5.
 *
 * Epistemic label: GEOMETRIC_MODEL. Every number here is a real, reproducible
 * geometric quantity of the supplied polyline (x, y, z, t, w); none of it is a
 * spacetime metric, a physical prediction or evidence, and nothing here feeds
 * the Winner Gate. The engine exists so the 5D HUD layer is driven by computed
 * geometry with SHA-256 provenance instead of decorative constants.
 *
 *   metricTensor        Gram matrix G = Σ dᵢ dᵢᵀ of the displacement vectors
 *                       (5×5, symmetric, positive semi-definite) — the induced
 *                       metric of the path's tangent bundle.
 *   curvature           discrete curvature κᵢ = ∠(dᵢ, dᵢ₊₁) / mean(|dᵢ|, |dᵢ₊₁|)
 *                       at every interior vertex (standard polyline estimator).
 *   temporalStabilityIndex  exp(−meanCurvature · pathLength / pointCount): a
 *                       bounded (0, 1] monotone summary — 1 for a straight line.
 *   selfIntersectionFree  true when no two non-adjacent segments come closer
 *                       than `epsilon` in R^5 (exact segment–segment distance).
 *   sdf                 the same signed-distance field the Tartaria sky shader
 *                       raymarches on the GPU, evaluated on the CPU at each
 *                       point's (x, y, z) projection: mean distance and the
 *                       fraction of points inside the architecture (sdf < 0).
 *   cryptographicProof  sha256 of stableStringify({ points, outputs }).
 *
 * Determinism: no Math.random, no Date.now; the timestamp comes from the
 * injected Clock only.
 */

export interface Manifold5DPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly temporalT: number;
  readonly hyperspaceW: number;
}

export interface Manifold5DEvaluation {
  readonly manifoldId: string;
  readonly label: 'GEOMETRIC_MODEL';
  readonly pointCount: number;
  readonly pathLength: number;
  /** Row-major 5×5 Gram matrix of the displacement vectors. */
  readonly metricTensor: readonly number[];
  /** Eigen-free rank estimate: number of Gram diagonal entries above epsilon. */
  readonly metricRankLowerBound: number;
  readonly curvature: { readonly mean: number; readonly max: number; readonly total: number };
  readonly temporalStabilityIndex: number;
  readonly selfIntersectionFree: boolean;
  readonly sdf: { readonly meanDistance: number; readonly insideFraction: number; readonly minDistance: number };
  readonly cryptographicProof: string;
  readonly evaluatedAt: number;
}

export const MAX_MANIFOLD_POINTS = 4096;
const DIM = 5;

const coords = (p: Manifold5DPoint): number[] => [p.x, p.y, p.z, p.temporalT, p.hyperspaceW];
const sub = (a: number[], b: number[]): number[] => a.map((v, i) => v - b[i]);
const dot = (a: number[], b: number[]): number => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = (a: number[]): number => Math.sqrt(dot(a, a));

/** The Tartaria architecture SDF (columns on a 6-unit lattice, a dome, a floor at y = −3), time 0. */
export function tartariaSdf(x: number, y: number, z: number): number {
  // rot(p.z * 0.05) applied to xy, as in the shader with uTime = 0.
  const a = z * 0.05;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const rx = c * x - s * y;
  const ry = s * x + c * y;
  const mod6 = (v: number): number => ((v % 6) + 6) % 6;
  const qx = mod6(rx) - 3;
  const qz = mod6(z) - 3;
  const columns = Math.sqrt(qx * qx + qz * qz) - 0.8;
  const dy = ry - 2.5;
  const dome = Math.sqrt(rx * rx + dy * dy + z * z) - 2.0;
  const structure = Math.min(columns, dome);
  const floorPlane = ry + 3.0;
  return Math.min(floorPlane, structure);
}

/** Exact minimum distance between two segments in R^n (Ericson, Real-Time Collision Detection §5.1.9). */
function segmentDistance(p1: number[], q1: number[], p2: number[], q2: number[]): number {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const EPS = 1e-12;
  let s = 0;
  let t = 0;
  if (a <= EPS && e <= EPS) return norm(r);
  if (a <= EPS) {
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = dot(d1, r);
    if (e <= EPS) {
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  const c1 = p1.map((v, i) => v + d1[i] * s);
  const c2 = p2.map((v, i) => v + d2[i] * t);
  return norm(sub(c1, c2));
}

export class Genesis5DManifoldEngine {
  constructor(private readonly clock: Clock, private readonly epsilon = 1e-9) {}

  evaluatePath(points: readonly Manifold5DPoint[]): Manifold5DEvaluation {
    if (points.length > MAX_MANIFOLD_POINTS) throw new RangeError('TOO_MANY_POINTS');
    for (const p of points) for (const v of coords(p)) if (!Number.isFinite(v)) throw new TypeError('NON_FINITE_COORDINATE');

    const P = points.map(coords);
    const displacements: number[][] = [];
    for (let i = 1; i < P.length; i++) displacements.push(sub(P[i], P[i - 1]));

    // Gram matrix (induced metric) and path length.
    const gram = new Array<number>(DIM * DIM).fill(0);
    let pathLength = 0;
    for (const d of displacements) {
      pathLength += norm(d);
      for (let r = 0; r < DIM; r++) for (let c = 0; c < DIM; c++) gram[r * DIM + c] += d[r] * d[c];
    }
    let rank = 0;
    for (let i = 0; i < DIM; i++) if (gram[i * DIM + i] > this.epsilon) rank++;

    // Discrete curvature at interior vertices.
    let total = 0;
    let max = 0;
    let count = 0;
    for (let i = 1; i < displacements.length; i++) {
      const a = displacements[i - 1];
      const b = displacements[i];
      const na = norm(a);
      const nb = norm(b);
      if (na <= this.epsilon || nb <= this.epsilon) continue;
      const cosTheta = Math.min(1, Math.max(-1, dot(a, b) / (na * nb)));
      const kappa = Math.acos(cosTheta) / ((na + nb) / 2);
      total += kappa;
      if (kappa > max) max = kappa;
      count++;
    }
    const mean = count > 0 ? total / count : 0;
    const stability = points.length > 0 ? Math.exp(-(mean * pathLength) / points.length) : 1;

    // Self-intersection: exact distance between every pair of non-adjacent segments.
    let selfIntersectionFree = true;
    const segs = displacements.length;
    for (let i = 0; i < segs && selfIntersectionFree; i++) {
      for (let j = i + 2; j < segs; j++) {
        if (segmentDistance(P[i], P[i + 1], P[j], P[j + 1]) <= this.epsilon) { selfIntersectionFree = false; break; }
      }
    }

    // SDF of the same architecture the GPU raymarches, on the xyz projection.
    let sdfSum = 0;
    let inside = 0;
    let sdfMin = Number.POSITIVE_INFINITY;
    for (const p of points) {
      const d = tartariaSdf(p.x, p.y, p.z);
      sdfSum += d;
      if (d < 0) inside++;
      if (d < sdfMin) sdfMin = d;
    }
    const sdf = {
      meanDistance: points.length > 0 ? sdfSum / points.length : 0,
      insideFraction: points.length > 0 ? inside / points.length : 0,
      minDistance: points.length > 0 ? sdfMin : 0,
    };

    const outputs = { pathLength, metricTensor: gram, rank, curvature: { mean, max, total }, stability, selfIntersectionFree, sdf };
    const proof = sha256hex(stableStringify({ points, outputs }));
    return {
      manifoldId: 'M5D-' + proof.slice(0, 16),
      label: 'GEOMETRIC_MODEL',
      pointCount: points.length,
      pathLength,
      metricTensor: Object.freeze(gram),
      metricRankLowerBound: rank,
      curvature: { mean, max, total },
      temporalStabilityIndex: stability,
      selfIntersectionFree,
      sdf,
      cryptographicProof: proof,
      evaluatedAt: this.clock.now(),
    };
  }
}
