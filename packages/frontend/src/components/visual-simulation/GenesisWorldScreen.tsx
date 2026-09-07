import { useCallback, useEffect, useMemo, useState } from 'react';
import type * as THREE_NS from 'three';
import type { Sim3D } from '../../core/three/types';
import type { SimParams } from '../../core/types';
import { useThreeLoop } from '../../core/three/useThreeLoop';
import { WorldFrameRenderer, type EntityVisualSpec } from '../../core/three/graphics/worldFrameRenderer';
import { InteractionController } from '../../core/three/graphics/interaction';
import type { WorldFrameEntity, WorldFrameEntityId } from '../../core/three/graphics/worldFrame';
import { getFrameState } from '../../core/worldModel/bridge/worldFrameState';
import { toGraphicsWorldFrame } from '../../core/worldModel/bridge/graphicsWorldFrameAdapter';
import { buildGenesisScientificCity4, type GenesisScientificCity4 } from '../../core/worldModel/domains/genesisScientificCity4';
import type { TemporalEngine } from '../../core/worldModel/temporal/temporalEngine';
import { PUMP_PIPE_DEFAULTS } from '../../core/engineeringGraph/pumpPipe';

/**
 * GENESIS WORLD OBSERVATION (Trinity browser verification page).
 *
 * Wires REAL C3 output (`buildGenesisScientificCity4` -> `getFrameState` ->
 * `toGraphicsWorldFrame`) into the EXISTING, generic C2 render pathway
 * (`WorldFrameRenderer` + `InteractionController`) on the EXISTING Sim3D/
 * useThreeLoop harness (the same infrastructure every other 3D lab page
 * already uses) — no second renderer, no second camera system, no second
 * picking implementation. This is C3's one browser-reachable observation
 * surface for verifying the Trinity pipeline end to end with real eyes on
 * a real WebGL canvas, not a claim resting only on vitest.
 */

const VISUAL_HINT_COLOR: Readonly<Record<string, number>> = {
  planet: 0x223344,
  region: 0x2a3a4a,
  city: 0x445566,
  district: 0x334455,
  road: 0x1c2430,
  building: 0x778899,
  'pump-pipe-system': 0x3388ff,
  population: 0xffaa33,
  lab: 0x33ccaa,
  substance: 0xcc66ff,
  environment: 0x66ddff,
};

function colorForVisualHint(hint?: string): number {
  return (hint ? VISUAL_HINT_COLOR[hint] : undefined) ?? 0x8899aa;
}

class GenesisWorldSim3D implements Sim3D {
  cameraAutoRotateSpeed = 0;
  private THREE: typeof THREE_NS | null = null;
  private root: THREE_NS.Group | null = null;
  private renderer: WorldFrameRenderer | null = null;
  private interaction: InteractionController | null = null;
  private width = 300;
  private height = 300;

  readonly city: GenesisScientificCity4;
  forkEngine: TemporalEngine | null = null;
  showFork = false;
  scrubTick: number | null = null;
  hoveredId: WorldFrameEntityId | null = null;

  /** Set by the React component to receive selection changes — the ONLY coupling between this Sim3D and React, exactly the pattern `interaction.ts` documents (`onSelect`). */
  onSelect?: (id: WorldFrameEntityId | null) => void;

  constructor() {
    this.city = buildGenesisScientificCity4({ rainfallAtTick: 2, populationCount: 5000 });
  }

  private activeEngine(): TemporalEngine {
    return this.showFork && this.forkEngine ? this.forkEngine : this.city.base.engine;
  }

