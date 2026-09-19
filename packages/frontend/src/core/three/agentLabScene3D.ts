import type * as THREE_NS from 'three';
import type { PostProcessingModules, PostProcessor, Sim3D } from './types';
import type { SimParams } from '../types';
import { buildCharacter, type Character } from './characterRig';
import { createBench, createCabinet, createMonitor, createShelfUnit } from './graphics/labKit';
import { createGlassChamber, createPipe, createPlatform } from './graphics/primitives';
import { createConduitRun, createElectricalCabinet } from './graphics/electricalKit';
import { createWallSign } from './graphics/signageKit';
import { createGenesisMaterialPalette, createEmissiveInstrumentMaterial, createScientificGlass, createScreenMaterial, makeReadoutSurface, type GenesisMaterialPalette } from './graphics/materials';
import { createBackgroundFill, createHeroLight, createKeyLight, createPracticalLight } from './graphics/lighting';
import { createDustMotes, createLightShaft, type DustMotesHandle } from './graphics/atmosphere';
import { setupGraphicsPipeline, type GraphicsPipeline } from './graphics/postProcessing';
import { applyShadowPolicy } from './graphics/shadowPolicy';
import { disposeSceneResources } from './graphics/lifecycle';
import { detectRenderTier, recommendedShadowMapSize, tierAllowsBloom } from './quality';
import { configureCinematicCamera } from './graphics/cinematicCamera';
import type { AgentController, AgentUpdate } from '../scientificWorlds/agentController';
import type { LabStation } from '../scientificWorlds/labWorld';
import type { LabArtifact } from '../scientificWorlds/experimentRunners';
import type { RoomBounds } from './firstPersonController';
import type { BiologyArtifact } from '../scientificWorlds/biologyRunners';
import type { ExperimentSession } from '../scientificWorlds/experimentSession';
import { BIOLOGY_SCENE, TWIN_CHAMBER } from '../scientificWorlds/biologyLabWorld';
import { createHumanDigitalTwinManifest } from '../scientificWorlds/humanLab/anatomyAtlas';
import { buildVisualLayerInstruction, type VisualLayerInstruction } from '../scientificWorlds/humanLab/visualModes';
import type { HumanDigitalTwinManifest } from '../scientificWorlds/humanLab/types';
import { createEpoxyFloor, createGlassCurtainWall, createHoloPanel, createLayeredCeiling, createManipulatorArm, createMezzanine, createTextSign, createTwinChamber, createTwinProxy, kelvinToColor, lumensToIntensity, type ManipulatorHandle, type TwinHandle } from './biologyLabKit';
import { evaluateVisualReality, type VisualRealityResult } from './graphics/visualRealityGate';
import { buildBiologyStation, drawBiologyArtifact, drawBiologyIdle, drawEvidenceWall, buildBiologyArtifact3D, type Readout } from './biologyStationKit';

/**
 * SCIENTIFIC WORLDS — THE AGENT LABORATORY (Sim3D).
 *
 * A first-person laboratory built from the Genesis Graphics Engine's own
 * kits (materials palette, lab/electrical/signage kits, primitives, lighting
 * roles, atmosphere, post pipeline) around the typed lab world definition:
 * every station the command parser knows is a real piece of furniture
 * here, at the same coordinates the navigation planner walks to. The suited
 * character is driven by the pure AgentController; this class only READS
 * its pose. Two cameras: VISOR (through the helmet glass, body and hands in
 * frame) and SPECTATOR (a follow camera behind the agent). Session
 * artifacts are rendered at the station that produced them — a lattice in
 * the synthesizer chamber, tracks in the collider hologram, the SEIR curve
 * on the epidemiology desk — from the sealed session's payload, never from
 * a second run.
 */

export type AgentCameraMode = 'VISOR' | 'SPECTATOR';
/** Which typed world the scene builds: the physics lab (default) or the V3 human-biology lab — one scene class, one pipeline. */
export type SceneWorld = 'physics' | 'biology';
export type SceneArtifact = LabArtifact | BiologyArtifact;
const BIOLOGY_KINDS: ReadonlySet<string> = new Set(['physiology', 'neuro', 'hyperscope', 'histology', 'imaging', 'orpheus']);
/** The twin id is fixed so the manifest (and every hash derived from it) is the same on every load. */
export const TWIN_ID = 'HDT-genesis-human-biology-lab';

export const AGENT_STATE_CODE: Readonly<Record<string, number>> = { IDLE: 0, MOVING_TO_TARGET: 1, ARRIVED: 2, ALIGNING: 3, REACHING: 4, INTERACTING: 5, EXECUTING: 6, OBSERVING: 7, REPORTING: 8, RETURNING: 9, BLOCKED: 10 };

interface StationVisual {
  readonly station: LabStation;
  readonly group: THREE_NS.Group;
  readonly statusMaterial: THREE_NS.MeshStandardMaterial;
  readonly light: THREE_NS.PointLight;
  readonly screen?: Readout;
  artifactGroup: THREE_NS.Group | null;
  /** Biology stations: robotic arms, where a 3D artifact is parented, LED strips, the table twin. */
  readonly arms?: readonly ManipulatorHandle[];
  readonly artifactAnchor?: THREE_NS.Group;
  readonly leds?: readonly THREE_NS.MeshStandardMaterial[];
  readonly twin?: TwinHandle;
}

const FLOOR_Y = 0;
const CEILING_Y = 3.6;

export class AgentLabScene3D implements Sim3D {
  disableOrbitControls = true;
  private THREE: typeof THREE_NS | null = null;
  private scene: THREE_NS.Scene | null = null;
  private character: Character | null = null;
  private stations = new Map<string, StationVisual>();
  private dust: DustMotesHandle | null = null;
  private beacons: THREE_NS.MeshStandardMaterial[] = [];
  private pipeline: GraphicsPipeline | null = null;
  private cameraMode: AgentCameraMode = 'VISOR';
  private time = 0;
  private frames = 0;
  private lastUpdate: AgentUpdate | null = null;
  private highlightId: string | null = null;
  private scratchA: THREE_NS.Vector3 | null = null;
  private scratchB: THREE_NS.Vector3 | null = null;
  private spectatorPos: THREE_NS.Vector3 | null = null;
  private spectatorLook: THREE_NS.Vector3 | null = null;
  private onUpdate: ((u: AgentUpdate) => void) | null = null;
  private ceilingY = CEILING_Y;
  private twins: TwinHandle[] = [];
  private arms: ManipulatorHandle[] = [];
  private spinners: THREE_NS.Object3D[] = [];
  private chamberRing: THREE_NS.MeshStandardMaterial | null = null;
  private sealedSessions: ExperimentSession[] = [];
  private twinInstruction: VisualLayerInstruction | null = null;
  private renderer: THREE_NS.WebGLRenderer | null = null;
  private lastWall: number | null = null;
  private gate: VisualRealityResult | null = null;
  readonly manifest: HumanDigitalTwinManifest = createHumanDigitalTwinManifest(TWIN_ID);

  constructor(private readonly controller: AgentController, private readonly stationDefs: readonly LabStation[], private readonly room: RoomBounds, private readonly world: SceneWorld = 'physics') {}

