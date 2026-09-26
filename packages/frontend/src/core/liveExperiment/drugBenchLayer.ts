import type * as THREE_NS from 'three';
import { createAtomSphere, createBond, elementStyleOf } from '../three/graphics/moleculeKit';
import { createBench, createCabinet, createMonitor } from '../three/graphics/labKit';
import { createGenesisMaterialPalette, createScreenMaterial, createScientificGlass, makeReadoutSurface } from '../three/graphics/materials';
import { createManipulatorArm, type ManipulatorHandle } from '../three/biologyLabKit';
import { buildCharacter, type Character } from '../three/characterRig';
import { CameraRig } from '../three/graphics/cameraRig';
import { labProcedureOf, type BenchFocus, type LabProcedure } from './labProcedure';
import { benchHandlingOf, transferMotion, type BenchHandling, type BenchInstrument } from './benchHandling';
import { createBackendGeometrySource, type MoleculeGeometrySource, type MoleculeMaterialisation } from '../worldModel/domains/molecularStructure';
import type { Sim3D } from '../three/types';
import type { LiveDrugRun } from './liveDrugRun';
import type { DockedPose, LiveDrugRunState } from './drugRunState';

/**
 * DRUG BENCH LAYER — the live drug run drawn at the bench of the ONE main laboratory.
 *
 * Presentation only, and only of `LiveDrugRunState`: every object below is derived from the state the
 * backend persisted (candidates, lineage, stage measurements). The molecule is the real RDKit
 * conformer of the focused candidate (`chem-rdkit-embed3d`, the same source as Molecule Lab). Nothing
 * animates a result that has not been computed: a stage ring grows only when a measurement exists, and
 * the docked pose appears in its pocket only once Vina has actually produced it (the pose and the
 * receptor residues around it come from the persisted Science Run, in the receptor's own frame).
 *
 * Added through the scene's public surface: a layer on the station group `station:<id>` the scene
 * already builds, inside the same renderer — no second canvas, no second scene, no edit of core/three.
 * `renderedStateHash` is the state hash the scene last rebuilt from, so a test can prove the scene
 * shows exactly the backend's state.
 */

export const DRUG_BENCH_STATION_ID = 'st-drug-bench';
const MOLECULE_SCALE = 0.055; // metres per Ångström on the hologram
const HOLO_Y = 1.72;

const STAGE_COLOR = { admet: 0x5eead4, docking: 0x60a5fa, quantum: 0xc084fc } as const;

// The bench's sample layout and the focused candidate are pure functions of the run state; they live
// next door so tests (and the panel) can use them without loading a renderer.
export { focusCandidate } from './drugBenchLayout';
import { BENCH_ZONES, benchLayoutOf, focusCandidate, type BenchLayout, type BenchZone } from './drugBenchLayout';

/** Where each stage of the funnel stands on the bench, and the colour its samples carry. */
const ZONE_ROW: Readonly<Record<BenchZone, number>> = { QUEUE: 0, ADMET: 1, DOCKING: 2, FINALIST: 3, DISCARD: 4 };
const ZONE_COLOR: Readonly<Record<BenchZone, number>> = { QUEUE: 0x38bdf8, ADMET: 0x5eead4, DOCKING: 0x60a5fa, FINALIST: 0xfbbf24, DISCARD: 0x475569 };
const SLOT_X = 0.076;
const ROW_Z = 0.075;
const SLOTS_PER_ROW = 6;

/**
 * THE SCIENTIST'S WORK SPOTS. For every instrument: where a person stands to work at it (x along the
 * bench), and the port where a sample sits once it has been put in. Presentation geometry only — the
 * numbers place meshes, they carry no scientific meaning.
 */
const WORK_SPOT: Readonly<Record<BenchInstrument, { readonly standX: number; readonly port: readonly [number, number, number] }>> = {
  RACK: { standX: -0.72, port: [-0.72, 1.0, 0.16] },
  ANALYSER: { standX: -1.34, port: [-1.5, 1.14, 0.2] },
  WORKSTATION: { standX: 0.55, port: [0.55, 1.0, 0.3] },
  POSE_VIEWER: { standX: 0.95, port: [0.95, 1.06, 0.24] },
  MONITOR: { standX: 0.55, port: [0.55, 1.0, 0.16] },
};
/** How far in front of the bench the scientist stands, and how fast they walk between spots. */
const STAND_Z = 0.62;
const WALK_SPEED = 0.85; // m/s
/** How far the right arm extends for each action, and how much the head tips toward the work. */
const REACH_BY_ACTION: Readonly<Record<string, readonly [number, number]>> = {
  IDLE: [0, 0], REACH: [0.8, 0.34], GRIP: [1, 0.38], CARRY: [0.5, 0.2], PLACE: [0.95, 0.36],
  OPERATE: [0.62, 0.28], OBSERVE: [0.22, 0.16], RECORD: [0.55, 0.3],
};