  init(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, w: number, h: number): void {
    this.THREE = THREE;
    this.width = w;
    this.height = h;
    scene.background = new THREE.Color(0x0a0f1a);
    scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x30303a, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(60, 100, 40);
    scene.add(key);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x141c2b, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    this.root = new THREE.Group();
    scene.add(this.root);

    const resolveVisual = (entity: WorldFrameEntity): EntityVisualSpec => {
      const size = Math.max(1.5, 1.5 * (entity.scale ?? 1));
      const geometry = new THREE.BoxGeometry(size, size, size);
      const material = new THREE.MeshStandardMaterial({ color: colorForVisualHint(entity.visualHint), roughness: 0.6 });
      return { kind: 'object', object: new THREE.Mesh(geometry, material) };
    };
    const updateVisual = (entity: WorldFrameEntity, object: THREE_NS.Object3D): void => {
      const mesh = object as THREE_NS.Mesh;
      const material = mesh.material as THREE_NS.MeshStandardMaterial;
      const tripped = entity.visualHint === 'pump-pipe-system' && entity.scalars?.volumetricFlow === 0;
      const interrupted = typeof entity.status === 'string' && entity.status.toLowerCase().includes('interrupted');
      material.color.set(tripped ? 0xff3333 : interrupted ? 0xff8800 : colorForVisualHint(entity.visualHint));
    };

    this.renderer = new WorldFrameRenderer(THREE, this.root, { resolveVisual, updateVisual });
    this.interaction = new InteractionController(THREE, {
      camera,
      resolver: this.renderer,
      getTargets: () => (this.root ? [this.root] : []),
      onHoverChange: (id) => {
        this.hoveredId = id;
      },
      onSelect: (id) => {
        this.onSelect?.(id);
      },
    });

    camera.position.set(10, 55, 95);
    camera.lookAt(0, 0, 0);

    this.syncNow();
  }

  onResize(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }

  getOrbitTarget(): THREE_NS.Vector3 | null {
    return this.THREE ? new this.THREE.Vector3(0, 0, 0) : null;
  }

  private syncNow(): void {
    if (!this.renderer) return;
    const engine = this.activeEngine();
    const frame = getFrameState(engine, this.scrubTick ?? undefined);
    this.renderer.sync(toGraphicsWorldFrame(frame));
  }

  /** Advances the base world (and the counterfactual fork, if one exists) by one real tick. */
  advanceTick(): void {
    this.city.base.engine.advance(1, this.city.updater);
    this.forkEngine?.advance(1, this.city.updater);
    this.syncNow();
  }

  /**
   * Forks the base world AT ITS CURRENT TICK with a real emergency-repair intervention: the pump's
   * flow is reset to its known-safe baseline (`PUMP_PIPE_DEFAULTS.volumetricFlow`), regardless of
   * whether it has already tripped — an "operator manually resets the pump" intervention (mission
   * section 10's own example), deliberately robust to WHEN the observer clicks the button, unlike
   * `worldModelGenesisScientificCity4.test.ts`'s narrower "reduce flow before the trip resolves"
   * intervention (which only prevents a trip that hasn't happened yet).
   */
  createFork(): void {
    if (this.forkEngine) return;
    const engine = this.city.base.engine;
    this.forkEngine = engine.forkBranch(engine.tick, 'browser-verification-fork', (graph) => {
      const p = graph.getEntity(this.city.pumpPipeId);
      graph.updateEntity(this.city.pumpPipeId, {
        domainState: { ...p.domainState, volumetricFlow: PUMP_PIPE_DEFAULTS.volumetricFlow },
        statusLabel: 'Pump reset to safe flow (counterfactual intervention)',
      });
    });
    this.showFork = true;
    this.syncNow();
  }

  setShowFork(show: boolean): void {
    this.showFork = show;
    this.syncNow();
  }

  setScrubTick(tick: number | null): void {
    this.scrubTick = tick;
    this.syncNow();
  }

  update(): void {
    // Evolution is user-driven (advanceTick()), not continuous — every tick shown is one the
    // observer explicitly asked for, matching this page's role as a verification surface rather
    // than an ambient demo.
  }

  syncScene(): void {
    this.syncNow();
  }

  pointer(x: number, y: number, type: 'down' | 'move' | 'up'): void {
    if (!this.interaction) return;
    if (type === 'down') this.interaction.pointerDown(x, y);
    else if (type === 'move') this.interaction.pointerMove(x, y, this.width, this.height);
    else this.interaction.pointerUp(x, y, this.width, this.height);
  }

  dispose(): void {
    this.renderer?.dispose();
  }
}

