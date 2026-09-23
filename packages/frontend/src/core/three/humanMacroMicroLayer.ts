import type * as THREE_NS from 'three';
import type { BiologyArtifact } from '../scientificWorlds/biologyRunners';
import type { AnatomyNode, CellModel, HumanDigitalTwinManifest, Organelle } from '../scientificWorlds/humanLab/types';
import { CANONICAL_ANATOMY_LAYER_SHELL, type CanonicalAnatomyLayerId } from '../scientificWorlds/humanLab/anatomyAtlas';
import { disposeSceneResources } from './graphics/lifecycle';
import { attachAnatomyLayerShellMetadata, resolveAnatomyLayerShell, type AnatomyLayerPresentation } from './anatomyIntegrationShell';
import { addPremiumCellMembraneDetail, addPremiumOrganSurfaceDetail } from './premiumMacroMicroDetails';

/**
 * V7 — HUMAN MACRO → MICRO VISUAL LAYER.
 *
 * This is deliberately a presentation layer INSIDE the existing AgentLabScene3D. It creates no
 * second renderer, world, anatomy manifest, evidence store or experiment. Its inputs are only:
 *   1) the canonical HumanDigitalTwinManifest (MODEL anatomy), and
 *   2) the BiologyArtifact produced by a sealed ExperimentSession.
 *
 * Every root is tagged as MODEL / NOT_DIRECT_OBSERVATION. Visual enlargement is pedagogical and is
 * never a claim that an organ/cell/DNA is physically that size in the laboratory.
 */

export type HumanMacroMicroLevel = 'body' | 'organ_system' | 'organ' | 'tissue' | 'cell' | 'organelle' | 'molecule';

export interface HumanMacroMicroState {
  readonly level: HumanMacroMicroLevel;
  readonly selectedOrganId: string | null;
  readonly selectedNodeId: string | null;
  readonly artifactKind: BiologyArtifact['kind'] | null;
  readonly evidenceLabel: 'MODEL_NOT_DIRECT_OBSERVATION';
  readonly anatomyLayers: Readonly<{
    visibleLayerIds: readonly CanonicalAnatomyLayerId[];
    selectedLayerId: CanonicalAnatomyLayerId | null;
    lod: 'LOW';
    crossSection: boolean;
    hyperscopeMagnification: number | null;
  }>;
}

/**
 * A reviewable description of this renderer's visual contract.  It is deliberately
 * separate from the epistemic label: better lighting and denser geometry do not turn
 * a pedagogical model into an observation or an anatomically validated mesh.
 */
export const HUMAN_VISUAL_QUALITY_PROFILE = Object.freeze({
  tier: 'PROCEDURAL_CINEMATIC_MODEL',
  source: 'CANONICAL_MANIFEST_OR_SEALED_ARTIFACT',
  anatomicalPrecision: 'ILLUSTRATIVE_GEOMETRY',
  palette: 'BIOMEDICAL_PBR',
  motion: 'DETERMINISTIC_SCENE_TIME',
} as const);

export function macroMicroLevelForArtifact(artifact: BiologyArtifact | null): HumanMacroMicroLevel {
  if (!artifact) return 'organ';
  if (artifact.kind === 'histology') return 'tissue';
  if (artifact.kind === 'hyperscope') return artifact.cell ? artifact.capture.request.magnification >= 500 ? 'organelle' : 'cell' : 'organ';
  if (artifact.kind === 'central-dogma') return 'molecule';
  return 'organ';
}

function organNode(manifest: HumanDigitalTwinManifest, organId: string | null): AnatomyNode | null {
  if (!organId) return null;
  return manifest.nodes.find((n) => n.id === organId && n.kind === 'ORGAN') ?? null;
}

function markModel(root: THREE_NS.Object3D, level: HumanMacroMicroLevel): void {
  root.userData.humanMacroMicro = true;
  root.userData.level = level;
  root.userData.epistemic = 'MODEL';
  root.userData.directObservation = false;
  root.userData.visualScaleNotPhysical = true;
  root.userData.visualQuality = HUMAN_VISUAL_QUALITY_PROFILE.tier;
  root.userData.sourceGeometry = HUMAN_VISUAL_QUALITY_PROFILE.source;
  root.userData.anatomicalPrecision = HUMAN_VISUAL_QUALITY_PROFILE.anatomicalPrecision;
}

