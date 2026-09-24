import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import {
  BODYPARTS3D_ATTRIBUTION, BODYPARTS3D_LODS, BODYPARTS3D_PILOT_STRUCTURES, bodyParts3dRuntimePath, evaluateBodyParts3dAsset,
  loadBodyParts3dPilot, selectBodyParts3dLod, type BodyParts3dLoadResult, type ReferenceAnatomyPart,
} from '../core/three/bodyParts3dPilot';
import { WORLD_ENGINE_ASSET_MANIFEST, getWorldAssetRecord, evaluatePremiumAssetAcceptance } from '../core/three/assetGovernance';
import { createTwinProxy } from '../core/three/biologyLabKit';
import { getMaterialRimIntensity } from '../core/three/humanTwinMaterials';
import { createHumanDigitalTwinManifest } from '../core/scientificWorlds/humanLab/anatomyAtlas';
import { buildVisualLayerInstruction } from '../core/scientificWorlds/humanLab/visualModes';
// The converter is a plain Node module; the suite re-runs it to prove the committed files are its output.
import { convertBodyParts3dPilot, parseBodyPartsObj, verifyOfficialMapping, MESHOPTIMIZER_VERSION } from '../../scripts/convertBodyParts3dPilot.mjs';

/**
 * BodyParts3D 4.0 pilot: every claim the pilot makes is checked against the official source package
 * (its part-of lists and OBJ elements), the committed GLBs, the one asset registry and the existing
 * twin's own picking / highlight / isolation / framing code.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, '../..');
const REPO = join(FRONTEND, '../..');
const PILOT_DIR = join(FRONTEND, 'public/assets/bodyparts3d/pilot');
const ZIP = new Uint8Array(readFileSync(join(REPO, 'artifacts/bodyparts3d/bodyparts3d-pilot-source.zip')));
const ZIP_FILES = unzipSync(ZIP);
const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const PROVENANCE = JSON.parse(readFileSync(join(PILOT_DIR, 'bodyparts3d-pilot.provenance.json'), 'utf8'));
const manifest = createHumanDigitalTwinManifest('HDT-BP3D-TEST');

/** Serve the committed public files exactly as the browser would fetch them. */
const localFetch = async (input: string): Promise<Response> => {
  const bytes = readFileSync(join(FRONTEND, 'public', input));
  return new Response(bytes, { status: 200 });
};

let desktop: BodyParts3dLoadResult;
let mobile: BodyParts3dLoadResult;
beforeAll(async () => {
  desktop = await loadBodyParts3dPilot('DESKTOP', undefined, localFetch);
  mobile = await loadBodyParts3dPilot('MOBILE', undefined, localFetch);
});

const centreOf = (part: ReferenceAnatomyPart): THREE.Vector3 => {
  part.geometry.computeBoundingBox();
  return part.geometry.boundingBox!.getCenter(new THREE.Vector3()).multiplyScalar(part.scale).add(new THREE.Vector3(...part.position));
};
const partOf = (result: BodyParts3dLoadResult, id: string): ReferenceAnatomyPart => result.parts.find((p) => p.nodeId === id)!;

describe('exact official mapping: FMA concept → BP representation → FJ elements → Genesis id', () => {
  it('the code table equals the official part-of lists in the source package, structure by structure', () => {
    const official = verifyOfficialMapping(
      JSON.parse(text(ZIP_FILES['manifest.json'])),
      text(ZIP_FILES['metadata/partof_parts_list_e.txt']),
      text(ZIP_FILES['metadata/partof_element_parts.txt']),
    );
    expect(official.map((m: { genesisId: string }) => m.genesisId)).toEqual(['heart', 'liver', 'left-lung', 'right-lung', 'aorta']);
    for (const s of BODYPARTS3D_PILOT_STRUCTURES) {
      const o = official.find((m: { genesisId: string }) => m.genesisId === s.genesisId);
      expect(o).toMatchObject({ fmaId: s.fmaId, representationId: s.representationId, name: s.conceptName });
      expect([...s.elementFileIds].sort()).toEqual(o!.elementFileIds);
    }
    expect(BODYPARTS3D_PILOT_STRUCTURES.map((s) => [s.fmaId, s.representationId, s.elementFileIds.length])).toEqual([
      ['FMA7088', 'BP9305', 83], ['FMA7197', 'BP9334', 60], ['FMA7310', 'BP9417', 124], ['FMA7309', 'BP9359', 156], ['FMA3734', 'BP10374', 5],
    ]);
  });

  it('a guessed or partial mapping is refused, not converted', () => {
    const m = JSON.parse(text(ZIP_FILES['manifest.json']));
    m.structures.HEART.elementFileIds = m.structures.HEART.elementFileIds.slice(1);
    expect(() => verifyOfficialMapping(m, text(ZIP_FILES['metadata/partof_parts_list_e.txt']), text(ZIP_FILES['metadata/partof_element_parts.txt']))).toThrow(/official part-of element set/);
  });

  it('every referenced FJ element exists in the package, is a triangle mesh, and names itself in its header', () => {
    const ids = BODYPARTS3D_PILOT_STRUCTURES.flatMap((s) => s.elementFileIds);
    expect(ids).toHaveLength(428);
    expect(new Set(ids).size).toBe(428);
    for (const id of ids) {
      const entry = ZIP_FILES[`obj/${id}.obj`];
      expect(entry, id).toBeDefined();
      const obj = parseBodyPartsObj(text(entry), id);
      expect(obj.faces.length).toBeGreaterThan(0);
    }
  });

  it('every Genesis id is a canonical atlas ORGAN node the existing twin already builds', () => {
    for (const s of BODYPARTS3D_PILOT_STRUCTURES) expect(manifest.nodes.find((n) => n.id === s.genesisId)?.kind).toBe('ORGAN');
  });
});

