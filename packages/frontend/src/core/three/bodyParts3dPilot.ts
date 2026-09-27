import type * as THREE_NS from 'three';
import { getWorldAssetRecord, isWorldAssetApproved, type WorldAssetRecord } from './assetGovernance';

/**
 * BODYPARTS3D 4.0 ANATOMY PILOT — mapping, asset gate and loader.
 *
 * Five structures from the official BodyParts3D atlas (DBCLS, CC BY 4.0), converted by
 * `scripts/convertBodyParts3dPilot.mjs` from the official part-of element sets. This module adds no
 * renderer, no anatomy engine and no registry: the GLBs are approved in the ONE asset registry
 * (`assetGovernance`), and the loaded geometry replaces the procedural ellipsoid of the SAME atlas
 * node in the existing twin, so picking, highlight, isolation, GHOST and framing are unchanged code.
 *
 * WHAT THIS GEOMETRY IS: a generic anatomical reference model — the surface of one atlas body. It is
 * not patient-specific, not a measurement of anybody, and carries no histology or cell data; tissue
 * and cell views stay MODEL. Nothing here may be presented as clinical or diagnostic.
 */

export const BODYPARTS3D_ATTRIBUTION = 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International';
export const BODYPARTS3D_LICENSE = 'CC BY 4.0';
export const BODYPARTS3D_LICENSE_URL = 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html';
export const BODYPARTS3D_DOWNLOAD_PAGE = 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html';
export const BODYPARTS3D_ARCHIVE_URL = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip';
export const BODYPARTS3D_ARCHIVE_SHA256 = '40665852c49f218326590e204db91064a1ecfc3c6f8cbd7bbbcaac62c7cd409e';
export const BODYPARTS3D_CONVERTER_VERSION = 'genesis-bodyparts3d-pilot-converter/1.0.0';

export type BodyParts3dLod = 'DESKTOP' | 'MOBILE';
export const BODYPARTS3D_LODS: readonly BodyParts3dLod[] = ['DESKTOP', 'MOBILE'];

export interface BodyParts3dPilotStructure {
  readonly key: 'HEART' | 'LIVER' | 'LEFT_LUNG' | 'RIGHT_LUNG' | 'AORTA';
  /** Canonical Genesis atlas node id (anatomyAtlas.ts) whose geometry this asset replaces. */
  readonly genesisId: 'heart' | 'liver' | 'left-lung' | 'right-lung' | 'aorta';
  readonly fmaId: string;
  /** BodyParts3D part-of representation id (partof_parts_list_e.txt). */
  readonly representationId: string;
  readonly conceptName: string;
  /** Every FJ element of the official part-of set (partof_element_parts.txt), merged into one mesh. */
  readonly elementFileIds: readonly string[];
}

const fj = (ids: string): readonly string[] => Object.freeze(ids.split(' ').map((id) => `FJ${id}`));

/**
 * FMA concept → BP representation → FJ element meshes → Genesis anatomy id. Proven against the
 * official lists by the converter (it refuses to run otherwise) and again by bodyParts3dPilot.test.ts.
 */
