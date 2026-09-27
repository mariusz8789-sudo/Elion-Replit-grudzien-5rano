/**
 * GENESIS — BodyParts3D 4.0 PILOT CONVERTER (OBJ → web GLB)
 * ==========================================================
 *
 * Input: `artifacts/bodyparts3d/bodyparts3d-pilot-source.zip` — the small official-source subset
 * (manifest, the official `partof` mapping lists and the 428 referenced FJ element OBJs) prepared
 * from the official DBCLS archive. Output: one GLB per pilot structure and level of detail under
 * `public/assets/bodyparts3d/pilot/`, plus a provenance/metrics JSON next to them.
 *
 * What the conversion does, and nothing more:
 *   1. Verifies the pilot ZIP's SHA-256, then proves every structure's mapping against the OFFICIAL
 *      lists inside it: FMA concept → BP representation (`partof_parts_list_e.txt`) and
 *      FMA concept → FJ element files (`partof_element_parts.txt`). The manifest must agree with the
 *      official lists exactly (same set, no extras, no omissions) or the conversion stops.
 *   2. Merges exactly the officially mapped FJ elements of one structure into one primitive (one draw
 *      call). No element is dropped, re-shaped or substituted; membership is the official part-of set.
 *   3. Converts BodyParts3D millimetres (X = patient left, Y = posterior, Z = superior) into the Genesis
 *      twin frame in metres (x = patient left, y = up, z = anterior — the twin faces +Z) with a proper
 *      rotation (no mirroring, so left stays left), and ONE shared translation for all five structures
 *      so their relative positions are exactly the source atlas's. The translation places the centre of
 *      the bilateral lung pair at LUNG_PAIR_TARGET_M inside the twin's thorax; it is a presentation
 *      registration into the twin, not a fit to any individual.
 *   4. Uses the OBJ's own vertex normals (no recomputation) and writes no materials (Genesis applies its
 *      own organ material at runtime).
 *   5. Quantizes with KHR_mesh_quantization (int16 positions, int8 normals — decoded natively by
 *      three.js's GLTFLoader, no decoder library). The DESKTOP level keeps every source triangle; the
 *      MOBILE level is simplified with meshoptimizer (bounded error, measured and recorded).
 *
 * Deterministic: no clock, no randomness, fixed ordering; the same ZIP produces byte-identical files
 * (checked by `bodyParts3dPilot.test.ts`, which re-runs this converter and compares fingerprints).
 *
 * Run from packages/frontend: `node scripts/convertBodyParts3dPilot.mjs`
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TextDecoder, TextEncoder } from 'node:util';

export const CONVERTER_VERSION = 'genesis-bodyparts3d-pilot-converter/1.0.0';
export const PILOT_ZIP_SHA256 = '02c6d0107b82de7ea7e1166d78aef6f548040d8832317acbc12bf3c1f47ae862';
export const OFFICIAL_ARCHIVE_SHA256 = '40665852c49f218326590e204db91064a1ecfc3c6f8cbd7bbbcaac62c7cd409e';
/** meshoptimizer's simplifier output is version-specific; a different version is a different conversion. */
export const MESHOPTIMIZER_VERSION = '0.18.1';

/** Pilot structures in a fixed order. Genesis IDs are the canonical atlas node ids. */
export const PILOT_STRUCTURES = Object.freeze([
  { key: 'HEART', genesisId: 'heart' },
  { key: 'LIVER', genesisId: 'liver' },
  { key: 'LEFT_LUNG', genesisId: 'left-lung' },
  { key: 'RIGHT_LUNG', genesisId: 'right-lung' },
  { key: 'AORTA', genesisId: 'aorta' },
]);

/**
 * Where the centre of the bilateral lung pair is placed in the twin frame: the midline (x = 0), the atlas's
 * lung height (mean `left-lung`/`right-lung` y in anatomyAtlas.ts = 1.26 m) and the approved CC0 twin body's
 * thoracic antero-posterior centre (z = 0.045 m: back ≈ −0.05 m, anterior chest wall ≈ +0.14 m at
 * y = 1.10–1.25 m after the loader's 1:1 1.78 m scaling). `bodyParts3dPilot.test.ts` re-measures the body
 * mesh and checks every structure stays inside the torso.
 */
