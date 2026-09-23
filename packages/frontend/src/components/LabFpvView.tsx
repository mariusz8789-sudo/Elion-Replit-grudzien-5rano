import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ThermoLabAnalysis } from '@genesis/core/mythos/KernelProviderRegistry.js';
import { kernelRegistry } from '@genesis/core/mythos/KernelProviderRegistry.js';
import { REACTIONS, SPECIES } from '@genesis/core/lab/ThermodynamicLabEngine.js';
import { createLabFpv, mapLabResultToVisual, type LabFpvHandle } from '../../../ui/src/lab/LabFpvGpu';
import { GENESIS_CYBER_KERNEL_ID } from '../core/agent/cyberReasoningKernel';

/**
 * QUANTUM LAB FPV (`#/lab-fpv`) — first-person chemistry bench. The clerk of
 * this room is the Thermodynamic Lab Engine behind the single kernel's
 * `thermodynamic-reaction-sim` provider: reagents in mol go in, ΔH / ΔS / ΔG
 * from tabulated standard data, limiting reagent, adiabatic temperature and
 * the visible outcome come out, committed to the EvidenceLedger by the
 * engine. The GPU bench (beaker, liquid, bubbles, crystals, flame, flash)
 * only paints that result.
 *
 * "Zapis stanu" downloads the exact engine result (JSON) with its ledger
 * hash; "Nagraj wideo" records the real canvas through MediaRecorder (webm)
 * where the browser supports it. Label on screen: THERMODYNAMIC_MODEL.
 */

const REAGENT_IDS = Object.keys(SPECIES);

export const LAB_CAMPUS_DOORS = Object.freeze([
  { id: 'cern', label: 'CERN · collision hall', hash: '#/cern-complex', classification: 'TOY_MC_MODEL + separate CMS data route' },
  { id: 'cms-data', label: 'CMS Open Data room', hash: '#/physics/cms-z', classification: 'CHECKSUM-BOUND EXTERNAL DATA' },
  { id: 'human', label: 'Human Biology Lab', hash: '#/human-biology-lab', classification: 'MODEL / SIMULATION' },
  { id: 'molecule', label: 'Molecular Lab', hash: '#/molecule', classification: 'CANONICAL WORLD STATE' },
  { id: 'cell', label: 'Cell & Microscopy Lab', hash: '#/cell-lab', classification: 'SIMULATION' },
  { id: 'virtual-bio', label: 'Virtual Biology Lab', hash: '#/virtual-bio', classification: 'IN-SILICO' },
  { id: 'research', label: 'Campaign & External Lab', hash: '#/campaign', classification: 'COMPUTATIONAL + GOVERNED HANDOFF' },
] as const);

/** Pure boundary to the provider, unit-testable without WebGL. */
export function runMix(seed: number, reagents: Readonly<Record<string, number>>, ignition: boolean, T0: number): ThermoLabAnalysis | { error: string } {
  const p = kernelRegistry.resolve('thermodynamic-reaction-sim');
  if (!p) return { error: 'THERMO_LAB_PROVIDER_NOT_REGISTERED' };
  return p.analyze({ kernelId: GENESIS_CYBER_KERNEL_ID, route: '#/lab-fpv', operatorId: 'VIEWER' }, { seed, reagents, ignition, T0 }) as ThermoLabAnalysis;
}

/** The state file: the engine's own result plus its ledger anchor, nothing invented. */
export function stateFile(a: ThermoLabAnalysis, reagents: Readonly<Record<string, number>>, ignition: boolean, T0: number): string {
  return JSON.stringify({ kind: 'genesis-lab-fpv-state', label: a.label, input: { reagents, ignition, T0 }, result: a.result, ledgerContentHash: a.ledgerContentHash }, null, 2);
}