export const BODYPARTS3D_PILOT_STRUCTURES: readonly BodyParts3dPilotStructure[] = Object.freeze([
  { key: 'HEART', genesisId: 'heart', fmaId: 'FMA7088', representationId: 'BP9305', conceptName: 'heart', elementFileIds: fj('2417 2418 2419 2420 2421 2422 2423 2424 2425 2426 2427 2429 2430 2431 2432 2433 2434 2435 2436 2437 2438 2439 2631 2632 2633 2634 2635 2636 2637 2638 2639 2640 2641 2642 2643 2644 2645 2646 2647 2648 2649 2650 2651 2652 2653 2654 2655 2656 2667 2668 2670 2671 2672 2673 2674 2675 2676 2677 2692 2693 2694 2695 2696 2697 2698 2699 2700 2714 2715 2716 2717 2718 2719 2720 2721 2722 2723 2724 2727 2728 2729 2731 2737') },
  { key: 'LIVER', genesisId: 'liver', fmaId: 'FMA7197', representationId: 'BP9334', conceptName: 'liver', elementFileIds: fj('1883 1893 1913 1914 1916 2386 2404 2405 2409 2415 2416 2816 2818 2819 2820 2821 2822 2823 2824 3071 3072 3073 3074 3075 3076 3077 3081 3083 3086 3088 3089 3090 3091 3092 3093 3095 3096 3102 3103 3104 3105 3106 3107 3108 3109 3110 3111 3112 3113 3114 3115 3116 3117 3122 3123 3124 3125 3126 3127 3128') },
  { key: 'LEFT_LUNG', genesisId: 'left-lung', fmaId: 'FMA7310', representationId: 'BP9417', conceptName: 'left lung', elementFileIds: fj('2441 2442 2443 2444 2445 2446 2447 2448 2460 2461 2462 2463 2464 2465 2466 2467 2468 2469 2471 2472 2473 2474 2475 2476 2477 2478 2479 2480 2482 2483 2484 2485 2527 2528 2529 2530 2531 2532 2533 2534 2535 2536 2537 2538 2540 2881 2882 2883 2884 2885 2886 2887 2888 2889 2890 2891 2892 2893 2894 2895 2896 2897 2898 2899 2900 2901 2902 2903 2904 2905 2906 2907 2908 2909 2910 2911 2912 2913 2914 2915 2916 2917 2918 2919 2920 2921 2922 2923 2926 2927 2928 2929 2930 2931 2932 2934 2935 2936 2937 2938 2939 2940 2941 2942 2943 2945 2946 2947 2948 2949 2951 2952 2953 2954 2956 2957 2958 2959 2960 2961 2962 2963 2964 2965') },
  { key: 'RIGHT_LUNG', genesisId: 'right-lung', fmaId: 'FMA7309', representationId: 'BP9359', conceptName: 'right lung', elementFileIds: fj('2041 2044 2449 2451 2452 2453 2454 2455 2456 2457 2458 2459 2470 2481 2486 2487 2488 2489 2490 2491 2492 2493 2494 2495 2496 2497 2498 2499 2500 2501 2502 2503 2504 2505 2506 2507 2508 2509 2510 2511 2512 2513 2514 2515 2516 2517 2518 2519 2520 2521 2522 2523 2524 2525 2526 2967 2968 2969 2970 2971 2972 2973 2974 2975 2976 2977 2978 2979 2980 2981 2982 2983 2984 2985 2986 2987 2988 2989 2990 2991 2992 2993 2994 2995 2996 2997 2998 2999 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010 3011 3012 3013 3014 3015 3016 3017 3018 3021 3022 3023 3024 3025 3026 3027 3028 3029 3030 3031 3032 3033 3034 3035 3036 3037 3038 3039 3041 3042 3043 3044 3045 3046 3047 3048 3049 3050 3051 3052 3053 3054 3055 3056 3057 3058 3059 3060 3061 3062 3063 3064 3065 3066 3067 3068 3069 3070') },
  { key: 'AORTA', genesisId: 'aorta', fmaId: 'FMA3734', representationId: 'BP10374', conceptName: 'aorta', elementFileIds: fj('1931 1932 3411 3413 3427') },
]);

const byGenesisId = new Map(BODYPARTS3D_PILOT_STRUCTURES.map((s) => [s.genesisId as string, s] as const));
export function bodyParts3dStructure(genesisId: string): BodyParts3dPilotStructure | null { return byGenesisId.get(genesisId) ?? null; }

export function bodyParts3dRuntimePath(genesisId: string, lod: BodyParts3dLod): string {
  return `/assets/bodyparts3d/pilot/${genesisId}.${lod.toLowerCase()}.glb`;
}

/**
 * The light level on touch devices and narrow viewports; the full source resolution elsewhere.
 * Both levels are real conversions of the same official elements (see the provenance JSON).
 */