export const LUNG_PAIR_TARGET_M = Object.freeze([0, 1.26, 0.045]);

/** MOBILE level: target fraction of source triangles and the simplifier's relative error bound. */
export const MOBILE_LOD = Object.freeze({ targetTriangleRatio: 0.25, maxRelativeError: 0.01 });

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const text = (bytes) => new TextDecoder('utf-8').decode(bytes);

function parseTsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  const header = lines[0].split('\t');
  return { header, rows: lines.slice(1).map((line) => line.split('\t')) };
}

/**
 * Prove the manifest against the official part-of lists. Throws on any disagreement — a guessed or
 * partial mapping never reaches conversion.
 */
export function verifyOfficialMapping(manifest, partsListText, elementPartsText) {
  const partsList = parseTsv(partsListText);
  const elementParts = parseTsv(elementPartsText);
  if (partsList.header.join('|') !== 'concept id|representation id|en') throw new Error(`Unexpected partof_parts_list_e.txt header: ${partsList.header.join('|')}`);
  if (elementParts.header.join('|') !== 'concept id|name|element file id') throw new Error(`Unexpected partof_element_parts.txt header: ${elementParts.header.join('|')}`);
  const mapping = [];
  for (const { key, genesisId } of PILOT_STRUCTURES) {
    const s = manifest.structures?.[key];
    if (!s) throw new Error(`Manifest has no structure ${key}`);
    if (s.genesisId.replace('_', '-') !== genesisId) throw new Error(`${key}: manifest genesisId ${s.genesisId} does not name atlas node ${genesisId}`);
    const concept = partsList.rows.filter((r) => r[0] === s.fmaId);
    if (concept.length !== 1) throw new Error(`${key}: ${s.fmaId} has ${concept.length} rows in partof_parts_list_e.txt (expected exactly 1)`);
    const [, representationId, englishName] = concept[0];
    if (representationId !== s.representationId) throw new Error(`${key}: official representation ${representationId} ≠ manifest ${s.representationId}`);
    if (englishName !== s.name) throw new Error(`${key}: official name "${englishName}" ≠ manifest "${s.name}"`);
    const official = [...new Set(elementParts.rows.filter((r) => r[0] === s.fmaId).map((r) => r[2]))].sort();
    const declared = [...new Set(s.elementFileIds)].sort();
    if (declared.length !== s.elementFileIds.length) throw new Error(`${key}: manifest repeats FJ ids`);
    if (official.length === 0 || official.join(',') !== declared.join(',')) throw new Error(`${key}: manifest FJ set does not equal the official part-of element set`);
    mapping.push({ key, genesisId, fmaId: s.fmaId, representationId, name: englishName, elementFileIds: official });
  }
  const seen = new Map();
  for (const m of mapping) for (const fj of m.elementFileIds) {
    if (seen.has(fj)) throw new Error(`${fj} is mapped to both ${seen.get(fj)} and ${m.key}`);
    seen.set(fj, m.key);
  }
  return mapping;
}

/** Parse one BodyParts3D OBJ (v / vn / triangular f with v//vn), checking its header File ID. */
export function parseBodyPartsObj(content, expectedFileId) {
  const positions = []; const normals = []; const faces = [];
  let fileId = null; let representationId = null; let conceptId = null;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith('#')) {
      const m = /^#\s*(File ID|Representation ID|Concept ID)\s*:\s*(\S+)/.exec(line);
      if (m?.[1] === 'File ID') fileId = m[2];
      else if (m?.[1] === 'Representation ID') representationId = m[2];
      else if (m?.[1] === 'Concept ID') conceptId = m[2];
      continue;
    }
    const t = line.trim().split(/\s+/);
    if (t[0] === 'v') positions.push(+t[1], +t[2], +t[3]);
    else if (t[0] === 'vn') normals.push(+t[1], +t[2], +t[3]);
    else if (t[0] === 'f') {
      if (t.length !== 4) throw new Error(`${expectedFileId}: non-triangular face`);
      for (let i = 1; i <= 3; i++) {
        const [v, , n] = t[i].split('/');
        faces.push(Number(v) - 1, n ? Number(n) - 1 : -1);
      }
    }
  }
  if (fileId !== expectedFileId) throw new Error(`OBJ header File ID ${fileId} ≠ expected ${expectedFileId}`);
  return { fileId, representationId, conceptId, positions, normals, faces };
}