function createPresentationStage(THREE: typeof THREE_NS, root: THREE_NS.Group, radius = 0.72): THREE_NS.Group {
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.04, 0.055, 64),
    new THREE.MeshPhysicalMaterial({ color: 0x07131d, roughness: 0.26, metalness: 0.72, clearcoat: 0.42, clearcoatRoughness: 0.2 }),
  );
  base.name = 'macro-stage:plinth'; base.position.y = -0.61; root.add(base);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.88, 0.012, 8, 80),
    new THREE.MeshStandardMaterial({ color: 0x80dfff, emissive: 0x2d9bc2, emissiveIntensity: 0.85, roughness: 0.26 }),
  );
  ring.name = 'macro-stage:scale-ring'; ring.rotation.x = Math.PI / 2; ring.position.y = -0.577; root.add(ring);
  const scanHalo = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.68, 0.006, 6, 72),
    new THREE.MeshBasicMaterial({ color: 0x77d7ff, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  scanHalo.name = 'macro-stage:scan-halo'; scanHalo.position.z = -0.34; root.add(scanHalo);
  const rotor = new THREE.Group(); rotor.name = 'macro-rotor'; root.add(rotor);
  return rotor;
}

function biologicalMaterial(THREE: typeof THREE_NS, color: number, options: { translucent?: boolean; emissive?: number; roughness?: number } = {}): THREE_NS.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    emissive: options.emissive ?? 0x12070a,
    emissiveIntensity: 0.08,
    roughness: options.roughness ?? 0.52,
    metalness: 0,
    clearcoat: 0.22,
    clearcoatRoughness: 0.48,
    transparent: options.translucent ?? false,
    opacity: options.translucent ? 0.36 : 0.96,
    depthWrite: !options.translucent,
  });
}

function addShadows(root: THREE_NS.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE_NS.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

function organColor(id: string): number {
  if (/heart/i.test(id)) return 0xb43a46;
  if (/brain/i.test(id)) return 0xc8a1b7;
  if (/lung/i.test(id)) return 0xc98791;
  if (/liver/i.test(id)) return 0x7c342c;
  if (/kidney/i.test(id)) return 0x824b52;
  if (/stomach|intestine|pancreas/i.test(id)) return 0xb77968;
  return 0xa76368;
}

function buildOrganModel(THREE: typeof THREE_NS, node: AnatomyNode): THREE_NS.Group {
  const root = new THREE.Group(); root.name = `macro-organ:${node.id}`;
  const rotor = createPresentationStage(THREE, root, 0.7);
  const d = node.dimensionsMeters;
  const maxD = Math.max(d.x, d.y, d.z, 1e-6);
  const displayScale = 0.72 / maxD;
  const mat = biologicalMaterial(THREE, organColor(node.id), { emissive: 0x210a0d, roughness: 0.5 });
  const organ = new THREE.Mesh(new THREE.SphereGeometry(0.5, 36, 26), mat);
  organ.name = 'organ:atlas-volume';
  organ.userData.geometryRole = 'ATLAS_DIMENSION_ELLIPSOID';
  organ.scale.set(d.x * displayScale, d.y * displayScale, d.z * displayScale);
  rotor.add(organ);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.515, 36, 26), biologicalMaterial(THREE, organColor(node.id), { translucent: true, emissive: 0x41151b, roughness: 0.3 }));
  shell.name = 'organ:scan-envelope'; shell.scale.copy(organ.scale); rotor.add(shell);
  addPremiumOrganSurfaceDetail(THREE, rotor, node.id, organ.scale);
  const contourMat = new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.35, depthWrite: false });
  for (const [axis, rotation] of [['axial', [Math.PI / 2, 0, 0]], ['coronal', [0, 0, 0]], ['sagittal', [0, Math.PI / 2, 0]]] as const) {
    const contour = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.005, 6, 72), contourMat);
    contour.name = `organ:contour:${axis}`; contour.rotation.set(rotation[0], rotation[1], rotation[2]); rotor.add(contour);
  }
  markModel(root, 'organ'); addShadows(root); return root;
}

