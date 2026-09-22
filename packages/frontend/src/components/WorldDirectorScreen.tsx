import { useEffect, useMemo, useState } from 'react';
import { useThreeLoop } from '../core/three/useThreeLoop';
import type { SimParams } from '../core/types';
import { TemporalCinematicSim3D } from '../core/temporalCinematic/temporalCinematicSim3D';
import { kernelLedger } from '../core/agent/cyberReasoningKernel';
import {
  directGenesisWorld,
  recordDirectedAssetInspection,
  recordDirectedWorld,
  type GenesisWorldLight,
  type GenesisWorldNavigation,
  type GenesisWorldPreset,
  type GenesisWorldWeather,
} from '../core/worldDirector/genesisWorldDirector';

declare global {
  interface Window {
    __GENESIS_WORLD_DIRECTOR__?: {
      readonly ready: true;
      readonly worldId: string;
      readonly preset: GenesisWorldPreset;
      readonly entityCount: number;
      readonly evidenceHash: string;
      getPresentationSummary(): ReturnType<TemporalCinematicSim3D['getPresentationSummary']>;
      getInteractionTargets(): ReturnType<TemporalCinematicSim3D['getInteractionTargets']>;
    };
  }
}

export function WorldDirectorScreen(): JSX.Element {
  const [preset, setPreset] = useState<GenesisWorldPreset>('MODERN_SCIENTIFIC_LAB');
  const [populationEnabled, setPopulationEnabled] = useState(true);
  const [light, setLight] = useState<GenesisWorldLight>('DAY');
  const [weather, setWeather] = useState<GenesisWorldWeather>('CLEAR');
  const [navigation, setNavigation] = useState<GenesisWorldNavigation>('CINEMATIC');
  const [assetSelection, setAssetSelection] = useState<{ readonly entityId: string; readonly slotType: string } | null>(null);
  const [assetEvidenceHash, setAssetEvidenceHash] = useState<string | null>(null);
  const directed = useMemo(() => directGenesisWorld({ preset, populationEnabled, light, weather, navigation }), [preset, populationEnabled, light, weather, navigation]);
  const sim = useMemo(() => new TemporalCinematicSim3D(directed.scene.world.engine, directed.scene.camera, {
    weather: directed.presentation.weather,
    year: directed.scene.year,
    viewMode: directed.presentation.viewMode,
    roomType: directed.presentation.roomType ?? undefined,
    navigationMode: directed.presentation.navigationMode,
    autoPlay: true,
    onAssetSelection: (selection) => {
      setAssetSelection(selection);
      setAssetEvidenceHash(selection ? recordDirectedAssetInspection(kernelLedger, directed, selection) : null);
    },
  }), [directed]);
  const params = useMemo<SimParams>(() => ({}), []);
  const { canvasRef, loading, failed } = useThreeLoop(sim, params, true);

  useEffect(() => {
    if (loading || failed) return;
    const evidenceHash = recordDirectedWorld(kernelLedger, directed);
    const hook = {
      ready: true as const,
      worldId: directed.proof.worldId,
      preset: directed.request.preset,
      entityCount: directed.proof.entityCount,
      evidenceHash,
      getPresentationSummary: () => sim.getPresentationSummary(),
      getInteractionTargets: () => sim.getInteractionTargets(),
    };
    window.__GENESIS_WORLD_DIRECTOR__ = hook;
    return () => { if (window.__GENESIS_WORLD_DIRECTOR__ === hook) delete window.__GENESIS_WORLD_DIRECTOR__; };
  }, [directed, failed, loading, sim]);

  return (
    <main className="world-director" id="main-content" data-testid="world-director" data-preset={preset}>
      <canvas ref={canvasRef} className="world-director-canvas" data-testid="world-director-canvas" />
      <section className="world-director-panel gx-glass" aria-label="World Director controls">
        <span className="gx-eyebrow">Canonical World Director · THREE.js</span>
        <h1>Reżyser świata</h1>
        <p>Jeden pipeline: WorldSpecification → WorldGraph → WorldFrame → THREE.js.</p>
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
          <div><dt>World ID</dt><dd>{directed.proof.worldId}</dd></div>
          <div><dt>Encje</dt><dd>{directed.proof.entityCount}</dd></div>
          <div><dt>Ludzie</dt><dd>{directed.proof.humanEntityCount}</dd></div>
          <div><dt>ROOM / ASSET_SLOT</dt><dd>{directed.proof.roomCount} / {directed.proof.assetSlotCount}</dd></div>
          <div data-testid="world-director-selection"><dt>Wybrany instrument</dt><dd>{assetSelection ? `${assetSelection.slotType} · ${assetSelection.entityId}` : 'Kliknij instrument w scenie'}</dd></div>
          <div data-testid="world-director-selection-evidence"><dt>Evidence</dt><dd>{assetEvidenceHash ? assetEvidenceHash.slice(0, 16) : '—'}</dd></div>
        </dl>
        <span className="world-director-status" data-testid="world-director-status">{failed ? 'WEBGL ERROR' : loading ? 'LOADING' : 'LIVE · CANONICAL'}</span>
      </section>
    </main>
  );
}

export default WorldDirectorScreen;
