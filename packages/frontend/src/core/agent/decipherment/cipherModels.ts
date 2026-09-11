import type { CipherModel, CipherKey } from './deciphermentTypes';

/**
 * Classical cipher models — TOY / EDUCATIONAL / HISTORICAL ONLY.
 *
 * These operate on alphabet indices (0..n-1), generalized over whatever
 * glyph inventory a sequence actually has — never a fixed Latin alphabet.
 * NEVER extend this file toward real credentials, accounts, networks, or
 * modern security systems: the Cyber domain (`cyberReasoningKernel.ts`)
 * already owns that boundary, on its own synthetic target.
 */

const mod = (x: number, m: number): number => ((x % m) + m) % m;
function gcd(a: number, b: number): number { let x = Math.abs(a); let y = Math.abs(b); while (y !== 0) { [x, y] = [y, x % y]; } return x; }
function modInverse(a: number, m: number): number {
  const av = mod(a, m);
  for (let x = 1; x < m; x++) if (mod(av * x, m) === 1) return x;
  throw new Error('NO_MODULAR_INVERSE');
}

type Codec = (idx: readonly number[], key: CipherKey, alphabetSize: number) => readonly number[];

const caesarEncrypt: Codec = (idx, key, n) => {
  if (key.kind !== 'CAESAR') throw new Error('KEY_MODEL_MISMATCH:CAESAR');
  if (n <= 0) throw new Error('EMPTY_ALPHABET');
  return Object.freeze(idx.map((x) => mod(x + key.shift, n)));
};
const caesarDecrypt: Codec = (idx, key, n) => {
  if (key.kind !== 'CAESAR') throw new Error('KEY_MODEL_MISMATCH:CAESAR');
  if (n <= 0) throw new Error('EMPTY_ALPHABET');
  return Object.freeze(idx.map((x) => mod(x - key.shift, n)));
};
export const CAESAR_MODEL: CipherModel = Object.freeze({
  modelId: 'CAESAR',
  assumptions: Object.freeze(['fixed shift over alphabet indices', 'toy classical cipher']),
  encrypt: caesarEncrypt,
  decrypt: caesarDecrypt,
});

const affineEncrypt: Codec = (idx, key, n) => {
  if (key.kind !== 'AFFINE') throw new Error('KEY_MODEL_MISMATCH:AFFINE');
  if (n <= 0) throw new Error('EMPTY_ALPHABET');
  if (gcd(key.a, n) !== 1) throw new Error('AFFINE_A_NOT_COPRIME');
  return Object.freeze(idx.map((x) => mod(key.a * x + key.b, n)));
};
const affineDecrypt: Codec = (idx, key, n) => {
  if (key.kind !== 'AFFINE') throw new Error('KEY_MODEL_MISMATCH:AFFINE');
  if (n <= 0) throw new Error('EMPTY_ALPHABET');
  if (gcd(key.a, n) !== 1) throw new Error('AFFINE_A_NOT_COPRIME');
  const inv = modInverse(key.a, n);
  return Object.freeze(idx.map((x) => mod(inv * (x - key.b), n)));
};
export const AFFINE_MODEL: CipherModel = Object.freeze({
  modelId: 'AFFINE',
  assumptions: Object.freeze(['y = (a*x + b) mod n', 'gcd(a, n) = 1 required', 'toy classical cipher']),
  encrypt: affineEncrypt,
  decrypt: affineDecrypt,
});

const vigenereEncrypt: Codec = (idx, key, n) => {
  if (key.kind !== 'VIGENERE') throw new Error('KEY_MODEL_MISMATCH:VIGENERE');
  if (key.shifts.length === 0) throw new Error('VIGENERE_EMPTY_KEY');
  if (n <= 0) throw new Error('EMPTY_ALPHABET');
  return Object.freeze(idx.map((x, i) => mod(x + key.shifts[i % key.shifts.length], n)));
};
const vigenereDecrypt: Codec = (idx, key, n) => {
  if (key.kind !== 'VIGENERE') throw new Error('KEY_MODEL_MISMATCH:VIGENERE');
  if (key.shifts.length === 0) throw new Error('VIGENERE_EMPTY_KEY');
  if (n <= 0) throw new Error('EMPTY_ALPHABET');
  return Object.freeze(idx.map((x, i) => mod(x - key.shifts[i % key.shifts.length], n)));
};
export const VIGENERE_MODEL: CipherModel = Object.freeze({
  modelId: 'VIGENERE',
  assumptions: Object.freeze(['polyalphabetic shift keyed by a repeating shift sequence', 'toy classical cipher']),
  encrypt: vigenereEncrypt,
  decrypt: vigenereDecrypt,
});

