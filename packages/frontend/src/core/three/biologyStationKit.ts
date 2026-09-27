import type * as THREE_NS from 'three';
import { createBench, createCabinet, createMonitor } from './graphics/labKit';
import { createColumn, createGlassChamber, createPlatform } from './graphics/primitives';
import { createElectricalCabinet } from './graphics/electricalKit';
import { createEmissiveInstrumentMaterial, createScreenMaterial, makeReadoutSurface, type GenesisMaterialPalette } from './graphics/materials';
import { createManipulatorArm, createTwinProxy, type ManipulatorHandle, type TwinHandle } from './biologyLabKit';
import type { LabStation } from '../scientificWorlds/labWorld';
import type { BiologyArtifact } from '../scientificWorlds/biologyRunners';
import type { HumanDigitalTwinManifest } from '../scientificWorlds/humanLab/types';
import { NEURO_REGIONS } from '../scientificWorlds/humanLab/neuroLab';

/**
 * GENESIS GRAPHICS ENGINE — HUMAN BIOLOGY LAB STATIONS.
 *
 * One builder per V3 station kind, all in the station group's local frame
 * (the console front is local +Z; the scene rotates the group by the
 * station's `facing`, exactly as for the physics stations). Each returns
 * the handles the scene animates or draws into: the status material, an
 * optional live readout, robotic arms, a specimen dome that receives 3D
 * artifacts, LED strips. Nothing here computes: screens are drawn ONLY
 * from a sealed session's artifact (`drawBiologyArtifact`), and stay on
 * their idle text until one exists.
 */

export interface Readout { readonly ctx: CanvasRenderingContext2D; readonly texture: THREE_NS.CanvasTexture; readonly canvas: HTMLCanvasElement; }
/** What the 2D drawers need: a context, its canvas and something to flag dirty — a scene readout (CanvasTexture) or a DOM canvas in the HUD (D-130 Human Explorer). */
export interface ReadoutTarget { readonly ctx: CanvasRenderingContext2D; readonly canvas: HTMLCanvasElement; readonly texture: { needsUpdate: boolean }; }

export interface StationBuild {
  readonly group: THREE_NS.Group;
  readonly status: THREE_NS.MeshStandardMaterial;
  readonly screen?: Readout;
  readonly arms: readonly ManipulatorHandle[];
  /** Where a 3D artifact (organelles, signals, carousel glow) is parented. */
  readonly artifactAnchor: THREE_NS.Group;
  readonly leds: readonly THREE_NS.MeshStandardMaterial[];
  readonly twin?: TwinHandle;
}

export interface StationKitContext { readonly palette: GenesisMaterialPalette; readonly glass: THREE_NS.Material; readonly manifest: HumanDigitalTwinManifest; readonly skinHex: string; }

function readout(THREE: typeof THREE_NS, w: number, h: number): Readout { return makeReadoutSurface(THREE, w, h); }
function screenMat(THREE: typeof THREE_NS, r: Readout, intensity = 0.9): THREE_NS.MeshStandardMaterial { return createScreenMaterial(THREE, r.texture, { emissiveIntensity: intensity }); }

function consoleDeck(THREE: typeof THREE_NS, ctx: StationKitContext, status: THREE_NS.Material, x: number, y: number, z: number, w = 1.1): THREE_NS.Group {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.38), ctx.palette.TECH_COMPOSITE); deck.position.set(x, y, z); deck.rotation.x = -0.32; g.add(deck);
  const keys = new THREE.Mesh(new THREE.BoxGeometry(w - 0.15, 0.012, 0.22), status); keys.position.set(x, y + 0.06, z - 0.01); keys.rotation.x = -0.32; g.add(keys);
  return g;
}

