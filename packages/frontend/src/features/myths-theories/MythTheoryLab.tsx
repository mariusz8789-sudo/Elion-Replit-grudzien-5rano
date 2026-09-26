/* Proprietary / All Rights Reserved - Genesis OS */
import { useState } from 'react';
import { sha256Hex } from '@genesis/core/determinism.js';

type SolverId = 'retrocausal-tree' | 'torsion-boundary' | 'warp-metric';
type Warning = 'NEGATIVE_ENERGY_REQUIRED' | 'RETROCAUSAL_FIXED_POINT' | 'UNCONVERGED_FIXED_POINT' | 'TORSION_BOUNDARY_SPECULATIVE' | 'NON_METRIC_SHORTCUT';
type RunRecord = { solverId: SolverId; fingerprint: string; provenanceHash: string; warnings: Warning[]; source: 'backend' | 'offline-preview'; summary: string };

type Params = Record<string, number>;
const DEFAULTS: Record<SolverId, Params> = {
  'retrocausal-tree': { depth: 4, branches: 4, temperature: 0.7, gamma: 0.9, maxIter: 50, tol: 0.000001, eta: 0.2 },
  'torsion-boundary': { gridSize: 24, radii: 2, reflectivity: 0.8, diffusion: 0.2, relaxation: 0.05, alpha: 0.2, beta: 0.5 },
  'warp-metric': { R: 1, sigma: 2, vS: 0.6, pathLength: 10 },
};
const META: Record<SolverId, { title: string; label: string; description: string; warnings: Warning[] }> = {
  'retrocausal-tree': { title: 'Looking Glass', label: 'Retrocausal Tree', description: 'Drzewo decyzji z ograniczonym punktem stałym i wagami Boltzmanna.', warnings: ['RETROCAUSAL_FIXED_POINT'] },
  'torsion-boundary': { title: 'Lustra Kozyriewa', label: 'Torsion Boundary', description: 'Spekulacyjne pole gęstości informacji na siatce relaksacyjnej.', warnings: ['TORSION_BOUNDARY_SPECULATIVE'] },
  'warp-metric': { title: 'Napęd Warp', label: 'Warp Metric / Alcubierre', description: 'Model geometrii skrótu z jawnym proxy egzotycznej energii.', warnings: ['NEGATIVE_ENERGY_REQUIRED'] },
};
const RANGES: Record<SolverId, Record<string, [number, number, number]>> = {
  'retrocausal-tree': { depth: [2, 8, 1], branches: [2, 8, 1], temperature: [0.1, 2, 0.1], gamma: [0, 1, 0.05], maxIter: [1, 100, 1], tol: [0.000000001, 0.001, 0.000000001], eta: [0, 1, 0.05] },
  'torsion-boundary': { gridSize: [8, 48, 1], radii: [0.5, 8, 0.5], reflectivity: [0, 1, 0.05], diffusion: [0, 1, 0.05], relaxation: [0, 1, 0.05], alpha: [0.01, 0.5, 0.01], beta: [0, 2, 0.05] },
  'warp-metric': { R: [0.2, 5, 0.1], sigma: [0.2, 8, 0.1], vS: [0.1, 2, 0.05], pathLength: [2, 30, 1] },
};
const LABELS: Record<string, string> = { depth: 'Głębokość', branches: 'Gałęzie', temperature: 'Temperatura T', gamma: 'Gamma γ', maxIter: 'Limit iteracji', tol: 'Tolerancja ε', eta: 'Sprzężenie η', gridSize: 'Rozmiar siatki', radii: 'Promień reflektora', reflectivity: 'Refleksyjność', diffusion: 'Dyfuzja D', relaxation: 'Relaksacja λ', alpha: 'Krok α', beta: 'Skew β', R: 'Promień bańki R', sigma: 'Stromość ściany σ', vS: 'Prędkość statku vS', pathLength: 'Długość trasy' };

function formatValue(key: string, value: number): string { return key === 'tol' ? value.toExponential(1) : Number.isInteger(value) ? String(value) : value.toFixed(2); }
/** SHA-256 hex — the ONE isomorphic implementation (bit-identical to WebCrypto/node:crypto), same value in every browser. */
async function sha256(value: string): Promise<string> {
  return sha256Hex(value);
}
function localPreview(id: SolverId, params: Params): { warnings: Warning[]; summary: string } {
  if (id === 'retrocausal-tree') {
    const converged = params.maxIter >= 20 && params.tol >= 0.000000001;
    return { warnings: converged ? META[id].warnings : [...META[id].warnings, 'UNCONVERGED_FIXED_POINT'], summary: `${Math.round(params.branches ** Math.min(params.depth, 5))} węzłów projekcji · ${converged ? 'punkt stały osiągnięty' : 'limit iteracji osiągnięty'}` };
  }
  if (id === 'torsion-boundary') return { warnings: META[id].warnings, summary: `${Math.round(params.gridSize ** 2)} komórek pola · τ(x) relaksowane deterministycznie` };
  const warnings: Warning[] = [...META[id].warnings];
  if (params.vS > 1) warnings.push('NON_METRIC_SHORTCUT');
  return { warnings, summary: `dτ/dt proxy · vS=${formatValue('vS', params.vS)} · energia egzotyczna: wymagana` };
}