  getWorld(): SceneWorld { return this.world; }

  /** Biology: apply a V3 anatomy display mode to every twin in the scene (the chamber twin and the table twin). */
  setTwinView(mode: Parameters<typeof buildVisualLayerInstruction>[1], selectedNodeId: string | null): void {
    this.twinInstruction = buildVisualLayerInstruction(this.manifest, mode);
    for (const t of this.twins) t.setView(this.twinInstruction, selectedNodeId);
  }

  /** Biology: the evidence wall lists the sessions sealed in this world — nothing else ever appears on it. */
  noteSealedSession(session: ExperimentSession): void {
    if (!this.sealedSessions.some((s) => s.sessionId === session.sessionId)) this.sealedSessions.push(session);
    const wall = this.stations.get('station:evidence');
    if (wall?.screen) drawEvidenceWall(wall.screen, this.sealedSessions);
  }

  setUpdateListener(listener: ((u: AgentUpdate) => void) | null): void { this.onUpdate = listener; }
  setCameraMode(mode: AgentCameraMode): void { this.cameraMode = mode; }
  getCameraMode(): AgentCameraMode { return this.cameraMode; }
  setHighlight(stationId: string | null): void { this.highlightId = stationId; }

  /** Renders THIS session's payload at its station; `null` clears it. */
  setArtifact(stationId: string, artifact: SceneArtifact | null): void {
    if (artifact && BIOLOGY_KINDS.has(artifact.kind)) { this.setBiologyArtifact(stationId, artifact as BiologyArtifact); return; }
    this.setPhysicsArtifact(stationId, artifact as LabArtifact | null);
  }

  private setBiologyArtifact(stationId: string, artifact: BiologyArtifact): void {
    const THREE = this.THREE; const v = this.stations.get(stationId);
    if (!THREE || !v) return;
    if (v.artifactGroup) { v.artifactGroup.parent?.remove(v.artifactGroup); disposeSceneResources(v.artifactGroup as unknown as THREE_NS.Scene); v.artifactGroup = null; }
    if (v.screen) drawBiologyArtifact(v.screen, artifact, this.manifest);
    const g = buildBiologyArtifact3D(THREE, artifact);
    if (g && v.artifactAnchor) { v.artifactAnchor.add(g); v.artifactGroup = g; }
  }

