import type { LabDefinition, Sim, SimParams } from '../core/types';
import { bondPolarity, type BondType } from '../core/physics';
import { PAULING_ELECTRONEGATIVITY } from '../data/electronegativity';
import { ELEMENTS } from '../data/elements';

/**
 * Chemistry Lab — wiązania chemiczne i elektroujemność.
 * Fizyka: elektroujemność Paulinga χ to zmierzona/tabelaryczna wielkość
 * (CRC Handbook), różnica Δχ = |χA − χB| jest dokładna. Klasyfikacja typu
 * wiązania na progach (0,4 / 1,7) to standardowa konwencja dydaktyczna, nie
 * ostra granica fizyczna — dlatego wizualizacja (przesunięcie chmury
 * elektronowej) jest CIĄGŁA funkcją Δχ (wzór Hanney–Smitha), a nie
 * przełącznikiem trzech stanów. Patrz core/physics.ts::bondPolarity.
 */

const BOND_ELEMENTS = ELEMENTS.filter((e) => PAULING_ELECTRONEGATIVITY[e.symbol] !== undefined);

const BOND_TYPE_LABEL: Record<BondType, string> = {
  'covalent-nonpolar': 'kowalencyjne niespolaryzowane',
  'covalent-polar': 'kowalencyjne spolaryzowane',
  ionic: 'jonowe',
};

const BOND_TYPE_COLOR: Record<BondType, string> = {
  'covalent-nonpolar': '#5cd6e8',
  'covalent-polar': '#f0b35c',
  ionic: '#f47c7c',
};

class BondSim implements Sim {
  private t = 0;
  private symbolA = 'Na';
  private symbolB = 'Cl';

  init() {}

  update(dt: number, p: SimParams) {
    this.t += dt;
    this.symbolA = String(p.elementA ?? 'Na');
    this.symbolB = String(p.elementB ?? 'Cl');
  }