function organelleMaterial(THREE: typeof THREE_NS, kind: Organelle['kind']): THREE_NS.MeshPhysicalMaterial {
  const color = kind === 'NUCLEUS' ? 0x7f55c8
    : kind === 'MITOCHONDRION' ? 0xf09a54
      : kind === 'MEMBRANE' ? 0x66bde8
        : kind === 'ER' ? 0x64c29c
          : kind === 'GOLGI' ? 0xe8c65c
            : kind === 'RIBOSOME' ? 0xe077b1
              : 0xa7c77e;
  return new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: kind === 'RIBOSOME' ? 0.18 : 0.07, roughness: kind === 'MEMBRANE' ? 0.24 : 0.48, clearcoat: 0.18, clearcoatRoughness: 0.45, transparent: kind === 'MEMBRANE', opacity: kind === 'MEMBRANE' ? 0.24 : 0.94, depthWrite: kind !== 'MEMBRANE' });
}

function addCellContents(THREE: typeof THREE_NS, root: THREE_NS.Group, cell: CellModel, scale = 1): void {
  const cytoplasm = new THREE.Mesh(
    new THREE.SphereGeometry(0.485 * scale, 48, 34),
    new THREE.MeshPhysicalMaterial({ color: 0x315d69, emissive: 0x102b33, emissiveIntensity: 0.13, roughness: 0.58, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  cytoplasm.name = 'cell:cytoplasm'; root.add(cytoplasm);
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.52 * scale, 48, 34),
    new THREE.MeshPhysicalMaterial({ color: 0x86def0, emissive: 0x1d6070, emissiveIntensity: 0.16, roughness: 0.22, transparent: true, opacity: 0.17, clearcoat: 0.48, clearcoatRoughness: 0.18, depthWrite: false, side: THREE.DoubleSide }),
  );
  shell.name = 'cell:membrane'; root.add(shell);
  addPremiumCellMembraneDetail(THREE, root, scale);
  // Cytoskeleton: deterministic microtubule/actin-like paths, explicitly illustrative.
  const cytoskeletonMaterial = new THREE.MeshPhysicalMaterial({ color: 0x85d5c5, emissive: 0x184b43, emissiveIntensity: 0.12, roughness: 0.38, clearcoat: 0.2 });
  for (let index = 0; index < 7; index += 1) {
    const phase = index * 0.83;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.36 * scale, Math.sin(phase) * 0.17 * scale, Math.cos(phase) * 0.14 * scale),
      new THREE.Vector3(-0.10 * scale, Math.cos(phase * 1.3) * 0.22 * scale, Math.sin(phase) * 0.20 * scale),
      new THREE.Vector3(0.14 * scale, Math.sin(phase * 1.7) * 0.18 * scale, -Math.cos(phase) * 0.18 * scale),
      new THREE.Vector3(0.37 * scale, -Math.sin(phase) * 0.15 * scale, Math.cos(phase * 1.2) * 0.12 * scale),
    ]);
    const filament = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.0045 * scale, 5, false), cytoskeletonMaterial);
    filament.name = `cell:cytoskeleton-filament:${index}`; root.add(filament);
  }
  for (const o of cell.organelles) {
    if (o.kind === 'MEMBRANE') continue;
    const mat = organelleMaterial(THREE, o.kind);
    const radius = o.kind === 'NUCLEUS' ? 0.17 : Math.max(0.022, Math.min(0.078, o.scaleNormalized * 0.34));
    const geo = o.kind === 'MITOCHONDRION' ? new THREE.CapsuleGeometry(radius * 0.58, radius * 1.7, 6, 14)
      : o.kind === 'ER' || o.kind === 'GOLGI' ? new THREE.TorusGeometry(radius * 1.45, radius * 0.25, 6, 22)
        : new THREE.SphereGeometry(radius, 20, 15);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `cell:organelle:${o.kind.toLowerCase()}:${o.id}`;
    mesh.position.set((o.positionNormalized.x - 0.5) * 0.74 * scale, (o.positionNormalized.y - 0.5) * 0.74 * scale, (o.positionNormalized.z - 0.5) * 0.74 * scale);
    if (o.kind === 'MITOCHONDRION') mesh.rotation.set(o.positionNormalized.z * Math.PI, o.positionNormalized.x * Math.PI, Math.PI / 2);
    else if (o.kind === 'ER' || o.kind === 'GOLGI') mesh.rotation.set(Math.PI / 2, o.positionNormalized.y * Math.PI, 0);
    root.add(mesh);
    if (o.kind === 'NUCLEUS') {
      const nucleolus = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.3, 14, 10), biologicalMaterial(THREE, 0xb885e6, { emissive: 0x381c5b, roughness: 0.44 }));
      nucleolus.name = 'cell:nucleolus:illustrative'; nucleolus.position.copy(mesh.position).add(new THREE.Vector3(radius * 0.25, radius * 0.12, radius * 0.15)); root.add(nucleolus);
    }
  }
  // Membrane proteins make the CELL view visually distinct from a transparent sphere.
  const channelMaterial = new THREE.MeshPhysicalMaterial({ color: 0x9de6ff, emissive: 0x245a70, emissiveIntensity: 0.16, roughness: 0.34, clearcoat: 0.3 });
  for (let index = 0; index < 12; index += 1) {
    const phi = Math.acos(1 - 2 * (index + 0.5) / 12); const theta = index * 2.399963229728653;
    const normal = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    const channel = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * scale, 0.012 * scale, 0.055 * scale, 8), channelMaterial);
    channel.name = `cell:membrane-channel:${index}`; channel.position.copy(normal).multiplyScalar(0.515 * scale);
    channel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal); root.add(channel);
  }
}

