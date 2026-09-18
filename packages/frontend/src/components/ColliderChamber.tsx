import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ColliderAnalysis } from '@genesis/core/mythos/KernelProviderRegistry.js';
import { kernelRegistry } from '@genesis/core/mythos/KernelProviderRegistry.js';
import { PARTICLES, PHYS } from '@genesis/core/collider/QuantumColliderEngine.js';
import { createColliderLayer, type ColliderLayerHandle } from '../../../ui/src/collider/ColliderGpu';
import { GENESIS_CYBER_KERNEL_ID } from '../core/agent/cyberReasoningKernel';

/**
 * COLLIDER CHAMBER (`#/collider`) — the detector view of the Quantum
 * Collider Engine. A client of the single kernel's `particle-collision-sim`
 * provider: seed + event index in, one generated event out, already committed
 * to the EvidenceLedger by the engine. The GPU layer bends every charged
 * track in the 3.8 T field (R = pT / 0.3B) and dots the calorimeter hits.
 *
 * Honest label on screen: TOY_MC_MODEL. Cross sections and the shower /
 * hadronisation are toy-normalised models, not PDG precision, and the readout
 * says so. Nothing here is measured data.
 */

const SEED_DEFAULT = 0x47454e45;

/** The provider's request/response boundary, pure so it can be unit-tested. */
export function requestEvent(seed: number, index: number, sqrtS: number): ColliderAnalysis | { error: string } {
  const p = kernelRegistry.resolve('particle-collision-sim');
  if (!p) return { error: 'COLLIDER_PROVIDER_NOT_REGISTERED' };
  return p.analyze({ kernelId: GENESIS_CYBER_KERNEL_ID, route: '#/collider', operatorId: 'VIEWER' }, { seed, index, sqrtS }) as ColliderAnalysis;
}

export const PROCESS_LABEL: Record<string, string> = { qcd: 'QCD dijet (gg → gg)', z: 'Drell–Yan Z', w: 'W production', h: 'Higgs' };

export function summarise(a: ColliderAnalysis): { readonly charged: number; readonly photons: number; readonly neutrinos: number; readonly sumPT: number; readonly leadPT: number } {
  let charged = 0, photons = 0, neutrinos = 0, sumPT = 0, leadPT = 0;
  for (const f of a.event.finals) {
    const pT = Math.hypot(f.p4.px, f.p4.py);
    sumPT += pT; if (pT > leadPT) leadPT = pT;
    if (f.pdg === 22) photons++; else if (Math.abs(f.pdg) === 12 || Math.abs(f.pdg) === 14) neutrinos++; else if (f.charge !== 0) charged++;
  }
  return { charged, photons, neutrinos, sumPT: +sumPT.toFixed(2), leadPT: +leadPT.toFixed(2) };
}