export function buildBiologyStation(THREE: typeof THREE_NS, ctx: StationKitContext, st: LabStation): StationBuild {
  const group = new THREE.Group(); group.name = `station:${st.id}`;
  const status = createEmissiveInstrumentMaterial(THREE, { color: 0x38bdf8, intensity: 0.7, baseColor: 0x0f1a26 });
  const arms: ManipulatorHandle[] = []; const leds: THREE_NS.MeshStandardMaterial[] = [];
  const artifactAnchor = new THREE.Group(); artifactAnchor.name = 'artifact-anchor'; group.add(artifactAnchor);
  const P = ctx.palette;
  const armMats = { linkMaterial: P.BRUSHED_METAL, jointMaterial: P.POLISHED_METAL, baseMaterial: P.PAINTED_METAL };
  let screen: Readout | undefined; let twin: TwinHandle | undefined;
  switch (st.kind) {
    case 'human-study': {
      // Anatomy inspection table: a light table with the twin lying 1:1 on it, a console at the front edge and a scan bar above.
      group.add(createBench(THREE, { position: [0, 0, 0], width: 2.6, depth: 1.1, height: 0.84, topThickness: 0.08, topMaterial: P.TECH_COMPOSITE, legMaterial: P.PAINTED_METAL }));
      const lightTop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.02, 0.95), createEmissiveInstrumentMaterial(THREE, { color: 0xbfe3ff, intensity: 0.5, baseColor: 0x1f2c38 })); lightTop.position.set(0, 0.85, -0.05); group.add(lightTop);
      twin = createTwinProxy(THREE, ctx.manifest, { skinHex: ctx.skinHex });
      twin.group.rotation.set(-Math.PI / 2, 0, Math.PI / 2); twin.group.position.set(-ctx.manifest.parameters.heightMeters / 2 + 0.02, 0.98, -0.05);
      group.add(twin.group);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 1.1), status); bar.position.set(-0.6, 1.35, -0.05); bar.name = 'scan-bar'; group.add(bar);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.03, 0.03), P.POLISHED_METAL); rail.position.set(0, 1.38, -0.05); group.add(rail);
      for (const x of [-1.2, 1.2]) group.add(createColumn(THREE, P.PAINTED_METAL, { position: [x, 0.84, -0.05], height: 0.55, radius: 0.02 }));
      screen = readout(THREE, 384, 224);
      group.add(createMonitor(THREE, { position: [1.0, 0.86, 0.35], width: 0.62, height: 0.38, standHeight: 0.12, frameMaterial: P.PAINTED_METAL, screenMaterial: screenMat(THREE, screen) }));
      group.add(consoleDeck(THREE, ctx, status, -0.4, 0.9, 0.42, 1.0));
      break;
    }
    case 'neuro': {
      group.add(createBench(THREE, { position: [0, 0, 0], width: 2.6, depth: 1.2, height: 0.88, topMaterial: P.TECH_COMPOSITE, legMaterial: P.PAINTED_METAL }));
      screen = readout(THREE, 384, 224);
      for (const [x, rot, i] of [[-0.85, 0.35, 0], [0, 0, 1], [0.85, -0.35, 2]] as const) {
        const mon = createMonitor(THREE, { position: [x, 0.88, -0.35], width: 0.7, height: 0.42, standHeight: 0.14, frameMaterial: P.PAINTED_METAL, screenMaterial: i === 1 ? screenMat(THREE, screen) : undefined });
        mon.rotation.y = rot; group.add(mon);
      }
      // Brain hologram pedestal: NEURO_REGIONS enlarged ×2.6 floating over an emissive ring; signal arcs are parented to the anchor.
      const pedestal = createPlatform(THREE, P.BRUSHED_METAL, { position: [0, 0.94, 0.05], thickness: 0.05, shape: 'disc', radius: 0.26 }); group.add(pedestal);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.015, 8, 48), status); ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.98, 0.05); group.add(ring);
      const holo = new THREE.Group(); holo.position.set(0, 1.3, 0.05); holo.scale.setScalar(2.6); holo.name = 'brain-holo'; group.add(holo);
      const sphere = new THREE.SphereGeometry(1, 16, 12);
      const holoMat = new THREE.MeshStandardMaterial({ color: 0xe0a0a3, emissive: 0x7dd3fc, emissiveIntensity: 0.35, transparent: true, opacity: 0.55, roughness: 0.4 });
      for (const r of NEURO_REGIONS) { const radius = Math.cbrt((r.volumeMl * 1e-6 * 3) / (4 * Math.PI)); const m = new THREE.Mesh(sphere, holoMat); m.scale.setScalar(radius); m.position.set(r.positionMeters.x, r.positionMeters.y, r.positionMeters.z); m.name = `holo:${r.id}`; holo.add(m); }
      artifactAnchor.position.copy(holo.position); artifactAnchor.scale.copy(holo.scale);
      group.add(consoleDeck(THREE, ctx, status, 0, 0.94, 0.42, 1.4));
      break;
    }
    case 'microscopy': {
      // Hyperscope hero: heavy base, column, cantilever arm, stacked optical head over a stage with a specimen dome, ring light, side readout; a second, simpler microscope beside it.
      group.add(createBench(THREE, { position: [0, 0, 0], width: 2.8, depth: 1.4, height: 0.9, topMaterial: P.TECH_COMPOSITE, legMaterial: P.PAINTED_METAL }));
      const base = createPlatform(THREE, P.CERAMIC, { position: [0.2, 0.95, -0.3], thickness: 0.1, shape: 'box', width: 0.82, depth: 0.72 }); group.add(base);
      group.add(createColumn(THREE, P.BRUSHED_METAL, { position: [0.2, 1.0, -0.6], height: 1.05, radius: 0.09 }));
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.14, 0.6), P.CERAMIC); arm.position.set(0.2, 2.0, -0.32); group.add(arm);
      const headMats = [P.CERAMIC, P.TECH_COMPOSITE, P.BRUSHED_METAL];
      for (const [i, r, h, y] of [[0, 0.16, 0.22, 1.86], [1, 0.12, 0.28, 1.62], [2, 0.08, 0.26, 1.36]] as const) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, h, 28), headMats[i]); seg.position.set(0.2, y, -0.05); group.add(seg); }
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.06, 20), ctx.glass); lens.position.set(0.2, 1.21, -0.05); group.add(lens);
      const ringLight = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.012, 8, 32), status); ringLight.rotation.x = Math.PI / 2; ringLight.position.set(0.2, 1.26, -0.05); group.add(ringLight);
      const stage = createPlatform(THREE, P.TECH_COMPOSITE, { position: [0.2, 1.02, -0.05], thickness: 0.04, shape: 'disc', radius: 0.22 }); group.add(stage);
      group.add(createGlassChamber(THREE, ctx.glass, { position: [0.2, 1.04, -0.05], height: 0.16, radiusBottom: 0.15, radiusTop: 0.15, openEnded: false, radialSegments: 32 }));
      artifactAnchor.position.set(0.2, 1.12, -0.05);
      // The precision microscope: a compact column with binocular tubes.
      group.add(createColumn(THREE, P.PAINTED_METAL, { position: [-0.9, 0.9, -0.3], height: 0.42, radius: 0.05 }));
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.19), P.CERAMIC); body.position.set(-0.9, 1.35, -0.2); group.add(body);
      const focus = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.035, 16), P.TECH_COMPOSITE); focus.rotation.z = Math.PI / 2; focus.position.set(-0.80, 1.30, -0.2); group.add(focus);
      for (const dx of [-0.035, 0.035]) { const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 12), P.BRUSHED_METAL); tube.position.set(-0.9 + dx, 1.5, -0.1); tube.rotation.x = -0.6; group.add(tube); }
      const stage2 = createPlatform(THREE, P.BRUSHED_METAL, { position: [-0.9, 1.0, -0.2], thickness: 0.03, shape: 'box', width: 0.3, depth: 0.24 }); group.add(stage2);
      screen = readout(THREE, 384, 224);
      group.add(createMonitor(THREE, { position: [1.05, 0.9, -0.2], width: 0.62, height: 0.4, standHeight: 0.14, frameMaterial: P.PAINTED_METAL, screenMaterial: screenMat(THREE, screen) }));
      group.add(consoleDeck(THREE, ctx, status, -0.2, 0.94, 0.5, 1.2));
      break;
    }
    case 'histology': {
      group.add(createBench(THREE, { position: [0, 0, 0], width: 2.6, depth: 1.2, height: 0.88, topMaterial: P.CERAMIC, legMaterial: P.PAINTED_METAL }));
      // Slide rack, microtome, stain jars, and the cell-model dome.
      const rack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.2), P.PAINTED_METAL); rack.position.set(-1.0, 0.94, -0.25); group.add(rack);
      const slideGeo = new THREE.BoxGeometry(0.02, 0.1, 0.16);
      for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(slideGeo, ctx.glass); s.position.set(-1.17 + i * 0.048, 1.04, -0.25); group.add(s); }
      const microtome = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.3), P.BRUSHED_METAL); microtome.position.set(-0.35, 1.02, -0.3); group.add(microtome);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 24), P.POLISHED_METAL); wheel.rotation.z = Math.PI / 2; wheel.position.set(-0.16, 1.05, -0.3); group.add(wheel);
      const jarGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.12, 14);
      for (const [i, c] of [[0, 0xd24a7a], [1, 0x4a6fd2], [2, 0xe0c060], [3, 0x7fd28f]] as const) { const jar = new THREE.Mesh(jarGeo, new THREE.MeshPhysicalMaterial({ color: c, transparent: true, opacity: 0.7, roughness: 0.2 })); jar.position.set(0.25 + i * 0.11, 0.94, -0.35); group.add(jar); }
      group.add(createPlatform(THREE, P.POLISHED_METAL, { position: [0.75, 0.9, -0.15], thickness: 0.04, shape: 'disc', radius: 0.22 }));
      group.add(createGlassChamber(THREE, ctx.glass, { position: [0.75, 0.92, -0.15], height: 0.34, radiusBottom: 0.2, radiusTop: 0.17, openEnded: false, radialSegments: 32 }));
      artifactAnchor.position.set(0.75, 1.1, -0.15);
      screen = readout(THREE, 384, 224);
      group.add(createMonitor(THREE, { position: [-0.75, 0.88, 0.3], width: 0.6, height: 0.38, standHeight: 0.12, frameMaterial: P.PAINTED_METAL, screenMaterial: screenMat(THREE, screen) }));
      group.add(consoleDeck(THREE, ctx, status, 0.5, 0.94, 0.42, 1.0));
      break;
    }
    case 'imaging': {
      // Imaging centre: a CT-like gantry ring on a base with a patient table through it, and a console with a wide slice display.
      const gantryBase = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 2.2), P.PAINTED_METAL); gantryBase.position.set(0, 0.25, -0.9); group.add(gantryBase);
      const gantry = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.3, 20, 64), P.CERAMIC); gantry.position.set(0, 1.25, -0.9); gantry.rotation.y = Math.PI / 2; group.add(gantry);
      const bore = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.02, 8, 64), status); bore.position.set(0, 1.25, -0.9); bore.rotation.y = Math.PI / 2; group.add(bore);
      const table = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.6), P.TECH_COMPOSITE); table.position.set(0.3, 0.86, -0.9); group.add(table);
      group.add(createColumn(THREE, P.PAINTED_METAL, { position: [1.3, 0, -0.9], height: 0.82, radius: 0.12 }));
      const pad = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.5), P.RUBBER); pad.position.set(0.3, 0.925, -0.9); group.add(pad);
      screen = readout(THREE, 512, 288);
      group.add(createMonitor(THREE, { position: [0, 0.88, 0.5], width: 1.1, height: 0.62, standHeight: 0.12, frameMaterial: P.PAINTED_METAL, screenMaterial: screenMat(THREE, screen) }));
      group.add(createBench(THREE, { position: [0, 0, 0.55], width: 1.6, depth: 0.7, height: 0.88, topMaterial: P.TECH_COMPOSITE, legMaterial: P.PAINTED_METAL }));
      group.add(consoleDeck(THREE, ctx, status, 0, 0.94, 0.78, 1.2));
      artifactAnchor.position.set(0.3, 1.0, -0.9);
      break;
    }
    case 'orpheus': {
      // ORPHEUS: sealed chamber on a plinth with a sample carousel, an optical head, two manipulators, a ring light and a diagnostic display.
      group.add(createPlatform(THREE, P.BRUSHED_METAL, { position: [0, 0.06, -0.2], thickness: 0.12, shape: 'box', width: 3.0, depth: 2.2 }));
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.8, 1.3), P.PAINTED_METAL); plinth.position.set(0, 0.52, -0.5); group.add(plinth);
      const chamber = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.1), ctx.glass); chamber.position.set(0, 1.47, -0.5); group.add(chamber);
      const frameGeo = new THREE.BoxGeometry(0.05, 1.12, 0.05);
      for (const [x, z] of [[-0.75, -1.05], [0.75, -1.05], [-0.75, 0.05], [0.75, 0.05]]) { const f = new THREE.Mesh(frameGeo, P.POLISHED_METAL); f.position.set(x, 1.47, z); group.add(f); }
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.08, 1.16), P.BRUSHED_METAL); lid.position.set(0, 2.06, -0.5); group.add(lid);
      const carousel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 32), P.POLISHED_METAL); carousel.position.set(0, 0.95, -0.5); carousel.name = 'carousel'; group.add(carousel);
      const vialGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.11, 12);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const v = new THREE.Mesh(vialGeo, ctx.glass); v.position.set(Math.cos(a) * 0.28, 0.075, Math.sin(a) * 0.28); carousel.add(v); }
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.34, 24), P.BRUSHED_METAL); head.position.set(0, 1.85, -0.5); group.add(head);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 10, 48), status); ring.rotation.x = Math.PI / 2; ring.position.set(0, 1.66, -0.5); group.add(ring);
      const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.03, 10, 64), status); baseRing.rotation.x = Math.PI / 2; baseRing.position.set(0, 0.93, -0.5); group.add(baseRing);
      arms.push(createManipulatorArm(THREE, { position: [-0.55, 0.92, -0.5], headingRadians: Math.PI / 2, scale: 0.55, phase: 0.4, ...armMats }));
      arms.push(createManipulatorArm(THREE, { position: [0.55, 0.92, -0.5], headingRadians: -Math.PI / 2, scale: 0.55, phase: 2.1, ...armMats }));
      for (const a of arms) group.add(a.group);
      artifactAnchor.position.set(0, 1.05, -0.5);
      screen = readout(THREE, 512, 288);
      group.add(createMonitor(THREE, { position: [-1.1, 0.12, 0.55], width: 0.8, height: 0.5, standHeight: 0.75, frameMaterial: P.PAINTED_METAL, screenMaterial: screenMat(THREE, screen) }));
      group.add(consoleDeck(THREE, ctx, status, 0.5, 0.95, 0.6, 1.3));
      group.add(createColumn(THREE, P.PAINTED_METAL, { position: [0.5, 0.12, 0.6], height: 0.8, radius: 0.08 }));
      break;
    }
    case 'compute': {
      // Scientific compute wall: four racks with LED strips, a cable tray above.
      for (let i = 0; i < 4; i++) {
        group.add(createElectricalCabinet(THREE, { position: [-1.2 + i * 0.8, 0, -0.1], headingRadians: 0, width: 0.72, depth: 0.7, height: 2.15, bodyMaterial: P.PAINTED_METAL, doorMaterial: P.BRUSHED_METAL, hazardStripeMaterial: status }));
        for (let j = 0; j < 6; j++) { const led = createEmissiveInstrumentMaterial(THREE, { color: j % 2 ? 0x62f0a3 : 0x38bdf8, intensity: 0.8, baseColor: 0x0b1a14 }); leds.push(led); const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.015, 0.01), led); m.position.set(-1.2 + i * 0.8, 0.5 + j * 0.28, 0.26); group.add(m); }
      }
      const tray = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.3), P.BRUSHED_METAL); tray.position.set(0, 2.3, -0.1); group.add(tray);
      break;
    }
    case 'evidence': {
      // Evidence Ledger wall: one wide display of the sealed sessions (drawn only from real sessions) and a reading pedestal.
      screen = readout(THREE, 1024, 512);
      group.add(createMonitor(THREE, { position: [0, 0.55, -0.2], width: 3.0, height: 1.5, standHeight: 0.5, frameMaterial: P.PAINTED_METAL, screenMaterial: screenMat(THREE, screen, 0.8) }));
      group.add(createColumn(THREE, P.PAINTED_METAL, { position: [0, 0, 0.55], height: 0.95, radius: 0.1 }));
      group.add(consoleDeck(THREE, ctx, status, 0, 1.0, 0.55, 0.9));
      break;
    }
    case 'safety': {
      // Safety & access: a pedestal console between two PPE lockers, a hazard strip.
      group.add(createColumn(THREE, P.PAINTED_METAL, { position: [0, 0, 0], height: 0.95, radius: 0.12 }));
      screen = readout(THREE, 384, 224);
      group.add(createMonitor(THREE, { position: [0, 0.95, -0.05], width: 0.6, height: 0.4, standHeight: 0.08, frameMaterial: P.PAINTED_METAL, screenMaterial: screenMat(THREE, screen) }));
      for (const x of [-0.75, 0.75]) group.add(createCabinet(THREE, { position: [x, 0, -0.15], width: 0.6, depth: 0.55, height: 2.0, bodyMaterial: P.PAINTED_METAL, doorMaterial: P.BRUSHED_METAL, handleMaterial: P.POLISHED_METAL }));
      const strip = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.08), createEmissiveInstrumentMaterial(THREE, { color: 0xf0b35c, intensity: 0.9, baseColor: 0x3a2a10 })); strip.position.set(0, 0.012, 0.6); group.add(strip);
      break;
    }
    default:
      break;
  }
  return { group, status, screen, arms, artifactAnchor, leds, ...(twin ? { twin } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Screens: idle text, and the artifact of a sealed session.

function frame(r: ReadoutTarget, title: string, accent = 'rgba(98,240,163,0.45)'): void {
  const { ctx, canvas } = r;
  ctx.fillStyle = '#07111a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  ctx.fillStyle = '#9fd7f9'; ctx.font = `bold ${Math.round(canvas.height * 0.085)}px monospace`; ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, 14, Math.round(canvas.height * 0.13));
}

export function drawBiologyIdle(r: ReadoutTarget, st: LabStation): void {
  frame(r, st.label.toUpperCase(), 'rgba(56,189,248,0.35)');
  const { ctx, canvas, texture } = r;
  ctx.fillStyle = '#62f0a3'; ctx.font = `${Math.round(canvas.height * 0.07)}px monospace`;
  ctx.fillText('GOTOWE · BRAK SESJI', 14, canvas.height - 22);
  if (st.kind === 'evidence') { ctx.fillStyle = '#9fb3c8'; ctx.fillText('Ekran wypełnia się wyłącznie zapieczętowanymi sesjami.', 14, canvas.height * 0.3); }
  if (st.kind === 'human-study') { ctx.fillStyle = '#9fb3c8'; ctx.fillText('Bliźniak: PROXY proceduralny · MODEL · NOT_A_MEDICAL_DEVICE', 14, canvas.height * 0.3); }
  texture.needsUpdate = true;
}

/** The evidence wall lists the sessions sealed so far — ids, experiment, status, hash prefix — never anything invented. */
export function drawEvidenceWall(r: ReadoutTarget, sessions: readonly { sessionId: string; experimentId: string; epistemicStatus: string; contentHash: string; evidenceHashes: readonly string[] }[]): void {
  frame(r, 'EVIDENCE LEDGER · ZAPIECZĘTOWANE SESJE');
  const { ctx, canvas, texture } = r;
  ctx.font = `${Math.round(canvas.height * 0.05)}px monospace`;
  if (!sessions.length) { ctx.fillStyle = '#9fb3c8'; ctx.fillText('BRAK SESJI', 14, canvas.height * 0.3); }
  sessions.slice(-9).forEach((s, i) => {
    const y = canvas.height * 0.24 + i * canvas.height * 0.08;
    ctx.fillStyle = '#e6f2ec'; ctx.fillText(`${s.sessionId}  ${s.experimentId}`, 14, y);
    ctx.fillStyle = '#7dd3fc'; ctx.fillText(`${s.epistemicStatus}  hash ${s.contentHash.slice(0, 16)}…  ledger ${s.evidenceHashes.length}`, canvas.width * 0.5, y);
  });
  texture.needsUpdate = true;
}

function seeded(hash: string): () => number {
  let state = 0; for (let i = 0; i < hash.length; i++) state = (state * 31 + hash.charCodeAt(i)) >>> 0;
  return () => { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function drawBloodSmear(ctx: CanvasRenderingContext2D, cx: number, cy: number, rad: number, hash: string): void {
  const rnd = seeded(hash); const count = 34;
  for (let i = 0; i < count; i += 1) {
    const angle = rnd() * Math.PI * 2; const distance = Math.sqrt(rnd()) * rad * 0.9;
    const x = cx + Math.cos(angle) * distance; const y = cy + Math.sin(angle) * distance;
    const radius = rad * (0.07 + rnd() * 0.025);
    ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * Math.PI);
    ctx.fillStyle = 'rgba(205,55,72,.9)'; ctx.beginPath(); ctx.ellipse(0, 0, radius, radius * 0.72, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(110,18,34,.38)'; ctx.beginPath(); ctx.ellipse(0, 0, radius * 0.44, radius * 0.25, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  // One leukocyte and several platelets make the modeled composition readable.
  ctx.fillStyle = 'rgba(229,220,242,.95)'; ctx.beginPath(); ctx.arc(cx + rad * 0.27, cy - rad * 0.18, rad * 0.13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(89,54,142,.9)'; ctx.beginPath(); ctx.arc(cx + rad * 0.25, cy - rad * 0.18, rad * 0.075, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 9; i += 1) { ctx.fillStyle = '#d9b3e8'; ctx.beginPath(); ctx.arc(cx + (rnd() - 0.5) * rad * 1.65, cy + (rnd() - 0.5) * rad * 1.65, rad * 0.018, 0, Math.PI * 2); ctx.fill(); }
}

export function drawBiologyArtifact(r: ReadoutTarget, artifact: BiologyArtifact, manifest: HumanDigitalTwinManifest): void {
  const { ctx, canvas, texture } = r; const W = canvas.width; const H = canvas.height;
  const small = `${Math.round(H * 0.065)}px monospace`; const mid = `${Math.round(H * 0.075)}px monospace`;
  switch (artifact.kind) {
    case 'physiology': {
      frame(r, 'FIZJOLOGIA · MODEL EDUKACYJNY'); const s = artifact.state; ctx.fillStyle = '#e6f2ec'; ctx.font = mid;
      const rows = [`tętno ${s.heartRateBpm.toFixed(1)} /min`, `oddech ${s.respiratoryRatePerMin.toFixed(1)} /min`, `SpO₂ ${s.oxygenSaturationPercent.toFixed(1)} %`, `RR ${s.bloodPressureMmHg.systolic.toFixed(0)}/${s.bloodPressureMmHg.diastolic.toFixed(0)} mmHg`, `temp ${s.bodyTemperatureC.toFixed(2)} °C`, `perfuzja mózg. ${s.cerebralPerfusionIndex.toFixed(3)}`];
      rows.forEach((t, i) => ctx.fillText(t, 14, H * 0.27 + i * H * 0.11));
      ctx.fillStyle = '#f0b35c'; ctx.font = small; ctx.fillText(`${s.stateLabel} · NOT_A_MEDICAL_DEVICE`, 14, H - 14);
      break;
    }
    case 'neuro': {
      frame(r, `SYGNAŁY · ${artifact.sourceRegionId}`); ctx.font = small;
      artifact.signals.forEach((sg, i) => {
        const y = H * 0.27 + i * H * 0.12; const w = (W - 40) * sg.amplitude;
        ctx.fillStyle = '#1e3a4f'; ctx.fillRect(14, y - H * 0.05, W - 28, H * 0.07);
        ctx.fillStyle = '#7dd3fc'; ctx.fillRect(14, y - H * 0.05, w, H * 0.07);
        ctx.fillStyle = '#e6f2ec'; ctx.fillText(`${sg.toRegionId}  a=${sg.amplitude.toFixed(2)}  ${sg.latencyMs.toFixed(0)} ms`, 18, y + H * 0.005);
      });
      ctx.fillStyle = '#f0b35c'; ctx.fillText('SIMULATION', 14, H - 14);
      break;
    }
    case 'hyperscope': {
      const c = artifact.capture; frame(r, `HYPERSCOPE ${c.request.magnification}× · ${c.request.mode}`);
      // Field of view: a circle; content is the seeded cell model (≥100×) or a seeded tissue texture keyed by the capture hash — a model view, labelled as such.
      const cx = W * 0.33; const cy = H * 0.56; const rad = H * 0.34;
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = c.request.mode === 'SUBCELLULAR_MODEL' ? '#1d2a3a' : '#2b3446'; ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
      const rnd = seeded(c.outputHash);
      if (artifact.cell?.tissueType === 'BLOOD') {
        drawBloodSmear(ctx, cx, cy, rad, c.outputHash);
      } else if (artifact.cell) {
        for (const o of artifact.cell.organelles) { const x = cx + (o.positionNormalized.x - 0.5) * rad * 1.6; const y = cy + (o.positionNormalized.y - 0.5) * rad * 1.6; ctx.fillStyle = o.kind === 'NUCLEUS' ? 'rgba(200,120,150,0.85)' : o.kind === 'MITOCHONDRION' ? 'rgba(240,180,90,0.85)' : 'rgba(160,200,170,0.75)'; ctx.beginPath(); ctx.ellipse(x, y, o.scaleNormalized * rad * 1.3, o.scaleNormalized * rad * 0.9, rnd() * 3, 0, Math.PI * 2); ctx.fill(); }
      } else {
        const n = 40 + Math.round(rnd() * 60);
        for (let i = 0; i < n; i++) { ctx.fillStyle = `rgba(${170 + Math.round(rnd() * 60)},${120 + Math.round(rnd() * 60)},${140 + Math.round(rnd() * 40)},0.55)`; ctx.beginPath(); ctx.ellipse(cx + (rnd() - 0.5) * rad * 2, cy + (rnd() - 0.5) * rad * 2, 4 + rnd() * 14, 3 + rnd() * 10, rnd() * 3, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.restore();
      ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#e6f2ec'; ctx.font = small;
      const readouts = artifact.cell?.tissueType === 'BLOOD'
        ? [`FOV ${c.request.fieldOfViewMicrometers.toFixed(1)} µm`, 'erytrocyty · leukocyt', 'płytki krwi', c.epistemic]
        : [`FOV ${c.request.fieldOfViewMicrometers.toFixed(1)} µm`, `res ×${c.visualResolutionMultiplier.toFixed(1)}`, c.captureId, c.epistemic];
      readouts.forEach((t, i) => ctx.fillText(t, W * 0.62, H * 0.3 + i * H * 0.11));
      ctx.fillStyle = '#f0b35c'; ctx.fillText('powiększenie ≠ nowe dowody', W * 0.62, H - 14);
      break;
    }
    case 'histology': {
      frame(r, `PREPARAT · ${artifact.slide.tissueType} · ${artifact.slide.stain}`);
      const cx = W * 0.33; const cy = H * 0.56; const rad = H * 0.34;
      ctx.fillStyle = artifact.slide.stain === 'H_AND_E' ? '#f1d6e0' : '#101826'; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
      if (artifact.slide.tissueType === 'BLOOD') drawBloodSmear(ctx, cx, cy, rad, artifact.slide.slideId);
      else for (const o of artifact.cell.organelles) { const x = cx + (o.positionNormalized.x - 0.5) * rad * 1.5; const y = cy + (o.positionNormalized.y - 0.5) * rad * 1.5; ctx.fillStyle = o.kind === 'NUCLEUS' ? '#5a2d6b' : o.kind === 'MITOCHONDRION' ? '#c2606f' : '#8a5a7a'; ctx.beginPath(); ctx.ellipse(x, y, o.scaleNormalized * rad * 1.2, o.scaleNormalized * rad * 0.85, 0.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#e6f2ec'; ctx.font = small;
      [artifact.slide.slideId, artifact.cell.cellId, `${artifact.cell.organelles.length} organelli`, artifact.slide.preparationStatus].forEach((t, i) => ctx.fillText(t, W * 0.62, H * 0.3 + i * H * 0.11));
      ctx.fillStyle = '#f0b35c'; ctx.fillText('MODEL', W * 0.62, H - 14);
      break;
    }
    case 'imaging': {
      const f = artifact.frame; const req = f.request; frame(r, `${req.mode} · ${req.sliceAxis} #${req.sliceIndex}`);
      // The slice: organ ellipses of the atlas cut by the plane; AXIAL = height 0..H mapped from the slice index, CORONAL/SAGITTAL = the twin's profile.
      const tone = req.mode === 'XRAY' ? ['#0b0e14', '#dfe7f2'] : req.mode === 'MRI_LIKE' ? ['#0c1220', '#b9c8e0'] : req.mode === 'ULTRASOUND_LIKE' ? ['#120f0a', '#d9b98a'] : req.mode === 'FLUORESCENCE' ? ['#06140c', '#62f0a3'] : ['#0e1114', '#c8cdd4'];
      const x0 = 14; const y0 = H * 0.2; const w = W * 0.56; const h = H * 0.72;
      ctx.fillStyle = tone[0]; ctx.fillRect(x0, y0, w, h);
      const body = manifest.nodes.find((n) => n.id === 'body'); const hgt = body?.dimensionsMeters.y ?? 1.78;
      const organs = manifest.nodes.filter((n) => n.kind === 'ORGAN');
      ctx.strokeStyle = tone[1]; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
      if (req.sliceAxis === 'AXIAL') {
        const yM = (req.sliceIndex / 127) * hgt; const cx = x0 + w / 2; const cy = y0 + h / 2;
        ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.42, h * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
        for (const o of organs) { const dy = Math.abs(o.positionMeters.y - yM); const ry = o.dimensionsMeters.y / 2; if (dy > ry) continue; const k = Math.sqrt(1 - (dy / ry) ** 2); ctx.beginPath(); ctx.ellipse(cx + o.positionMeters.x * (w * 0.42 / 0.23), cy - o.positionMeters.z * (h * 0.3 / 0.14), o.dimensionsMeters.x / 2 * k * (w * 0.42 / 0.23), o.dimensionsMeters.z / 2 * k * (h * 0.3 / 0.14), 0, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = tone[1]; ctx.font = small; ctx.fillText(`z = ${yM.toFixed(2)} m`, x0 + 8, y0 + h - 8);
      } else {
        const sx = w / 0.6; const sy = h / hgt; const cx = x0 + w / 2; const bottom = y0 + h;
        ctx.beginPath(); ctx.ellipse(cx, bottom - hgt * 0.5 * sy, 0.2 * sx, hgt * 0.5 * sy, 0, 0, Math.PI * 2); ctx.stroke();
        for (const o of organs) { const lateral = req.sliceAxis === 'CORONAL' ? o.positionMeters.x : o.positionMeters.z; const rr = req.sliceAxis === 'CORONAL' ? o.dimensionsMeters.x / 2 : o.dimensionsMeters.z / 2; ctx.beginPath(); ctx.ellipse(cx + lateral * sx, bottom - o.positionMeters.y * sy, rr * sx, o.dimensionsMeters.y / 2 * sy, 0, 0, Math.PI * 2); ctx.stroke(); }
      }
      ctx.globalAlpha = 1; ctx.fillStyle = '#e6f2ec'; ctx.font = small;
      [f.frameId, `źródło ${req.source}`, f.epistemic, 'diagnostyka: ZABRONIONA'].forEach((t, i) => ctx.fillText(t, W * 0.62, H * 0.3 + i * H * 0.11));
      break;
    }
    case 'orpheus': {
      frame(r, `ORPHEUS · ${artifact.run.runId}`); ctx.font = small;
      const maxes: Record<string, number> = { signal_index: 1, texture_complexity: 1, feature_density: 100, model_confidence: 1 };
      artifact.run.outputMetrics.forEach((m, i) => {
        const y = H * 0.28 + i * H * 0.13; const frac = Math.min(1, m.value / (maxes[m.name] ?? 1));
        ctx.fillStyle = '#1e3a4f'; ctx.fillRect(14, y - H * 0.05, W * 0.55, H * 0.07); ctx.fillStyle = '#62f0a3'; ctx.fillRect(14, y - H * 0.05, W * 0.55 * frac, H * 0.07);
        ctx.fillStyle = '#e6f2ec'; ctx.fillText(`${m.name} ${m.value.toFixed(3)} ${m.unit}`, W * 0.58, y + H * 0.01);
      });
      ctx.fillStyle = '#f0b35c'; ctx.fillText(`${artifact.run.epistemic} · ${artifact.specimen.specimenId}`, 14, H - 14);
      break;
    }
  }
  texture.needsUpdate = true;
}

/** 3D artifact at a station: organelles in the dome, signal arcs on the brain hologram, the ORPHEUS carousel glow. Returns the group to parent under the station's anchor. */
export function buildBiologyArtifact3D(THREE: typeof THREE_NS, artifact: BiologyArtifact): THREE_NS.Group | null {
  const g = new THREE.Group(); g.name = `artifact:${artifact.kind}`;
  const cell = artifact.kind === 'hyperscope' ? artifact.cell : artifact.kind === 'histology' ? artifact.cell : null;
  if (cell) {
    const geo = new THREE.SphereGeometry(1, 12, 10);
    for (const o of cell.organelles) {
      const color = o.kind === 'NUCLEUS' ? 0xc878a0 : o.kind === 'MITOCHONDRION' ? 0xf0b45a : o.kind === 'MEMBRANE' ? 0x9fd7f9 : 0xa0c8aa;
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, transparent: true, opacity: o.kind === 'MEMBRANE' ? 0.18 : 0.9 }));
      const s = o.kind === 'MEMBRANE' ? 0.12 : o.scaleNormalized * 0.24; m.scale.setScalar(s);
      m.position.set((o.positionNormalized.x - 0.5) * 0.16, (o.positionNormalized.y - 0.5) * 0.12, (o.positionNormalized.z - 0.5) * 0.16);
      if (o.kind === 'MEMBRANE') m.position.set(0, 0, 0);
      g.add(m);
    }
    return g;
  }
  if (artifact.kind === 'neuro') {
    const byId = new Map(NEURO_REGIONS.map((r) => [r.id, r] as const));
    const from = byId.get(artifact.sourceRegionId);
    if (!from) return null;
    for (const s of artifact.signals) {
      const to = byId.get(s.toRegionId); if (!to) continue;
      const a = new THREE.Vector3(from.positionMeters.x, from.positionMeters.y, from.positionMeters.z);
      const b = new THREE.Vector3(to.positionMeters.x, to.positionMeters.y, to.positionMeters.z);
      const mid = a.clone().add(b).multiplyScalar(0.5); mid.y += 0.03;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.002 + s.amplitude * 0.004, 6, false), new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x7dd3fc, emissiveIntensity: 0.6 + s.amplitude }));
      g.add(tube);
    }
    return g;
  }
  if (artifact.kind === 'orpheus') {
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 32), createEmissiveInstrumentMaterial(THREE, { color: 0x62f0a3, intensity: 1.2, baseColor: 0x0b1a14 })); g.add(glow);
    return g;
  }
  return null;
}