export function GenesisWorldScreen() {
  const sim = useMemo(() => new GenesisWorldSim3D(), []);
  const params = useMemo<SimParams>(() => ({}), []);
  const { canvasRef, loading, failed } = useThreeLoop(sim, params, true);

  const [tick, setTick] = useState(0);
  const [forkTick, setForkTick] = useState<number | null>(null);
  const [showFork, setShowFork] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [selected, setSelected] = useState<WorldFrameEntityId | null>(null);
  const [pumpStatus, setPumpStatus] = useState('');

  useEffect(() => {
    sim.onSelect = (id: WorldFrameEntityId | null) => setSelected(id);
    return () => {
      sim.onSelect = undefined;
    };
  }, [sim]);

  // Takes the intended view mode as an explicit argument rather than closing over the `showFork`
  // React state — a caller that just called `setShowFork(next)` cannot then read `readPumpStatus()`
  // synchronously and expect it to see `next` (state updates are not synchronous), so every call
  // site passes the value it actually intends to display.
  const readPumpStatus = useCallback(
    (viewingFork: boolean): string => {
      const engine = viewingFork && sim.forkEngine ? sim.forkEngine : sim.city.base.engine;
      const pump = engine.graph.getEntity(sim.city.pumpPipeId);
      const flow = pump.domainState?.volumetricFlow;
      return `flow=${typeof flow === 'number' ? flow.toFixed(3) : '?'} m3/s — ${pump.statusLabel ?? 'nominal'}`;
    },
    [sim],
  );

  const handleAdvance = () => {
    sim.advanceTick();
    setTick(sim.city.base.engine.tick);
    if (sim.forkEngine) setForkTick(sim.forkEngine.tick);
    setPumpStatus(readPumpStatus(showFork));
  };

  const handleFork = () => {
    sim.createFork();
    setForkTick(sim.forkEngine?.tick ?? null);
    setShowFork(true);
    setPumpStatus(readPumpStatus(true));
  };

  const handleToggleFork = (show: boolean) => {
    sim.setShowFork(show);
    setShowFork(show);
    setPumpStatus(readPumpStatus(show));
  };

  const handleScrub = (value: number) => {
    setScrubValue(value);
    setScrubbing(true);
    sim.setScrubTick(value);
  };

  const handleLive = () => {
    setScrubbing(false);
    sim.setScrubTick(null);
  };

  return (
    <main id="main-content" tabIndex={-1} className="home genesis-world-screen">
      <div className="honesty-row">
        <span className="honesty educational">Genesis World Observation (Trinity)</span>
        <span className="honesty-note">
          Real Genesis Scientific City 4.0, generated through the createScientificWorld Trinity entry point and rendered via the generic
          WorldFrameRenderer (C2). Click an object to select it; use the controls below to advance time, scrub the timeline, and fork a
          counterfactual (emergency flow-reduction) world for comparison.
        </span>
      </div>

      <div className="character-stage">
        <canvas ref={canvasRef} className="character-canvas" aria-label="Genesis Scientific City 4.0 (Three.js)" />
        {loading && (
          <div className="route-loading" role="status">
            Ładowanie silnika 3D…
          </div>
        )}
        {failed && <div className="empty-state">Nie udało się uruchomić WebGL na tym urządzeniu.</div>}
      </div>

      <div className="sim-transport" data-testid="genesis-world-controls">
        <button className="chip-btn" data-testid="advance-tick" onClick={handleAdvance}>
          Advance tick
        </button>
        <button className="chip-btn" data-testid="create-fork" onClick={handleFork} disabled={forkTick !== null}>
          Create counterfactual fork
        </button>
        <button className="chip-btn" data-testid="show-base" aria-pressed={!showFork} onClick={() => handleToggleFork(false)} disabled={forkTick === null}>
          Base world
        </button>
        <button className="chip-btn" data-testid="show-fork" aria-pressed={showFork} onClick={() => handleToggleFork(true)} disabled={forkTick === null}>
          Fork world
        </button>
        <label>
          Scrub tick
          <input
            type="range"
            data-testid="scrub-slider"
            min={0}
            max={Math.max(1, tick)}
            value={scrubValue}
            onChange={(e) => handleScrub(Number(e.target.value))}
          />
        </label>
        <button className="chip-btn" data-testid="go-live" onClick={handleLive} disabled={!scrubbing}>
          Live
        </button>
      </div>

      <p className="footer-note" data-testid="genesis-world-status">
        Base tick: <span data-testid="base-tick">{tick}</span>
        {forkTick !== null && (
          <>
            {' '}
            · Fork tick: <span data-testid="fork-tick">{forkTick}</span> · Viewing: <span data-testid="viewing">{showFork ? 'fork' : 'base'}</span>
          </>
        )}
        {scrubbing && (
          <>
            {' '}
            · Scrubbed to tick <span data-testid="scrub-tick">{scrubValue}</span>
          </>
        )}
        {pumpStatus && (
          <>
            {' '}
            · Pump: <span data-testid="pump-status">{pumpStatus}</span>
          </>
        )}
        {selected && (
          <>
            {' '}
            · Selected: <span data-testid="selected-entity">{selected}</span>
          </>
        )}
      </p>
    </main>
  );
}