describe('deterministic conversion and fingerprints', () => {
  it('re-running the converter reproduces every committed file byte for byte', async () => {
    const meshoptVersion = JSON.parse(readFileSync(join(REPO, 'node_modules/meshoptimizer/package.json'), 'utf8')).version;
    expect(meshoptVersion).toBe(MESHOPTIMIZER_VERSION);
    const { outputs, provenance } = await convertBodyParts3dPilot(ZIP, { unzipSync, MeshoptSimplifier, meshoptVersion });
    expect(Object.keys(outputs).sort()).toEqual(readdirSync(PILOT_DIR).filter((f) => f.endsWith('.glb')).sort());
    for (const [name, bytes] of Object.entries(outputs)) expect(sha256(bytes as Uint8Array), name).toBe(sha256(readFileSync(join(PILOT_DIR, name))));
    expect(provenance).toEqual(PROVENANCE);
  }, 60_000);

  it('the registry records the checksum of the very file on disk, for both levels of every structure', () => {
    for (const s of BODYPARTS3D_PILOT_STRUCTURES) for (const lod of BODYPARTS3D_LODS) {
      const path = bodyParts3dRuntimePath(s.genesisId, lod);
      const file = path.slice(path.lastIndexOf('/') + 1);
      const record = getWorldAssetRecord(path);
      expect(record?.sha256[file], path).toBe(sha256(readFileSync(join(FRONTEND, 'public', path))));
      expect(PROVENANCE.structures.find((x: { genesisId: string }) => x.genesisId === s.genesisId).lods[lod].sha256).toBe(record?.sha256[file]);
    }
  });
});

