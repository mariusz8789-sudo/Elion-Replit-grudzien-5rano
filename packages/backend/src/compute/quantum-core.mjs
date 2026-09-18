/* eslint-disable @typescript-eslint/no-unused-vars -- esbuild bundle of packages/core/src/engine/quantum/serverEntry.ts; regenerate with npm run compute:bundle:quantum, do not edit */

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

// packages/core/src/knowledge/ingestion/netUtils.ts
var realSleeper = { sleep: (ms) => new Promise((res) => setTimeout(res, ms)) };
var HttpError = class extends Error {
  constructor(status) {
    super("HTTP_" + status);
    this.status = status;
  }
};
var isRetryable = (e) => e instanceof HttpError && (e.status === 429 || e.status >= 500);
var DEFAULT_RETRY = { attempts: 4, baseMs: 250, maxMs: 4e3 };
async function withRetry(fn, policy, sleeper, retryable = isRetryable) {
  let lastErr = null;
  for (let i = 0; i < policy.attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!retryable(e) || i === policy.attempts - 1) break;
      await sleeper.sleep(Math.min(policy.maxMs, policy.baseMs * Math.pow(2, i)));
    }
  }
  throw lastErr;
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
var isQuantumError = (e, code) => e instanceof QuantumError && (code === void 0 || e.code === code);
var MAX_QUBITS = 16;
var DEFAULT_MAX_SHOTS = 8192;
var MAX_QASM_CHARS = 65536;
var MAX_GATES = 2e4;
var MAX_PROBABILITY_KEYS = 4096;
var PARAM_ARITY = { h: 0, x: 0, y: 0, z: 0, s: 0, t: 0, rx: 1, ry: 1, rz: 1, cx: 0, cz: 0, swap: 0, barrier: 0, measure: 0 };
var QUBIT_ARITY = { h: 1, x: 1, y: 1, z: 1, s: 1, t: 1, rx: 1, ry: 1, rz: 1, cx: 2, cz: 2, swap: 2, barrier: -1, measure: -1 };
var isGateName = (s) => Object.prototype.hasOwnProperty.call(PARAM_ARITY, s);
var fmtParam = (v) => Number.isFinite(v) ? String(v) : "0";
var range = (n) => Array.from({ length: n }, (_, i) => i);
var Qasm3Generator = class {
  constructor(qubits) {
    this.qubits = qubits;
    if (!Number.isInteger(qubits) || qubits < 1) throw new QuantumError("QASM_SYNTAX", "qubit count must be a positive integer");
    if (qubits > MAX_QUBITS) throw new QuantumError("TOO_MANY_QUBITS", `${qubits} > ${MAX_QUBITS}`);
  }
  gates = [];
  q(i) {
    if (!Number.isInteger(i) || i < 0 || i >= this.qubits) throw new QuantumError("QUBIT_OUT_OF_RANGE", `q[${i}] of ${this.qubits}`);
    return i;
  }
  push(name, qubits, params = []) {
    if (this.gates.length >= MAX_GATES) throw new QuantumError("QASM_SYNTAX", `more than ${MAX_GATES} gates`);
    for (const p of params) if (!Number.isFinite(p)) throw new QuantumError("QASM_SYNTAX", `${name}: parameter must be a finite number`);
    if (qubits.length === 2 && qubits[0] === qubits[1]) throw new QuantumError("QASM_SYNTAX", `${name}: the two qubits must differ`);
    this.gates.push(Object.freeze({ name, qubits: Object.freeze(qubits.map((i) => this.q(i))), params: Object.freeze(params) }));
    return this;
  }
  h(q) {
    return this.push("h", [q]);
  }
  x(q) {
    return this.push("x", [q]);
  }
  y(q) {
    return this.push("y", [q]);
  }
  z(q) {
    return this.push("z", [q]);
  }
  s(q) {
    return this.push("s", [q]);
  }
  t(q) {
    return this.push("t", [q]);
  }
  rx(theta, q) {
    return this.push("rx", [q], [theta]);
  }
  ry(theta, q) {
    return this.push("ry", [q], [theta]);
  }
  rz(theta, q) {
    return this.push("rz", [q], [theta]);
  }
  cx(control, target) {
    return this.push("cx", [control, target]);
  }
  cz(control, target) {
    return this.push("cz", [control, target]);
  }
  swap(a, b) {
    return this.push("swap", [a, b]);
  }
  barrier() {
    return this.push("barrier", range(this.qubits));
  }
  measureAll() {
    const all = range(this.qubits);
    this.gates.push(Object.freeze({ name: "measure", qubits: Object.freeze(all), params: Object.freeze([]), clbits: Object.freeze([...all]) }));
    return this;
  }
  gateList() {
    return this.gates.slice();
  }
  toQasm3() {
    return emitQasm3(this.qubits, this.qubits, this.gates);
  }
  build() {
    return circuitFromText(this.qubits, this.toQasm3());
  }
};
function emitQasm3(qubits, clbits, gates) {
  const lines = ["OPENQASM 3.0;", 'include "stdgates.inc";', `qubit[${qubits}] q;`, `bit[${clbits}] c;`];
  for (const g of gates) {
    if (g.name === "measure") {
      const cl = g.clbits ?? [];
      const isAll = g.qubits.length === qubits && clbits === qubits && g.qubits.every((q, i) => q === i && cl[i] === i);
      if (isAll) lines.push("c = measure q;");
      else g.qubits.forEach((q, i) => lines.push(`c[${cl[i]}] = measure q[${q}];`));
    } else if (g.name === "barrier") {
      lines.push(g.qubits.length === qubits ? "barrier q;" : `barrier ${g.qubits.map((q) => `q[${q}]`).join(", ")};`);
    } else {
      const params = g.params.length > 0 ? `(${g.params.map(fmtParam).join(", ")})` : "";
      lines.push(`${g.name}${params} ${g.qubits.map((q) => `q[${q}]`).join(", ")};`);
    }
  }
  return lines.join("\n") + "\n";
}
var circuitFingerprint = (qasm) => sha256hex(qasm);
var circuitFromText = (qubits, qasm) => Object.freeze({ qubits, qasm, fingerprint: circuitFingerprint(qasm) });
function circuitFromQasm(qasm) {
  const parsed = parseQasm3(qasm);
  return circuitFromText(parsed.qubits, qasm);
}
var bellState = () => new Qasm3Generator(2).h(0).cx(0, 1).measureAll().build();
var ghz = (n) => {
  const g = new Qasm3Generator(n).h(0);
  for (let i = 1; i < n; i++) g.cx(i - 1, i);
  return g.measureAll().build();
};
var superposition = (n) => {
  const g = new Qasm3Generator(n);
  for (let i = 0; i < n; i++) g.h(i);
  return g.measureAll().build();
};
var PRESET_IDS = Object.freeze(["bell-state", "ghz", "superposition"]);
var isPresetId = (s) => PRESET_IDS.includes(s);
function presetCircuit(id, qubits) {
  if (id === "bell-state") return bellState();
  const n = qubits ?? (id === "ghz" ? 3 : 2);
  return id === "ghz" ? ghz(n) : superposition(n);
}
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
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var samplingSeed = (qasm, seed) => parseInt(sha256hex(qasm + ":" + String(seed)).slice(0, 8), 16) >>> 0;
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
    const fingerprint = sha256hex(stableStringify({ ...base, circuit: circuit.fingerprint, seed }));
    return Object.freeze({
      ...base,
      fingerprint,
      ...probabilities ? { probabilities } : {},
      note: tooMany ? `Ideal-circuit model estimate; exact probability table omitted (${keys.length} non-zero outcomes > ${MAX_PROBABILITY_KEYS}).` : "Ideal-circuit model estimate (noiseless statevector, seeded sampling) \u2014 not a measurement."
    });
  }
};
function parseCounts(body) {
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    throw new QuantumError("PARSE", "response is not JSON");
  }
  const root = json;
  const raw = root && typeof root === "object" ? root.counts ?? root.results?.counts : void 0;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new QuantumError("PARSE", "no `counts` object in response");
  const counts = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!/^[01]+$/.test(k)) throw new QuantumError("PARSE", `outcome key "${k.slice(0, 20)}" is not a bitstring`);
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new QuantumError("PARSE", `count for "${k}" is not a non-negative integer`);
    if (v > 0) counts[k] = v;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => a[0] < b[0] ? -1 : 1));
}
var CloudQpuRestAdapter = class {
  constructor(transport, keys, sleeper, endpointUrl, id = "cloud-qpu", retry = DEFAULT_RETRY) {
    this.transport = transport;
    this.keys = keys;
    this.sleeper = sleeper;
    this.endpointUrl = endpointUrl;
    this.id = id;
    this.retry = retry;
  }
  async run(circuit, shots, seed) {
    const key = this.keys.getKey();
    if (!key) throw new QuantumError("NO_API_KEY", "no QPU API key available");
    if (!Number.isInteger(shots) || shots < 1) throw new QuantumError("INVALID_SHOTS", "shots must be a positive integer");
    const body = JSON.stringify({ qasm: circuit.qasm, shots, seed });
    let res;
    try {
      res = await withRetry(() => this.transport.fetch(this.endpointUrl, {
        method: "POST",
        headers: { authorization: "Bearer " + key, "content-type": "application/json", accept: "application/json" },
        body
      }), this.retry, this.sleeper);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : void 0;
      throw new QuantumError("NETWORK", status !== void 0 ? "HTTP_" + status : "transport failure");
    }
    if (res.status < 200 || res.status >= 300) throw new QuantumError("NETWORK", "HTTP_" + res.status);
    const counts = parseCounts(res.body);
    const measuredShots = Object.values(counts).reduce((a, b) => a + b, 0);
    if (measuredShots === 0) throw new QuantumError("PARSE", "empty counts");
    const base = { counts, shots: measuredShots, executedOn: "CLOUD_QPU", providerId: this.id, label: "HARDWARE_MEASUREMENT" };
    return Object.freeze({ ...base, fingerprint: sha256hex(stableStringify({ ...base, circuit: circuit.fingerprint, seed })) });
  }
};