  private state() {
    const elA = ELEMENTS.find((e) => e.symbol === this.symbolA) ?? ELEMENTS[10];
    const elB = ELEMENTS.find((e) => e.symbol === this.symbolB) ?? ELEMENTS[16];
    const chiA = PAULING_ELECTRONEGATIVITY[elA.symbol] ?? 1;
    const chiB = PAULING_ELECTRONEGATIVITY[elB.symbol] ?? 1;
    const bond = bondPolarity(chiA, chiB);
    return { elA, elB, chiA, chiB, bond };
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const bgGrad = ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, Math.max(w, h) * 0.75);
    bgGrad.addColorStop(0, '#0a0810');
    bgGrad.addColorStop(1, '#02030a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const { elA, elB, chiA, chiB, bond } = this.state();
    const cy = h * 0.36;
    const nucAx = w * 0.32;
    const nucBx = w * 0.68;
    const higherIsA = chiA >= chiB;
    const color = BOND_TYPE_COLOR[bond.type];

    // Chmura elektronowa: środek przesuwa się CIĄGLE ku bardziej
    // elektroujemnemu atomowi (skewFraction), a promień maleje, gdy
    // elektron lokalizuje się (wiązanie jonowe = ciasna chmura na anionie).
    const centerFrac = higherIsA ? 0.5 - bond.skewFraction * 0.5 : 0.5 + bond.skewFraction * 0.5;
    const cloudCx = nucAx + (nucBx - nucAx) * centerFrac;
    const spread = (nucBx - nucAx) * (0.34 - bond.skewFraction * 0.16);
    const cloudGrad = ctx.createRadialGradient(cloudCx, cy, 0, cloudCx, cy, spread);
    cloudGrad.addColorStop(0, `${color}99`);
    cloudGrad.addColorStop(0.6, `${color}44`);
    cloudGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = cloudGrad;
    ctx.beginPath();
    ctx.ellipse(cloudCx, cy, spread * 1.5, spread, 0, 0, Math.PI * 2);
    ctx.fill();

    // Jądra: rozmiar symboliczny (log Z), nie do skali promienia atomowego.
    for (const [x, el, chi] of [[nucAx, elA, chiA], [nucBx, elB, chiB]] as const) {
      const r = 10 + Math.log2(el.z) * 1.8;
      ctx.fillStyle = '#f8d9a0';
      ctx.shadowColor = '#f8d9a0';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#02030a';
      ctx.font = '600 13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(el.symbol, x, cy + 4);
      ctx.fillStyle = 'rgba(230,234,245,0.7)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(`χ=${chi.toFixed(2)}`, x, cy + r + 16);

      // Etykiety ładunku — tylko gdy wiązanie faktycznie jest bliskie
      // jonowemu (skewFraction wysoki), sterowane tą samą liczbą co chmura.
      if (bond.skewFraction > 0.55) {
        const isAnion = (x === nucAx) === higherIsA;
        ctx.fillStyle = isAnion ? '#f47c7c' : '#5cd6e8';
        ctx.font = '600 14px ui-monospace, monospace';
        ctx.fillText(isAnion ? '−' : '+', x, cy - r - 8);
      }
    }
    ctx.textAlign = 'left';

    // Skala elektroujemności Paulinga (0–4) z pozycjami obu atomów.
    const sx = w * 0.1;
    const sw = w * 0.8;
    const sy = h * 0.62;
    ctx.strokeStyle = 'rgba(141,151,180,0.5)';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + sw, sy);
    ctx.stroke();
    for (const m of [0, 1, 2, 3, 4]) {
      const x = sx + (m / 4) * sw;
      ctx.strokeStyle = 'rgba(141,151,180,0.3)';
      ctx.beginPath();
      ctx.moveTo(x, sy - 4);
      ctx.lineTo(x, sy + 4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(141,151,180,0.7)';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(String(m), x - 3, sy + 16);
    }
    for (const [chi, el] of [[chiA, elA], [chiB, elB]] as const) {
      const x = sx + (chi / 4) * sw;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(x, sy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(230,234,245,0.85)';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(el.symbol, x - 5, sy - 8);
    }
    ctx.fillStyle = 'rgba(230,234,245,0.5)';
    ctx.font = '9px system-ui';
    ctx.fillText('skala elektroujemności Paulinga', sx, sy - 22);

    // Werdykt
    ctx.fillStyle = color;
    ctx.font = '600 13px system-ui';
    ctx.fillText(`Δχ = ${bond.deltaChi.toFixed(2)} → ${BOND_TYPE_LABEL[bond.type]}`, sx, h * 0.85);
    ctx.fillStyle = 'rgba(230,234,245,0.65)';
    ctx.font = '10px system-ui';
    ctx.fillText(`~${(bond.skewFraction * 100).toFixed(0)}% charakteru jonowego (wzór Hanney–Smitha)`, sx, h * 0.85 + 18);
  }

  getStats() {
    const { bond } = this.state();
    return {
      deltaChi: Math.round(bond.deltaChi * 100) / 100,
      ionicPercent: Math.round(bond.skewFraction * 100),
    };
  }
}

export const chemistryLab: LabDefinition = {
  id: 'chemistry',
  name: 'Chemistry Lab',
  tagline: 'Wiązania chemiczne, elektroujemność, polarność',
  icon: '⚗️',
  accent: '#e879f9',
  honesty: 'simplified',
  honestyNote:
    'Wartości elektroujemności Paulinga χ są tabelarycznymi danymi (CRC Handbook). Różnica Δχ jest dokładna. Progi klasyfikacji typu wiązania (0,4 / 1,7) to konwencja dydaktyczna, nie ostra granica fizyczna — realne wiązania tworzą continuum. "Procent charakteru jonowego" to klasyczne przybliżenie Hanney–Smitha (1946), nie zmierzona wielkość. Rozmiary atomów są symboliczne (log Z), nie do skali promienia atomowego.',
  params: [
    {
      key: 'elementA', label: 'Atom A', type: 'select', default: 'Na',
      options: BOND_ELEMENTS.map((e) => ({ value: e.symbol, label: `${e.symbol} — ${e.name}` })),
    },
    {
      key: 'elementB', label: 'Atom B', type: 'select', default: 'Cl',
      options: BOND_ELEMENTS.map((e) => ({ value: e.symbol, label: `${e.symbol} — ${e.name}` })),
    },
  ],
  createSim: () => new BondSim(),
  narrate(p, stats) {
    const symbolA = String(p.elementA ?? 'Na');
    const symbolB = String(p.elementB ?? 'Cl');
    const elA = ELEMENTS.find((e) => e.symbol === symbolA);
    const elB = ELEMENTS.find((e) => e.symbol === symbolB);
    const deltaChi = Number(stats.deltaChi ?? 0);
    const ionicPercent = Number(stats.ionicPercent ?? 0);
    const type: BondType = deltaChi < 0.4 ? 'covalent-nonpolar' : deltaChi < 1.7 ? 'covalent-polar' : 'ionic';
    return [
      {
        title: `${elA?.name ?? symbolA}–${elB?.name ?? symbolB}: Δχ = ${deltaChi.toFixed(2)} → wiązanie ${BOND_TYPE_LABEL[type]}`,
        body:
          type === 'ionic'
            ? `Różnica elektroujemności jest tak duża, że elektron w praktyce przechodzi od ${higherChiName(elA, elB, symbolA, symbolB)} do drugiego atomu — powstają jony (kation i anion), które wiąże przyciąganie elektrostatyczne, nie wspólna para elektronowa. Stąd twarde, kruche kryształy o wysokiej temperaturze topnienia i przewodnictwo w roztworze.`
            : type === 'covalent-polar'
              ? 'Para elektronowa jest wspólna, ale spędza więcej czasu bliżej bardziej elektroujemnego atomu — powstaje trwały dipol. To fundament polarności cząsteczek (np. woda) i sił międzycząsteczkowych (wiązania wodorowe).'
              : 'Atomy dzielą parę elektronową praktycznie po równo — brak trwałego dipolu na tym wiązaniu. Tak wiążą się atomy tego samego pierwiastka (H₂, O₂) lub pierwiastki o zbliżonej elektroujemności (C–H).',
        citation: {
          source: 'CRC Handbook of Chemistry and Physics — skala elektroujemności Paulinga',
          confirmation: 'confirmed' as const,
          note: 'Wartości χ dla obu pierwiastków',
        },
      },
      {
        title: `~${ionicPercent}% charakteru jonowego`,
        body: `Wzór Hanney–Smitha (f ≈ 1 − e^(−Δχ²/4)) to klasyczne, wciąż cytowane przybliżenie — nie ostry podział. Rzeczywiste wiązania tworzą continuum od czysto kowalencyjnego do czysto jonowego; nawet NaCl w fazie gazowej zachowuje istotny udział kowalencyjny — to sieć krystaliczna soli w stanie stałym jest w pełni jonowa.`,
      },
      {
        title: 'Dlaczego elektroujemność w ogóle istnieje',
        body: 'Linus Pauling zdefiniował tę skalę w 1932 r. z energii wiązań (silniejsze niż średnia geometryczna wiązanie A–B zdradza, że para elektronowa nie jest dzielona po równo). Fluor (χ=3,98) jest najbardziej elektroujemnym pierwiastkiem — dlatego prawie każde jego wiązanie jest silnie polarne lub jonowe.',
      },
    ];
  },
};

function higherChiName(
  elA: { name: string } | undefined,
  elB: { name: string } | undefined,
  symbolA: string,
  symbolB: string,
): string {
  const chiA = PAULING_ELECTRONEGATIVITY[symbolA] ?? 0;
  const chiB = PAULING_ELECTRONEGATIVITY[symbolB] ?? 0;
  return chiA < chiB ? (elA?.name ?? symbolA) : (elB?.name ?? symbolB);
}
