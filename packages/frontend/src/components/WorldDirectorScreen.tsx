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
  const [worldPrompt, setWorldPrompt] = useState('Generate an Einstein-Rosen bridge and show a cinematic flythrough.');
  const [submittedPrompt, setSubmittedPrompt] = useState(worldPrompt);
  const productResolution = useMemo(() => {
    try {
      const value = directGenesisPromptWorld(submittedPrompt);
      return { world: value, error: null };
    } catch (error) {
      return { world: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [submittedPrompt]);
  const productWorld = productResolution.world;
  const promptError = productResolution.error;
  const directed = useMemo(() => directGenesisWorld({ preset, populationEnabled, light, weather, navigation }), [preset, populationEnabled, light, weather, navigation]);
  const productCamera = useMemo(() => productWorld ? buildSpacetimeCameraPath(productWorld.descriptor) : null, [productWorld]);
  const sim = useMemo(() => new TemporalCinematicSim3D(
    productWorld?.runtime.engine ?? directed.scene.world.engine,
    productCamera ?? directed.scene.camera,
    {
    weather: directed.presentation.weather,
    year: directed.scene.year,
    viewMode: productWorld ? 'street' : directed.presentation.viewMode,
    roomType: productWorld ? undefined : directed.presentation.roomType ?? undefined,
    navigationMode: directed.presentation.navigationMode,
    spacetimeDescriptor: productWorld?.descriptor,
    autoPlay: true,
    onAssetSelection: (selection) => {
      setAssetSelection(selection);
      setAssetEvidenceHash(selection ? recordDirectedAssetInspection(kernelLedger, directed, selection) : null);
    },
    },
  ), [directed, productCamera, productWorld]);
  const params = useMemo<SimParams>(() => ({}), []);
  const { canvasRef, loading, failed } = useThreeLoop(sim, params, true);

  useEffect(() => {
    if (loading || failed) return;
    const evidenceHash = productWorld
      ? recordDirectedPromptWorld(kernelLedger, productWorld)
      : recordDirectedWorld(kernelLedger, directed);
    const activeWorldId = productWorld?.world.generated.worldId ?? directed.proof.worldId;
    const activeEntityCount = productWorld?.runtime.engine.graph.listEntities().length ?? directed.proof.entityCount;
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
    };
    window.__GENESIS_WORLD_DIRECTOR__ = hook;
    return () => { if (window.__GENESIS_WORLD_DIRECTOR__ === hook) delete window.__GENESIS_WORLD_DIRECTOR__; };
  }, [directed, failed, loading, productCamera, productWorld, sim]);

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
          <div><dt>World ID</dt><dd>{productWorld?.world.generated.worldId ?? directed.proof.worldId}</dd></div>
          <div><dt>Encje</dt><dd>{productWorld?.runtime.engine.graph.listEntities().length ?? directed.proof.entityCount}</dd></div>
          <div><dt>Ludzie</dt><dd>{productWorld ? productWorld.runtime.engine.graph.listEntities().filter((entity) => entity.ref.kind === 'human').length : directed.proof.humanEntityCount}</dd></div>
          <div><dt>ROOM / ASSET_SLOT</dt><dd>{productWorld ? `${productWorld.runtime.engine.graph.listEntities().filter((entity) => entity.geometry?.kind === 'ROOM').length} / ${productWorld.runtime.engine.graph.listEntities().filter((entity) => entity.geometry?.kind === 'ASSET_SLOT').length}` : `${directed.proof.roomCount} / ${directed.proof.assetSlotCount}`}</dd></div>
          <div data-testid="world-director-selection"><dt>Wybrany instrument</dt><dd>{assetSelection ? `${assetSelection.slotType} · ${assetSelection.entityId}` : 'Kliknij instrument w scenie'}</dd></div>
          <div data-testid="world-director-selection-evidence"><dt>Evidence</dt><dd>{assetEvidenceHash ? assetEvidenceHash.slice(0, 16) : '—'}</dd></div>
          <div data-testid="world-director-product-world"><dt>Świat z promptu</dt><dd>{productWorld ? `${productWorld.primaryTemplate} · ${productWorld.world.graph.listEntities().length} encji` : promptError ?? '—'}</dd></div>
          <div data-testid="world-director-product-proof"><dt>Fingerprint</dt><dd>{productWorld?.deterministicFingerprint ?? '—'}</dd></div>
        </dl>
        {productWorld ? <SpacetimeDescriptorPreview descriptor={productWorld.descriptor} /> : null}
        <span className="world-director-status" data-testid="world-director-status">{failed ? 'WEBGL ERROR' : loading ? 'LOADING' : 'LIVE · CANONICAL'}</span>
      </section>
    </main>
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
