import type * as THREE_NS from 'three';
import { getWorldAssetRecord, isWorldAssetApproved, type WorldAssetRecord } from './assetGovernance';
import { disposeSceneResources } from './graphics/lifecycle';

/**
 * HUMAN DIGITAL TWIN — ASSET GATE AND LOADER (D-131).
 *
 * The delivered Research Edition pack asked for an asset gate: a licensed human
 * model may only be loaded once its provenance, licence, checksum and permitted
 * uses are on record. That gate is implemented HERE over the ONE canonical
 * registry the repository already has (`assetGovernance`) — this module adds no
 * second registry and stores no licence data of its own; it reads the manifest
 * and answers one question: may the renderer load this file?
 *
 * WHAT THE APPROVED ASSET IS, AND WHAT IT IS NOT.
 * The approved file is an OUTER HUMAN: skin, clothing, hair, teeth, an animation
 * skeleton and facial blendshapes, licensed CC0 (verified — see the record's own
 * rationale). It contains NO organs, NO bones as geometry, NO vessels and NO
 * nerves. Loading it makes the twin look like a person; it does NOT turn the
 * twin into medical anatomy, and nothing in this module may be read as such a
 * claim. The anatomy layer above it stays MODEL / SCHEMATIC exactly as before.
 */

/** The one runtime path this gate governs. Anything else must get its own manifest record. */
export const HUMAN_TWIN_RUNTIME_PATH = '/assets/genesis-hf/characters/mpfb-lod0.glb';

/** What the twin is currently made of — shown in the HUD, never inferred from how good it looks. */
export type HumanTwinTier =
  /** A licensed, checksum-verified real 3D asset (a person's outer form). Its ANATOMY is still a model. */
  | 'LICENSED_CC0_ASSET'
  /** The procedural Genesis rig: no licensed asset was loaded. */
  | 'PROXY';

export type HumanTwinGateReason =
  | 'OK'
  | 'NO_MANIFEST_RECORD'
  | 'NOT_APPROVED'
  | 'LICENSE_NOT_RECORDED'
  | 'SOURCE_NOT_RECORDED'
  | 'CHECKSUM_NOT_RECORDED';

export interface HumanTwinGateResult {
  readonly enabled: boolean;
  readonly reason: HumanTwinGateReason;
  readonly runtimePath: string;
  readonly record: WorldAssetRecord | null;
  /** The tier the twin must report while this gate result holds. */
  readonly tier: HumanTwinTier;
}

/**
 * May the renderer load the human GLB? Every condition is a recorded fact, not a judgement:
 * an APPROVED status in the canonical manifest, plus a licence, a source URL and a checksum
 * for the very file being loaded. A record missing any of them is refused with the reason.
 */
export function evaluateHumanTwinAsset(runtimePath: string = HUMAN_TWIN_RUNTIME_PATH): HumanTwinGateResult {
  const record = getWorldAssetRecord(runtimePath) ?? null;
  const blocked = (reason: HumanTwinGateReason): HumanTwinGateResult => ({ enabled: false, reason, runtimePath, record, tier: 'PROXY' });
  if (!record) return blocked('NO_MANIFEST_RECORD');
  if (record.status !== 'APPROVED' || !isWorldAssetApproved(runtimePath)) return blocked('NOT_APPROVED');
  if (!record.license || !record.licenseUrl) return blocked('LICENSE_NOT_RECORDED');
  if (!record.sourceUrl) return blocked('SOURCE_NOT_RECORDED');
  const fileName = runtimePath.slice(runtimePath.lastIndexOf('/') + 1);
  if (!record.sha256[fileName]) return blocked('CHECKSUM_NOT_RECORDED');
  return { enabled: true, reason: 'OK', runtimePath, record, tier: 'LICENSED_CC0_ASSET' };
}

export interface LoadedHumanTwinBody {
  readonly root: THREE_NS.Object3D;
  /** Every skinned/plain mesh of the asset, for material work, clipping and X-ray. */
  readonly meshes: readonly THREE_NS.Mesh[];
  /** Blendshape name → index on the mesh that carries it (ARKit-style names on this asset). */
  readonly morphs: ReadonlyMap<string, { readonly mesh: THREE_NS.Mesh; readonly index: number }>;
  readonly heightMeters: number;
  readonly tier: HumanTwinTier;
  readonly record: WorldAssetRecord;
}

/** Timings are browser monotonic-clock measurements, never simulated loading percentages. */
export interface HumanTwinLoadDiagnostics {
  startedAtMs: number;
  fetchStartedAtMs: number | null;
  fetchCompletedAtMs: number | null;
  decodeStartedAtMs: number | null;
  decodeCompletedAtMs: number | null;
  httpStatus: number | null;
  bytes: number | null;
}

export type HumanTwinLoadResult =
  | { status: 'READY'; asset: LoadedHumanTwinBody; diagnostics: HumanTwinLoadDiagnostics }
  | { status: 'ERROR' | 'BLOCKED' | 'CANCELLED'; reason: string; message: string; diagnostics: HumanTwinLoadDiagnostics };

