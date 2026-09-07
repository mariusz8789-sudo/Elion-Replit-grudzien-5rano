import type * as THREE_NS from 'three';
import type { PostProcessingModules, PostProcessor, Sim3D, ThreeRenderMetrics } from './types';
import { WorldGraph } from '../worldModel/ecs/worldGraph';
import { TemporalEngine } from '../worldModel/temporal/temporalEngine';
import {
  addMolecule, applyMoleculeGeometry, atomEntityId, bondOrderOf, createBackendGeometrySource,
  materialiseMoleculeOnEngine, MOLECULAR_BOND_KIND,
  MOLECULE_STATE_CODE, moleculeStateLabel,
  type MoleculeGeometrySource,
} from '../worldModel/domains/molecularStructure';
import { getFrameState } from '../worldModel/bridge/worldFrameState';
import { toGraphicsWorldFrame } from '../worldModel/bridge/graphicsWorldFrameAdapter';
import { WorldFrameRenderer } from './graphics/worldFrameRenderer';
import { createMoleculeAdapter, type MoleculeAdapter } from './graphics/moleculeAdapterBridge';
import { createBond, ELEMENT_STYLE, elementStyleOf } from './graphics/moleculeKit';
import { createSceneEnvironment, type SceneEnvironmentHandle } from './graphics/sceneEnvironment';
import { disposeSceneResources } from './graphics/lifecycle';
import { setupGraphicsPipeline } from './graphics/postProcessing';

/**
 * GRAPHICS V3, item 1 — the missing scene/world orchestration `molecularStructure.ts` did not have.
 *
 * `PHASE4_MOLECULAR_CONTRACT.md`/`worldModel/domains/molecularStructure.ts` (real RDKit atoms) and
 * Phase 8.1's bond channel (`SOLVER_DATA_CONTRACT.md` §C, real RDKit bonds) both existed with real
 * tests before this file — but nothing built the `WorldGraph`/`TemporalEngine`/`WorldFrameRenderer`
 * triple that turns "a molecule domain module exists" into "a molecule is actually on screen." This
 * is that triple, for CHEMICAL_REACTION-shaped scenes — the C1-facing "world builder" layer, same
 * role `genesisScientificCitySim.ts` plays for the hospital/pump world.
 *
 * THE ASYNC SEAM, HANDLED HONESTLY: `materialiseMoleculeOnEngine` is a real network call (tens to
 * hundreds of ms) and `Sim3D.init()` is synchronous — the exact tension
 * `PHASE4_MOLECULAR_CONTRACT.md` §1 already worked out for C3's OWN solver boundary. The same
 * answer applies here: `init()` starts materialisation and returns immediately; the molecule root
 * entity's real `grounding` (`UNGROUNDED_APPROXIMATION` until it resolves) is what
 * `WorldFrameRenderer` already renders as its own honest boundary placeholder in the meantime — no
 * "loading spinner" invented, no fabricated interim geometry. Once materialisation resolves (or is
 * honestly refused with `MATERIALISATION_BLOCKED` — the real answer this sandbox's own missing
 * RDKit install produces, see `PERFORMANCE_BUDGET.md`-style honesty notes in this file's own tests),
 * `materialiseMoleculeOnEngine` itself republishes the real state via `applyExternalPatch` (a real,
 * replay-safe delta — no `engine.advance()` needed, and deliberately none is called; see the note in
 * `init()`) and the next `syncScene` shows the real result.
 *
 * BONDS ARE BUILT HERE, NOT IN THE ADAPTER — per `ADAPTER_CONTRACT.md` rule 4/8: a real bond needs
 * both endpoints' positions, which only this scene (not a single-entity `resolveVisual`) has. Gated
 * on the REAL numeric `bondsMaterialised` scalar `molecularStructure.ts` publishes on the molecule
 * root — not on whether atoms merely exist, since an engine can genuinely materialise atoms with
 * zero bonds (a single ion, or a real "no bond data" response) and that must render as atoms with
 * NO sticks, exactly as `SOLVER_DATA_CONTRACT.md` §C requires.
 */

