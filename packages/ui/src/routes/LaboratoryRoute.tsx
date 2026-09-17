/* Proprietary / All Rights Reserved - Genesis OS */
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGenesisEngine } from '../state/GenesisEngineProvider.js';
import { createProductionRenderer, ProductionRendererHandle } from '../render/GenesisProductionRenderer.js';
import { createMatrixRainSkybox, setRainTime } from '../render/shaders/MatrixRainShader.js';
import { createCyberEcosystem, createFallbackHeroEntity, EcosystemHandle } from '../render/GenesisCyberEcosystem.js';
import { createAssetPipeline } from '../render/GenesisAssetPipeline.js';
import { AssetErrorBoundary, LoadingPlaceholder } from '../render/AssetErrorBoundary.js';
const badge: React.CSSProperties = { border: '1px solid #22384f', borderRadius: 20, padding: '4px 10px', fontSize: 9, fontWeight: 700, letterSpacing: 1 };
export const LaboratoryRoute: React.FC<{ optionalModelUrl?: string }> = ({ optionalModelUrl }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { clock, seed, quantum } = useGenesisEngine();
  const [quality, setQuality] = useState<'HIGH' | 'FALLBACK' | 'NONE'>('NONE');
  const [assetError, setAssetError] = useState<string | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const renderer: ProductionRendererHandle = createProductionRenderer(canvas, { pixelRatioCap: 2, shadows: 'auto', seed });
    setQuality(renderer.ok ? renderer.quality.tier : 'NONE');
    let disposed = false; let raf = 0; let last = 0; let simT = 0;
    let sky: THREE.Mesh | null = null; let eco: EcosystemHandle | null = null; let hero: THREE.Group | null = null; let tank: THREE.Mesh | null = null; let core: THREE.Mesh | null = null;
    const pipeline = createAssetPipeline();
    if (renderer.ok) {
      sky = createMatrixRainSkybox(500, { columns: 90, rows: 36, speed: 0.28, colorA: 0x00e5ff, colorB: 0x00ff9c }); renderer.scene.add(sky);
      tank = new THREE.Mesh(new THREE.BoxGeometry(9, 5.5, 4.5), renderer.createPBRMaterial({ color: 0x9fd8ff, metalness: 0.1, roughness: 0.08, transparent: true }));
      tank.position.y = 2.75; renderer.scene.add(tank);
      core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 2), renderer.createMatrixChromeMaterial({ clearcoat: true })); core.position.y = 2.75; renderer.scene.add(core);
      eco = createCyberEcosystem({ chrome: o => renderer.createMatrixChromeMaterial(o), emissive: (c, i2) => renderer.createPBRMaterial({ color: 0x03130c, emissive: c, emissiveIntensity: i2 ?? 1.5 }) }, { seed, bounds: 40, podiums: 2, agents: 10, cars: 0, cats: 4, shops: 6 });
      renderer.scene.add(eco.group);
      if (optionalModelUrl) pipeline.load(optionalModelUrl).then(r => { if (disposed) return; if (r.ok && r.scene) renderer.scene.add(r.scene); else { setAssetError(r.error ?? 'LOAD_FAILED'); hero = createFallbackHeroEntity(renderer.createMatrixChromeMaterial(), renderer.createPBRMaterial({ color: 0x03130c, emissive: 0x00ff9c, emissiveIntensity: 1.6 })); hero.position.set(6, 0, 4); renderer.scene.add(hero); } });
      const viz = quantum.visualizationParams('INTERSTELLAR_GARGANTUA');
      const loop = (now: number) => { if (disposed) return; raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; simT += dt; clock.tick(dt * 1000);
        if (sky) setRainTime(sky, simT); if (core) core.rotation.y += dt * (viz?.spin ?? 0.3); eco?.update(dt, simT); renderer.update(dt, simT); };
      raf = requestAnimationFrame(loop);
      const onResize = () => renderer.resize(); addEventListener('resize', onResize);
      return () => { disposed = true; cancelAnimationFrame(raf); removeEventListener('resize', onResize); pipeline.disposeCached(); eco?.dispose();
        if (sky) { sky.geometry.dispose(); (sky.material as THREE.Material).dispose(); } if (tank) tank.geometry.dispose(); if (core) core.geometry.dispose(); if (hero) hero.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); renderer.dispose(); };
    }
    return () => { disposed = true; renderer.dispose(); };
  }, [seed, quantum, clock, optionalModelUrl]);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      {quality === 'NONE' && <LoadingPlaceholder label="INITIALISING CYBER LABORATORY…" />}
      <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ ...badge, color: '#38bdf8' }}>STATUS: POC</span>
        <span style={{ ...badge, color: '#a78bfa' }}>DATA: SYNTHETIC / SCENARIO</span>
        <span style={{ ...badge, color: quality === 'HIGH' ? '#34d399' : '#fbbf24' }}>GPU: {quality}</span>
      </div>
      {assetError && <AssetErrorBoundary><div style={{ position: 'absolute', right: 12, top: 12, color: '#fbbf24', fontSize: 10 }}>ASSET FALLBACK ACTIVE: {assetError}</div></AssetErrorBoundary>}
      <div style={{ position: 'absolute', right: 12, bottom: 12, color: '#7d93ad', fontSize: 10 }}>route: /laboratory · deterministic SimClock-bound animation</div>
    </div>);
};
export default LaboratoryRoute;
