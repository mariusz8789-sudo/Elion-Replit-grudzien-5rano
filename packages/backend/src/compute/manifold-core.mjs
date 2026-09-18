/* esbuild bundle of packages/core/src/engine/manifold/serverEntry.ts; regenerate with npm run compute:bundle:manifold, do not edit */

// packages/core/src/knowledge/EvidenceLedger.ts
import { createHash } from "node:crypto";
var stableStringify = (v) => {
  if (v === null) return "null";
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (typeof v === "object") {
    const o = v;
    return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",") + "}";
  }
  return JSON.stringify(v);
};
var sha256hex = (t) => createHash("sha256").update(t, "utf8").digest("hex");

// packages/core/src/engine/manifold/Genesis5DManifoldEngine.ts
var MAX_MANIFOLD_POINTS = 4096;
var DIM = 5;
var coords = (p) => [p.x, p.y, p.z, p.temporalT, p.hyperspaceW];
var sub = (a, b) => a.map((v, i) => v - b[i]);
var dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
var norm = (a) => Math.sqrt(dot(a, a));
function tartariaSdf(x, y, z) {
  const a = z * 0.05;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const rx = c * x - s * y;
  const ry = s * x + c * y;
  const mod6 = (v) => (v % 6 + 6) % 6;
  const qx = mod6(rx) - 3;
  const qz = mod6(z) - 3;
  const columns = Math.sqrt(qx * qx + qz * qz) - 0.8;
  const dy = ry - 2.5;
  const dome = Math.sqrt(rx * rx + dy * dy + z * z) - 2;
  const structure = Math.min(columns, dome);
  const floorPlane = ry + 3;
  return Math.min(floorPlane, structure);
}
function segmentDistance(p1, q1, p2, q2) {
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
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  const c1 = p1.map((v, i) => v + d1[i] * s);
  const c2 = p2.map((v, i) => v + d2[i] * t);
  return norm(sub(c1, c2));
}
var Genesis5DManifoldEngine = class {
  constructor(clock, epsilon = 1e-9) {
    this.clock = clock;
    this.epsilon = epsilon;
  }
  evaluatePath(points) {
    if (points.length > MAX_MANIFOLD_POINTS) throw new RangeError("TOO_MANY_POINTS");
    for (const p of points) for (const v of coords(p)) if (!Number.isFinite(v)) throw new TypeError("NON_FINITE_COORDINATE");
    const P = points.map(coords);
    const displacements = [];
    for (let i = 1; i < P.length; i++) displacements.push(sub(P[i], P[i - 1]));
    const gram = new Array(DIM * DIM).fill(0);
    let pathLength = 0;
    for (const d of displacements) {
      pathLength += norm(d);
      for (let r = 0; r < DIM; r++) for (let c = 0; c < DIM; c++) gram[r * DIM + c] += d[r] * d[c];
    }
    let rank = 0;
    for (let i = 0; i < DIM; i++) if (gram[i * DIM + i] > this.epsilon) rank++;
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
    let selfIntersectionFree = true;
    const segs = displacements.length;
    for (let i = 0; i < segs && selfIntersectionFree; i++) {
      for (let j = i + 2; j < segs; j++) {
        if (segmentDistance(P[i], P[i + 1], P[j], P[j + 1]) <= this.epsilon) {
          selfIntersectionFree = false;
          break;
        }
      }
    }
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
      minDistance: points.length > 0 ? sdfMin : 0
    };
    const outputs = { pathLength, metricTensor: gram, rank, curvature: { mean, max, total }, stability, selfIntersectionFree, sdf };
    const proof = sha256hex(stableStringify({ points, outputs }));
    return {
      manifoldId: "M5D-" + proof.slice(0, 16),
      label: "GEOMETRIC_MODEL",
      pointCount: points.length,
      pathLength,
      metricTensor: Object.freeze(gram),
      metricRankLowerBound: rank,
      curvature: { mean, max, total },
      temporalStabilityIndex: stability,
      selfIntersectionFree,
      sdf,
      cryptographicProof: proof,
      evaluatedAt: this.clock.now()
    };
  }
};