// packages/core/src/engine/quantum/QpuOrchestrator.ts
var QUANTUM_SIMULATE_KIND = "quantumSimulate";
var SINGLE_ATTEMPT = { attempts: 1, baseMs: 0, maxMs: 0 };
var DEFAULT_MAX_QUEUE = 32;
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
function asQuantumResult(v) {
  if (!isRecord(v) || !isRecord(v.counts) || typeof v.shots !== "number" || typeof v.fingerprint !== "string" || v.executedOn !== "LOCAL_SIMULATOR" || v.label !== "MODEL_ESTIMATE" || typeof v.providerId !== "string") {
    throw new QuantumError("BAD_PAYLOAD", "compute sink returned something that is not a local QuantumResult");
  }
  return v;
}
var QpuOrchestrator = class {
  constructor(clock, simulator, cloud, sleeper, opts = {}, sinks = {}) {
    this.clock = clock;
    this.simulator = simulator;
    this.cloud = cloud;
    this.sleeper = sleeper;
    this.sinks = sinks;
    this.retry = opts.retry ?? SINGLE_ATTEMPT;
    this.maxQueue = Math.max(1, Math.floor(opts.maxQueue ?? DEFAULT_MAX_QUEUE));
  }
  queue = [];
  running = false;
  seq = 0;
  retry;
  maxQueue;
  /** Jobs waiting or running right now. */
  get pending() {
    return this.queue.length + (this.running ? 1 : 0);
  }
  get hasCloudProvider() {
    return this.cloud !== null;
  }
  submit(circuit, shots, seed) {
    if (this.pending >= this.maxQueue) return Promise.reject(new QuantumError("QUEUE_FULL", `${this.pending} job(s) pending, max ${this.maxQueue}`));
    const submittedAt = this.clock.now();
    const jobId = "QJ-" + sha256hex(stableStringify({ circuit: circuit.fingerprint, shots, seed, seq: this.seq++ })).slice(0, 16);
    return new Promise((resolve, reject) => {
      this.queue.push({ jobId, circuit, shots, seed, submittedAt, queuePosition: this.pending, resolve, reject });
      void this.drain();
    });
  }
  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      for (; ; ) {
        const job = this.queue.shift();
        if (!job) break;
        try {
          job.resolve(await this.execute(job));
        } catch (e) {
          job.reject(e);
        }
      }
    } finally {
      this.running = false;
    }
  }
  async execute(job) {
    let attempts = 0;
    let fallbackReason;
    let result = null;
    if (this.cloud === null) fallbackReason = "NO_CLOUD_PROVIDER";
    else {
      const cloud = this.cloud;
      try {
        result = await withRetry(() => {
          attempts++;
          return cloud.run(job.circuit, job.shots, job.seed);
        }, this.retry, this.sleeper, (e) => isQuantumError(e, "NETWORK"));
      } catch (e) {
        if (isQuantumError(e, "NO_API_KEY")) fallbackReason = "NO_API_KEY";
        else if (isQuantumError(e, "NETWORK") || isQuantumError(e, "PARSE")) fallbackReason = "CLOUD_UNAVAILABLE";
        else {
          this.ledger(job, false);
          throw e;
        }
      }
    }
    if (result === null) {
      attempts++;
      try {
        result = await this.runLocal(job);
      } catch (e) {
        this.ledger(job, false);
        throw e;
      }
    }
    this.ledger(job, true, result, fallbackReason);
    return Object.freeze({
      jobId: job.jobId,
      result,
      ...fallbackReason ? { fallbackReason } : {},
      attempts,
      queuePosition: job.queuePosition,
      submittedAt: job.submittedAt,
      finishedAt: this.clock.now()
    });
  }
  async runLocal(job) {
    const compute = this.sinks.compute;
    if (!compute) return this.simulator.run(job.circuit, job.shots, job.seed);
    const r = await compute.submit(QUANTUM_SIMULATE_KIND, { qasm: job.circuit.qasm, shots: job.shots, seed: job.seed, maxShots: this.simulator.maxShots });
    if (!r.ok) throw new QuantumError("BAD_PAYLOAD", r.error ?? "compute sink failed");
    return asQuantumResult(r.value);
  }
  ledger(job, ok, result, fallbackReason) {
    this.sinks.ledger?.append({
      kind: "quantum-job",
      jobId: job.jobId,
      ok,
      ...result ? { executedOn: result.executedOn, label: result.label } : {},
      ...fallbackReason ? { fallbackReason } : {},
      circuitFingerprint: job.circuit.fingerprint,
      at: this.clock.now()
    });
  }
};