/** BodyParts3D mm (X left, Y posterior, Z superior) → twin metres (x left, y up, z anterior). det = +1. */
const toTwin = (x, y, z) => [x / 1000, z / 1000, -y / 1000];

/** Merge one structure's elements into indexed arrays (a vertex = one distinct (v, vn) pair per element). */
function mergeStructure(objs) {
  const pos = []; const nrm = []; const idx = []; const elements = [];
  for (const obj of objs) {
    const remap = new Map();
    const firstTriangle = idx.length / 3;
    for (let k = 0; k < obj.faces.length; k += 2) {
      const vi = obj.faces[k]; const ni = obj.faces[k + 1];
      const key = vi * 1048576 + (ni + 1);
      let out = remap.get(key);
      if (out === undefined) {
        out = pos.length / 3; remap.set(key, out);
        pos.push(...toTwin(obj.positions[vi * 3], obj.positions[vi * 3 + 1], obj.positions[vi * 3 + 2]));
        if (ni < 0) throw new Error(`${obj.fileId}: face without a vertex normal`);
        const [nx, ny, nz] = toTwin(obj.normals[ni * 3] * 1000, obj.normals[ni * 3 + 1] * 1000, obj.normals[ni * 3 + 2] * 1000);
        const len = Math.hypot(nx, ny, nz) || 1;
        nrm.push(nx / len, ny / len, nz / len);
      }
      idx.push(out);
    }
    elements.push({ fileId: obj.fileId, firstTriangle, triangleCount: idx.length / 3 - firstTriangle, sourceTriangleCount: obj.faces.length / 6, sourceVertexCount: obj.positions.length / 3 });
  }
  return { positions: Float64Array.from(pos), normals: Float64Array.from(nrm), indices: Uint32Array.from(idx), elements };
}

function boundsOf(positions) {
  const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let a = 0; a < 3; a++) {
    const v = positions[i + a]; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v;
  }
  return { min, max };
}

const round6 = (v) => Math.round(v * 1e6) / 1e6;

/** Drop vertices no index refers to (after simplification), keeping first-use order. */
function compact(positions, normals, indices) {
  const remap = new Int32Array(positions.length / 3).fill(-1);
  const pos = []; const nrm = []; const out = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i];
    if (remap[v] < 0) { remap[v] = pos.length / 3; pos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]); nrm.push(normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]); }
    out[i] = remap[v];
  }
  return { positions: Float64Array.from(pos), normals: Float64Array.from(nrm), indices: out };
}

const pad4 = (n) => (n + 3) & ~3;

/**
 * Write a single-mesh GLB: int16-normalized positions under a UNIFORM node scale (so the int8 normals
 * stay true normals), int8-normalized normals, uint16/uint32 indices, no material, provenance in extras.
 */