const substitutionEncrypt: Codec = (idx, key) => {
  if (key.kind !== 'SUBSTITUTION') throw new Error('KEY_MODEL_MISMATCH:SUBSTITUTION');
  return Object.freeze(idx.map((x) => key.mapping[x] ?? x));
};
const substitutionDecrypt: Codec = (idx, key) => {
  if (key.kind !== 'SUBSTITUTION') throw new Error('KEY_MODEL_MISMATCH:SUBSTITUTION');
  const inv: Record<number, number> = {};
  for (const [from, to] of Object.entries(key.mapping)) inv[to] = Number(from);
  return Object.freeze(idx.map((x) => inv[x] ?? x));
};
export const SUBSTITUTION_MODEL: CipherModel = Object.freeze({
  modelId: 'SUBSTITUTION',
  assumptions: Object.freeze(['monoalphabetic permutation over alphabet indices', 'toy classical cipher']),
  encrypt: substitutionEncrypt,
  decrypt: substitutionDecrypt,
});

const transpositionEncrypt: Codec = (idx, key) => {
  if (key.kind !== 'TRANSPOSITION') throw new Error('KEY_MODEL_MISMATCH:TRANSPOSITION');
  if (key.order.length !== idx.length) throw new Error('TRANSPOSITION_LENGTH_MISMATCH');
  const out = new Array<number>(idx.length);
  key.order.forEach((src, dst) => { out[dst] = idx[src]; });
  return Object.freeze(out);
};
const transpositionDecrypt: Codec = (idx, key) => {
  if (key.kind !== 'TRANSPOSITION') throw new Error('KEY_MODEL_MISMATCH:TRANSPOSITION');
  if (key.order.length !== idx.length) throw new Error('TRANSPOSITION_LENGTH_MISMATCH');
  const out = new Array<number>(idx.length);
  key.order.forEach((src, dst) => { out[src] = idx[dst]; });
  return Object.freeze(out);
};
export const TRANSPOSITION_MODEL: CipherModel = Object.freeze({
  modelId: 'TRANSPOSITION',
  assumptions: Object.freeze(['reorders positions by a fixed permutation', 'sequence length must match the permutation length', 'toy classical cipher']),
  encrypt: transpositionEncrypt,
  decrypt: transpositionDecrypt,
});

export const CIPHER_MODELS: Readonly<Record<string, CipherModel>> = Object.freeze({
  CAESAR: CAESAR_MODEL,
  AFFINE: AFFINE_MODEL,
  VIGENERE: VIGENERE_MODEL,
  SUBSTITUTION: SUBSTITUTION_MODEL,
  TRANSPOSITION: TRANSPOSITION_MODEL,
});

export function candidateCaesarKeys(n: number): readonly CipherKey[] {
  const out: CipherKey[] = [];
  for (let s = 0; s < n; s++) out.push({ kind: 'CAESAR', shift: s });
  return Object.freeze(out);
}

export function candidateAffineKeys(n: number): readonly CipherKey[] {
  const out: CipherKey[] = [];
  for (let a = 1; a < n; a++) { if (gcd(a, n) !== 1) continue; for (let b = 0; b < n; b++) out.push({ kind: 'AFFINE', a, b }); }
  return Object.freeze(out);
}

/** Bounded, deterministic: identity plus adjacent-pair swaps, capped so this stays fast at real sizes. */
export function candidateTranspositionOrders(length: number, cap: number): readonly CipherKey[] {
  const identity = Array.from({ length }, (_, i) => i);
  const out: CipherKey[] = [{ kind: 'TRANSPOSITION', order: Object.freeze(identity) }];
  outer: for (let i = 0; i < length; i++) {
    for (let j = i + 1; j < length; j++) {
      const order = [...identity];
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
      out.push({ kind: 'TRANSPOSITION', order: Object.freeze(order) });
      if (out.length >= cap) break outer;
    }
  }
  return Object.freeze(out);
}
