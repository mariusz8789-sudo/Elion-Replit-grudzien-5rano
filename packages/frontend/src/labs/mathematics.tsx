import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LabDefinition } from '../core/types';
import { HonestyBadge } from '../components/HonestyBadge';
import { NarratorPanel } from '../components/NarratorPanel';
import { buildContext } from '../narrator/askAI';
import { useThreeLoop } from '../core/three/useThreeLoop';
import { FunctionSurface3DSim } from './experiments/mathematics-surface-3d';
import {
  differentiateWithSteps,
  evaluate,
  findRoots,
  MathParseError,
  nodeToString,
  parseExpression,
  simpsonIntegral,
  solveOde,
  type DiffStep,
  type Node as MathNode,
} from '../core/mathExpr';

/**
 * Mathematics Lab — bezpieczna piaskownica równań: użytkownik wpisuje
 * dowolne wyrażenie tekstowe, ale NIGDY nie jest ono wykonywane jako kod
 * (brak eval()/Function() w całym łańcuchu — core/mathExpr.ts to
 * tokenizer → parser rekurencyjnego zstępowania → AST → ewaluator z
 * jawną białą listą dozwolonych funkcji). Dwa tryby: wykres + pochodna +
 * całka (algebra i rachunek różniczkowy/całkowy) oraz równania
 * różniczkowe (pole kierunkowe + RK4, ta sama metoda numeryczna co
 * reszta Genesis OS — Lorenz, problem trzech ciał, geodezyjne).
 *
 * Uczciwość: różniczkowanie jest DOKŁADNE (symboliczne, standardowe
 * reguły rachunku różniczkowego — nie przybliżenie). Całkowanie
 * (metoda Simpsona) i rozwiązania równań różniczkowych (RK4) są
 * NUMERYCZNE — jawnie nazwane w interfejsie, nie ukryte pod dokładnym
 * wynikiem.
 */

type Mode = 'graph' | 'ode' | 'surface';

const F_COLOR = '#5cd6e8';
const D_COLOR = '#f0b35c';
const ODE_COLOR = '#6ee7a0';
const SLOPE_COLOR = 'rgba(141,151,180,0.4)';

interface Pt { x: number; y: number }

function sampleFunction(f: (x: number) => number, xMin: number, xMax: number, n: number): Pt[] {
  const points: Pt[] = [];
  const step = (xMax - xMin) / n;
  for (let i = 0; i <= n; i++) {
    const x = xMin + i * step;
    let y: number;
    try { y = f(x); } catch { y = NaN; }
    points.push({ x, y: Number.isFinite(y) ? y : NaN });
  }
  return points;
}

function niceYRange(points: Pt[]): [number, number] {
  const finite = points.map((p) => p.y).filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
  if (finite.length === 0) return [-1, 1];
  const lo = finite[Math.floor(finite.length * 0.02)];
  const hi = finite[Math.min(finite.length - 1, Math.ceil(finite.length * 0.98))];
  if (lo === hi) return [lo - 1, hi + 1];
  const pad = (hi - lo) * 0.15;
  return [lo - pad, hi + pad];
}

interface Bounds { xMin: number; xMax: number; yMin: number; yMax: number; w: number; h: number }

function toPx(b: Bounds, x: number, y: number): { px: number; py: number } {
  return {
    px: ((x - b.xMin) / (b.xMax - b.xMin)) * b.w,
    py: b.h - ((y - b.yMin) / (b.yMax - b.yMin)) * b.h,
  };
}

function prepareCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.max(1, w * dpr);
  canvas.height = Math.max(1, h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#02030a';
  ctx.fillRect(0, 0, w, h);
  return { ctx, w, h };
}

function drawAxes(ctx: CanvasRenderingContext2D, b: Bounds) {
  ctx.strokeStyle = 'rgba(141,151,180,0.35)';
  ctx.lineWidth = 1;
  if (b.yMin <= 0 && b.yMax >= 0) {
    const { py } = toPx(b, 0, 0);
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(b.w, py); ctx.stroke();
  }
  if (b.xMin <= 0 && b.xMax >= 0) {
    const { px } = toPx(b, 0, 0);
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, b.h); ctx.stroke();
  }
}

