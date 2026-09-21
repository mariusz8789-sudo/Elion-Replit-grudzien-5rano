/* Proprietary / All Rights Reserved - Genesis OS */
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGenesisEngine } from '../state/GenesisEngineProvider.js';
import { createProductionRenderer, ProductionRendererHandle } from '../render/GenesisProductionRenderer.js';
import { createMatrixRainSkybox, setRainTime } from '../render/shaders/MatrixRainShader.js';
import { createCyberEcosystem, EcosystemHandle } from '../render/GenesisCyberEcosystem.js';
import { AssetErrorBoundary, LoadingPlaceholder } from '../render/AssetErrorBoundary.js';
const badge: React.CSSProperties = { border: '1px solid #22384f', borderRadius: 20, padding: '4px 10px', fontSize: 9, fontWeight: 700, letterSpacing: 1 };
export const City3DRoute: React.FC<{ prompt?: string }> = ({ prompt = 'Warszawa 2029' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { clock, seed, urban } = useGenesisEngine();
  const [quality, setQuality] = useState<'HIGH' | 'FALLBACK' | 'NONE'>('NONE');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const renderer: ProductionRendererHandle = createProductionRenderer(canvas, { pixelRatioCap: 2, shadows: 'auto', seed });
    setQuality(renderer.ok ? renderer.quality.tier : 'NONE');
    let disposed = false; let raf = 0; let last = 0; let simT = 0;
    let sky: THREE.Mesh | null = null; let eco: EcosystemHandle | null = null; let cityMesh: THREE.InstancedMesh | null = null;
    if (renderer.ok) {
      sky = createMatrixRainSkybox(700, { columns: 110, rows: 44, speed: 0.35 }); renderer.scene.add(sky);
      const pkg = urban.pipeline(prompt, 32);
      const chrome = renderer.createMatrixChromeMaterial();
      cityMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), chrome, pkg.grid.buildings.length);
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
      pkg.grid.buildings.forEach((b, i) => { const x = (b.cell % pkg.grid.gridSize) * pkg.grid.cellM - (pkg.grid.gridSize * pkg.grid.cellM) / 2; const z = Math.floor(b.cell / pkg.grid.gridSize) * pkg.grid.cellM - (pkg.grid.gridSize * pkg.grid.cellM) / 2; const footprint = pkg.grid.cellM * 0.75; M.compose(P.set(x, b.heightM / 2, z), Q.identity(), S.set(footprint, b.heightM, footprint)); cityMesh!.setMatrixAt(i, M); });
      cityMesh.instanceMatrix.needsUpdate = true; renderer.scene.add(cityMesh);
      eco = createCyberEcosystem({ chrome: o => renderer.createMatrixChromeMaterial(o), emissive: (c, i2) => renderer.createPBRMaterial({ color: 0x03130c, emissive: c, emissiveIntensity: i2 ?? 1.5 }) }, { seed, bounds: 90, podiums: 3, agents: 28, cars: 20, cats: 6, shops: 14 });
      renderer.scene.add(eco.group);
      const loop = (now: number) => { if (disposed) return; raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; simT += dt; clock.tick(dt * 1000);
        if (sky) setRainTime(sky, simT); eco?.update(dt, simT); renderer.update(dt, simT); };
      raf = requestAnimationFrame(loop);
      const onResize = () => renderer.resize(); addEventListener('resize', onResize);
      setLoading(false);
      return () => { disposed = true; cancelAnimationFrame(raf); removeEventListener('resize', onResize); eco?.dispose(); if (sky) { sky.geometry.dispose(); (sky.material as THREE.Material).dispose(); } if (cityMesh) cityMesh.geometry.dispose(); renderer.dispose(); };
    }
    setLoading(false);
    return () => { disposed = true; renderer.dispose(); };
  }, [prompt, seed, urban, clock]);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      {loading && <div style={{ position: 'absolute', inset: 0 }}><LoadingPlaceholder label="INITIALISING CYBER CITY TWIN…" /></div>}
      <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ ...badge, color: '#38bdf8' }}>STATUS: POC</span>
        <span style={{ ...badge, color: '#a78bfa' }}>DATA: SYNTHETIC / SCENARIO</span>
        <span style={{ ...badge, color: quality === 'HIGH' ? '#34d399' : '#fbbf24' }}>GPU: {quality}</span>
      </div>
      <AssetErrorBoundary><div style={{ position: 'absolute', right: 12, bottom: 12, color: '#7d93ad', fontSize: 10 }}>route: /city-3d · deterministic SimClock-bound animation</div></AssetErrorBoundary>
    </div>);
};
export default City3DRoute;