/** Caffeine — a real, recognizable SMILES exercising all three bond-order cases at once (aromatic
 * imidazole ring, C=O double bonds, C-N/C-H single bonds) plus multiple distinct elements, making it
 * a genuinely useful default demonstration molecule rather than an arbitrarily simple one. */
const DEFAULT_SMILES = 'Cn1cnc2c1c(=O)n(C)c(=O)n2C';

export interface MoleculeScene3DOptions {
  smiles?: string;
  seed?: number;
  /** Overrides the real backend source — for tests, or a caller with its own transport. Defaults
   * to `createBackendGeometrySource()`, the real `/api/compute/run` HTTP call. */
  geometrySource?: MoleculeGeometrySource;
}

export class MoleculeScene3D implements Sim3D {
  cameraAutoRotateSpeed = 6;

  private readonly engine: TemporalEngine;
  private readonly moleculeId: ReturnType<typeof addMolecule>;
  private readonly geometrySource: MoleculeGeometrySource;

  private THREE: typeof THREE_NS | null = null;
  private renderer: WorldFrameRenderer | null = null;
  private adapter: MoleculeAdapter | null = null;
  private atomMaterials = new Map<string, THREE_NS.Material>();
  private sceneEnvironment: SceneEnvironmentHandle | null = null;

  private bondsGroup: THREE_NS.Group | null = null;
  private bondMaterial: THREE_NS.Material | null = null;
  private aromaticMaterial: THREE_NS.Material | null = null;
  /** The `bondsMaterialised` count the currently-built `bondsGroup` reflects — rebuild only when
   * this actually changes, not every frame. */
  private lastBondsMaterialised = -1;

  private materialising = false;
  private materialiseError: string | null = null;
  private renderMetrics: ThreeRenderMetrics = { fps: 0, frameMs: 0, renderMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0, textureBytesEstimate: 0 };

  constructor(options: MoleculeScene3DOptions = {}) {
    // A bare graph, materialised into the LIVE engine below (`materialiseMoleculeOnEngine`) rather
    // than into this graph directly: `TemporalEngine`'s constructor clones its initial graph
    // (`initialGraph.clone()`), so mutating this reference after construction would silently never
    // reach `this.engine.graph` — every read after `init()` goes through `this.engine.graph`.
    const graph = new WorldGraph();
    this.moleculeId = addMolecule(graph, { smiles: options.smiles ?? DEFAULT_SMILES, seed: options.seed ?? 42 });
    this.engine = new TemporalEngine(graph, { label: 'molecule' });
    this.geometrySource = options.geometrySource ?? createBackendGeometrySource();
  }