export function LabFpvView(): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<LabFpvHandle | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [ignition, setIgnition] = useState(false);
  const [T0, setT0] = useState(298.15);
  const [analysis, setAnalysis] = useState<ThermoLabAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [glError, setGlError] = useState<string | null>(null);
  const [canRecord, setCanRecord] = useState(false);

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); } catch (e) { setGlError(e instanceof Error ? e.message : String(e)); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070f);
    scene.add(new THREE.HemisphereLight(0x8ee8f5, 0x0a0f1a, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(2, 4, 2); scene.add(key);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 50);
    camera.position.set(0, 1.6, 0.6);
    camera.lookAt(0, 1.3, -1.6);
    const handle = createLabFpv(scene, camera, renderer.domElement);
    handleRef.current = handle;
    host.appendChild(renderer.domElement);
    setCanRecord(typeof MediaRecorder !== 'undefined' && typeof (renderer.domElement as HTMLCanvasElement).captureStream === 'function');
    const resize = (): void => { const w = host.clientWidth || 800; const h = host.clientHeight || 520; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    resize();
    window.addEventListener('resize', resize);
    let raf = 0; let last = performance.now(); const t0 = last;
    const loop = (now: number): void => { raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now; handle.update(dt, (now - t0) * 0.001); renderer.render(scene, camera); };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf); window.removeEventListener('resize', resize);
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      handle.dispose(); handleRef.current = null;
      floor.geometry.dispose(); (floor.material as THREE.Material).dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  const mix = (): void => {
    const reagents = Object.fromEntries(Object.entries(amounts).filter(([, n]) => n > 0));
    const a = runMix(0x4c4142, reagents, ignition, T0);
    if ('error' in a) { setError(a.error); return; }
    setError(null); setAnalysis(a);
    handleRef.current?.setLabState(mapLabResultToVisual(a.result, ignition));
  };
  const download = (name: string, blob: Blob): void => { const url = URL.createObjectURL(blob); const el = document.createElement('a'); el.href = url; el.download = name; el.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const saveState = (): void => { if (!analysis) return; download(`lab-fpv-${analysis.result.eventHash.slice(0, 12)}.json`, new Blob([stateFile(analysis, amounts, ignition, T0)], { type: 'application/json' })); };
  const toggleRecord = (): void => {
    const canvas = hostRef.current?.querySelector('canvas');
    if (!canvas) return;
    if (recorderRef.current?.state === 'recording') { recorderRef.current.stop(); return; }
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => { setRecording(false); download(`lab-fpv-${Date.now()}.webm`, new Blob(chunks, { type: 'video/webm' })); recorderRef.current = null; };
    rec.start(250); recorderRef.current = rec; setRecording(true);
  };

  const r = analysis?.result ?? null;
  return (
    <main id="main-content" className="lab" aria-label="Quantum Lab FPV" data-testid="lab-fpv">
      <header className="col-head">
        <div>
          <div className="gx-eyebrow">GENESIS · QUANTUM LAB · FPV</div>
          <h1>Laboratorium chemiczne (pierwsza osoba)</h1>
          <p className="col-lede">Odmierz reagenty w molach, zdecyduj o zapłonie i zmieszaj. Silnik termodynamiczny liczy ΔH, ΔS, ΔG z tablicowych danych standardowych (NIST/CRC), odczynnik ograniczający i temperaturę adiabatyczną; stanowisko 3D tylko to maluje. Każde zmieszanie ma hash w EvidenceLedger. Klik w scenę blokuje kursor; WASD porusza.</p>
        </div>
      </header>

      <nav className="lab-campus-doors" aria-label="Genesis laboratory campus doors" data-testid="lab-campus-doors">
        {LAB_CAMPUS_DOORS.map((door) => (
          <button key={door.id} type="button" className="lab-campus-door" data-testid={`lab-door-${door.id}`} onClick={() => { window.location.hash = door.hash; }}>
            <span className="lab-campus-door-light" aria-hidden="true" />
            <strong>{door.label}</strong><small>{door.classification}</small><span>ENTER →</span>
          </button>
        ))}
      </nav>

      <div className="lab-grid">
        <div className="col-stage lab-stage" ref={hostRef} data-testid="lab-stage" onClick={() => handleRef.current?.lock()}>
          {glError && <p className="cw-error" role="alert">WebGL niedostępny: {glError}</p>}
        </div>
        <aside className="lab-bench" aria-label="Stanowisko">
          <h2>Reagenty [mol]</h2>
          <div className="lab-reagents">
            {REAGENT_IDS.map((id) => (
              <label key={id} className="lab-reagent">
                <span className="cw-mono">{SPECIES[id].formula}</span>
                <input type="number" min={0} step={0.5} value={amounts[id] ?? ''} placeholder="0" onChange={(e) => setAmounts({ ...amounts, [id]: Math.max(0, Number(e.target.value) || 0) })} data-testid={`lab-amt-${id}`} />
              </label>
            ))}
          </div>
          <div className="cw-actions">
            <label className="lab-inline"><input type="checkbox" checked={ignition} onChange={(e) => setIgnition(e.target.checked)} data-testid="lab-ignition" /> zapłon</label>
            <label className="lab-inline">T₀ [K] <input type="number" min={100} max={2000} value={T0} onChange={(e) => setT0(Number(e.target.value) || 298.15)} data-testid="lab-t0" /></label>
            <button type="button" className="cw-btn" onClick={mix} data-testid="lab-mix">Zmieszaj</button>
            <button type="button" className="cw-btn cw-btn-quiet" onClick={saveState} disabled={!analysis} data-testid="lab-save">Zapis stanu (JSON)</button>
            <button type="button" className="cw-btn cw-btn-quiet" onClick={toggleRecord} disabled={!canRecord} data-testid="lab-record">{recording ? 'Zatrzymaj nagranie' : 'Nagraj wideo (webm)'}</button>
          </div>
          {error && <p className="cw-error" role="alert">{error}</p>}
          <p className="cw-faint">Znane reakcje: {REACTIONS.map((x) => x.label).join(' · ')}</p>
          {r && analysis && (
            <dl className="cw-readout" data-testid="lab-readout">
              <dt>Reakcja</dt><dd>{r.reactionId ? REACTIONS.find((x) => x.id === r.reactionId)?.label : 'brak dopasowanej reakcji — nic się nie dzieje'}</dd>
              {r.thermo && <><dt>ΔH / ΔS / ΔG</dt><dd className="cw-mono">{r.thermo.dH} kJ · {r.thermo.dS} kJ/K · {r.thermo.dG} kJ · {r.thermo.exothermic ? 'egzotermiczna' : 'endotermiczna'} · {r.thermo.spontaneous ? 'samorzutna' : 'niesamorzutna'}</dd></>}
              {r.stoich && <><dt>Ograniczający</dt><dd className="cw-mono">{r.stoich.limiting ?? '—'} · postęp {r.stoich.extent} mol</dd></>}
              <dt>T adiabatyczna</dt><dd className="cw-mono">{r.adiabaticTK} K</dd>
              <dt>Wynik</dt><dd className="cw-mono">gaz {r.outcome.gasMol} mol{r.outcome.explosion ? ' · WYBUCH' : ''}{r.outcome.crystallization ? ' · krystalizacja' : ''}{r.outcome.colorChange ? ' · zmiana barwy' : ''}{r.outcome.phaseChanges.length ? ' · ' + r.outcome.phaseChanges.join(', ') : ''}</dd>
              <dt>Etykieta</dt><dd className="cw-mono">{analysis.label}</dd>
              <dt>Ledger</dt><dd className="cw-mono cw-wrap" data-testid="lab-ledger-hash">contentHash {analysis.ledgerContentHash}</dd>
            </dl>
          )}
        </aside>
      </div>
    </main>
  );
}

export default LabFpvView;
