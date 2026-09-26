/* eslint-disable @typescript-eslint/no-unused-vars -- esbuild bundle of packages/core/src/solvers/speculative; regenerate with npm run compute:bundle:speculative, do not edit */

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
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = s + 1831565813 >>> 0;
    let t = s;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// packages/core/src/expansionHash.ts
var CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

// packages/core/src/solvers/speculative/speculativeRegistry.ts
var SpeculativeSolverRegistry = class {
  plugins = /* @__PURE__ */ new Map();
  ledger = [];
  register(p) {
    if (p.tag === "VERIFIED_PHYSICS") throw new Error("SPECULATIVE_REGISTRY_REJECTS_VERIFIED_TAG:" + p.id);
    this.plugins.set(p.id, p);
  }
  run(id, params, ctx) {
    const plugin = this.plugins.get(id);
    if (!plugin) return { ok: false, error: "UNKNOWN_SOLVER" };
    if (!ctx.allowUnphysicalSandbox) return { ok: false, error: "SANDBOX_DISABLED" };
    let state = plugin.createInitialState(ctx, params);
    state = plugin.step(state, ctx, params);
    const warnings = plugin.warnings(state);
    const fingerprint = plugin.fingerprint(state);
    const prev = this.ledger.length ? this.ledger[this.ledger.length - 1].hash : "GENESIS";
    const at = ctx.clock.now();
    const index = this.ledger.length;
    this.ledger.push(Object.freeze({ index, solverId: id, fingerprint, warnings, at, prevHash: prev, hash: sha256Hex(canonicalJson({ index, solverId: id, fingerprint, warnings, at, prevHash: prev })) }));
    if (ctx.ecs) {
      const e = ctx.ecs.createEntity();
      ctx.ecs.setComponent(e, "speculativeState", { solverId: id, tag: plugin.tag, fingerprint, warnings });
    }
    return { ok: true, state, warnings, fingerprint };
  }
  getLedger() {
    return this.ledger;
  }
  verifyLedger() {
    const errors = [];
    let prev = "GENESIS";
    for (const e of this.ledger) {
      if (e.prevHash !== prev) errors.push("CHAIN_BREAK@" + e.index);
      if (e.hash !== sha256Hex(canonicalJson({ index: e.index, solverId: e.solverId, fingerprint: e.fingerprint, warnings: e.warnings, at: e.at, prevHash: e.prevHash }))) errors.push("HASH_MISMATCH@" + e.index);
      prev = e.hash;
    }
    return { ok: errors.length === 0, errors };
  }
};

// packages/core/src/solvers/speculative/retrocausalTreeSolver.ts
var softmax = (z, T) => {
  const m = Math.max(...Array.from(z));
  const e = Float64Array.from(z, (v) => Math.exp((v - m) / Math.max(1e-9, T)));
  const s = Array.from(e).reduce((a, b) => a + b, 0);
  return Float64Array.from(e, (v) => v / s);
};
var RetrocausalTreeSolver = class {
  id = "retrocausal-tree";
  tag = "SPECULATIVE_SANDBOX_SOLVER";
  createInitialState(ctx, p) {
    const rng = mulberry32(ctx.seed);
    const dS = Float64Array.from({ length: p.branches }, () => 0.2 + rng() * 1.8);
    const weights = softmax(dS, p.temperature);
    const V = new Float64Array(p.depth + 1);
    return { solverId: this.id, tag: this.tag, step: 0, fields: { dS }, scalars: { temperature: p.temperature, gamma: p.gamma, eta: p.eta, tol: p.tol, maxIter: p.maxIter, depth: p.depth, branches: p.branches }, warnings: this.warningsOf(V, 0, p.maxIter, false), provenanceHash: sha256Hex(canonicalJson({ seed: ctx.seed, p })), weights, V, iterations: 0, converged: false };
  }
  step(state, _ctx, p) {
    const { dS } = state.fields;
    const V = Float64Array.from(state.V);
    let weights = state.weights;
    let iter = state.iterations;
    let converged = state.converged;
    const rng = mulberry32(state.provenanceHash.length);
    void rng;
    const obsLeaf = 0.5 + 0.5 * Math.sin(state.scalars["temperature"] ?? 1);
    if (iter < p.maxIter) {
      const Vprev = Float64Array.from(V);
      V[p.depth] = obsLeaf;
      for (let d = p.depth - 1; d >= 0; d--) {
        let acc = 0;
        for (let i = 0; i < p.branches; i++) acc += weights[i] * V[d + 1];
        V[d] = 0.1 * (d + 1) + p.gamma * acc;
      }
      const z = Float64Array.from(dS, (v, i) => -(v + p.eta * V[1] * (i + 1) / p.branches));
      weights = softmax(z, p.temperature);
      let maxDiff = 0;
      for (let d = 0; d <= p.depth; d++) maxDiff = Math.max(maxDiff, Math.abs(V[d] - Vprev[d]));
      iter += 1;
      converged = maxDiff < p.tol;
    }
    return { ...state, step: state.step + 1, V, weights, iterations: iter, converged, warnings: this.warningsOf(V, iter, p.maxIter, converged) };
  }
  warningsOf(_V, iter, maxIter, converged) {
    const w = ["RETROCAUSAL_FIXED_POINT"];
    if (!converged && iter >= maxIter) w.push("UNCONVERGED_FIXED_POINT");
    return w;
  }
  warnings(state) {
    return this.warningsOf(state.V, state.iterations, state.scalars["maxIter"] ?? 0, state.converged);
  }
  fingerprint(state) {
    return sha256Hex(canonicalJson({ V: Array.from(state.V).map((v) => +v.toFixed(9)), w: Array.from(state.weights).map((v) => +v.toFixed(9)), iter: state.iterations, conv: state.converged, prov: state.provenanceHash }));
  }
};

