/* Proprietary / All Rights Reserved - Genesis OS */
import { createHash } from 'node:crypto';
import { canonicalJson as stableStringify, sha256Hex as sha256hex, mulberry32 } from './determinism.js';
export { stableStringify, sha256hex, mulberry32 };
export interface Clock { now(): number; }
export const sha256Bytes = (b: Uint8Array): string => createHash('sha256').update(Buffer.from(b)).digest('hex');
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export const crc32 = (b: Uint8Array): number => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