// packages/core/src/engine/manifold/GenesisEnterpriseCore.ts
function telemetryFromSample(nodeId, s, at) {
  const memPressure = 1 - s.freeMemBytes / Math.max(1, s.totalMemBytes);
  const cpuPressure = Math.min(1, s.loadAvg[0] / Math.max(1, s.cpuCount));
  return {
    nodeId,
    cpuCount: s.cpuCount,
    totalMemBytes: s.totalMemBytes,
    freeMemBytes: s.freeMemBytes,
    loadAvg: [s.loadAvg[0], s.loadAvg[1], s.loadAvg[2]],
    pressure: Math.min(1, Math.max(0, 0.5 * memPressure + 0.5 * cpuPressure)),
    sampledAt: at,
    source: "os"
  };
}
var GenesisEnterpriseCore = class {
  constructor(clock, sampler) {
    this.clock = clock;
    this.sampler = sampler;
    this.manifold = new Genesis5DManifoldEngine(clock);
  }
  manifold;
  nodeTelemetry(nodeId) {
    return telemetryFromSample(nodeId, this.sampler.sample(), this.clock.now());
  }
  executePipeline(nodeId, points) {
    const modulesExecuted = [];
    const manifold = this.manifold.evaluatePath(points);
    modulesExecuted.push("manifold5d");
    const telemetry = this.nodeTelemetry(nodeId);
    modulesExecuted.push("telemetry");
    const compositeChecksum = sha256hex(stableStringify({ manifoldProof: manifold.cryptographicProof, telemetry: { ...telemetry, sampledAt: void 0 } }));
    return {
      receiptId: "RCP-" + compositeChecksum.slice(0, 16),
      label: "GEOMETRIC_MODEL",
      modulesExecuted,
      manifold,
      telemetry,
      compositeChecksum,
      issuedAt: this.clock.now()
    };
  }
};

// packages/core/src/engine/native/SystemResourceBridge.ts
import * as os from "node:os";
var osSampler = {
  sample: () => {
    const [l0, l1, l2] = os.loadavg();
    return { totalMemBytes: os.totalmem(), freeMemBytes: os.freemem(), loadAvg: [l0 ?? 0, l1 ?? 0, l2 ?? 0], cpuCount: Math.max(1, os.cpus().length || os.availableParallelism()) };
  }
};
var SystemResourceBridge = class {
  constructor(clock, sampler = osSampler, maxHistory = 512) {
    this.clock = clock;
    this.sampler = sampler;
    this.maxHistory = maxHistory;
  }
  history = [];
  sample() {
    const s = { at: this.clock.now(), ...this.sampler.sample() };
    this.history.push(s);
    if (this.history.length > this.maxHistory) this.history.shift();
    return s;
  }
  /** 0..1 combined memory+cpu pressure. */
  pressure() {
    const s = this.sample();
    const memPressure = 1 - s.freeMemBytes / Math.max(1, s.totalMemBytes);
    const cpuPressure = Math.min(1, s.loadAvg[0] / Math.max(1, s.cpuCount));
    return Math.min(1, Math.max(0, 0.5 * memPressure + 0.5 * cpuPressure));
  }
  /** Hardware-derived dynamic concurrency (no artificial constant caps): scales with physical cores, backs off under pressure. */
  recommendedConcurrency() {
    const s = this.sample();
    const p = Math.min(1, Math.max(0, 0.5 * (1 - s.freeMemBytes / Math.max(1, s.totalMemBytes)) + 0.5 * Math.min(1, s.loadAvg[0] / Math.max(1, s.cpuCount))));
    return Math.max(1, Math.round(s.cpuCount * (1 - 0.5 * p)));
  }
  getHistory() {
    return this.history;
  }
};
export {
  Genesis5DManifoldEngine,
  GenesisEnterpriseCore,
  MAX_MANIFOLD_POINTS,
  SystemResourceBridge,
  osSampler,
  tartariaSdf,
  telemetryFromSample
};
