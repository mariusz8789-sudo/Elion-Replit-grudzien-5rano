import type * as THREE_NS from 'three';
import { createAtomSphere, createBond, elementStyleOf } from '../three/graphics/moleculeKit';
import { createBackendGeometrySource, type MoleculeGeometrySource, type MoleculeMaterialisation } from '../worldModel/domains/molecularStructure';
import type { Sim3D } from '../three/types';
import type { LiveDrugRun } from './liveDrugRun';
import type { LiveCandidate, LiveDrugRunState } from './drugRunState';

/**
 * DRUG BENCH LAYER — the live drug run drawn at the bench of the ONE main laboratory.
 *
 * Presentation only, and only of `LiveDrugRunState`: every object below is derived from the state the
 * backend persisted (candidates, lineage, stage measurements). The molecule is the real RDKit
 * conformer of the focused candidate (`chem-rdkit-embed3d`, the same source as Molecule Lab). Nothing
 * animates a result that has not been computed: a stage ring grows only when a measurement exists.
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

/** The candidate the bench looks at: docked first, then the best retained of the latest generation, then the seed. */
export function focusCandidate(state: LiveDrugRunState): LiveCandidate | null {
  const docked = state.candidates.find((c) => c.stages.docking && c.stages.docking.value !== null);
  if (docked) return docked;
  const retained = state.candidates.filter((c) => c.status === 'retained');
  if (retained.length) return retained.reduce((a, b) => (b.generation > a.generation || (b.generation === a.generation && b.pareto && !a.pareto) ? b : a));
  return state.candidates[0] ?? null;
}

export class DrugBenchLayer {
  private THREE: typeof THREE_NS | null = null;
  private root: THREE_NS.Group | null = null;
  private molecule: THREE_NS.Group | null = null;
  private cloud: THREE_NS.Group | null = null;
  private rings: THREE_NS.Group | null = null;
  private screen: { canvas: HTMLCanvasElement; texture: THREE_NS.CanvasTexture } | null = null;
  private state: LiveDrugRunState | null = null;
  private builtHash: string | null = null;
  private moleculeSmiles: string | null = null;
  private moleculeAtoms = 0;
  private readonly conformers = new Map<string, Promise<MoleculeMaterialisation | null>>();
  private time = 0;

  constructor(private readonly source: MoleculeGeometrySource = createBackendGeometrySource()) {}

  get renderedStateHash(): string | null { return this.builtHash; }
  get atomsShown(): number { return this.moleculeAtoms; }

  setRun(run: LiveDrugRun | null): void { this.state = run?.state ?? null; }

