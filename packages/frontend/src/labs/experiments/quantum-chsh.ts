import type { ExperimentDef, Sim, SimParams } from '../../core/types';
import { chshS, sampleLocalHiddenPair, sampleSingletPair, singletCorrelation } from '../../core/physics';

/**
 * Splątanie i nierówność CHSH — "pokonaj lokalny realizm".
 * Źródło emituje pary splątanych cząstek (stan singletowy); dwa detektory
 * mierzą pod kątami a/a′ i b/b′ (losowanymi niezależnie per para).
 * Estymaty czterech korelacji składają się w S. Lokalny realizm: |S| ≤ 2;
 * MK przewiduje do 2√2 ≈ 2,83 — i dokładnie tyle mierzą eksperymenty
 * (Aspect 1982; testy bez luk 2015; Nobel 2022).
 */

const DEG = Math.PI / 180;

class ChshSim implements Sim {
  private sums = [0, 0, 0, 0]; // Σ AB dla (a,b), (a,b'), (a',b), (a',b')
  private counts = [0, 0, 0, 0];
  private acc = 0;
  private flash = 0;
  private lastA = 0;
  private lastB = 0;
  private lastPair: [number, number] = [1, -1];

  init() {}

  reset = () => {
    this.sums = [0, 0, 0, 0];
    this.counts = [0, 0, 0, 0];
  };

  private angles(p: SimParams): [number, number, number, number] {
    return [Number(p.a) * DEG, Number(p.aP) * DEG, Number(p.b) * DEG, Number(p.bP) * DEG];
  }

  update(dt: number, p: SimParams) {
    const [a, aP, b, bP] = this.angles(p);
    const quantum = String(p.mode) === 'quantum';
    const rate = 400;
    this.acc += dt * rate;
    while (this.acc >= 1) {
      this.acc -= 1;
      const useAP = Math.random() < 0.5;
      const useBP = Math.random() < 0.5;
      const angA = useAP ? aP : a;
      const angB = useBP ? bP : b;
      const [A, B] = quantum ? sampleSingletPair(angA, angB) : sampleLocalHiddenPair(angA, angB);
      const idx = (useAP ? 2 : 0) + (useBP ? 1 : 0);
      this.sums[idx] += A * B;
      this.counts[idx]++;
      this.lastA = A;
      this.lastB = B;
      this.flash = 0.2;
    }
    this.flash = Math.max(0, this.flash - dt);
    this.lastPair = [this.lastA, this.lastB];
  }

  private estimates(): [number, number, number, number] {
    return this.sums.map((s, i) => (this.counts[i] > 0 ? s / this.counts[i] : 0)) as [number, number, number, number];
  }

