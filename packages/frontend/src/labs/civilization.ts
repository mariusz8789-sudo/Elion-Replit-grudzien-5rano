import type { LabDefinition, NarrationBlock, Sim, SimParams } from '../core/types';
import { sci } from '../core/useSimLoop';
import { civilizationColonization } from './experiments/civilization-colonization';

/**
 * Civilization Lab — skala Kardaszewa.
 * Wzór Sagana: K = (log₁₀P − 6) / 10, gdzie P w watach — to realna formuła
 * używana w literaturze SETI. Megastruktury (rój Dysona) i przyszłe cywilizacje
 * to spekulacja inżynieryjna — oznaczona jako hipoteza.
 */

class KardashevSim implements Sim {
  private t = 0;
  private K = 0.73;

  init() {}

  update(dt: number, p: SimParams) {
    this.t += dt;
    this.K = Number(p.k);
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const cx = w / 2;
    const cy = h * 0.44;
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.75);
    bgGrad.addColorStop(0, '#080a16');
    bgGrad.addColorStop(1, '#02030a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
    const K = this.K;

    if (K < 2) {
      // Planeta z rosnącą siecią energetyczną, potem rój Dysona wokół gwiazdy
      const R = Math.min(w, h) * 0.2;
      ctx.fillStyle = '#1b2c4a';
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(92,214,232,0.5)';
      // Sieć energetyczna: pokrycie rośnie z K do 1
      const cover = Math.min(1, Math.max(0, (K - 0.7) / 0.3));
      const nodes = Math.floor(cover * 42);
      for (let i = 0; i < nodes; i++) {
        const a1 = (i * 2.39996) % (Math.PI * 2); // złoty kąt
        const rr = R * Math.sqrt(((i * 7919) % 100) / 100);
        const x = cx + rr * Math.cos(a1);
        const y = cy + rr * Math.sin(a1);
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 2 + i);
        ctx.fillStyle = `rgba(240,179,92,${pulse})`;
        ctx.shadowColor = '#f0b35c';
        ctx.shadowBlur = 2 + pulse * 3;
        ctx.fillRect(x, y, 2, 2);
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = 'rgba(230,234,245,0.7)';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(K < 1 ? 'Typ 0→I: energia planety' : 'Typ I: pełna energia planety', cx, cy + R + 24);
    } else if (K < 3) {
      // Rój Dysona: wypełnienie rośnie z K 2→3
      const R = Math.min(w, h) * 0.13;
      const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, R * 2);
      grad.addColorStop(0, '#f8d9a0');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f0b35c';
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      const fill = (K - 2);
      const sats = Math.floor(20 + fill * 240);
      for (let i = 0; i < sats; i++) {
        const ang = (i * 2.39996) + this.t * (0.1 + (i % 5) * 0.02);
        const rr = R * (1.5 + ((i * 31) % 40) / 40);
        ctx.fillStyle = 'rgba(92,214,232,0.85)';
        ctx.fillRect(cx + rr * Math.cos(ang), cy + rr * Math.sin(ang), 1.8, 1.8);
      }
      ctx.fillStyle = 'rgba(230,234,245,0.7)';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`Typ II: rój Dysona (hipoteza) — ${(fill * 100).toFixed(0)}% drogi do Typu III`, cx, cy + R * 3 + 16);
    } else {
      // Galaktyka
      ctx.save();
      ctx.translate(cx, cy);
      for (let i = 0; i < 700; i++) {
        const arm = i % 2;
        const tt = (i / 700) * 4.5;
        const ang = tt * 1.8 + arm * Math.PI + this.t * 0.05;
        const rr = tt * Math.min(w, h) * 0.055;
        const jx = Math.sin(i * 12.9898) * 6;
        const jy = Math.cos(i * 78.233) * 6;
        const harvested = (i / 700) < (K - 3) * 2;
        ctx.fillStyle = harvested ? 'rgba(240,179,92,0.9)' : 'rgba(200,215,255,0.55)';
        if (harvested) {
          ctx.shadowColor = '#f0b35c';
          ctx.shadowBlur = 4;
        }
        ctx.fillRect(rr * Math.cos(ang) + jx, rr * Math.sin(ang) * 0.6 + jy, 1.6, 1.6);
        ctx.shadowBlur = 0;
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(230,234,245,0.7)';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Typ III: energia galaktyki (hipoteza)', cx, h - 40);
    }

    // Pasek skali
    ctx.textAlign = 'left';
    const bx = w * 0.08;
    const bw = w * 0.84;
    const by = h - 22;
    ctx.strokeStyle = 'rgba(141,151,180,0.5)';
    ctx.strokeRect(bx, by, bw, 6);
    ctx.fillStyle = '#f0b35c';
    ctx.fillRect(bx, by, bw * Math.min(1, (K - 0.5) / 2.7), 6);
    ctx.fillStyle = 'rgba(230,234,245,0.65)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText('0.5', bx, by - 4);
    ctx.fillText('I', bx + bw * (0.5 / 2.7), by - 4);
    ctx.fillText('II', bx + bw * (1.5 / 2.7), by - 4);
    ctx.fillText('III', bx + bw - 10, by - 4);
  }
}

