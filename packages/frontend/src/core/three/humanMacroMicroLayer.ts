import type * as THREE_NS from 'three';
import type { BiologyArtifact } from '../scientificWorlds/biologyRunners';
import type { AnatomyNode, CellModel, HumanDigitalTwinManifest, Organelle } from '../scientificWorlds/humanLab/types';
import { disposeSceneResources } from './graphics/lifecycle';

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
}

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
  const d = node.dimensionsMeters;
  const maxD = Math.max(d.x, d.y, d.z, 1e-6);
  const displayScale = 0.72 / maxD;
  const mat = new THREE.MeshPhysicalMaterial({ color: organColor(node.id), roughness: 0.48, metalness: 0, clearcoat: 0.18, clearcoatRoughness: 0.55 });
  const organ = new THREE.Mesh(new THREE.SphereGeometry(0.5, 36, 26), mat);
  organ.scale.set(d.x * displayScale, d.y * displayScale, d.z * displayScale);
  root.add(organ);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x8fd3ff, emissive: 0x4ab7ff, emissiveIntensity: 0.7, transparent: true, opacity: 0.55, roughness: 0.3 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.012, 8, 64), ringMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = -0.44; root.add(ring);
  markModel(root, 'organ'); addShadows(root); return root;
}

function organelleMaterial(THREE: typeof THREE_NS, kind: Organelle['kind']): THREE_NS.MeshStandardMaterial {
  const color = kind === 'NUCLEUS' ? 0x7f55c8
    : kind === 'MITOCHONDRION' ? 0xf09a54
      : kind === 'MEMBRANE' ? 0x66bde8
        : kind === 'ER' ? 0x64c29c
          : kind === 'GOLGI' ? 0xe8c65c
            : kind === 'RIBOSOME' ? 0xe077b1
              : 0xa7c77e;
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: kind === 'RIBOSOME' ? 0.18 : 0.08, roughness: 0.5, transparent: kind === 'MEMBRANE', opacity: kind === 'MEMBRANE' ? 0.28 : 0.92 });
}

function addCellContents(THREE: typeof THREE_NS, root: THREE_NS.Group, cell: CellModel, scale = 1): void {
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.52 * scale, 40, 30),
    new THREE.MeshPhysicalMaterial({ color: 0x7fc7dd, roughness: 0.32, transmission: 0, transparent: true, opacity: 0.15, clearcoat: 0.35, depthWrite: false }),
  );
  root.add(shell);
  for (const o of cell.organelles) {
    const mat = organelleMaterial(THREE, o.kind);
    const radius = o.kind === 'NUCLEUS' ? 0.16 : Math.max(0.018, Math.min(0.075, o.scaleNormalized * 0.32));
    const geo = o.kind === 'MITOCHONDRION'
      ? new THREE.CapsuleGeometry(radius * 0.55, radius * 1.6, 5, 10)
      : new THREE.SphereGeometry(radius, 18, 14);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((o.positionNormalized.x - 0.5) * 0.74 * scale, (o.positionNormalized.y - 0.5) * 0.74 * scale, (o.positionNormalized.z - 0.5) * 0.74 * scale);
    if (o.kind === 'MITOCHONDRION') mesh.rotation.z = Math.PI / 2;
    root.add(mesh);
  }
}

function buildTissueModel(THREE: typeof THREE_NS, cell: CellModel): THREE_NS.Group {
  const root = new THREE.Group(); root.name = `macro-tissue:${cell.tissueType}`;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.16, 0.92), new THREE.MeshPhysicalMaterial({ color: 0xd69bad, roughness: 0.72, clearcoat: 0.08 }));
  root.add(slab);
  // The repeated cells reuse the ACTUAL canonical CellModel organelle layout; only their placement in
  // this pedagogical tissue tile is illustrative and is explicitly tagged as such on the root.
  const positions: Array<[number, number, number]> = [[-0.42, 0.12, -0.22], [0, 0.13, -0.2], [0.42, 0.12, -0.18], [-0.22, 0.12, 0.23], [0.28, 0.12, 0.24]];
  for (const [i, p] of positions.entries()) {
    const cellRoot = new THREE.Group(); cellRoot.position.set(...p); cellRoot.scale.setScalar(0.27 + (i % 2) * 0.025);
    addCellContents(THREE, cellRoot, cell); root.add(cellRoot);
  }
  markModel(root, 'tissue'); addShadows(root); return root;
}

function buildCellModelVisual(THREE: typeof THREE_NS, cell: CellModel): THREE_NS.Group {
  const root = new THREE.Group(); root.name = `macro-cell:${cell.cellId}`; addCellContents(THREE, root, cell, 1.25);
  markModel(root, 'cell'); addShadows(root); return root;
}

function buildOrganelleModel(THREE: typeof THREE_NS, cell: CellModel): THREE_NS.Group {
  const root = new THREE.Group(); root.name = `macro-organelle:${cell.cellId}`;
  const focus = cell.organelles.find((o) => o.kind === 'MITOCHONDRION') ?? cell.organelles.find((o) => o.kind !== 'MEMBRANE') ?? null;
  if (!focus) { markModel(root, 'organelle'); return root; }
  const mat = organelleMaterial(THREE, focus.kind);
  if (focus.kind === 'MITOCHONDRION') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.82, 10, 24), mat); body.rotation.z = Math.PI / 2; root.add(body);
    // Cristae-like curves are a visual convention, not molecular ultrastructure data.
    for (let i = -3; i <= 3; i += 1) {
      const y = i * 0.08;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.28, y, 0), new THREE.Vector3(-0.12, y + 0.06, 0.04), new THREE.Vector3(0.02, y - 0.05, -0.03), new THREE.Vector3(0.25, y + 0.03, 0),
      ]);
      root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.012, 6, false), new THREE.MeshStandardMaterial({ color: 0xffd3a8, emissive: 0xf09a54, emissiveIntensity: 0.15, roughness: 0.5 })));
    }
  } else {
    root.add(new THREE.Mesh(new THREE.SphereGeometry(0.46, 40, 30), mat));
  }
  markModel(root, 'organelle'); addShadows(root); return root;
}

