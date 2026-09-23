import { useEffect, useMemo, useState } from 'react';
import { useThreeLoop } from '../core/three/useThreeLoop';
import type { SimParams } from '../core/types';
import { TemporalCinematicSim3D } from '../core/temporalCinematic/temporalCinematicSim3D';
import { kernelLedger } from '../core/agent/cyberReasoningKernel';
import {
  directGenesisWorld,
  directGenesisPromptWorld,
  recordDirectedAssetInspection,
  recordDirectedPromptWorldArtifact,
  recordDirectedPromptWorld,
  recordDirectedWorld,
  type GenesisWorldLight,
  type GenesisWorldNavigation,
  type GenesisWorldPreset,
  type GenesisWorldWeather,
} from '../core/worldDirector/genesisWorldDirector';
import { buildSpacetimeCameraPath, type SpacetimeWorldDescriptor } from '../core/temporalCinematic/spacetimeWorldDescriptor';
import { canonicalJson, fnv1a } from '../core/events/hash';
import {
  directSw4World,
  isSw4WorldPrompt,
  type Sw4ComparisonBranch,
} from '../core/worldDirector/sw4WorldDirectorAdapter';
import type { Sw4RenderState } from '../core/worldModel/scenarios/sw4EpidemiologyCity';

declare global {
  interface Window {
    __GENESIS_WORLD_DIRECTOR__?: {
      readonly ready: true;
      readonly worldId: string;
      readonly preset: GenesisWorldPreset;
      readonly entityCount: number;
      readonly evidenceHash: string;
      readonly durationSeconds: number;
      seekTo(seconds: number): void;
      seekAndWait(seconds: number): Promise<void>;
      getCurrentTimeSeconds(): number;
      recordCaptureArtifact(input: { readonly seconds: number; readonly artifactFile: string; readonly artifactSha256: string }): { readonly evidenceHash: string; readonly semanticFingerprint: string };
      getPresentationSummary(): ReturnType<TemporalCinematicSim3D['getPresentationSummary']>;
      getInteractionTargets(): ReturnType<TemporalCinematicSim3D['getInteractionTargets']>;
      getProductWorld(): {
        readonly worldId: string;
        readonly template: string;
        readonly fingerprint: string;
        readonly descriptor: SpacetimeWorldDescriptor;
      } | null;
      getSw4State(): Sw4RenderState | null;
    };
  }
}

