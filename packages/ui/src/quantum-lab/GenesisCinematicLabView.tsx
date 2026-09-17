import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { solveTrajectory } from '@genesis/core/quantum-lab/GenesisSpacetimePortalEngine.js';
import { buildMolecule, stepQuantum, totalEnergy, quantumFingerprint } from '@genesis/core/quantum-lab/GenesisQuantumSandbox.js';

const ChromaticAberrationShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uOffset: { value: 0.0025 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uOffset; varying vec2 vUv;
    void main(){ vec2 d = vUv - 0.5; float r = texture2D(tDiffuse, vUv + d*uOffset).r; float g = texture2D(tDiffuse, vUv).g; float b = texture2D(tDiffuse, vUv - d*uOffset).b; gl_FragColor = vec4(r,g,b,1.0); }`,
};
const PortalShader = {
  uniforms: { uTime: { value: 0 }, uMass: { value: 1 }, uSpin: { value: 0 }, uEnergy: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `precision highp float; varying vec2 vUv; uniform float uTime; uniform float uMass; uniform float uSpin; uniform float uEnergy;
    void main(){ vec2 p = (vUv-0.5)*2.0; float r = length(p); float ang = atan(p.y,p.x);
      float horizon = clamp(uMass*0.2, 0.05, 0.6);
      float warp = 1.0/max(r, 0.001);
      float swirl = sin(ang*6.0 + uTime*1.5 + uSpin*8.0 + warp*2.0);
      float ring = smoothstep(horizon+0.25, horizon, r) * smoothstep(horizon-0.15, horizon, r);
      vec3 col = vec3(0.0);
      col += vec3(0.2,0.6,1.0) * ring * (0.6+0.4*swirl) * uEnergy;
      col += vec3(0.5,0.2,0.9) * smoothstep(horizon, 0.0, r) * (0.5+0.5*sin(uTime*2.0+warp));
      col += vec3(0.02,0.03,0.06);
      gl_FragColor = vec4(pow(col, vec3(0.4545)), 1.0); }`,
};

const shell: React.CSSProperties = { position: 'relative', width: '100%', height: '100%', background: '#02050a', color: '#dce8f5', overflow: 'hidden', fontFamily: '"Segoe UI", system-ui, sans-serif' };
const badge: React.CSSProperties = { border: '1px solid #22384f', borderRadius: 20, padding: '4px 10px', fontSize: 9, fontWeight: 700, letterSpacing: 1 };
const knob: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, background: 'rgba(8,14,24,.8)', border: '1px solid #1b2b42', borderRadius: 8, padding: 8 };
const btn = (on = false): React.CSSProperties => ({ background: on ? '#0e2036' : '#0b1526', border: `1px solid ${on ? '#38bdf8' : '#22384f'}`, color: on ? '#38bdf8' : '#dce8f5', borderRadius: 6, padding: '7px 11px', fontSize: 10, letterSpacing: 1, cursor: 'pointer', fontWeight: 700 });

export const GenesisCinematicLabView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<'SPACETIME' | 'QUANTUM'>('SPACETIME');
  const [flow, setFlow] = useState(false);
  const [massExp, setMassExp] = useState(30); const [spin, setSpin] = useState(0.4); const [energy, setEnergy] = useState(1);
  const [telemetry, setTelemetry] = useState({ horizon: 0, dilation: 0, energy: 0, fingerprint: '' });
  const stateRef = useRef({ mode, massExp, spin, energy });
  useEffect(() => { stateRef.current = { mode, massExp, spin, energy }; }, [mode, massExp, spin, energy]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch { return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x02050a);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500); camera.position.set(0, 2, 10);
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.6, 0.2));
    const chroma = new ShaderPass(ChromaticAberrationShader); composer.addPass(chroma);
    const portalMat = new THREE.ShaderMaterial(PortalShader);
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), portalMat); portal.position.z = -4; scene.add(portal);
    const molGroup = new THREE.Group(); scene.add(molGroup);
    let mol = buildMolecule(1337);
    const geom = new THREE.BufferGeometry();
    const pts = new THREE.Points(geom, new THREE.PointsMaterial({ color: 0x7dd3fc, size: 0.18 }));
    molGroup.add(pts);
    let raf = 0; let last = performance.now(); let acc = 0;
    const loop = (now: number) => { raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const s = stateRef.current; const massKg = Math.pow(10, s.massExp);
      portalMat.uniforms.uTime.value += dt; portalMat.uniforms.uMass.value = massKg / 1e30; portalMat.uniforms.uSpin.value = s.spin; portalMat.uniforms.uEnergy.value = s.energy;
      portal.visible = s.mode === 'SPACETIME'; molGroup.visible = s.mode === 'QUANTUM';
      if (s.mode === 'QUANTUM') { acc += dt; if (acc > 1 / 60) { acc = 0; mol = stepQuantum(mol, 0.02);
        const arr = new Float32Array(mol.atoms.length * 3); mol.atoms.forEach((a, i) => { arr[i * 3] = a.x; arr[i * 3 + 1] = a.y; arr[i * 3 + 2] = a.z; });
        geom.setAttribute('position', new THREE.BufferAttribute(arr, 3)); molGroup.rotation.y += 0.005; } }
      composer.render(); };
    raf = requestAnimationFrame(loop);
    const onResize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); composer.setSize(w, h); };
    onResize(); addEventListener('resize', onResize);
    const telem = setInterval(() => { const s = stateRef.current; const massKg = Math.pow(10, s.massExp);
      const traj = solveTrajectory({ massKg, spin: s.spin, energyJ: s.energy, throatRadiusM: 1, seed: 1337 }, 50, 0.05);
      const q = buildMolecule(1337); setTelemetry({ horizon: traj.horizonM, dilation: traj.dilationAtStart, energy: totalEnergy(q), fingerprint: quantumFingerprint(q).slice(0, 16) }); }, 1000);
    return () => { cancelAnimationFrame(raf); clearInterval(telem); removeEventListener('resize', onResize);
      geom.dispose(); (pts.material as THREE.Material).dispose(); portalMat.dispose(); portal.geometry.dispose(); composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); renderer.dispose(); };
  }, []);

  return (
    <div style={shell}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <div style={{ position: 'absolute', left: 16, top: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ ...badge, color: '#a78bfa' }}>DATA: RELATIVISTIC_SIMULATION / MODEL_ESTIMATE</span>
        <span style={{ ...badge, color: '#38bdf8' }}>STATUS: POC</span>
        {flow && <span style={{ ...badge, color: '#34d399' }}>FLOW STATE</span>}
      </div>
      {!flow && (
        <div style={{ position: 'absolute', left: 16, top: 56, display: 'flex', gap: 6 }}>
          <button style={btn(mode === 'SPACETIME')} onClick={() => setMode('SPACETIME')}>SPACETIME 5D</button>
          <button style={btn(mode === 'QUANTUM')} onClick={() => setMode('QUANTUM')}>QUANTUM SANDBOX</button>
          <button style={btn(flow)} onClick={() => setFlow(true)}>FLOW STATE</button>
        </div>)}
      <div style={{ position: 'absolute', right: 16, top: 56, display: 'flex', flexDirection: 'column', gap: 8, width: 220 }}>
        <label style={knob}>Mass (10^n kg)<input type="range" min={24} max={36} step={1} value={massExp} onChange={e => setMassExp(+e.target.value)} /><span>1e{massExp}</span></label>
        <label style={knob}>Spin (0..1)<input type="range" min={0} max={1} step={0.05} value={spin} onChange={e => setSpin(+e.target.value)} /><span>{spin.toFixed(2)}</span></label>
        <label style={knob}>Energy<input type="range" min={0.2} max={3} step={0.1} value={energy} onChange={e => setEnergy(+e.target.value)} /><span>{energy.toFixed(1)}</span></label>
        {flow && <button style={btn()} onClick={() => setFlow(false)}>EXIT FLOW</button>}
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, background: 'rgba(8,14,24,.85)', border: '1px solid #1b2b42', borderRadius: 10, padding: 10, fontSize: 11, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        <div>Horizon: <b>{telemetry.horizon.toExponential(2)} m</b></div>
        <div>Dilation: <b>{telemetry.dilation.toFixed(4)}</b></div>
        <div>MolEnergy: <b>{telemetry.energy.toFixed(3)}</b></div>
        <div>Fingerprint: <b>{telemetry.fingerprint}…</b></div>
        <div style={{ gridColumn: '1/-1', color: '#7d93ad', fontSize: 10 }}>HONEST MODE: cinematic visualization of deterministic models; not measurement, not prediction.</div>
      </div>
    </div>
  );
};
export default GenesisCinematicLabView;