function buildTissueModel(THREE: typeof THREE_NS, cell: CellModel): THREE_NS.Group {
  const root = new THREE.Group(); root.name = `macro-tissue:${cell.tissueType}`;
  const rotor = createPresentationStage(THREE, root, 0.82);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.13, 0.92, 8, 2, 6), biologicalMaterial(THREE, 0x7f3d52, { emissive: 0x260d17, roughness: 0.66 }));
  slab.name = 'tissue:extracellular-matrix'; rotor.add(slab);
  const sectionFace = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.018, 0.86), biologicalMaterial(THREE, 0xb96a84, { translucent: true, emissive: 0x461426, roughness: 0.42 }));
  sectionFace.name = 'tissue:cross-section-surface'; sectionFace.position.y = 0.078; rotor.add(sectionFace);
  // The repeated cells reuse the ACTUAL canonical CellModel organelle layout; only their placement in
  // this pedagogical tissue tile is illustrative and is explicitly tagged as such on the root.
  const positions: Array<[number, number, number]> = [[-0.42, 0.12, -0.22], [0, 0.13, -0.2], [0.42, 0.12, -0.18], [-0.22, 0.12, 0.23], [0.28, 0.12, 0.24]];
  for (const [i, p] of positions.entries()) {
    const cellRoot = new THREE.Group(); cellRoot.position.set(...p); cellRoot.scale.setScalar(0.27 + (i % 2) * 0.025);
    cellRoot.name = `tissue:cell:${i}`; addCellContents(THREE, cellRoot, cell); rotor.add(cellRoot);
  }
  const fiberMat = new THREE.MeshStandardMaterial({ color: 0xe5a8bb, emissive: 0x35101b, emissiveIntensity: 0.12, roughness: 0.62 });
  for (let i = 0; i < 6; i += 1) {
    const z = -0.34 + i * 0.135;
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.64, 0.11, z), new THREE.Vector3(-0.22, 0.17 + (i % 2) * 0.025, z + 0.035), new THREE.Vector3(0.2, 0.12, z - 0.025), new THREE.Vector3(0.64, 0.16, z)]);
    const fiber = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.009, 5, false), fiberMat); fiber.name = `tissue:matrix-fiber:${i}`; rotor.add(fiber);
  }
  // Paired capillary-like channels establish a tissue-scale transport network;
  // this remains illustrative geometry and carries no perfusion measurement.
  for (const [index, color, z] of [[0, 0xbe3048, -0.31], [1, 0x316fba, 0.31]] as const) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.68, 0.035, z), new THREE.Vector3(-0.22, 0.055, z + 0.04),
      new THREE.Vector3(0.24, 0.03, z - 0.025), new THREE.Vector3(0.68, 0.05, z),
    ]);
    const vessel = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.026, 10, false), new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: 0.09, roughness: 0.34, clearcoat: 0.28 }));
    vessel.name = `tissue:capillary-model:${index}`; rotor.add(vessel);
  }
  markModel(root, 'tissue'); addShadows(root); return root;
}

function buildCellModelVisual(THREE: typeof THREE_NS, cell: CellModel): THREE_NS.Group {
  const root = new THREE.Group(); root.name = `macro-cell:${cell.cellId}`; const rotor = createPresentationStage(THREE, root, 0.78); addCellContents(THREE, rotor, cell, 1.25);
  markModel(root, 'cell'); addShadows(root); return root;
}

