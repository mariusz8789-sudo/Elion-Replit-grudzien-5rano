/* esbuild bundle of packages/core/src/engine/manifold/serverEntry.ts; regenerate with npm run compute:bundle:manifold, do not edit */

// packages/core/src/knowledge/sha256.ts
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var rotr = (x, n) => x >>> n | x << 32 - n;
function sha256Bytes(message) {
  const bitLen = message.length * 8;
  const padded = new Uint8Array(message.length + 9 + 63 >> 6 << 6);
  padded.set(message);
  padded[message.length] = 128;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296), false);
  view.setUint32(padded.length - 4, bitLen >>> 0, false);
  const h = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(off + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ w[t - 15] >>> 3;
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ w[t - 2] >>> 10;
      w[t] = w[t - 16] + s0 + w[t - 7] + s1 >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const t1 = hh + S1 + ch + K[t] + w[t] >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const t2 = S0 + maj >>> 0;
      hh = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    h[0] = h[0] + a >>> 0;
    h[1] = h[1] + b >>> 0;
    h[2] = h[2] + c >>> 0;
    h[3] = h[3] + d >>> 0;
    h[4] = h[4] + e >>> 0;
    h[5] = h[5] + f >>> 0;
    h[6] = h[6] + g >>> 0;
    h[7] = h[7] + hh >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i], false);
  return out;
}
function utf8Bytes(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 55296 && c <= 56319 && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 56320 && d <= 57343) {
        c = 65536 + (c - 55296 << 10) + (d - 56320);
        i++;
      } else c = 65533;
    } else if (c >= 55296 && c <= 57343) c = 65533;
    if (c < 128) out.push(c);
    else if (c < 2048) out.push(192 | c >> 6, 128 | c & 63);
    else if (c < 65536) out.push(224 | c >> 12, 128 | c >> 6 & 63, 128 | c & 63);
    else out.push(240 | c >> 18, 128 | c >> 12 & 63, 128 | c >> 6 & 63, 128 | c & 63);
  }
  return Uint8Array.from(out);
}
function sha256HexSync(text) {
  const bytes = sha256Bytes(utf8Bytes(text));
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

// packages/core/src/determinism.ts
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const withJson = value;
    if (typeof withJson.toJSON === "function") return sortKeysDeep(withJson.toJSON());
    const record = value;
    const out = {};
    for (const key of Object.keys(record).sort()) out[key] = sortKeysDeep(record[key]);
    return out;
  }
  return value;
}
function canonicalJson(value) {
  return JSON.stringify(sortKeysDeep(value)) ?? "null";
}
function sha256Hex(text) {
  return sha256HexSync(text);
}

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
    const proof = sha256Hex(canonicalJson({ points, outputs }));
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
    const compositeChecksum = sha256Hex(canonicalJson({ manifoldProof: manifold.cryptographicProof, telemetry: { ...telemetry, sampledAt: void 0 } }));
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