export function ColliderChamber(): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [seed, setSeed] = useState(SEED_DEFAULT);
  const [index, setIndex] = useState(0);
  const [minPT, setMinPT] = useState<number>(PHYS.PT_MIN);
  const [process, setProcess] = useState<'any' | 'qcd' | 'z' | 'w' | 'h'>('any');
  const [glError, setGlError] = useState<string | null>(null);

  // The event shown: from `index` upward, the first one that passes the pT / process filter (bounded search, deterministic).
  const analysis = useMemo(() => {
    let last: ColliderAnalysis | { error: string } | null = null;
    for (let i = index; i < index + 400; i++) {
      const a = requestEvent(seed, i, 13000);
      if ('error' in a) return a;
      last = a;
      if (a.event.hardPT >= minPT && (process === 'any' || a.event.process === process)) return a;
    }
    return last;
  }, [seed, index, minPT, process]);
  const ok = analysis && !('error' in analysis) ? analysis : null;
  const stats = ok ? summarise(ok) : null;

  useEffect(() => {
    const host = hostRef.current; if (!host || !ok) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }); } catch (e) { setGlError(e instanceof Error ? e.message : String(e)); return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    // scale 0.003: tracks of 800..6000 mm-ish units land at 2.4..18 scene units, the inner shells (1.1..3.5) read as the tracker and the hit ring as the calorimeter.
    const layer: ColliderLayerHandle = createColliderLayer(scene, ok.event, { pixelRatio: dpr, scale: 0.0042 });
    // Detector furniture around the delivered layer (its inner shells are 1.1..3.5 units): a calorimeter barrel at the
    // hit radius (10.5 units at this scale), two endcap rings and a faint beam line. Static geometry, disposed below.
    const furniture: THREE.Object3D[] = [];
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 10.5, 36, 36, 3, true), new THREE.MeshBasicMaterial({ color: 0x1f8a63, wireframe: true, transparent: true, opacity: 0.09 }));
    barrel.rotation.x = Math.PI / 2; scene.add(barrel); furniture.push(barrel);
    for (const z of [-18, 18]) { const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 10.5, 36, 1), new THREE.MeshBasicMaterial({ color: 0x8ee8f5, wireframe: true, transparent: true, opacity: 0.07, side: THREE.DoubleSide })); ring.position.z = z; scene.add(ring); furniture.push(ring); }
    const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -60), new THREE.Vector3(0, 0, 60)]), new THREE.LineBasicMaterial({ color: 0x8ee8f5, transparent: true, opacity: 0.35 }));
    scene.add(beam); furniture.push(beam);
    const vertex = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff })); scene.add(vertex); furniture.push(vertex);
    host.appendChild(renderer.domElement);
    const resize = (): void => { const w = host.clientWidth || 800; const h = host.clientHeight || 520; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    resize();
    window.addEventListener('resize', resize);
    let raf = 0; const t0 = performance.now();
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const t = (now - t0) * 0.001;
      camera.position.set(Math.sin(t * 0.1) * 34, 12 + Math.sin(t * 0.07) * 3, Math.cos(t * 0.1) * 34);
      camera.lookAt(0, 0, 0);
      layer.update(t);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf); window.removeEventListener('resize', resize); layer.dispose();
      for (const o of furniture) { scene.remove(o); const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose(); }
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement); renderer.dispose();
    };
  }, [ok]);

  return (
    <main id="main-content" className="col" aria-label="Genesis Collider" data-testid="collider-chamber">
      <header className="col-head">
        <div>
          <div className="gx-eyebrow">GENESIS · COLLIDER · pp @ 13 TeV</div>
          <h1>Komora detektora</h1>
          <p className="col-lede">Zderzenie proton–proton wygenerowane przez Quantum Collider Engine przez jedyny kernel. Tory naładowanych cząstek zakrzywione w polu {PHYS.B_FIELD} T, trafienia w kalorymetrze, jeden zapis w EvidenceLedger na zdarzenie. Model toy-MC: przekroje czynne i fragmentacja są znormalizowane orientacyjnie, nie z precyzją PDG.</p>
        </div>
        <div className="col-controls">
          <label>Seed <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) >>> 0)} data-testid="col-seed" /></label>
          <label>Zdarzenie nr <input type="number" min={0} value={index} onChange={(e) => setIndex(Math.max(0, Number(e.target.value) | 0))} data-testid="col-index" /></label>
          <label>pT min [GeV] <input type="number" min={PHYS.PT_MIN} step={5} value={minPT} onChange={(e) => setMinPT(Math.max(PHYS.PT_MIN, Number(e.target.value) || PHYS.PT_MIN))} data-testid="col-pt" /></label>
          <label>Proces
            <select value={process} onChange={(e) => setProcess(e.target.value as typeof process)} data-testid="col-process">
              <option value="any">dowolny</option>
              {Object.entries(PROCESS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <button type="button" className="cw-btn" onClick={() => setIndex((i) => i + 1)} data-testid="col-next">Następne zdarzenie →</button>
        </div>
      </header>

      <div className="col-stage" ref={hostRef} data-testid="col-stage">
        {glError && <p className="cw-error" role="alert">WebGL niedostępny: {glError}</p>}
      </div>

      {ok && stats ? (
        <dl className="cw-readout col-readout" data-testid="col-readout">
          <dt>Zdarzenie</dt><dd className="cw-mono">{ok.event.eventId} · #{index} · seed {ok.event.seed}</dd>
          <dt>Proces</dt><dd>{PROCESS_LABEL[ok.event.process] ?? ok.event.process}</dd>
          <dt>Twarde pT</dt><dd className="cw-mono">{ok.event.hardPT} GeV · y = {ok.event.y} · φ = {ok.event.phi}</dd>
          <dt>σ (model)</dt><dd className="cw-mono">{ok.event.crossSectionPb.toExponential(3)} pb · {ok.label}</dd>
          <dt>Stan końcowy</dt><dd className="cw-mono">{ok.event.finals.length} cząstek · {stats.charged} naładowanych · {stats.photons} γ · {stats.neutrinos} ν · ΣpT {stats.sumPT} GeV · wiodące pT {stats.leadPT} GeV</dd>
          <dt>Cząstki</dt><dd className="cw-mono cw-wrap">{[...new Set(ok.event.finals.map((f) => PARTICLES[f.pdg]?.name ?? String(f.pdg)))].join(' · ')}</dd>
          <dt>Hash zdarzenia</dt><dd className="cw-mono cw-wrap">{ok.event.eventHash}</dd>
          <dt>Ledger</dt><dd className="cw-mono cw-wrap" data-testid="col-ledger-hash">contentHash {ok.ledgerContentHash}</dd>
        </dl>
      ) : (
        <p className="cw-error" role="alert">Silnik zderzacza niedostępny: {analysis && 'error' in analysis ? analysis.error : 'brak zdarzenia'}</p>
      )}
    </main>
  );
}

export default ColliderChamber;