function drawCurve(ctx: CanvasRenderingContext2D, b: Bounds, points: Pt[], color: string, dashed = false) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.setLineDash(dashed ? [5, 4] : []);
  let drawing = false;
  let lastPy: number | null = null;
  for (const p of points) {
    if (!Number.isFinite(p.y)) { drawing = false; lastPy = null; continue; }
    const { px, py } = toPx(b, p.x, p.y);
    // przerwij linię przy gwałtownym skoku (asymptota), zamiast rysować pionową kreskę przez cały wykres
    if (lastPy !== null && Math.abs(py - lastPy) > b.h * 0.9) drawing = false;
    if (!drawing) { ctx.beginPath(); ctx.moveTo(px, py); drawing = true; } else { ctx.lineTo(px, py); }
    lastPy = py;
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

/* ---------------- Tryb: Wykres + pochodna + całka ---------------- */

interface GraphResult { roots: number[]; integral: number | null; steps: DiffStep[]; derivStr: string | null; error: string | null }

function drawGraphMode(canvas: HTMLCanvasElement, exprText: string, xMin: number, xMax: number, integralRange: [number, number] | null): GraphResult {
  const { ctx, w, h } = prepareCanvas(canvas);
  let ast: MathNode;
  try {
    ast = parseExpression(exprText);
  } catch (err) {
    ctx.fillStyle = '#f47c7c';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText(err instanceof MathParseError ? err.message : 'Błąd wyrażenia', 10, 20);
    return { roots: [], integral: null, steps: [], derivStr: null, error: err instanceof Error ? err.message : String(err) };
  }
  const f = (x: number) => evaluate(ast, { x });

  const fPoints = sampleFunction(f, xMin, xMax, 500);
  const [yMin, yMax] = niceYRange(fPoints);
  const bounds: Bounds = { xMin, xMax, yMin, yMax, w, h };
  drawAxes(ctx, bounds);

  if (integralRange) {
    const [a, b] = integralRange;
    ctx.fillStyle = 'rgba(92,214,232,0.18)';
    ctx.beginPath();
    const shaded = sampleFunction(f, a, b, 120);
    const zeroStart = toPx(bounds, a, 0);
    ctx.moveTo(zeroStart.px, zeroStart.py);
    for (const p of shaded) {
      if (!Number.isFinite(p.y)) continue;
      const { px, py } = toPx(bounds, p.x, p.y);
      ctx.lineTo(px, py);
    }
    const zeroEnd = toPx(bounds, b, 0);
    ctx.lineTo(zeroEnd.px, zeroEnd.py);
    ctx.closePath();
    ctx.fill();
  }

  drawCurve(ctx, bounds, fPoints, F_COLOR);

  let steps: DiffStep[] = [];
  let derivStr: string | null = null;
  try {
    const { result, steps: s } = differentiateWithSteps(ast, 'x');
    steps = s;
    derivStr = nodeToString(result);
    const derivPoints = sampleFunction((x) => evaluate(result, { x }), xMin, xMax, 500);
    drawCurve(ctx, bounds, derivPoints, D_COLOR, true);
  } catch {
    /* funkcja bez zdefiniowanej reguły różniczkowania (np. nieobsługiwana funkcja) — sam wykres f(x) wystarczy */
  }

  const roots = findRoots(f, xMin, xMax);
  ctx.fillStyle = '#e6eaf5';
  for (const r of roots) {
    const { px, py } = toPx(bounds, r, 0);
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
  }

  ctx.fillStyle = 'rgba(92,214,232,0.85)';
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText('f(x)', 10, h - 22);
  ctx.fillStyle = 'rgba(240,179,92,0.85)';
  ctx.fillText("f′(x) (przerywana)", 40, h - 22);

  const integral = integralRange ? simpsonIntegral(f, integralRange[0], integralRange[1]) : null;
  return { roots, integral, steps, derivStr, error: null };
}

/* ---------------- Tryb: Równania różniczkowe ---------------- */

interface OdeResult { error: string | null; finalY: number | null }

function drawOdeMode(canvas: HTMLCanvasElement, exprText: string, x0: number, y0: number, xEnd: number): OdeResult {
  const { ctx, w, h } = prepareCanvas(canvas);
  let ast: MathNode;
  try {
    ast = parseExpression(exprText);
  } catch (err) {
    ctx.fillStyle = '#f47c7c';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText(err instanceof MathParseError ? err.message : 'Błąd wyrażenia', 10, 20);
    return { error: err instanceof Error ? err.message : String(err), finalY: null };
  }
  const f = (x: number, y: number) => evaluate(ast, { x, y });

  const steps = 800;
  const trajectory = solveOde(f, x0, y0, xEnd, steps);
  const xMin = Math.min(x0, xEnd);
  const xMax = Math.max(x0, xEnd);
  const [yMin, yMax] = niceYRange(trajectory);
  const bounds: Bounds = { xMin, xMax, yMin, yMax, w, h };
  drawAxes(ctx, bounds);

  // Pole kierunkowe: krótkie odcinki pokazujące dy/dx w siatce punktów — standardowa,
  // podręcznikowa wizualizacja równań różniczkowych PRZED rozwiązaniem.
  const gridX = 17;
  const gridY = 11;
  ctx.strokeStyle = SLOPE_COLOR;
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridX; i++) {
    for (let j = 0; j <= gridY; j++) {
      const gx = xMin + (i / gridX) * (xMax - xMin);
      const gy = yMin + (j / gridY) * (yMax - yMin);
      let slope: number;
      try { slope = f(gx, gy); } catch { continue; }
      if (!Number.isFinite(slope)) continue;
      const len = 9 / Math.sqrt(1 + slope * slope);
      const dx = len;
      const dy = -len * slope; // ekran: y rośnie w dół
      const { px, py } = toPx(bounds, gx, gy);
      ctx.beginPath();
      ctx.moveTo(px - dx / 2, py - dy / 2);
      ctx.lineTo(px + dx / 2, py + dy / 2);
      ctx.stroke();
    }
  }

  drawCurve(ctx, bounds, trajectory, ODE_COLOR);
  const start = toPx(bounds, x0, y0);
  ctx.fillStyle = ODE_COLOR;
  ctx.beginPath(); ctx.arc(start.px, start.py, 4, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = 'rgba(110,231,160,0.9)';
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText('rozwiązanie y(x) — RK4', 10, h - 22);
  ctx.fillStyle = 'rgba(141,151,180,0.8)';
  ctx.fillText('pole kierunkowe', 10, h - 10);

  const finalY = trajectory.length > 0 ? trajectory[trajectory.length - 1].y : null;
  return { error: null, finalY };
}

/* ---------------- Komponent React ---------------- */

const GRAPH_PRESETS = ['x^2 - 3x + 2', 'sin(x)*x', 'exp(-x^2)', '1/x', 'x^3 - x'];
const ODE_PRESETS = ['y', '-y', '2x', 'y - y^2', 'sin(x) - y'];
const SURFACE_PRESETS = ['sin(x)*cos(y)', 'x^2 - y^2', 'x^2 + y^2', 'sin(sqrt(x^2+y^2))', 'exp(-(x^2+y^2)/8)'];

function MathLabView({ lab }: { lab: LabDefinition }) {
  const [mode, setMode] = useState<Mode>('graph');

  const [graphExpr, setGraphExpr] = useState('sin(x)*x');
  const [xMin, setXMin] = useState(-10);
  const [xMax, setXMax] = useState(10);
  const [integralA, setIntegralA] = useState(0);
  const [integralB, setIntegralB] = useState(3);
  const [showIntegral, setShowIntegral] = useState(false);
  const [graphResult, setGraphResult] = useState<GraphResult | null>(null);
  const graphCanvasRef = useRef<HTMLCanvasElement>(null);

  const [odeExpr, setOdeExpr] = useState('y');
  const [odeX0, setOdeX0] = useState(0);
  const [odeY0, setOdeY0] = useState(1);
  const [odeXEnd, setOdeXEnd] = useState(3);
  const [odeResult, setOdeResult] = useState<OdeResult | null>(null);
  const odeCanvasRef = useRef<HTMLCanvasElement>(null);

  const [surfaceExpr, setSurfaceExpr] = useState('sin(x)*cos(y)');
  const [surfXMin, setSurfXMin] = useState(-5);
  const [surfXMax, setSurfXMax] = useState(5);
  const [surfYMin, setSurfYMin] = useState(-5);
  const [surfYMax, setSurfYMax] = useState(5);
  const surfaceSim = useMemo(() => new FunctionSurface3DSim(), []);
  const surfaceParams = useMemo(
    () => ({ expr: surfaceExpr, xMin: surfXMin, xMax: surfXMax, yMin: surfYMin, yMax: surfYMax }),
    [surfaceExpr, surfXMin, surfXMax, surfYMin, surfYMax],
  );
  const [surfaceStats, setSurfaceStats] = useState<{ zMin: number; zMax: number; valid: boolean }>({ zMin: 0, zMax: 0, valid: false });
  const onSurfaceStats = useCallback((s: Record<string, number>) => {
    setSurfaceStats({ zMin: s.zMin ?? 0, zMax: s.zMax ?? 0, valid: (s.valid ?? 0) > 0 });
  }, []);
  const { canvasRef: surfaceCanvasRef, loading: surfaceLoading, failed: surfaceFailed } = useThreeLoop(
    mode === 'surface' ? surfaceSim : null,
    surfaceParams,
    true,
    onSurfaceStats,
  );
  const surfaceParseError = useMemo(() => {
    try { parseExpression(surfaceExpr); return null; } catch (err) {
      return err instanceof MathParseError ? err.message : 'Błąd wyrażenia';
    }
  }, [surfaceExpr]);

  useEffect(() => {
    if (mode !== 'graph') return;
    const timer = setTimeout(() => {
      const canvas = graphCanvasRef.current;
      if (!canvas) return;
      const range: [number, number] | null = showIntegral ? [Math.min(integralA, integralB), Math.max(integralA, integralB)] : null;
      setGraphResult(drawGraphMode(canvas, graphExpr, xMin, xMax, range));
    }, 150);
    return () => clearTimeout(timer);
  }, [mode, graphExpr, xMin, xMax, integralA, integralB, showIntegral]);

  useEffect(() => {
    if (mode !== 'ode') return;
    const timer = setTimeout(() => {
      const canvas = odeCanvasRef.current;
      if (!canvas) return;
      setOdeResult(drawOdeMode(canvas, odeExpr, odeX0, odeY0, odeXEnd));
    }, 150);
    return () => clearTimeout(timer);
  }, [mode, odeExpr, odeX0, odeY0, odeXEnd]);

  const graphHonesty = 'Wykres i szukanie pierwiastków są numeryczne (próbkowanie + bisekcja) — nie znajdą pierwiastków parzystej krotności (styczne dotknięcie osi X). Pochodna jest DOKŁADNA symbolicznie (standardowe reguły rachunku różniczkowego, nie przybliżenie). Całka jest NUMERYCZNA (metoda Simpsona) — nie próbuje się całkowania symbolicznego, które w ogólności jest nierozwiązywalne w postaci zamkniętej.';
  const odeHonesty = 'Rozwiązanie równania różniczkowego liczone numerycznie metodą RK4 (ta sama metoda co atraktor Lorenza, problem trzech ciał i geodezyjne w tym Genesis OS) — nie symbolicznie. Pole kierunkowe pokazuje dy/dx w siatce punktów niezależnie od konkretnego rozwiązania — standardowa, podręcznikowa wizualizacja jakościowego zachowania równania.';
  const surfaceHonesty = 'Każdy wierzchołek siatki to dosłownie f(x,y) policzone tym samym bezpiecznym parserem (zero eval()/Function()) co pozostałe tryby — nie ilustracja. Wysokość jest przeskalowana liniowo do stałego zakresu ekranowego wokół z=0 (dowolna funkcja użytkownika może mieć wysokość rzędu 10⁻³ albo 10⁶, a kamera musi mieć jeden stały kadr) — kształt lokalny jest dokładny, skala pionowa względem osi x/y nie jest 1:1, jak na mapie topograficznej.';

  const graphBlocks = useMemo(() => {
    if (!graphResult) return [];
    if (graphResult.error) {
      return [{ title: 'Błąd w wyrażeniu', body: graphResult.error }];
    }
    const blocks = [];
    const rootsStr = graphResult.roots.length > 0
      ? graphResult.roots.map((r) => r.toFixed(3)).join(', ')
      : 'brak w tym zakresie (albo krotność parzysta, której ta metoda nie wykrywa)';
    blocks.push({
      title: `f(x) = ${graphExpr}${graphResult.derivStr ? `, f′(x) = ${graphResult.derivStr}` : ''}`,
      body: `Pierwiastki (f(x)=0) na [${xMin}, ${xMax}]: ${rootsStr}. Pochodna pokazana na wykresie (linia przerywana) jest DOKŁADNYM wynikiem symbolicznego różniczkowania — nie przybliżeniem numerycznym.`,
    });
    if (graphResult.steps.length > 0) {
      blocks.push({
        title: `Różniczkowanie krok po kroku (${graphResult.steps.length} ${graphResult.steps.length === 1 ? 'krok' : 'kroków'})`,
        body: graphResult.steps.map((s, i) => `${i + 1}. ${s.rule}\n   ${s.before} → ${s.after}`).join('\n'),
      });
    }
    if (showIntegral && graphResult.integral !== null) {
      blocks.push({
        title: `∫ f(x) dx na [${Math.min(integralA, integralB)}, ${Math.max(integralA, integralB)}] ≈ ${graphResult.integral.toFixed(4)}`,
        body: 'Wartość policzona metodą Simpsona (kwadratura numeryczna, dokładna dla wielomianów stopnia ≤3) — pole zacieniowane na wykresie to ta właśnie wielkość. To NIE symboliczna funkcja pierwotna (całkowanie symboliczne w ogólności nie ma rozwiązania w postaci zamkniętej — dlatego ta piaskownica świadomie go nie próbuje).',
      });
    }
    return blocks;
  }, [graphResult, graphExpr, xMin, xMax, showIntegral, integralA, integralB]);

  const odeBlocks = useMemo(() => {
    if (!odeResult) return [];
    if (odeResult.error) return [{ title: 'Błąd w wyrażeniu', body: odeResult.error }];
    return [
      {
        title: `dy/dx = ${odeExpr}, y(${odeX0}) = ${odeY0} → y(${odeXEnd}) ≈ ${odeResult.finalY !== null ? odeResult.finalY.toFixed(4) : '—'}`,
        body: 'Szare odcinki to pole kierunkowe: w każdym punkcie siatki pokazują nachylenie dy/dx, jakie MIAŁABY dowolna krzywa przechodząca przez ten punkt — niezależnie od warunku początkowego. Zielona krzywa to jedno konkretne rozwiązanie (z podanego punktu startowego), scałkowane metodą Runge–Kutty 4. rzędu z krokiem dostosowanym do zakresu.',
      },
    ];
  }, [odeResult, odeExpr, odeX0, odeY0, odeXEnd]);

  const surfaceBlocks = useMemo(() => {
    if (surfaceParseError) return [{ title: 'Błąd w wyrażeniu', body: surfaceParseError }];
    if (!surfaceStats.valid) return [];
    return [
      {
        title: `z = ${surfaceExpr}, zakres na siatce: [${surfaceStats.zMin.toFixed(3)}, ${surfaceStats.zMax.toFixed(3)}]`,
        body: 'Każdy wierzchołek to f(x,y) policzone bezpośrednio z bezpiecznego parsera — nie interpolacja z rzadkiej siatki. Wysokość na ekranie jest przeskalowana do stałego zakresu (patrz etykieta uczciwości), więc porównuj KSZTAŁT powierzchni (siodła, doliny, grzbiety), nie bezwzględną wysokość w pikselach.',
      },
      {
        title: 'Punkty siodłowe i ekstrema',
        body: 'Miejsca, gdzie powierzchnia jest lokalnie najwyższa (grzbiet we wszystkich kierunkach) lub najniższa, to ekstrema — dokładny odpowiednik pierwiastków pochodnej w jednej zmiennej, tylko teraz gradient (∂f/∂x, ∂f/∂y) musi zerować się w OBU kierunkach naraz. Punkty siodłowe (jak przy z=x²−y²) są lokalnym maksimum w jednym kierunku i minimum w drugim — to zjawisko, które płaski wykres 1D nie ma jak pokazać.',
      },
    ];
  }, [surfaceParseError, surfaceStats, surfaceExpr]);

  const blocks = mode === 'graph' ? graphBlocks : mode === 'ode' ? odeBlocks : surfaceBlocks;
  const params: Record<string, string | number | boolean> = mode === 'graph'
    ? { expression: graphExpr, xMin, xMax, integralA: showIntegral ? integralA : 0, integralB: showIntegral ? integralB : 0 }
    : mode === 'ode'
      ? { expression: odeExpr, x0: odeX0, y0: odeY0, xEnd: odeXEnd }
      : { expression: surfaceExpr, xMin: surfXMin, xMax: surfXMax, yMin: surfYMin, yMax: surfYMax };
  const stats: Record<string, number> = mode === 'graph'
    ? { roots: graphResult?.roots.length ?? 0, integral: graphResult?.integral ?? 0 }
    : mode === 'ode'
      ? { finalY: odeResult?.finalY ?? 0 }
      : { zMin: surfaceStats.zMin, zMax: surfaceStats.zMax };
  const expLabel = mode === 'graph' ? 'Wykres i pochodna' : mode === 'ode' ? 'Równanie różniczkowe' : 'Powierzchnia z=f(x,y)';

  return (
    <div className="lab-view math-lab" style={{ ['--accent' as string]: lab.accent }}>
      <div className="exp-tabs" role="tablist" aria-label="Tryb">
        <button role="tab" aria-selected={mode === 'graph'} onClick={() => setMode('graph')}>
          Wykres, pochodna, całka
        </button>
        <button role="tab" aria-selected={mode === 'ode'} onClick={() => setMode('ode')}>
          Równania różniczkowe
        </button>
        <button role="tab" aria-selected={mode === 'surface'} onClick={() => setMode('surface')}>
          Powierzchnia z=f(x,y) (3D)
        </button>
      </div>

      {mode === 'graph' && (
        <>
          <div className="sim-stage" style={{ height: '38vh', minHeight: 240 }}>
            <canvas ref={graphCanvasRef} role="img" aria-label={`Wykres funkcji ${graphExpr} i jej pochodnej.`} />
          </div>
          <HonestyBadge level="exact" note={graphHonesty} />
          <div className="controls">
            <div className="control">
              <label>f(x) =</label>
              <input
                type="text"
                className="math-input"
                value={graphExpr}
                maxLength={200}
                spellCheck={false}
                placeholder="np. sin(x)*x^2"
                onChange={(e) => setGraphExpr(e.target.value)}
              />
            </div>
            <div className="math-preset-row">
              {GRAPH_PRESETS.map((p) => (
                <button key={p} className="chip-btn" onClick={() => setGraphExpr(p)}>{p}</button>
              ))}
            </div>
            <div className="math-range-row">
              <div className="control">
                <label>x min</label>
                <input type="number" className="math-input" value={xMin} onChange={(e) => setXMin(Number(e.target.value))} />
              </div>
              <div className="control">
                <label>x max</label>
                <input type="number" className="math-input" value={xMax} onChange={(e) => setXMax(Number(e.target.value))} />
              </div>
            </div>
            <div className="control toggle-row">
              <span>Pokaż całkę oznaczoną (metoda Simpsona)</span>
              <button
                className="switch"
                role="switch"
                aria-checked={showIntegral}
                aria-label="Pokaż całkę oznaczoną"
                onClick={() => setShowIntegral((v) => !v)}
              />
            </div>
            {showIntegral && (
              <div className="math-range-row">
                <div className="control">
                  <label>a</label>
                  <input type="number" className="math-input" value={integralA} onChange={(e) => setIntegralA(Number(e.target.value))} />
                </div>
                <div className="control">
                  <label>b</label>
                  <input type="number" className="math-input" value={integralB} onChange={(e) => setIntegralB(Number(e.target.value))} />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {mode === 'ode' && (
        <>
          <div className="sim-stage" style={{ height: '38vh', minHeight: 240 }}>
            <canvas ref={odeCanvasRef} role="img" aria-label={`Pole kierunkowe i rozwiązanie równania różniczkowego dy/dx = ${odeExpr}.`} />
          </div>
          <HonestyBadge level="simplified" note={odeHonesty} />
          <div className="controls">
            <div className="control">
              <label>dy/dx = f(x, y) =</label>
              <input
                type="text"
                className="math-input"
                value={odeExpr}
                maxLength={200}
                spellCheck={false}
                placeholder="np. y - y^2"
                onChange={(e) => setOdeExpr(e.target.value)}
              />
            </div>
            <div className="math-preset-row">
              {ODE_PRESETS.map((p) => (
                <button key={p} className="chip-btn" onClick={() => setOdeExpr(p)}>{p}</button>
              ))}
            </div>
            <div className="math-range-row">
              <div className="control">
                <label>x₀</label>
                <input type="number" className="math-input" value={odeX0} onChange={(e) => setOdeX0(Number(e.target.value))} />
              </div>
              <div className="control">
                <label>y(x₀)</label>
                <input type="number" className="math-input" value={odeY0} onChange={(e) => setOdeY0(Number(e.target.value))} />
              </div>
              <div className="control">
                <label>x koniec</label>
                <input type="number" className="math-input" value={odeXEnd} onChange={(e) => setOdeXEnd(Number(e.target.value))} />
              </div>
            </div>
          </div>
        </>
      )}

      {mode === 'surface' && (
        <>
          <div className="sim-stage stage-3d" style={{ height: '38vh', minHeight: 240 }}>
            <canvas
              ref={surfaceCanvasRef}
              role="img"
              aria-label={`Powierzchnia 3D funkcji z = ${surfaceExpr}. Przeciągnij, by obrócić kamerę.`}
            />
            {!surfaceFailed && (
              <div className="stage-3d-badge">
                <span className="mdot" aria-hidden="true" /> {surfaceLoading ? 'ŁADOWANIE SILNIKA 3D…' : '3D · WEBGL'}
              </div>
            )}
            {!surfaceLoading && !surfaceFailed && <div className="stage-3d-hint">przeciągnij / scrolluj</div>}
            {surfaceFailed && (
              <div className="empty-state" style={{ position: 'absolute', inset: '1rem', margin: 0 }}>
                Nie udało się uruchomić silnika 3D w tej przeglądarce (WebGL niedostępny lub zablokowany). Przełącz na
                zakładkę „Wykres, pochodna, całka" dla wykresów jednej zmiennej.
              </div>
            )}
          </div>
          <HonestyBadge level="exact" note={surfaceHonesty} />
          <div className="controls">
            <div className="control">
              <label>z(x, y) =</label>
              <input
                type="text"
                className="math-input"
                value={surfaceExpr}
                maxLength={200}
                spellCheck={false}
                placeholder="np. sin(x)*cos(y)"
                onChange={(e) => setSurfaceExpr(e.target.value)}
              />
            </div>
            <div className="math-preset-row">
              {SURFACE_PRESETS.map((p) => (
                <button key={p} className="chip-btn" onClick={() => setSurfaceExpr(p)}>{p}</button>
              ))}
            </div>
            <div className="math-range-row">
              <div className="control">
                <label>x min</label>
                <input type="number" className="math-input" value={surfXMin} onChange={(e) => setSurfXMin(Number(e.target.value))} />
              </div>
              <div className="control">
                <label>x max</label>
                <input type="number" className="math-input" value={surfXMax} onChange={(e) => setSurfXMax(Number(e.target.value))} />
              </div>
            </div>
            <div className="math-range-row">
              <div className="control">
                <label>y min</label>
                <input type="number" className="math-input" value={surfYMin} onChange={(e) => setSurfYMin(Number(e.target.value))} />
              </div>
              <div className="control">
                <label>y max</label>
                <input type="number" className="math-input" value={surfYMax} onChange={(e) => setSurfYMax(Number(e.target.value))} />
              </div>
            </div>
          </div>
        </>
      )}

      <NarratorPanel
        blocks={blocks}
        askContext={buildContext(
          { id: lab.id, name: lab.name, honesty: lab.honesty, honestyNote: lab.honestyNote },
          expLabel,
          params,
          stats,
          blocks,
        )}
      />
    </div>
  );
}

export const mathematicsLab: LabDefinition = {
  id: 'mathematics',
  name: 'Mathematics Lab',
  tagline: 'Wykresy, pochodne, całki, równania różniczkowe',
  icon: '📐',
  accent: '#fbbf24',
  honesty: 'exact',
  honestyNote:
    'Bezpieczny parser wyrażeń (tokenizer → AST → ewaluator z jawną białą listą funkcji) — zero eval()/Function(), wejście użytkownika nigdy nie jest wykonywane jako kod. Różniczkowanie jest dokładne symbolicznie (standardowe reguły rachunku różniczkowego). Całkowanie (metoda Simpsona) i rozwiązania równań różniczkowych (RK4) są numeryczne, nie symboliczne — jawnie oznaczone w każdym trybie.',
  params: [],
  narrate: () => [],
  CustomView: MathLabView,
};