export const civilizationLab: LabDefinition = {
  id: 'civilization',
  name: 'Civilization Lab',
  tagline: 'Skala Kardaszewa, megastruktury, przyszłość cywilizacji',
  icon: '🛰️',
  accent: '#f0b35c',
  honesty: 'theoretical',
  honestyNote:
    'Skala Kardaszewa i wzór Sagana są realnymi narzędziami z literatury SETI, ale wszystko powyżej dzisiejszej ludzkości (K≈0,73) to spekulacja: rój Dysona, cywilizacje galaktyczne i ich technologie są hipotezami inżynieryjnymi.',
  params: [
    {
      key: 'k', label: 'Poziom cywilizacji K', type: 'slider', min: 0.5, max: 3.2, step: 0.01, default: 0.73,
      format: (v) => v.toFixed(2),
    },
  ],
  createSim: () => new KardashevSim(),
  experiments: [civilizationColonization],
  narrate(p) {
    const K = Number(p.k);
    const P = Math.pow(10, 10 * K + 6);
    const humanity = 2e13; // ~20 TW
    const ratio = P / humanity;
    const blocks: NarrationBlock[] = [
      {
        title: `K = ${K.toFixed(2)} → pobór mocy ${sci(P, 1)} W`,
        body: `Wzór Sagana: K = (log₁₀P − 6)/10. To ${ratio >= 1 ? sci(ratio, 1) + '× więcej niż' : (ratio * 100).toFixed(0) + '% tego, co'} dzisiejsza ludzkość (~20 TW, K≈0,73). Dla porównania: cała energia słoneczna padająca na Ziemię to ~1,7×10¹⁷ W (K≈1,1), moc Słońca 3,8×10²⁶ W (K≈2,1), a Drogi Mlecznej ~10³⁷ W (K≈3,1).`,
      },
    ];
    if (K < 1) {
      blocks.push({
        title: 'Między 0 a I: najbliższe stulecia',
        body: 'Przejście do Typu I oznacza opanowanie energii rzędu całego nasłonecznienia planety — ~8500× więcej, niż zużywamy dziś. Przy wzroście 2% rocznie zajęłoby to ~450 lat. Wąskim gardłem nie jest fizyka, lecz inżynieria i stabilność cywilizacji.',
      });
    } else if (K < 2.2) {
      blocks.push({
        title: 'Rój Dysona — hipoteza inżynieryjna',
        kind: 'hypothesis' as const,
        body: 'Nie sztywna sfera (niestabilna mechanicznie), lecz miliardy niezależnych kolektorów na orbitach. Freeman Dyson zaproponował go w 1960 r. jako sygnaturę do szukania cywilizacji: gwiazda przesłonięta rojem świeciłaby głównie w podczerwieni. Przeglądy nieba takich sygnatur dotąd nie znalazły.',
      });
    } else {
      blocks.push({
        title: 'Typ III i paradoks Fermiego',
        kind: 'hypothesis' as const,
        body: 'Cywilizacja galaktyczna kolonizująca gwiazdy nawet z prędkością 1% c objęłaby Drogę Mleczną w ~10 mln lat — mgnienie wobec wieku Galaktyki. Skoro to możliwe, "gdzie oni są?" (Fermi). Każda odpowiedź — rzadkość życia, autodestrukcja, wielki filtr — pozostaje hipotezą.',
      });
    }
    return blocks;
  },
};
