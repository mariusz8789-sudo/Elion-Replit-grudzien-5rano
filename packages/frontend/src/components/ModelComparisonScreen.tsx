import { useEffect, useMemo, useRef, useState } from 'react';
import {
  compareEpidemic, defaultComparison, type ModelConfig, type CompareResult,
} from '../core/epidemic/compare';
import type { EpidemicModel, EpidemicParams } from '../core/epidemic/sir';
import { consumePendingComparison } from '../core/compareBridge';
import { HonestyBadge } from './HonestyBadge';

/**
 * Ekran PORÓWNANIA MODELI A vs B (PRIORYTET 5 / FAZA 1).
 *
 * REUSE: uruchamia ten sam, przetestowany silnik `simulateEpidemic` przez
 * czystą funkcję `compareEpidemic`. Pokazuje jednocześnie: przebiegi (nałożone
 * krzywe), parametry obu modeli, wynik, różnice, równania, założenia i
 * ograniczenia. Zmiana dowolnego parametru natychmiast przelicza oba modele.
 *
 * Uczciwość: to porównanie DWÓCH MODELI (nie modelu z rzeczywistością);
 * patogen abstrakcyjny „Pathogen X"; wynik to własność modelu, nie prognoza.
 */

const A_COLOR = '#6aa9ff';
const B_COLOR = '#f47c7c';
const MODELS: EpidemicModel[] = ['SIR', 'SEIR', 'SEIRD'];

const EQUATIONS = [
  'dS/dt = −β·S·I/N',
  'dE/dt = β·S·I/N − σ·E   (SEIR/SEIRD)',
  'dI/dt = σ·E − γ·I',
  'dR/dt = (1−IFR)·γ·I',
  'R₀ = β·D_zakaźności',
];
const ASSUMPTIONS = [
  'Mieszanie jednorodne, stała populacja N',
  'Bez struktury wiekowej/przestrzennej/sieci kontaktów',
  'Patogen abstrakcyjny „Pathogen X" — model, nie prognoza',
];
const LIMITATIONS = [
  'Porównanie modelu z MODELEM, nie z rzeczywistością',
  'Brak stochastyki (to wariant przedziałowy/ODE) — dla wariancji zob. model agentowy',
  'Ten sam solver (RK4) i te same założenia dla A i B — różni je tylko parametryzacja',
];

function num(v: number): string {
  return Math.round(v).toLocaleString('pl-PL');
}
function signed(v: number): string {
  const s = Math.round(v);
  return (s > 0 ? '+' : '') + s.toLocaleString('pl-PL');
}
function pct(v: number | null): string {
  if (v === null) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(0) + '%';
}

function ModelControls({ title, color, params, onChange }: {
  title: string; color: string; params: EpidemicParams;
  onChange: (patch: Partial<EpidemicParams>) => void;
}) {
  return (
    <div className="compare-model-card" style={{ ['--accent' as string]: color }}>
      <div className="compare-model-title" style={{ color }}>{title}</div>
      <label className="compare-field">
        <span>Model</span>
        <div className="seg" role="group" aria-label={`${title} — model`}>
          {MODELS.map((m) => (
            <button key={m} aria-pressed={params.model === m} onClick={() => onChange({ model: m })}>{m}</button>
          ))}
        </div>
      </label>
      <label className="compare-field">
        <span>R₀ = {params.r0.toFixed(1)}</span>
        <input type="range" min={0} max={6} step={0.1} value={params.r0}
          aria-label={`${title} — R0`}
          onChange={(e) => onChange({ r0: Number(e.target.value) })} />
      </label>
      <label className="compare-field">
        <span>Czas zakaźności = {params.infectiousDays} dni</span>
        <input type="range" min={2} max={14} step={1} value={params.infectiousDays}
          aria-label={`${title} — czas zakaźności`}
          onChange={(e) => onChange({ infectiousDays: Number(e.target.value) })} />
      </label>
      <label className="compare-field">
        <span>Interwencja: dzień = {params.interventionDay}</span>
        <input type="range" min={0} max={120} step={1} value={params.interventionDay}
          aria-label={`${title} — dzień interwencji`}
          onChange={(e) => onChange({ interventionDay: Number(e.target.value) })} />
      </label>
      <label className="compare-field">
        <span>Interwencja: skuteczność = {Math.round(params.interventionEffect * 100)}%</span>
        <input type="range" min={0} max={100} step={5} value={Math.round(params.interventionEffect * 100)}
          aria-label={`${title} — skuteczność interwencji`}
          onChange={(e) => onChange({ interventionEffect: Number(e.target.value) / 100 })} />
      </label>
    </div>
  );
}

