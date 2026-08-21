import type { ExperimentDef, Sim, SimParams } from '../../core/types';
import { equivalenceVolumeMl, titrationPH } from '../../core/physics';

/**
 * Miareczkowanie kwasowo-zasadowe — słaby kwas mocną zasadą (NaOH).
 * Krzywa liczona DOKŁADNYM równaniem bilansu ładunku (nie tylko
 * przybliżeniem Hendersona–Hasselbalcha, które zawodzi blisko początku i
 * punktu równoważnikowego) — patrz `core/physics.ts::titrationPH`.
 * Wartości Ka: tabelaryczne (CRC Handbook of Chemistry and Physics).
 */

interface Acid { id: string; name: string; ka: number }

const ACIDS: Acid[] = [
  { id: 'acetic', name: 'Kwas octowy CH₃COOH (pKa≈4,74)', ka: 1.8e-5 },
  { id: 'formic', name: 'Kwas mrówkowy HCOOH (pKa≈3,75)', ka: 1.8e-4 },
  { id: 'benzoic', name: 'Kwas benzoesowy C₆H₅COOH (pKa≈4,20)', ka: 6.3e-5 },
  { id: 'hcn', name: 'Kwas cyjanowodorowy HCN (pKa≈9,21)', ka: 6.2e-10 },
];

export const TITRATION_ACID_IDS = ACIDS.map((acid) => acid.id) as readonly string[];

const CA = 0.1; // mol/L — stężenie kwasu
const VA = 25; // mL — objętość próbki kwasu
const CB = 0.1; // mol/L — stężenie titranta NaOH
const VB_MAX = 60; // mL

function acidById(id: string): Acid {
  return ACIDS.find((a) => a.id === id) ?? ACIDS[0];
}

class TitrationSim implements Sim {
  private lastAcidId = '';
  private lastVb = -1;
  private ka = ACIDS[0].ka;
  private currentPH = 7;
  private veq = 25;

  init() {}

  reset = () => {};

  update(_dt: number, p: SimParams) {
    const acidId = String(p.acid ?? 'acetic');
    const vb = Number(p.vb ?? 0);
    if (acidId !== this.lastAcidId || vb !== this.lastVb) {
      this.lastAcidId = acidId;
      this.lastVb = vb;
      this.ka = acidById(acidId).ka;
      this.veq = equivalenceVolumeMl(CA, VA, CB);
      const vbSafe = Math.max(vb, 1e-6);
      this.currentPH = titrationPH(CA, VA, CB, vbSafe, this.ka);
    }
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, w, h);

    const padL = 34;
    const padR = 14;
    const padT = 16;
    const padB = 30;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const toX = (vb: number) => padL + (vb / VB_MAX) * plotW;
    const toY = (ph: number) => padT + plotH - (ph / 14) * plotH;

    ctx.strokeStyle = 'rgba(230,234,245,0.08)';
    ctx.lineWidth = 1;
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(230,234,245,0.45)';
    for (let vb = 0; vb <= VB_MAX; vb += 10) {
      const x = toX(vb);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.fillText(`${vb}`, x - 5, padT + plotH + 12);
    }
    for (let ph = 0; ph <= 14; ph += 2) {
      const y = toY(ph);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.fillText(`${ph}`, 4, y + 3);
    }
    ctx.fillText('V(NaOH) [mL]', padL + plotW - 46, padT + plotH + 24);

