/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * GENESIS HYBRID QUANTUM COMPUTING BRIDGE — provider layer.
 *
 * One interface (`QuantumProvider`), two implementations:
 *  - `DeterministicQuantumSimulator`: an exact statevector simulator (≤ 16 qubits) whose sampling
 *    is driven by a seeded PRNG. Its output is a MODEL_ESTIMATE — a computation about an ideal,
 *    noiseless circuit — and is labelled so on every result. It is never a measurement.
 *  - `CloudQpuRestAdapter`: a thin REST client for a real quantum processor. Its output is a
 *    HARDWARE_MEASUREMENT. It never sends a request without an API key and never logs the key.
 *
 * Circuits are OpenQASM 3.0 text (`Qasm3Generator` writes it, `parseQasm3` reads the supported
 * subset back) and carry a sha256 fingerprint of that text, so a result can always be tied to the
 * exact circuit that produced it.
 *
 * Iron rules of this directory: no Math.random, no Date.now — randomness comes from the seed, time
 * from an injected Clock.
 */
import { sha256hex, stableStringify } from '../../knowledge/EvidenceLedger.js';
import { withRetry, HttpError, DEFAULT_RETRY, type HttpTransport, type Sleeper, type RetryPolicy } from '../../knowledge/ingestion/netUtils.js';
import type { KeyProvider } from '../../knowledge/ingestion/YouTubeOfficialApiAdapter.js';

export type { KeyProvider };

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export interface QasmCircuit { readonly qubits: number; readonly qasm: string; readonly fingerprint: string; }
export type ExecutedOn = 'LOCAL_SIMULATOR' | 'CLOUD_QPU';
export type ResultLabel = 'MODEL_ESTIMATE' | 'HARDWARE_MEASUREMENT';
export interface QuantumResult {
  /** Outcome bitstring -> number of shots. Bitstring order is c[n-1]…c[0] (classical bit 0 is the RIGHTMOST character), the OpenQASM / Qiskit convention. */
  readonly counts: Record<string, number>;
  readonly shots: number;
  readonly executedOn: ExecutedOn;
  readonly providerId: string;
  readonly label: ResultLabel;
  readonly fingerprint: string;
  /** Exact Born-rule probabilities of the ideal circuit (simulator only). Absent for hardware results, and absent when the circuit has more than MAX_PROBABILITY_KEYS non-zero outcomes (`note` says so). */
  readonly probabilities?: Record<string, number>;
  readonly note?: string;
}
export interface QuantumProvider { readonly id: string; run(circuit: QasmCircuit, shots: number, seed: number): Promise<QuantumResult>; }

export type QuantumErrorCode =
  | 'QASM_SYNTAX' | 'UNSUPPORTED_GATE' | 'QUBIT_OUT_OF_RANGE' | 'TOO_MANY_QUBITS'
  | 'INVALID_SHOTS' | 'INVALID_SEED' | 'NO_API_KEY' | 'NETWORK' | 'PARSE' | 'QUEUE_FULL' | 'BAD_PAYLOAD';
export class QuantumError extends Error {
  constructor(readonly code: QuantumErrorCode, detail?: string, readonly line?: number) {
    super(code + (line !== undefined ? '@line ' + line : '') + (detail ? ': ' + detail : ''));
    this.name = 'QuantumError';
  }
}
export const isQuantumError = (e: unknown, code?: QuantumErrorCode): e is QuantumError => e instanceof QuantumError && (code === undefined || e.code === code);

export const MAX_QUBITS = 16;
export const DEFAULT_MAX_SHOTS = 8192;
export const MAX_QASM_CHARS = 65_536;
export const MAX_GATES = 20_000;
/** Above this many non-zero outcomes the exact probability table is omitted from the result (never truncated — a partial table would misstate the distribution). */
export const MAX_PROBABILITY_KEYS = 4096;

