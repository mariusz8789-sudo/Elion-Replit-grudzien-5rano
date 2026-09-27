import type * as THREE_NS from 'three';
import { BODYPARTS3D_ATTRIBUTION, BODYPARTS3D_LICENSE } from './bodyParts3dPilot';

/**
 * The FULL BodyParts3D 4.0 male reference body (2,234 source meshes) as packed by the MIT-licensed
 * Human Atlas viewer (github.com/slorksmo/Human-Atlas @ 5bb5713a): meters, Y-up, feet at y = 0, each
 * structure simplified within a 0.2 % relative error. Geometry stays CC BY 4.0 (DBCLS) — attribution is
 * carried in every state this module publishes. It is a generic educational reference, never a patient.
 *
 * Chunk layout, per part: Float32 positions at `positions`, Int16 normalised normals at `normals`,
 * Uint32 indices at `indices` (byte offsets into the part's chunk).
 */
export const FULL_ATLAS_BASE = '/assets/bodyparts3d/full';
export const FULL_ATLAS_SOURCE_REPO = 'https://github.com/slorksmo/Human-Atlas';
export const FULL_ATLAS_SOURCE_COMMIT = '5bb5713aab18d7fe9380c3339eb09f173491ea06';

export interface FullAtlasPart {
  readonly id: string;
  readonly name: string;
  readonly conceptId: string;
  readonly system: string;
  readonly chunk: number;
  readonly positions: number;
  readonly normals: number;
  readonly indices: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly bounds: readonly [readonly number[], readonly number[]];
}

export interface FullAtlasManifest {
  readonly version: string;
  readonly parts: readonly FullAtlasPart[];
  readonly chunks: readonly { readonly bytes: number; readonly gzipBytes?: number }[];
  readonly triangles: number;
  readonly concepts: readonly unknown[];
  readonly sex: string;
  readonly scope: string;
}

/** Display colours per system (the source viewer's curated palette). */
export const FULL_ATLAS_SYSTEM_COLOR: Readonly<Record<string, number>> = {
  skeletal: 0xe2d9ba, muscular: 0xa85b50, cardiac: 0xb96760, sensory: 0xb0c8ce, arterial: 0xc05245, venous: 0x527c9f,
  nervous: 0xd8b565, respiratory: 0xb98991, digestive: 0xb8916b, urinary: 0xb47961, lymphatic: 0x879f7c,
  endocrine: 0xc5a09a, reproductive: 0xbda098, integumentary: 0xba9b7d, connective: 0xaec3bb,
};
/** Systems the explorer starts with switched off, as the source viewer does (surface and reproductive). */
export const FULL_ATLAS_HIDDEN_BY_DEFAULT: readonly string[] = ['integumentary', 'reproductive'];

export interface FullAtlasSystemMesh {
  readonly system: string;
  readonly geometry: THREE_NS.BufferGeometry;
  readonly partCount: number;
  readonly triangles: number;
}

export interface LoadedFullAtlas {
  readonly systems: readonly FullAtlasSystemMesh[];
  readonly structures: number;
  readonly concepts: number;
  readonly triangles: number;
  /** Height of the assembled body in meters (feet at y = 0). */
  readonly heightMeters: number;
  readonly bytes: number;
  readonly loadMs: number;
}

export interface FullAtlasState {
  readonly status: 'IDLE' | 'LOADING' | 'READY' | 'FAILED';
  readonly structures: number;
  readonly concepts: number;
  readonly triangles: number;
  readonly source: string;
  readonly license: string;
  readonly attribution: string;
  readonly error: string | null;
}

export const FULL_ATLAS_IDLE: FullAtlasState = Object.freeze({
  status: 'IDLE', structures: 0, concepts: 0, triangles: 0, source: 'BodyParts3D 4.0 (DBCLS)', license: BODYPARTS3D_LICENSE,
  attribution: BODYPARTS3D_ATTRIBUTION, error: null,
});

/** Static hosts may serve .gz decoded (Content-Encoding) or as the raw gzip file: decode only a real gzip payload. */
export async function decodeAtlasChunk(response: Response, expectedBytes: number): Promise<ArrayBuffer> {
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const payload = await response.arrayBuffer();
  const head = new Uint8Array(payload, 0, Math.min(2, payload.byteLength));
  const gzip = head[0] === 0x1f && head[1] === 0x8b;
  const buffer = gzip ? await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : payload;
  if (buffer.byteLength !== expectedBytes) throw new Error('ATLAS_CHUNK_INCOMPLETE');
  return buffer;
}

/**
 * Merge every part of one system into a single geometry so the whole body costs one draw call per system
 * (15), not 2,234. Indices are rebased onto the merged vertex array.
 */
export function mergeSystemParts(THREE: typeof THREE_NS, parts: readonly FullAtlasPart[], buffers: readonly ArrayBuffer[]): THREE_NS.BufferGeometry {
  let vertices = 0; let indices = 0;
  for (const p of parts) { vertices += p.vertexCount; indices += p.indexCount; }
  const position = new Float32Array(vertices * 3);
  const normal = new Int16Array(vertices * 3);
  const index = new Uint32Array(indices);
  let v = 0; let i = 0;
  for (const p of parts) {
    const buffer = buffers[p.chunk]!;
    position.set(new Float32Array(buffer, p.positions, p.vertexCount * 3), v * 3);
    normal.set(new Int16Array(buffer, p.normals, p.vertexCount * 3), v * 3);
    const src = new Uint32Array(buffer, p.indices, p.indexCount);
    for (let k = 0; k < src.length; k++) index[i + k] = src[k]! + v;
    v += p.vertexCount; i += p.indexCount;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3, true));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/** Fetch the manifest and all chunks, then build one merged geometry per anatomical system. */
export async function loadFullAtlas(
  THREE: typeof THREE_NS,
  signal?: AbortSignal,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = (input, init) => fetch(input, init),
): Promise<LoadedFullAtlas> {
  const started = typeof performance !== 'undefined' ? performance.now() : 0;
  const res = await fetchImpl(`${FULL_ATLAS_BASE}/atlas.json`, { signal });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const manifest = await res.json() as FullAtlasManifest;
  if (!Array.isArray(manifest.parts) || !manifest.parts.length || !Array.isArray(manifest.chunks)) throw new Error('ATLAS_MANIFEST_INVALID');
  const buffers = await Promise.all(manifest.chunks.map(async (c, n) =>
    decodeAtlasChunk(await fetchImpl(`${FULL_ATLAS_BASE}/body-${n}.bin.gz`, { signal }), c.bytes)));
  signal?.throwIfAborted();
  const bySystem = new Map<string, FullAtlasPart[]>();
  let top = 0;
  for (const p of manifest.parts) {
    const list = bySystem.get(p.system) ?? []; list.push(p); bySystem.set(p.system, list);
    top = Math.max(top, p.bounds[1]![1]!);
  }
  const systems: FullAtlasSystemMesh[] = [];
  for (const [system, parts] of bySystem) {
    const geometry = mergeSystemParts(THREE, parts, buffers);
    systems.push({ system, geometry, partCount: parts.length, triangles: (geometry.index?.count ?? 0) / 3 });
  }
  return {
    systems,
    structures: manifest.parts.length,
    concepts: manifest.concepts?.length ?? 0,
    triangles: systems.reduce((s, x) => s + x.triangles, 0),
    heightMeters: top,
    bytes: buffers.reduce((s, b) => s + b.byteLength, 0),
    loadMs: typeof performance !== 'undefined' ? performance.now() - started : 0,
  };
}