export class DrugBenchLayer {
  private THREE: typeof THREE_NS | null = null;
  private root: THREE_NS.Group | null = null;
  private molecule: THREE_NS.Group | null = null;
  private cloud: THREE_NS.Group | null = null;
  private rings: THREE_NS.Group | null = null;
  private pocket: THREE_NS.Group | null = null;
  private rack: THREE_NS.Group | null = null;
  private vialGlass: THREE_NS.Material | null = null;
  private analyserLid: THREE_NS.Mesh | null = null;
  private analyserLamp: THREE_NS.Mesh | null = null;
  private analyserScreen: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE_NS.CanvasTexture } | null = null;
  private busyLamp: THREE_NS.Mesh | null = null;
  private arm: ManipulatorHandle | null = null;
  private readonly anchors = new Map<BenchFocus, THREE_NS.Object3D>();
  private procedure: LabProcedure | null = null;
  private screen: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE_NS.CanvasTexture } | null = null;
  private state: LiveDrugRunState | null = null;
  private builtHash: string | null = null;
  private moleculeSmiles: string | null = null;
  private moleculeAtoms = 0;
  private poseAtoms = 0;
  private poseSha: string | null = null;
  private readonly conformers = new Map<string, Promise<MoleculeMaterialisation | null>>();
  private time = 0;
  // THE PERSON DOING THE EXPERIMENT (gate B): the scientist, the vial they carry, and the task clock.
  private scientist: Character | null = null;
  private carried: THREE_NS.Group | null = null;
  private carriedId: string | null = null;
  private carriedColour = 0;
  private handling: BenchHandling | null = null;
  private layout: BenchLayout | null = null;
  private taskKey: string | null = null;
  private taskElapsedMs = 0;
  private standX = 0;
  private walking = 0;
  private lastHiddenVial: THREE_NS.Object3D | null = null;
  // A record of what the hands HAVE ACTUALLY DONE in this session, so a check does not depend on
  // catching the right frame. Written only when the movement is rendered, never in advance.
  private readonly actionsSeen = new Set<string>();
  private readonly instrumentsSeen = new Set<string>();
  private minGripSeparationM = Number.POSITIVE_INFINITY;

  constructor(private readonly source: MoleculeGeometrySource = createBackendGeometrySource()) {}

  get renderedStateHash(): string | null { return this.builtHash; }
  get atomsShown(): number { return this.moleculeAtoms; }
  /** Heavy atoms of the docked pose currently drawn in the pocket (0 until Vina produced one). */
  get poseAtomsShown(): number { return this.poseAtoms; }
  get poseHashShown(): string | null { return this.poseSha; }

  /**
   * WHAT THE SCENE IS REALLY DOING WITH ITS HANDS. These report the rendered fact, not the intention:
   * `handSnapshot().carriedInHand` is the id of the vial whose mesh is parented to the hand joint at
   * this moment, and `gripSeparationM` is the measured distance between that mesh and the grip point —
   * so a test can prove the sample is IN the hand and not merely somewhere near it. Null when the layer
   * is not attached or the run has not reached the bench.
   */
  handSnapshot(): {
    readonly action: string; readonly instrument: string; readonly sampleId: string | null;
    readonly sampleLabel: string | null; readonly note: string; readonly represents: string;
    readonly carriedInHand: string | null; readonly gripSeparationM: number | null;
    readonly scientistPresent: boolean; readonly standX: number;
    readonly actionsSeen: readonly string[]; readonly instrumentsSeen: readonly string[];
    readonly minGripSeparationM: number | null;
  } | null {
    const h = this.handling;
    if (!h) return null;
    const carried = this.carried;
    const inHand = Boolean(carried?.visible) && carried?.parent === this.scientist?.rightGrip;
    let separation: number | null = null;
    if (inHand && carried && this.scientist && this.THREE) {
      const a = new this.THREE.Vector3(); const b = new this.THREE.Vector3();
      carried.getWorldPosition(a); this.scientist.rightGrip.getWorldPosition(b);
      separation = a.distanceTo(b);
    }
    return {
      action: h.action, instrument: h.instrument, sampleId: h.sampleId, sampleLabel: h.sampleLabel,
      note: h.note, represents: h.represents,
      carriedInHand: inHand ? this.carriedId : null, gripSeparationM: separation,
      scientistPresent: Boolean(this.scientist), standX: this.standX,
      actionsSeen: [...this.actionsSeen], instrumentsSeen: [...this.instrumentsSeen],
      minGripSeparationM: Number.isFinite(this.minGripSeparationM) ? this.minGripSeparationM : null,
    };
  }

  setRun(run: LiveDrugRun | null): void { this.state = run?.state ?? null; }

  attach(THREE: typeof THREE_NS, scene: THREE_NS.Scene): void {
    this.THREE = THREE;
    const station = scene.getObjectByName(`station:${DRUG_BENCH_STATION_ID}`);
    if (!station) return;
    const root = new THREE.Group(); root.name = 'drug-bench:layer';
    const mat = createGenesisMaterialPalette(THREE);
    const glass = createScientificGlass(THREE);
    // The bench of a real workstation: work surface, sample rack, ADMET analyser, docking console + monitor.
    root.add(createBench(THREE, { position: [0, 0, 0], width: 2.6, depth: 1.05, height: 0.93, topMaterial: mat.CERAMIC, legMaterial: mat.BRUSHED_METAL }));
    root.add(createCabinet(THREE, { position: [-1.5, 0, -0.1], width: 0.62, depth: 0.6, height: 1.05, bodyMaterial: mat.PAINTED_METAL, doorMaterial: mat.BRUSHED_METAL }));
    // GFX-1 BENCH PASS. A white slab on legs is a table; a laboratory bench has a work surface with a
    // machined edge, a splash-back the instruments stand against, cable trunking along it and storage
    // underneath. This is the furniture every close-up of the hands frames, so it is worth the parts.
    const worktop = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.012, 1.0), mat.TECH_COMPOSITE);
    worktop.position.set(0, 0.937, 0); root.add(worktop);
    for (const z of [-0.5, 0.5]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.022, 0.016), mat.POLISHED_METAL);
      edge.position.set(0, 0.934, z); root.add(edge);
    }
    const splash = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.26, 0.02), mat.BRUSHED_METAL);
    splash.position.set(0, 1.06, -0.52); root.add(splash);
    // Cable trunking with a couple of runs leaving it: the instruments are connected to something.
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.05, 0.06), mat.PAINTED_METAL);
    trunk.position.set(0, 0.86, -0.49); root.add(trunk);
    for (const [x, r] of [[-1.1, 0.07], [0.38, 0.055]] as const) {
      const run = new THREE.Mesh(new THREE.TorusGeometry(r, 0.007, 6, 18, Math.PI), mat.RUBBER);
      run.rotation.set(Math.PI / 2, 0, 0); run.position.set(x, 0.86, -0.42); root.add(run);
    }
    // Under-bench storage: a shelf and two drawer stacks, so the bench has mass instead of legs.
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.02, 0.8), mat.BRUSHED_METAL);
    shelf.position.set(0, 0.32, -0.04); root.add(shelf);
    for (const x of [-0.95, 0.85]) {
      const stack = new THREE.Group(); stack.position.set(x, 0.33, -0.02); root.add(stack);
      stack.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.58, 0.72), mat.PAINTED_METAL));
      for (let i = 0; i < 3; i += 1) {
        const face = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.02), mat.BRUSHED_METAL);
        face.position.set(0, 0.19 - i * 0.19, 0.37); stack.add(face);
        const pull = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.016), mat.POLISHED_METAL);
        pull.position.set(0, 0.19 - i * 0.19, 0.388); stack.add(pull);
      }
    }

    // SAMPLE RACK — the area the hands work in, so it is built like a machined rack rather than a
    // plinth: a milled block with a drilled well under every slot, a raised lip, zone dividers and a
    // label strip. One vial per persisted candidate, one row per stage of the funnel.
    this.rack = new THREE.Group(); this.rack.position.set(-0.72, 0.93, 0.12); root.add(this.rack);
    const rackDepth = BENCH_ZONES.length * ROW_Z + 0.04;
    const rackWidth = SLOTS_PER_ROW * SLOT_X + 0.04;
    const rackBody = new THREE.Mesh(new THREE.BoxGeometry(rackWidth, 0.05, rackDepth), mat.BRUSHED_METAL);
    rackBody.position.set(0, 0.025, (BENCH_ZONES.length - 1) * ROW_Z / 2); this.rack.add(rackBody);
    // Raised lip around the block: a rack holds its vials in, a table does not.
    const lipGeo = new THREE.BoxGeometry(rackWidth + 0.012, 0.014, 0.008);
    for (const side of [-1, 1]) {
      const lip = new THREE.Mesh(lipGeo, mat.POLISHED_METAL);
      lip.position.set(0, 0.057, (BENCH_ZONES.length - 1) * ROW_Z / 2 + side * (rackDepth / 2 - 0.004));
      this.rack.add(lip);
    }
    // A drilled well per slot and a coloured divider per zone: the funnel is machined into the rack.
    const wellGeo = new THREE.CylinderGeometry(0.021, 0.021, 0.016, 14);
    const wellMat = new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: 0.85, metalness: 0.2 });
    for (let row = 0; row < BENCH_ZONES.length; row += 1) {
      for (let col = 0; col < SLOTS_PER_ROW; col += 1) {
        const well = new THREE.Mesh(wellGeo, wellMat);
        well.position.set(-0.19 + col * SLOT_X, 0.048, row * ROW_Z);
        this.rack.add(well);
      }
      const zone = BENCH_ZONES[row]!;
      const divider = new THREE.Mesh(new THREE.BoxGeometry(rackWidth, 0.004, 0.006), new THREE.MeshStandardMaterial({ color: ZONE_COLOR[zone], emissive: ZONE_COLOR[zone], emissiveIntensity: 0.45, roughness: 0.6 }));
      divider.position.set(0, 0.052, row * ROW_Z - ROW_Z / 2 + 0.006);
      this.rack.add(divider);
    }
    this.vialGlass = glass;

    // GFX-1 EQUIPMENT PASS. A box with a lid reads as furniture; a bench analyser reads as an
    // instrument because of its housing seams, its ventilation, its control strip, the drawer the
    // sample actually goes into and the cable that leaves it. Everything below is geometry over the
    // same materials — it adds no measurement, claims no sensor, and the epistemic labels are
    // unchanged: this instrument stands for a MODEL_ESTIMATE and says so on its own screen.
    const slats = (w: number, h: number, count: number, m: THREE_NS.Material): THREE_NS.Group => {
      const g = new THREE.Group();
      const geo = new THREE.BoxGeometry(w, h / (count * 2), 0.004);
      for (let i = 0; i < count; i += 1) {
        const bar = new THREE.Mesh(geo, m); bar.position.y = (i - (count - 1) / 2) * (h / count); g.add(bar);
      }
      return g;
    };
    const buttonRow = (count: number, spacing: number, colour: number): THREE_NS.Group => {
      const g = new THREE.Group();
      const geo = new THREE.CylinderGeometry(0.008, 0.008, 0.006, 10);
      const m = new THREE.MeshStandardMaterial({ color: 0x0b1118, emissive: colour, emissiveIntensity: 0.5, roughness: 0.5 });
      for (let i = 0; i < count; i += 1) {
        const b = new THREE.Mesh(geo, m); b.rotation.x = Math.PI / 2; b.position.x = (i - (count - 1) / 2) * spacing; g.add(b);
      }
      return g;
    };

    // ADMET ANALYSER — a bench instrument: painted steel housing, recessed front, drawer, controls.
    const analyser = new THREE.Group(); analyser.position.set(-1.5, 1.05, -0.1); root.add(analyser);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.52), mat.PAINTED_METAL); analyser.add(housing);
    const topPlate = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.02, 0.54), mat.BRUSHED_METAL); topPlate.position.y = 0.2; analyser.add(topPlate);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.5), mat.RUBBER); foot.position.y = -0.2; analyser.add(foot);
    // Recessed front bezel: the seam that makes a housing look machined instead of extruded.
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.32, 0.02), mat.TECH_COMPOSITE); bezel.position.set(0, 0, 0.255); analyser.add(bezel);
    // The drawer the sample goes into — this is the port the hands aim at.
    const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.04), mat.BRUSHED_METAL); drawer.position.set(-0.08, 0.1, 0.272); analyser.add(drawer);
    const drawerHandle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.018), mat.POLISHED_METAL); drawerHandle.position.set(-0.08, 0.1, 0.292); analyser.add(drawerHandle);
    const vents = slats(0.16, 0.18, 7, mat.BRUSHED_METAL); vents.position.set(0.22, -0.02, 0.268); analyser.add(vents);
    const controls = buttonRow(4, 0.032, 0x38bdf8); controls.position.set(-0.13, -0.09, 0.27); analyser.add(controls);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.02, 16), mat.POLISHED_METAL);
    knob.rotation.x = Math.PI / 2; knob.position.set(0.02, -0.09, 0.272); analyser.add(knob);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.03), mat.POLISHED_METAL); plate.position.set(-0.19, 0.16, 0.267); analyser.add(plate);
    // A cable leaving the instrument: nothing in a laboratory stands unconnected.
    const cable = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.008, 6, 20, Math.PI * 1.1), mat.RUBBER);
    cable.rotation.set(Math.PI / 2, 0, 0.6); cable.position.set(0.3, -0.16, -0.22); analyser.add(cable);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.34), mat.POLISHED_METAL);
    lid.position.set(0, 0.185, 0.02); analyser.add(lid); this.analyserLid = lid;
    this.analyserLamp = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10), new THREE.MeshStandardMaterial({ color: 0x0f172a, emissive: 0x22d3ee, emissiveIntensity: 0 }));
    this.analyserLamp.position.set(0.24, 0.13, 0.272); analyser.add(this.analyserLamp);
    const analyserReadout = makeReadoutSurface(THREE, 384, 192);
    this.analyserScreen = analyserReadout;
    const analyserPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), createScreenMaterial(THREE, analyserReadout.texture, { emissiveIntensity: 0.55 }));
    analyserPanel.position.set(-0.06, 0.005, 0.268); analyser.add(analyserPanel);

    // DOCKING WORKSTATION — the compute side of the bench: a rack unit with a lit front panel, a
    // monitor on a proper arm, a keyboard deck and the cable run between them. It computes; it
    // measures nothing, and the panel says which engine is running.
    const rack = new THREE.Group(); rack.position.set(0.95, 0.35, -0.3); root.add(rack);
    rack.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.7, 0.44), mat.PAINTED_METAL));
    const rackFace = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.64, 0.02), mat.TECH_COMPOSITE); rackFace.position.z = 0.225; rack.add(rackFace);
    for (let i = 0; i < 4; i += 1) {
      const bay = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.11, 0.02), mat.BRUSHED_METAL);
      bay.position.set(0, 0.21 - i * 0.15, 0.24); rack.add(bay);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshStandardMaterial({ color: 0x0b1118, emissive: i === 0 ? 0x62f0a3 : 0x38bdf8, emissiveIntensity: 1.1 }));
      led.position.set(0.11, 0.21 - i * 0.15, 0.253); rack.add(led);
    }
    const rackVents = slats(0.24, 0.12, 6, mat.BRUSHED_METAL); rackVents.position.set(0, -0.26, 0.242); rack.add(rackVents);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.028, 0.32), mat.BRUSHED_METAL);
    deck.position.set(0.55, 0.95, 0.26); deck.rotation.x = -0.18; root.add(deck);
    const keys = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.008, 0.2), mat.TECH_COMPOSITE);
    keys.position.set(0.55, 0.972, 0.258); keys.rotation.x = -0.18; root.add(keys);
    const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.012, 0.05), mat.RUBBER);
    wrist.position.set(0.55, 0.962, 0.375); wrist.rotation.x = -0.18; root.add(wrist);
    this.busyLamp = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10), new THREE.MeshStandardMaterial({ color: 0x0f172a, emissive: 0xf59e0b, emissiveIntensity: 0 }));
    this.busyLamp.position.set(0.95, 0.99, 0.26); root.add(this.busyLamp);
    const readout = makeReadoutSurface(THREE, 768, 384);
    this.screen = { canvas: readout.canvas, texture: readout.texture, ctx: readout.ctx };
    // Monitor arm: a post with an elbow, so the screen is held rather than balanced on a stub.
    const armPost = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.42, 12), mat.BRUSHED_METAL);
    armPost.position.set(0.55, 1.14, -0.34); root.add(armPost);
    const armElbow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.03), mat.BRUSHED_METAL);
    armElbow.position.set(0.55, 1.33, -0.3); armElbow.rotation.z = 0.12; root.add(armElbow);
    root.add(createMonitor(THREE, { position: [0.55, 0.93, -0.26], width: 0.94, height: 0.54, standHeight: 0.4, frameMaterial: mat.BRUSHED_METAL, screenMaterial: createScreenMaterial(THREE, readout.texture, { emissiveIntensity: 0.6 }) }));

    // The manipulator that moves the sample: it only works while a real step is under way.
    this.arm = createManipulatorArm(THREE, { position: [-0.15, 0.93, -0.3], headingRadians: Math.PI, scale: 0.55, linkMaterial: mat.BRUSHED_METAL, jointMaterial: mat.POLISHED_METAL, baseMaterial: mat.PAINTED_METAL });
    root.add(this.arm.group);

    // The two holograms above the bench: the candidate molecule and the receptor pocket with the pose.
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.06, 36), new THREE.MeshStandardMaterial({ color: 0x0b1220, emissive: 0x0e7490, emissiveIntensity: 0.9, roughness: 0.3 }));
    plinth.position.set(0, 0.96, 0); root.add(plinth);
    this.molecule = new THREE.Group(); this.molecule.position.set(0, HOLO_Y, 0.05); root.add(this.molecule);
    this.cloud = new THREE.Group(); this.cloud.position.set(0, 1.25, 0.05); root.add(this.cloud);
    this.rings = new THREE.Group(); this.rings.position.set(0, 1.0, 0); root.add(this.rings);
    // OBSERVATION STATION — the pose is looked at through something, not floating in the room: a
    // plinth, a dark shroud behind it so the structure reads against a surface, and the sign that
    // says what it is. No lens, no eyepiece, nothing that would suggest a microscope.
    const viewerBase = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.05, 28), mat.PAINTED_METAL);
    viewerBase.position.set(0.95, 0.955, 0.05); root.add(viewerBase);
    const viewerRim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.008, 8, 32), mat.POLISHED_METAL);
    viewerRim.rotation.x = Math.PI / 2; viewerRim.position.set(0.95, 0.985, 0.05); root.add(viewerRim);
    const viewerPost = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.55, 14), mat.BRUSHED_METAL);
    viewerPost.position.set(0.95, 1.25, -0.16); root.add(viewerPost);
    const shroud = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.52), new THREE.MeshStandardMaterial({ color: 0x070b11, roughness: 0.95, metalness: 0 }));
    shroud.position.set(0.95, HOLO_Y - 0.04, -0.18); root.add(shroud);
    this.pocket = new THREE.Group(); this.pocket.position.set(0.95, HOLO_Y - 0.06, 0.05); root.add(this.pocket);
    // WHAT THE OBSERVATION IS. The thing being observed is a computed pose, not a photograph: the sign
    // above it says so in the world itself, so nobody can mistake the station for a microscope.
    const poseSign = makeReadoutSurface(THREE, 512, 128);
    const g = poseSign.ctx;
    g.fillStyle = 'rgba(8,18,32,0.92)'; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#fbbf24'; g.lineWidth = 3; g.strokeRect(2, 2, 508, 124);
    g.fillStyle = '#fbbf24'; g.font = 'bold 26px monospace'; g.fillText('MODEL OBLICZENIOWY', 16, 42);
    g.fillStyle = '#e2e8f0'; g.font = '20px monospace';
    g.fillText('poza z AutoDock Vina w kieszeni 1IEP', 16, 76);
    g.fillText('to NIE jest obraz z mikroskopu', 16, 106);
    poseSign.texture.needsUpdate = true;
    const poseLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.11), createScreenMaterial(THREE, poseSign.texture, { emissiveIntensity: 0.5 }));
    poseLabel.position.set(0.95, HOLO_Y + 0.24, 0.05); poseLabel.name = 'drug-pose:label';
    root.add(poseLabel);
    // THE PERSON AT THE BENCH (gate B): a suited scientist who walks between the instruments, grips the
    // vial and puts it in. The rig is the same one every Genesis world uses — no second character system.
    const scientist = buildCharacter(THREE, {
      height: 1.74,
      suit: { fabric: 0xe9edf2, trim: 0x22d3ee, gloves: 0x1e2a38, boots: 0x161b22, visor: 0x7dd3fc, lamp: 0x38bdf8 },
    });
    this.scientist = scientist;
    this.standX = WORK_SPOT.RACK.standX;
    scientist.root.position.set(this.standX, 0, STAND_Z);
    scientist.setFacing(Math.PI); // turned toward the bench
    scientist.update('idle', 0, 0);
    root.add(scientist.root);

    // The vial in transit: one mesh, re-coloured for whichever sample is being handled. It is parented
    // to the hand while carried and to the instrument's port once placed — never duplicated in the rack.
    const carried = new THREE.Group(); carried.name = 'drug-vial-carried'; carried.visible = false;
    const carriedBody = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.085, 16, 1, true), glass);
    carriedBody.position.y = 0.043; carried.add(carriedBody);
    const carriedLiquid = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 14), new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.8, transparent: true, opacity: 0.85 }));
    carriedLiquid.position.y = 0.028; carriedLiquid.name = 'carried-liquid'; carried.add(carriedLiquid);
    const carriedCap = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.012, 14), new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.6 }));
    carriedCap.position.y = 0.09; carried.add(carriedCap);
    root.add(carried);
    this.carried = carried;

    // Anchors the camera frames: their world position follows the station, so no coordinate is hard-coded twice.
    for (const [focus, pos] of [['BENCH', [0, 1.2, 0.5]], ['SAMPLES', [-0.72, 1.05, 0.2]], ['ANALYSER', [-1.5, 1.2, 0.2]], ['RECEPTOR', [0.95, HOLO_Y, 0.05]], ['WORKSTATION', [0.55, 1.15, 0.1]], ['POSE', [0.95, HOLO_Y, 0.05]], ['MONITOR', [0.55, 1.35, -0.2]]] as const) {
      const anchor = new THREE.Object3D(); anchor.position.set(pos[0], pos[1], pos[2]); anchor.name = `drug-bench:focus:${focus}`;
      root.add(anchor); this.anchors.set(focus, anchor);
    }
    station.add(root);
    this.root = root;
    this.drawPanel(null);
  }

  /** Called every frame after the scene's own sync: rebuilds only when the state hash changes. */
  sync(dt: number): void {
    this.time += dt;
    if (this.molecule) this.molecule.rotation.y += dt * 0.35;
    const state = this.state;
    const hash = state?.stateHash ?? null;
    if (hash !== this.builtHash && this.THREE && this.root) {
      this.builtHash = hash;
      this.procedure = labProcedureOf(state, state ? focusCandidate(state) : null);
      this.layout = state ? benchLayoutOf(state) : null;
      this.rebuild(state);
    }
    this.driveInstruments(dt);
    this.driveScientist(dt);
  }

  /**
   * THE HANDS. What the scientist does comes from `benchHandlingOf` — the same canonical state the rack
   * and the instruments read. Only the movement's progress is local: a task clock that RESETS when the
   * backend gives the hands a new task and CLAMPS when it does not, so the person ends up standing at
   * the instrument, working, instead of miming a loop that suggests progress nobody measured.
   */
  private driveScientist(dt: number): void {
    const scientist = this.scientist;
    if (!scientist || !this.procedure || !this.layout) return;
    // The task's identity never depends on the movement, so it can time itself. It is keyed on the
    // PHASE and the INSTRUMENT, not on the sample: while the backend feeds one stage sample after
    // sample, the person is doing one continuous job at one instrument, and restarting the gesture on
    // every new vial would leave them forever reaching and never putting anything in. The vial in the
    // hand is still whichever sample the record places at that stage.
    const task = benchHandlingOf(this.procedure, this.layout, 1);
    const key = `${task.phaseId ?? '-'}:${task.instrument}`;
    if (key !== this.taskKey) { this.taskKey = key; this.taskElapsedMs = 0; }
    else this.taskElapsedMs += dt * 1000;
    const handling = benchHandlingOf(this.procedure, this.layout, transferMotion(this.taskElapsedMs));
    this.handling = handling;

    // Walk to the instrument being worked at; while walking, the walk cycle runs (no foot sliding).
    const spot = WORK_SPOT[handling.instrument];
    const dx = spot.standX - this.standX;
    const step = WALK_SPEED * dt;
    if (Math.abs(dx) > step) { this.standX += Math.sign(dx) * step; this.walking = Math.min(1, this.walking + dt * 4); }
    else { this.standX = spot.standX; this.walking = Math.max(0, this.walking - dt * 4); }
    scientist.root.position.set(this.standX, 0, STAND_Z);
    scientist.setFacing(Math.PI);
    scientist.update(this.walking > 0.05 ? 'walk' : 'idle', this.time, this.walking);
    const [reach, pitch] = REACH_BY_ACTION[handling.action] ?? [0, 0];
    // No reaching while still on the way there: the arm extends once the person has arrived.
    const arrived = 1 - Math.min(1, this.walking);
    scientist.reach(reach * arrived, pitch * arrived);
    scientist.setGrip(handling.carrying ? 1 : handling.action === 'REACH' ? 0.25 : 0);
    this.placeCarriedVial(handling, spot.port);
    // Recorded after the frame was built, from the frame itself.
    this.actionsSeen.add(handling.action);
    // Every place the hands worked, the rack included: it is where samples are labelled and set down,
    // and leaving it out made the record disagree with what the panel showed live.
    this.instrumentsSeen.add(handling.instrument);
    if (handling.carrying && this.carried?.parent === scientist.rightGrip && this.THREE) {
      const a = new this.THREE.Vector3(); const b = new this.THREE.Vector3();
      this.carried.getWorldPosition(a); scientist.rightGrip.getWorldPosition(b);
      this.minGripSeparationM = Math.min(this.minGripSeparationM, a.distanceTo(b));
    }
  }

  /**
   * The vial follows the hand while it is carried and sits in the instrument's port once placed. The
   * same sample is never in two places: its rack vial is hidden for as long as it is out of the rack.
   */
  private placeCarriedVial(handling: BenchHandling, port: readonly [number, number, number]): void {
    const carried = this.carried;
    const scientist = this.scientist;
    if (!carried || !scientist || !this.THREE) return;
    const holdsIt = handling.carrying;
    const inInstrument = !holdsIt && handling.sampleId !== null && handling.instrument !== 'RACK'
      && (handling.action === 'OPERATE' || handling.action === 'OBSERVE');
    const show = holdsIt || inInstrument;
    if (handling.sampleId !== this.carriedId) {
      this.carriedId = handling.sampleId;
      carried.name = handling.sampleId ? `drug-vial-carried:${handling.sampleId}` : 'drug-vial-carried';
      const zone = this.layout?.samples.find((s) => s.id === handling.sampleId)?.zone ?? 'QUEUE';
      const colour = ZONE_COLOR[zone];
      if (colour !== this.carriedColour) {
        this.carriedColour = colour;
        const liquid = carried.getObjectByName('carried-liquid') as THREE_NS.Mesh | undefined;
        const m = liquid?.material as THREE_NS.MeshStandardMaterial | undefined;
        if (m) { m.color.setHex(colour); m.emissive.setHex(colour); }
      }
    }
    carried.visible = show;
    const wantedParent = holdsIt ? scientist.rightGrip : this.root;
    if (show && carried.parent !== wantedParent) wantedParent?.add(carried); // add() reparents
    if (show) {
      if (holdsIt) carried.position.set(0, 0, 0);
      else carried.position.set(port[0], port[1], port[2]); // port coordinates are already in the layer's frame
    }
    // The rack must not show a vial that is in the hand or in an instrument.
    const rackVial = handling.sampleId ? this.rack?.getObjectByName(`drug-vial:${handling.sampleId}`) : null;
    if (this.lastHiddenVial && this.lastHiddenVial !== rackVial) this.lastHiddenVial.visible = true;
    if (rackVial) rackVial.visible = !show;
    this.lastHiddenVial = show ? rackVial ?? null : null;
  }

  /**
   * The instruments read the procedure, which reads the canonical state: an instrument works only while
   * a phase that a persisted record put into ACTIVE is under way. Nothing here invents a step.
   */
  private driveInstruments(dt: number): void {
    const phases = this.procedure?.phases ?? [];
    const statusOf = (id: string) => phases.find((p) => p.id === id)?.status ?? 'PENDING';
    const loading = statusOf('LOAD') === 'ACTIVE';
    const analysed = statusOf('LOAD') === 'DONE';
    const docking = statusOf('EXECUTE') === 'ACTIVE';
    const preparing = statusOf('CONFIGURE') === 'ACTIVE';
    const working = loading || docking || preparing;
    if (this.arm) { this.arm.setActive(working); this.arm.update(this.time); }
    if (this.analyserLid) this.analyserLid.position.z = 0.02 + (loading || analysed ? 0 : 0.12);
    if (this.analyserLamp) {
      const m = this.analyserLamp.material as THREE_NS.MeshStandardMaterial;
      m.emissiveIntensity = loading ? 0.6 + Math.sin(this.time * 4) * 0.35 : analysed ? 0.5 : 0;
    }
    if (this.busyLamp) {
      const m = this.busyLamp.material as THREE_NS.MeshStandardMaterial;
      m.emissiveIntensity = docking ? 0.7 + Math.sin(this.time * 6) * 0.3 : statusOf('MEASURE') === 'DONE' ? 0.35 : 0;
    }
    void dt;
  }

  /** Vials are rebuilt with the state; the rack body itself (its first child) stays. */
  private clearVials(): void {
    if (!this.rack) return;
    for (const child of [...this.rack.children].filter((c) => c.name.startsWith('drug-vial:'))) {
      this.rack.remove(child);
      child.traverse((o) => { const m = o as THREE_NS.Mesh; m.geometry?.dispose?.(); });
    }
  }

  private clear(group: THREE_NS.Group | null): void {
    if (!group) return;
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse((o) => { const m = o as THREE_NS.Mesh; m.geometry?.dispose?.(); });
    }
  }

  private rebuild(state: LiveDrugRunState | null): void {
    const THREE = this.THREE!;
    this.drawPanel(state);
    this.clear(this.cloud); this.clear(this.rings);
    this.clearVials();
    if (!state) { this.clear(this.molecule); this.clear(this.pocket); this.moleculeSmiles = null; this.moleculeAtoms = 0; this.poseAtoms = 0; this.poseSha = null; return; }
    const focus = focusCandidate(state);
    // THE FUNNEL, VISIBLE: one vial per persisted candidate, standing in the row of the stage it has
    // actually reached (queue → analyser → docking → finalists → discard tray). Its row comes from
    // `benchLayoutOf`, which reads only what the backend wrote — nothing moves on a timer, and a
    // candidate the backend has not written is not on the bench at all.
    const layout = benchLayoutOf(state);
    for (const sample of layout.samples) {
      const column = sample.slot % SLOTS_PER_ROW;
      const overflow = Math.floor(sample.slot / SLOTS_PER_ROW); // a crowded row stacks slightly behind
      const vial = new THREE.Group();
      vial.position.set(-0.19 + column * SLOT_X, 0.05, ZONE_ROW[sample.zone] * ROW_Z + overflow * 0.018);
      vial.name = `drug-vial:${sample.id}`;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.085, 16, 1, true), this.vialGlass!);
      body.position.y = 0.043; vial.add(body);
      const colour = sample.active ? 0xfbbf24 : ZONE_COLOR[sample.zone];
      const glow = sample.zone === 'DISCARD' ? 0.05 : sample.active ? 0.85 : sample.zone === 'FINALIST' ? 0.6 : 0.3;
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 14), new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: glow, transparent: true, opacity: 0.85 }));
      liquid.position.y = 0.028; vial.add(liquid);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.012, 14), new THREE.MeshStandardMaterial({ color: sample.zone === 'DISCARD' ? 0x334155 : 0x0ea5e9, roughness: 0.6 }));
      cap.position.y = 0.09; vial.add(cap);
      // A finalist stands on a podium whose height is its rank, so the comparison is visible at a glance.
      if (sample.rank !== null) {
        const podium = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.012 + Math.max(0, 3 - sample.rank) * 0.008, 16), new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x92400e, emissiveIntensity: 0.4, roughness: 0.4 }));
        podium.position.y = 0.006; vial.add(podium);
      }
      this.rack!.add(vial);
    }
    // Stage rings: an arc per stage, its length = measured / planned. No measurement → no arc.
    (['admet', 'docking', 'quantum'] as const).forEach((stage, i) => {
      const p = state.progress[stage];
      if (!p.planned || !p.done) return;
      const arc = Math.max(0.05, (p.done / p.planned) * Math.PI * 2);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46 + i * 0.05, 0.008, 8, 64, arc), new THREE.MeshBasicMaterial({ color: STAGE_COLOR[stage] }));
      ring.rotation.x = -Math.PI / 2; ring.name = `drug-stage:${stage}`;
      this.rings!.add(ring);
    });
    this.showPose(focus?.pose ?? null);
    if (focus && focus.smiles !== this.moleculeSmiles) void this.showMolecule(focus.smiles);
  }

  /**
   * The real docking result: the receptor residues lining the pocket as a faint cage, and inside it the
   * top Vina pose, both in the receptor's own frame (centred on the pose so the bench can show it).
   */
  private showPose(pose: DockedPose | null): void {
    const THREE = this.THREE!;
    this.clear(this.pocket);
    this.poseAtoms = 0;
    this.poseSha = pose?.poseSha256 ?? null;
    if (!pose || !pose.atoms.length) return;
    const n = pose.atoms.length;
    const mean = (axis: 1 | 2 | 3) => pose.atoms.reduce((a, t) => a + t[axis], 0) / n;
    const c = [mean(1), mean(2), mean(3)];
    const place = (x: number, y: number, z: number): [number, number, number] => [(x - c[0]!) * MOLECULE_SCALE, (y - c[1]!) * MOLECULE_SCALE, (z - c[2]!) * MOLECULE_SCALE];
    const pocketMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.28, depthWrite: false });
    for (const [, x, y, z] of pose.pocketAtoms) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), pocketMat);
      dot.position.set(...place(x, y, z));
      this.pocket!.add(dot);
    }
    const positions = pose.atoms.map(([, x, y, z]) => place(x, y, z));
    pose.atoms.forEach(([element], i) => {
      const atom = createAtomSphere(THREE, { element, radius: elementStyleOf(element).radius * MOLECULE_SCALE * 1.5 });
      atom.position.set(...positions[i]!);
      this.pocket!.add(atom);
    });
    const bondMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35, emissive: 0x854d0e, emissiveIntensity: 0.4 });
    for (const [a, b, order] of pose.bonds) {
      const from = positions[a], to = positions[b];
      if (!from || !to) continue;
      this.pocket!.add(createBond(THREE, { from, to, order: Math.round(order) || 1, aromatic: order === 1.5, material: bondMat, aromaticMaterial: bondMat, radius: 0.007 }));
    }
    this.pocket!.name = `drug-pose:${pose.poseSha256.slice(0, 12)}`;
    this.poseAtoms = n;
  }

  private async showMolecule(smiles: string): Promise<void> {
    this.moleculeSmiles = smiles;
    let pending = this.conformers.get(smiles);
    if (!pending) {
      pending = this.source(smiles, 42).then((r) => (r.ok ? r.data : null)).catch(() => null);
      this.conformers.set(smiles, pending);
    }
    const data = await pending;
    if (this.moleculeSmiles !== smiles || !this.THREE || !this.molecule) return;
    const THREE = this.THREE;
    this.clear(this.molecule);
    this.moleculeAtoms = 0;
    if (!data) return;
    const n = data.atoms.length;
    const cx = data.atoms.reduce((a, t) => a + t.x, 0) / n, cy = data.atoms.reduce((a, t) => a + t.y, 0) / n, cz = data.atoms.reduce((a, t) => a + t.z, 0) / n;
    const pos = data.atoms.map((t) => [(t.x - cx) * MOLECULE_SCALE, (t.y - cy) * MOLECULE_SCALE, (t.z - cz) * MOLECULE_SCALE] as [number, number, number]);
    data.atoms.forEach((t, i) => {
      const atom = createAtomSphere(THREE, { element: t.element, radius: elementStyleOf(t.element).radius * MOLECULE_SCALE * 1.6 });
      atom.position.set(...pos[i]!);
      this.molecule!.add(atom);
    });
    const bondMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.4 });
    const aromatic = new THREE.MeshStandardMaterial({ color: 0x93c5fd, roughness: 0.4 });
    for (const b of data.bonds) {
      const from = pos[b.a], to = pos[b.b];
      if (!from || !to) continue;
      this.molecule!.add(createBond(THREE, { from, to, order: b.order, aromatic: Boolean(b.aromatic), material: bondMat, aromaticMaterial: aromatic, radius: 0.006 }));
    }
    this.moleculeAtoms = n;
  }

  /** The workstation monitor: what the engines wrote, in plain language, with its epistemic label. */
  private drawPanel(state: LiveDrugRunState | null): void {
    this.drawAnalyser(state);
    if (!this.screen) return;
    const { canvas, texture, ctx: g } = this.screen;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = 'rgba(8,18,32,0.94)'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.strokeStyle = '#22d3ee'; g.lineWidth = 3; g.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    g.fillStyle = '#a5f3fc'; g.font = 'bold 28px monospace';
    g.fillText('STANOWISKO DOKOWANIA', 24, 44);
    g.font = '22px monospace'; g.fillStyle = '#e2e8f0';
    if (!state) { g.fillText('Czekam na uruchomienie eksperymentu…', 24, 96); texture.needsUpdate = true; return; }
    const focus = focusCandidate(state);
    const procedure = this.procedure ?? labProcedureOf(state, focus);
    const active = procedure.phases.find((p) => p.id === procedure.activeId) ?? null;
    const lines = [
      `Etap: ${active ? active.title : 'zakończony'}`,
      active?.detail ? `   ${active.detail.slice(0, 52)}` : '',
      `Cel: ${state.target ? `PDB ${state.target.pdbId}:${state.target.chain}, ${state.target.receptorAtoms} atomów` : '—'}`,
      `Kandydat: ${focus?.smiles.slice(0, 40) ?? '—'}`,
      `Vina: ${fmt(focus?.stages.docking?.value, 'kcal/mol')}   QM: ${fmt(focus?.stages.quantum?.value, 'eV')}`,
      `Poza: ${focus?.pose ? `${focus.pose.atoms.length} atomów w kieszeni` : '—'}`,
      `${active?.evidence ?? 'REAL_ENGINE_OUTPUT'} · stan ${state.stateHash}`,
    ];
    lines.forEach((line, i) => { if (line) g.fillText(line, 24, 92 + i * 38); });
    texture.needsUpdate = true;
  }

  /** The ADMET analyser's own small screen: model predictions, never presented as a measurement. */
  private drawAnalyser(state: LiveDrugRunState | null): void {
    if (!this.analyserScreen) return;
    const { canvas, texture, ctx: g } = this.analyserScreen;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = 'rgba(4,14,26,0.95)'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#5eead4'; g.font = 'bold 22px monospace';
    g.fillText('ANALIZATOR ADMET', 14, 32);
    g.font = '18px monospace'; g.fillStyle = '#cbd5e1';
    g.fillText('MODEL_ESTIMATE', 14, 58);
    const endpoints = state ? focusCandidate(state)?.stages.admet?.endpoints : null;
    if (!endpoints) { g.fillText('brak predykcji', 14, 96); texture.needsUpdate = true; return; }
    Object.entries(endpoints).slice(0, 4).forEach(([k, v], i) => g.fillText(`${k}: ${v.toFixed(2)}`, 14, 92 + i * 26));
    texture.needsUpdate = true;
  }

  /**
   * Where the camera should look right now: the world position of the anchor belonging to the active
   * phase (the bench itself before anything starts). Null while the layer is not attached.
   */
  cameraTarget(out: THREE_NS.Vector3): { readonly focus: BenchFocus; readonly radius: number } | null {
    if (!this.root || !this.THREE) return null;
    // While a sample is being handled the shot is on the hands — that is the experiment happening, and
    // it is what a viewer must see. The moment the hands let go, the camera returns to the phase's own
    // subject (the instrument, the pocket, the monitor).
    const hands = this.handling;
    if (hands && this.scientist && (hands.carrying || hands.action === 'REACH')) {
      this.scientist.rightGrip.getWorldPosition(out);
      return { focus: 'HANDS', radius: 0.42 };
    }
    const focus = this.procedure?.phases.find((p) => p.id === this.procedure?.activeId)?.focus ?? 'BENCH';
    const anchor = this.anchors.get(focus) ?? this.anchors.get('BENCH');
    if (!anchor) return null;
    anchor.getWorldPosition(out);
    const radius = focus === 'BENCH' ? 1.5 : focus === 'WORKSTATION' ? 0.85 : 0.5;
    return { focus, radius };
  }

  dispose(): void {
    this.scientist?.dispose(); this.scientist = null;
    this.carried = null; this.carriedId = null; this.handling = null; this.layout = null; this.lastHiddenVial = null;
    this.clear(this.molecule); this.clear(this.cloud); this.clear(this.rings); this.clear(this.pocket);
    this.root?.parent?.remove(this.root);
    this.screen?.texture.dispose();
    this.root = null; this.THREE = null;
  }
}