function CompareCurves({ cmp }: { cmp: CompareResult }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 720;
    const cssH = canvas.clientHeight || 320;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const pad = 40;
    const gx = pad, gy = 16, gw = cssW - pad * 1.4, gh = cssH - pad - 16;
    const days = cmp.days;
    const maxI = Math.max(cmp.a.result.peakInfected, cmp.b.result.peakInfected, 1);
    // Osie.
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + gh); ctx.lineTo(gx + gw, gy + gh); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('zakażeni I(t)', gx - 8, gy - 4);
    ctx.fillText(`dzień → ${days}`, gx + gw - 60, gy + gh + 20);
    ctx.fillText(`szczyt: ${num(maxI)}`, gx + 6, gy + 12);

    const xAt = (t: number) => gx + (t / days) * gw;
    const yAt = (v: number) => gy + gh - (v / maxI) * gh;
    const draw = (series: { t: number; I: number }[], color: string, dash: number[]) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.setLineDash(dash); ctx.beginPath();
      series.forEach((p, i) => { const x = xAt(p.t), y = yAt(p.I); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke(); ctx.setLineDash([]);
    };
    draw(cmp.a.result.series, A_COLOR, []);
    draw(cmp.b.result.series, B_COLOR, [6, 4]);
    // Znaczniki szczytów.
    const peak = (r: { peakDay: number; peakInfected: number }, color: string) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(xAt(r.peakDay), yAt(r.peakInfected), 3.5, 0, Math.PI * 2); ctx.fill();
    };
    peak(cmp.a.result, A_COLOR); peak(cmp.b.result, B_COLOR);
  }, [cmp]);
  return <canvas ref={canvasRef} className="compare-canvas" aria-label="Nałożone przebiegi I(t) dla modelu A i B" />;
}

export function ModelComparisonScreen() {
  const preset = useMemo(() => consumePendingComparison() ?? defaultComparison(), []);
  const [a, setA] = useState<ModelConfig>(preset.a);
  const [b, setB] = useState<ModelConfig>(preset.b);
  const cmp = useMemo(() => compareEpidemic(a, b, 200, 0.25), [a, b]);

  const rows: [string, number, number, number, number | null][] = [
    ['Szczyt zakażonych', cmp.diff.peakInfected.a, cmp.diff.peakInfected.b, cmp.diff.peakInfected.delta, cmp.diff.peakInfected.pct],
    ['Dzień szczytu', cmp.diff.peakDay.a, cmp.diff.peakDay.b, cmp.diff.peakDay.delta, cmp.diff.peakDay.pct],
    ['Łącznie zakażonych', cmp.diff.totalInfected.a, cmp.diff.totalInfected.b, cmp.diff.totalInfected.delta, cmp.diff.totalInfected.pct],
    ['Zgony (SEIRD)', cmp.diff.finalDead.a, cmp.diff.finalDead.b, cmp.diff.finalDead.delta, cmp.diff.finalDead.pct],
  ];

  return (
    <main id="main-content" tabIndex={-1} className="home compare-screen">
      <HonestyBadge
        level="simplified"
        note='MODEL vs MODEL · Porównanie dwóch modeli przedziałowych (ten sam silnik RK4, różna parametryzacja). To NIE porównanie z rzeczywistością — patogen abstrakcyjny „Pathogen X", wynik jest własnością modelu, nie prognozą.'
      />

      <div className="compare-legend">
        <span><i style={{ background: A_COLOR }} /> {a.label}</span>
        <span><i style={{ background: B_COLOR, borderRadius: 0 }} className="dashed" /> {b.label}</span>
      </div>

      <CompareCurves cmp={cmp} />

      <div className="compare-controls">
        <ModelControls title="Model A" color={A_COLOR} params={a.params}
          onChange={(patch) => setA((c) => ({ ...c, params: { ...c.params, ...patch } }))} />
        <ModelControls title="Model B" color={B_COLOR} params={b.params}
          onChange={(patch) => setB((c) => ({ ...c, params: { ...c.params, ...patch } }))} />
      </div>

      <div className="section-label">Różnice (B − A)</div>
      <div className="compare-table-wrap">
        <table className="compare-table">
          <thead>
            <tr><th>Wielkość</th><th>Model A</th><th>Model B</th><th>Δ (B−A)</th><th>zmiana</th></tr>
          </thead>
          <tbody>
            {rows.map(([label, va, vb, delta, p]) => (
              <tr key={label}>
                <td>{label}</td>
                <td style={{ color: A_COLOR }}>{num(va)}</td>
                <td style={{ color: B_COLOR }}>{num(vb)}</td>
                <td>{signed(delta)}</td>
                <td>{pct(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="compare-meta">
        <section>
          <div className="section-label">Równania</div>
          <div className="generator-eqs">{EQUATIONS.map((eq) => <code key={eq}>{eq}</code>)}</div>
        </section>
        <section>
          <div className="section-label">Założenia</div>
          <ul>{ASSUMPTIONS.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
        <section>
          <div className="section-label">Ograniczenia</div>
          <ul>{LIMITATIONS.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      </div>

      <p className="footer-note">
        Silnik: core/epidemic/sir.ts (RK4), uruchomiony dwukrotnie przez core/epidemic/compare.ts.
        Poproś Science Chat: „porównaj SIR R0=1.5 z SIR R0=3" albo zmień parametry powyżej.
      </p>
    </main>
  );
}