// packages/core/src/knowledge/ingestion/EnvKeyProvider.ts
function envKeyProvider(env, name) {
  return { getKey: () => {
    const v = env[name];
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  } };
}
var KEY_ENV_NAMES = Object.freeze({ YOUTUBE: "YOUTUBE_API_KEY", X: "X_API_KEY", FACEBOOK: "FACEBOOK_API_KEY" });

// packages/core/src/engine/native/nativeKernels.ts
var asNumberArray = (p) => {
  if (!Array.isArray(p) || p.some((x) => typeof x !== "number")) throw new TypeError("PAYLOAD_NOT_NUMBER_ARRAY");
  return p;
};
var asStringArray = (p) => {
  if (!Array.isArray(p) || p.some((x) => typeof x !== "string")) throw new TypeError("PAYLOAD_NOT_STRING_ARRAY");
  return p;
};
var asMatMul = (p) => {
  const o = p;
  if (!o || typeof o !== "object" || !Array.isArray(o.a) || !Array.isArray(o.b) || typeof o.n !== "number" || !Number.isInteger(o.n) || o.n < 0) throw new TypeError("PAYLOAD_NOT_MATMUL");
  if (o.a.length !== o.n * o.n || o.b.length !== o.n * o.n || o.a.some((x) => typeof x !== "number") || o.b.some((x) => typeof x !== "number")) throw new TypeError("PAYLOAD_NOT_MATMUL");
  return { a: o.a, b: o.b, n: o.n };
};
var NATIVE_KERNELS = Object.freeze({
  vectorSum: (p) => asNumberArray(p).reduce((a, b) => a + b, 0),
  matrixMul: (p) => {
    const { a, b, n } = asMatMul(p);
    const out = new Array(n * n).fill(0);
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
      const av = a[i * n + k];
      for (let j = 0; j < n; j++) out[i * n + j] += av * b[k * n + j];
    }
    return out;
  },
  hashBatch: (p) => asStringArray(p).map((s) => sha256hex(s)),
  failingTask: () => {
    throw new Error("KERNEL_FAULT");
  }
});
var lookupKernel = (table, kind) => Object.prototype.hasOwnProperty.call(table, kind) && typeof table[kind] === "function" ? table[kind] : void 0;

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