// packages/core/src/solvers/speculative/torsionBoundarySolver.ts
var configFactor = (p) => {
  let C = 0;
  for (let m = 0; m < p.radii.length; m++) C += (p.reflectivity[m] ?? 0) * (1 / Math.max(1e-6, p.radii[m])) * Math.exp(-(p.pitch[m] ?? 0));
  return C;
};
var TorsionBoundarySolver = class {
  id = "torsion-boundary";
  tag = "UNPHYSICAL_THEORY";
  createInitialState(ctx, p) {
    const n = p.gridSize * p.gridSize;
    return { solverId: this.id, tag: this.tag, step: 0, fields: {}, scalars: { gridSize: p.gridSize, D: p.D, lambda: p.lambda, alpha: p.alpha, beta: p.beta, I0: p.I0, ell: p.ell }, warnings: ["TORSION_BOUNDARY_SPECULATIVE"], provenanceHash: sha256Hex(canonicalJson({ seed: ctx.seed, p })), I: new Float64Array(n), tau: new Float64Array(n).fill(1), C: configFactor(p) };
  }
  step(state, _ctx, p) {
    const g = p.gridSize;
    const I = Float64Array.from(state.I);
    const next = Float64Array.from(I);
    const c = state.C;
    const center = (g - 1) / 2;
    for (let y = 0; y < g; y++) for (let x = 0; x < g; x++) {
      const i = y * g + x;
      const l = x > 0 ? I[i - 1] : I[i], r = x < g - 1 ? I[i + 1] : I[i], u = y > 0 ? I[i - g] : I[i], d = y < g - 1 ? I[i + g] : I[i];
      const lap = l + r + u + d - 4 * I[i];
      const dist = Math.hypot(x - center, y - center);
      const S = c * Math.exp(-dist / Math.max(1e-6, p.ell));
      next[i] = I[i] + p.alpha * (p.D * lap - p.lambda * I[i] + S);
    }
    const tau = Float64Array.from(next, (v) => 1 / (1 + p.beta * Math.max(0, v - p.I0)));
    return { ...state, step: state.step + 1, I: next, tau, warnings: ["TORSION_BOUNDARY_SPECULATIVE"] };
  }
  warnings(_state) {
    return ["TORSION_BOUNDARY_SPECULATIVE"];
  }
  fingerprint(state) {
    const samp = Array.from(state.I).filter((_, i) => i % 7 === 0).map((v) => +v.toFixed(9));
    const ts = Array.from(state.tau).filter((_, i) => i % 7 === 0).map((v) => +v.toFixed(9));
    return sha256Hex(canonicalJson({ samp, ts, C: +state.C.toFixed(9), prov: state.provenanceHash }));
  }
};

// packages/core/src/solvers/speculative/warpMetricSolver.ts
var shape = (rs, R, sigma) => (Math.tanh(sigma * (rs + R)) - Math.tanh(sigma * (rs - R))) / (2 * Math.tanh(sigma * R));
var dShape = (rs, R, sigma, h = 1e-4) => (shape(rs + h, R, sigma) - shape(rs - h, R, sigma)) / (2 * h);
var WarpMetricSolver = class {
  id = "warp-metric";
  tag = "UNPHYSICAL_THEORY";
  createInitialState(ctx, p) {
    const rs = p.pathLength;
    const f = shape(rs, p.R, p.sigma);
    const df = dShape(rs, p.R, p.sigma);
    const dtaudt = Math.sqrt(Math.max(0, 1 - p.vS * p.vS * f * f));
    return { solverId: this.id, tag: this.tag, step: 0, fields: {}, scalars: { R: p.R, sigma: p.sigma, vS: p.vS, pathLength: p.pathLength }, warnings: this.warns(p, df), provenanceHash: sha256Hex(canonicalJson({ seed: ctx.seed, p })), xS: 0, properTime: 0, coordinateTime: 0, f, theta: -p.vS * df, rhoEff: -df * df * p.vS * p.vS, dtaudt };
  }
  step(state, ctx, p) {
    const xS = state.xS + p.vS * ctx.dt;
    const rs = Math.max(0, p.pathLength - xS);
    const f = shape(rs, p.R, p.sigma);
    const df = dShape(rs, p.R, p.sigma);
    const dtaudt = Math.sqrt(Math.max(0, 1 - p.vS * p.vS * f * f));
    const gain = xS / Math.max(1e-9, state.properTime + dtaudt * ctx.dt);
    const warns = this.warns(p, df);
    if (gain > 1) warns.push("NON_METRIC_SHORTCUT");
    return { ...state, step: state.step + 1, xS, properTime: state.properTime + dtaudt * ctx.dt, coordinateTime: state.coordinateTime + ctx.dt, f, theta: -p.vS * df, rhoEff: -df * df * p.vS * p.vS, dtaudt, warnings: warns };
  }
  warns(p, df) {
    const w = ["NEGATIVE_ENERGY_REQUIRED"];
    if (Math.abs(df) > 0 && p.vS > 1) w.push("NON_METRIC_SHORTCUT");
    return w;
  }
  warnings(state) {
    return state.warnings;
  }
  fingerprint(state) {
    return sha256Hex(canonicalJson({ xS: +state.xS.toFixed(9), pt: +state.properTime.toFixed(9), ct: +state.coordinateTime.toFixed(9), f: +state.f.toFixed(9), rho: +state.rhoEff.toFixed(12), prov: state.provenanceHash }));
  }
};
export {
  RetrocausalTreeSolver,
  SpeculativeSolverRegistry,
  TorsionBoundarySolver,
  WarpMetricSolver
};