describe('licence, attribution and representation metadata', () => {
  it('every pilot record is APPROVED with the official source, CC BY 4.0 and the required attribution', () => {
    for (const s of BODYPARTS3D_PILOT_STRUCTURES) for (const lod of BODYPARTS3D_LODS) {
      const gate = evaluateBodyParts3dAsset(s.genesisId, lod);
      expect(gate.enabled, gate.runtimePath).toBe(true);
      expect(gate.record).toMatchObject({
        status: 'APPROVED', license: 'CC-BY-4.0', licenseUrl: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html',
        sourceUrl: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip', author: BODYPARTS3D_ATTRIBUTION,
      });
    }
    expect(PROVENANCE.source).toMatchObject({ license: 'CC BY 4.0', attribution: BODYPARTS3D_ATTRIBUTION, officialArchiveSha256: '40665852c49f218326590e204db91064a1ecfc3c6f8cbd7bbbcaac62c7cd409e' });
  });

  it('each GLB carries the attribution and its own FMA/BP/FJ provenance, labelled generic and non-clinical', () => {
    for (const s of BODYPARTS3D_PILOT_STRUCTURES) {
      const bytes = readFileSync(join(FRONTEND, 'public', bodyParts3dRuntimePath(s.genesisId, 'DESKTOP')));
      const json = JSON.parse(text(bytes.subarray(20, 20 + bytes.readUInt32LE(12))));
      expect(json.asset.copyright).toBe(BODYPARTS3D_ATTRIBUTION);
      expect(json.nodes).toHaveLength(1);
      expect(json.materials).toBeUndefined();
      expect(json.nodes[0].extras).toMatchObject({ genesisId: s.genesisId, fmaId: s.fmaId, representationId: s.representationId, patientSpecific: false, clinicalUse: false, representation: 'GENERIC_ANATOMICAL_REFERENCE' });
      expect(json.nodes[0].extras.elementFileIds).toEqual([...s.elementFileIds].sort());
    }
    expect(PROVENANCE.limitations.join(' ')).toMatch(/not patient-specific/);
    expect(PROVENANCE.limitations.join(' ')).toMatch(/no histology/);
  });

  it('no unknown-licence asset: every file in the pilot directory is the provenance JSON or an approved CC BY 4.0 GLB', () => {
    for (const file of readdirSync(PILOT_DIR)) {
      if (file === 'bodyparts3d-pilot.provenance.json') continue;
      const record = getWorldAssetRecord(`/assets/bodyparts3d/pilot/${file}`);
      expect(record?.status, file).toBe('APPROVED');
      expect(record?.license).toBe('CC-BY-4.0');
    }
    expect(WORLD_ENGINE_ASSET_MANIFEST.filter((r) => r.runtimePath.startsWith('/assets/bodyparts3d/'))).toHaveLength(10);
  });

  it('the pre-purchase acceptance screen flags only the attribution duty — which the explorer renders', () => {
    const result = evaluatePremiumAssetAcceptance({
      id: 'bodyparts3d-4.0-pilot', assetClass: 'ANATOMICAL',
      license: { name: 'CC BY 4.0', url: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html', requiresAttribution: true, permitsCommercialRedistribution: true, aiRestriction: 'NONE' },
      provenance: { sourceName: 'BodyParts3D 4.0 (DBCLS)', sourceUrl: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip', sha256: getWorldAssetRecord(bodyParts3dRuntimePath('heart', 'DESKTOP'))!.sha256, immutableSource: true },
      anatomy: { separateMeshes: true, stableMeshIds: BODYPARTS3D_PILOT_STRUCTURES.map((s) => s.genesisId), supportsOrganPicking: true, supportsIsolation: true, supportsCrossSection: true },
      performance: { polygonCount: 419362, maxPolygonBudget: 500000, textureResolutionPx: 0, maxTextureResolutionPx: 2048, hasLod: true, lodLevels: 2, ktx2Ready: true, meshoptReady: true, dracoReady: false, realTimeWebSuitable: true },
      scientificProvenance: { datasetOrReference: 'BodyParts3D 4.0, FMA part-of concepts', reviewedBy: 'DBCLS (source atlas)', citationUrl: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html' },
    });
    expect(result.decision).toBe('LEGAL_REVIEW_REQUIRED');
    expect(result.reasons).toEqual(['License requires attribution — needs human confirmation the attribution flow is implemented before approval.']);
  });
});

describe('registry loading through the existing GLTFLoader', () => {
  it('loads all five structures at both levels, each passing the gate before any fetch', () => {
    for (const result of [desktop, mobile]) {
      expect(result.diagnostics.map((d) => [d.status, d.reason])).toEqual(Array(5).fill(['READY', 'OK']));
      expect(result.parts.map((p) => p.nodeId)).toEqual(['heart', 'liver', 'left-lung', 'right-lung', 'aorta']);
      for (const p of result.parts) {
        expect(p.geometry.getAttribute('position').normalized).toBe(true);
        expect(p.geometry.getAttribute('normal')).toBeDefined();
        expect(p.provenance).toMatchObject({ patientSpecific: false, clinicalUse: false, attribution: BODYPARTS3D_ATTRIBUTION });
      }
    }
    const desktopTriangles = desktop.parts.map((p) => p.provenance.triangles);
    expect(desktopTriangles).toEqual(PROVENANCE.structures.map((s: { source: { triangles: number } }) => s.source.triangles));
  });

  it('an unapproved path is never fetched', async () => {
    let fetched = 0;
    const gate = evaluateBodyParts3dAsset('stomach', 'DESKTOP');
    expect([gate.enabled, gate.reason]).toEqual([false, 'NOT_A_PILOT_STRUCTURE']);
    const result = await loadBodyParts3dPilot('DESKTOP', undefined, async (input) => { fetched++; return localFetch(input); });
    expect(fetched).toBe(5);
    expect(result.diagnostics.every((d) => d.runtimePath.startsWith('/assets/bodyparts3d/pilot/'))).toBe(true);
  });
});

describe('anatomical identity in the twin frame (x = patient left, z = anterior; the twin faces +Z)', () => {
  it('left lung is on the patient left, right lung on the right; the heart leans left, the liver right', () => {
    for (const result of [desktop, mobile]) {
      expect(centreOf(partOf(result, 'left-lung')).x).toBeGreaterThan(0.04);
      expect(centreOf(partOf(result, 'right-lung')).x).toBeLessThan(-0.04);
      expect(centreOf(partOf(result, 'heart')).x).toBeGreaterThan(0);
      expect(centreOf(partOf(result, 'liver')).x).toBeLessThan(0);
      // The liver sits below the heart, the heart between the lungs.
      expect(centreOf(partOf(result, 'liver')).y).toBeLessThan(centreOf(partOf(result, 'heart')).y);
    }
  });

  it('every structure stays inside the approved CC0 twin torso at every height (1:1, as the loader scales it)', () => {
    const bytes = readFileSync(join(FRONTEND, 'public/assets/genesis-hf/characters/mpfb-lod0.glb'));
    const json = JSON.parse(text(bytes.subarray(20, 20 + bytes.readUInt32LE(12))));
    const bin = 28 + bytes.readUInt32LE(12);
    const all: { name: string; points: number[][] }[] = json.meshes.map((m: { name: string; primitives: { attributes: { POSITION: number } }[] }) => {
      const a = json.accessors[m.primitives[0].attributes.POSITION]; const bv = json.bufferViews[a.bufferView];
      const stride = bv.byteStride ?? 12; const base = bin + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
      return { name: m.name, points: Array.from({ length: a.count }, (_, i) => [0, 1, 2].map((k) => bytes.readFloatLE(base + i * stride + k * 4))) };
    });
    const ys = all.flatMap((m) => m.points.map((p) => p[1]));
    const y0 = Math.min(...ys); const scale = 1.78 / (Math.max(...ys) - y0);
    const torso = all.filter((m) => m.name === 'base' || m.name === 'female_casualsuit01').flatMap((m) => m.points.map((p) => [p[0] * scale, (p[1] - y0) * scale, p[2] * scale]));
    for (const part of desktop.parts) {
      const pos = part.geometry.getAttribute('position');
      const v = new THREE.Vector3();
      const organ = Array.from({ length: pos.count }, (_, i) => v.fromBufferAttribute(pos, i).multiplyScalar(part.scale).add(new THREE.Vector3(...part.position)).toArray());
      const minY = Math.min(...organ.map((p) => p[1])); const maxY = Math.max(...organ.map((p) => p[1]));
      for (let y = minY; y < maxY; y += 0.02) {
        const o = organ.filter((p) => Math.abs(p[1] - y) < 0.01);
        const b = torso.filter((p) => Math.abs(p[1] - y) < 0.015 && Math.abs(p[0]) < 0.19);
        if (!o.length || !b.length) continue;
        const ox = o.map((p) => p[0]); const oz = o.map((p) => p[2]); const bx = b.map((p) => p[0]); const bz = b.map((p) => p[2]);
        expect(Math.min(...ox), `${part.nodeId} x @ ${y.toFixed(2)}`).toBeGreaterThanOrEqual(Math.min(...bx) - 0.005);
        expect(Math.max(...ox), `${part.nodeId} x @ ${y.toFixed(2)}`).toBeLessThanOrEqual(Math.max(...bx) + 0.005);
        expect(Math.min(...oz), `${part.nodeId} z @ ${y.toFixed(2)}`).toBeGreaterThanOrEqual(Math.min(...bz) - 0.005);
        expect(Math.max(...oz), `${part.nodeId} z @ ${y.toFixed(2)}`).toBeLessThanOrEqual(Math.max(...bz) + 0.005);
      }
    }
  }, 60_000);
});

describe('the existing twin draws, picks, highlights, isolates and frames the reference geometry', () => {
  const twinWithReference = () => {
    const twin = createTwinProxy(THREE, manifest, { skinHex: '#d6ae91' });
    twin.applyReferenceAnatomy(desktop.parts);
    twin.setView(buildVisualLayerInstruction(manifest, 'ORGANS'), null);
    twin.group.updateMatrixWorld(true);
    return twin;
  };

  it('the SAME organ meshes now carry the reference geometry, tagged with its provenance', () => {
    const twin = twinWithReference();
    for (const p of desktop.parts) {
      const mesh = twin.organs.get(p.nodeId)!;
      expect(mesh.geometry).toBe(p.geometry);
      expect(mesh.userData.nodeId).toBe(p.nodeId);
      expect(mesh.userData.referenceAnatomy.fmaId).toBe(p.provenance.fmaId);
    }
    // Organs outside the pilot keep their procedural proxy.
    expect(twin.organs.get('stomach')!.userData.referenceAnatomy).toBeUndefined();
    twin.dispose();
  });

  it('raycast selection resolves the reference mesh to its atlas node id, left and right lung distinctly', () => {
    const twin = twinWithReference();
    const organs = [...twin.organs.values()].filter((m) => m.visible);
    for (const id of ['left-lung', 'right-lung', 'liver']) {
      const c = centreOf(partOf(desktop, id));
      const lateral = id === 'left-lung' ? 0.09 : id === 'right-lung' ? -0.09 : -0.08;
      const ray = new THREE.Raycaster(new THREE.Vector3(lateral, c.y, 2), new THREE.Vector3(0, 0, -1));
      expect(ray.intersectObjects(organs, false)[0]?.object.userData.nodeId, id).toBe(id);
    }
    twin.dispose();
  });

  it('selection highlights the selected reference organ only', () => {
    const twin = twinWithReference();
    twin.setView(buildVisualLayerInstruction(manifest, 'ORGANS'), 'aorta');
    expect(getMaterialRimIntensity(twin.organs.get('aorta')!.material as THREE.Material)).toBeGreaterThan(1);
    expect(getMaterialRimIntensity(twin.organs.get('heart')!.material as THREE.Material)).toBe(0);
    twin.dispose();
  });

  it('isolation keeps the isolated reference organ opaque, dims the rest and ghosts the body', () => {
    const twin = twinWithReference();
    twin.setIsolated(['liver']);
    const liver = twin.organs.get('liver')!;
    expect(liver.visible).toBe(true);
    expect((liver.material as THREE.MeshPhysicalMaterial).opacity).toBe(1);
    for (const [id, m] of twin.organs) if (id !== 'liver') expect(m.visible && (m.material as THREE.MeshPhysicalMaterial).opacity === 1, id).toBe(false);
    let shell: THREE.MeshPhysicalMaterial | null = null;
    twin.body.root.traverse((o) => { const m = o as THREE.Mesh; if (!shell && m.isMesh) shell = m.material as THREE.MeshPhysicalMaterial; });
    expect(shell!.opacity).toBeLessThan(0.1);
    twin.dispose();
  });

  it('camera framing targets the reference geometry, not the old ellipsoid position', () => {
    const twin = createTwinProxy(THREE, manifest, { skinHex: '#d6ae91' });
    const proxyFocus = twin.getOrganFocus('heart')!;
    expect(proxyFocus.y).toBeCloseTo(manifest.nodes.find((n) => n.id === 'heart')!.positionMeters.y, 6);
    twin.applyReferenceAnatomy(desktop.parts);
    const focus = twin.getOrganFocus('heart')!;
    const expected = centreOf(partOf(desktop, 'heart'));
    expect([focus.x, focus.y, focus.z].map((v) => Number(v.toFixed(4)))).toEqual([expected.x, expected.y, expected.z].map((v) => Number(v.toFixed(4))));
    twin.dispose();
  });

  it('twin disposal leaves the scene-owned reference geometry intact for the next twin', () => {
    const twin = twinWithReference();
    twin.dispose();
    expect(partOf(desktop, 'heart').geometry.getAttribute('position').count).toBeGreaterThan(0);
    const next = createTwinProxy(THREE, manifest, { skinHex: '#d6ae91' });
    next.applyReferenceAnatomy(desktop.parts);
    expect(next.organs.get('heart')!.geometry).toBe(partOf(desktop, 'heart').geometry);
    next.dispose();
  });
});

describe('mobile level of detail', () => {
  it('touch devices and narrow viewports get the light level; desktops the full one', () => {
    for (const [w, coarse] of [[375, true], [390, true], [430, true], [820, false]] as const) expect(selectBodyParts3dLod({ innerWidth: w, coarsePointer: coarse })).toBe('MOBILE');
    expect(selectBodyParts3dLod({ innerWidth: 1440, coarsePointer: false })).toBe('DESKTOP');
  });

  it('the mobile level exists for every structure, is lighter, and records its measured simplification error', () => {
    for (const s of PROVENANCE.structures) {
      expect(s.lods.MOBILE.triangles).toBeLessThan(s.lods.DESKTOP.triangles * 0.3);
      expect(s.lods.MOBILE.bytes).toBeLessThan(s.lods.DESKTOP.bytes);
      expect(s.lods.MOBILE.simplifierAbsoluteErrorMm).toBeLessThan(1);
      expect(s.lods.DESKTOP.triangles).toBe(s.source.triangles);
    }
    const total = (lod: 'DESKTOP' | 'MOBILE') => PROVENANCE.structures.reduce((sum: number, s: { lods: Record<string, { bytes: number }> }) => sum + s.lods[lod].bytes, 0);
    expect(total('MOBILE')).toBeLessThan(2_000_000);
  });
});