  init(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, _w: number, _h: number): void {
    this.THREE = THREE;
    // No ground plane, no sky — a molecule viewer is a studio shot, not a place. `groundSize: 0`
    // is `sceneEnvironment.ts`'s own documented way to opt out of the shared ground plane entirely.
    this.sceneEnvironment = createSceneEnvironment(THREE, scene, {
      mode: 'INDOOR', groundSize: 0, sunIntensity: 2.4, sunPosition: [3, 4, 5], fillIntensity: 0.9, ambientHaze: false,
    });

    this.bondMaterial = new THREE.MeshStandardMaterial({ color: 0xb8bfc9, roughness: 0.55, metalness: 0.12 });
    this.aromaticMaterial = new THREE.MeshStandardMaterial({ color: 0x7fd8ff, roughness: 0.4, metalness: 0.18, emissive: 0x1a4a5c, emissiveIntensity: 0.3 });
    this.bondsGroup = new THREE.Group();
    this.bondsGroup.name = 'genesis-molecule-bonds';
    scene.add(this.bondsGroup);

    // One shared MeshStandardMaterial per element actually used by ELEMENT_STYLE's own table —
    // `materials.ts`'s "one shared instance per category" convention, not one material per atom.
    for (const [element, style] of Object.entries(ELEMENT_STYLE)) {
      this.atomMaterials.set(element, new THREE.MeshStandardMaterial({ color: style.color, roughness: 0.45, metalness: 0.08 }));
    }

    this.adapter = createMoleculeAdapter(THREE, { atomMaterials: Object.fromEntries(this.atomMaterials) });
    this.renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual: this.adapter.resolveVisual, updateVisual: this.adapter.updateVisual });

    camera.position.set(4, 3, 5);
    camera.lookAt(0, 0, 0);

    this.materialising = true;
    materialiseMoleculeOnEngine(this.engine, this.moleculeId, this.geometrySource)
      .then((result) => {
        this.materialising = false;
        if (!result.ok) this.materialiseError = result.reason ?? 'unknown';
        // No `engine.advance()` here, deliberately: `materialiseMoleculeOnEngine` already republishes
        // the molecule root's real post-materialisation state via `applyExternalPatch` (a real,
        // replay-safe delta). Routing a tick through `SolverRouter.routeTick` here would ALSO visit
        // every atom entity — and atoms carry no `domainBinding` (only the molecule root does, per
        // `molecularStructure.ts`), so `solverRouter.ts`'s "no binding => UNGROUNDED_APPROXIMATION"
        // rule would silently downgrade every real, just-materialised atom back to NOT_MODELED before
        // this scene ever renders it. A conformer is static — there is no per-tick physics an atom
        // needs routed to it, so no tick is routed.
      })
      .catch((error: unknown) => {
        this.materialising = false;
        this.materialiseError = `transport_failed: ${String((error as Error)?.message ?? error).slice(0, 120)}`;
      });
  }

  update(_dt: number): void {
    this.sceneEnvironment?.update(_dt);
  }

  syncScene(_scene: THREE_NS.Scene, _camera: THREE_NS.PerspectiveCamera): void {
    if (!this.renderer || !this.THREE) return;
    const frame = getFrameState(this.engine);
    const graphicsFrame = toGraphicsWorldFrame(frame);
    this.renderer.sync(graphicsFrame);
    this.syncBonds(frame);
  }

  /**
   * Real bonds, built directly (per `ADAPTER_CONTRACT.md` rule 4/8), gated on the REAL numeric
   * `bondsMaterialised` scalar — not on prose, not on whether any atom merely exists. Rebuilt only
   * when that count actually changes (materialisation completing is the only time it ever will,
   * since a conformer is static), never every frame.
   */
  private syncBonds(frame: ReturnType<typeof getFrameState>): void {
    const THREE = this.THREE!;
    const molecule = frame.entities.find((e) => e.id === this.moleculeId);
    const bondsMaterialised = typeof molecule?.scalars.bondsMaterialised === 'number' ? molecule.scalars.bondsMaterialised : 0;
    if (bondsMaterialised === this.lastBondsMaterialised) return;
    this.lastBondsMaterialised = bondsMaterialised;

    disposeSceneResources(this.bondsGroup!);
    this.bondsGroup!.clear();
    if (bondsMaterialised <= 0) return; // honest: no bond data, no sticks — see SOLVER_DATA_CONTRACT §C

    for (const relationship of frame.relationships) {
      const fromObject = this.renderer!.getObjectForEntity(relationship.fromEntityId);
      const toObject = this.renderer!.getObjectForEntity(relationship.toEntityId);
      if (!fromObject || !toObject) continue; // an endpoint isn't a rendered atom (shouldn't happen for real bonds, but never assume)
      const fromWorld = new THREE.Vector3();
      const toWorld = new THREE.Vector3();
      fromObject.getWorldPosition(fromWorld);
      toObject.getWorldPosition(toWorld);
      const aromatic = relationship.kind === MOLECULAR_BOND_KIND.AROMATIC;
      const order = bondOrderOf(relationship.kind);
      if (order <= 0 && !aromatic) continue; // relationship.kind isn't a bond token at all (defensive; molecule-only scene, should not occur)
      this.bondsGroup!.add(createBond(THREE, {
        from: [fromWorld.x, fromWorld.y, fromWorld.z],
        to: [toWorld.x, toWorld.y, toWorld.z],
        order, aromatic,
        material: this.bondMaterial!,
        aromaticMaterial: this.aromaticMaterial!,
      }));
    }
  }

  setupPostProcessing(
    modules: PostProcessingModules,
    renderer: THREE_NS.WebGLRenderer,
    scene: THREE_NS.Scene,
    camera: THREE_NS.PerspectiveCamera,
    w: number,
    h: number,
  ): PostProcessor {
    return setupGraphicsPipeline(this.THREE!, modules, renderer, {
      scene, camera, width: w, height: h,
      toneMappingExposure: 1.1,
      bloom: { strength: 0.28, radius: 0.45, threshold: 0.85 },
      ambient: { mode: 'none' },
    });
  }

  onRenderMetrics(metrics: ThreeRenderMetrics): void {
    this.renderMetrics = metrics;
  }

  getStats(): Record<string, number> {
    const molecule = this.engine.graph.tryGetEntity(this.moleculeId);
    const stateCode = typeof molecule?.domainState?.stateCode === 'number' ? molecule.domainState.stateCode : MOLECULE_STATE_CODE.NOT_MATERIALISED;
    return {
      moleculeStateCode: stateCode,
      atomsMaterialised: typeof molecule?.domainState?.atomsMaterialised === 'number' ? molecule.domainState.atomsMaterialised : 0,
      bondsMaterialised: typeof molecule?.domainState?.bondsMaterialised === 'number' ? molecule.domainState.bondsMaterialised : 0,
      materialising: this.materialising ? 1 : 0,
      materialiseBlocked: stateCode === MOLECULE_STATE_CODE.MATERIALISATION_BLOCKED ? 1 : 0,
      webgl_fps: this.renderMetrics.fps,
      webgl_render_ms: this.renderMetrics.renderMs,
      webgl_draw_calls: this.renderMetrics.drawCalls,
      webgl_triangles: this.renderMetrics.triangles,
    };
  }

  /** Human-readable companion to `getStats()`'s numeric `moleculeStateCode` — display-only, never
   * the gate itself (the real gate is the numeric scalar `syncBonds`/`getStats` read). */
  describeState(): string {
    const molecule = this.engine.graph.tryGetEntity(this.moleculeId);
    const stateCode = typeof molecule?.domainState?.stateCode === 'number' ? molecule.domainState.stateCode : MOLECULE_STATE_CODE.NOT_MATERIALISED;
    if (this.materialising) return 'Materialising real geometry from RDKit…';
    if (stateCode === MOLECULE_STATE_CODE.MATERIALISATION_BLOCKED) return `Blocked: ${this.materialiseError ?? moleculeStateLabel(stateCode)}`;
    return moleculeStateLabel(stateCode);
  }

  dispose(): void {
    this.sceneEnvironment?.dispose();
    this.sceneEnvironment = null;
    if (this.bondsGroup) {
      this.bondsGroup.parent?.remove(this.bondsGroup);
      disposeSceneResources(this.bondsGroup);
      this.bondsGroup = null;
    }
    this.bondMaterial?.dispose();
    this.bondMaterial = null;
    this.aromaticMaterial?.dispose();
    this.aromaticMaterial = null;
    for (const material of this.atomMaterials.values()) material.dispose();
    this.atomMaterials.clear();
    this.adapter?.dispose();
    this.adapter = null;
    this.renderer?.dispose();
    this.renderer = null;
  }
}

// Re-exported so a caller building a fixed WorldGraph (e.g. a test, or a future "load a saved
// structure" path) can materialise geometry into it directly without reaching into worldModel/ —
// same convenience `applyMoleculeGeometry`/`atomEntityId` already offer C3-side callers.
export { applyMoleculeGeometry, atomEntityId, elementStyleOf };