// packages/core/src/engine/native/GenesisNativeOrchestrator.ts
import { Worker } from "node:worker_threads";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";

// packages/core/src/engine/native/workerProtocol.ts
var rec = (m) => typeof m === "object" && m !== null ? m : null;
var isWorkerResult = (m) => {
  const o = rec(m);
  return !!o && o.type === "result" && typeof o.taskId === "string" && typeof o.ok === "boolean";
};

// packages/core/src/engine/native/GenesisNativeOrchestrator.ts
var DEFAULT_MAX_QUEUE2 = 1024;
var DEFAULT_MAX_LINES = 1e4;
var DEFAULT_MAX_BYTES = 1024 * 1024;
var errorText = (e) => e instanceof Error ? e.message : String(e);
var LineCollector = class {
  constructor(maxLines, maxBytes) {
    this.maxLines = maxLines;
    this.maxBytes = maxBytes;
  }
  lines = [];
  truncated = false;
  carry = "";
  bytes = 0;
  decoder = new StringDecoder("utf8");
  /** Returns true once a cap is exceeded (further input is discarded). */
  push(chunk) {
    if (this.truncated) return true;
    this.bytes += chunk.length;
    const parts = (this.carry + this.decoder.write(chunk)).split("\n");
    this.carry = parts.pop() ?? "";
    for (const l of parts) if (l.trim() && this.lines.length < this.maxLines) this.lines.push(l);
    if (this.bytes > this.maxBytes || this.lines.length >= this.maxLines) {
      this.truncated = true;
      this.carry = "";
    }
    return this.truncated;
  }
  flush() {
    const tail = this.carry + this.decoder.end();
    this.carry = "";
    if (!this.truncated && tail.trim() && this.lines.length < this.maxLines) this.lines.push(tail);
  }
};
var GenesisNativeOrchestrator = class _GenesisNativeOrchestrator {
  constructor(clock, bridge, opts = {}, reasoningSink, ledgerSink) {
    this.clock = clock;
    this.bridge = bridge;
    this.opts = opts;
    this.reasoningSink = reasoningSink;
    this.ledgerSink = ledgerSink;
    this.kernels = Object.freeze({ ...NATIVE_KERNELS, ...opts.kernels ?? {} });
  }
  queue = [];
  active = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  outcomes = [];
  workers = [];
  seq = 0;
  drainResolvers = [];
  closed = false;
  kernels;
  static taskIdFor(kind, payload, seq) {
    return "NT-" + seq.toString(36).toUpperCase() + "-" + sha256hex(stableStringify({ kind, payload })).slice(0, 10);
  }
  get queueLength() {
    return this.queue.length;
  }
  get activeCount() {
    return this.active.size;
  }
  get workerCount() {
    return this.workers.length;
  }
  get isClosed() {
    return this.closed;
  }
  getOutcomes() {
    return this.outcomes;
  }
  /**
   * Submit a task. Always returns a Promise (design choice: the delivered version returned a bare
   * TaskOutcome for QUEUE_FULL and a Promise otherwise, forcing every caller to branch on `'then' in r`;
   * an already-resolved promise keeps one call shape and lets rejections flow through the same
   * `ok:false` path as UNKNOWN_KIND / KERNEL_FAULT / SHUTDOWN). QUEUE_FULL and SHUTDOWN pre-rejections
   * are not accepted tasks: no taskId sequence number is consumed and nothing reaches the sinks.
   */
  submit(kind, payload) {
    if (this.closed) return Promise.resolve({ taskId: _GenesisNativeOrchestrator.taskIdFor(kind, payload, this.seq), kind, ok: false, error: "SHUTDOWN" });
    const maxQueue = this.opts.maxQueue ?? DEFAULT_MAX_QUEUE2;
    if (this.queue.length + this.active.size >= maxQueue) return Promise.resolve({ taskId: _GenesisNativeOrchestrator.taskIdFor(kind, payload, this.seq), kind, ok: false, error: "QUEUE_FULL" });
    const taskId = _GenesisNativeOrchestrator.taskIdFor(kind, payload, this.seq++);
    const receipt = { taskId, kind, payload };
    const promise = new Promise((resolve) => {
      this.pending.set(taskId, { receipt, resolve });
    });
    this.queue.push(receipt);
    this.schedule();
    return promise;
  }
  schedule() {
    if (this.closed) return;
    if (this.queue.length > 0) {
      const limit = this.bridge.recommendedConcurrency();
      while (this.queue.length > 0 && this.active.size < limit) {
        const receipt = this.queue.shift();
        if (!receipt) break;
        this.runOne(receipt);
      }
    }
    this.settleDrain();
  }
  settleDrain() {
    if (this.queue.length === 0 && this.active.size === 0 && this.drainResolvers.length) {
      const rs = this.drainResolvers;
      this.drainResolvers = [];
      rs.forEach((r) => r());
    }
  }
  /** Single delivery point: outcomes list, sinks, submit() promise. */
  settle(receipt, outcome) {
    this.outcomes.push(outcome);
    this.reasoningSink?.push(outcome);
    this.ledgerSink?.append({ kind: receipt.kind, taskId: receipt.taskId, ok: outcome.ok, at: this.clock.now() });
    const p = this.pending.get(receipt.taskId);
    if (p) {
      this.pending.delete(receipt.taskId);
      p.resolve(outcome);
    }
  }
  finish(receipt, outcome) {
    if (!this.active.delete(receipt.taskId)) return;
    this.settle(receipt, outcome);
    this.schedule();
  }
  runOne(receipt) {
    this.active.set(receipt.taskId, receipt);
    const ok = (value) => ({ taskId: receipt.taskId, kind: receipt.kind, ok: true, value });
    const fail = (error, detail) => detail === void 0 ? { taskId: receipt.taskId, kind: receipt.kind, ok: false, error } : { taskId: receipt.taskId, kind: receipt.kind, ok: false, error, detail };
    if ((this.opts.mode ?? "inline") === "inline") {
      const kernel = lookupKernel(this.kernels, receipt.kind);
      if (!kernel) {
        this.finish(receipt, fail("UNKNOWN_KIND"));
        return;
      }
      Promise.resolve().then(() => kernel(receipt.payload)).then((value) => this.finish(receipt, ok(value)), (e) => this.finish(receipt, fail(errorText(e))));
      return;
    }
    const slot = this.workers.find((w) => w.busy === null) ?? this.spawnWorker();
    if (!slot) {
      this.finish(receipt, fail("WORKER_SCRIPT_MISSING", this.workerScriptPath()));
      return;
    }
    slot.busy = receipt.taskId;
    slot.busyKind = receipt.kind;
    slot.worker.ref();
    const req = { type: "run", taskId: receipt.taskId, kind: receipt.kind, payload: receipt.payload };
    slot.worker.postMessage(req);
  }
  workerScriptPath() {
    return this.opts.workerScript ?? fileURLToPath(new URL("./nativeWorkerEntry.js", import.meta.url));
  }
  spawnWorker() {
    const script = this.workerScriptPath();
    if (!existsSync(script)) return null;
    const worker = new Worker(script);
    worker.unref();
    const slot = { worker, busy: null, busyKind: null };
    this.workers.push(slot);
    worker.on("message", (m) => {
      if (!isWorkerResult(m) || slot.busy !== m.taskId) return;
      const receipt = this.active.get(m.taskId) ?? { taskId: m.taskId, kind: slot.busyKind ?? "", payload: null };
      slot.busy = null;
      slot.busyKind = null;
      worker.unref();
      const outcome = m.ok ? { taskId: receipt.taskId, kind: receipt.kind, ok: true, value: m.value } : { taskId: receipt.taskId, kind: receipt.kind, ok: false, error: m.error ?? "WORKER_RESULT_WITHOUT_ERROR" };
      this.finish(receipt, outcome);
    });
    worker.on("error", (e) => this.retireWorker(slot, errorText(e)));
    worker.on("exit", (code) => this.retireWorker(slot, "exit code " + String(code)));
    worker.on("messageerror", (e) => {
      const tid = slot.busy;
      slot.busy = null;
      slot.busyKind = null;
      worker.unref();
      const receipt = tid ? this.active.get(tid) : void 0;
      if (receipt) this.finish(receipt, { taskId: receipt.taskId, kind: receipt.kind, ok: false, error: "WORKER_MESSAGE_ERROR", detail: errorText(e) });
    });
    return slot;
  }
  /** Remove a dead worker from the pool and fail whatever it was running; the next task spawns a fresh worker. Idempotent. */
  retireWorker(slot, detail) {
    const idx = this.workers.indexOf(slot);
    if (idx < 0) return;
    this.workers.splice(idx, 1);
    const tid = slot.busy;
    slot.busy = null;
    slot.busyKind = null;
    void slot.worker.terminate().catch(() => void 0);
    const receipt = tid ? this.active.get(tid) : void 0;
    if (receipt) this.finish(receipt, { taskId: receipt.taskId, kind: receipt.kind, ok: false, error: "WORKER_ERROR", detail });
    else this.schedule();
  }
  /** Resolves when nothing is queued or active (immediately after shutdown). */
  drain() {
    if (this.queue.length === 0 && this.active.size === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.drainResolvers.push(resolve);
    });
  }
  /** Rejects the queue and in-flight tasks with SHUTDOWN, terminates every worker, releases drain() waiters. Idempotent. */
  async shutdown() {
    this.closed = true;
    const workers = this.workers;
    this.workers = [];
    this.queue = [];
    this.active.clear();
    for (const p of [...this.pending.values()]) this.settle(p.receipt, { taskId: p.receipt.taskId, kind: p.receipt.kind, ok: false, error: "SHUTDOWN" });
    await Promise.all(workers.map((w) => w.worker.terminate().catch(() => void 0)));
    this.settleDrain();
  }
  /**
   * child_process stdio streaming with a strict exact-match executable allow-list and shell:false (no injection
   * surface). Output is bounded (maxLines / maxBytes per stream; the child is killed on overflow), stderr is captured
   * separately and drained (an unread stderr pipe would block the child at 64 KiB), and an optional timeout kills the child.
   *
   * SECURITY: internal primitive only. NEVER expose this method (or its argv) to an HTTP endpoint, RPC or any
   * user-controlled input: the default allow-list is `process.execPath`, and `node -e <code>` is arbitrary code
   * execution, so allow-listing the executable does not make the arguments safe.
   */
  streamSubprocess(argv, options = {}) {
    const allow = this.opts.allowedExecutables ?? [process.execPath];
    const executable = argv[0];
    if (executable === void 0 || !allow.includes(executable)) {
      return Promise.resolve({ exitCode: null, signal: null, lines: ["REJECTED_EXECUTABLE_NOT_ALLOWLISTED"], stderrLines: [], truncated: false, timedOut: false, error: "REJECTED_EXECUTABLE_NOT_ALLOWLISTED" });
    }
    const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const out = new LineCollector(maxLines, maxBytes);
    const err = new LineCollector(maxLines, maxBytes);
    return new Promise((resolve) => {
      let settled = false;
      let timedOut = false;
      let spawnError;
      let timer;
      const child = spawn(executable, argv.slice(1), { shell: false, stdio: ["ignore", "pipe", "pipe"] });
      const kill = () => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      };
      const done = (exitCode, signal) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        out.flush();
        err.flush();
        const base = { exitCode, signal, lines: out.lines, stderrLines: err.lines, truncated: out.truncated || err.truncated, timedOut };
        resolve(spawnError === void 0 ? base : { ...base, error: spawnError });
      };
      child.stdout?.on("data", (d) => {
        if (out.push(d)) kill();
      });
      child.stderr?.on("data", (d) => {
        if (err.push(d)) kill();
      });
      if (options.timeoutMs !== void 0 && options.timeoutMs > 0) timer = setTimeout(() => {
        timedOut = true;
        kill();
      }, options.timeoutMs);
      child.on("close", (code, signal) => done(code, signal));
      child.on("error", (e) => {
        spawnError = errorText(e);
        kill();
        done(child.exitCode, child.signalCode);
      });
    });
  }
};
export {
  CloudQpuRestAdapter,
  DEFAULT_MAX_SHOTS,
  DeterministicQuantumSimulator,
  GenesisNativeOrchestrator,
  HttpError,
  MAX_QUBITS,
  PRESET_IDS,
  QUANTUM_SIMULATE_KIND,
  Qasm3Generator,
  QpuOrchestrator,
  QuantumError,
  SystemResourceBridge,
  bellState,
  circuitFromQasm,
  envKeyProvider,
  ghz,
  isPresetId,
  isQuantumError,
  parseQasm3,
  presetCircuit,
  quantumSimulateKernel,
  realSleeper,
  superposition
};
