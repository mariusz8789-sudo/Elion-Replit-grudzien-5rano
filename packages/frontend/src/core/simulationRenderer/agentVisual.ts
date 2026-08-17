import type { SimAgent } from '../simulation/types';

/**
 * AGENT VISUAL — reużywalny system rysowania AGENTA jako CZŁOWIEKA (nie kropki).
 *
 * Ściśle oddzielony od modelu: dostaje tylko SimAgent (stan, prędkość, faza
 * chodu, zachowanie) i rysuje avatar. Zasada „MODEL STATE → VISUAL STATE":
 *  - ruch (|v|>0) → animowany chód (nogi/ręce z fazy `gait` liczonej z dystansu),
 *  - postój → poza bezczynna zależna DETERMINISTYCZNIE od id (stoi/telefon/rozmowa),
 *  - kolor = stan epidemiologiczny, obwódka = izolacja, krzyż = szpital.
 * Żadnej losowej choreografii per-klatkę.
 *
 * LOD: przy małym rozmiarze na ekranie rysujemy kropkę/uproszczenie, przy dużym
 * pełną sylwetkę — architektura gotowa pod skalowanie do dziesiątek tys. agentów.
 */

export type Lod = 'low' | 'medium' | 'high';

export function lodFor(sizePx: number): Lod {
  if (sizePx < 7) return 'low';
  if (sizePx < 15) return 'medium';
  return 'high';
}

/** Deterministyczna „aktywność bezczynna" z id agenta (nie losowa co klatkę). */
function idleActivity(id: number): 'stand' | 'phone' | 'talk' {
  const m = id % 3;
  return m === 0 ? 'stand' : m === 1 ? 'phone' : 'talk';
}

/**
 * Rysuje agenta na pozycji ekranowej (x,y = stopy), o wysokości `sizePx`.
 * `color` pochodzi ze stanu modelu. `t` to czas [s] tylko dla subtelnego bujania
 * (nie zmienia logiki — pełna animacja chodu i tak wynika z fazy `gait`).
 */
export function drawAgent(ctx: CanvasRenderingContext2D, x: number, y: number, sizePx: number, a: SimAgent, color: string): void {
  const lod = lodFor(sizePx);
  if (lod === 'low') {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y - sizePx * 0.4, Math.max(1.2, sizePx * 0.45), 0, Math.PI * 2); ctx.fill();
    if (a.hospitalized) drawCross(ctx, x, y - sizePx * 0.4, sizePx * 0.5);
    return;
  }

  const moving = Math.hypot(a.vx, a.vy) > 1e-3;
  const h = sizePx;                 // wysokość sylwetki
  const headR = h * 0.16;
  const hipY = y - h * 0.42;        // biodra
  const shoulderY = y - h * 0.72;   // barki
  const headY = y - h * 0.84;
  const dir = moving ? Math.sign(a.vx || 0.0001) : 1; // zwrot twarzy z ruchu

  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, h * 0.10);

  // Nogi — chód z fazy `gait` (amplituda tylko gdy się rusza).
  const swing = moving ? Math.sin(a.gait ?? 0) * h * 0.18 : 0;
  ctx.beginPath();
  ctx.moveTo(x, hipY); ctx.lineTo(x + swing, y);
  ctx.moveTo(x, hipY); ctx.lineTo(x - swing, y);
  ctx.stroke();

  // Tułów.
  ctx.beginPath(); ctx.moveTo(x, hipY); ctx.lineTo(x, shoulderY); ctx.stroke();

  // Ręce — zależne od zachowania (poza chodem: telefon/rozmowa).
  const activity = moving ? 'walk' : idleActivity(a.id);
  const armSwing = moving ? Math.cos(a.gait ?? 0) * h * 0.14 : 0;
  ctx.beginPath();
  if (activity === 'phone') {
    // Jedna ręka zgięta do „telefonu" przy głowie.
    ctx.moveTo(x, shoulderY); ctx.lineTo(x + dir * h * 0.12, headY + headR * 0.6);
    ctx.moveTo(x, shoulderY); ctx.lineTo(x - dir * h * 0.14, shoulderY + h * 0.18);
  } else if (activity === 'talk') {
    // Ręce lekko rozłożone (gestykulacja).
    ctx.moveTo(x, shoulderY); ctx.lineTo(x + h * 0.16, shoulderY + h * 0.10);
    ctx.moveTo(x, shoulderY); ctx.lineTo(x - h * 0.16, shoulderY + h * 0.10);
  } else {
    ctx.moveTo(x, shoulderY); ctx.lineTo(x + armSwing, shoulderY + h * 0.20);
    ctx.moveTo(x, shoulderY); ctx.lineTo(x - armSwing, shoulderY + h * 0.20);
  }
  ctx.stroke();

  // Głowa.
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, headY, headR, 0, Math.PI * 2); ctx.fill();

  if (lod === 'high') {
    if (activity === 'phone') {
      ctx.fillStyle = '#cfe3ff';
      ctx.fillRect(x + dir * h * 0.10, headY + headR * 0.2, h * 0.08, h * 0.12);
    } else if (activity === 'talk') {
      ctx.fillStyle = 'rgba(230,240,255,0.85)';
      ctx.beginPath(); ctx.arc(x + h * 0.22, headY - h * 0.02, h * 0.06, 0, Math.PI * 2); ctx.fill();
    }
  }

  if (a.isolated && !a.hospitalized) {
    ctx.strokeStyle = 'rgba(235,235,235,0.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y - h * 0.42, h * 0.6, 0, Math.PI * 2); ctx.stroke();
  }
  if (a.hospitalized) drawCross(ctx, x, headY - headR * 1.6, h * 0.4);
}

function drawCross(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = Math.max(1, s * 0.25);
  ctx.beginPath();
  ctx.moveTo(x - s * 0.4, y); ctx.lineTo(x + s * 0.4, y);
  ctx.moveTo(x, y - s * 0.4); ctx.lineTo(x, y + s * 0.4);
  ctx.stroke();
}
