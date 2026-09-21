/* Proprietary / All Rights Reserved - Genesis OS */
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { LedgerFeed, LedgerFeedEntry, CepFeed, CepAlert } from '@genesis/core/mythos/ledgerFeed.js';
import { LedgerFeedBus, CepFeedBus } from '@genesis/core/mythos/ledgerFeed.js';
import { RecursiveSimulationMatrix, type RsmResult } from '@genesis/core/postmythos/RecursiveSimulationMatrix.js';
import { createHypergraphLayer } from './HypergraphGpu.js';
import { hypergraphFromRsm } from './hypergraphFromRsm.js';

const GLYPHS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', '0', '1'];
const GCOLS = 6; const GROWS = 3;
/** The RSM run drawn as the hypergraph layer: a fixed synthetic objective and seed, so the lattice on screen is the
 *  engine's real, reproducible output (GEOMETRIC_MODEL) — never live data and never a hand-placed picture. */
const RSM_CONFIG = { dims: 6, horizon: 4, branching: 3, beamK: 8, maxScenarios: 2000, eps: 0.05, seed: 0x47454e45 };
const RSM_OBJECTIVE = new Float64Array([0.4, -0.2, 0.6, 0.1, 0.3, -0.5]);
const RSM_INTERACT = new Float64Array(36).fill(0.02);
function buildAtlas(): HTMLCanvasElement {
  const cell = 64;
  const canvas = document.createElement('canvas');
  canvas.width = GCOLS * cell; canvas.height = GROWS * cell;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = '48px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    GLYPHS.forEach((g, i) => { const gx = i % GCOLS; const gy = Math.floor(i / GCOLS); ctx.fillText(g, gx * cell + cell / 2, gy * cell + cell / 2); });
  }
  return canvas;
}
const RAIN_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const RAIN_FRAG = `
precision highp float; varying vec2 vUv;
uniform sampler2D uAtlas; uniform float uTime; uniform float uCols; uniform float uRows;
uniform float uGCols; uniform float uGRows; uniform float uGCount;
float hash(float n){ return fract(sin(n)*43758.5453123); }
void main(){
  float col = floor(vUv.x * uCols);
  float colSeed = hash(col * 1.7);
  float speed = 0.5 + colSeed * 1.4;
  float scroll = uTime * speed;
  float rowF = vUv.y * uRows + scroll;
  float row = floor(rowF);
  float glyphSeed = hash(col * 127.1 + row * 311.7);
  float glyphIdx = floor(glyphSeed * uGCount);
  if (hash(col * 3.3) < 0.3) glyphIdx = 16.0 + step(0.5, hash(col * 9.1 + row * 7.7));
  float headRow = fract(scroll * 0.11 + colSeed) * uRows;
  float d = mod(headRow - row, uRows);
  float bright = exp(-d * 0.30);
  vec2 inCell = vec2(fract(vUv.x * uCols), fract(rowF));
  float gx = mod(glyphIdx, uGCols);
  float gy = floor(glyphIdx / uGCols);
  vec2 atlasUv = vec2((gx + inCell.x) / uGCols, (uGRows - 1.0 - gy + inCell.y) / uGRows);
  float glyph = texture2D(uAtlas, atlasUv).a;
  vec3 tint = mix(vec3(0.0, 1.0, 0.55), vec3(0.35, 0.9, 1.0), step(0.72, colSeed));
  vec3 col3 = tint * glyph * bright * 1.2;
  col3 += vec3(0.85, 1.0, 0.92) * glyph * step(d, 0.7) * 0.9;
  gl_FragColor = vec4(col3, 1.0);
}`;
export interface MatrixRouteProps { readonly ledgerFeed?: LedgerFeed; readonly cepFeed?: CepFeed; readonly playing?: boolean; readonly onStats?: (fps: number, dpr: number) => void; }
export const MatrixRoute: React.FC<MatrixRouteProps> = ({ ledgerFeed, cepFeed, playing = true, onStats }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [entries, setEntries] = useState<LedgerFeedEntry[]>([]);
  const [alerts, setAlerts] = useState<CepAlert[]>([]);
  const [feedStatus, setFeedStatus] = useState<'live' | 'closed' | 'local'>('local');
  const [rsm, setRsm] = useState<RsmResult | null>(null);
  const busRef = useRef<LedgerFeedBus | null>(null);
  const cepBusRef = useRef<CepFeedBus | null>(null);
  const playRef = useRef(playing); playRef.current = playing;
  const statsRef = useRef(onStats); statsRef.current = onStats;

  useEffect(() => {
    const bus = ledgerFeed ?? new LedgerFeedBus();
    const cep = cepFeed ?? new CepFeedBus();
    busRef.current = bus instanceof LedgerFeedBus ? bus : null;
    cepBusRef.current = cep instanceof CepFeedBus ? cep : null;
    if (typeof window !== 'undefined' && (window as unknown as { __GENESIS_TEST__?: boolean }).__GENESIS_TEST__ && bus instanceof LedgerFeedBus) {
      (window as unknown as { __genesisLedgerAppend?: (e: LedgerFeedEntry) => void }).__genesisLedgerAppend = (e) => bus.push(e);
    }
    if (typeof window !== 'undefined' && (window as unknown as { __GENESIS_TEST__?: boolean }).__GENESIS_TEST__ && cep instanceof CepFeedBus) {
      (window as unknown as { __genesisCepAppend?: (a: CepAlert) => void }).__genesisCepAppend = (a) => cep.push(a);
    }
    setFeedStatus(ledgerFeed ? ledgerFeed.status() : 'local');
    const un1 = bus.subscribe(e => setEntries(prev => [...prev.slice(-13), e]));
    const un2 = cep.subscribe(a => setAlerts(prev => [...prev.slice(-5), a]));
    return () => { un1(); un2(); };
  }, [ledgerFeed, cepFeed]);

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    // The engine runs whether or not WebGL does: the readout is engine output, the layer is only its picture.
    const rsmResult = new RecursiveSimulationMatrix(RSM_CONFIG, RSM_OBJECTIVE, RSM_INTERACT).run();
    setRsm(rsmResult);
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' }); } catch { return; }
    const BASE_DPR = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(BASE_DPR);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const atlas = new THREE.CanvasTexture(buildAtlas());
    atlas.minFilter = THREE.LinearMipmapLinearFilter; atlas.magFilter = THREE.LinearFilter;
    const uniforms = { uAtlas: { value: atlas }, uTime: { value: 0 }, uCols: { value: 110 }, uRows: { value: 42 }, uGCols: { value: GCOLS }, uGRows: { value: GROWS }, uGCount: { value: GLYPHS.length } };
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, uniforms, depthTest: false, depthWrite: false }));
    scene.add(quad);
    // Post-Mythos hypergraph: the RSM lattice in 3D over the rain, its own scene and perspective camera.
    const view = hypergraphFromRsm(rsmResult);
    const graphScene = new THREE.Scene();
    const graphCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    const graph = createHypergraphLayer(graphScene, view.nodes, rsmResult.edges, view.margins, RSM_CONFIG.seed, BASE_DPR);
    renderer.autoClear = false;
    host.appendChild(renderer.domElement);
    const resize = (): void => { const w = host.clientWidth || window.innerWidth; const h = Math.max(1, host.clientHeight || window.innerHeight); renderer.setSize(w, h, false); graphCamera.aspect = w / h; graphCamera.updateProjectionMatrix(); };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    let raf = 0; let last = performance.now(); let simT = 0; let frames = 0; let acc = 0;
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (playRef.current) simT += dt;
      uniforms.uTime.value = simT;
      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      const orbit = simT * 0.06;
      graphCamera.position.set(Math.sin(orbit) * 26, 9 + Math.sin(simT * 0.11) * 1.5, Math.cos(orbit) * 26);
      graphCamera.lookAt(0, 0, 0);
      graph.update(simT);
      renderer.render(graphScene, graphCamera);
      frames += 1; acc += dt;
      if (acc >= 0.5) { statsRef.current?.(Math.round(frames / acc), BASE_DPR); frames = 0; acc = 0; }
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('orientationchange', resize); quad.geometry.dispose(); (quad.material as THREE.Material).dispose(); atlas.dispose(); graph.dispose(); if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement); renderer.dispose(); };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000' }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, zIndex: 0, touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(380px, 42vw)', zIndex: 10, pointerEvents: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 10, padding: '18px 18px 18px 0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
        <div style={{ color: '#00ff9c', fontSize: 10, letterSpacing: 3, textShadow: '0 0 10px #00ff9c88' }}>EVIDENCE LEDGER // LIVE</div>
        <div style={{ color: '#7d93ad', fontSize: 9, letterSpacing: 2, textShadow: '0 0 8px #38bdf855' }}>FEED: {feedStatus.toUpperCase()} · ENTRIES: {entries.length}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' }}>
          {entries.map(e => (
            <div key={e.index} style={{ color: '#9ff9d0', fontSize: 10, lineHeight: 1.45, textShadow: '0 0 6px #00ff9c44', borderBottom: '1px solid rgba(0,255,156,0.12)', paddingBottom: 3 }}>
              <span style={{ color: '#38bdf8' }}>#{String(e.index).padStart(4, '0')}</span> {e.kind} {e.recordId}<br />{e.contentHash.slice(0, 40)}…
            </div>
          ))}
        </div>
        <div style={{ color: '#ff2d78', fontSize: 10, letterSpacing: 3, textShadow: '0 0 10px #ff2d7888', marginTop: 8 }}>CICADA CEP // ALERTS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{ color: a.status === 'INSUFFICIENT_EVIDENCE' ? '#fbbf24' : '#ff8fb0', fontSize: 10, textShadow: '0 0 6px currentColor' }}>
              {a.patternId} · {a.status} · score {a.score.toFixed(3)} · conf {a.confidence.toFixed(3)}
            </div>
          ))}
        </div>
        <div style={{ color: '#38bdf8', fontSize: 10, letterSpacing: 3, textShadow: '0 0 10px #38bdf888', marginTop: 8 }}>RSM // HYPERGRAPH · GEOMETRIC_MODEL</div>
        {rsm ? (
          <div style={{ color: '#9fd7f9', fontSize: 10, lineHeight: 1.45, textShadow: '0 0 6px #38bdf844' }}>
            NODES {rsm.enumerated} · BEAM {RSM_CONFIG.beamK} · HORIZON {RSM_CONFIG.horizon} · EDGES {rsm.edges.length}<br />
            BEST {rsm.bestScore.toFixed(4)} · 2ND {rsm.secondScore.toFixed(4)} · PATH {rsm.bestPath.length}<br />
            MARGIN {rsm.certificate.margin.toFixed(4)} · {rsm.certificate.verified ? 'CERT VERIFIED' : 'CERT NOT VERIFIED'}<br />
            {rsm.resultHash.slice(0, 40)}…
          </div>
        ) : (
          <div style={{ color: '#7d93ad', fontSize: 10 }}>RSM: —</div>
        )}
        <div style={{ marginTop: 'auto', color: '#7d93ad', fontSize: 9, letterSpacing: 2 }}>DATA: SYNTHETIC / SCENARIO · PROPOSE-ONLY · DUAL-CONTROL</div>
      </div>
    </div>
  );
};
export default MatrixRoute;