    // krzywa
    ctx.beginPath();
    ctx.strokeStyle = '#5cd6e8';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 240; i++) {
      const vb = (i / 240) * VB_MAX;
      const ph = titrationPH(CA, VA, CB, Math.max(vb, 1e-6), this.ka);
      const x = toX(vb);
      const y = toY(ph);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // punkt równoważnikowy
    const xEq = toX(this.veq);
    ctx.strokeStyle = 'rgba(240,179,92,0.5)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(xEq, padT);
    ctx.lineTo(xEq, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f0b35c';
    ctx.fillText(`Veq=${this.veq.toFixed(1)}mL`, xEq + 3, padT + 10);

    // punkt półrównoważnikowy (pH = pKa dokładnie)
    const xHalf = toX(this.veq / 2);
    const pKa = -Math.log10(this.ka);
    ctx.fillStyle = 'rgba(198,140,255,0.7)';
    ctx.beginPath();
    ctx.arc(xHalf, toY(pKa), 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(`pH=pKa=${pKa.toFixed(2)}`, xHalf + 5, toY(pKa) - 6);

    // marker aktualnej pozycji
    const mx = toX(this.lastVb);
    const my = toY(this.currentPH);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#5cd6e8';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(mx, my, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(230,234,245,0.75)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(`V(NaOH)=${this.lastVb.toFixed(1)} mL · pH=${this.currentPH.toFixed(2)}`, 10, h - 8);
  }

  getStats() {
    return {
      ph: Math.round(this.currentPH * 100) / 100,
      vb: Math.round(this.lastVb * 10) / 10,
      veq: Math.round(this.veq * 10) / 10,
      pKa: Math.round(-Math.log10(this.ka) * 100) / 100,
    };
  }
}

export function runTitrationScenario({ acid = 'acetic', vb = 0 }: { acid?: string; vb?: number } = {}) {
  const selected = ACIDS.find((candidate) => candidate.id === acid);
  if (!selected) throw new Error('acid musi być jednym z obsługiwanych słabych kwasów.');
  if (!Number.isFinite(vb) || vb < 0 || vb > VB_MAX) throw new Error(`vb musi mieścić się w zakresie 0–${VB_MAX} mL.`);
  const veq = equivalenceVolumeMl(CA, VA, CB);
  const ph = titrationPH(CA, VA, CB, Math.max(vb, 1e-6), selected.ka);
  return { acid: selected.id, acidName: selected.name, ka: selected.ka, vb, ph, veq, pKa: -Math.log10(selected.ka) };
}

export const chemistryTitration: ExperimentDef = {
  id: 'titration',
  name: 'Miareczkowanie kwas–zasada',
  honesty: 'exact',
  honestyNote:
    'Krzywa liczona DOKŁADNYM równaniem bilansu ładunku ([Na⁺]+[H⁺]=[A⁻]+[OH⁻], z uwzględnieniem autodysocjacji wody), rozwiązywanym numerycznie (bisekcja) — nie tylko przybliżeniem Hendersona–Hasselbalcha, które jest widoczne na wykresie jako dokładne TYLKO w punkcie półrównoważnikowym. Wartości Ka: CRC Handbook of Chemistry and Physics. Stężenia i objętości (0,1 mol/L, 25 mL kwasu) są typowymi wartościami laboratoryjnymi, nie danymi jednego konkretnego eksperymentu.',
  params: [
    {
      key: 'acid', label: 'Kwas', type: 'select', default: 'acetic',
      options: ACIDS.map((a) => ({ value: a.id, label: a.name })),
    },
    { key: 'vb', label: 'Objętość dodanego NaOH', type: 'slider', min: 0, max: VB_MAX, step: 0.5, default: 0, unit: 'mL' },
  ],
  createSim: () => new TitrationSim(),
  narrate(p, stats) {
    const acid = acidById(String(p.acid ?? 'acetic'));
    const vb = Number(stats.vb ?? 0);
    const ph = Number(stats.ph ?? 7);
    const veq = Number(stats.veq ?? 25);
    const pKa = Number(stats.pKa ?? 4.74);
    const region = vb < 0.5 ? 'start' : vb < veq * 0.95 ? 'buffer' : vb < veq * 1.05 ? 'equivalence' : 'excess';

    const regionTitle =
      region === 'start'
        ? `Czysty ${acid.name.split(' (')[0]}: pH = ${ph.toFixed(2)}`
        : region === 'buffer'
          ? `Strefa buforowa: pH = ${ph.toFixed(2)}`
          : region === 'equivalence'
            ? `Punkt równoważnikowy: pH = ${ph.toFixed(2)}`
            : `Nadmiar NaOH: pH = ${ph.toFixed(2)}`;
    const regionBody =
      region === 'start'
        ? `Na starcie w roztworze jest tylko słaby kwas — pH wynika z jego częściowej dysocjacji (Ka=${acid.ka.toExponential(2)}), nie z pełnego stężenia jak dla mocnego kwasu. To dlatego pH słabego kwasu 0,1 mol/L jest WYŻSZE (mniej kwaśne) niż dla mocnego kwasu o tym samym stężeniu.`
        : region === 'buffer'
          ? `W tej strefie roztwór zawiera jednocześnie kwas (HA) i jego sprzężoną zasadę (A⁻) — to bufor, który opiera się zmianom pH. Przybliżenie Hendersona–Hasselbalcha (pH=pKa+log([A⁻]/[HA])) jest tu dobre, ale dokładna krzywa (bilans ładunku) uwzględnia też to, czego ten wzór pomija: rozcieńczenie i autodysocjację wody.`
          : region === 'equivalence'
            ? `Cały kwas przereagował z zasadą — w roztworze jest teraz TYLKO sprzężona zasada A⁻ (rozcieńczona). Ponieważ A⁻ jest słabą zasadą (hydrolizuje wodę: A⁻+H₂O⇌HA+OH⁻), pH w punkcie równoważnikowym jest ZASADOWE (>7), nie obojętne — klasyczny błąd popularnonaukowy do naprawienia: "punkt równoważnikowy" ≠ "pH=7" dla słabego kwasu.`
            : `Dodano więcej NaOH niż potrzeba do zobojętnienia kwasu — nadmiar mocnej zasady dominuje pH, które zbliża się do pH samego roztworu NaOH o tym stężeniu.`;

    const blocks = [
      {
        title: regionTitle,
        body: regionBody,
        citation: { source: 'CRC Handbook of Chemistry and Physics — stałe dysocjacji kwasów', confirmation: 'confirmed' as const, note: `Ka(${acid.name.split(' (')[0]}) = ${acid.ka.toExponential(2)}` },
      },
      {
        title: `Punkt półrównoważnikowy: pH = pKa = ${pKa.toFixed(2)} (dokładnie)`,
        body: `W połowie drogi do punktu równoważnikowego (V=${(veq / 2).toFixed(1)} mL) stężenia kwasu i sprzężonej zasady są RÓWNE — wtedy równanie Hendersona–Hasselbalcha upraszcza się do pH=pKa dokładnie (log(1)=0). To jeden z niewielu punktów na całej krzywej, gdzie proste przybliżenie i dokładne równanie bilansu ładunku dają identyczny wynik.`,
      },
      {
        title: 'Dlaczego krzywa robi gwałtowny skok',
        body: `Blisko punktu równoważnikowego (V=${veq.toFixed(1)} mL) nawet KROPLA dodatkowego NaOH gwałtownie zmienia pH — to właśnie ten stromy skok wykorzystują wskaźniki pH (fenoloftaleina, oranż metylowy) i pehametry do wykrywania końca miareczkowania w prawdziwym laboratorium.`,
      },
    ];
    return blocks;
  },
};
