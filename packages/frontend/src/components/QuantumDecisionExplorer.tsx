import { useEffect, useRef, useState } from 'react';
import {
  listDecisions,
  addDecision,
  updateDecision,
  deleteDecision,
  resetToExamples,
  galaxyPosition,
  type Decision,
} from '../core/decisionExplorer';
import { NarratorPanel } from './NarratorPanel';
import { track } from '../core/analytics';

/**
 * Quantum Decision Explorer — galaktyka złożona z decyzji użytkownika.
 * Każda gwiazda to jedna decyzja; suwak osi czasu przesuwa, która decyzja
 * jest aktywna, a jej alternatywne ścieżki ("gdyby...") rozchodzą się jako
 * świecące odgałęzienia — struktura całej galaktyki zmienia się razem z
 * wyborem. WAŻNE: to narzędzie narracyjne/refleksyjne inspirowane
 * wizualnie fizyką, NIE model fizyczny ani przewidywanie przyszłości —
 * patrz stały baner niżej i knowledge/quantum-decision-explorer.md.
 */

const DISCLAIMER =
  'To interaktywna symulacja alternatywnych scenariuszy oparta na modelowaniu decyzji i wizualnych inspiracjach z fizyki. Nie przewiduje przyszłości ani nie odtwarza rzeczywistości.';

const BRANCH_COLOR = '#a78bfa';
const STAR_COLOR = '#5cd6e8';
const ACTIVE_COLOR = '#f0b35c';

function emptyForm(): { label: string; description: string; year: string; weight: number; branches: string } {
  const y = new Date().getFullYear();
  return { label: '', description: '', year: String(y), weight: 5, branches: '' };
}

function formFromDecision(d: Decision): ReturnType<typeof emptyForm> {
  return {
    label: d.label,
    description: d.description,
    year: String(d.year),
    weight: d.weight,
    branches: d.branches.join('\n'),
  };
}