function buildOrganelleModel(THREE: typeof THREE_NS, cell: CellModel): THREE_NS.Group {
  const root = new THREE.Group(); root.name = `macro-organelle:${cell.cellId}`;
  const rotor = createPresentationStage(THREE, root, 0.82);
  const focus = cell.organelles.find((o) => o.kind === 'MITOCHONDRION') ?? cell.organelles.find((o) => o.kind !== 'MEMBRANE') ?? null;
  if (!focus) { markModel(root, 'organelle'); return root; }
  const mat = organelleMaterial(THREE, focus.kind);
  if (focus.kind === 'MITOCHONDRION') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.82, 10, 28), mat); body.name = 'organelle:mitochondrion-outer-membrane'; body.rotation.z = Math.PI / 2; rotor.add(body);
    const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.75, 10, 28), biologicalMaterial(THREE, 0xc95e38, { translucent: true, emissive: 0x512014, roughness: 0.38 })); inner.name = 'organelle:mitochondrion-inner-volume'; inner.rotation.z = Math.PI / 2; rotor.add(inner);
    // Cristae-like curves are a visual convention, not molecular ultrastructure data.
    for (let i = -3; i <= 3; i += 1) {
      const y = i * 0.08;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.28, y, 0), new THREE.Vector3(-0.12, y + 0.06, 0.04), new THREE.Vector3(0.02, y - 0.05, -0.03), new THREE.Vector3(0.25, y + 0.03, 0),
      ]);
      const crista = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.012, 6, false), new THREE.MeshStandardMaterial({ color: 0xffd3a8, emissive: 0xf09a54, emissiveIntensity: 0.15, roughness: 0.5 })); crista.name = `organelle:crista:${i + 3}`; rotor.add(crista);
    }
    const matrixParticles = new THREE.Group(); matrixParticles.name = 'organelle:matrix-granules';
    for (let index = 0; index < 18; index += 1) {
      const granule = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), biologicalMaterial(THREE, 0xffddb8, { emissive: 0x6b351f, roughness: 0.58 }));
      granule.position.set(-0.32 + (index % 6) * 0.125, -0.14 + Math.floor(index / 6) * 0.14, Math.sin(index * 1.7) * 0.09); matrixParticles.add(granule);
    }
    rotor.add(matrixParticles);
  } else {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 40, 30), mat); body.name = `organelle:${focus.kind.toLowerCase()}`; rotor.add(body);
  }
  markModel(root, 'organelle'); addShadows(root); return root;
}

const BASE_COLORS: Readonly<Record<string, number>> = { A: 0x58b9ff, T: 0xff6b91, G: 0x6ee7a7, C: 0xffc45c };