export function writeQuantizedGlb({ name, positions, normals, indices, extras, copyright }) {
  const { min, max } = boundsOf(positions);
  const center = [0, 1, 2].map((a) => (min[a] + max[a]) / 2);
  const half = Math.max(...[0, 1, 2].map((a) => (max[a] - min[a]) / 2)) || 1;
  const vertexCount = positions.length / 3;
  const qpos = new Int16Array(vertexCount * 4);
  const qmin = [32767, 32767, 32767]; const qmax = [-32767, -32767, -32767];
  for (let v = 0; v < vertexCount; v++) for (let a = 0; a < 3; a++) {
    const q = Math.max(-32767, Math.min(32767, Math.round(((positions[v * 3 + a] - center[a]) / half) * 32767)));
    qpos[v * 4 + a] = q; if (q < qmin[a]) qmin[a] = q; if (q > qmax[a]) qmax[a] = q;
  }
  const qnrm = new Int8Array(vertexCount * 4);
  for (let v = 0; v < vertexCount; v++) for (let a = 0; a < 3; a++) qnrm[v * 4 + a] = Math.max(-127, Math.min(127, Math.round(normals[v * 3 + a] * 127)));
  const wide = vertexCount > 65535;
  const qidx = wide ? Uint32Array.from(indices) : Uint16Array.from(indices);
  const views = [
    { bytes: new Uint8Array(qpos.buffer), byteStride: 8, target: 34962 },
    { bytes: new Uint8Array(qnrm.buffer), byteStride: 4, target: 34962 },
    { bytes: new Uint8Array(qidx.buffer), target: 34963 },
  ];
  let offset = 0;
  const bufferViews = views.map((v) => {
    const view = { buffer: 0, byteOffset: offset, byteLength: v.bytes.byteLength, ...(v.byteStride ? { byteStride: v.byteStride } : {}), target: v.target };
    offset = pad4(offset + v.bytes.byteLength);
    return view;
  });
  const bin = new Uint8Array(offset);
  views.forEach((v, i) => bin.set(v.bytes, bufferViews[i].byteOffset));
  const json = {
    asset: { version: '2.0', generator: CONVERTER_VERSION, copyright },
    extensionsUsed: ['KHR_mesh_quantization'],
    extensionsRequired: ['KHR_mesh_quantization'],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0, translation: center.map(round6), scale: [half, half, half].map(round6), extras }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, mode: 4 }] }],
    accessors: [
      { bufferView: 0, componentType: 5122, normalized: true, count: vertexCount, type: 'VEC3', min: qmin.map((q) => q / 32767), max: qmax.map((q) => q / 32767) },
      { bufferView: 1, componentType: 5120, normalized: true, count: vertexCount, type: 'VEC3' },
      { bufferView: 2, componentType: wide ? 5125 : 5123, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews,
    buffers: [{ byteLength: bin.byteLength }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = pad4(jsonBytes.length);
  const total = 12 + 8 + jsonLen + 8 + bin.byteLength;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20); out.fill(0x20, 20 + jsonBytes.length, 20 + jsonLen);
  dv.setUint32(20 + jsonLen, bin.byteLength, true); dv.setUint32(24 + jsonLen, 0x004e4942, true);
  out.set(bin, 28 + jsonLen);
  return { bytes: out, vertexCount, triangleCount: indices.length / 3, indexComponent: wide ? 'UNSIGNED_INT' : 'UNSIGNED_SHORT', nodeTranslation: json.nodes[0].translation, nodeScale: json.nodes[0].scale[0] };
}

/**
 * Pure conversion: ZIP bytes in, output files + provenance out. No filesystem access, so the test suite
 * can re-run it and compare fingerprints with the committed files.
 */
export async function convertBodyParts3dPilot(zipBytes, { unzipSync, MeshoptSimplifier, meshoptVersion }) {
  const zipSha = sha256(zipBytes);
  if (zipSha !== PILOT_ZIP_SHA256) throw new Error(`Pilot ZIP SHA-256 ${zipSha} ≠ recorded ${PILOT_ZIP_SHA256}`);
  if (meshoptVersion !== MESHOPTIMIZER_VERSION) throw new Error(`meshoptimizer ${meshoptVersion} ≠ pinned ${MESHOPTIMIZER_VERSION}`);
  const files = unzipSync(zipBytes);
  const manifest = JSON.parse(text(files['manifest.json']));
  if (manifest.sourceArchiveSha256.toLowerCase() !== OFFICIAL_ARCHIVE_SHA256) throw new Error('Manifest names a different official archive');
  const mapping = verifyOfficialMapping(manifest, text(files['metadata/partof_parts_list_e.txt']), text(files['metadata/partof_element_parts.txt']));

  const merged = new Map();
  for (const m of mapping) {
    const objs = m.elementFileIds.map((fj) => {
      const entry = files[`obj/${fj}.obj`];
      if (!entry) throw new Error(`${m.key}: official element ${fj}.obj is missing from the pilot ZIP`);
      return { ...parseBodyPartsObj(text(entry), fj), sha256: sha256(entry), bytes: entry.byteLength };
    });
    merged.set(m.key, { objs, mesh: mergeStructure(objs) });
  }

  // One shared translation: the bilateral lung pair's bounding-box centre onto the atlas lung-pair centre.
  const lungs = [merged.get('LEFT_LUNG').mesh.positions, merged.get('RIGHT_LUNG').mesh.positions].map(boundsOf);
  const pairMin = [0, 1, 2].map((a) => Math.min(lungs[0].min[a], lungs[1].min[a]));
  const pairMax = [0, 1, 2].map((a) => Math.max(lungs[0].max[a], lungs[1].max[a]));
  const registration = [0, 1, 2].map((a) => round6(LUNG_PAIR_TARGET_M[a] - (pairMin[a] + pairMax[a]) / 2));

  await MeshoptSimplifier.ready;
  const outputs = {};
  const structures = [];
  for (const m of mapping) {
    const { objs, mesh } = merged.get(m.key);
    const positions = mesh.positions.map((v, i) => v + registration[i % 3]);
    const baseExtras = {
      source: 'BodyParts3D 4.0 (DBCLS)', license: manifest.license, attribution: manifest.attribution,
      fmaId: m.fmaId, representationId: m.representationId, conceptName: m.name, genesisId: m.genesisId,
      elementFileIds: m.elementFileIds, converter: CONVERTER_VERSION,
      frame: 'Genesis twin frame, metres: x = patient left, y = up, z = anterior; registration translation (m) applied after mm→m + axis rotation',
      registrationTranslationMeters: registration,
      representation: 'GENERIC_ANATOMICAL_REFERENCE', patientSpecific: false, clinicalUse: false,
    };
    const desktop = writeQuantizedGlb({
      name: m.genesisId, positions, normals: mesh.normals, indices: mesh.indices, copyright: manifest.attribution,
      extras: { ...baseExtras, lod: 'DESKTOP', elements: mesh.elements.map(({ fileId, firstTriangle, triangleCount }) => ({ fileId, firstTriangle, triangleCount })) },
    });
    const sourceTriangles = mesh.indices.length / 3;
    const target = Math.floor((sourceTriangles * MOBILE_LOD.targetTriangleRatio)) * 3;
    const [simplified, relativeError] = MeshoptSimplifier.simplify(mesh.indices, Float32Array.from(positions), 3, target, MOBILE_LOD.maxRelativeError);
    const scale = MeshoptSimplifier.getScale(Float32Array.from(positions), 3);
    const small = compact(positions, mesh.normals, simplified);
    const mobile = writeQuantizedGlb({
      name: m.genesisId, positions: small.positions, normals: small.normals, indices: small.indices, copyright: manifest.attribution,
      extras: { ...baseExtras, lod: 'MOBILE', simplifier: `meshoptimizer ${MESHOPTIMIZER_VERSION}`, simplifierRelativeError: round6(relativeError) },
    });
    const files2 = { DESKTOP: desktop, MOBILE: mobile };
    const lods = {};
    for (const [lod, out] of Object.entries(files2)) {
      const fileName = `${m.genesisId}.${lod.toLowerCase()}.glb`;
      outputs[fileName] = out.bytes;
      lods[lod] = {
        fileName, bytes: out.bytes.byteLength, sha256: sha256(out.bytes), triangles: out.triangleCount, vertices: out.vertexCount,
        indexComponent: out.indexComponent, drawCalls: 1, materials: 0,
        nodeTranslationMeters: out.nodeTranslation, nodeUniformScaleMeters: out.nodeScale,
      };
    }
    lods.MOBILE.simplifierRelativeError = round6(relativeError);
    lods.MOBILE.simplifierAbsoluteErrorMm = round6(relativeError * scale * 1000);
    const b = boundsOf(positions);
    structures.push({
      key: m.key, genesisId: m.genesisId, fmaId: m.fmaId, representationId: m.representationId, conceptName: m.name,
      elementFileIds: m.elementFileIds,
      source: {
        objCount: objs.length, objBytes: objs.reduce((s, o) => s + o.bytes, 0),
        triangles: sourceTriangles, vertices: objs.reduce((s, o) => s + o.positions.length / 3, 0),
        objSha256: Object.fromEntries(objs.map((o) => [o.fileId, o.sha256])),
      },
      boundsMeters: { min: b.min.map(round6), max: b.max.map(round6) },
      lods,
    });
  }
  const provenance = {
    schemaVersion: 1,
    converter: CONVERTER_VERSION,
    meshoptimizer: MESHOPTIMIZER_VERSION,
    source: {
      name: manifest.source,
      officialDownloadPage: manifest.officialDownloadPage,
      officialArchiveUrl: manifest.officialArchiveUrl,
      officialArchiveSha256: OFFICIAL_ARCHIVE_SHA256,
      pilotZipPath: 'artifacts/bodyparts3d/bodyparts3d-pilot-source.zip',
      pilotZipSha256: PILOT_ZIP_SHA256,
      downloadDate: '2026-09-24',
      downloadDateNote: 'The pilot package does not record a download timestamp; 2026-09-24 is the date of the commit that published it (70318a8e / 365e41cb).',
      license: manifest.license,
      licenseUrl: manifest.officialLicenseUrl,
      attribution: manifest.attribution,
    },
    frame: {
      units: 'metres',
      axes: 'x = patient left, y = up (superior), z = anterior; the Genesis twin faces +Z',
      fromBodyParts3d: 'x = X/1000, y = Z/1000, z = -Y/1000 (proper rotation, determinant +1: no mirroring)',
      registrationTranslationMeters: registration,
      registrationTargetMeters: LUNG_PAIR_TARGET_M,
      registration: 'Bilateral lung-pair bounding-box centre → (0, 1.26, 0.045) m: midline, Genesis atlas lung height, approved CC0 twin thoracic antero-posterior centre. One translation for all structures; no scaling; relative positions are the source atlas\'s own.',
    },
    mobileLod: MOBILE_LOD,
    representation: 'GENERIC_ANATOMICAL_REFERENCE',
    limitations: [
      'Generic anatomical reference model from one atlas body — not patient-specific, not a measurement of anybody, not for clinical or diagnostic use.',
      'Surface geometry only: BodyParts3D contains no histology, tissue or cell data. Tissue/cell views in Genesis remain MODEL.',
      'Compound part-of membership is used as published. BodyParts3D release notes warn that some segmented lung and liver concepts may contain mapping inaccuracies.',
      'The OBJ headers still carry the legacy "CC Attribution-Share Alike 2.1 Japan" notice; the current official licence page (CC BY 4.0) governs, and the required CC BY 4.0 attribution is shown whenever these meshes are rendered.',
      'Registration into the twin is a translation only; organ sizes are the atlas body\'s own and are not rescaled to the twin\'s height.',
      'The MOBILE level is a simplified mesh (bounded error, recorded per structure); the DESKTOP level keeps every source triangle.',
    ],
    structures,
  };
  return { outputs, provenance, mapping, zipSha };
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const frontend = path.resolve(here, '..');
  const repo = path.resolve(frontend, '../..');
  const zipBytes = new Uint8Array(await readFile(path.join(repo, 'artifacts/bodyparts3d/bodyparts3d-pilot-source.zip')));
  const { unzipSync } = await import('three/examples/jsm/libs/fflate.module.js');
  const { MeshoptSimplifier } = await import('meshoptimizer');
  const meshoptVersion = JSON.parse(await readFile(path.join(repo, 'node_modules/meshoptimizer/package.json'), 'utf8')).version;
  const { outputs, provenance } = await convertBodyParts3dPilot(zipBytes, { unzipSync, MeshoptSimplifier, meshoptVersion });
  const outDir = path.join(frontend, 'public/assets/bodyparts3d/pilot');
  await mkdir(outDir, { recursive: true });
  for (const [name, bytes] of Object.entries(outputs)) await writeFile(path.join(outDir, name), bytes);
  await writeFile(path.join(outDir, 'bodyparts3d-pilot.provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  for (const s of provenance.structures) {
    const d = s.lods.DESKTOP; const mo = s.lods.MOBILE;
    console.log(`${s.genesisId.padEnd(10)} ${String(s.source.objCount).padStart(3)} OBJ ${String(s.source.objBytes).padStart(9)} B ${String(s.source.triangles).padStart(7)} tris → desktop ${String(d.bytes).padStart(8)} B ${String(d.triangles).padStart(7)} tris · mobile ${String(mo.bytes).padStart(7)} B ${String(mo.triangles).padStart(6)} tris (err ${mo.simplifierAbsoluteErrorMm} mm)`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