export interface HumanTwinPresentationState {
  status: 'LOADING' | 'READY' | 'ERROR' | 'BLOCKED';
  reason?: string;
  message?: string;
  diagnostics: HumanTwinLoadDiagnostics | null;
  insertedAtMs: number | null;
  firstRenderedAtMs: number | null;
}

/** Bounding height of a loaded object in metres, used to scale the asset to the manifest's 1:1 height. */
function measureHeight(THREE: typeof THREE_NS, root: THREE_NS.Object3D): number {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box.getSize(size);
  return size.y > 0 ? size.y : 1;
}

/**
 * Load the approved human GLB, or return null. Null is not an error state: the scene keeps the
 * procedural PROXY and says so. The gate runs FIRST — a file is never fetched before its record
 * is checked, so an unapproved asset causes no network request at all.
 */
export async function loadHumanTwinBody(
  THREE: typeof THREE_NS,
  targetHeightMeters: number,
  runtimePath: string = HUMAN_TWIN_RUNTIME_PATH,
): Promise<LoadedHumanTwinBody | null> {
  // Compatibility for the existing street/cinematic avatar consumer.
  const result = await loadHumanTwinBodyResult(THREE, targetHeightMeters, runtimePath);
  return result.status === 'READY' ? result.asset : null;
}

/** One loader for both consumers; cancellation also covers decoding after the fetch has ended. */
export async function loadHumanTwinBodyResult(
  THREE: typeof THREE_NS,
  targetHeightMeters: number,
  runtimePath: string = HUMAN_TWIN_RUNTIME_PATH,
  signal?: AbortSignal,
): Promise<HumanTwinLoadResult> {
  const diagnostics: HumanTwinLoadDiagnostics = {
    startedAtMs: performance.now(), fetchStartedAtMs: null, fetchCompletedAtMs: null,
    decodeStartedAtMs: null, decodeCompletedAtMs: null, httpStatus: null, bytes: null,
  };
  const gate = evaluateHumanTwinAsset(runtimePath);
  if (!gate.enabled || !gate.record) return { status: 'BLOCKED', reason: gate.reason, message: 'Model nie ma zatwierdzonego wpisu zasobu.', diagnostics };
  let phase: 'FETCH' | 'DECODE' = 'FETCH';
  let root: THREE_NS.Object3D | null = null;
  try {
    signal?.throwIfAborted();
    diagnostics.fetchStartedAtMs = performance.now();
    const response = await fetch(runtimePath, { signal });
    diagnostics.httpStatus = response.status;
    if (!response.ok) {
      diagnostics.fetchCompletedAtMs = performance.now();
      return { status: 'ERROR', reason: `HTTP_${response.status}`, message: `Nie udało się pobrać modelu (HTTP ${response.status}).`, diagnostics };
    }
    const buffer = await response.arrayBuffer();
    diagnostics.fetchCompletedAtMs = performance.now();
    diagnostics.bytes = buffer.byteLength;
    signal?.throwIfAborted();
    phase = 'DECODE';
    diagnostics.decodeStartedAtMs = performance.now();
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().parseAsync(buffer, runtimePath.slice(0, runtimePath.lastIndexOf('/') + 1));
    root = gltf.scene as unknown as THREE_NS.Object3D;
    diagnostics.decodeCompletedAtMs = performance.now();
    signal?.throwIfAborted();
    const meshes: THREE_NS.Mesh[] = [];
    const morphs = new Map<string, { mesh: THREE_NS.Mesh; index: number }>();
    root.traverse((o) => {
      const m = o as THREE_NS.Mesh;
      if (!m.isMesh) return;
      meshes.push(m);
      m.castShadow = true; m.receiveShadow = true;
      const dict = m.morphTargetDictionary;
      if (dict) for (const [name, index] of Object.entries(dict)) if (!morphs.has(name)) morphs.set(name, { mesh: m, index });
    });
    if (!meshes.length) {
      disposeSceneResources(root);
      return { status: 'ERROR', reason: 'EMPTY_MODEL', message: 'Plik modelu nie zawiera geometrii człowieka.', diagnostics };
    }
    // Scale to the manifest's own 1:1 height: the twin's metre scale is the anatomy atlas's, not the asset's.
    const measured = measureHeight(THREE, root);
    const scale = targetHeightMeters / measured;
    root.scale.setScalar(scale);
    root.position.y = 0;
    return { status: 'READY', asset: { root, meshes, morphs, heightMeters: targetHeightMeters, tier: gate.tier, record: gate.record }, diagnostics };
  } catch (error) {
    if (root) disposeSceneResources(root);
    const cancelled = signal?.aborted === true;
    return {
      status: cancelled ? 'CANCELLED' : 'ERROR', reason: cancelled ? 'CANCELLED' : `${phase}_FAILED`,
      message: error instanceof Error ? error.message : String(error), diagnostics,
    };
  }
}

/**
 * The HUD line for the twin. Two separate facts, never merged: what the MODEL is made of
 * (a licensed asset or the procedural proxy) and what its ANATOMY is worth (always a model —
 * organ shapes here are atlas ellipsoids, not a scan of anybody).
 */
export function humanTwinProvenanceLabel(tier: HumanTwinTier): string {
  return tier === 'LICENSED_CC0_ASSET' ? 'CC0 · ANATOMIA: MODEL' : 'PROXY · ANATOMIA: MODEL';
}