function twoAnimationFrames(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export function WorldDirectorScreen(): JSX.Element {
  const [preset, setPreset] = useState<GenesisWorldPreset>('MODERN_SCIENTIFIC_LAB');
  const [populationEnabled, setPopulationEnabled] = useState(true);
  const [light, setLight] = useState<GenesisWorldLight>('DAY');
  const [weather, setWeather] = useState<GenesisWorldWeather>('CLEAR');
  const [navigation, setNavigation] = useState<GenesisWorldNavigation>('CINEMATIC');
  const [assetSelection, setAssetSelection] = useState<{ readonly entityId: string; readonly slotType: string } | null>(null);
  const [assetEvidenceHash, setAssetEvidenceHash] = useState<string | null>(null);
  const initialPrompt = (() => {
    if (typeof window === 'undefined') return 'Generate an Einstein-Rosen bridge and show a cinematic flythrough.';
    const query = window.location.hash.split('?')[1] ?? '';
    return new URLSearchParams(query).get('prompt')?.trim() || 'Generate an Einstein-Rosen bridge and show a cinematic flythrough.';
  })();
  const [worldPrompt, setWorldPrompt] = useState(initialPrompt);
  const [submittedPrompt, setSubmittedPrompt] = useState(worldPrompt);
  const [sw4Branch, setSw4Branch] = useState<Sw4ComparisonBranch>('BASELINE');
  const sw4Resolution = useMemo(() => {
    if (!isSw4WorldPrompt(submittedPrompt)) return { world: null, error: null };
    try {
      return { world: directSw4World(submittedPrompt, sw4Branch), error: null };
    } catch (error) {
      return { world: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [submittedPrompt, sw4Branch]);
  const sw4World = sw4Resolution.world;
  const productResolution = useMemo(() => {
    if (isSw4WorldPrompt(submittedPrompt)) return { world: null, error: null };
    try {
      const value = directGenesisPromptWorld(submittedPrompt);
      return { world: value, error: null };
    } catch (error) {
      return { world: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [submittedPrompt]);
  const productWorld = productResolution.world;
  const promptError = sw4Resolution.error ?? productResolution.error;
  const directed = useMemo(() => directGenesisWorld({ preset, populationEnabled, light, weather, navigation }), [preset, populationEnabled, light, weather, navigation]);
  const productCamera = useMemo(() => productWorld ? buildSpacetimeCameraPath(productWorld.descriptor) : null, [productWorld]);
  const sim = useMemo(() => new TemporalCinematicSim3D(
    sw4World?.engine ?? productWorld?.runtime.engine ?? directed.scene.world.engine,
    sw4World?.camera ?? productCamera ?? directed.scene.camera,
    {
    weather: directed.presentation.weather,
    year: directed.scene.year,
    viewMode: sw4World || productWorld ? 'street' : directed.presentation.viewMode,
    roomType: sw4World || productWorld ? undefined : directed.presentation.roomType ?? undefined,
    navigationMode: directed.presentation.navigationMode,
    spacetimeDescriptor: productWorld?.descriptor,
    evidenceField: sw4World?.evidenceField,
    autoPlay: true,
    onAssetSelection: (selection) => {
      setAssetSelection(selection);
      setAssetEvidenceHash(selection ? recordDirectedAssetInspection(kernelLedger, directed, selection) : null);
    },
    },
  ), [directed, productCamera, productWorld, sw4World]);
  const params = useMemo<SimParams>(() => ({}), []);
  const { canvasRef, loading, failed } = useThreeLoop(sim, params, true);

  useEffect(() => {
    if (loading || failed) return;
    const evidenceHash = sw4World
      ? sw4World.evidence.scientificContentFingerprint
      : productWorld
      ? recordDirectedPromptWorld(kernelLedger, productWorld)
      : recordDirectedWorld(kernelLedger, directed);
    const activeWorldId = sw4World?.renderState.worldId ?? productWorld?.world.generated.worldId ?? directed.proof.worldId;
    const activeEntityCount = sw4World?.engine.graph.listEntities().length ?? productWorld?.runtime.engine.graph.listEntities().length ?? directed.proof.entityCount;
    const hook = {
      ready: true as const,
      worldId: activeWorldId,
      preset: directed.request.preset,
      entityCount: activeEntityCount,
      evidenceHash,
      durationSeconds: productCamera?.durationSeconds ?? directed.scene.camera.durationSeconds,
      seekTo: (seconds: number) => sim.seekTo(seconds),
      seekAndWait: async (seconds: number) => { sim.seekTo(seconds); await twoAnimationFrames(); },
      getCurrentTimeSeconds: () => sim.getCurrentTimeSeconds(),
      recordCaptureArtifact: (input: { readonly seconds: number; readonly artifactFile: string; readonly artifactSha256: string }) => {
        if (!productWorld) throw new Error('WORLD_DIRECTOR_PROMPT_WORLD_REQUIRED_FOR_CAPTURE');
        const semanticFingerprint = fnv1a(canonicalJson({
          worldId: productWorld.world.generated.worldId,
          template: productWorld.primaryTemplate,
          descriptor: productWorld.descriptor,
          seconds: input.seconds,
          presentation: sim.getPresentationSummary(),
        }));
        const captureEvidenceHash = recordDirectedPromptWorldArtifact(kernelLedger, {
          worldId: productWorld.world.generated.worldId,
          template: productWorld.primaryTemplate,
          descriptorKind: productWorld.descriptor.kind,
          seconds: input.seconds,
          artifactFile: input.artifactFile,
          artifactSha256: input.artifactSha256,
          semanticFingerprint,
        });
        return { evidenceHash: captureEvidenceHash, semanticFingerprint };
      },
      getPresentationSummary: () => sim.getPresentationSummary(),
      getInteractionTargets: () => sim.getInteractionTargets(),
      getProductWorld: () => productWorld ? ({
        worldId: productWorld.world.generated.worldId,
        template: productWorld.primaryTemplate,
        fingerprint: productWorld.deterministicFingerprint,
        descriptor: productWorld.descriptor,
      }) : null,
      getSw4State: () => sw4World?.renderState ?? null,
    };
    window.__GENESIS_WORLD_DIRECTOR__ = hook;
    return () => { if (window.__GENESIS_WORLD_DIRECTOR__ === hook) delete window.__GENESIS_WORLD_DIRECTOR__; };
  }, [directed, failed, loading, productCamera, productWorld, sim, sw4World]);

  return (
    <main className="world-director" id="main-content" data-testid="world-director" data-preset={preset}>
      <canvas ref={canvasRef} className="world-director-canvas" data-testid="world-director-canvas" />
      <section className="world-director-panel gx-glass" aria-label="World Director controls">
        <span className="gx-eyebrow">Canonical World Director · THREE.js</span>
        <h1>Reżyser świata</h1>
        <p>Jeden pipeline: WorldSpecification → WorldGraph → WorldFrame → THREE.js.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSubmittedPrompt(worldPrompt.trim());
          }}
          data-testid="world-director-prompt-form"
        >
          <label>Prompt świata
            <input
              value={worldPrompt}
              onChange={(event) => setWorldPrompt(event.target.value)}
              data-testid="world-director-prompt"
            />
          </label>
          <button type="submit" data-testid="world-director-generate">Generuj kanoniczny świat</button>
        </form>
        <label>Preset
          <select value={preset} onChange={(event) => setPreset(event.target.value as GenesisWorldPreset)} data-testid="world-director-preset">
            <option value="MODERN_SCIENTIFIC_LAB">Nowoczesne laboratorium</option>
            <option value="MODERN_CITY">Nowoczesne miasto</option>
            <option value="HISTORICAL_RECONSTRUCTION">Rekonstrukcja historyczna (model)</option>
          </select>
        </label>
        <div className="world-director-row">
          <label><input type="checkbox" checked={populationEnabled} onChange={(event) => setPopulationEnabled(event.target.checked)} /> Populacja</label>
          <label>Światło <select value={light} onChange={(event) => setLight(event.target.value as GenesisWorldLight)}><option>DAY</option><option>NIGHT</option></select></label>
        </div>
        <div className="world-director-row">
          <label>Pogoda <select value={weather} onChange={(event) => setWeather(event.target.value as GenesisWorldWeather)}><option>CLEAR</option><option>RAIN</option><option>FOG</option></select></label>
          <label>Kamera <select value={navigation} onChange={(event) => setNavigation(event.target.value as GenesisWorldNavigation)} data-testid="world-director-navigation"><option>WALK</option><option>OBSERVER</option><option>CINEMATIC</option></select></label>
        </div>
        <dl className="world-director-proof" data-testid="world-director-proof">
          <div><dt>World ID</dt><dd>{sw4World?.renderState.worldId ?? productWorld?.world.generated.worldId ?? directed.proof.worldId}</dd></div>
          <div><dt>Encje</dt><dd>{sw4World?.engine.graph.listEntities().length ?? productWorld?.runtime.engine.graph.listEntities().length ?? directed.proof.entityCount}</dd></div>
          <div><dt>Ludzie</dt><dd>{sw4World ? 0 : productWorld ? productWorld.runtime.engine.graph.listEntities().filter((entity) => entity.ref.kind === 'human').length : directed.proof.humanEntityCount}</dd></div>
          <div><dt>ROOM / ASSET_SLOT</dt><dd>{sw4World ? '0 / 0' : productWorld ? `${productWorld.runtime.engine.graph.listEntities().filter((entity) => entity.geometry?.kind === 'ROOM').length} / ${productWorld.runtime.engine.graph.listEntities().filter((entity) => entity.geometry?.kind === 'ASSET_SLOT').length}` : `${directed.proof.roomCount} / ${directed.proof.assetSlotCount}`}</dd></div>
          <div data-testid="world-director-selection"><dt>Wybrany instrument</dt><dd>{assetSelection ? `${assetSelection.slotType} · ${assetSelection.entityId}` : 'Kliknij instrument w scenie'}</dd></div>
          <div data-testid="world-director-selection-evidence"><dt>Evidence</dt><dd>{assetEvidenceHash ? assetEvidenceHash.slice(0, 16) : '—'}</dd></div>
          <div data-testid="world-director-product-world"><dt>Świat z promptu</dt><dd>{sw4World ? `SW-4 · ${sw4World.engine.graph.listEntities().length} encji` : productWorld ? `${productWorld.primaryTemplate} · ${productWorld.world.graph.listEntities().length} encji` : promptError ?? '—'}</dd></div>
          <div data-testid="world-director-product-proof"><dt>Fingerprint</dt><dd>{sw4World?.renderState.worldStateFingerprint ?? productWorld?.deterministicFingerprint ?? '—'}</dd></div>
        </dl>
        {sw4World ? <Sw4WorldPreview
          state={sw4World.renderState}
          replayStatus={sw4World.replayStatus}
          fieldFingerprint={sw4World.evidenceField.fieldFingerprint}
          fieldNodeCount={sw4World.evidenceField.nodes.length}
          branch={sw4World.comparisonBranch}
          onBranchChange={setSw4Branch}
        /> : null}
        {productWorld ? <SpacetimeDescriptorPreview descriptor={productWorld.descriptor} /> : null}
        <span className="world-director-status" data-testid="world-director-status">{failed ? 'WEBGL ERROR' : loading ? 'LOADING' : 'LIVE · CANONICAL'}</span>
      </section>
    </main>
  );
}

function Sw4WorldPreview({
  state,
  replayStatus,
  fieldFingerprint,
  fieldNodeCount,
  branch,
  onBranchChange,
}: {
  readonly state: Sw4RenderState;
  readonly replayStatus: 'MATCH';
  readonly fieldFingerprint: string;
  readonly fieldNodeCount: number;
  readonly branch: Sw4ComparisonBranch;
  readonly onBranchChange: (branch: Sw4ComparisonBranch) => void;
}): JSX.Element {
  return (
    <section aria-label="SW-4 epidemic city state" data-testid="world-director-sw4-state">
      <strong>SW-4 · REAL SEIR · {state.solverId}</strong>
      <span>tick {state.tick} · dzień {state.simulatedTimeDays} · replay {replayStatus}</span>
      <label>Porównanie świata
        <select
          value={branch}
          onChange={(event) => onBranchChange(event.target.value as Sw4ComparisonBranch)}
          data-testid="world-director-sw4-branch"
        >
          <option value="BASELINE">BASELINE</option>
          <option value="WORLD_A">WORLD A · wczesna interwencja modelowa</option>
          <option value="WORLD_B">WORLD B · średnia interwencja modelowa</option>
          <option value="WORLD_C">WORLD C · późna interwencja modelowa</option>
        </select>
      </label>
      <dl className="world-director-proof">
        <div><dt>S</dt><dd>{state.susceptible.toFixed(1)}</dd></div>
        <div><dt>E</dt><dd>{state.exposed.toFixed(1)}</dd></div>
        <div><dt>I</dt><dd>{state.infected.toFixed(1)}</dd></div>
        <div><dt>R</dt><dd>{state.recovered.toFixed(1)}</dd></div>
      </dl>
      <small>{state.disclosure}</small>
      <small data-testid="world-director-evidence-field">
        Evidence Field · {branch} · {fieldNodeCount} węzłów · {fieldFingerprint} · VISUALIZATION ONLY
      </small>
    </section>
  );
}

function SpacetimeDescriptorPreview({ descriptor }: { readonly descriptor: SpacetimeWorldDescriptor }): JSX.Element {
  const primitives = descriptor.primitives.slice(0, 48);
  return (
    <section aria-label="Spacetime render descriptor" data-testid="world-director-spacetime-descriptor">
      <strong>{descriptor.title}</strong>
      <span>{descriptor.epistemic} · {descriptor.kind} · {descriptor.primitives.length} primitives</span>
      <svg viewBox="0 0 320 120" role="img" aria-label={`${descriptor.title} descriptor preview`}>
        <rect width="320" height="120" fill={descriptor.palette[0]} />
        {primitives.map((primitive, index) => {
          const x = 160 + Math.max(-140, Math.min(140, primitive.position[0] * 2));
          const y = 60 + Math.max(-50, Math.min(50, primitive.position[2] * 0.8 + primitive.position[1] * -0.5));
          if (primitive.shape === 'RING') {
            return <ellipse key={primitive.id} cx={x} cy={y} rx={Math.max(3, primitive.scale[0] * 1.6)} ry={Math.max(1, primitive.scale[1] * 0.35)} fill="none" stroke={index % 2 ? descriptor.palette[1] : descriptor.palette[2]} opacity={primitive.intensity} />;
          }
          return <circle key={primitive.id} cx={x} cy={y} r={Math.max(1.5, primitive.scale[0] * 2)} fill={primitive.shape === 'SUN' ? descriptor.palette[2] : descriptor.palette[1]} opacity={Math.max(0.25, primitive.intensity)} />;
        })}
      </svg>
      <small>{descriptor.limitations.join(' ')}</small>
    </section>
  );
}

export default WorldDirectorScreen;