  /** S = E(a,b) − E(a,b′) + E(a′,b) + E(a′,b′) z estymat. */
  private S(): number {
    const [Eab, EabP, EaPb, EaPbP] = this.estimates();
    return Eab - EabP + EaPb + EaPbP;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    const cy = h * 0.2;

    // źródło i detektory
    ctx.fillStyle = '#f0b35c';
    ctx.shadowColor = '#f0b35c';
    ctx.shadowBlur = this.flash > 0 ? 16 : 6;
    ctx.beginPath();
    ctx.arc(w / 2, cy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = '9px system-ui';
    ctx.fillStyle = 'rgba(240,179,92,0.8)';
    ctx.textAlign = 'center';
    ctx.fillText('źródło par', w / 2, cy + 20);

    for (const side of [-1, 1] as const) {
      const dx = w / 2 + side * w * 0.34;
      const val = side < 0 ? this.lastPair[0] : this.lastPair[1];
      ctx.strokeStyle = 'rgba(141,151,180,0.7)';
      ctx.strokeRect(dx - 22, cy - 16, 44, 32);
      ctx.fillStyle = this.flash > 0 ? (val > 0 ? '#6ee7a0' : '#f47c7c') : 'rgba(141,151,180,0.6)';
      ctx.font = '600 15px ui-monospace, monospace';
      ctx.fillText(val > 0 ? '+1' : '−1', dx, cy + 5);
      ctx.fillStyle = 'rgba(230,234,245,0.6)';
      ctx.font = '9px system-ui';
      ctx.fillText(side < 0 ? 'Alicja (a/a′)' : 'Bob (b/b′)', dx, cy + 30);
      // promień pary
      if (this.flash > 0) {
        ctx.strokeStyle = `rgba(92,214,232,${this.flash * 4})`;
        ctx.beginPath();
        ctx.moveTo(w / 2, cy);
        ctx.lineTo(dx - 22 * side, cy);
        ctx.stroke();
      }
    }
    ctx.textAlign = 'left';

    // cztery korelacje
    const labels = ['E(a,b)', "E(a,b′)", "E(a′,b)", "E(a′,b′)"];
    const est = this.estimates();
    const by = h * 0.4;
    const bw = w * 0.19;
    est.forEach((E, i) => {
      const x = w * 0.05 + i * (bw + w * 0.02);
      ctx.strokeStyle = 'rgba(141,151,180,0.4)';
      ctx.strokeRect(x, by, bw, 46);
      ctx.beginPath();
      ctx.moveTo(x, by + 23);
      ctx.lineTo(x + bw, by + 23);
      ctx.stroke();
      ctx.fillStyle = E < 0 ? '#f47c7c' : '#6ee7a0';
      const bh2 = Math.abs(E) * 22;
      ctx.fillRect(x + 4, E < 0 ? by + 23 : by + 23 - bh2, bw - 8, bh2);
      ctx.fillStyle = 'rgba(230,234,245,0.75)';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(labels[i], x + 2, by - 5);
      ctx.fillText(E.toFixed(2), x + 2, by + 60);
    });

    // miernik S
    const S = Math.abs(this.S());
    const gy = h * 0.74;
    const gx = w * 0.08;
    const gw = w * 0.84;
    ctx.strokeStyle = 'rgba(141,151,180,0.5)';
    ctx.strokeRect(gx, gy, gw, 14);
    const frac = Math.min(S / 3, 1);
    ctx.fillStyle = S > 2.02 ? '#a78bfa' : '#5cd6e8';
    ctx.fillRect(gx, gy, gw * frac, 14);
    for (const [v, label, color] of [[2, 'granica klasyczna', '#f47c7c'], [2.828, 'Tsirelson 2√2', '#6ee7a0']] as const) {
      const x = gx + (v / 3) * gw;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, gy - 8);
      ctx.lineTo(x, gy + 22);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(label, x - 30, gy - 12);
    }
    ctx.fillStyle = '#e6eaf5';
    ctx.font = '600 16px ui-monospace, monospace';
    ctx.fillText(`|S| = ${S.toFixed(3)}`, gx, gy + 40);
    const n = this.counts.reduce((x, y) => x + y, 0);
    ctx.fillStyle = 'rgba(141,151,180,0.8)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(`par: ${n.toLocaleString('pl-PL')}`, gx + w * 0.4, gy + 40);
  }

  getStats() {
    return {
      S: Math.round(Math.abs(this.S()) * 1000) / 1000,
      pairs: this.counts.reduce((x, y) => x + y, 0),
    };
  }
}

export function runChshCorrelationScenario({ a = 0, aP = 90, b = 45, bP = 135 }: { a?: number; aP?: number; b?: number; bP?: number } = {}) {
  for (const [name, angle] of Object.entries({ a, aP, b, bP })) {
    if (!Number.isFinite(angle) || angle < 0 || angle > 180) throw new Error(`${name} musi mieścić się w zakresie 0–180°.`);
  }
  const ar = a * DEG;
  const aPr = aP * DEG;
  const br = b * DEG;
  const bPr = bP * DEG;
  const eAB = singletCorrelation(ar, br);
  const eABP = singletCorrelation(ar, bPr);
  const eAPB = singletCorrelation(aPr, br);
  const eAPBP = singletCorrelation(aPr, bPr);
  const s = chshS(singletCorrelation, ar, aPr, br, bPr);
  return { a, aP, b, bP, eAB, eABP, eAPB, eAPBP, s, absS: Math.abs(s), tsirelsonBound: 2 * Math.SQRT2 };
}