  attach(THREE: typeof THREE_NS, scene: THREE_NS.Scene): void {
    this.THREE = THREE;
    const station = scene.getObjectByName(`station:${DRUG_BENCH_STATION_ID}`);
    if (!station) return;
    const root = new THREE.Group(); root.name = 'drug-bench:layer';
    // The bench itself: a lab table and a holographic plinth (the scene draws only an empty group for new station kinds).
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 1.05), new THREE.MeshStandardMaterial({ color: 0xd6dde6, roughness: 0.35, metalness: 0.2 }));
    top.position.set(0, 0.93, 0); root.add(top);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6, metalness: 0.5 });
    for (const [x, z] of [[-1.05, -0.45], [1.05, -0.45], [-1.05, 0.45], [1.05, 0.45]] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), legMat); leg.position.set(x, 0.45, z); root.add(leg);
    }
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.08, 40), new THREE.MeshStandardMaterial({ color: 0x0b1220, emissive: 0x0e7490, emissiveIntensity: 0.9, roughness: 0.3 }));
    plinth.position.set(0, 1.01, 0); root.add(plinth);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.9, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(0, 1.5, 0); root.add(beam);
    // A readout panel behind the plinth, drawn from the state (canvas texture on the same renderer).
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 384;
    const texture = new THREE.CanvasTexture(canvas);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
    panel.position.set(0, 1.62, -0.52); root.add(panel);
    this.screen = { canvas, texture };
    this.molecule = new THREE.Group(); this.molecule.position.set(0, HOLO_Y, 0.05); root.add(this.molecule);
    this.cloud = new THREE.Group(); this.cloud.position.set(0, 1.25, 0.05); root.add(this.cloud);
    this.rings = new THREE.Group(); this.rings.position.set(0, 1.06, 0); root.add(this.rings);
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
    if (hash === this.builtHash || !this.THREE || !this.root) return;
    this.builtHash = hash;
    this.rebuild(state);
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
    if (!state) { this.clear(this.molecule); this.moleculeSmiles = null; this.moleculeAtoms = 0; return; }
    // Candidate constellation: one bead per persisted candidate, generation by generation around the plinth.
    const byGen = new Map<number, LiveCandidate[]>();
    for (const c of state.candidates) byGen.set(c.generation, [...(byGen.get(c.generation) ?? []), c]);
    const focus = focusCandidate(state);
    for (const [generation, list] of byGen) {
      const radius = 0.5 + generation * 0.14;
      list.forEach((c, i) => {
        const a = (i / list.length) * Math.PI * 2 + generation * 0.4;
        const measured = Boolean(c.stages.docking?.value ?? c.stages.quantum?.value);
        const color = c.status === 'rejected' ? 0x475569 : measured ? 0xfbbf24 : 0x67e8f9;
        const bead = new THREE.Mesh(new THREE.SphereGeometry(c === focus ? 0.035 : 0.022, 14, 10), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: c.status === 'rejected' ? 0.1 : 0.7, transparent: c.status === 'rejected', opacity: c.status === 'rejected' ? 0.45 : 1 }));
        bead.position.set(Math.cos(a) * radius, generation * 0.05, Math.sin(a) * radius);
        bead.name = `drug-candidate:${c.id}`;
        this.cloud!.add(bead);
      });
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
    if (focus && focus.smiles !== this.moleculeSmiles) void this.showMolecule(focus.smiles);
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

  private drawPanel(state: LiveDrugRunState | null): void {
    if (!this.screen) return;
    const { canvas, texture } = this.screen;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = 'rgba(8,18,32,0.86)'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.strokeStyle = '#22d3ee'; g.lineWidth = 3; g.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    g.fillStyle = '#a5f3fc'; g.font = 'bold 30px monospace';
    g.fillText('ODKRYWANIE LEKÓW · NA ŻYWO', 24, 48);
    g.font = '24px monospace'; g.fillStyle = '#e2e8f0';
    if (!state) { g.fillText('Czekam na uruchomienie runu…', 24, 100); texture.needsUpdate = true; return; }
    const focus = focusCandidate(state);
    const lines = [
      `Etap: ${state.stage}   generacje ${state.generationsCompleted}/${state.maxGenerations}`,
      `Kandydaci: ${state.candidates.length} (zachowani ${state.candidates.filter((c) => c.status === 'retained').length})`,
      `Fokus: ${focus?.smiles.slice(0, 34) ?? '—'}`,
      `Docking: ${fmt(focus?.stages.docking?.value, 'kcal/mol')}   QM gap: ${fmt(focus?.stages.quantum?.value, 'eV')}`,
      `ADMET: ${focus?.stages.admet?.status ?? '—'}${state.blocked.length ? `   BLOCKED: ${state.blocked.map((b) => b.stage).join(',')}` : ''}`,
      `MODEL_ESTIMATE · stan ${state.stateHash}`,
    ];
    lines.forEach((line, i) => g.fillText(line, 24, 100 + i * 44));
    texture.needsUpdate = true;
  }

  dispose(): void {
    this.clear(this.molecule); this.clear(this.cloud); this.clear(this.rings);
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
  return new Proxy(sim, {
    get(target, key, receiver) {
      if (key === 'init') return (THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, w: number, h: number) => { target.init(THREE, scene, camera, w, h); layer.attach(THREE, scene); };
      if (key === 'syncScene') return (scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera) => {
        target.syncScene(scene, camera);
        const now = performance.now(); layer.sync(Math.min(0.1, (now - last) / 1000)); last = now;
      };
      if (key === 'dispose') return () => { layer.dispose(); target.dispose?.(); };
      if (key === 'getStats') return () => {
        const base = target.getStats?.() ?? {};
        const hash = layer.renderedStateHash;
        return { ...base, drugBenchHash: hash ? Number.parseInt(hash, 16) : 0, drugBenchAtoms: layer.atomsShown };
      };
      const value = Reflect.get(target, key, receiver) as unknown;
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}
