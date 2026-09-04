import type { Sim, SimParams } from '../../core/types';

/**
 * Diagram architektury warstwy AI — NIE fizyka, więc świadomie NIE jest to
 * scena 3D (podobnie jak diagram Minkowskiego w Space-Time Lab: to, co jest
 * diagramem systemu/danych, powinno zostać diagramem, nie udawać zjawiska
 * przestrzennego). Węzły i przepływy odpowiadają dosłownie prawdziwej
 * architekturze opisanej w tekście Q&A tego laboratorium: silnik
 * deterministyczny liczy się na urządzeniu co klatkę w KAŻDYM laboratorium
 * (dlatego ścieżka "silnik deterministyczny" pulsuje i przesyła cząstki
 * ZAWSZE — to nie ozdoba, to dosłownie prawda o każdej klatce Genesis OS),
 * a ścieżka modelu językowego ożywa (przesyła cząstki, jaśnieje) TYLKO gdy
 * `aiStatus` przekazany z żywego zapytania GET /api/health faktycznie
 * mówi "ready" — jeśli backend nie ma klucza, ta ścieżka zostaje wyraźnie
 * przygaszona, żeby nie sugerować aktywności, której nie ma.
 */

interface NodeDef { x: number; y: number; w: number; h: number; label: string; sub?: string }

const DET_NODES: NodeDef[] = [
  { x: 0.06, y: 0.28, w: 0.24, h: 0.14, label: 'Symulacja', sub: 'parametry + statystyki' },
  { x: 0.38, y: 0.24, w: 0.24, h: 0.22, label: 'Silnik deterministyczny', sub: 'Twoje urządzenie · co klatkę' },
  { x: 0.70, y: 0.28, w: 0.24, h: 0.14, label: 'Bloki narracji', sub: 'γ, R_s, aktywność…' },
];

const LLM_NODES: NodeDef[] = [
  { x: 0.02, y: 0.66, w: 0.20, h: 0.13, label: 'Twoje pytanie', sub: '„Zapytaj AI"' },
  { x: 0.27, y: 0.66, w: 0.16, h: 0.13, label: 'Backend' },
  { x: 0.48, y: 0.66, w: 0.22, h: 0.13, label: 'Model językowy', sub: 'wymaga klucza API' },
  { x: 0.75, y: 0.66, w: 0.20, h: 0.13, label: 'Odpowiedź' },
];

function edgesOf(nodes: NodeDef[]): [NodeDef, NodeDef][] {
  const pairs: [NodeDef, NodeDef][] = [];
  for (let i = 0; i < nodes.length - 1; i++) pairs.push([nodes[i], nodes[i + 1]]);
  return pairs;
}

function nodeCenter(n: NodeDef, w: number, h: number): { x: number; y: number } {
  return { x: (n.x + n.w / 2) * w, y: (n.y + n.h / 2) * h };
}

function nodeRight(n: NodeDef, w: number, h: number): { x: number; y: number } {
  return { x: (n.x + n.w) * w, y: (n.y + n.h / 2) * h };
}

function nodeLeft(n: NodeDef, w: number, h: number): { x: number; y: number } {
  return { x: n.x * w, y: (n.y + n.h / 2) * h };
}

export class NarratorArchitectureSim implements Sim {
  private t = 0;
  private aiStatus: string = 'checking';

  init() {}

  update(dt: number, p: SimParams) {
    this.t += dt;
    this.aiStatus = String(p.aiStatus ?? 'checking');
  }

