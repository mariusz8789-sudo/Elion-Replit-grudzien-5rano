/* eslint-disable @typescript-eslint/no-unused-vars -- esbuild bundle of packages/core/src/engine/quantum/quantumWorkerEntry.ts; regenerate with npm run compute:bundle:quantum-worker, do not edit */

// packages/core/src/engine/quantum/quantumWorkerEntry.ts
import { parentPort } from "node:worker_threads";

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

// packages/core/src/engine/quantum/QuantumProviderAdapter.ts
var QuantumError = class extends Error {
  constructor(code, detail, line) {
    super(code + (line !== void 0 ? "@line " + line : "") + (detail ? ": " + detail : ""));
    this.code = code;
    this.line = line;
    this.name = "QuantumError";
  }
};
var MAX_QUBITS = 16;
var DEFAULT_MAX_SHOTS = 8192;
var MAX_QASM_CHARS = 65536;
var MAX_GATES = 2e4;
var MAX_PROBABILITY_KEYS = 4096;
var PARAM_ARITY = { h: 0, x: 0, y: 0, z: 0, s: 0, t: 0, rx: 1, ry: 1, rz: 1, cx: 0, cz: 0, swap: 0, barrier: 0, measure: 0 };
var QUBIT_ARITY = { h: 1, x: 1, y: 1, z: 1, s: 1, t: 1, rx: 1, ry: 1, rz: 1, cx: 2, cz: 2, swap: 2, barrier: -1, measure: -1 };
var isGateName = (s) => Object.prototype.hasOwnProperty.call(PARAM_ARITY, s);
var range = (n) => Array.from({ length: n }, (_, i) => i);
var circuitFingerprint = (qasm) => sha256Hex(qasm);
var circuitFromText = (qubits, qasm) => Object.freeze({ qubits, qasm, fingerprint: circuitFingerprint(qasm) });
function circuitFromQasm(qasm) {
  const parsed = parseQasm3(qasm);
  return circuitFromText(parsed.qubits, qasm);
}
var PRESET_IDS = Object.freeze(["bell-state", "ghz", "superposition"]);
function splitStatements(text) {
  const out = [];
  let buf = "";
  let bufLine = 1;
  let line = 1;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === "/" && next === "/") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) {
        if (text[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }
    if (ch === ";") {
      const t = buf.trim();
      if (t) out.push({ text: t, line: bufLine });
      buf = "";
      i++;
      bufLine = line;
      continue;
    }
    if (ch === "\n") line++;
    if (!buf.trim()) bufLine = line;
    buf += ch;
    i++;
  }
  const tail = buf.trim();
  if (tail) throw new QuantumError("QASM_SYNTAX", `missing ';' after "${tail.slice(0, 40)}"`, bufLine);
  return out;
}
var NUM = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
function evalAngle(raw, line) {
  const s = raw.replace(/\s+/g, "").toLowerCase().replace(/π/g, "pi");
  if (NUM.test(s)) return Number(s);
  const m = /^([+-])?(?:(\d+\.?\d*|\.\d+)\*)?pi(?:\/(\d+\.?\d*|\.\d+))?$/.exec(s);
  if (m) {
    const sign = m[1] === "-" ? -1 : 1;
    const mul = m[2] !== void 0 ? Number(m[2]) : 1;
    const div = m[3] !== void 0 ? Number(m[3]) : 1;
    if (div === 0) throw new QuantumError("QASM_SYNTAX", `division by zero in "${raw}"`, line);
    return sign * mul * Math.PI / div;
  }
  throw new QuantumError("QASM_SYNTAX", `cannot evaluate angle "${raw}"`, line);
}
function parseIndexed(token, reg, what, line) {
  const t = token.trim();
  if (!reg) throw new QuantumError("QASM_SYNTAX", `${what} register used before its declaration`, line);
  if (t === reg.name) return range(reg.size);
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\[(\d+)\]$/.exec(t);
  if (!m) throw new QuantumError("QASM_SYNTAX", `expected ${what} reference, got "${t}"`, line);
  if (m[1] !== reg.name) throw new QuantumError("QASM_SYNTAX", `unknown ${what} register "${m[1]}"`, line);
  const idx = Number(m[2]);
  if (idx >= reg.size) throw new QuantumError("QUBIT_OUT_OF_RANGE", `${m[1]}[${idx}] of ${reg.size}`, line);
  return [idx];
}
function parseQasm3(text) {
  if (typeof text !== "string") throw new QuantumError("QASM_SYNTAX", "circuit text must be a string", 1);
  if (text.length > MAX_QASM_CHARS) throw new QuantumError("QASM_SYNTAX", `circuit text longer than ${MAX_QASM_CHARS} characters`, 1);
  const stmts = splitStatements(text);
  const regs = { q: null, c: null };
  const gates = [];
  let sawHeader = false;
  const declareQ = (name, size, line) => {
    if (regs.q) throw new QuantumError("QASM_SYNTAX", "only one qubit register is supported", line);
    if (!Number.isInteger(size) || size < 1) throw new QuantumError("QASM_SYNTAX", "qubit register size must be a positive integer", line);
    if (size > MAX_QUBITS) throw new QuantumError("TOO_MANY_QUBITS", `${size} > ${MAX_QUBITS}`, line);
    regs.q = { name, size };
  };
  const declareC = (name, size, line) => {
    if (regs.c) throw new QuantumError("QASM_SYNTAX", "only one bit register is supported", line);
    if (!Number.isInteger(size) || size < 1) throw new QuantumError("QASM_SYNTAX", "bit register size must be a positive integer", line);
    if (size > MAX_QUBITS) throw new QuantumError("TOO_MANY_QUBITS", `bit[${size}] > ${MAX_QUBITS}`, line);
    regs.c = { name, size };
  };
  const pushGate = (g, line) => {
    if (gates.length >= MAX_GATES) throw new QuantumError("QASM_SYNTAX", `more than ${MAX_GATES} gates`, line);
    gates.push(Object.freeze(g));
  };
  for (const { text: s, line } of stmts) {
    let m = /^OPENQASM\s+(\d+(?:\.\d+)?)$/i.exec(s);
    if (m) {
      if (sawHeader) throw new QuantumError("QASM_SYNTAX", "duplicate OPENQASM header", line);
      if (!/^(2(\.0)?|3(\.0)?)$/.test(m[1])) throw new QuantumError("QASM_SYNTAX", `unsupported OPENQASM version ${m[1]}`, line);
      sawHeader = true;
      continue;
    }
    if (/^include\s+"[^"]*"$/.test(s)) continue;
    m = /^qubit(?:\[(\d+)\])?\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(s);
    if (m) {
      declareQ(m[2], m[1] === void 0 ? 1 : Number(m[1]), line);
      continue;
    }
    m = /^bit(?:\[(\d+)\])?\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(s);
    if (m) {
      declareC(m[2], m[1] === void 0 ? 1 : Number(m[1]), line);
      continue;
    }
    m = /^qreg\s+([A-Za-z_][A-Za-z0-9_]*)\[(\d+)\]$/.exec(s);
    if (m) {
      declareQ(m[1], Number(m[2]), line);
      continue;
    }
    m = /^creg\s+([A-Za-z_][A-Za-z0-9_]*)\[(\d+)\]$/.exec(s);
    if (m) {
      declareC(m[1], Number(m[2]), line);
      continue;
    }
    let qTok = null;
    let cTok = null;
    const mAssign = /^([A-Za-z_][A-Za-z0-9_]*(?:\[\d+\])?)\s*=\s*measure\s+([A-Za-z_][A-Za-z0-9_]*(?:\[\d+\])?)$/.exec(s);
    const mArrow = mAssign ? null : /^measure\s+([A-Za-z_][A-Za-z0-9_]*(?:\[\d+\])?)\s*->\s*([A-Za-z_][A-Za-z0-9_]*(?:\[\d+\])?)$/.exec(s);
    if (mAssign) {
      cTok = mAssign[1];
      qTok = mAssign[2];
    } else if (mArrow) {
      qTok = mArrow[1];
      cTok = mArrow[2];
    }
    if (qTok !== null && cTok !== null) {
      const qs = parseIndexed(qTok, regs.q, "qubit", line);
      const cs = parseIndexed(cTok, regs.c, "bit", line);
      if (qs.length !== cs.length) throw new QuantumError("QASM_SYNTAX", `measure: ${qs.length} qubit(s) into ${cs.length} bit(s)`, line);
      pushGate({ name: "measure", qubits: Object.freeze(qs), params: Object.freeze([]), clbits: Object.freeze(cs) }, line);
      continue;
    }
    m = /^barrier(?:\s+(.*))?$/.exec(s);
    if (m) {
      const qreg = regs.q;
      if (!qreg) throw new QuantumError("QASM_SYNTAX", "barrier before qubit declaration", line);
      const args = m[1]?.trim() ? m[1].split(",").flatMap((t) => parseIndexed(t, qreg, "qubit", line)) : range(qreg.size);
      pushGate({ name: "barrier", qubits: Object.freeze(args), params: Object.freeze([]) }, line);
      continue;
    }
    m = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?\s+(.+)$/.exec(s);
    if (m) {
      const name = m[1].toLowerCase();
      if (name === "gate" || name === "def" || name === "if" || name === "for" || name === "while" || name === "reset" || name === "let" || name === "const") throw new QuantumError("UNSUPPORTED_GATE", `"${m[1]}" is not in the supported subset`, line);
      if (!isGateName(name) || name === "barrier" || name === "measure") throw new QuantumError("UNSUPPORTED_GATE", `gate "${m[1]}"`, line);
      const params = m[2] !== void 0 ? m[2].split(",").map((p) => p.trim()).filter((p) => p.length > 0).map((p) => evalAngle(p, line)) : [];
      if (params.length !== PARAM_ARITY[name]) throw new QuantumError("QASM_SYNTAX", `${name} expects ${PARAM_ARITY[name]} parameter(s), got ${params.length}`, line);
      const qs = m[3].split(",").flatMap((t) => parseIndexed(t, regs.q, "qubit", line));
      if (qs.length !== QUBIT_ARITY[name]) throw new QuantumError("QASM_SYNTAX", `${name} expects ${QUBIT_ARITY[name]} qubit(s), got ${qs.length}`, line);
      if (qs.length === 2 && qs[0] === qs[1]) throw new QuantumError("QASM_SYNTAX", `${name}: the two qubits must differ`, line);
      pushGate({ name, qubits: Object.freeze(qs), params: Object.freeze(params) }, line);
      continue;
    }
    throw new QuantumError("QASM_SYNTAX", `cannot parse "${s.slice(0, 60)}"`, line);
  }
  if (!regs.q) throw new QuantumError("QASM_SYNTAX", "no qubit register declared (expected `qubit[n] q;`)", 1);
  return Object.freeze({ qubits: regs.q.size, clbits: regs.c ? regs.c.size : regs.q.size, gates: Object.freeze(gates) });
}
var samplingSeed = (qasm, seed) => parseInt(sha256Hex(qasm + ":" + String(seed)).slice(0, 8), 16) >>> 0;
function apply1(st, q, a, b, c, d) {
  const bit = 1 << q;
  const { re, im } = st;
  const size = re.length;
  for (let i = 0; i < size; i++) {
    if (i & bit) continue;
    const j = i | bit;
    const r0 = re[i], i0 = im[i], r1 = re[j], i1 = im[j];
    re[i] = a[0] * r0 - a[1] * i0 + b[0] * r1 - b[1] * i1;
    im[i] = a[0] * i0 + a[1] * r0 + b[0] * i1 + b[1] * r1;
    re[j] = c[0] * r0 - c[1] * i0 + d[0] * r1 - d[1] * i1;
    im[j] = c[0] * i0 + c[1] * r0 + d[0] * i1 + d[1] * r1;
  }
}
function applyGate(st, g) {
  const { re, im } = st;
  const size = re.length;
  const SQ = Math.SQRT1_2;
  switch (g.name) {
    case "h":
      apply1(st, g.qubits[0], [SQ, 0], [SQ, 0], [SQ, 0], [-SQ, 0]);
      return;
    case "x":
      apply1(st, g.qubits[0], [0, 0], [1, 0], [1, 0], [0, 0]);
      return;
    case "y":
      apply1(st, g.qubits[0], [0, 0], [0, -1], [0, 1], [0, 0]);
      return;
    case "z":
      apply1(st, g.qubits[0], [1, 0], [0, 0], [0, 0], [-1, 0]);
      return;
    case "s":
      apply1(st, g.qubits[0], [1, 0], [0, 0], [0, 0], [0, 1]);
      return;
    case "t":
      apply1(st, g.qubits[0], [1, 0], [0, 0], [0, 0], [SQ, SQ]);
      return;
    case "rx": {
      const h = g.params[0] / 2, c = Math.cos(h), s = Math.sin(h);
      apply1(st, g.qubits[0], [c, 0], [0, -s], [0, -s], [c, 0]);
      return;
    }
    case "ry": {
      const h = g.params[0] / 2, c = Math.cos(h), s = Math.sin(h);
      apply1(st, g.qubits[0], [c, 0], [-s, 0], [s, 0], [c, 0]);
      return;
    }
    case "rz": {
      const h = g.params[0] / 2, c = Math.cos(h), s = Math.sin(h);
      apply1(st, g.qubits[0], [c, -s], [0, 0], [0, 0], [c, s]);
      return;
    }
    case "cx": {
      const cb = 1 << g.qubits[0], tb = 1 << g.qubits[1];
      for (let i = 0; i < size; i++) {
        if (!(i & cb) || i & tb) continue;
        const j = i | tb;
        const r = re[i], m = im[i];
        re[i] = re[j];
        im[i] = im[j];
        re[j] = r;
        im[j] = m;
      }
      return;
    }
    case "cz": {
      const mask = 1 << g.qubits[0] | 1 << g.qubits[1];
      for (let i = 0; i < size; i++) if ((i & mask) === mask) {
        re[i] = -re[i];
        im[i] = -im[i];
      }
      return;
    }
    case "swap": {
      const ab = 1 << g.qubits[0], bb = 1 << g.qubits[1];
      for (let i = 0; i < size; i++) {
        if (!(i & ab) || i & bb) continue;
        const j = i ^ ab | bb;
        const r = re[i], m = im[i];
        re[i] = re[j];
        im[i] = im[j];
        re[j] = r;
        im[j] = m;
      }
      return;
    }
    case "barrier":
      return;
    case "measure":
      return;
  }
}
var DeterministicQuantumSimulator = class {
  id = "local-statevector";
  maxQubits;
  maxShots;
  constructor(opts = {}) {
    this.maxQubits = Math.min(MAX_QUBITS, opts.maxQubits ?? MAX_QUBITS);
    this.maxShots = Math.max(1, Math.floor(opts.maxShots ?? DEFAULT_MAX_SHOTS));
  }
  run(circuit, shots, seed) {
    try {
      return Promise.resolve(this.simulate(circuit, shots, seed));
    } catch (e) {
      return Promise.reject(e);
    }
  }
  /** Exact outcome probabilities of the measured classical register (keys sorted, only non-zero entries). */
  probabilities(circuit) {
    const parsed = parseQasm3(circuit.qasm);
    if (parsed.qubits > this.maxQubits) throw new QuantumError("TOO_MANY_QUBITS", `${parsed.qubits} > ${this.maxQubits}`);
    const n = parsed.qubits;
    const size = 1 << n;
    const st = { re: new Float64Array(size), im: new Float64Array(size), n };
    st.re[0] = 1;
    const measureMap = /* @__PURE__ */ new Map();
    let measured = false;
    for (const g of parsed.gates) {
      if (g.name === "measure") {
        measured = true;
        g.qubits.forEach((q, i) => measureMap.set((g.clbits ?? [])[i], q));
        continue;
      }
      if (measured && g.name !== "barrier") throw new QuantumError("UNSUPPORTED_GATE", `${g.name} after measurement: only terminal measurement is supported`);
      applyGate(st, g);
    }
    if (!measured) for (let i = 0; i < n; i++) measureMap.set(i, i);
    const clbits = measured ? parsed.clbits : n;
    const probs = /* @__PURE__ */ new Map();
    for (let i = 0; i < size; i++) {
      const p = st.re[i] * st.re[i] + st.im[i] * st.im[i];
      if (p < 1e-15) continue;
      let key = "";
      for (let c = clbits - 1; c >= 0; c--) {
        const q = measureMap.get(c);
        key += q === void 0 ? "0" : i >> q & 1 ? "1" : "0";
      }
      probs.set(key, (probs.get(key) ?? 0) + p);
    }
    return new Map([...probs.entries()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
  /** Synchronous core, also used by the worker kernel. Same circuit + shots + seed => identical counts. */
  simulate(circuit, shots, seed) {
    if (!Number.isInteger(shots) || shots < 1) throw new QuantumError("INVALID_SHOTS", "shots must be a positive integer");
    if (shots > this.maxShots) throw new QuantumError("INVALID_SHOTS", `shots ${shots} > max ${this.maxShots}`);
    if (!Number.isSafeInteger(seed)) throw new QuantumError("INVALID_SEED", "seed must be an integer");
    const probs = this.probabilities(circuit);
    const keys = [...probs.keys()];
    const cumulative = new Float64Array(keys.length);
    let acc = 0;
    keys.forEach((k, i) => {
      acc += probs.get(k);
      cumulative[i] = acc;
    });
    const total = acc;
    const rng = mulberry32(samplingSeed(circuit.qasm, seed));
    const tally = /* @__PURE__ */ new Map();
    for (let s = 0; s < shots; s++) {
      const u = rng() * total;
      let lo = 0, hi = keys.length - 1;
      while (lo < hi) {
        const mid = lo + hi >> 1;
        if (cumulative[mid] > u) hi = mid;
        else lo = mid + 1;
      }
      tally.set(keys[lo], (tally.get(keys[lo]) ?? 0) + 1);
    }
    const counts = {};
    for (const k of keys) {
      const c = tally.get(k);
      if (c) counts[k] = c;
    }
    const tooMany = keys.length > MAX_PROBABILITY_KEYS;
    const probabilities = tooMany ? void 0 : Object.fromEntries(keys.map((k) => [k, probs.get(k)]));
    const base = { counts, shots, executedOn: "LOCAL_SIMULATOR", providerId: this.id, label: "MODEL_ESTIMATE" };
    const fingerprint = sha256Hex(canonicalJson({ ...base, circuit: circuit.fingerprint, seed }));
    return Object.freeze({
      ...base,
      fingerprint,
      ...probabilities ? { probabilities } : {},
      note: tooMany ? `Ideal-circuit model estimate; exact probability table omitted (${keys.length} non-zero outcomes > ${MAX_PROBABILITY_KEYS}).` : "Ideal-circuit model estimate (noiseless statevector, seeded sampling) \u2014 not a measurement."
    });
  }
};

// packages/core/src/engine/quantum/QpuOrchestrator.ts
var QUANTUM_SIMULATE_KIND = "quantumSimulate";
var isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function quantumSimulateKernel(payload) {
  if (!isRecord(payload)) throw new QuantumError("BAD_PAYLOAD", "expected { qasm, shots, seed }");
  const { qasm, shots, seed } = payload;
  if (typeof qasm !== "string") throw new QuantumError("BAD_PAYLOAD", "qasm must be a string");
  if (typeof shots !== "number" || !Number.isInteger(shots)) throw new QuantumError("BAD_PAYLOAD", "shots must be an integer");
  if (typeof seed !== "number" || !Number.isSafeInteger(seed)) throw new QuantumError("BAD_PAYLOAD", "seed must be an integer");
  const maxShots = typeof payload.maxShots === "number" && Number.isInteger(payload.maxShots) ? payload.maxShots : void 0;
  return new DeterministicQuantumSimulator(maxShots !== void 0 ? { maxShots } : {}).simulate(circuitFromQasm(qasm), shots, seed);
}

// packages/core/src/engine/quantum/quantumWorkerEntry.ts
var KERNELS = Object.freeze({ [QUANTUM_SIMULATE_KIND]: quantumSimulateKernel });
function handleQuantumWorkerMessage(m) {
  const msg = m;
  if (!msg || msg.type !== "run" || typeof msg.taskId !== "string" || typeof msg.kind !== "string") {
    return { type: "result", taskId: typeof msg?.taskId === "string" ? msg.taskId : "UNKNOWN", ok: false, error: "BAD_REQUEST" };
  }
  const kernel = KERNELS[msg.kind];
  if (!kernel) return { type: "result", taskId: msg.taskId, ok: false, error: "UNKNOWN_KIND" };
  try {
    return { type: "result", taskId: msg.taskId, ok: true, value: kernel(msg.payload) };
  } catch (e) {
    return { type: "result", taskId: msg.taskId, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
if (parentPort) {
  const port = parentPort;
  port.on("message", (m) => {
    port.postMessage(handleQuantumWorkerMessage(m));
  });
}
export {
  handleQuantumWorkerMessage
};