function fmt(v: number | null | undefined, unit: string): string { return typeof v === 'number' ? `${v.toFixed(2)} ${unit}` : '—'; }

/**
 * The scene with the bench layer on top: every call goes to the scene itself; init/syncScene/dispose also
 * reach the layer, and getStats adds the layer's rendered state hash. Same renderer, same loop.
 */
export function withDrugBenchLayer<T extends Sim3D>(sim: T, layer: DrugBenchLayer): T {
  let last = typeof performance !== 'undefined' ? performance.now() : 0;
  let rig: CameraRig | null = null;
  let scratch: THREE_NS.Vector3 | null = null;
  let framed: string | null = null;
  return new Proxy(sim, {
    get(target, key, receiver) {
      if (key === 'init') return (THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, w: number, h: number) => {
        target.init(THREE, scene, camera, w, h);
        layer.attach(THREE, scene);
        scratch = new THREE.Vector3();
        rig = new CameraRig(THREE, { intent: 'SCIENTIFIC', target: [0, 1.2, 0], targetRadius: 1.5 });
      };
      if (key === 'syncScene') return (scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera) => {
        target.syncScene(scene, camera);
        const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now;
        layer.sync(dt);
        // Bench camera: while a run is live and the viewer is watching the room (not wearing the visor),
        // the shot follows the phase the canonical state is in. The scene still owns every other frame.
        const mode = (target as { getCameraMode?: () => string }).getCameraMode?.();
        if (!rig || !scratch || mode !== 'SPECTATOR') { framed = null; return; }
        const shot = layer.cameraTarget(scratch);
        if (!shot) { framed = null; return; }
        const key2 = `${shot.focus}:${shot.radius}`;
        if (key2 !== framed) { rig.frame({ intent: shot.focus === 'BENCH' ? 'SCIENTIFIC' : 'MACRO', target: scratch.toArray(), targetRadius: shot.radius, elevationDeg: 16 }); framed = key2; }
        rig.setTarget(scratch.toArray());
        const transform = rig.update(dt, 1.6);
        camera.position.set(...transform.position);
        camera.lookAt(transform.lookAt[0], transform.lookAt[1], transform.lookAt[2]);
      };
      if (key === 'dispose') return () => { layer.dispose(); target.dispose?.(); };
      if (key === 'getStats') return () => {
        const base = target.getStats?.() ?? {};
        const hash = layer.renderedStateHash;
        return { ...base, drugBenchHash: hash ? Number.parseInt(hash, 16) : 0, drugBenchAtoms: layer.atomsShown, drugBenchPoseAtoms: layer.poseAtomsShown };
      };
      const value = Reflect.get(target, key, receiver) as unknown;
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}
