import type { ExperimentDef, Sim, SimParams } from '../../core/types';

/**
 * Diagram Minkowskiego — stożki świetlne i względność równoczesności.
 * Dokładna transformacja Lorentza: x' = γ(x − βct), ct' = γ(ct − βx).
 * Dwa zdarzenia rozdzielone przestrzennie zmieniają kolejność czasową
 * w zależności od obserwatora — i to jest fizycznie dozwolone, bo nie
 * łączy ich żaden sygnał (interwał przestrzennopodobny).
 */

const MINKOWSKI_EVENTS = [
  { x: -0.55, ct: 0.12, name: 'A', color: '#6ee7a0' },
  { x: 0.62, ct: 0.2, name: 'B', color: '#f47c7c' },
] as const;

function minkowskiObservables(beta: number) {
  const gamma = 1 / Math.sqrt(1 - beta * beta);
  const tA = gamma * (MINKOWSKI_EVENTS[0].ct - beta * MINKOWSKI_EVENTS[0].x);
  const tB = gamma * (MINKOWSKI_EVENTS[1].ct - beta * MINKOWSKI_EVENTS[1].x);
  return {
    beta,
    gamma,
    tA,
    tB,
    ordering: Math.abs(tA - tB) < 0.02 ? 'simultaneous' : tA < tB ? 'a-before-b' : 'b-before-a',
    intervalSquared: (MINKOWSKI_EVENTS[1].ct - MINKOWSKI_EVENTS[0].ct) ** 2 - (MINKOWSKI_EVENTS[1].x - MINKOWSKI_EVENTS[0].x) ** 2,
  } as const;
}

export function runMinkowskiScenario({ beta = 0 }: { beta?: number } = {}) {
  if (!Number.isFinite(beta) || beta < -0.9 || beta > 0.9) throw new Error('beta must be within [-0.9, 0.9].');
  return minkowskiObservables(beta);
}

class MinkowskiSim implements Sim {
  private beta = 0;

  init() {}

  update(_dt: number, p: SimParams) {
    this.beta = Number(p.v);
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const bgGrad = ctx.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, Math.max(w, h) * 0.8);
    bgGrad.addColorStop(0, '#080a16');
    bgGrad.addColorStop(1, '#02030a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h * 0.56;
    const S = Math.min(w, h) * 0.36;
    const beta = this.beta;
    const { tA, tB, ordering } = minkowskiObservables(beta);

    // stożek świetlny z początku układu
    ctx.fillStyle = 'rgba(240,179,92,0.07)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + S * 1.3, cy - S * 1.3);
    ctx.lineTo(cx - S * 1.3, cy - S * 1.3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,179,92,0.6)';
    ctx.setLineDash([4, 4]);
    for (const s of [1, -1]) {
      ctx.beginPath();
      ctx.moveTo(cx - S * 1.3 * s, cy + S * 1.3);
      ctx.lineTo(cx + S * 1.3 * s, cy - S * 1.3);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(240,179,92,0.75)';
    ctx.font = '10px system-ui';
    ctx.fillText('światło (45°)', cx + S * 0.75, cy - S * 0.85);
    ctx.fillText('PRZYSZŁOŚĆ', cx - 32, cy - S * 1.15);
    ctx.fillText('PRZESZŁOŚĆ', cx - 32, cy + S * 1.0);

    // osie nieruchomego obserwatora
    ctx.strokeStyle = 'rgba(141,151,180,0.7)';
    ctx.beginPath();
    ctx.moveTo(cx - S * 1.25, cy);
    ctx.lineTo(cx + S * 1.25, cy);
    ctx.moveTo(cx, cy + S * 1.1);
    ctx.lineTo(cx, cy - S * 1.25);
    ctx.stroke();
    ctx.fillStyle = 'rgba(141,151,180,0.9)';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('x', cx + S * 1.25 - 10, cy + 14);
    ctx.fillText('ct', cx + 6, cy - S * 1.25 + 12);

    // osie obserwatora w ruchu: oś ct' wzdłuż (β,1), oś x' wzdłuż (1,β)
    if (Math.abs(beta) > 0.001) {
      ctx.strokeStyle = '#5cd6e8';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx - S * 1.15 * beta, cy + S * 1.15);
      ctx.lineTo(cx + S * 1.15 * beta, cy - S * 1.15);
      ctx.moveTo(cx - S * 1.15, cy + S * 1.15 * beta);
      ctx.lineTo(cx + S * 1.15, cy - S * 1.15 * beta);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#5cd6e8';
      ctx.fillText("ct'", cx + S * 1.05 * beta + 8, cy - S * 1.1);
      ctx.fillText("x'", cx + S * 1.1 - 4, cy - S * 1.1 * beta - 8);
      // linie równoczesności obserwatora ruchomego (równoległe do x')
      ctx.strokeStyle = 'rgba(92,214,232,0.22)';
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        const oy = i * S * 0.33;
        ctx.beginPath();
        ctx.moveTo(cx - S * 1.15, cy - oy + S * 1.15 * beta);
        ctx.lineTo(cx + S * 1.15, cy - oy - S * 1.15 * beta);
        ctx.stroke();
      }
    }