function Slider({ solver, name, value, onChange }: { solver: SolverId; name: string; value: number; onChange: (v: number) => void }) {
  const [min, max, step] = RANGES[solver][name];
  return <label className="myth-slider"><span><b>{LABELS[name]}</b><output>{formatValue(name, value)}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}

function SolverCard({ id, params, onParam, onRun, busy }: { id: SolverId; params: Params; onParam: (key: string, value: number) => void; onRun: () => void; busy: boolean }) {
  const meta = META[id];
  return <article className="myth-card">
    <div className="myth-card-head"><div><span className="myth-kicker">{meta.label}</span><h2>{meta.title}</h2></div><span className="myth-index">SANDBOX</span></div>
    <p className="myth-description">{meta.description}</p>
    <div className="myth-sliders">{Object.keys(params).map((key) => <Slider key={key} solver={id} name={key} value={params[key]} onChange={(value) => onParam(key, value)} />)}</div>
    <div className="myth-card-footer"><span className="myth-gate">allowUnphysicalSandbox: <strong>true</strong></span><button className="myth-run" type="button" onClick={onRun} disabled={busy}>{busy ? 'Obliczam…' : 'Uruchom eksperyment'}</button></div>
  </article>;
}

export function MythTheoryLab() {
  const [selected, setSelected] = useState<SolverId>('retrocausal-tree');
  const [params, setParams] = useState<Record<SolverId, Params>>(DEFAULTS);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const updateParam = (key: string, value: number) => setParams((current) => ({ ...current, [selected]: { ...current[selected], [key]: value } }));
  const execute = async () => {
    setBusy(true);
    const payload = { solverId: selected, params: params[selected], context: { allowUnphysicalSandbox: true, dt: 0.1, seed: 7 } };
    let source: RunRecord['source'] = 'offline-preview';
    let result = localPreview(selected, params[selected]);
    try {
      const response = await fetch('/api/speculative/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(4000) });
      if (response.ok) { const remote = await response.json() as Partial<RunRecord>; result = { warnings: remote.warnings ?? result.warnings, summary: remote.summary ?? result.summary }; source = 'backend'; }
    } catch { /* The UI remains honest and usable when the optional backend route is unavailable. */ }
    const canonical = JSON.stringify({ payload, result, source });
    const fingerprint = await sha256(canonical);
    const provenanceHash = await sha256(JSON.stringify({ previous: run?.provenanceHash ?? 'GENESIS', fingerprint, at: 0 }));
    setRun({ solverId: selected, ...result, fingerprint, provenanceHash, source });
    setBusy(false);
  };
  return <main className="myth-lab" id="main-content" tabIndex={-1}>
    <header className="myth-hero"><div><span className="myth-eyebrow">GENESIS / UNPHYSICAL SANDBOX</span><h1>Mity i Teorie</h1><p>Myth &amp; Theory Lab — eksperymentalna fizyka spekulatywna, symulacje edge-science i hipotezy poza zakresem Verified Physics.</p></div><div className="myth-honest"><strong>HONEST MODE</strong><span>To są modele teoretyczne. Wynik nie jest twierdzeniem o świecie rzeczywistym.</span></div></header>
    <section className="myth-gate-banner"><span className="myth-gate-dot" /> Każdy przebieg jest izolowany przez <code>allowUnphysicalSandbox: true</code>. Brak ledger writes do verified physics.</section>
    <nav className="myth-tabs" aria-label="Solvery spekulatywne">{(Object.keys(META) as SolverId[]).map((id) => <button key={id} className={selected === id ? 'active' : ''} onClick={() => setSelected(id)}>{META[id].title}</button>)}</nav>
    <SolverCard id={selected} params={params[selected]} onParam={updateParam} onRun={execute} busy={busy} />
    <section className="myth-output" aria-live="polite"><div className="myth-output-head"><div><span className="myth-kicker">WYNIK PRZEBIEGU</span><h2>Provenance &amp; warnings</h2></div>{run && <span className={`myth-source ${run.source}`}>{run.source === 'backend' ? 'BACKEND REGISTRY' : 'OFFLINE PREVIEW'}</span>}</div>{run ? <><p className="myth-summary">{run.summary}</p><div className="myth-warnings">{run.warnings.map((warning) => <span className="myth-warning" key={warning}>⚠ {warning}</span>)}</div><dl className="myth-hashes"><div><dt>Fingerprint SHA-256</dt><dd>{run.fingerprint}</dd></div><div><dt>Provenance hash</dt><dd>{run.provenanceHash}</dd></div></dl></> : <p className="myth-empty">Skonfiguruj jeden z modeli i uruchom przebieg. Ostrzeżenia pojawią się jawnie — nigdy nie są ukrywane.</p>}</section>
    <footer className="myth-footer">SPECULATIVE_SANDBOX_SOLVER · UNPHYSICAL_THEORY · NOT VERIFIED PHYSICS</footer>
  </main>;
}
export default MythTheoryLab;