  /** Zmniejsza rozmiar fontu, aż tekst mieści się w dostępnej szerokości — bez tego wąskie kolumny na telefonie nakładają etykiety sąsiednich węzłów. */
  private fitFontSize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, family: string, startPx: number, minPx: number): number {
    let size = startPx;
    while (size > minPx) {
      ctx.font = `${family.includes('600') ? '600 ' : ''}${size}px ${family}`;
      if (ctx.measureText(text).width <= maxWidth) break;
      size -= 1;
    }
    return size;
  }

  private drawNode(ctx: CanvasRenderingContext2D, n: NodeDef, w: number, h: number, color: string, dim: boolean) {
    const x = n.x * w;
    const y = n.y * h;
    const nw = n.w * w;
    const nh = n.h * h;
    ctx.fillStyle = dim ? 'rgba(141,151,180,0.06)' : `${color}1a`;
    ctx.strokeStyle = dim ? 'rgba(141,151,180,0.35)' : color;
    ctx.lineWidth = 1.4;
    const r = 8;
    ctx.beginPath();
    ctx.roundRect(x, y, nw, nh, r);
    ctx.fill();
    ctx.stroke();
    const pad = nw * 0.12;
    const maxTextW = Math.max(10, nw - pad * 2);
    ctx.textAlign = 'center';
    const labelSize = this.fitFontSize(ctx, n.label, maxTextW, '600 system-ui', 12, 7);
    ctx.fillStyle = dim ? 'rgba(230,234,245,0.5)' : 'rgba(230,234,245,0.95)';
    ctx.font = `600 ${labelSize}px system-ui`;
    ctx.fillText(n.label, x + nw / 2, y + nh / 2 + (n.sub ? -3 : 4));
    if (n.sub) {
      const subSize = this.fitFontSize(ctx, n.sub, maxTextW, 'ui-monospace, monospace', 10, 6);
      ctx.fillStyle = dim ? 'rgba(141,151,180,0.55)' : 'rgba(230,234,245,0.6)';
      ctx.font = `${subSize}px ui-monospace, monospace`;
      ctx.fillText(n.sub, x + nw / 2, y + nh / 2 + 13);
    }
    ctx.textAlign = 'left';
  }

  private drawEdgeWithParticles(
    ctx: CanvasRenderingContext2D, a: NodeDef, b: NodeDef, w: number, h: number,
    color: string, active: boolean, speed: number, phase: number,
  ) {
    const p1 = nodeRight(a, w, h);
    const p2 = nodeLeft(b, w, h);
    ctx.strokeStyle = active ? `${color}66` : 'rgba(141,151,180,0.25)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    if (!active) return;
    const nParticles = 3;
    for (let i = 0; i < nParticles; i++) {
      const frac = ((this.t * speed + phase + i / nParticles) % 1 + 1) % 1;
      const px = p1.x + (p2.x - p1.x) * frac;
      const py = p1.y + (p2.y - p1.y) * frac;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(px, py, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const bgGrad = ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, Math.max(w, h) * 0.8);
    bgGrad.addColorStop(0, '#080a16');
    bgGrad.addColorStop(1, '#02030a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Ścieżka deterministyczna: zawsze aktywna, bo dosłownie liczy się co klatkę w każdym laboratorium.
    const detColor = '#6ee7a0';
    for (const [a, b] of edgesOf(DET_NODES)) {
      this.drawEdgeWithParticles(ctx, a, b, w, h, detColor, true, 0.35, 0);
    }
    const pulse = 0.85 + 0.15 * Math.sin(this.t * 2.4);
    for (const n of DET_NODES) this.drawNode(ctx, n, w, h, detColor, false);
    // Delikatna poświata wokół silnika (środkowy węzeł) skalowana pulsem — sygnalizuje "żywy" proces.
    const engine = DET_NODES[1];
    const c = nodeCenter(engine, w, h);
    ctx.fillStyle = `rgba(110,231,160,${0.05 * pulse})`;
    ctx.beginPath();
    ctx.arc(c.x, c.y, engine.w * w * 0.55 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Ścieżka modelu językowego: aktywna WYŁĄCZNIE gdy aiStatus === 'ready' (żywy status z /api/health).
    const llmActive = this.aiStatus === 'ready';
    const llmColor = '#5cd6e8';
    for (const [a, b] of edgesOf(LLM_NODES)) {
      this.drawEdgeWithParticles(ctx, a, b, w, h, llmColor, llmActive, 0.5, 0.3);
    }
    for (const n of LLM_NODES) this.drawNode(ctx, n, w, h, llmColor, !llmActive);

    ctx.fillStyle = 'rgba(230,234,245,0.55)';
    ctx.font = '10px ui-monospace, monospace';
    const statusText =
      this.aiStatus === 'ready' ? 'model językowy: ✓ połączony (na żywo z GET /api/health)'
        : this.aiStatus === 'checking' ? 'sprawdzanie stanu backendu…'
          : this.aiStatus === 'no-key' ? 'model językowy: brak klucza API — ścieżka nieaktywna'
            : 'model językowy: backend nieosiągalny — ścieżka nieaktywna';
    ctx.fillText(statusText, w * 0.02, h * 0.90);
    ctx.fillStyle = 'rgba(110,231,160,0.85)';
    ctx.fillText('silnik deterministyczny: zawsze aktywny (liczy się na Twoim urządzeniu co klatkę)', w * 0.02, h * 0.965);
  }

  getStats() {
    return { llmActive: this.aiStatus === 'ready' ? 1 : 0 };
  }
}