export function QuantumDecisionExplorer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [decisions, setDecisions] = useState<Decision[]>(() => listDecisions());
  const [activeIdx, setActiveIdx] = useState(() => Math.max(0, decisions.length - 1));
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const activeIdxRef = useRef(activeIdx);
  const decisionsRef = useRef(decisions);
  activeIdxRef.current = Math.min(activeIdx, Math.max(0, decisions.length - 1));
  decisionsRef.current = decisions;

  useEffect(() => {
    track('experiment_open', { lab: 'quantum-decision-explorer', experiment: '__base' });
  }, []);

  const active = decisions[Math.min(activeIdx, decisions.length - 1)] as Decision | undefined;

  useEffect(() => {
    if (active) {
      setForm(formFromDecision(active));
      setEditingId(active.id);
    } else {
      setForm(emptyForm());
      setEditingId(null);
    }
  }, [active?.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let clock = 0;
    let last = performance.now();
    const highlightR = { current: 0 };

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const loop = () => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      clock += dt;

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;
      const base = Math.min(w, h) * 0.42;

      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.75);
      bg.addColorStop(0, '#0d0a18');
      bg.addColorStop(1, '#02030a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const list = decisionsRef.current;
      const curActive = Math.min(activeIdxRef.current, Math.max(0, list.length - 1));
      const targetR = 1;
      highlightR.current += (targetR - highlightR.current) * (reduced ? 1 : 0.12);

      const positions = list.map((d, i) => {
        const { angle, radiusFrac } = galaxyPosition(i, list.length);
        const r = radiusFrac * base;
        return {
          d,
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r * 0.62,
        };
      });

      // Delikatna nić łącząca decyzje w chronologicznej kolejności.
      if (positions.length > 1) {
        ctx.strokeStyle = 'rgba(167,139,250,0.15)';
        ctx.beginPath();
        positions.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
      }

      positions.forEach((p, i) => {
        const isActive = i === curActive;
        const glowR = 3 + p.d.weight * 0.7;
        const color = isActive ? ACTIVE_COLOR : STAR_COLOR;
        const pulse = isActive ? 1 + Math.sin(clock * 3) * 0.15 : 1;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = (isActive ? 14 : 6) * pulse;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowR * (isActive ? 1.4 : 1) * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (isActive) {
          ctx.strokeStyle = `rgba(240,179,92,${0.35 * highlightR.current})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, glowR * 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = 1;

          // Odgałęzienia: alternatywne ścieżki rozchodzące się z aktywnej gwiazdy.
          p.d.branches.forEach((branch, bi) => {
            const bAngle = (bi / Math.max(1, p.d.branches.length)) * Math.PI * 2 + clock * 0.08;
            const blen = base * 0.22;
            const ex = p.x + Math.cos(bAngle) * blen;
            const ey = p.y + Math.sin(bAngle) * blen * 0.6;
            ctx.strokeStyle = 'rgba(167,139,250,0.45)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.quadraticCurveTo(p.x + Math.cos(bAngle) * blen * 0.5, p.y + Math.sin(bAngle) * blen * 0.5 - 12, ex, ey);
            ctx.stroke();
            ctx.fillStyle = BRANCH_COLOR;
            ctx.shadowColor = BRANCH_COLOR;
            ctx.shadowBlur = 5;
            ctx.beginPath();
            ctx.arc(ex, ey, 2.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.fillStyle = 'rgba(230,234,245,0.7)';
            ctx.font = '9px system-ui';
            ctx.textAlign = Math.cos(bAngle) >= 0 ? 'left' : 'right';
            const label = branch.length > 34 ? `${branch.slice(0, 34)}…` : branch;
            ctx.fillText(label, ex + (Math.cos(bAngle) >= 0 ? 5 : -5), ey);
          });
          ctx.textAlign = 'left';
        }

        if (list.length <= 12 || isActive) {
          ctx.fillStyle = isActive ? 'rgba(240,179,92,0.9)' : 'rgba(230,234,245,0.5)';
          ctx.font = isActive ? '600 11px system-ui' : '9px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(p.d.label, p.x, p.y - glowR * (isActive ? 1.4 : 1) - 8);
          ctx.textAlign = 'left';
        }
      });

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const saveForm = () => {
    const year = Number(form.year) || new Date().getFullYear();
    const branches = form.branches
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean)
      .slice(0, 4);
    const payload = { label: form.label.trim(), description: form.description.trim(), year, weight: form.weight, branches };
    if (!payload.label) return;
    if (editingId && decisions.some((d) => d.id === editingId)) {
      updateDecision(editingId, payload);
    } else {
      addDecision(payload);
    }
    const fresh = listDecisions();
    setDecisions(fresh);
    setActiveIdx(fresh.length - 1);
    track('custom_experiment_saved');
  };

  const startNew = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const removeActive = () => {
    if (!active) return;
    deleteDecision(active.id);
    const fresh = listDecisions();
    setDecisions(fresh);
    setActiveIdx(Math.max(0, fresh.length - 1));
  };

  return (
    <main className="qde-view" id="main-content" tabIndex={-1}>
      <div className="qde-disclaimer" role="note">
        <span aria-hidden="true">⚠</span> {DISCLAIMER}
      </div>

      <div className="hero-canvas-wrap qde-canvas-wrap">
        <canvas ref={canvasRef} aria-label="Galaktyka decyzji: każda gwiazda to jedna decyzja, odgałęzienia to alternatywne ścieżki" />
        <div className="hero-overlay">
          <span className="brand">Quantum Decision Explorer</span>
          <h2>{active ? active.label : 'Dodaj swoją pierwszą decyzję'}</h2>
        </div>
      </div>

      {decisions.length > 0 && (
        <div className="qde-scrubber">
          <input
            type="range"
            min={0}
            max={Math.max(0, decisions.length - 1)}
            step={1}
            value={Math.min(activeIdx, decisions.length - 1)}
            aria-label="Oś czasu decyzji"
            onChange={(e) => setActiveIdx(Number(e.target.value))}
          />
          <div className="qde-scrubber-labels">
            <span>{decisions[0]?.year}</span>
            <span>{decisions[decisions.length - 1]?.year}</span>
          </div>
        </div>
      )}

      {active && (
        <NarratorPanel
          blocks={[
            {
              title: active.label,
              body: `${active.description || 'Brak dodatkowego opisu.'} Waga subiektywna: ${active.weight}/10.${
                active.branches.length > 0
                  ? ` Alternatywne ścieżki rozważone w tej eksploracji: ${active.branches.join(' · ')}.`
                  : ''
              }`,
            },
          ]}
          askContext={{
            labId: 'quantum-decision-explorer',
            lab: 'Quantum Decision Explorer',
            experiment: active.label,
            honesty: 'narzędzie narracyjne, nie model fizyczny',
            honestyNote: DISCLAIMER,
            params: { year: active.year, weight: active.weight },
            stats: {},
            narration: [{ title: active.label, body: active.description }],
          }}
        />
      )}

      <div className="qde-form">
        <div className="section-label">{editingId ? 'Edytuj decyzję' : 'Nowa decyzja'}</div>
        <div className="control">
          <label>Tytuł decyzji</label>
          <input
            type="text"
            className="qde-input"
            value={form.label}
            maxLength={80}
            placeholder="np. Zmiana kierunku studiów"
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
        </div>
        <div className="control">
          <label>Opis / kontekst</label>
          <textarea
            className="qde-input qde-textarea"
            value={form.description}
            maxLength={400}
            placeholder="Krótki kontekst tej decyzji…"
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="control">
          <label>Rok</label>
          <input
            type="number"
            className="qde-input"
            value={form.year}
            onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
          />
        </div>
        <div className="control">
          <label><span>Waga (subiektywna)</span><span className="val">{form.weight}/10</span></label>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={form.weight}
            onChange={(e) => setForm((f) => ({ ...f, weight: Number(e.target.value) }))}
          />
        </div>
        <div className="control">
          <label>Alternatywne ścieżki (jedna na linię, max 4)</label>
          <textarea
            className="qde-input qde-textarea"
            value={form.branches}
            placeholder={'Gdyby wybrać inaczej…\nGdyby poczekać…'}
            onChange={(e) => setForm((f) => ({ ...f, branches: e.target.value }))}
          />
        </div>
        <div className="qde-form-actions">
          <button className="chip-btn" onClick={saveForm} disabled={!form.label.trim()}>
            {editingId ? '💾 Zapisz zmiany' : '➕ Dodaj decyzję'}
          </button>
          {editingId && (
            <button className="chip-btn" onClick={startNew}>
              ➕ Nowa decyzja
            </button>
          )}
          {active && (
            <button className="chip-btn danger" onClick={removeActive}>
              🗑 Usuń tę decyzję
            </button>
          )}
          {decisions.length === 0 && (
            <button className="chip-btn" onClick={() => setDecisions(resetAndReturn())}>
              ↺ Przywróć przykłady
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function resetAndReturn(): Decision[] {
  resetToExamples();
  return listDecisions();
}