export type GateName = 'h' | 'x' | 'y' | 'z' | 's' | 't' | 'rx' | 'ry' | 'rz' | 'cx' | 'cz' | 'swap' | 'barrier' | 'measure';
export interface Gate {
  readonly name: GateName;
  readonly qubits: readonly number[];
  readonly params: readonly number[];
  /** measure only: classical bit for each entry of `qubits` (same length). */
  readonly clbits?: readonly number[];
}
export interface ParsedQasm { readonly qubits: number; readonly clbits: number; readonly gates: readonly Gate[]; }

const PARAM_ARITY: Readonly<Record<GateName, number>> = { h: 0, x: 0, y: 0, z: 0, s: 0, t: 0, rx: 1, ry: 1, rz: 1, cx: 0, cz: 0, swap: 0, barrier: 0, measure: 0 };
const QUBIT_ARITY: Readonly<Record<GateName, number>> = { h: 1, x: 1, y: 1, z: 1, s: 1, t: 1, rx: 1, ry: 1, rz: 1, cx: 2, cz: 2, swap: 2, barrier: -1, measure: -1 };
const isGateName = (s: string): s is GateName => Object.prototype.hasOwnProperty.call(PARAM_ARITY, s);

// ---------------------------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------------------------

const fmtParam = (v: number): string => (Number.isFinite(v) ? String(v) : '0');
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** Builder for the supported OpenQASM 3.0 subset. Every method returns `this`; `build()` produces the fingerprinted circuit. */
export class Qasm3Generator {
  private readonly gates: Gate[] = [];
  constructor(readonly qubits: number) {
    if (!Number.isInteger(qubits) || qubits < 1) throw new QuantumError('QASM_SYNTAX', 'qubit count must be a positive integer');
    if (qubits > MAX_QUBITS) throw new QuantumError('TOO_MANY_QUBITS', `${qubits} > ${MAX_QUBITS}`);
  }
  private q(i: number): number {
    if (!Number.isInteger(i) || i < 0 || i >= this.qubits) throw new QuantumError('QUBIT_OUT_OF_RANGE', `q[${i}] of ${this.qubits}`);
    return i;
  }
  private push(name: GateName, qubits: number[], params: number[] = []): this {
    if (this.gates.length >= MAX_GATES) throw new QuantumError('QASM_SYNTAX', `more than ${MAX_GATES} gates`);
    for (const p of params) if (!Number.isFinite(p)) throw new QuantumError('QASM_SYNTAX', `${name}: parameter must be a finite number`);
    if (qubits.length === 2 && qubits[0] === qubits[1]) throw new QuantumError('QASM_SYNTAX', `${name}: the two qubits must differ`);
    this.gates.push(Object.freeze({ name, qubits: Object.freeze(qubits.map((i) => this.q(i))), params: Object.freeze(params) }));
    return this;
  }
  h(q: number): this { return this.push('h', [q]); }
  x(q: number): this { return this.push('x', [q]); }
  y(q: number): this { return this.push('y', [q]); }
  z(q: number): this { return this.push('z', [q]); }
  s(q: number): this { return this.push('s', [q]); }
  t(q: number): this { return this.push('t', [q]); }
  rx(theta: number, q: number): this { return this.push('rx', [q], [theta]); }
  ry(theta: number, q: number): this { return this.push('ry', [q], [theta]); }
  rz(theta: number, q: number): this { return this.push('rz', [q], [theta]); }
  cx(control: number, target: number): this { return this.push('cx', [control, target]); }
  cz(control: number, target: number): this { return this.push('cz', [control, target]); }
  swap(a: number, b: number): this { return this.push('swap', [a, b]); }
  barrier(): this { return this.push('barrier', range(this.qubits)); }
  measureAll(): this {
    const all = range(this.qubits);
    this.gates.push(Object.freeze({ name: 'measure', qubits: Object.freeze(all), params: Object.freeze([]), clbits: Object.freeze([...all]) }));
    return this;
  }
  gateList(): readonly Gate[] { return this.gates.slice(); }
  toQasm3(): string { return emitQasm3(this.qubits, this.qubits, this.gates); }
  build(): QasmCircuit { return circuitFromText(this.qubits, this.toQasm3()); }
}