  private setPhysicsArtifact(stationId: string, artifact: LabArtifact | null): void {
    const THREE = this.THREE; const v = this.stations.get(stationId);
    if (!THREE || !v) return;
    if (v.artifactGroup) { disposeSceneResources(v.artifactGroup); v.group.remove(v.artifactGroup); v.artifactGroup = null; }
    if (!artifact) return;
    const g = new THREE.Group(); g.name = `artifact:${artifact.kind}`;
    if (artifact.kind === 'crystal') {
      const geo = new THREE.SphereGeometry(0.028, 12, 10);
      const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.05, clearcoat: 1, emissive: 0x1a3a52, emissiveIntensity: 0.5 });
      const species = [...new Set(artifact.sites.map((s) => s.species))];
      const palette = [0xf8fafc, 0x38bdf8, 0xff9a3c, 0xa78bfa, 0x62f0a3];
      const inst = new THREE.InstancedMesh(geo, mat, Math.min(64, artifact.sites.length));
      const M = new THREE.Matrix4(); const P = new THREE.Vector3(); const Q = new THREE.Quaternion(); const S = new THREE.Vector3(1, 1, 1); const C = new THREE.Color();
      const spacing = 0.11;
      artifact.sites.slice(0, 64).forEach((s, i) => {
        // Each instance sits at the engine's own lattice coordinates (fractional cell units), centred in the chamber.
        M.compose(P.set((s.x - 1) * spacing, 1.2 + s.z * spacing, -0.3 + (s.y - 1) * spacing), Q, S);
        inst.setMatrixAt(i, M);
        inst.setColorAt(i, C.set(palette[species.indexOf(s.species) % palette.length]));
      });
      inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      g.add(inst);
      const bondGeo = new THREE.BufferGeometry();
      const pts: number[] = [];
      const sites = artifact.sites.slice(0, 64);
      for (let i = 0; i < sites.length; i++) for (let j = i + 1; j < sites.length; j++) {
        const d = Math.hypot(sites[i].x - sites[j].x, sites[i].y - sites[j].y, sites[i].z - sites[j].z);
        if (d > 0.49 && d < 0.51) { pts.push((sites[i].x - 1) * spacing, 1.2 + sites[i].z * spacing, -0.3 + (sites[i].y - 1) * spacing, (sites[j].x - 1) * spacing, 1.2 + sites[j].z * spacing, -0.3 + (sites[j].y - 1) * spacing); }
      }
      bondGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.add(new THREE.LineSegments(bondGeo, new THREE.LineBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.45 })));
    } else if (artifact.kind === 'collision') {
      const pts: number[] = []; const cols: number[] = [];
      for (const f of artifact.finals) {
        const p = Math.hypot(f.p4.px, f.p4.py, f.p4.pz) || 1;
        const len = 0.18 + Math.min(0.5, Math.log10(1 + p) * 0.18);
        pts.push(0, 1.9, 0, (f.p4.px / p) * len, 1.9 + (f.p4.pz / p) * len * 0.6, (f.p4.py / p) * len);
        const c = f.pdg === 22 ? [1, 0.85, 0.4] : f.charge === 0 ? [0.55, 0.65, 0.8] : f.charge > 0 ? [0.35, 0.9, 0.65] : [0.55, 0.7, 1];
        cols.push(...c, ...c);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 })));
      const vtx = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd166, emissiveIntensity: 2 }));
      vtx.position.y = 1.9; g.add(vtx);
    } else if (artifact.kind === 'blackhole') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 10, 40), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: artifact.formed ? 0xff9a3c : 0x38bdf8, emissiveIntensity: artifact.formed ? 2.4 : 0.8 }));
      ring.position.y = 1.9; ring.rotation.x = Math.PI / 2; g.add(ring);
    } else if (artifact.kind === 'epidemic') {
      // The curve is drawn on the desk screen (see redrawScreen); a small bar over the desk marks the peak day.
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xf05555, emissiveIntensity: 1.8 }));
      bar.position.set(0.9, 1.35, 0); g.add(bar);
    }
    v.group.add(g); v.artifactGroup = g;
    this.redrawScreen(v, artifact);
  }

  getStats(): Record<string, number> {
    const base = this.statsBase();
    // The flagship pack's density gate, re-measured every 60 frames (a scene traversal is not a per-frame cost).
    if (this.scene && (this.gate === null || this.frames % 60 === 0)) this.gate = evaluateVisualReality(this.scene, this.renderer);
    const g = this.gate;
    return { ...base, world: this.world === 'biology' ? 1 : 0, twinMode: this.twinInstruction ? ['NORMAL', 'XRAY', 'VASCULAR', 'NERVOUS', 'ORGANS', 'BRAIN', 'TISSUE', 'CELLULAR'].indexOf(this.twinInstruction.mode) : -1, twins: this.twins.length,
      polygons: g?.polygonCount ?? 0, drawCalls: g?.drawCalls ?? 0, opaqueMeshes: g?.opaqueMeshes ?? 0, transparentMeshes: g?.transparentMeshes ?? 0, visualGate: g ? (g.pass ? 1 : 0) : -1 };
  }

  private statsBase(): Record<string, number> {
    const u = this.lastUpdate; const pose = this.controller.pose;
    return {
      agentState: AGENT_STATE_CODE[u?.state ?? 'IDLE'] ?? 0, reach: pose.reach, progress: u?.progress ?? 0,
      cameraMode: this.cameraMode === 'VISOR' ? 0 : 1, frames: this.frames, agentX: pose.position.x, agentZ: pose.position.z, facing: pose.facing,
    };
  }

  init(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera): void {
    this.THREE = THREE; this.scene = scene;
    this.scratchA = new THREE.Vector3(); this.scratchB = new THREE.Vector3();
    this.spectatorPos = new THREE.Vector3(0, 2.2, 8); this.spectatorLook = new THREE.Vector3(0, 1.4, 0);
    const palette = createGenesisMaterialPalette(THREE);
    const tier = detectRenderTier();
    if (this.world === 'biology') { this.initBiology(THREE, scene, camera, palette, tier); return; }
    scene.background = new THREE.Color(0x05070d);
    scene.fog = new THREE.FogExp2(0x070a12, 0.028);
    configureCinematicCamera(camera, 'SCIENTIST_POV');

    const W = this.room.maxX - this.room.minX; const D = this.room.maxZ - this.room.minZ;
    const cx = (this.room.maxX + this.room.minX) / 2; const cz = (this.room.maxZ + this.room.minZ) / 2;
    // Shell: floor, ceiling, walls.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), palette.LAB_FLOOR); floor.rotation.x = -Math.PI / 2; floor.position.set(cx, FLOOR_Y, cz); floor.receiveShadow = true; floor.name = 'lab-floor'; scene.add(floor);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), palette.CONCRETE); ceiling.rotation.x = Math.PI / 2; ceiling.position.set(cx, CEILING_Y, cz); scene.add(ceiling);
    const wallGeoX = new THREE.PlaneGeometry(W, CEILING_Y); const wallGeoZ = new THREE.PlaneGeometry(D, CEILING_Y);
    const back = new THREE.Mesh(wallGeoX, palette.LAB_WALL); back.position.set(cx, CEILING_Y / 2, this.room.minZ); scene.add(back);
    const front = new THREE.Mesh(wallGeoX, palette.LAB_WALL); front.position.set(cx, CEILING_Y / 2, this.room.maxZ); front.rotation.y = Math.PI; scene.add(front);
    const left = new THREE.Mesh(wallGeoZ, palette.LAB_WALL); left.position.set(this.room.minX, CEILING_Y / 2, cz); left.rotation.y = Math.PI / 2; scene.add(left);
    const right = new THREE.Mesh(wallGeoZ, palette.LAB_WALL); right.position.set(this.room.maxX, CEILING_Y / 2, cz); right.rotation.y = -Math.PI / 2; scene.add(right);
    // Hazard baseboard and floor lanes (painted, faintly emissive so they read under the ceiling panels).
    const laneMat = createEmissiveInstrumentMaterial(THREE, { color: 0xf0b35c, intensity: 0.25, baseColor: 0x6a5220 });
    const laneGeo = new THREE.BoxGeometry(0.08, 0.004, D - 1.5);
    for (const x of [-2.4, 2.4]) { const lane = new THREE.Mesh(laneGeo, laneMat); lane.position.set(x, 0.003, cz - 0.4); scene.add(lane); }
    const crossGeo = new THREE.BoxGeometry(W - 3, 0.004, 0.08);
    const cross = new THREE.Mesh(crossGeo, laneMat); cross.position.set(cx, 0.003, -1.9); scene.add(cross);
    const stripeGeo = new THREE.BoxGeometry(W - 0.02, 0.12, 0.02);
    for (const z of [this.room.minZ + 0.02, this.room.maxZ - 0.02]) { const s = new THREE.Mesh(stripeGeo, laneMat); s.position.set(cx, 0.06, z); scene.add(s); }
    // Ceiling light panels with practicals under them, plus dust and a soft shaft from the central panel.
    const panelMat = createEmissiveInstrumentMaterial(THREE, { color: 0xdff3ff, intensity: 1.6, baseColor: 0x223140 });
    const panelGeo = new THREE.BoxGeometry(1.6, 0.05, 0.6);
    const panelSpots: [number, number][] = [[-4, -2.5], [0, -2.5], [4, -2.5], [-4, 1.5], [0, 1.5], [4, 1.5]];
    for (const [x, z] of panelSpots) {
      const p = new THREE.Mesh(panelGeo, panelMat); p.position.set(x, CEILING_Y - 0.03, z); scene.add(p);
      createPracticalLight(THREE, scene, { position: [x, CEILING_Y - 0.25, z], color: 0xdff3ff, intensity: 3.2, distance: 6.5, decay: 1.8 });
    }
    createBackgroundFill(THREE, scene, { skyColor: 0x9fb8d8, groundColor: 0x3a4250, intensity: 0.42 });
    createKeyLight(THREE, scene, { target: [0, 0.9, -1.5], position: [0.8, CEILING_Y - 0.2, 0.4], intensity: 30, angle: Math.PI / 3.2, penumbra: 0.6, shadowMapSize: recommendedShadowMapSize(tier), shadowNear: 0.3, shadowFar: 14 });
    scene.add(createLightShaft(THREE, { origin: [0, CEILING_Y - 0.1, -2.5], direction: [0.1, -1, 0.35], length: 3.4, width: 1.2, color: 0xcfe9ff, opacity: 0.18 }));
    this.dust = createDustMotes(THREE, { count: 220, bounds: [W / 2 - 0.5, 1.6, D / 2 - 0.5], center: [cx, 1.7, cz], color: 0xdde8ff, size: 0.012, opacity: 0.35, seed: 7 });
    scene.add(this.dust.points);

    // Walls dressing: switchgear cabinets, conduit, pipes, shelves, signs.
    for (let i = 0; i < 3; i++) createAndAdd(scene, createElectricalCabinet(THREE, { position: [this.room.minX + 0.4, 0, 1.2 + i * 1.1], headingRadians: Math.PI / 2, width: 0.8, depth: 0.5, height: 2.0, bodyMaterial: palette.PAINTED_METAL, doorMaterial: palette.BRUSHED_METAL, hazardStripeMaterial: laneMat }));
    createAndAdd(scene, createShelfUnit(THREE, { position: [this.room.minX + 0.35, 0, -1.4], width: 1.2, depth: 0.5, height: 2.1, shelfCount: 5, material: palette.BRUSHED_METAL, frameMaterial: palette.PAINTED_METAL }));
    createAndAdd(scene, createCabinet(THREE, { position: [-5.6, 0, 3.6], width: 1.6, depth: 0.7, height: 1.1, bodyMaterial: palette.PAINTED_METAL, doorMaterial: palette.BRUSHED_METAL, handleMaterial: palette.POLISHED_METAL }));
    createAndAdd(scene, createCabinet(THREE, { position: [5.4, 0, 3.8], width: 1.8, depth: 0.7, height: 1.1, bodyMaterial: palette.PAINTED_METAL, doorMaterial: palette.BRUSHED_METAL, handleMaterial: palette.POLISHED_METAL }));
    createAndAdd(scene, createConduitRun(THREE, { waypoints: [[this.room.minX + 0.1, 2.7, this.room.maxZ - 0.3], [this.room.minX + 0.1, 2.7, this.room.minZ + 0.3], [this.room.maxX - 0.1, 2.7, this.room.minZ + 0.3]], radius: 0.035, material: palette.BRUSHED_METAL, bracketMaterial: palette.PAINTED_METAL }));
    for (const [y, r] of [[3.2, 0.09], [3.05, 0.06]] as const) scene.add(createPipe(THREE, palette.POLISHED_METAL, { from: [this.room.minX + 0.2, y, this.room.minZ + 0.35], to: [this.room.maxX - 0.2, y, this.room.minZ + 0.35], radius: r }));
    scene.add(createPipe(THREE, palette.CERAMIC, { from: [this.room.maxX - 0.3, 0.2, this.room.minZ + 0.8], to: [this.room.maxX - 0.3, 3.3, this.room.minZ + 0.8], radius: 0.07 }));
    const signMat = createEmissiveInstrumentMaterial(THREE, { color: 0x62f0a3, intensity: 0.9, baseColor: 0x0b1a14 });
    scene.add(createWallSign(THREE, { position: [0, 2.9, this.room.minZ + 0.02], width: 1.8, height: 0.32, material: signMat }));
    scene.add(createWallSign(THREE, { position: [this.room.minX + 0.02, 2.9, 0], headingRadians: Math.PI / 2, width: 1.4, height: 0.3, material: signMat }));
    // Warning beacons (status lights) at the airlock and the collider.
    const beaconGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.16, 12);
    for (const [x, z] of [[-1.6, this.room.maxZ - 0.25], [1.6, this.room.maxZ - 0.25], [-1.5, this.room.minZ + 0.3]]) {
      const m = createEmissiveInstrumentMaterial(THREE, { color: 0xf0b35c, intensity: 1.2, baseColor: 0x3a2a10 }) as THREE_NS.MeshStandardMaterial;
      const b = new THREE.Mesh(beaconGeo, m); b.position.set(x, 3.0, z); scene.add(b); this.beacons.push(m);
    }
    // Central instrument island (a sealed sample chamber on a platform) — the obstacle at (0, 0.4).
    scene.add(createPlatform(THREE, palette.BRUSHED_METAL, { position: [0, 0, 0.4], thickness: 0.12, shape: 'box', width: 2.2, depth: 1.4 }));
    const islandGlass = labGlass(THREE, 0xbfe9ff);
    scene.add(createGlassChamber(THREE, islandGlass, { position: [0, 0.12, 0.4], height: 1.5, radiusBottom: 0.45, radiusTop: 0.42, openEnded: false }));
    const islandCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), createEmissiveInstrumentMaterial(THREE, { color: 0x8fd3ff, intensity: 1.4, baseColor: 0x123047 }));
    islandCore.position.set(0, 0.85, 0.4); islandCore.name = 'island-core'; scene.add(islandCore);
    createHeroLight(THREE, scene, { target: [0, 0.9, 0.4], keyDistance: 3.2, rimDistance: 2.4, intensity: { key: 14, rim: 3 }, color: { key: 0xeaf4ff, rim: 0x7fdcff }, castShadow: false });

    // Stations from the typed world definition.
    for (const st of this.stationDefs) this.buildStation(THREE, scene, palette, st);

    // The suited scientist.
    const character = buildCharacter(THREE, { height: 1.78, suit: { fabric: 0xe9edf2, trim: 0xf0b35c, gloves: 0x263340, boots: 0x1a1f26, visor: 0x8fd3ff, lamp: 0x62f0a3 } });
    character.root.traverse((o) => { const m = o as THREE_NS.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });
    scene.add(character.root); this.character = character;

    applyShadowPolicy(THREE, scene);
  }

  /**
   * The human-biology lab, built from the V3 pack's scene description (`BIOLOGY_SCENE`): its dimensions, its nine stations at
   * their own ids and positions, its light nodes (colour temperature and lumens honoured), its signs and its clean-room air —
   * with the Genesis kits (materials palette, lab/electrical kits, primitives, lighting roles, atmosphere) and the biology kits
   * (layered ceiling, glass curtain walls, twin chamber, manipulators, stations). Same class, same pipeline, same cameras.
   */
  private initBiology(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, palette: GenesisMaterialPalette, tier: ReturnType<typeof detectRenderTier>): void {
    this.ceilingY = BIOLOGY_SCENE.dimensionsMeters.y;
    const H = this.ceilingY;
    scene.background = new THREE.Color(0x070a10);
    scene.fog = new THREE.FogExp2(0x0a0f18, 0.014);
    configureCinematicCamera(camera, 'SCIENTIST_POV');
    this.spectatorPos?.set(0, 2.6, 9.5); this.spectatorLook?.set(0, 1.4, 0);
    const W = this.room.maxX - this.room.minX; const D = this.room.maxZ - this.room.minZ;
    const cx = (this.room.maxX + this.room.minX) / 2; const cz = (this.room.maxZ + this.room.minZ) / 2;
    const glass = labGlass(THREE, 0xd6ecff);
    // Shell: floor, two solid walls (east/west), two glass curtain walls (north/south, as the pack's arch.glass-wall nodes) with corridors behind, the layered ceiling.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), createEpoxyFloor(THREE)); floor.rotation.x = -Math.PI / 2; floor.position.set(cx, FLOOR_Y, cz); floor.receiveShadow = true; floor.name = 'lab-floor'; scene.add(floor);
    const wallGeoZ = new THREE.PlaneGeometry(D, H);
    const left = new THREE.Mesh(wallGeoZ, palette.LAB_WALL); left.position.set(this.room.minX, H / 2, cz); left.rotation.y = Math.PI / 2; scene.add(left);
    const right = new THREE.Mesh(wallGeoZ, palette.LAB_WALL); right.position.set(this.room.maxX, H / 2, cz); right.rotation.y = -Math.PI / 2; scene.add(right);
    const wallOpts = { width: W, height: H, glass, mullionMaterial: palette.PAINTED_METAL, plinthMaterial: palette.BRUSHED_METAL, corridorFloor: palette.CONCRETE, corridorWall: palette.LAB_WALL } as const;
    scene.add(createGlassCurtainWall(THREE, { ...wallOpts, position: [cx, 0, this.room.minZ], headingRadians: 0 }));
    scene.add(createGlassCurtainWall(THREE, { ...wallOpts, position: [cx, 0, this.room.maxZ], headingRadians: Math.PI }));
    createLayeredCeiling(THREE, scene, { center: [cx, H, cz], width: W, depth: D, height: H, slabMaterial: palette.CONCRETE, beamMaterial: palette.PAINTED_METAL, ductMaterial: palette.BRUSHED_METAL, pitch: 4, practicalSpots: [[-5, 0], [5, 0]], practicalColor: kelvinToColor(THREE, 4800) });
    // Floor lanes between zones, painted and faintly emissive.
    const laneMat = createEmissiveInstrumentMaterial(THREE, { color: 0x7dd3fc, intensity: 0.22, baseColor: 0x1e3040 });
    for (const x of [-5, 5]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.004, D - 2), laneMat); l.position.set(x, 0.003, cz); scene.add(l); }
    for (const z of [-2.2, 2.2]) { const l = new THREE.Mesh(new THREE.BoxGeometry(W - 2, 0.004, 0.08), laneMat); l.position.set(cx, 0.003, z); scene.add(l); }
    // Lights from the pack's nodes: key (shadow caster, aimed at the twin), fill and rim; colour temperature and lumens honoured.
    createBackgroundFill(THREE, scene, { skyColor: 0xb9cce4, groundColor: 0x3d4652, intensity: 0.26 });
    for (const n of BIOLOGY_SCENE.nodes) {
      if (n.kind !== 'LIGHT') continue;
      const color = kelvinToColor(THREE, Number(n.metadata?.temperatureK ?? 5000)); const lumens = Number(n.metadata?.lumens ?? 5000);
      const pos: [number, number, number] = [n.positionMeters.x, n.positionMeters.y, n.positionMeters.z];
      if (n.id.startsWith('light.key')) createKeyLight(THREE, scene, { target: [TWIN_CHAMBER.position.x, 1.2, TWIN_CHAMBER.position.z], position: pos, color, intensity: lumensToIntensity(lumens) * 0.6, angle: Math.PI / 3.4, penumbra: 0.65, shadowMapSize: recommendedShadowMapSize(tier), shadowNear: 0.4, shadowFar: 22 });
      else createPracticalLight(THREE, scene, { position: pos, color, intensity: lumensToIntensity(lumens) * 0.35, distance: 14, decay: 1.8 });
    }
    scene.add(createLightShaft(THREE, { origin: [-5, H - 0.5, -4], direction: [0.35, -1, 0.3], length: 4.2, width: 1.6, color: kelvinToColor(THREE, 5200).getHex(), opacity: 0.14 }));
    const air = BIOLOGY_SCENE.nodes.find((n) => n.id === 'vfx.cleanroom-air');
    this.dust = createDustMotes(THREE, { count: Math.round(4000 * Number(air?.metadata?.density ?? 0.08)), bounds: [W / 2 - 0.5, 1.8, D / 2 - 0.5], center: [cx, 1.9, cz], color: 0xe8f1ff, size: 0.01, opacity: 0.28, seed: 11 });
    scene.add(this.dust.points);
    // The central Human Digital Twin chamber, hero-lit; the twin inside is the labelled proxy (no approved human GLB in the repository).
    const chamber = createTwinChamber(THREE, { position: [TWIN_CHAMBER.position.x, 0, TWIN_CHAMBER.position.z], radius: TWIN_CHAMBER.radius, height: TWIN_CHAMBER.height, glass, palette, ceilingHeight: H });
    scene.add(chamber.group); this.chamberRing = chamber.ring;
    const twin = createTwinProxy(THREE, this.manifest, { skinHex: BIOLOGY_SCENE.humanVisual.skinMaterial.baseColorHex, hologram: true });
    chamber.anchor.add(twin.group); this.twins.push(twin); this.spinners.push(twin.group);
    // Two manipulators flank the chamber (reference 2), sharing the ORPHEUS arm builder.
    for (const [x, z, heading, phase] of [[-2.1, 0.9, Math.PI * 0.35, 0.8], [2.1, 0.9, -Math.PI * 0.35, 2.4]] as const) {
      const arm = createManipulatorArm(THREE, { position: [x, 0, z], headingRadians: heading, scale: 1.25, phase, linkMaterial: palette.BRUSHED_METAL, jointMaterial: palette.POLISHED_METAL, baseMaterial: palette.PAINTED_METAL });
      scene.add(arm.group); this.arms.push(arm);
    }
    createHeroLight(THREE, scene, { target: [TWIN_CHAMBER.position.x, 1.3, TWIN_CHAMBER.position.z], keyDistance: 3.6, rimDistance: 2.6, intensity: { key: 16, rim: 4 }, color: { key: 0xf2f7ff, rim: 0x8fd3ff }, castShadow: false });
    // Stations (pack ids), their practical lights, and the pack's hanging signs.
    for (const st of this.stationDefs) this.buildBiologyStationVisual(THREE, scene, palette, glass, st);
    const signText: Readonly<Record<string, [string, string]>> = { 'sign.neuro': ['Neuro Lab', 'sygnały · MODEL'], 'sign.micro': ['Hyperscope', 'mikroskopia wirtualna'], 'sign.orpheus': ['ORPHEUS', 'analizator koncepcyjny'] };
    for (const n of BIOLOGY_SCENE.nodes) {
      if (n.kind !== 'SIGNAGE') continue; const t = signText[n.id]; if (!t) continue;
      scene.add(createTextSign(THREE, { position: [n.positionMeters.x, n.positionMeters.y, n.positionMeters.z], text: t[0], subtext: t[1], frameMaterial: palette.PAINTED_METAL }));
    }
    scene.add(createTextSign(THREE, { position: [cx, 3.1, this.room.maxZ - 0.6], headingRadians: Math.PI, text: 'Genesis Human Biology Lab', subtext: 'bliźniak = PROXY · dane = MODEL · brak wyrobu medycznego', width: 2.6, height: 0.4, frameMaterial: palette.PAINTED_METAL }));
    // Upper observation gallery along the north glass wall (reference: the command hub), and holographic dashboards at the hero bays (static labels only).
    scene.add(createMezzanine(THREE, { position: [cx, 0, this.room.minZ + 1.9], headingRadians: 0, length: W - 1.2, depth: 1.8, height: 2.75, slabMaterial: palette.PAINTED_METAL, railMaterial: palette.BRUSHED_METAL, glass }));
    scene.add(createHoloPanel(THREE, { position: [-3, 1.75, -3.6], headingRadians: 0, title: 'Neuro Lab', lines: ['regiony: NEURO_REGIONS (11)', 'sygnały: model seeded', 'etykieta: SIMULATION', 'brak danych klinicznych'] }));
    scene.add(createHoloPanel(THREE, { position: [-6, 1.8, 3.5], headingRadians: Math.PI / 2, title: 'Imaging Center', lines: ['XRAY · CT · MRI-like · USG-like', 'przekroje z atlasu (MODEL)', 'diagnostyka: ZABRONIONA'] }));
    scene.add(createHoloPanel(THREE, { position: [1.9, 2.0, 0.4], headingRadians: Math.PI * 0.25, width: 1.0, height: 0.6, title: 'Human Digital Twin', lines: ['skala 1:1 · 1.78 m', 'ciało: PROXY (brak GLB)', 'narządy: atlas MODEL', 'NOT_A_MEDICAL_DEVICE'] }));
    // Wall dressing on the solid walls: cabinets and a shelf, conduit at height.
    for (let i = 0; i < 2; i++) createAndAdd(scene, createElectricalCabinet(THREE, { position: [this.room.minX + 0.4, 0, -7.5 + i * 1.1], headingRadians: Math.PI / 2, width: 0.8, depth: 0.5, height: 2.0, bodyMaterial: palette.PAINTED_METAL, doorMaterial: palette.BRUSHED_METAL, hazardStripeMaterial: laneMat }));
    createAndAdd(scene, createShelfUnit(THREE, { position: [this.room.minX + 0.35, 0, 8.2], width: 1.4, depth: 0.5, height: 2.1, shelfCount: 5, material: palette.BRUSHED_METAL, frameMaterial: palette.PAINTED_METAL }));
    createAndAdd(scene, createCabinet(THREE, { position: [this.room.maxX - 0.5, 0, 8.4], width: 1.6, depth: 0.7, height: 1.1, bodyMaterial: palette.PAINTED_METAL, doorMaterial: palette.BRUSHED_METAL, handleMaterial: palette.POLISHED_METAL }));
    createAndAdd(scene, createConduitRun(THREE, { waypoints: [[this.room.minX + 0.1, 3.3, this.room.maxZ - 0.5], [this.room.minX + 0.1, 3.3, this.room.minZ + 0.5]], radius: 0.035, material: palette.BRUSHED_METAL, bracketMaterial: palette.PAINTED_METAL }));
    for (const [y, r] of [[3.5, 0.08], [3.35, 0.05]] as const) scene.add(createPipe(THREE, palette.POLISHED_METAL, { from: [this.room.maxX - 0.25, y, this.room.minZ + 0.6], to: [this.room.maxX - 0.25, y, this.room.maxZ - 0.6], radius: r }));
    // The suited scientist (same rig as the physics lab).
    const character = buildCharacter(THREE, { height: 1.78, suit: { fabric: 0xe9edf2, trim: 0x7dd3fc, gloves: 0x263340, boots: 0x1a1f26, visor: 0x8fd3ff, lamp: 0x62f0a3 } });
    character.root.traverse((o) => { const m = o as THREE_NS.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });
    scene.add(character.root); this.character = character;
    this.setTwinView('NORMAL', null);
    applyShadowPolicy(THREE, scene);
  }

  private buildBiologyStationVisual(THREE: typeof THREE_NS, scene: THREE_NS.Scene, palette: GenesisMaterialPalette, glass: THREE_NS.Material, st: LabStation): void {
    const build = buildBiologyStation(THREE, { palette, glass, manifest: this.manifest, skinHex: BIOLOGY_SCENE.humanVisual.skinMaterial.baseColorHex }, st);
    build.group.position.set(st.position.x, 0, st.position.z); build.group.rotation.y = st.facing; scene.add(build.group);
    // Light budget (forward renderer: every point light costs every fragment): only the hero bays get a practical; the rest read by their emissive screens and the ceiling.
    const hero = st.kind === 'human-study' || st.kind === 'neuro' || st.kind === 'microscopy' || st.kind === 'orpheus' || st.kind === 'imaging';
    // The imaging gantry is white ceramic a metre under its practical: half intensity there, or it glares (seen on the first e2e frames).
    const light = hero ? createPracticalLight(THREE, scene, { position: [st.position.x + Math.sin(st.facing) * 0.7, 2.1, st.position.z + Math.cos(st.facing) * 0.7], color: 0xbfe3ff, intensity: st.kind === 'imaging' ? 1.0 : 2.2, distance: 5, decay: 2 }) : new THREE.PointLight(0xbfe3ff, 0, 0.1);
    if (build.twin) this.twins.push(build.twin);
    this.arms.push(...build.arms);
    const carousel = build.group.getObjectByName('carousel'); if (carousel) this.spinners.push(carousel);
    const holo = build.group.getObjectByName('brain-holo'); if (holo) this.spinners.push(holo);
    this.stations.set(st.id, { station: st, group: build.group, statusMaterial: build.status, light, screen: build.screen, artifactGroup: null, arms: build.arms, artifactAnchor: build.artifactAnchor, leds: build.leds, ...(build.twin ? { twin: build.twin } : {}) });
    if (build.screen) { if (st.kind === 'evidence') drawEvidenceWall(build.screen, this.sealedSessions); else drawBiologyIdle(build.screen, st); }
  }

  private buildStation(THREE: typeof THREE_NS, scene: THREE_NS.Scene, palette: GenesisMaterialPalette, st: LabStation): void {
    const group = new THREE.Group(); group.name = `station:${st.id}`; group.position.set(st.position.x, 0, st.position.z); group.rotation.y = st.facing; scene.add(group);
    const status = createEmissiveInstrumentMaterial(THREE, { color: 0x38bdf8, intensity: 0.7, baseColor: 0x0f1a26 }) as THREE_NS.MeshStandardMaterial;
    let screen: StationVisual['screen'];
    const light = createPracticalLight(THREE, scene, { position: [st.position.x + Math.sin(st.facing) * 0.6, 1.9, st.position.z + Math.cos(st.facing) * 0.6], color: 0x9fd7f9, intensity: 2.4, distance: 4, decay: 2 });
    if (st.kind === 'synthesizer') {
      group.add(createBench(THREE, { position: [0, 0, 0], width: 2.4, depth: 1.2, height: 0.9, topMaterial: palette.BRUSHED_METAL, legMaterial: palette.PAINTED_METAL }));
      const glass = labGlass(THREE, 0xd8f2ff);
      // Chamber at the back of the bench, console at the front edge: from the operator's standoff the hands and the lattice are both in frame.
      group.add(createGlassChamber(THREE, glass, { position: [0, 0.9, -0.3], height: 1.0, radiusBottom: 0.4, radiusTop: 0.4, openEnded: false }));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 24), palette.POLISHED_METAL); cap.position.set(0, 1.94, -0.3); group.add(cap);
      const console = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.36), palette.TECH_COMPOSITE); console.position.set(0.1, 0.97, 0.42); console.rotation.x = -0.35; group.add(console);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.08), status); strip.position.set(0.1, 1.05, 0.3); strip.rotation.x = -0.35; group.add(strip);
      const readout = makeReadoutSurface(THREE, 256, 176); screen = readout;
      group.add(createMonitor(THREE, { position: [-0.85, 0.9, 0.25], width: 0.5, height: 0.34, standHeight: 0.18, frameMaterial: palette.PAINTED_METAL, screenMaterial: createScreenMaterial(THREE, readout.texture, { emissiveIntensity: 0.9 }) }));
    } else if (st.kind === 'collider') {
      group.add(createBench(THREE, { position: [0, 0, 0], width: 2.6, depth: 1.0, height: 0.88, topMaterial: palette.TECH_COMPOSITE, legMaterial: palette.PAINTED_METAL }));
      const readout = makeReadoutSurface(THREE, 256, 176); screen = readout;
      for (const [x, i] of [[-0.9, 0], [0, 1], [0.9, 2]] as const) {
        const mat = i === 1 ? createScreenMaterial(THREE, readout.texture, { emissiveIntensity: 0.9 }) : undefined;
        group.add(createMonitor(THREE, { position: [x, 0.88, -0.25], width: 0.62, height: 0.4, standHeight: 0.14, frameMaterial: palette.PAINTED_METAL, screenMaterial: mat }));
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 12, 48), status); ring.position.set(0, 1.9, -0.2); ring.rotation.x = Math.PI / 2; ring.name = 'holo-ring'; group.add(ring);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.4), palette.TECH_COMPOSITE); deck.position.set(0, 0.92, 0.28); deck.rotation.x = -0.28; group.add(deck);
      const keys = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.01, 0.24), status); keys.position.set(0, 0.96, 0.27); keys.rotation.x = -0.28; group.add(keys);
    } else if (st.kind === 'epidemiology') {
      group.add(createBench(THREE, { position: [0, 0, 0], width: 2.4, depth: 1.2, height: 0.88, topMaterial: palette.CERAMIC, legMaterial: palette.PAINTED_METAL }));
      const readout = makeReadoutSurface(THREE, 384, 224); screen = readout;
      group.add(createMonitor(THREE, { position: [0, 0.88, -0.3], width: 1.3, height: 0.72, standHeight: 0.12, frameMaterial: palette.PAINTED_METAL, screenMaterial: createScreenMaterial(THREE, readout.texture, { emissiveIntensity: 0.85 }) }));
      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.36), palette.TECH_COMPOSITE); deck.position.set(0.4, 0.92, 0.32); deck.rotation.x = -0.3; group.add(deck);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.012, 0.2), status); strip.position.set(0.4, 0.955, 0.31); strip.rotation.x = -0.3; group.add(strip);
    } else if (st.kind === 'window') {
      const glass = labGlass(THREE, 0xcfe9ff);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.8), glass); pane.position.set(0, 1.6, 0); pane.rotation.y = Math.PI; group.add(pane);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(3.3, 2.1, 0.12), palette.PAINTED_METAL); frame.position.set(0, 1.6, -0.08); group.add(frame);
      const cut = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.8, 0.14), palette.LAB_WALL); cut.position.set(0, 1.6, -0.08); cut.visible = false; group.add(cut);
      // The hall beyond: a detector ring and its glow, seen through the glass.
      const hall = new THREE.Group(); hall.position.set(0, 0, -2.6); group.add(hall);
      const detector = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.16, 14, 48), palette.BRUSHED_METAL); detector.position.y = 1.6; hall.add(detector);
      const core = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 10, 40), status); core.position.y = 1.6; core.name = 'holo-ring'; hall.add(core);
      const hallWall = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), palette.CONCRETE); hallWall.position.set(0, 1.8, -1.6); hall.add(hallWall);
      light.position.set(st.position.x + Math.sin(st.facing) * -2.4, 1.6, st.position.z + Math.cos(st.facing) * -2.4); light.color.setHex(0xff9a3c); light.intensity = 5; light.distance = 6;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.05, 0.05), palette.POLISHED_METAL); rail.position.set(0, 1.05, 0.5); group.add(rail);
    }
    this.stations.set(st.id, { station: st, group, statusMaterial: status, light, screen, artifactGroup: null });
    if (screen) this.drawIdleScreen(screen, st);
  }

  private drawIdleScreen(screen: NonNullable<StationVisual['screen']>, st: LabStation): void {
    const { ctx, canvas, texture } = screen;
    ctx.fillStyle = '#07111a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(56,189,248,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
    ctx.fillStyle = '#9fd7f9'; ctx.font = `bold ${Math.round(canvas.height * 0.09)}px monospace`;
    ctx.fillText(st.label.toUpperCase(), 16, 34);
    ctx.fillStyle = '#62f0a3'; ctx.font = `${Math.round(canvas.height * 0.075)}px monospace`;
    ctx.fillText('GOTOWE · BRAK SESJI', 16, canvas.height - 22);
    texture.needsUpdate = true;
  }

  private redrawScreen(v: StationVisual, artifact: LabArtifact): void {
    if (!v.screen) return;
    const { ctx, canvas, texture } = v.screen;
    ctx.fillStyle = '#07111a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(98,240,163,0.45)'; ctx.lineWidth = 2; ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
    ctx.fillStyle = '#9fd7f9'; ctx.font = `bold ${Math.round(canvas.height * 0.085)}px monospace`;
    if (artifact.kind === 'epidemic') {
      ctx.fillText('SEIRD RK4 · SYMULACJA', 14, 30);
      const series = artifact.series; const n = series.length;
      const maxI = Math.max(1, ...series.map((p) => p.I));
      const x0 = 24; const y0 = canvas.height - 30; const w = canvas.width - 48; const h = canvas.height - 80;
      ctx.strokeStyle = '#334155'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0); ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 - h); ctx.stroke();
      const plot = (key: 'I' | 'E' | 'D', color: string, scale: number): void => {
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
        series.forEach((p, i) => { const x = x0 + (i / Math.max(1, n - 1)) * w; const y = y0 - Math.min(1, (p[key] / maxI) * scale) * h; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
        ctx.stroke();
      };
      plot('E', '#e8b34a', 1); plot('I', '#f05555', 1); plot('D', '#cbd5e1', 1);
      ctx.fillStyle = '#f05555'; ctx.font = `${Math.round(canvas.height * 0.065)}px monospace`;
      ctx.fillText(`I max ${Math.round(maxI)} · R0 ${artifact.params.r0} · N ${artifact.params.population}`, 14, canvas.height - 10);
    } else if (artifact.kind === 'crystal') {
      ctx.fillText('SYNTEZA · ESTYMATA', 14, 30);
      ctx.fillStyle = '#e6f2ec'; ctx.font = `${Math.round(canvas.height * 0.08)}px monospace`;
      ctx.fillText(artifact.name, 14, 66); ctx.fillText(`${artifact.lattice} · a=${artifact.aPm} pm`, 14, 94); ctx.fillText(`${artifact.sites.length} węzłów`, 14, 122);
    } else if (artifact.kind === 'collision') {
      ctx.fillText('ZDERZENIE · TOY MC', 14, 30);
      ctx.fillStyle = '#e6f2ec'; ctx.font = `${Math.round(canvas.height * 0.08)}px monospace`;
      ctx.fillText(artifact.eventId, 14, 66); ctx.fillText(`${artifact.process} · ${artifact.finals.length} cząstek`, 14, 94); ctx.fillText(`paczka ${artifact.batchSize}`, 14, 122);
    } else {
      ctx.fillText('HORYZONT · SPEKULATYWNE', 14, 30);
      ctx.fillStyle = '#e6f2ec'; ctx.font = `${Math.round(canvas.height * 0.08)}px monospace`;
      ctx.fillText(artifact.formed ? `r_s ${artifact.rsM?.toExponential(2)} m` : 'BRAK FORMACJI', 14, 66);
    }
    texture.needsUpdate = true;
  }

  update(dt: number, _params: SimParams): void {
    this.time += dt;
    // The render loop clamps dt to 0.05 s; on a slow (software) renderer that would make the agent walk at a fraction of
    // real time. The body follows the wall clock instead, capped at 0.2 s per frame so a stall never teleports it.
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const wall = this.lastWall === null ? dt : Math.min(0.2, (now - this.lastWall) / 1000);
    this.lastWall = now;
    const u = this.controller.update(Math.max(dt, wall));
    this.lastUpdate = u;
    this.onUpdate?.(u);
    this.dust?.update(dt);
  }

  syncScene(_scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera): void {
    const THREE = this.THREE; const ch = this.character;
    if (!THREE || !ch || !this.scratchA || !this.scratchB || !this.spectatorPos || !this.spectatorLook) return;
    this.frames++;
    const pose = this.controller.pose;
    const u = this.lastUpdate;
    ch.root.position.set(pose.position.x, 0, pose.position.z);
    ch.setFacing(pose.facing);
    const moving = pose.speed > 0.01;
    ch.update(moving ? 'walk' : 'idle', moving ? pose.gait : this.time, moving ? pose.speed : 0);
    ch.reach(pose.reach, pose.headPitch);
    // Station glow: the active one breathes brighter; the one the agent works at pulses.
    for (const v of this.stations.values()) {
      const active = u?.stationId === v.station.id && (u.state === 'REACHING' || u.state === 'INTERACTING' || u.state === 'EXECUTING' || u.state === 'OBSERVING');
      const highlighted = this.highlightId === v.station.id;
      const base = active ? 1.8 + 0.6 * Math.sin(this.time * 6) : highlighted ? 1.3 : 0.7;
      v.statusMaterial.emissiveIntensity += (base - v.statusMaterial.emissiveIntensity) * 0.15;
      v.light.intensity += ((active ? 4.5 : 2.4) - v.light.intensity) * 0.1;
      if (v.artifactGroup) v.artifactGroup.rotation.y = this.time * 0.35;
    }
    for (const b of this.beacons) b.emissiveIntensity = 0.9 + 0.7 * (0.5 + 0.5 * Math.sin(this.time * 2.6));
    // Biology: twins idle, manipulators sweep (faster at the active bay), LEDs tick, the chamber ring and the carousel/hologram turn slowly.
    for (const t of this.twins) t.update(this.time);
    for (const v of this.stations.values()) {
      const active = u?.stationId === v.station.id && (u.state === 'INTERACTING' || u.state === 'EXECUTING' || u.state === 'OBSERVING');
      if (v.arms) for (const a of v.arms) { a.setActive(active); a.update(this.time); }
      if (v.leds) v.leds.forEach((led, i) => { led.emissiveIntensity = 0.4 + 0.8 * (Math.sin(this.time * (1.3 + (i % 5) * 0.37) + i) > 0.2 ? 1 : 0.15); });
    }
    for (const a of this.arms) if (![...this.stations.values()].some((v) => v.arms?.includes(a))) a.update(this.time);
    for (const sp of this.spinners) sp.rotation.y = this.time * (sp.name === 'carousel' ? 0.5 : 0.18);
    if (this.chamberRing) this.chamberRing.emissiveIntensity = 1.2 + 0.4 * Math.sin(this.time * 1.4);
    // Camera.
    const fx = Math.sin(pose.facing); const fz = Math.cos(pose.facing);
    if (this.cameraMode === 'VISOR') {
      ch.head.getWorldPosition(this.scratchA);
      // Just inside the visor glass, so the suit's arms and gloves stay in frame below.
      this.scratchA.x += fx * 0.17; this.scratchA.z += fz * 0.17; this.scratchA.y += 0.04;
      camera.position.copy(this.scratchA);
      const pitch = pose.headPitch;
      this.scratchB.set(this.scratchA.x + fx * Math.cos(pitch), this.scratchA.y - Math.sin(pitch), this.scratchA.z + fz * Math.cos(pitch));
      camera.lookAt(this.scratchB);
      // Head bob while walking: presentation only.
      if (moving) camera.position.y += Math.sin(pose.gait * Math.PI) * 0.012;
      if (ch.helmet) ch.helmet.visible = false;
      ch.head.children.forEach((c) => { if ((c as THREE_NS.Mesh).isMesh) c.visible = false; });
    } else {
      if (ch.helmet) ch.helmet.visible = true;
      ch.head.children.forEach((c) => { if ((c as THREE_NS.Mesh).isMesh) c.visible = true; });
      const target = this.scratchA.set(pose.position.x - fx * 3.4, Math.min(2.15, this.ceilingY - 0.6), pose.position.z - fz * 3.4);
      // keep the spectator inside the room
      target.x = Math.max(this.room.minX + 0.5, Math.min(this.room.maxX - 0.5, target.x));
      target.z = Math.max(this.room.minZ + 0.5, Math.min(this.room.maxZ - 0.5, target.z));
      this.spectatorPos.lerp(target, 0.06);
      this.spectatorLook.lerp(this.scratchB.set(pose.position.x + fx * 0.8, 1.35, pose.position.z + fz * 0.8), 0.1);
      camera.position.copy(this.spectatorPos); camera.lookAt(this.spectatorLook);
    }
    this.pipeline?.setFocusDistance(this.cameraMode === 'VISOR' ? 1.6 : 3.4);
  }

  setupPostProcessing(modules: PostProcessingModules, renderer: THREE_NS.WebGLRenderer, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, w: number, h: number): PostProcessor {
    const THREE = this.THREE!;
    const tier = detectRenderTier();
    this.renderer = renderer;
    this.pipeline = setupGraphicsPipeline(THREE, modules, renderer, {
      scene, camera, width: w, height: h, toneMappingExposure: 1.0,
      bloom: tierAllowsBloom(tier) ? { strength: 0.38, radius: 0.55, threshold: 0.82 } : { strength: 0, radius: 0, threshold: 1 },
      ambientOcclusion: { enabled: true, minTier: 'medium', radius: 0.5 },
      depthOfField: { enabled: false, focusDistance: 1.6 },
      ambient: { mode: 'studio+hdri' },
    });
    return this.pipeline;
  }

  onResize(): void { /* the camera is fully owned here; useThreeLoop keeps the aspect */ }

  dispose(): void {
    if (this.scene) disposeSceneResources(this.scene);
    this.character?.dispose();
    for (const t of this.twins) t.dispose();
    this.twins = []; this.arms = []; this.spinners = []; this.chamberRing = null;
    this.dust?.dispose();
    this.stations.clear();
    this.beacons = [];
    this.character = null; this.scene = null; this.THREE = null; this.pipeline = null; this.renderer = null; this.gate = null;
  }
}

function createAndAdd(scene: THREE_NS.Scene, obj: THREE_NS.Object3D): void { scene.add(obj); }

/** Science glass without transmission: plain alpha glass reads correctly on every GPU (and under software GL) and stays see-through. */
function labGlass(THREE: typeof THREE_NS, color: number): THREE_NS.MeshPhysicalMaterial {
  const m = createScientificGlass(THREE, { color, transmissive: false, roughness: 0.06 });
  m.transparent = true; m.opacity = 0.22; m.envMapIntensity = 0.35; m.depthWrite = false;
  return m;
}