export const quantumChsh: ExperimentDef = {
  id: 'chsh',
  name: 'Splątanie (CHSH)',
  honesty: 'exact',
  honestyNote:
    'Korelacje singletu E(a,b) = −cos(a−b) i statystyka par są dokładną mechaniką kwantową; tryb „ukryte zmienne" to uczciwy model lokalnego realizmu (deterministyczny, ze wspólną zmienną λ) — i dlatego nigdy nie przekroczy |S| = 2.',
  params: [
    {
      key: 'mode', label: 'Świat', type: 'select', default: 'quantum',
      options: [
        { value: 'quantum', label: 'Kwantowy (splątanie)' },
        { value: 'classical', label: 'Ukryte zmienne (lokalny realizm)' },
      ],
    },
    { key: 'a', label: 'Kąt Alicji a', type: 'slider', min: 0, max: 180, step: 1, default: 0, unit: '°' },
    { key: 'aP', label: 'Kąt Alicji a′', type: 'slider', min: 0, max: 180, step: 1, default: 90, unit: '°' },
    { key: 'b', label: 'Kąt Boba b', type: 'slider', min: 0, max: 180, step: 1, default: 45, unit: '°' },
    { key: 'bP', label: 'Kąt Boba b′', type: 'slider', min: 0, max: 180, step: 1, default: 135, unit: '°' },
  ],
  createSim: () => new ChshSim(),
  narrate(p, stats) {
    const S = Number(stats.S ?? 0);
    const n = Number(stats.pairs ?? 0);
    const quantum = String(p.mode) === 'quantum';
    const DEG2 = Math.PI / 180;
    const sTheory = Math.abs(
      chshS(singletCorrelation, Number(p.a) * DEG2, Number(p.aP) * DEG2, Number(p.b) * DEG2, Number(p.bP) * DEG2),
    );
    const blocks = [
      {
        title:
          n < 2000
            ? 'Zbieranie statystyki…'
            : S > 2.05
              ? `|S| = ${S.toFixed(2)} — lokalny realizm ZŁAMANY`
              : `|S| = ${S.toFixed(2)} — w granicach klasycznych`,
        body: quantum
          ? `Teoria przewiduje dla tych kątów |S| = ${sTheory.toFixed(2)} (maksimum 2√2 ≈ 2,83 przy 0°/90°/45°/135°). ${S > 2.05 ? 'Żadna teoria z lokalnymi ukrytymi zmiennymi nie potrafi tego wyniku wyprodukować — to twierdzenie Bella, nie opinia. Natura naprawdę nie ustala wyników przed pomiarem.' : 'Przesuń kąty ku 0°/90°/45°/135°, by zmaksymalizować łamanie.'}`
          : `Model ukrytych zmiennych: każda para niesie wspólny „plan" λ ustalony przy emisji, wyniki są z góry określone. Estymaty korelacji układają się w funkcję trójkątną zamiast kosinusa — i |S| nigdy nie przekroczy 2, niezależnie od kątów. Przełącz na świat kwantowy i porównaj.`,
      },
      {
        title: 'Nobel 2022 i żadnych furtek',
        body: 'Aspect (1982) zamknął lukę komunikacji zmieniając kąty w locie fotonów; testy z 2015 r. (Delft, Wiedeń, NIST) zamknęły jednocześnie luki detekcji i lokalności. Splątanie nie przesyła informacji (wyniki Alicji są lokalnie czystym szumem) — łamie tylko wyobrażenie, że własności istnieją przed pomiarem.',
        citation: {
          source: 'Hensen et al. 2015, Nature 526',
          confirmation: 'confirmed' as const,
          doi: '10.1038/nature15759',
          note: 'Pierwszy test Bella bez luk (detekcji i lokalności jednocześnie); Nobel z fizyki 2022 dla Aspecta, Clausera i Zeilingera',
        },
      },
    ];
    return blocks;
  },
};