export function emitQasm3(qubits: number, clbits: number, gates: readonly Gate[]): string {
  const lines = ['OPENQASM 3.0;', 'include "stdgates.inc";', `qubit[${qubits}] q;`, `bit[${clbits}] c;`];
  for (const g of gates) {
    if (g.name === 'measure') {
      const cl = g.clbits ?? [];
      const isAll = g.qubits.length === qubits && clbits === qubits && g.qubits.every((q, i) => q === i && cl[i] === i);
      if (isAll) lines.push('c = measure q;');
      else g.qubits.forEach((q, i) => lines.push(`c[${cl[i]}] = measure q[${q}];`));
    } else if (g.name === 'barrier') {
      lines.push(g.qubits.length === qubits ? 'barrier q;' : `barrier ${g.qubits.map((q) => `q[${q}]`).join(', ')};`);
    } else {
      const params = g.params.length > 0 ? `(${g.params.map(fmtParam).join(', ')})` : '';
      lines.push(`${g.name}${params} ${g.qubits.map((q) => `q[${q}]`).join(', ')};`);
    }
  }
  return lines.join('\n') + '\n';
}

export const circuitFingerprint = (qasm: string): string => sha256hex(qasm);
const circuitFromText = (qubits: number, qasm: string): QasmCircuit => Object.freeze({ qubits, qasm, fingerprint: circuitFingerprint(qasm) });

/** Validates arbitrary QASM text through the parser and returns the fingerprinted circuit. */
export function circuitFromQasm(qasm: string): QasmCircuit {
  const parsed = parseQasm3(qasm);
  return circuitFromText(parsed.qubits, qasm);
}

// Presets ---------------------------------------------------------------------------------------
export const bellState = (): QasmCircuit => new Qasm3Generator(2).h(0).cx(0, 1).measureAll().build();
export const ghz = (n: number): QasmCircuit => {
  const g = new Qasm3Generator(n).h(0);
  for (let i = 1; i < n; i++) g.cx(i - 1, i);
  return g.measureAll().build();
};
export const superposition = (n: number): QasmCircuit => {
  const g = new Qasm3Generator(n);
  for (let i = 0; i < n; i++) g.h(i);
  return g.measureAll().build();
};
export const PRESET_IDS = Object.freeze(['bell-state', 'ghz', 'superposition'] as const);
export type PresetId = (typeof PRESET_IDS)[number];
export const isPresetId = (s: string): s is PresetId => (PRESET_IDS as readonly string[]).includes(s);
export function presetCircuit(id: PresetId, qubits?: number): QasmCircuit {
  if (id === 'bell-state') return bellState();
  const n = qubits ?? (id === 'ghz' ? 3 : 2);
  return id === 'ghz' ? ghz(n) : superposition(n);
}

// ---------------------------------------------------------------------------------------------
// Parser (OpenQASM 3.0 subset; OpenQASM 2 `qreg`/`creg`/`measure ->` tolerated)
// ---------------------------------------------------------------------------------------------

interface Stmt { readonly text: string; readonly line: number; }

/** Removes line comments and block comments while preserving line structure, then splits on `;`. */
function splitStatements(text: string): Stmt[] {
  const out: Stmt[] = [];
  let buf = '';
  let bufLine = 1;
  let line = 1;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '/' && next === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) { if (text[i] === '\n') line++; i++; }
      i += 2;
      continue;
    }
    if (ch === ';') {
      const t = buf.trim();
      if (t) out.push({ text: t, line: bufLine });
      buf = ''; i++;
      bufLine = line;
      continue;
    }
    if (ch === '\n') line++;
    if (!buf.trim()) bufLine = line;
    buf += ch;
    i++;
  }
  const tail = buf.trim();
  if (tail) throw new QuantumError('QASM_SYNTAX', `missing ';' after "${tail.slice(0, 40)}"`, bufLine);
  return out;
}