function buildMoleculeModel(THREE: typeof THREE_NS, artifact: Extract<BiologyArtifact, { kind: 'central-dogma' }>): THREE_NS.Group {
  const root = new THREE.Group(); root.name = `macro-dna:${artifact.report.contentHash.slice(0, 12)}`;
  const rotor = createPresentationStage(THREE, root, 0.82);
  const dna = artifact.report.dna;
  const samples = Math.max(6, Math.min(48, dna.length));
  const left: THREE_NS.Vector3[] = []; const right: THREE_NS.Vector3[] = [];
  const radius = 0.42; const height = 1.55;
  const basePairGeometry = new THREE.CylinderGeometry(0.011, 0.011, radius * 2, 8);
  const nucleotideGeometry = new THREE.SphereGeometry(0.024, 10, 8);
  const backboneNodeGeometry = new THREE.SphereGeometry(0.038, 12, 9);
  const basePairMaterials: Record<string, THREE_NS.MeshStandardMaterial> = {};
  const nucleotideMaterials: Record<string, THREE_NS.MeshPhysicalMaterial> = {};
  const basePairMaterial = (base: string) => basePairMaterials[base] ??= new THREE.MeshStandardMaterial({ color: BASE_COLORS[base] ?? 0xd9e5f2, emissive: BASE_COLORS[base] ?? 0xd9e5f2, emissiveIntensity: 0.08, roughness: 0.48 });
  const nucleotideMaterial = (base: string) => nucleotideMaterials[base] ??= biologicalMaterial(THREE, BASE_COLORS[base] ?? 0xd9e5f2, { emissive: BASE_COLORS[base] ?? 0xd9e5f2, roughness: 0.36 });
  const backboneMaterials = {
    a: biologicalMaterial(THREE, 0x9fddff, { emissive: 0x9fddff, roughness: 0.34 }),
    b: biologicalMaterial(THREE, 0xffa2b9, { emissive: 0xffa2b9, roughness: 0.34 }),
  };
  for (let i = 0; i < samples; i += 1) {
    const srcIndex = Math.min(dna.length - 1, Math.floor((i / Math.max(1, samples - 1)) * Math.max(0, dna.length - 1)));
    const base = dna[srcIndex] ?? 'A';
    const t = i / Math.max(1, samples - 1); const y = (t - 0.5) * height; const angle = t * Math.PI * 6.2;
    const a = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    const b = new THREE.Vector3(-a.x, y, -a.z); left.push(a); right.push(b);
    const midpoint = a.clone().add(b).multiplyScalar(0.5);
    const direction = b.clone().sub(a).normalize();
    const rod = new THREE.Mesh(basePairGeometry, basePairMaterial(base));
    rod.name = `dna:base-pair:${i}:${base}`; rod.position.copy(midpoint); rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction); rotor.add(rod);
    if (i % 2 === 0) {
      for (const [strand, p] of [['a', a], ['b', b]] as const) {
        const bead = new THREE.Mesh(backboneNodeGeometry, backboneMaterials[strand]); bead.name = `dna:backbone-node:${strand}:${i}`; bead.position.copy(p); rotor.add(bead);
      }
    }
    const pairedBase = new THREE.Mesh(nucleotideGeometry, nucleotideMaterial(base));
    pairedBase.name = `dna:nucleotide:${i}:${base}`; pairedBase.position.copy(a).lerp(b, 0.34); rotor.add(pairedBase);
  }
  const backboneA = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(left), 160, 0.028, 8, false), new THREE.MeshStandardMaterial({ color: 0x66baff, emissive: 0x274e78, emissiveIntensity: 0.18, roughness: 0.4 }));
  const backboneB = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(right), 160, 0.028, 8, false), new THREE.MeshStandardMaterial({ color: 0xff7097, emissive: 0x78344a, emissiveIntensity: 0.18, roughness: 0.4 }));
  backboneA.name = 'dna:backbone:a'; backboneB.name = 'dna:backbone:b'; rotor.add(backboneA, backboneB);

  // Translation product: actual peptide string from the canonical central-dogma report, rendered as
  // a bounded bead chain. No 3D protein fold is invented here.
  const peptide = artifact.report.translation.peptide;
  const peptideGroup = new THREE.Group(); peptideGroup.position.set(0, -1.0, 0);
  const shown = Math.min(24, peptide.length);
  const peptideGeometry = new THREE.SphereGeometry(0.045, 12, 9);
  const peptideMaterial = new THREE.MeshStandardMaterial({ color: 0xb4e081, roughness: 0.55 });
  for (let i = 0; i < shown; i += 1) {
    const bead = new THREE.Mesh(peptideGeometry, peptideMaterial);
    bead.position.set((i - (shown - 1) / 2) * 0.095, Math.sin(i * 0.7) * 0.06, 0); peptideGroup.add(bead);
  }
  peptideGroup.name = 'dna:translation-product'; rotor.add(peptideGroup);
  markModel(root, 'molecule'); addShadows(root); return root;
}

/** One owner-managed group, embedded into the existing biology scene. */
export class HumanMacroMicroLayer {
  readonly group: THREE_NS.Group;
  private content: THREE_NS.Group | null = null;
  private selectedOrganId: string | null = null;
  private selectedNodeId: string | null = 'body';
  private artifact: BiologyArtifact | null = null;
  private time = 0;
  private anatomyLayers: readonly AnatomyLayerPresentation[];

  constructor(private readonly THREE: typeof THREE_NS, private readonly manifest: HumanDigitalTwinManifest) {
    this.group = new THREE.Group(); this.group.name = 'genesis-human-macro-micro-layer'; this.group.visible = false;
    this.group.userData.presentationOnly = true; this.group.userData.epistemic = 'MODEL'; this.group.userData.directObservation = false;
    this.anatomyLayers = resolveAnatomyLayerShell(manifest);
    attachAnatomyLayerShellMetadata(this.group, this.anatomyLayers);
  }

