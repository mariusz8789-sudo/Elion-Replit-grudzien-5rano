import { useEffect, useMemo, useRef, useState } from 'react';
import {
  listDecisions,
  addDecision,
  updateDecision,
  deleteDecision,
  resetToExamples,
  galaxyPosition,
  type Decision,
  type Branch,
} from '../core/decisionExplorer';
import { runMonteCarlo, branchToSimParams, type MonteCarloBundle } from '../core/decisionMonteCarlo';
import { NarratorPanel } from './NarratorPanel';
import { track } from '../core/analytics';

/**
 * Quantum Decision Explorer — galaktyka złożona z decyzji użytkownika.
 * Każda gwiazda to jedna decyzja; suwak osi czasu przesuwa, która decyzja
 * jest aktywna. Każde odgałęzienie ("gdyby...") niesie teraz PRAWDZIWĄ
 * symulację Monte Carlo (dyskretny proces Wienera z dryfem,
 * `core/decisionMonteCarlo.ts`) rozchodzącą się jako wachlarz świecących
 * torów — rozrzut rośnie z czasem jak √t, dokładnie tak jak w prawdziwej
 * fizyce dyfuzji. WAŻNE: to narzędzie narracyjne/refleksyjne inspirowane
 * wizualnie fizyką i matematyką niepewności, NIE model predykcyjny ani
 * przewidywanie przyszłości — patrz stały baner niżej i
 * knowledge/quantum-decision-explorer.md.
 */

const DISCLAIMER =
  'To interaktywna symulacja alternatywnych scenariuszy oparta na modelowaniu decyzji i wizualnych inspiracjach z fizyki. Nie przewiduje przyszłości ani nie odtwarza rzeczywistości.';

const BRANCH_COLOR = '#a78bfa';
const STAR_COLOR = '#5cd6e8';
const ACTIVE_COLOR = '#f0b35c';
const HORIZONS = [1, 3, 5, 10, 20, 50, 100];
const MC_PATHS = 22;

function emptyForm(): { label: string; description: string; year: string; weight: number; branches: Branch[] } {
  const y = new Date().getFullYear();
  return { label: '', description: '', year: String(y), weight: 5, branches: [] };
}

function formFromDecision(d: Decision): ReturnType<typeof emptyForm> {
  return {
    label: d.label,
    description: d.description,
    year: String(d.year),
    weight: d.weight,
    branches: d.branches.map((b) => ({ ...b })),
  };
}

/** Cache symulacji Monte Carlo per (decyzja, horyzont) — nieprzeliczane co klatkę, tylko przy zmianie. */
function computeBundles(decision: Decision, years: number): MonteCarloBundle[] {
  return decision.branches.map((b) => {
    const { drift, volatility } = branchToSimParams(decision.weight, b.tone);
    return runMonteCarlo(years, drift, volatility, { paths: MC_PATHS, steps: Math.max(10, Math.round(years * 4)) });
  });
}

