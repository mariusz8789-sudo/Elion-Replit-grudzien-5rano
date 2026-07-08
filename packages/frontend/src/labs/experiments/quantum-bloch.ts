import type { ExperimentDef, Sim, SimParams } from '../../core/types';

/**
 * Sfera Blocha — kubit jako pełny stan kwantowy (wektor zespolony 2D),
 * bramki jako dokładne macierze unitarne. Dekoherencja: kurczenie wektora
 * Blocha (model dephasing/depolaryzacji — fenomenologiczny).
 */

type C = [number, number]; // [re, im]

const GATES: Record<string, [C, C, C, C]> = {
  // [a b; c d] jako [a, b, c, d]
  H: [[1 / Math.SQRT2, 0], [1 / Math.SQRT2, 0], [1 / Math.SQRT2, 0], [-1 / Math.SQRT2, 0]],
  X: [[0, 0], [1, 0], [1, 0], [0, 0]],
  Y: [[0, 0], [0, -1], [0, 1], [0, 0]],
  Z: [[1, 0], [0, 0], [0, 0], [-1, 0]],
  S: [[1, 0], [0, 0], [0, 0], [0, 1]],
  T: [[1, 0], [0, 0], [0, 0], [Math.SQRT1_2, Math.SQRT1_2]],
};

const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];

class BlochSim implements Sim {
  private a: C = [1, 0]; // amplituda |0⟩
  private b: C = [0, 0]; // amplituda |1⟩
  private shrink = 1; // długość wektora Blocha (dekoherencja)
  private buttons: { label: string; x: number; y: number; w: number; h: number }[] = [];
  private lastGate = '—';
  private measured: string | null = null;
  private measureTimer = 0;
  private gateCount = 0;

  init() {}

  reset = () => {
    this.a = [1, 0];
    this.b = [0, 0];
    this.shrink = 1;
    this.lastGate = '—';
    this.measured = null;
    this.gateCount = 0;
  };

  private apply(g: string) {
    if (g === 'M') {
      const p0 = (this.a[0] ** 2 + this.a[1] ** 2);
      const zero = Math.random() < p0;
      this.a = zero ? [1, 0] : [0, 0];
      this.b = zero ? [0, 0] : [1, 0];
      this.shrink = 1;
      this.measured = zero ? '|0⟩' : '|1⟩';
      this.measureTimer = 1.6;
      this.lastGate = 'pomiar';
      return;
    }
    const m = GATES[g];
    if (!m) return;
    const na = add(mul(m[0], this.a), mul(m[1], this.b));
    const nb = add(mul(m[2], this.a), mul(m[3], this.b));
    this.a = na;
    this.b = nb;
    this.lastGate = g;
    this.gateCount++;
  }