  getAnatomyLayerShell(): readonly AnatomyLayerPresentation[] { return this.anatomyLayers; }

  getState(): HumanMacroMicroState {
    const node = this.manifest.nodes.find((entry) => entry.id === this.selectedNodeId);
    const level = this.artifact ? macroMicroLevelForArtifact(this.artifact) : node?.kind === 'SYSTEM' ? 'organ_system' : this.selectedOrganId ? 'organ' : 'body';
    const active = this.anatomyLayers.filter((layer) => layer.visible);
    return {
      level,
      selectedNodeId: this.selectedNodeId,
      selectedOrganId: this.selectedOrganId,
      artifactKind: this.artifact?.kind ?? null,
      evidenceLabel: 'MODEL_NOT_DIRECT_OBSERVATION',
      anatomyLayers: {
        visibleLayerIds: active.map((layer) => layer.id),
        selectedLayerId: this.anatomyLayers.find((layer) => layer.selected)?.id ?? null,
        lod: 'LOW',
        crossSection: this.anatomyLayers.some((layer) => layer.crossSection.enabled),
        hyperscopeMagnification: this.artifact?.kind === 'hyperscope' ? this.artifact.capture.request.magnification : null,
      },
    };
  }

  setOrgan(organId: string | null): void {
    this.selectedNodeId = this.manifest.nodes.find((entry) => entry.id === organId)?.id ?? null;
    this.selectedOrganId = organNode(this.manifest, organId)?.id ?? null;
    // New organ selection starts at the organ view until an experiment artifact is delivered.
    this.artifact = null; this.rebuild();
  }

  setArtifact(artifact: BiologyArtifact | null): void {
    this.artifact = artifact; this.rebuild();
  }

  private replace(next: THREE_NS.Group | null): void {
    if (this.content) { this.group.remove(this.content); disposeSceneResources(this.content); }
    this.content = next;
    if (next) { attachAnatomyLayerShellMetadata(next, this.anatomyLayers); this.group.add(next); }
    this.group.visible = next !== null;
  }

  private rebuild(): void {
    this.refreshAnatomyLayers();
    const artifact = this.artifact;
    if (artifact?.kind === 'histology') { this.replace(buildTissueModel(this.THREE, artifact.cell)); return; }
    if (artifact?.kind === 'hyperscope' && artifact.cell) {
      this.replace(artifact.capture.request.magnification >= 500 ? buildOrganelleModel(this.THREE, artifact.cell) : buildCellModelVisual(this.THREE, artifact.cell)); return;
    }
    if (artifact?.kind === 'central-dogma') { this.replace(buildMoleculeModel(this.THREE, artifact)); return; }
    const organ = organNode(this.manifest, this.selectedOrganId);
    this.replace(organ ? buildOrganModel(this.THREE, organ) : null);
  }

  private refreshAnatomyLayers(): void {
    const node = this.manifest.nodes.find((entry) => entry.id === this.selectedNodeId);
    const systemLayer = node?.kind === 'SYSTEM'
      ? CANONICAL_ANATOMY_LAYER_SHELL.find((layer) => layer.system === node.system)?.id ?? null
      : null;
    const selectedLayerId: CanonicalAnatomyLayerId = this.selectedOrganId ? 'layer:organs' : systemLayer ?? 'layer:skin';
    const magnification = this.artifact?.kind === 'hyperscope' ? this.artifact.capture.request.magnification : null;
    this.anatomyLayers = resolveAnatomyLayerShell(this.manifest, {
      visibleLayerIds: [selectedLayerId],
      isolatedLayerId: selectedLayerId,
      selectedLayerId,
      lod: 'LOW',
      crossSection: { enabled: this.artifact?.kind === 'histology', axis: 'AXIAL', positionNormalized: 0.5 },
      hyperscopeMagnification: magnification,
    });
    attachAnatomyLayerShellMetadata(this.group, this.anatomyLayers);
  }

  update(dt: number): void {
    this.time += Math.max(0, Math.min(0.1, dt));
    if (!this.content) return;
    // Slow museum-like rotation: presentation only, deterministic for the same elapsed time.
    const rotor = this.content.getObjectByName('macro-rotor');
    if (rotor) rotor.rotation.y = this.time * 0.22;
  }

  dispose(): void {
    this.replace(null);
    this.group.removeFromParent();
  }
}