export function QuantumDecisionExplorer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [decisions, setDecisions] = useState<Decision[]>(() => listDecisions());
  const [activeIdx, setActiveIdx] = useState(() => Math.max(0, decisions.length - 1));
  const [horizon, setHorizon] = useState(10);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const activeIdxRef = useRef(activeIdx);
  const decisionsRef = useRef(decisions);
  const horizonRef = useRef(horizon);
  activeIdxRef.current = Math.min(activeIdx, Math.max(0, decisions.length - 1));
  decisionsRef.current = decisions;
  horizonRef.current = horizon;

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

  // Wiązki Monte Carlo dla AKTYWNEJ decyzji — przeliczane tylko przy zmianie decyzji/horyzontu, nie co klatkę.
  const bundlesRef = useRef<MonteCarloBundle[]>([]);
  const bundlesKeyRef = useRef('');
  const activeBundles = useMemo(() => {
    if (!active) return [];
    return computeBundles(active, horizon);
  }, [active, horizon]);
  useEffect(() => {
    bundlesRef.current = activeBundles;
    bundlesKeyRef.current = `${active?.id ?? ''}-${horizon}`;
  }, [activeBundles, active?.id, horizon]);

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

      const yearsNow = horizonRef.current;
      const bundles = bundlesRef.current;

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

          // Odgałęzienia: alternatywne ścieżki + wachlarz Monte Carlo (prawdziwa symulacja, nie ozdoba).
          p.d.branches.forEach((branch, bi) => {
            const bAngle = (bi / Math.max(1, p.d.branches.length)) * Math.PI * 2 + clock * 0.05;
            const stemLen = base * 0.2;
            const ex = p.x + Math.cos(bAngle) * stemLen;
            const ey = p.y + Math.sin(bAngle) * stemLen * 0.6;
            ctx.strokeStyle = 'rgba(167,139,250,0.4)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.quadraticCurveTo(p.x + Math.cos(bAngle) * stemLen * 0.5, p.y + Math.sin(bAngle) * stemLen * 0.5 - 12, ex, ey);
            ctx.stroke();

            // Wachlarz Monte Carlo: każda linia to jedna prawdziwie zasymulowana trajektoria.
            const bundle = bundles[bi];
            if (bundle) {
              const dirX = Math.cos(bAngle);
              const dirY = Math.sin(bAngle) * 0.6;
              const perpX = -Math.sin(bAngle);
              const perpY = Math.cos(bAngle) * 0.6;
              const fanLen = base * (0.14 + Math.log10(1 + yearsNow) * 0.12);
              const refScale = Math.max(1e-6, branchToSimParams(p.d.weight, branch.tone).volatility * Math.sqrt(yearsNow) * 2.2);
              const fanSpread = base * 0.16;
              ctx.lineWidth = 1;
              bundle.trajectories.forEach((traj, ti) => {
                ctx.beginPath();
                ctx.strokeStyle = `rgba(167,139,250,${ti === 0 ? 0.9 : 0.16})`;
                if (ti === 0) ctx.lineWidth = 1.8;
                for (let pi = 0; pi < traj.length; pi++) {
                  const pt = traj[pi];
                  const tFrac = pt.t / Math.max(1e-9, yearsNow);
                  const normV = Math.max(-1.4, Math.min(1.4, pt.v / refScale));
                  const px = ex + dirX * tFrac * fanLen + perpX * normV * fanSpread;
                  const py = ey + dirY * tFrac * fanLen + perpY * normV * fanSpread;
                  if (pi === 0) ctx.moveTo(px, py);
                  else ctx.lineTo(px, py);
                }
                ctx.stroke();
                if (ti === 0) ctx.lineWidth = 1;
              });
            }

            ctx.fillStyle = BRANCH_COLOR;
            ctx.shadowColor = BRANCH_COLOR;
            ctx.shadowBlur = 5;
            ctx.beginPath();
            ctx.arc(ex, ey, 2.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.fillStyle = 'rgba(230,234,245,0.7)';
            ctx.font = '9px system-ui';
            const alignLeft = Math.cos(bAngle) >= 0;
            ctx.textAlign = alignLeft ? 'left' : 'right';
            const label = branch.text.length > 30 ? `${branch.text.slice(0, 30)}…` : branch.text;
            const labelWidth = ctx.measureText(label).width;
            let tx = ex + (alignLeft ? 5 : -5);
            // Trzyma etykietę odgałęzienia w granicach canvasu — bez tego długie
            // teksty przy skrajnych kątach wypadają poza prawą/lewą krawędź.
            tx = alignLeft ? Math.min(tx, w - 4 - labelWidth) : Math.max(tx, 4 + labelWidth);
            ctx.fillText(label, tx, ey - 6);
          });
          ctx.textAlign = 'left';
        }

        // Etykieta aktywnej gwiazdy NIE jest tu rysowana — nazwa aktywnej
        // decyzji jest już widoczna w <h2> nad canvasem (hero-overlay);
        // powtórzenie jej na pozycji węzła nakładało się wizualnie na ten
        // nagłówek, gdy węzeł wypadał blisko górnej krawędzi.
        if (!isActive && list.length <= 12) {
          ctx.fillStyle = 'rgba(230,234,245,0.5)';
          ctx.font = '9px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(p.d.label, p.x, p.y - glowR - 8);
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
    const payload = {
      label: form.label.trim(),
      description: form.description.trim(),
      year,
      weight: form.weight,
      branches: form.branches.filter((b) => b.text.trim()).slice(0, 4),
    };
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

  const addBranchRow = () => {
    if (form.branches.length >= 4) return;
    setForm((f) => ({ ...f, branches: [...f.branches, { text: '', tone: 0 }] }));
  };
  const updateBranchRow = (idx: number, patch: Partial<Branch>) => {
    setForm((f) => ({ ...f, branches: f.branches.map((b, i) => (i === idx ? { ...b, ...patch } : b)) }));
  };
  const removeBranchRow = (idx: number) => {
    setForm((f) => ({ ...f, branches: f.branches.filter((_, i) => i !== idx) }));
  };

  const narrationBlocks = active
    ? [
        {
          title: active.label,
          body: `${active.description || 'Brak dodatkowego opisu.'} Waga subiektywna: ${active.weight}/10.`,
        },
        ...activeBundles.map((bundle, i) => {
          const branch = active.branches[i];
          const pct = Math.round(bundle.significantFraction * 100);
          return {
            title: `„${branch.text}" — rozrzut po ${horizon} ${horizon === 1 ? 'roku' : 'latach'}`,
            body: `Symulacja Monte Carlo (${MC_PATHS} niezależnych torów, proces Wienera z dryfem) pokazuje, że przy horyzoncie ${horizon} lat w ${pct}% zasymulowanych wariantów tej ścieżki skumulowane odchylenie przekracza jedno teoretyczne odchylenie standardowe od status quo. To NIE prognoza tej konkretnej ścieżki — to demonstracja realnej własności matematycznej: niepewność rośnie jak √czas, więc nawet mały początkowy „ton" (${branch.tone > 0 ? '+' : ''}${branch.tone}) prowadzi do coraz szerszego wachlarza możliwych wyników w miarę oddalania się w czasie.`,
          };
        }),
        {
          title: 'Skąd biorą się te liczby',
          body: 'Kierunek (dryf) i szerokość wachlarza (zmienność) pochodzą WYŁĄCZNIE z Twoich własnych ocen — "ton" każdej ścieżki i "waga" decyzji, które sam(a) ustawiasz. System nie zgaduje niczego o Twoim realnym życiu; przelicza tylko konsekwencję matematyczną Twoich założeń.',
        },
      ]
    : [];

  return (
    <main className="qde-view" id="main-content" tabIndex={-1}>
      <div className="qde-disclaimer" role="note">
        <span aria-hidden="true">⚠</span> {DISCLAIMER}
      </div>

      <div className="hero-canvas-wrap qde-canvas-wrap">
        <canvas ref={canvasRef} aria-label="Galaktyka decyzji: każda gwiazda to jedna decyzja, odgałęzienia to alternatywne ścieżki z wachlarzem symulacji Monte Carlo" />
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

      {active && active.branches.length > 0 && (
        <div className="control qde-horizon">
          <label>Horyzont symulacji Monte Carlo</label>
          <div className="seg" role="group" aria-label="Horyzont czasowy">
            {HORIZONS.map((y) => (
              <button key={y} aria-pressed={horizon === y} onClick={() => setHorizon(y)}>
                {y} {y === 1 ? 'rok' : y < 5 ? 'lata' : 'lat'}
              </button>
            ))}
          </div>
        </div>
      )}

      {active && <NarratorPanel
        blocks={narrationBlocks}
        askContext={{
          labId: 'quantum-decision-explorer',
          lab: 'Quantum Decision Explorer',
          experiment: active.label,
          honesty: 'narzędzie narracyjne, nie model fizyczny',
          honestyNote: DISCLAIMER,
          params: { year: active.year, weight: active.weight, horizon },
          stats: {},
          narration: [{ title: active.label, body: active.description }],
        }}
      />}

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
          <label><span>Waga (subiektywna) — steruje też zmiennością symulacji</span><span className="val">{form.weight}/10</span></label>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={form.weight}
            onChange={(e) => setForm((f) => ({ ...f, weight: Number(e.target.value) }))}
          />
        </div>

        <div className="qde-branches">
          <label>Alternatywne ścieżki (max 4) — „ton" steruje kierunkiem symulacji Monte Carlo</label>
          {form.branches.map((b, i) => (
            <div className="qde-branch-row" key={i}>
              <input
                type="text"
                className="qde-input"
                value={b.text}
                maxLength={160}
                placeholder="Gdyby…"
                onChange={(e) => updateBranchRow(i, { text: e.target.value })}
              />
              <div className="qde-branch-tone">
                <input
                  type="range"
                  min={-5}
                  max={5}
                  step={1}
                  value={b.tone}
                  aria-label={`Ton ścieżki ${i + 1}`}
                  onChange={(e) => updateBranchRow(i, { tone: Number(e.target.value) })}
                />
                <span className="qde-branch-tone-val">{b.tone > 0 ? `+${b.tone}` : b.tone}</span>
              </div>
              <button className="chip-btn danger qde-branch-remove" onClick={() => removeBranchRow(i)} aria-label="Usuń ścieżkę">
                ✕
              </button>
            </div>
          ))}
          {form.branches.length < 4 && (
            <button className="chip-btn" onClick={addBranchRow}>
              ➕ Dodaj ścieżkę
            </button>
          )}
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
