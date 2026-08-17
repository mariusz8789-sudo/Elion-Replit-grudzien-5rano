import type { VisualSimulation, SimAgent } from '../simulation/types';

/**
 * SIMULATION RENDERER — rysuje ŻYWY ŚWIAT symulacji na Canvas (niezależnie od
 * cyklu renderu Reacta). Czyta wyłącznie stan silnika: budynki, agentów wg
 * stanu, iskry transmisji oraz — w trybie debug — cele, zasięgi kontaktu, ID i
 * źródło zakażenia. Renderer NIC nie liczy o modelu; jest tylko oknem na świat.
 */

const BUILDING_STYLE: Record<string, { fill: string; stroke: string }> = {
  home: { fill: 'rgba(90,120,170,0.16)', stroke: 'rgba(150,180,220,0.5)' },
  shop: { fill: 'rgba(232,179,74,0.16)', stroke: 'rgba(232,179,74,0.7)' },
  school: { fill: 'rgba(120,200,255,0.14)', stroke: 'rgba(120,200,255,0.7)' },
  hospital: { fill: 'rgba(90,162,255,0.16)', stroke: 'rgba(90,162,255,0.8)' },
  isolation: { fill: 'rgba(240,85,85,0.14)', stroke: 'rgba(240,85,85,0.7)' },
  park: { fill: 'rgba(84,217,140,0.12)', stroke: 'rgba(84,217,140,0.55)' },
};

export interface RenderOptions {
  debug?: boolean;
  /** ID agenta do szczegółowego podświetlenia w trybie debug (lub -1). */
  focusId?: number;
  contactRadius?: number;
}

export function renderCity(ctx: CanvasRenderingContext2D, sim: VisualSimulation, w: number, h: number, opts: RenderOptions = {}): void {
  const sx = w / sim.worldWidth, sy = h / sim.worldHeight;
  ctx.fillStyle = '#0a0f16';
  ctx.fillRect(0, 0, w, h);

  // Ulice (tło) — z opcjonalnego pola `streets` na obiekcie symulacji.
  const withStreets = sim as { streets?: { h: number[]; v: number[] } };
  if (withStreets.streets) {
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = Math.max(6, 10 * sy);
    ctx.beginPath();
    for (const y of withStreets.streets.h) { ctx.moveTo(0, y * sy); ctx.lineTo(w, y * sy); }
    for (const x of withStreets.streets.v) { ctx.moveTo(x * sx, 0); ctx.lineTo(x * sx, h); }
    ctx.stroke();
  }

  // Budynki.
  ctx.font = `${Math.round(11)}px ui-monospace, monospace`;
  for (const b of sim.objects()) {
    const st = BUILDING_STYLE[b.kind] ?? { fill: 'rgba(255,255,255,0.05)', stroke: 'rgba(255,255,255,0.2)' };
    ctx.fillStyle = b.closed ? 'rgba(120,120,120,0.10)' : st.fill;
    ctx.strokeStyle = b.closed ? 'rgba(160,160,160,0.35)' : st.stroke;
    ctx.lineWidth = 1;
    const x = b.x * sx, y = b.y * sy, bw = b.w * sx, bh = b.h * sy;
    ctx.fillRect(x, y, bw, bh);
    ctx.strokeRect(x, y, bw, bh);
    if (b.label) {
      ctx.fillStyle = b.closed ? 'rgba(200,200,200,0.5)' : 'rgba(235,240,250,0.75)';
      ctx.fillText(b.closed ? `${b.label} (zamk.)` : b.label, x + 4, y + 13);
    }
  }

  const agents = sim.agents();
  const r = Math.max(1.8, Math.min(3.4, 700 / Math.max(60, agents.length))) * Math.min(sx, sy) * 1.4;

  // Iskry transmisji (S→E w tym ticku) — pokazują KONKRETNE zdarzenie na scenie.
  for (const ev of sim.lastTransmissions()) {
    ctx.strokeStyle = 'rgba(240,85,85,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ev.x * sx, ev.y * sy, r * 2.4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Agenci wg stanu.
  for (const a of agents) {
    ctx.fillStyle = sim.stateColors[a.state] ?? '#ccc';
    ctx.beginPath();
    ctx.arc(a.x * sx, a.y * sy, a.state === 'I' ? r + 0.6 : r, 0, Math.PI * 2);
    ctx.fill();
    if (a.isolated) {
      ctx.strokeStyle = 'rgba(230,230,230,0.85)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(a.x * sx, a.y * sy, r + 2, 0, Math.PI * 2); ctx.stroke();
    }
  }

  if (opts.debug) drawDebug(ctx, sim, agents, sx, sy, opts);
}

function drawDebug(
  ctx: CanvasRenderingContext2D, sim: VisualSimulation, agents: readonly SimAgent[],
  sx: number, sy: number, opts: RenderOptions,
): void {
  // Cele + wektory prędkości dla próbki agentów (czytelność).
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.6;
  for (let i = 0; i < agents.length; i += Math.max(1, Math.floor(agents.length / 60))) {
    const a = agents[i];
    ctx.beginPath(); ctx.moveTo(a.x * sx, a.y * sy); ctx.lineTo(a.goalX * sx, a.goalY * sy); ctx.stroke();
  }
  // Zasięg kontaktu wokół zakażonych.
  if (opts.contactRadius && opts.contactRadius > 0) {
    ctx.strokeStyle = 'rgba(240,85,85,0.25)'; ctx.lineWidth = 0.6;
    for (const a of agents) {
      if (a.state !== 'I' || a.isolated) continue;
      ctx.beginPath(); ctx.arc(a.x * sx, a.y * sy, opts.contactRadius * sx, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // Skupienie na jednym agencie: ID, stan, źródło zakażenia.
  const fid = opts.focusId ?? -1;
  if (fid >= 0) {
    const info = sim.debugInfo(fid);
    const a = agents.find((x) => x.id === fid);
    if (info && a) {
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(a.x * sx, a.y * sy, 8, 0, Math.PI * 2); ctx.stroke();
      // linia do źródła zakażenia
      const srcId = Number(info.zarazony_przez);
      if (srcId >= 0) {
        const src = agents.find((x) => x.id === srcId);
        if (src) {
          ctx.strokeStyle = 'rgba(255,209,102,0.7)'; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(a.x * sx, a.y * sy); ctx.lineTo(src.x * sx, src.y * sy); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  }
}
