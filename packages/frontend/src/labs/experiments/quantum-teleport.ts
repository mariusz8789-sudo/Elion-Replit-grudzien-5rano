import type { ExperimentDef, Sim, SimParams } from '../../core/types';
import { teleport, type C, type Correction } from '../../core/quantumState';

/**
 * Teleportacja kwantowa — protokół Bennetta i in. (1993, PRL 70, 1895),
 * pierwsza eksperymentalna realizacja: Bouwmeester i in. 1997, Nature
 * 390, 575. Pełny wektor stanu 3 kubitów (core/quantumState.ts),
 * zweryfikowany numerycznie PRZED napisaniem testów: wierność (fidelity)
 * odtworzonego stanu wynosi dokładnie 1 w KAŻDEJ z 4 gałęzi pomiaru,
 * dla dowolnego zespolonego stanu wejściowego.
 *
 * Uczciwość: to NIE teleportacja materii ani informacji szybszej niż
 * światło. Oryginalny stan jest NISZCZONY na kubicie Alicji (pomiar) —
 * to przeniesienie, nie kopiowanie (złamałoby twierdzenie o zakazie
 * klonowania). Bob potrzebuje 2 bitów KLASYCZNYCH od Alicji (ograniczonych
 * prędkością światła), żeby wiedzieć, którą korektę zastosować — bez nich
 * jego kubit jest czystym, bezużytecznym szumem.
 */

const PRESETS: Record<string, { label: string; alpha: C; beta: C }> = {
  zero: { label: '|0⟩', alpha: [1, 0], beta: [0, 0] },
  one: { label: '|1⟩', alpha: [0, 0], beta: [1, 0] },
  plus: { label: '|+⟩ = (|0⟩+|1⟩)/√2', alpha: [Math.SQRT1_2, 0], beta: [Math.SQRT1_2, 0] },
  minus: { label: '|−⟩ = (|0⟩−|1⟩)/√2', alpha: [Math.SQRT1_2, 0], beta: [-Math.SQRT1_2, 0] },
  plusI: { label: '|+i⟩ = (|0⟩+i|1⟩)/√2', alpha: [Math.SQRT1_2, 0], beta: [0, Math.SQRT1_2] },
  minusI: { label: '|−i⟩ = (|0⟩−i|1⟩)/√2', alpha: [Math.SQRT1_2, 0], beta: [0, -Math.SQRT1_2] },
};

interface LastTrial {
  outcome0: 0 | 1;
  outcome1: 0 | 1;
  correction: Correction;
  fidelity: number;
  flash: number;
}

class TeleportSim implements Sim {
  private acc = 0;
  private trialCount = 0;
  private correctionCounts: Record<Correction, number> = { I: 0, X: 0, Z: 0, XZ: 0 };
  private fidelitySum = 0;
  private last: LastTrial | null = null;
  private presetKey = 'plus';

  init() {}

  reset = () => {
    this.trialCount = 0;
    this.correctionCounts = { I: 0, X: 0, Z: 0, XZ: 0 };
    this.fidelitySum = 0;
    this.last = null;
  };

  private runTrial(presetKey: string) {
    const preset = PRESETS[presetKey] ?? PRESETS.plus;
    const r = teleport(preset.alpha, preset.beta);
    this.trialCount++;
    this.correctionCounts[r.correction]++;
    this.fidelitySum += r.fidelity;
    this.last = { outcome0: r.outcome0, outcome1: r.outcome1, correction: r.correction, fidelity: r.fidelity, flash: 1 };
  }