const NUM = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
/** Angle expressions: plain numbers plus `pi`, `-pi`, `pi/2`, `3*pi/4`, `2*pi`, `-pi/4`, `0.5*pi`. */
export function evalAngle(raw: string, line: number): number {
  const s = raw.replace(/\s+/g, '').toLowerCase().replace(/π/g, 'pi');
  if (NUM.test(s)) return Number(s);
  const m = /^([+-])?(?:(\d+\.?\d*|\.\d+)\*)?pi(?:\/(\d+\.?\d*|\.\d+))?$/.exec(s);
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    const mul = m[2] !== undefined ? Number(m[2]) : 1;
    const div = m[3] !== undefined ? Number(m[3]) : 1;
    if (div === 0) throw new QuantumError('QASM_SYNTAX', `division by zero in "${raw}"`, line);
    return (sign * mul * Math.PI) / div;
  }
  throw new QuantumError('QASM_SYNTAX', `cannot evaluate angle "${raw}"`, line);
}

function parseIndexed(token: string, reg: { name: string; size: number } | null, what: 'qubit' | 'bit', line: number): number[] {
  const t = token.trim();
  if (!reg) throw new QuantumError('QASM_SYNTAX', `${what} register used before its declaration`, line);
  if (t === reg.name) return range(reg.size);
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\[(\d+)\]$/.exec(t);
  if (!m) throw new QuantumError('QASM_SYNTAX', `expected ${what} reference, got "${t}"`, line);
  if (m[1] !== reg.name) throw new QuantumError('QASM_SYNTAX', `unknown ${what} register "${m[1]}"`, line);
  const idx = Number(m[2]);
  if (idx >= reg.size) throw new QuantumError('QUBIT_OUT_OF_RANGE', `${m[1]}[${idx}] of ${reg.size}`, line);
  return [idx];
}

