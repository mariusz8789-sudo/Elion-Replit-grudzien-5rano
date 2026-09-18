/* Proprietary / All Rights Reserved - Genesis OS */
import { sha256hex } from '../../knowledge/EvidenceLedger.js';

/** A compute kernel: pure function of a structured-cloneable payload. May return a Promise (awaited by both execution modes). */
export type Kernel = (p: unknown) => unknown;
/** Allow-listed kernel table (kind -> kernel). Extended via `OrchestratorOptions.kernels` / `attachWorkerProtocol`, never by dynamic code. */
export type KernelTable = Readonly<Record<string, Kernel>>;

const asNumberArray = (p: unknown): number[] => { if (!Array.isArray(p) || p.some(x => typeof x !== 'number')) throw new TypeError('PAYLOAD_NOT_NUMBER_ARRAY'); return p as number[]; };
const asStringArray = (p: unknown): string[] => { if (!Array.isArray(p) || p.some(x => typeof x !== 'string')) throw new TypeError('PAYLOAD_NOT_STRING_ARRAY'); return p as string[]; };
const asMatMul = (p: unknown): { a: number[]; b: number[]; n: number } => {
  const o = p as { a?: unknown; b?: unknown; n?: unknown } | null;
  if (!o || typeof o !== 'object' || !Array.isArray(o.a) || !Array.isArray(o.b) || typeof o.n !== 'number' || !Number.isInteger(o.n) || o.n < 0) throw new TypeError('PAYLOAD_NOT_MATMUL');
  // Shape and element validation: without it a short/ragged payload silently yields NaN entries instead of an error.
  if (o.a.length !== o.n * o.n || o.b.length !== o.n * o.n || o.a.some(x => typeof x !== 'number') || o.b.some(x => typeof x !== 'number')) throw new TypeError('PAYLOAD_NOT_MATMUL');
  return { a: o.a as number[], b: o.b as number[], n: o.n };
};

/** Fixed, allow-listed compute kernels. No eval, no dynamic code, no shell. Shared by inline mode and worker threads. */
export const NATIVE_KERNELS: KernelTable = Object.freeze({
  vectorSum: (p: unknown): number => asNumberArray(p).reduce((a, b) => a + b, 0),
  matrixMul: (p: unknown): number[] => {
    const { a, b, n } = asMatMul(p);
    const out = new Array<number>(n * n).fill(0);
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) { const av = a[i * n + k]; for (let j = 0; j < n; j++) out[i * n + j] += av * b[k * n + j]; }
    return out;
  },
  hashBatch: (p: unknown): string[] => asStringArray(p).map(s => sha256hex(s)),
  failingTask: (): never => { throw new Error('KERNEL_FAULT'); },
});

/**
 * Own-property lookup only. A plain `table[kind]` would resolve inherited members
 * (`'constructor'` -> Object, `'toString'`, `'__proto__'`...) and treat them as kernels.
 */
export const lookupKernel = (table: KernelTable, kind: string): Kernel | undefined =>
  Object.prototype.hasOwnProperty.call(table, kind) && typeof table[kind] === 'function' ? table[kind] : undefined;
export const isKnownKind = (kind: string, table: KernelTable = NATIVE_KERNELS): boolean => lookupKernel(table, kind) !== undefined;
