/* Proprietary / All Rights Reserved - Genesis OS */
import { stableStringify, sha256hex, sha256Bytes, crc32, type Clock } from '../expansionHash.js';
export interface ContainerDelta { readonly seq: number; readonly op: 'set' | 'add'; readonly path: string; readonly value: unknown; }
export interface EvidenceContainerPayload {
  readonly '@context': Readonly<Record<string, string>>; readonly '@type': 'GenesisEvidenceContainer';
  readonly inputState: unknown; readonly deltas: readonly ContainerDelta[]; readonly stateHashes: readonly string[];
  readonly resultFingerprint: string; readonly createdAt: number; readonly clockSource: string; readonly ungroundedFlags: readonly string[];
}
export interface VerifyResult { readonly ok: boolean; readonly errors: readonly string[]; readonly recomputedFingerprint: string; readonly storedFingerprint: string; }
const setPath = (state: unknown, path: string, value: unknown): unknown => {
  const keys = path.split('.'); const root: Record<string, unknown> = JSON.parse(stableStringify(state)) as Record<string, unknown>;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < keys.length - 1; i++) { const k = keys[i]; if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {}; cur = cur[k] as Record<string, unknown>; }
  cur[keys[keys.length - 1]] = value; return root;
};
export function applyDelta(state: unknown, d: ContainerDelta): unknown {
  if (d.op === 'set') return setPath(state, d.path, d.value);
  const cur = setPath(state, d.path, 0) as Record<string, unknown>;
  const keys = d.path.split('.'); let node: Record<string, unknown> = cur;
  for (const k of keys.slice(0, -1)) node = node[k] as Record<string, unknown>;
  const last = keys[keys.length - 1];
  const base = (JSON.parse(stableStringify(state)) as Record<string, unknown>);
  let bnode: Record<string, unknown> = base; for (const k of keys.slice(0, -1)) bnode = bnode[k] as Record<string, unknown>;
  const prev = typeof bnode[last] === 'number' ? (bnode[last] as number) : 0;
  node[last] = prev + (typeof d.value === 'number' ? d.value : 0);
  return cur;
}
export function computeStateHashes(inputState: unknown, deltas: readonly ContainerDelta[]): { hashes: string[]; finalState: unknown } {
  let state = inputState; const hashes = [sha256hex(stableStringify(state))];
  for (const d of deltas) { state = applyDelta(state, d); hashes.push(sha256hex(stableStringify(state))); }
  return { hashes, finalState: state };
}
export function buildContainerPayload(inputState: unknown, deltas: readonly ContainerDelta[], clock: Clock, ungroundedFlags: readonly string[] = []): EvidenceContainerPayload {
  const { hashes } = computeStateHashes(inputState, deltas);
  return { '@context': { '@vocab': 'https://genesis.os/vocab#', inputState: 'https://genesis.os/vocab#inputState', deltas: 'https://genesis.os/vocab#deltas', stateHashes: 'https://genesis.os/vocab#stateHashes', resultFingerprint: 'https://genesis.os/vocab#resultFingerprint' }, '@type': 'GenesisEvidenceContainer', inputState, deltas, stateHashes: hashes, resultFingerprint: hashes[hashes.length - 1], createdAt: clock.now(), clockSource: 'injected', ungroundedFlags };
}
interface ZipEntry { readonly name: string; readonly data: Uint8Array; }
export function zipStore(entries: readonly ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  const enc = new TextEncoder();
  for (const e of entries) {
    const nameB = enc.encode(e.name); const crc = crc32(e.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0, true); lh.setUint16(8, 0, true); lh.setUint16(10, 0, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, e.data.length, true); lh.setUint32(22, e.data.length, true); lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), nameB, e.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0, true); ch.setUint16(10, 0, true); ch.setUint16(12, 0, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, e.data.length, true); ch.setUint32(24, e.data.length, true); ch.setUint16(28, nameB.length, true);
    ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameB);
    offset += 30 + nameB.length + e.data.length;
  }
  const centralSize = central.reduce((a, b) => a + b.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(4, 0, true); eocd.setUint16(6, 0, true); eocd.setUint16(8, entries.length, true); eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralSize, true); eocd.setUint32(16, offset, true); eocd.setUint16(20, 0, true);
  const out = new Uint8Array(offset + centralSize + 22); let p = 0;
  for (const c of [...chunks, ...central, new Uint8Array(eocd.buffer)]) { out.set(c, p); p += c.length; }
  return out;
}
export function parseZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>(); const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) return out;
  const count = dv.getUint16(eocd + 10, true); let ptr = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(ptr, true) !== 0x02014b50) break;
    const nameLen = dv.getUint16(ptr + 28, true); const extraLen = dv.getUint16(ptr + 30, true); const commentLen = dv.getUint16(ptr + 32, true);
    const localOff = dv.getUint32(ptr + 42, true);
    const name = dec.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    const ldv = new DataView(bytes.buffer, bytes.byteOffset + localOff, bytes.byteLength - localOff);
    const lNameLen = ldv.getUint16(26, true); const lExtraLen = ldv.getUint16(28, true); const compSize = ldv.getUint32(18, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    out.set(name, bytes.subarray(dataStart, dataStart + compSize));
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
export function buildContainerBundle(inputState: unknown, deltas: readonly ContainerDelta[], clock: Clock, ungroundedFlags: readonly string[] = []): Uint8Array {
  const payload = buildContainerPayload(inputState, deltas, clock, ungroundedFlags);
  const containerBytes = new TextEncoder().encode(stableStringify(payload));
  const manifest = { entries: [{ name: 'container.json', sha256: sha256Bytes(containerBytes) }] };
  return zipStore([{ name: 'container.json', data: containerBytes }, { name: 'manifest.json', data: new TextEncoder().encode(stableStringify(manifest)) }]);
}
/** Offline third-party reproducibility check: recomputes state hashes from inputState+deltas only. */
export function verifyContainerOffline(bundle: Uint8Array): VerifyResult {
  const errors: string[] = [];
  const files = parseZip(bundle);
  const containerRaw = files.get('container.json'); const manifestRaw = files.get('manifest.json');
  if (!containerRaw) errors.push('MISSING_CONTAINER');
  if (!manifestRaw) errors.push('MISSING_MANIFEST');
  if (!containerRaw || !manifestRaw) return { ok: false, errors, recomputedFingerprint: '', storedFingerprint: '' };
  const manifest = JSON.parse(new TextDecoder().decode(manifestRaw)) as { entries: { name: string; sha256: string }[] };
  const me = manifest.entries.find(e => e.name === 'container.json');
  if (me && me.sha256 !== sha256Bytes(containerRaw)) errors.push('MANIFEST_HASH_MISMATCH');
  const payload = JSON.parse(new TextDecoder().decode(containerRaw)) as EvidenceContainerPayload;
  const { hashes } = computeStateHashes(payload.inputState, payload.deltas);
  if (stableStringify(hashes) !== stableStringify(payload.stateHashes)) errors.push('STATE_HASH_CHAIN_MISMATCH');
  const recomputed = hashes[hashes.length - 1];
  if (recomputed !== payload.resultFingerprint) errors.push('FINGERPRINT_MISMATCH');
  return { ok: errors.length === 0, errors, recomputedFingerprint: recomputed, storedFingerprint: payload.resultFingerprint };
}