export function selectBodyParts3dLod(env: { innerWidth: number; coarsePointer: boolean } | null = typeof window === 'undefined' ? null
  : { innerWidth: window.innerWidth || 1024, coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false }): BodyParts3dLod {
  if (!env) return 'DESKTOP';
  return env.coarsePointer || env.innerWidth < 900 ? 'MOBILE' : 'DESKTOP';
}

export type BodyParts3dGateReason = 'OK' | 'NOT_A_PILOT_STRUCTURE' | 'NO_MANIFEST_RECORD' | 'NOT_APPROVED' | 'LICENSE_NOT_RECORDED' | 'SOURCE_NOT_RECORDED' | 'CHECKSUM_NOT_RECORDED';

export interface BodyParts3dGateResult {
  readonly enabled: boolean;
  readonly reason: BodyParts3dGateReason;
  readonly runtimePath: string;
  readonly record: WorldAssetRecord | null;
}

/** Same rule as the human GLB gate: an APPROVED registry record with licence, source and this file's checksum. */
export function evaluateBodyParts3dAsset(genesisId: string, lod: BodyParts3dLod): BodyParts3dGateResult {
  const runtimePath = bodyParts3dRuntimePath(genesisId, lod);
  const blocked = (reason: BodyParts3dGateReason, record: WorldAssetRecord | null = null): BodyParts3dGateResult => ({ enabled: false, reason, runtimePath, record });
  if (!byGenesisId.has(genesisId)) return blocked('NOT_A_PILOT_STRUCTURE');
  const record = getWorldAssetRecord(runtimePath);
  if (!record) return blocked('NO_MANIFEST_RECORD');
  if (record.status !== 'APPROVED' || !isWorldAssetApproved(runtimePath)) return blocked('NOT_APPROVED', record);
  if (!record.license || !record.licenseUrl) return blocked('LICENSE_NOT_RECORDED', record);
  if (!record.sourceUrl) return blocked('SOURCE_NOT_RECORDED', record);
  if (!record.sha256[runtimePath.slice(runtimePath.lastIndexOf('/') + 1)]) return blocked('CHECKSUM_NOT_RECORDED', record);
  return { enabled: true, reason: 'OK', runtimePath, record };
}

/** What the explorer card and the HUD may say about a structure drawn from this atlas. */
export interface ReferenceAnatomyProvenance {
  readonly source: 'BodyParts3D 4.0 (DBCLS)';
  readonly representation: 'GENERIC_ANATOMICAL_REFERENCE';
  readonly patientSpecific: false;
  readonly clinicalUse: false;
  readonly license: string;
  readonly attribution: string;
  readonly fmaId: string;
  readonly representationId: string;
  readonly elementCount: number;
  readonly lod: BodyParts3dLod;
  readonly triangles: number;
  readonly runtimePath: string;
  readonly assetId: string;
}

/** One loaded structure: geometry in the twin frame under the GLB node's own (dequantizing) transform. */
export interface ReferenceAnatomyPart {
  readonly nodeId: string;
  readonly geometry: THREE_NS.BufferGeometry;
  readonly position: readonly [number, number, number];
  readonly scale: number;
  readonly provenance: ReferenceAnatomyProvenance;
}

export interface BodyParts3dLoadDiagnostics {
  readonly runtimePath: string;
  readonly status: 'READY' | 'BLOCKED' | 'ERROR' | 'CANCELLED';
  readonly reason: string;
  readonly bytes: number | null;
  /** Browser monotonic-clock fetch + decode time, never a simulated figure. */
  readonly loadMs: number | null;
}

export interface BodyParts3dLoadResult {
  readonly lod: BodyParts3dLod;
  readonly parts: readonly ReferenceAnatomyPart[];
  readonly diagnostics: readonly BodyParts3dLoadDiagnostics[];
}

function triangleCount(geometry: THREE_NS.BufferGeometry): number {
  return geometry.index ? geometry.index.count / 3 : (geometry.getAttribute('position')?.count ?? 0) / 3;
}

