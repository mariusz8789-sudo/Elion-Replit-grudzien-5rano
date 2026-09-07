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
import { getFrameState, type WorldFrameEntity, type WorldFrameState } from '../worldModel/bridge/worldFrameState';
import { toGraphicsWorldFrame } from '../worldModel/bridge/graphicsWorldFrameAdapter';
import { WorldFrameRenderer } from './graphics/worldFrameRenderer';
import { InteractionController } from './graphics/interaction';
import type { WorldFrameEntityId } from './graphics/worldFrame';
import { resolveCameraFraming } from './graphics/cameraRig';
import { createMoleculeAdapter, type MoleculeAdapter } from './graphics/moleculeAdapterBridge';
import { createBond, ELEMENT_STYLE, elementStyleOf } from './graphics/moleculeKit';
import { createHeroLight, createBackgroundFill, type HeroLightHandles } from './graphics/lighting';
import { disposeSceneResources } from './graphics/lifecycle';
import { setupGraphicsPipeline } from './graphics/postProcessing';

/**
 * GENESIS WORLD INTERACTION — clickable atoms + optional camera follow.
 *
 * Reuses the EXACT same generic pieces `GenesisWorldScreen.tsx` already proved out for a different
 * WorldFrame scene: `InteractionController` (`graphics/interaction.ts`) for click/hover -> entity id,
 * with `WorldFrameRenderer` itself as the `EntityResolver` (it already tags every object-kind
 * entity's root with a WorldFrame entity id — see that renderer's own `resolveEntityId`). No new
 * picking implementation, no new raycasting code.
 *
 * "Optional follow" reuses the SAME `Sim3D.getOrbitTarget()`/`getOrbitFocusDistance()` seam
 * `epidemicCity3D.ts`'s `applyObservationTarget` already drives (see that file's own doc) — a
 * generic, already-existing "pivot the camera onto a live point, smoothly, without disabling free
 * orbit" mechanism `useThreeLoop.ts` lerps every frame. This is deliberately NOT the one-time
 * `reframeCamera` below (that stays exactly as it was, for the initial materialisation shot) — this
 * is the continuous, opt-in tracking mode for once the viewer has actually selected something.
 *
 * An atom with no real backing data is structurally impossible to select here: `moleculeAdapterBridge
 * .ts`'s own doc is explicit that an atom entity does not exist in the graph AT ALL until it is
 * really materialised (no placeholder-atom case to gate against) — so a resolved WorldFrame entity
 * id for an `atom-*` visual hint is, by construction, always a real atom.
 */
export interface SelectedAtomInfo {
  entityId: WorldFrameEntityId;
  element: string;
  notModeled: boolean;
}

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
 *
 * GRAPHICS V5 VISUAL POLISH: a molecule viewer is a studio hero-object shot (`lighting.ts`'s own
 * documented HERO role — "this is the hero apparatus"), not a lit exterior/room, so this composes
 * `createHeroLight` (KEY+RIM, tuned for a small tabletop-scale subject) + `createBackgroundFill`
 * directly instead of the generic `sceneEnvironment.ts` sun/fill pair (a `DirectionalLight` "sun"
 * shadow frustum defaults to room/exterior scale — oversized and the wrong falloff behavior for a
 * ~1-5 world-unit molecule). Real image-based reflections are on (`setupPostProcessing`'s default
 * `ambient: 'studio+hdri'`, not `'none'`) — the CPK atom/bond materials set real `metalness`, which
 * reads as flat plastic with nothing to reflect otherwise. The camera does a ONE-TIME real reframe
 * once materialisation resolves and the molecule's true extent is known (`reframeCamera`) — it
 * rescales the camera's CURRENT distance from origin along whatever direction the user/auto-rotate
 * has already reached, so a bigger or smaller real molecule (a caller-supplied SMILES, not just the
 * default caffeine) always frames correctly without fighting `OrbitControls`' own free-orbit
 * interactivity (which re-derives its internal spherical state from `camera.position` on its very
 * next `update()` call — a direct one-time position write is exactly what it expects). This is
 * deliberately NOT the generic `Sim3D.getOrbitFocusDistance()` hook: that hook's contract
 * unconditionally overwrites `camera.position` to a fixed preset direction EVERY frame (see
 * `useThreeLoop.ts`), which would lock out free dragging/auto-rotate entirely — wrong for a hero
 * object meant to be looked around, right only for a scripted/locked observation camera.
 */