  pointer(x: number, y: number, type: 'down' | 'move' | 'up') {
    if (type !== 'down') return;
    for (const btn of this.buttons) {
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        this.apply(btn.label === '📏' ? 'M' : btn.label);
      }
    }
  }

  update(dt: number, p: SimParams) {
    if (Boolean(p.decoherence)) {
      this.shrink = Math.max(0.02, this.shrink - dt * 0.12);
    } else if (this.shrink < 1) {
      this.shrink = Math.min(1, this.shrink + dt * 0.3);
    }
    if (this.measureTimer > 0) this.measureTimer -= dt;
  }

  /** Wektor Blocha (x,y,z) ze stanu. */
  private bloch(): [number, number, number] {
    const [ar, ai] = this.a;
    const [br, bi] = this.b;
    const x = 2 * (ar * br + ai * bi);
    const y = 2 * (ar * bi - ai * br);
    const z = ar * ar + ai * ai - (br * br + bi * bi);
    return [x * this.shrink, y * this.shrink, z * this.shrink];
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h * 0.42;
    const R = Math.min(w, h * 0.8) * 0.3;

    // sfera: okrąg + równik (elipsa)
    ctx.strokeStyle = 'rgba(141,151,180,0.5)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, R, R * 0.32, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(141,151,180,0.3)';
    ctx.stroke();

    // osie
    ctx.fillStyle = 'rgba(230,234,245,0.8)';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText('|0⟩', cx - 9, cy - R - 8);
    ctx.fillText('|1⟩', cx - 9, cy + R + 17);

    // rzut 3D → 2D: x w prawo (skrócone), y w głąb (elipsa), z w górę
    const [bx, by, bz] = this.bloch();
    const px = cx + bx * R * 0.92 + by * R * 0.35;
    const py = cy - bz * R + by * R * 0.18;

    // wektor stanu
    ctx.strokeStyle = '#5cd6e8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = '#5cd6e8';
    ctx.shadowColor = '#5cd6e8';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // amplitudy i prawdopodobieństwa
    const p0 = this.a[0] ** 2 + this.a[1] ** 2;
    ctx.fillStyle = 'rgba(230,234,245,0.85)';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(`P(|0⟩) = ${(p0 * 100).toFixed(0)}%   P(|1⟩) = ${((1 - p0) * 100).toFixed(0)}%`, 12, 20);
    ctx.fillStyle = 'rgba(141,151,180,0.9)';
    ctx.fillText(`ostatnia operacja: ${this.lastGate} · |r⃗| = ${this.shrink.toFixed(2)}`, 12, 37);
    if (this.measured && this.measureTimer > 0) {
      ctx.fillStyle = '#f0b35c';
      ctx.font = 'bold 15px ui-monospace, monospace';
      ctx.fillText(`pomiar → ${this.measured}`, cx + R * 0.4, cy - R * 0.7);
    }

    // przyciski bramek na kanwie
    const labels = ['H', 'X', 'Y', 'Z', 'S', 'T', '📏'];
    const bw = Math.min((w - 24 - 6 * 8) / 7, 52);
    const bh = 38;
    const total = labels.length * bw + (labels.length - 1) * 8;
    let x0 = (w - total) / 2;
    const y0 = h - bh - 12;
    this.buttons = [];
    for (const lbl of labels) {
      this.buttons.push({ label: lbl, x: x0, y: y0, w: bw, h: bh });
      ctx.fillStyle = 'rgba(16,21,38,0.9)';
      ctx.strokeStyle = 'rgba(92,214,232,0.5)';
      ctx.beginPath();
      ctx.roundRect(x0, y0, bw, bh, 9);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e6eaf5';
      ctx.font = '600 15px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(lbl, x0 + bw / 2, y0 + bh / 2 + 5);
      ctx.textAlign = 'left';
      x0 += bw + 8;
    }
    ctx.fillStyle = 'rgba(141,151,180,0.7)';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('dotknij bramkę, 📏 = pomiar', cx, h - 58);
    ctx.textAlign = 'left';
  }

  getStats() {
    const p0 = this.a[0] ** 2 + this.a[1] ** 2;
    return { p0: Math.round(p0 * 100), shrink: Math.round(this.shrink * 100) / 100, gates: this.gateCount };
  }
}

export const quantumBloch: ExperimentDef = {
  id: 'bloch',
  name: 'Sfera Blocha',
  honesty: 'exact',
  honestyNote:
    'Kubit jest reprezentowany pełnym stanem kwantowym, a bramki to dokładne macierze unitarne — identyczne z używanymi w komputerach kwantowych. Dekoherencja jest modelem fenomenologicznym (kurczenie wektora Blocha).',
  params: [
    { key: 'decoherence', label: 'Dekoherencja (sprzężenie z otoczeniem)', type: 'toggle', default: false },
  ],
  createSim: () => new BlochSim(),
  narrate(p, stats) {
    const p0 = Number(stats.p0 ?? 100);
    const shrink = Number(stats.shrink ?? 1);
    const blocks = [
      {
        title: `Stan kubitu: P(|0⟩) = ${p0}%`,
        body:
          p0 > 95 || p0 < 5
            ? 'Kubit jest niemal w stanie bazowym — jak klasyczny bit. Dotknij H (bramka Hadamarda), by utworzyć superpozycję: wektor przejdzie na równik sfery, gdzie oba wyniki pomiaru są równie prawdopodobne.'
            : `Kubit jest w superpozycji: pomiar da |0⟩ z prawdopodobieństwem ${p0}%, ale przed pomiarem stan jest w pełni określony — to punkt na sferze, nie „niewiedza". Bramki Z, S, T obracają fazę (wektor krąży po równiku) — amplitudy zostają, zmienia się coś, czego pojedynczy pomiar nie widzi, a interferencja tak.`,
      },
      {
        title: 'Pomiar to nie odczyt — to projekcja',
        body: 'Przycisk 📏 losuje wynik zgodnie z amplitudami i NISZCZY superpozycję: wektor skacze na biegun. Dlatego komputer kwantowy mierzy się raz, na końcu obwodu — każdy wcześniejszy pomiar kasuje przewagę kwantową.',
      },
    ];
    if (Boolean(p.decoherence)) {
      blocks.push({
        title: `Dekoherencja: |r⃗| = ${shrink.toFixed(2)}`,
        body: 'Otoczenie „podgląda" kubit i wektor Blocha kurczy się do środka sfery — stan czysty staje się mieszaniną statystyczną. To główny wróg komputerów kwantowych: czasy koherencji dzisiejszych kubitów to mikrosekundy–milisekundy, stąd kriostaty i korekcja błędów.',
      });
    }
    return blocks;
  },
};