/**
 * Load the approved pilot structures at one level of detail. Each file passes the registry gate BEFORE
 * it is fetched; a refused, missing or undecodable file leaves that organ's procedural proxy in place and
 * is reported, never substituted. `fetchImpl` exists so tests can serve the committed files.
 */
export async function loadBodyParts3dPilot(
  lod: BodyParts3dLod,
  signal?: AbortSignal,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = (input, init) => fetch(input, init),
): Promise<BodyParts3dLoadResult> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const results = await Promise.all(BODYPARTS3D_PILOT_STRUCTURES.map(async (s): Promise<{ part: ReferenceAnatomyPart | null; diagnostics: BodyParts3dLoadDiagnostics }> => {
    const gate = evaluateBodyParts3dAsset(s.genesisId, lod);
    const started = typeof performance !== 'undefined' ? performance.now() : 0;
    const done = (status: BodyParts3dLoadDiagnostics['status'], reason: string, bytes: number | null, part: ReferenceAnatomyPart | null = null) => ({
      part, diagnostics: { runtimePath: gate.runtimePath, status, reason, bytes, loadMs: status === 'READY' && typeof performance !== 'undefined' ? performance.now() - started : null },
    });
    if (!gate.enabled || !gate.record) return done('BLOCKED', gate.reason, null);
    try {
      signal?.throwIfAborted();
      const response = await fetchImpl(gate.runtimePath, { signal });
      if (!response.ok) return done('ERROR', `HTTP_${response.status}`, null);
      const buffer = await response.arrayBuffer();
      signal?.throwIfAborted();
      const gltf = await loader.parseAsync(buffer, '');
      let found: THREE_NS.Mesh | null = null;
      gltf.scene.traverse((o) => { const m = o as THREE_NS.Mesh; if (!found && m.isMesh) found = m; });
      const mesh = found as THREE_NS.Mesh | null;
      if (!mesh) return done('ERROR', 'EMPTY_MODEL', buffer.byteLength);
      if (mesh.name !== s.genesisId) return done('ERROR', 'NODE_ID_MISMATCH', buffer.byteLength);
      const geometry = mesh.geometry;
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      // The GLB's loader-side material is never used: Genesis applies its own organ material.
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m?.dispose();
      const part: ReferenceAnatomyPart = {
        nodeId: s.genesisId,
        geometry,
        position: [mesh.position.x, mesh.position.y, mesh.position.z],
        scale: mesh.scale.x,
        provenance: {
          source: 'BodyParts3D 4.0 (DBCLS)', representation: 'GENERIC_ANATOMICAL_REFERENCE', patientSpecific: false, clinicalUse: false,
          license: gate.record.license ?? BODYPARTS3D_LICENSE, attribution: BODYPARTS3D_ATTRIBUTION,
          fmaId: s.fmaId, representationId: s.representationId, elementCount: s.elementFileIds.length,
          lod, triangles: triangleCount(geometry), runtimePath: gate.runtimePath, assetId: gate.record.id,
        },
      };
      return done('READY', 'OK', buffer.byteLength, part);
    } catch (error) {
      const cancelled = signal?.aborted === true;
      return done(cancelled ? 'CANCELLED' : 'ERROR', cancelled ? 'CANCELLED' : error instanceof Error ? error.message : String(error), null);
    }
  }));
  return { lod, parts: results.flatMap((r) => (r.part ? [r.part] : [])), diagnostics: results.map((r) => r.diagnostics) };
}

/** A presentation summary for the explorer: which nodes are drawn from the reference atlas. */
export interface ReferenceAnatomyState {
  readonly status: 'IDLE' | 'LOADING' | 'READY' | 'PARTIAL' | 'FAILED';
  readonly lod: BodyParts3dLod | null;
  readonly nodes: Readonly<Record<string, ReferenceAnatomyProvenance>>;
  readonly diagnostics: readonly BodyParts3dLoadDiagnostics[];
}

export const REFERENCE_ANATOMY_IDLE: ReferenceAnatomyState = Object.freeze({ status: 'IDLE', lod: null, nodes: Object.freeze({}), diagnostics: Object.freeze([]) });