  update(dt: number, p: SimParams) {
    const presetKey = String(p.state ?? 'plus');
    if (presetKey !== this.presetKey) {
      this.presetKey = presetKey;
      this.reset();
    }
    this.acc += dt;
    if (this.acc > 0.5) {
      this.acc = 0;
      this.runTrial(presetKey);
    }
    if (this.last) this.last.flash = Math.max(0, this.last.flash - dt * 1.5);
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    const cy = h * 0.22;
    const boxW = 78;
    const boxH = 50;
    const xs = [w * 0.16, w * 0.5, w * 0.84];
    const labels = ['ψ Alicji\n(nieznany stan)', 'para Bell\n(Alicja)', 'para Bell\n(Bob)'];
    const flash = this.last?.flash ?? 0;

    ctx.strokeStyle = `rgba(92,214,232,${0.25 + flash * 0.5})`;
    ctx.beginPath();
    ctx.moveTo(xs[1], cy);
    ctx.lineTo(xs[2], cy);
    ctx.stroke();
    ctx.fillStyle = 'rgba(92,214,232,0.6)';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('splątane', (xs[1] + xs[2]) / 2, cy - 8);

    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = i < 2 && flash > 0 ? `rgba(240,179,92,${flash})` : 'rgba(141,151,180,0.6)';
      ctx.lineWidth = i < 2 && flash > 0 ? 2 : 1;
      ctx.strokeRect(xs[i] - boxW / 2, cy - boxH / 2, boxW, boxH);
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(230,234,245,0.7)';
      ctx.font = '9px system-ui';
      const lines = labels[i].split('\n');
      lines.forEach((line, li) => ctx.fillText(line, xs[i], cy + boxH / 2 + 12 + li * 11));
    }

    const preset = PRESETS[this.presetKey] ?? PRESETS.plus;
    ctx.fillStyle = '#5cd6e8';
    ctx.font = '600 13px ui-monospace, monospace';
    ctx.fillText(preset.label, xs[0], cy + 5);

