/* Proprietary / All Rights Reserved - Genesis OS */
import { createHash } from 'node:crypto';
export interface Clock { now(): number; }
export const stableStringify = (v: unknown): string => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; }
  return JSON.stringify(v);
};
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export const sha256Bytes = (b: Uint8Array): string => createHash('sha256').update(Buffer.from(b)).digest('hex');
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export const crc32 = (b: Uint8Array): number => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