export function parseQasm3(text: string): ParsedQasm {
  if (typeof text !== 'string') throw new QuantumError('QASM_SYNTAX', 'circuit text must be a string', 1);
  if (text.length > MAX_QASM_CHARS) throw new QuantumError('QASM_SYNTAX', `circuit text longer than ${MAX_QASM_CHARS} characters`, 1);
  const stmts = splitStatements(text);
  const regs: { q: { name: string; size: number } | null; c: { name: string; size: number } | null } = { q: null, c: null };
  const gates: Gate[] = [];
  let sawHeader = false;
  const declareQ = (name: string, size: number, line: number): void => {
    if (regs.q) throw new QuantumError('QASM_SYNTAX', 'only one qubit register is supported', line);
    if (!Number.isInteger(size) || size < 1) throw new QuantumError('QASM_SYNTAX', 'qubit register size must be a positive integer', line);
    if (size > MAX_QUBITS) throw new QuantumError('TOO_MANY_QUBITS', `${size} > ${MAX_QUBITS}`, line);
    regs.q = { name, size };
  };
  const declareC = (name: string, size: number, line: number): void => {
    if (regs.c) throw new QuantumError('QASM_SYNTAX', 'only one bit register is supported', line);
    if (!Number.isInteger(size) || size < 1) throw new QuantumError('QASM_SYNTAX', 'bit register size must be a positive integer', line);
    if (size > MAX_QUBITS) throw new QuantumError('TOO_MANY_QUBITS', `bit[${size}] > ${MAX_QUBITS}`, line);
    regs.c = { name, size };
  };
  const pushGate = (g: Gate, line: number): void => {
    if (gates.length >= MAX_GATES) throw new QuantumError('QASM_SYNTAX', `more than ${MAX_GATES} gates`, line);
    gates.push(Object.freeze(g));
  };
  for (const { text: s, line } of stmts) {
    let m: RegExpExecArray | null = /^OPENQASM\s+(\d+(?:\.\d+)?)$/i.exec(s);
    if (m) {
      if (sawHeader) throw new QuantumError('QASM_SYNTAX', 'duplicate OPENQASM header', line);
      if (!/^(2(\.0)?|3(\.0)?)$/.test(m[1])) throw new QuantumError('QASM_SYNTAX', `unsupported OPENQASM version ${m[1]}`, line);
      sawHeader = true;
      continue;
    }
    if (/^include\s+"[^"]*"$/.test(s)) continue;
    m = /^qubit(?:\[(\d+)\])?\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(s);
    if (m) { declareQ(m[2], m[1] === undefined ? 1 : Number(m[1]), line); continue; }
    m = /^bit(?:\[(\d+)\])?\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(s);
    if (m) { declareC(m[2], m[1] === undefined ? 1 : Number(m[1]), line); continue; }
    m = /^qreg\s+([A-Za-z_][A-Za-z0-9_]*)\[(\d+)\]$/.exec(s);
    if (m) { declareQ(m[1], Number(m[2]), line); continue; }
    m = /^creg\s+([A-Za-z_][A-Za-z0-9_]*)\[(\d+)\]$/.exec(s);
    if (m) { declareC(m[1], Number(m[2]), line); continue; }
    // measure: `c[i] = measure q[i]`, `c = measure q`, `measure q[i] -> c[i]`, `measure q -> c`
    let qTok: string | null = null; let cTok: string | null = null;
    const mAssign = /^([A-Za-z_][A-Za-z0-9_]*(?:\[\d+\])?)\s*=\s*measure\s+([A-Za-z_][A-Za-z0-9_]*(?:\[\d+\])?)$/.exec(s);
    const mArrow = mAssign ? null : /^measure\s+([A-Za-z_][A-Za-z0-9_]*(?:\[\d+\])?)\s*->\s*([A-Za-z_][A-Za-z0-9_]*(?:\[\d+\])?)$/.exec(s);
    if (mAssign) { cTok = mAssign[1]; qTok = mAssign[2]; }
    else if (mArrow) { qTok = mArrow[1]; cTok = mArrow[2]; }
    if (qTok !== null && cTok !== null) {
      const qs = parseIndexed(qTok, regs.q, 'qubit', line);
      const cs = parseIndexed(cTok, regs.c, 'bit', line);
      if (qs.length !== cs.length) throw new QuantumError('QASM_SYNTAX', `measure: ${qs.length} qubit(s) into ${cs.length} bit(s)`, line);
      pushGate({ name: 'measure', qubits: Object.freeze(qs), params: Object.freeze([]), clbits: Object.freeze(cs) }, line);
      continue;
    }
    m = /^barrier(?:\s+(.*))?$/.exec(s);
    if (m) {
      const qreg = regs.q;
      if (!qreg) throw new QuantumError('QASM_SYNTAX', 'barrier before qubit declaration', line);
      const args = m[1]?.trim() ? m[1].split(',').flatMap((t) => parseIndexed(t, qreg, 'qubit', line)) : range(qreg.size);
      pushGate({ name: 'barrier', qubits: Object.freeze(args), params: Object.freeze([]) }, line);
      continue;
    }
    // generic gate: name(params)? args
    m = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?\s+(.+)$/.exec(s);
    if (m) {
      const name = m[1].toLowerCase();
      if (name === 'gate' || name === 'def' || name === 'if' || name === 'for' || name === 'while' || name === 'reset' || name === 'let' || name === 'const') throw new QuantumError('UNSUPPORTED_GATE', `"${m[1]}" is not in the supported subset`, line);
      if (!isGateName(name) || name === 'barrier' || name === 'measure') throw new QuantumError('UNSUPPORTED_GATE', `gate "${m[1]}"`, line);
      const params = m[2] !== undefined ? m[2].split(',').map((p) => p.trim()).filter((p) => p.length > 0).map((p) => evalAngle(p, line)) : [];
      if (params.length !== PARAM_ARITY[name]) throw new QuantumError('QASM_SYNTAX', `${name} expects ${PARAM_ARITY[name]} parameter(s), got ${params.length}`, line);
      const qs = m[3].split(',').flatMap((t) => parseIndexed(t, regs.q, 'qubit', line));
      if (qs.length !== QUBIT_ARITY[name]) throw new QuantumError('QASM_SYNTAX', `${name} expects ${QUBIT_ARITY[name]} qubit(s), got ${qs.length}`, line);
      if (qs.length === 2 && qs[0] === qs[1]) throw new QuantumError('QASM_SYNTAX', `${name}: the two qubits must differ`, line);
      pushGate({ name, qubits: Object.freeze(qs), params: Object.freeze(params) }, line);
      continue;
    }
    throw new QuantumError('QASM_SYNTAX', `cannot parse "${s.slice(0, 60)}"`, line);
  }
  if (!regs.q) throw new QuantumError('QASM_SYNTAX', 'no qubit register declared (expected `qubit[n] q;`)', 1);
  return Object.freeze({ qubits: regs.q.size, clbits: regs.c ? regs.c.size : regs.q.size, gates: Object.freeze(gates) });
}