const BASE_COLORS: Readonly<Record<string, number>> = { A: 0x58b9ff, T: 0xff6b91, G: 0x6ee7a7, C: 0xffc45c };

function buildMoleculeModel(THREE: typeof THREE_NS, artifact: Extract<BiologyArtifact, { kind: 'central-dogma' }>): THREE_NS.Group {
  const root = new THREE.Group(); root.name = `macro-dna:${artifact.report.contentHash.slice(0, 12)}`;
  const dna = artifact.report.dna;
  const samples = Math.max(6, Math.min(48, dna.length));
  const left: THREE_NS.Vector3[] = []; const right: THREE_NS.Vector3[] = [];
  const radius = 0.42; const height = 1.55;
  for (let i = 0; i < samples; i += 1) {
    const srcIndex = Math.min(dna.length - 1, Math.floor((i / Math.max(1, samples - 1)) * Math.max(0, dna.length - 1)));
    const base = dna[srcIndex] ?? 'A';
    const t = i / Math.max(1, samples - 1); const y = (t - 0.5) * height; const angle = t * Math.PI * 6.2;
    const a = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    const b = new THREE.Vector3(-a.x, y, -a.z); left.push(a); right.push(b);
    if (i % 2 === 0) {
      const midpoint = a.clone().add(b).multiplyScalar(0.5);
      const distance = a.distanceTo(b);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, distance, 8), new THREE.MeshStandardMaterial({ color: BASE_COLORS[base] ?? 0xd9e5f2, roughness: 0.5 }));
      rod.position.copy(midpoint); rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); root.add(rod);
    }
  }
  const backboneA = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(left), 160, 0.028, 8, false), new THREE.MeshStandardMaterial({ color: 0x66baff, emissive: 0x274e78, emissiveIntensity: 0.18, roughness: 0.4 }));
  const backboneB = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(right), 160, 0.028, 8, false), new THREE.MeshStandardMaterial({ color: 0xff7097, emissive: 0x78344a, emissiveIntensity: 0.18, roughness: 0.4 }));
  root.add(backboneA, backboneB);

  // Translation product: actual peptide string from the canonical central-dogma report, rendered as
  // a bounded bead chain. No 3D protein fold is invented here.
  const peptide = artifact.report.translation.peptide;
  const peptideGroup = new THREE.Group(); peptideGroup.position.set(0, -1.0, 0);
  const shown = Math.min(24, peptide.length);
  for (let i = 0; i < shown; i += 1) {
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 9), new THREE.MeshStandardMaterial({ color: 0xb4e081, roughness: 0.55 }));
    bead.position.set((i - (shown - 1) / 2) * 0.095, Math.sin(i * 0.7) * 0.06, 0); peptideGroup.add(bead);
  }
  root.add(peptideGroup);
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

  constructor(private readonly THREE: typeof THREE_NS, private readonly manifest: HumanDigitalTwinManifest) {
    this.group = new THREE.Group(); this.group.name = 'genesis-human-macro-micro-layer'; this.group.visible = false;
    this.group.userData.presentationOnly = true; this.group.userData.epistemic = 'MODEL'; this.group.userData.directObservation = false;
  }

  getState(): HumanMacroMicroState {
    const node = this.manifest.nodes.find((entry) => entry.id === this.selectedNodeId);
    const level = this.artifact ? macroMicroLevelForArtifact(this.artifact) : node?.kind === 'SYSTEM' ? 'organ_system' : this.selectedOrganId ? 'organ' : 'body';
    return { level, selectedNodeId: this.selectedNodeId, selectedOrganId: this.selectedOrganId, artifactKind: this.artifact?.kind ?? null, evidenceLabel: 'MODEL_NOT_DIRECT_OBSERVATION' };
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
    if (next) this.group.add(next);
    this.group.visible = next !== null;
  }

  private rebuild(): void {
    const artifact = this.artifact;
    if (artifact?.kind === 'histology') { this.replace(buildTissueModel(this.THREE, artifact.cell)); return; }
    if (artifact?.kind === 'hyperscope' && artifact.cell) {
      this.replace(artifact.capture.request.magnification >= 500 ? buildOrganelleModel(this.THREE, artifact.cell) : buildCellModelVisual(this.THREE, artifact.cell)); return;
    }
    if (artifact?.kind === 'central-dogma') { this.replace(buildMoleculeModel(this.THREE, artifact)); return; }
    const organ = organNode(this.manifest, this.selectedOrganId);
    this.replace(organ ? buildOrganModel(this.THREE, organ) : null);
  }

  update(dt: number): void {
    this.time += Math.max(0, Math.min(0.1, dt));
    if (!this.content) return;
    // Slow museum-like rotation: presentation only, deterministic for the same elapsed time.
    this.content.rotation.y = this.time * 0.22;
  }

  dispose(): void {
    this.replace(null);
    this.group.removeFromParent();
  }
}