    // dwa zdarzenia rozdzielone przestrzennie (A i B na osi x)
    for (const e of MINKOWSKI_EVENTS) {
      const px = cx + e.x * S;
      const py = cy - e.ct * S;
      ctx.fillStyle = e.color;
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = '600 12px ui-monospace, monospace';
      ctx.fillText(e.name, px + 9, py + 4);
    }
    // czasy zdarzeń w układzie ruchomym: ct' = γ(ct − βx)
    ctx.fillStyle = 'rgba(230,234,245,0.85)';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(`t'(A) = ${tA.toFixed(2)}   t'(B) = ${tB.toFixed(2)}`, 12, 20);
    ctx.fillStyle = tA > tB ? '#6ee7a0' : tB > tA ? '#f47c7c' : 'rgba(230,234,245,0.85)';
    ctx.fillText(
      ordering === 'simultaneous' ? 'A i B równoczesne' : ordering === 'a-before-b' ? 'najpierw A, potem B' : 'najpierw B, potem A',
      12, 37,
    );
  }

  getStats() {
    const gamma = 1 / Math.sqrt(1 - this.beta * this.beta);
    return { beta: Math.round(this.beta * 100) / 100, gamma: Math.round(gamma * 100) / 100 };
  }
}

export const spacetimeMinkowski: ExperimentDef = {
  id: 'minkowski',
  name: 'Stożki świetlne',
  honesty: 'exact',
  honestyNote:
    'Diagram Minkowskiego z dokładną transformacją Lorentza — osie, linie równoczesności i czasy zdarzeń liczone bez uproszczeń. Jednostki umowne (c = 1).',
  params: [
    {
      key: 'v', label: 'Prędkość obserwatora', type: 'slider',
      min: -0.9, max: 0.9, step: 0.01, default: 0,
      format: (v) => `${(v * 100).toFixed(0)}% c`,
    },
  ],
  createSim: () => new MinkowskiSim(),
  narrate(p) {
    const beta = Number(p.v);
    const { gamma, tA, tB } = minkowskiObservables(beta);
    return [
      {
        title:
          Math.abs(beta) < 0.05
            ? 'Stożek świetlny dzieli czasoprzestrzeń'
            : `Osie obserwatora pochylają się (β = ${beta.toFixed(2)}, γ = ${gamma.toFixed(2)})`,
        body:
          Math.abs(beta) < 0.05
            ? 'Linie 45° to drogi światła — nic nie wydostaje się poza nie. Wnętrze górnego stożka to zdarzenia, na które możesz jeszcze wpłynąć; dolnego — te, które mogły wpłynąć na Ciebie. Wszystko poza stożkiem jest przyczynowo odcięte: „teraz" w odległej galaktyce to pojęcie bez absolutnego sensu.'
            : `Dla obserwatora w ruchu osie x' i ct' pochylają się symetrycznie ku linii światła — a linie równoczesności (równoległe do x') przecinają zdarzenia w innej kolejności. Geometria robi tu całą robotę: to nie „wydaje się", to JEST czas tego obserwatora.`,
      },
      {
        title: tA < tB ? 'W tym układzie: najpierw A, potem B' : tB < tA ? 'W tym układzie: najpierw B, potem A!' : 'A i B równoczesne w tym układzie',
        body: `Zdarzenia A i B dzieli interwał przestrzennopodobny — żaden sygnał nie zdąży od jednego do drugiego. Dlatego ich kolejność czasowa zależy od obserwatora (przesuń suwak przez zero i patrz na werdykt) i ŻADEN obserwator nie jest „tym właściwym". Przyczynowość jest bezpieczna: kolejność zdarzeń połączalnych światłem jest taka sama dla wszystkich.`,
      },
    ];
  },
};