    if (this.last) {
      ctx.fillStyle = flash > 0.3 ? '#f0b35c' : 'rgba(240,179,92,0.6)';
      ctx.font = '600 13px ui-monospace, monospace';
      ctx.fillText(`m₀=${this.last.outcome0}`, xs[0], cy - boxH / 2 - 8);
      ctx.fillText(`m₁=${this.last.outcome1}`, xs[1], cy - boxH / 2 - 8);

      if (flash > 0) {
        ctx.strokeStyle = `rgba(230,234,245,${flash})`;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(xs[0], cy + boxH);
        ctx.lineTo(xs[2], cy + boxH);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(230,234,245,${flash})`;
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillText('2 bity klasyczne →', (xs[0] + xs[2]) / 2, cy + boxH + 14);
      }

      ctx.fillStyle = this.last.fidelity > 0.999 ? '#6ee7a0' : '#f47c7c';
      ctx.font = '600 13px ui-monospace, monospace';
      ctx.fillText(`korekta: ${this.last.correction}`, xs[2], cy - boxH / 2 - 8);
    }
    ctx.textAlign = 'left';

    const avgFidelity = this.trialCount > 0 ? this.fidelitySum / this.trialCount : 0;
    const by = h * 0.5;
    ctx.fillStyle = 'rgba(230,234,245,0.85)';
    ctx.font = '600 15px ui-monospace, monospace';
    ctx.fillText(`wierność (fidelity): ${(avgFidelity * 100).toFixed(3)}%`, w * 0.08, by);
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(141,151,180,0.8)';
    ctx.fillText(`próby: ${this.trialCount}`, w * 0.08, by + 20);

    const corrections: Correction[] = ['I', 'X', 'Z', 'XZ'];
    const barY = h * 0.62;
    const barW = w * 0.19;
    corrections.forEach((c, i) => {
      const x = w * 0.08 + i * (barW + w * 0.02);
      const frac = this.trialCount > 0 ? this.correctionCounts[c] / this.trialCount : 0;
      const bh2 = frac * 60;
      ctx.strokeStyle = 'rgba(141,151,180,0.4)';
      ctx.strokeRect(x, barY, barW, 60);
      ctx.fillStyle = 'rgba(92,214,232,0.7)';
      ctx.fillRect(x + 3, barY + 60 - bh2, barW - 6, bh2);
      ctx.fillStyle = 'rgba(230,234,245,0.75)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(c, x + 4, barY - 4);
      ctx.fillText(`${(frac * 100).toFixed(0)}%`, x + 4, barY + 74);
    });
  }

  getStats() {
    const avgFidelity = this.trialCount > 0 ? this.fidelitySum / this.trialCount : 0;
    return {
      trials: this.trialCount,
      avgFidelity: Math.round(avgFidelity * 100000) / 100000,
      lastFidelity: this.last ? Math.round(this.last.fidelity * 100000) / 100000 : 0,
    };
  }
}

export const quantumTeleport: ExperimentDef = {
  id: 'teleport',
  name: 'Teleportacja kwantowa',
  honesty: 'exact',
  honestyNote:
    'Pełny wektor stanu 3 kubitów, dokładna mechanika kwantowa (nie przybliżenie) — protokół Bennetta i in. (1993). Fidelity=1 w każdej próbie to twierdzenie matematyczne, zweryfikowane dla wszystkich 4 gałęzi pomiaru i dowolnego stanu wejściowego przed napisaniem testów. To NIE teleportacja materii/informacji szybszej niż światło: oryginalny stan jest zniszczony na kubicie Alicji (pomiar, nie kopiowanie — zakaz klonowania), a Bob potrzebuje 2 bitów KLASYCZNYCH (ograniczonych prędkością światła) do wykonania właściwej korekty; bez nich jego kubit jest czystym szumem.',
  params: [
    {
      key: 'state', label: 'Stan do teleportacji', type: 'select', default: 'plus',
      options: Object.entries(PRESETS).map(([value, { label }]) => ({ value, label })),
    },
  ],
  createSim: () => new TeleportSim(),
  narrate(p, stats) {
    const presetKey = String(p.state ?? 'plus');
    const preset = PRESETS[presetKey] ?? PRESETS.plus;
    const trials = Number(stats.trials ?? 0);
    const avgFidelity = Number(stats.avgFidelity ?? 0);
    return [
      {
        title: trials < 2 ? 'Pierwsza teleportacja…' : `${trials} prób, średnia wierność: ${(avgFidelity * 100).toFixed(2)}%`,
        body: `Stan ${preset.label} jest kodowany na kubicie Alicji. Ona i Bob dzielą splątaną parę Bell (H+CNOT). Alicja splata swój nieznany kubit z połową pary (CNOT+H), mierzy OBA swoje kubity (wynik losowy, reguła Borna — widać na wykresie słupkowym poniżej: każda z 4 możliwych kombinacji ~25%) i wysyła 2 bity klasyczne do Boba. Bob stosuje jedną z czterech korekt (I/X/Z/XZ) zależnie od tych bitów — i za KAŻDYM razem odzyskuje dokładnie oryginalny stan. To NIE przypadek ani statystyczne przybliżenie: to wynika wprost z algebry liniowej protokołu.`,
        citation: {
          source: 'Bennett, Brassard, Crépeau, Jozsa, Peres, Wootters 1993, PRL 70, 1895; pierwsza realizacja: Bouwmeester i in. 1997, Nature 390, 575',
          confirmation: 'confirmed',
          note: 'Protokół matematycznie dokładny; eksperymentalnie potwierdzony wielokrotnie, także na dystansach satelitarnych (Ren i in. 2017, Nature 549, 70)',
        },
      },
      {
        title: 'Dlaczego to NIE łamie szczególnej teorii względności',
        body: 'Bob nie może odczytać teleportowanego stanu, dopóki nie dostanie 2 bitów klasycznych od Alicji — a te podróżują co najwyżej z prędkością światła (kablem, światłowodem, radiem). Bez tych bitów jego kubit jest, statystycznie, czystym szumem — nie da się z niego wyciągnąć ŻADNEJ informacji o oryginalnym stanie. Splątanie samo w sobie nie przesyła informacji; dopiero splątanie + kanał klasyczny razem przenoszą stan kwantowy, i to nigdy szybciej niż światło.',
      },
    ];
  },
};