/** Caffeine — a real, recognizable SMILES exercising all three bond-order cases at once (aromatic
 * imidazole ring, C=O double bonds, C-N/C-H single bonds) plus multiple distinct elements, making it
 * a genuinely useful default demonstration molecule rather than an arbitrarily simple one. */
const DEFAULT_SMILES = 'Cn1cnc2c1c(=O)n(C)c(=O)n2C';

/**
 * The real molecule's own extent — the max distance any real atom sits from the local origin
 * (every atom entity's `ref.kind` starts with `'atom-'`, per `molecularStructure.ts`'s own batch-key
 * convention). `undefined` when no atoms exist yet (before materialisation, or a blocked/refused
 * one) — the caller keeps its previous/default radius rather than snapping to zero. The +0.6 padding
 * is a generous allowance for the outermost atom's own CPK ball radius plus its bond stick length,
 * so the true edge of the rendered geometry (not just the atom's center point) stays inside frame.
 */
function moleculeBoundingRadius(entities: readonly WorldFrameEntity[]): number | undefined {
  let maxDistSq = 0;
  let found = false;
  for (const entity of entities) {
    if (!entity.ref.kind.startsWith('atom-')) continue;
    found = true;
    const { x, y, z } = entity.transform.position;
    maxDistSq = Math.max(maxDistSq, x * x + y * y + z * z);
  }
  return found ? Math.sqrt(maxDistSq) + 0.6 : undefined;
}

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
  private scene: THREE_NS.Scene | null = null;
  private renderer: WorldFrameRenderer | null = null;
  private adapter: MoleculeAdapter | null = null;
  private atomMaterials = new Map<string, THREE_NS.Material>();
  private backgroundFill: THREE_NS.HemisphereLight | null = null;
  private heroLights: HeroLightHandles | null = null;

  private interaction: InteractionController | null = null;
  private viewportWidth = 300;
  private viewportHeight = 300;
  private selectedAtomId: WorldFrameEntityId | null = null;
  private following = false;
  /** Set by a caller (`MoleculeLabScreen.tsx`) to receive selection changes — the ONLY coupling
   * between this Sim3D and React, the exact pattern `GenesisWorldScreen.tsx`'s own `onSelect`
   * already establishes for a different WorldFrame scene. */
  onAtomSelected?: (info: SelectedAtomInfo | null) => void;

  private bondsGroup: THREE_NS.Group | null = null;
  private bondMaterial: THREE_NS.Material | null = null;
  private aromaticMaterial: THREE_NS.Material | null = null;
  /** The `bondsMaterialised` count the currently-built `bondsGroup` reflects — rebuild only when
   * this actually changes, not every frame. */
  private lastBondsMaterialised = -1;
  /** Real bounding radius (world units) of the currently-materialised molecule, from its own real
   * atom positions — the default is a reasonable guess for the DEFAULT_SMILES caffeine shot before
   * real data exists, replaced by `reframeCamera`'s real measurement the moment atoms materialise. */
  private moleculeRadius = 2.2;

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

  init(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, w: number, h: number): void {
    this.THREE = THREE;
    this.scene = scene;
    this.viewportWidth = w;
    this.viewportHeight = h;
    // No ground, no sky, no room — a molecule viewer is a hero-object studio shot. BACKGROUND role
    // (a weak hemisphere wash, keeps the periphery from reading as pure black) + HERO role (a
    // coherent, already-tuned KEY+RIM aimed at the molecule's own local origin) instead of the
    // generic exterior sun/fill pair — see the module doc for exactly why.
    this.backgroundFill = createBackgroundFill(THREE, scene, { intensity: 0.45 });
    this.heroLights = createHeroLight(THREE, scene, {
      target: [0, 0, 0],
      keyDistance: 5,
      rimDistance: 2.4,
      intensity: { key: 36, rim: 8 },
      // No floor/receiver in a studio molecule shot — a shadow with nothing to fall on is a wasted
      // shadow-map budget, not a visual improvement.
      castShadow: false,
    });

    this.bondMaterial = new THREE.MeshStandardMaterial({ color: 0xb8bfc9, roughness: 0.4, metalness: 0.15 });
    this.aromaticMaterial = new THREE.MeshStandardMaterial({ color: 0x7fd8ff, roughness: 0.3, metalness: 0.2, emissive: 0x1a4a5c, emissiveIntensity: 0.3 });
    this.bondsGroup = new THREE.Group();
    this.bondsGroup.name = 'genesis-molecule-bonds';
    scene.add(this.bondsGroup);

    // One shared MeshStandardMaterial per element actually used by ELEMENT_STYLE's own table —
    // `materials.ts`'s "one shared instance per category" convention, not one material per atom.
    // Roughness lowered from the original flat-plastic tuning now that real IBL reflections are on
    // (see setupPostProcessing) — a CPK ball reads as a glossy, physically lit sphere instead of a
    // matte one with nothing to reflect.
    for (const [element, style] of Object.entries(ELEMENT_STYLE)) {
      this.atomMaterials.set(element, new THREE.MeshStandardMaterial({ color: style.color, roughness: 0.32, metalness: 0.1 }));
    }

    this.adapter = createMoleculeAdapter(THREE, { atomMaterials: Object.fromEntries(this.atomMaterials) });
    this.renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual: this.adapter.resolveVisual, updateVisual: this.adapter.updateVisual });
    this.interaction = new InteractionController(THREE, {
      camera,
      resolver: this.renderer,
      getTargets: () => (this.scene ? [this.scene] : []),
      onSelect: (id) => this.handleSelect(id),
    });

    // A reasonable starting shot for the moleculeRadius default above — reframeCamera replaces this
    // with the real framing the instant real atom positions exist.
    camera.position.set(this.moleculeRadius * 1.6, this.moleculeRadius * 1.2, this.moleculeRadius * 1.6);
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
    // No continuous animation of its own — a conformer is a static shot; `useThreeLoop.ts`'s own
    // `cameraAutoRotateSpeed` handles the "keeps turning until dragged" motion.
  }

  onResize(w: number, h: number): void {
    this.viewportWidth = w;
    this.viewportHeight = h;
  }

  /** Mechanical screen-point -> WorldFrame entity id -> selection pipeline, entirely delegated to
   * `InteractionController` (see the module doc). */
  pointer(x: number, y: number, type: 'down' | 'move' | 'up'): void {
    if (!this.interaction) return;
    if (type === 'down') this.interaction.pointerDown(x, y);
    else if (type === 'move') this.interaction.pointerMove(x, y, this.viewportWidth, this.viewportHeight);
    else this.interaction.pointerUp(x, y, this.viewportWidth, this.viewportHeight);
  }

  private handleSelect(id: WorldFrameEntityId | null): void {
    this.selectedAtomId = id;
    if (!id) {
      this.onAtomSelected?.(null);
      return;
    }
    const frame = getFrameState(this.engine);
    const entity = frame.entities.find((e) => e.id === id);
    if (!entity || !entity.ref.kind.startsWith('atom-')) {
      // Resolved to a tagged entity that isn't an atom (the molecule root anchor has no geometry to
      // hit, so this shouldn't occur in practice) — an honest empty selection, never a guessed one.
      this.selectedAtomId = null;
      this.onAtomSelected?.(null);
      return;
    }
    this.onAtomSelected?.({
      entityId: id,
      element: entity.ref.kind.slice('atom-'.length),
      notModeled: entity.grounding === 'UNGROUNDED_APPROXIMATION',
    });
  }

  /** Whether the camera should continuously pivot onto the currently-selected atom — the "optional
   * follow" the click-to-select interaction offers. `false` (the default) leaves the one-time
   * `reframeCamera` shot and free orbit exactly as before. */
  setFollowSelected(follow: boolean): void {
    this.following = follow;
  }

  /** Live world position of the followed atom — read every frame by `useThreeLoop.ts`, the SAME
   * generic seam `epidemicCity3D.ts`'s `applyObservationTarget` already drives (see the module doc).
   * `null` whenever nothing is being followed, which leaves `camera.position` alone entirely. */
  getOrbitTarget(): THREE_NS.Vector3 | null {
    if (!this.following || !this.selectedAtomId || !this.renderer || !this.THREE) return null;
    const object = this.renderer.getObjectForEntity(this.selectedAtomId);
    if (!object) return null;
    const world = new this.THREE.Vector3();
    object.getWorldPosition(world);
    return world;
  }

  /** Standoff distance for the followed atom, from `resolveCameraFraming` (`graphics/cameraRig.ts`)
   * — a small `MACRO` shot (this engine's own tuning for "get close to a small, characteristic-size
   * subject"), never a hand-picked constant duplicating that module's own distance table. */
  getOrbitFocusDistance(): number | null {
    if (!this.following || !this.selectedAtomId) return null;
    const framing = resolveCameraFraming({ intent: 'MACRO', target: [0, 0, 0], targetRadius: 1.2 });
    const [px, py, pz] = framing.position;
    return Math.sqrt(px * px + py * py + pz * pz);
  }

  syncScene(_scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera): void {
    if (!this.renderer || !this.THREE) return;
    const frame = getFrameState(this.engine);
    const graphicsFrame = toGraphicsWorldFrame(frame);
    this.renderer.sync(graphicsFrame);
    const justMaterialised = this.syncBonds(frame);
    // `!this.materialising` matters: `molecule.scalars.bondsMaterialised` reads as the same `0`
    // both "not yet materialised" (the key doesn't exist on `domainState` yet) and "materialised
    // with genuinely zero bonds" — `syncBonds`'s own change-detection gate can't tell those apart
    // from the number alone. Gating the reframe on `materialising` having already concluded (success
    // OR an honest block, both flip it false) is what prevents a spurious reframe on the very first
    // in-flight tick, before real data (or its honest absence) exists.
    if (justMaterialised && !this.materialising) this.reframeCamera(camera);
  }

  /**
   * Real bonds, built directly (per `ADAPTER_CONTRACT.md` rule 4/8), gated on the REAL numeric
   * `bondsMaterialised` scalar — not on prose, not on whether any atom merely exists. Rebuilt only
   * when that count actually changes (materialisation completing is the only time it ever will,
   * since a conformer is static), never every frame. Also updates `moleculeRadius` from the real
   * atom positions on that same transition, so `reframeCamera` always frames the ACTUAL molecule
   * that materialised, not a fixed guess. Returns whether a real materialisation transition just
   * happened (atoms/bonds appeared, or materialisation was honestly blocked) — the signal
   * `syncScene` uses to trigger the one-time camera reframe.
   */
  private syncBonds(frame: WorldFrameState): boolean {
    const THREE = this.THREE!;
    const molecule = frame.entities.find((e) => e.id === this.moleculeId);
    const bondsMaterialised = typeof molecule?.scalars.bondsMaterialised === 'number' ? molecule.scalars.bondsMaterialised : 0;
    if (bondsMaterialised === this.lastBondsMaterialised) return false;
    this.lastBondsMaterialised = bondsMaterialised;
    this.moleculeRadius = moleculeBoundingRadius(frame.entities) ?? this.moleculeRadius;

    disposeSceneResources(this.bondsGroup!);
    this.bondsGroup!.clear();
    if (bondsMaterialised <= 0) return true; // honest: no bond data, no sticks — see SOLVER_DATA_CONTRACT §C

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
    return true;
  }

  /**
   * A real, ONE-TIME auto-frame the instant the molecule's true extent is known — never a
   * continuous per-frame override (see the module doc for why `Sim3D.getOrbitFocusDistance()`
   * would be the wrong tool here). Rescales the camera's CURRENT distance from the origin along
   * whatever direction it's already at (preserving the user's/auto-rotate's current viewing angle)
   * so the full ball-and-stick extent fits with margin, then lets `OrbitControls`' own next
   * `update()` call re-derive its internal state from the new `camera.position` — free dragging and
   * auto-rotate keep working exactly as before, just re-centered on the real molecule size.
   */
  private reframeCamera(camera: THREE_NS.PerspectiveCamera): void {
    const focusDistance = Math.max(3, this.moleculeRadius * 2.2);
    const direction = camera.position.clone();
    if (direction.lengthSq() < 1e-6) direction.set(1, 0.72, 1);
    direction.normalize();
    camera.position.copy(direction.multiplyScalar(focusDistance));
    camera.lookAt(0, 0, 0);
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
      // Real image-based reflections (the default `'studio+hdri'`) — the CPK atom/bond materials
      // set real `metalness`; without an environment map they read as flat plastic regardless of
      // that PBR parameter, since metal must have SOMETHING to reflect. `'none'` (the old setting
      // here) was for a scene running its own environment/atmosphere entirely outside this module,
      // which this scene never did — it was simply never turned on.
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
    if (this.heroLights) {
      this.heroLights.key.parent?.remove(this.heroLights.key, this.heroLights.key.target);
      this.heroLights.rim.parent?.remove(this.heroLights.rim);
      this.heroLights = null;
    }
    if (this.backgroundFill) {
      this.backgroundFill.parent?.remove(this.backgroundFill);
      this.backgroundFill = null;
    }
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
    this.interaction = null;
    this.scene = null;
  }
}

// Re-exported so a caller building a fixed WorldGraph (e.g. a test, or a future "load a saved
// structure" path) can materialise geometry into it directly without reaching into worldModel/ —
// same convenience `applyMoleculeGeometry`/`atomEntityId` already offer C3-side callers.
export { applyMoleculeGeometry, atomEntityId, elementStyleOf };
