import type { VisualSimulation, SimAgent } from '../simulation/types';
import { drawAgent, lodFor } from './agentVisual';
import { worldToScreen, type Transform } from './camera';
import { heatColor, type AnalysisField } from '../simulation/analysis';

/**
 * SIMULATION RENDERER — rysuje ŻYWY ŚWIAT na Canvas przez transformację kamery
 * (zoom/pan/follow). Czyta wyłącznie stan silnika. Agenci rysowani jako LUDZIE
 * (AgentVisual) z LOD zależnym od zoomu — nie kropki. Renderer nic nie liczy o
 * modelu; jest oknem na świat.
 */

const BUILDING_STYLE: Record<string, { fill: string; stroke: string }> = {
  home: { fill: 'rgba(90,120,170,0.18)', stroke: 'rgba(150,180,220,0.55)' },
  shop: { fill: 'rgba(232,179,74,0.18)', stroke: 'rgba(232,179,74,0.75)' },
  school: { fill: 'rgba(120,200,255,0.16)', stroke: 'rgba(120,200,255,0.75)' },
  hospital: { fill: 'rgba(240,85,85,0.16)', stroke: 'rgba(240,85,85,0.85)' },
  isolation: { fill: 'rgba(150,150,160,0.14)', stroke: 'rgba(200,200,210,0.6)' },
  park: { fill: 'rgba(84,217,140,0.16)', stroke: 'rgba(84,217,140,0.6)' },
};

const BUILDING_ICON: Record<string, string> = {
  home: '🏠', shop: '🛒', school: '🏫', hospital: '🏥', isolation: '🚧', park: '🌳',
};

export interface RenderOptions {
  transform: Transform;
  debug?: boolean;
  focusId?: number;
  contactRadius?: number;
  /** Warstwa analizy (heatmapa gęstość/ryzyko/odporność) rysowana pod agentami. */
  analysis?: AnalysisField | null;
}

export function renderCity(ctx: CanvasRenderingContext2D, sim: VisualSimulation, w: number, h: number, opts: RenderOptions): void {
  const t = opts.transform;
  ctx.fillStyle = '#0a0f16';
  ctx.fillRect(0, 0, w, h);

  // Ulice (opcjonalne pole na obiekcie symulacji).
  const withStreets = sim as { streets?: { h: number[]; v: number[] } };
  if (withStreets.streets) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = Math.max(4, 12 * t.scale);
    ctx.beginPath();
    for (const y of withStreets.streets.h) { const p = worldToScreen(t, 0, y), q = worldToScreen(t, sim.worldWidth, y); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
    for (const x of withStreets.streets.v) { const p = worldToScreen(t, x, 0), q = worldToScreen(t, x, sim.worldHeight); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
    ctx.stroke();
  }

  // Budynki.
  ctx.font = `${Math.round(Math.max(10, 12))}px ui-monospace, monospace`;
  for (const b of sim.objects()) {
    const st = BUILDING_STYLE[b.kind] ?? { fill: 'rgba(255,255,255,0.06)', stroke: 'rgba(255,255,255,0.25)' };
    const tl = worldToScreen(t, b.x, b.y);
    const bw = b.w * t.scale, bh = b.h * t.scale;
    ctx.fillStyle = b.closed ? 'rgba(120,120,120,0.10)' : st.fill;
    ctx.strokeStyle = b.closed ? 'rgba(160,160,160,0.35)' : st.stroke;
    ctx.lineWidth = 1.2;
    roundRect(ctx, tl.x, tl.y, bw, bh, Math.min(8, bw * 0.12));
    ctx.fill(); ctx.stroke();
    if (b.label && bw > 40) {
      ctx.fillStyle = b.closed ? 'rgba(200,200,200,0.5)' : 'rgba(235,240,250,0.82)';
      ctx.fillText(`${BUILDING_ICON[b.kind] ?? ''} ${b.closed ? b.label + ' (zamk.)' : b.label}`, tl.x + 5, tl.y + 15);
    }
  }

  // Warstwa analizy (pod agentami) — heatmapa wprost ze stanu modelu.
  if (opts.analysis && opts.analysis.mode !== 'none') drawAnalysis(ctx, opts.analysis, t, sim.worldWidth, sim.worldHeight);

  const agents = sim.agents();
  // Rozmiar sylwetki: bazowa wysokość świata × skala kamery.
  const sizePx = Math.max(3, 13 * t.scale);
  const lod = lodFor(sizePx);

  // Iskry transmisji (S→E w tym ticku) — konkretne zdarzenie na scenie.
  for (const ev of sim.lastTransmissions()) {
    const p = worldToScreen(t, ev.x, ev.y);
    ctx.strokeStyle = 'rgba(240,85,85,0.95)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y - sizePx * 0.4, sizePx * 1.6, 0, Math.PI * 2); ctx.stroke();
  }

  // Agenci jako ludzie.
  for (const a of agents) {
    const p = worldToScreen(t, a.x, a.y);
    if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) continue; // culling
    drawAgent(ctx, p.x, p.y + sizePx * 0.4, sizePx, a, sim.stateColors[a.state] ?? '#ccc');
  }

  if (opts.debug) drawDebug(ctx, sim, agents, t, opts, sizePx);
  void lod;
}

function drawAnalysis(ctx: CanvasRenderingContext2D, f: AnalysisField, t: Transform, worldW: number, worldH: number): void {
  const cw = worldW / f.cols, ch = worldH / f.rows;
  for (let cy = 0; cy < f.rows; cy++) {
    for (let cx = 0; cx < f.cols; cx++) {
      const v = f.values[cy * f.cols + cx];
      if (v <= 0.02) continue;
      const [r, g, b] = heatColor(v);
      ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${0.12 + v * 0.4})`;
      const p = worldToScreen(t, cx * cw, cy * ch);
      ctx.fillRect(p.x, p.y, cw * t.scale + 1, ch * t.scale + 1);
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawDebug(
  ctx: CanvasRenderingContext2D, sim: VisualSimulation, agents: readonly SimAgent[],
  t: Transform, opts: RenderOptions, sizePx: number,
): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 0.6;
  for (let i = 0; i < agents.length; i += Math.max(1, Math.floor(agents.length / 60))) {
    const a = agents[i];
    const p = worldToScreen(t, a.x, a.y), g = worldToScreen(t, a.goalX, a.goalY);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(g.x, g.y); ctx.stroke();
  }
  if (opts.contactRadius && opts.contactRadius > 0) {
    ctx.strokeStyle = 'rgba(240,85,85,0.22)'; ctx.lineWidth = 0.6;
    for (const a of agents) {
      if (a.state !== 'I' || a.isolated) continue;
      const p = worldToScreen(t, a.x, a.y);
      ctx.beginPath(); ctx.arc(p.x, p.y, opts.contactRadius * t.scale, 0, Math.PI * 2); ctx.stroke();
    }
  }
  const fid = opts.focusId ?? -1;
  if (fid >= 0) {
    const info = sim.debugInfo(fid);
    const a = agents.find((x) => x.id === fid);
    if (info && a) {
      const p = worldToScreen(t, a.x, a.y);
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y - sizePx * 0.4, sizePx * 1.1, 0, Math.PI * 2); ctx.stroke();
      const srcId = Number(info.zarazony_przez);
      if (srcId >= 0) {
        const src = agents.find((x) => x.id === srcId);
        if (src) {
          const q = worldToScreen(t, src.x, src.y);
          ctx.strokeStyle = 'rgba(255,209,102,0.75)'; ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.setLineDash([]);
        }
      }
    }
  }
}