// ---------------------------------------------------------------------------------------------
// Deterministic statevector simulator
// ---------------------------------------------------------------------------------------------

/** mulberry32 — small, fast, fully determined by its 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 32-bit sampling seed derived from the circuit text AND the caller's seed: two circuits never share a stream, and the same (circuit, seed) always does. */
export const samplingSeed = (qasm: string, seed: number): number => parseInt(sha256hex(qasm + ':' + String(seed)).slice(0, 8), 16) >>> 0;

interface State { re: Float64Array; im: Float64Array; n: number; }

function apply1(st: State, q: number, a: [number, number], b: [number, number], c: [number, number], d: [number, number]): void {
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

function applyGate(st: State, g: Gate): void {
  const { re, im } = st;
  const size = re.length;
  const SQ = Math.SQRT1_2;
  switch (g.name) {
    case 'h': apply1(st, g.qubits[0], [SQ, 0], [SQ, 0], [SQ, 0], [-SQ, 0]); return;
    case 'x': apply1(st, g.qubits[0], [0, 0], [1, 0], [1, 0], [0, 0]); return;
    case 'y': apply1(st, g.qubits[0], [0, 0], [0, -1], [0, 1], [0, 0]); return;
    case 'z': apply1(st, g.qubits[0], [1, 0], [0, 0], [0, 0], [-1, 0]); return;
    case 's': apply1(st, g.qubits[0], [1, 0], [0, 0], [0, 0], [0, 1]); return;
    case 't': apply1(st, g.qubits[0], [1, 0], [0, 0], [0, 0], [SQ, SQ]); return;
    case 'rx': { const h = g.params[0] / 2, c = Math.cos(h), s = Math.sin(h); apply1(st, g.qubits[0], [c, 0], [0, -s], [0, -s], [c, 0]); return; }
    case 'ry': { const h = g.params[0] / 2, c = Math.cos(h), s = Math.sin(h); apply1(st, g.qubits[0], [c, 0], [-s, 0], [s, 0], [c, 0]); return; }
    case 'rz': { const h = g.params[0] / 2, c = Math.cos(h), s = Math.sin(h); apply1(st, g.qubits[0], [c, -s], [0, 0], [0, 0], [c, s]); return; }
    case 'cx': {
      const cb = 1 << g.qubits[0], tb = 1 << g.qubits[1];
      for (let i = 0; i < size; i++) {
        if (!(i & cb) || i & tb) continue;
        const j = i | tb;
        const r = re[i], m = im[i]; re[i] = re[j]; im[i] = im[j]; re[j] = r; im[j] = m;
      }
      return;
    }
    case 'cz': {
      const mask = (1 << g.qubits[0]) | (1 << g.qubits[1]);
      for (let i = 0; i < size; i++) if ((i & mask) === mask) { re[i] = -re[i]; im[i] = -im[i]; }
      return;
    }
    case 'swap': {
      const ab = 1 << g.qubits[0], bb = 1 << g.qubits[1];
      for (let i = 0; i < size; i++) {
        if (!(i & ab) || i & bb) continue;
        const j = (i ^ ab) | bb;
        const r = re[i], m = im[i]; re[i] = re[j]; im[i] = im[j]; re[j] = r; im[j] = m;
      }
      return;
    }
    case 'barrier': return;
    case 'measure': return; // handled by the caller (terminal only)
  }
}

export interface SimulatorOptions { readonly maxQubits?: number; readonly maxShots?: number; }

/**
 * Exact statevector simulation of an ideal (noiseless, error-free) circuit, followed by seeded
 * sampling. Everything here is a MODEL_ESTIMATE: it tells you what an ideal device would show,
 * never what a real one did.
 */
export class DeterministicQuantumSimulator implements QuantumProvider {
  readonly id = 'local-statevector';
  readonly maxQubits: number;
  readonly maxShots: number;
  constructor(opts: SimulatorOptions = {}) {
    this.maxQubits = Math.min(MAX_QUBITS, opts.maxQubits ?? MAX_QUBITS);
    this.maxShots = Math.max(1, Math.floor(opts.maxShots ?? DEFAULT_MAX_SHOTS));
  }
  run(circuit: QasmCircuit, shots: number, seed: number): Promise<QuantumResult> {
    try { return Promise.resolve(this.simulate(circuit, shots, seed)); } catch (e) { return Promise.reject(e); }
  }
  /** Exact outcome probabilities of the measured classical register (keys sorted, only non-zero entries). */
  probabilities(circuit: QasmCircuit): Map<string, number> {
    const parsed = parseQasm3(circuit.qasm);
    if (parsed.qubits > this.maxQubits) throw new QuantumError('TOO_MANY_QUBITS', `${parsed.qubits} > ${this.maxQubits}`);
    const n = parsed.qubits;
    const size = 1 << n;
    const st: State = { re: new Float64Array(size), im: new Float64Array(size), n };
    st.re[0] = 1;
    const measureMap = new Map<number, number>(); // clbit -> qubit
    let measured = false;
    for (const g of parsed.gates) {
      if (g.name === 'measure') {
        measured = true;
        g.qubits.forEach((q, i) => measureMap.set((g.clbits ?? [])[i], q));
        continue;
      }
      if (measured && g.name !== 'barrier') throw new QuantumError('UNSUPPORTED_GATE', `${g.name} after measurement: only terminal measurement is supported`);
      applyGate(st, g);
    }
    if (!measured) for (let i = 0; i < n; i++) measureMap.set(i, i); // implicit measure-all, identity mapping
    const clbits = measured ? parsed.clbits : n;
    const probs = new Map<string, number>();
    for (let i = 0; i < size; i++) {
      const p = st.re[i] * st.re[i] + st.im[i] * st.im[i];
      if (p < 1e-15) continue;
      let key = '';
      for (let c = clbits - 1; c >= 0; c--) { const q = measureMap.get(c); key += q === undefined ? '0' : ((i >> q) & 1 ? '1' : '0'); }
      probs.set(key, (probs.get(key) ?? 0) + p);
    }
    return new Map([...probs.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
  }
  /** Synchronous core, also used by the worker kernel. Same circuit + shots + seed => identical counts. */
  simulate(circuit: QasmCircuit, shots: number, seed: number): QuantumResult {
    if (!Number.isInteger(shots) || shots < 1) throw new QuantumError('INVALID_SHOTS', 'shots must be a positive integer');
    if (shots > this.maxShots) throw new QuantumError('INVALID_SHOTS', `shots ${shots} > max ${this.maxShots}`);
    if (!Number.isSafeInteger(seed)) throw new QuantumError('INVALID_SEED', 'seed must be an integer');
    const probs = this.probabilities(circuit);
    const keys = [...probs.keys()];
    const cumulative = new Float64Array(keys.length);
    let acc = 0;
    keys.forEach((k, i) => { acc += probs.get(k) as number; cumulative[i] = acc; });
    const total = acc; // ≈ 1; normalise against rounding drift
    const rng = mulberry32(samplingSeed(circuit.qasm, seed));
    const tally = new Map<string, number>();
    for (let s = 0; s < shots; s++) {
      const u = rng() * total;
      let lo = 0, hi = keys.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] > u) hi = mid; else lo = mid + 1; }
      tally.set(keys[lo], (tally.get(keys[lo]) ?? 0) + 1);
    }
    const counts: Record<string, number> = {};
    for (const k of keys) { const c = tally.get(k); if (c) counts[k] = c; }
    const tooMany = keys.length > MAX_PROBABILITY_KEYS;
    const probabilities: Record<string, number> | undefined = tooMany ? undefined : Object.fromEntries(keys.map((k) => [k, probs.get(k) as number]));
    const base = { counts, shots, executedOn: 'LOCAL_SIMULATOR' as const, providerId: this.id, label: 'MODEL_ESTIMATE' as const };
    const fingerprint = sha256hex(stableStringify({ ...base, circuit: circuit.fingerprint, seed }));
    return Object.freeze({
      ...base,
      fingerprint,
      ...(probabilities ? { probabilities } : {}),
      note: tooMany
        ? `Ideal-circuit model estimate; exact probability table omitted (${keys.length} non-zero outcomes > ${MAX_PROBABILITY_KEYS}).`
        : 'Ideal-circuit model estimate (noiseless statevector, seeded sampling) — not a measurement.',
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Cloud QPU REST adapter
// ---------------------------------------------------------------------------------------------

function parseCounts(body: string): Record<string, number> {
  let json: unknown;
  try { json = JSON.parse(body); } catch { throw new QuantumError('PARSE', 'response is not JSON'); }
  const root = json as { counts?: unknown; results?: { counts?: unknown } } | null;
  const raw = root && typeof root === 'object' ? (root.counts ?? root.results?.counts) : undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new QuantumError('PARSE', 'no `counts` object in response');
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[01]+$/.test(k)) throw new QuantumError('PARSE', `outcome key "${k.slice(0, 20)}" is not a bitstring`);
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new QuantumError('PARSE', `count for "${k}" is not a non-negative integer`);
    if (v > 0) counts[k] = v;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

/**
 * REST client for a real QPU service: `POST endpointUrl` with `{ qasm, shots, seed }` and a bearer
 * key from the KeyProvider. No key => NO_API_KEY thrown BEFORE any network call. Transport errors
 * (after `retry` attempts on 429/5xx) => NETWORK. Bad body => PARSE. The key never appears in any
 * error message or result.
 */
export class CloudQpuRestAdapter implements QuantumProvider {
  constructor(
    private readonly transport: HttpTransport,
    private readonly keys: KeyProvider,
    private readonly sleeper: Sleeper,
    private readonly endpointUrl: string,
    readonly id: string = 'cloud-qpu',
    private readonly retry: RetryPolicy = DEFAULT_RETRY,
  ) {}
  async run(circuit: QasmCircuit, shots: number, seed: number): Promise<QuantumResult> {
    const key = this.keys.getKey();
    if (!key) throw new QuantumError('NO_API_KEY', 'no QPU API key available');
    if (!Number.isInteger(shots) || shots < 1) throw new QuantumError('INVALID_SHOTS', 'shots must be a positive integer');
    const body = JSON.stringify({ qasm: circuit.qasm, shots, seed });
    let res;
    try {
      res = await withRetry(() => this.transport.fetch(this.endpointUrl, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', accept: 'application/json' },
        body,
      }), this.retry, this.sleeper);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : undefined;
      throw new QuantumError('NETWORK', status !== undefined ? 'HTTP_' + status : 'transport failure');
    }
    if (res.status < 200 || res.status >= 300) throw new QuantumError('NETWORK', 'HTTP_' + res.status);
    const counts = parseCounts(res.body);
    const measuredShots = Object.values(counts).reduce((a, b) => a + b, 0);
    if (measuredShots === 0) throw new QuantumError('PARSE', 'empty counts');
    const base = { counts, shots: measuredShots, executedOn: 'CLOUD_QPU' as const, providerId: this.id, label: 'HARDWARE_MEASUREMENT' as const };
    return Object.freeze({ ...base, fingerprint: sha256hex(stableStringify({ ...base, circuit: circuit.fingerprint, seed })) });
  }
}
