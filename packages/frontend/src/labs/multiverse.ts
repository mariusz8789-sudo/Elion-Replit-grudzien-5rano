import type { LabDefinition, Sim, SimParams } from '../core/types';
import { multiverseTesseract } from './experiments/multiverse-tesseract';

/**
 * Multiverse Lab — alternatywne stałe fizyczne. MODEL TEORETYCZNY.
 * Pytanie "co by było, gdyby stałe miały inne wartości" jest uprawnionym
 * narzędziem fizyki teoretycznej (literatura fine-tuningu), ale wnioski są
 * szacunkami rzędów wielkości, a istnienie innych wszechświatów to hipoteza
 * bez potwierdzenia obserwacyjnego. Skalowania: czas życia gwiazd ~ G⁻²
 * (argument rzędu wielkości); progi siły silnej (±~10%: diproton/deuter)
 * i α (±kilka %) — za literaturą fine-tuningu.
 */

/** Presety scenariuszy: nadpisują suwaki, gdy wybrano scenariusz ≠ własny. */
function effectiveConstants(p: SimParams): {
  g: number;
  alpha: number;
  strong: number;
  presetNote: { title: string; body: string } | null;
} {
  const preset = String(p.preset ?? 'custom');
  if (preset === 'carbonless') {
    return {
      g: 1, alpha: 1, strong: 0.86,
      presetNote: {
        title: 'Scenariusz: wszechświat bez węgla',
        body: 'Oddziaływanie silne osłabione do 0,86× — deuter przestaje być związany, pierwsze ogniwo syntezy pęka. Gwiazdy świecą (kontrakcja grawitacyjna), ale nigdy nie powstaje węgiel, tlen ani chemia organiczna. Wieczny wszechświat wodoru.',
      },
    };
  }
  if (preset === 'explosive') {
    return {
      g: 1, alpha: 1, strong: 1.14,
      presetNote: {
        title: 'Scenariusz: wybuchowe gwiazdy',
        body: 'Oddziaływanie silne wzmocnione do 1,14× — diproton (²He) staje się związany i spalanie wodoru przestaje być powolnym wąskim gardłem. Gwiazdy przelatują przez paliwo w mgnieniu oka; brak miliardów lat stabilnego świecenia, których wymagała ewolucja na Ziemi.',
      },
    };
  }
  if (preset === 'crushing') {
    return {
      g: Math.pow(10, 0.7), alpha: 1, strong: 1,
      presetNote: {
        title: 'Scenariusz: ciężka grawitacja (5×G)',
        body: 'Gwiazdy są mniejsze, gorętsze i żyją ~25× krócej (t ~ G⁻²); planety krążą ciasno i szybko, a góry i organizmy większe niż owady załamują się pod własnym ciężarem. Okno czasowe na ewolucję złożonego życia niemal się zamyka.',
      },
    };
  }
  return { g: Math.pow(10, Number(p.g)), alpha: Number(p.alpha), strong: Number(p.strong), presetNote: null };
}

class AltStarSim implements Sim {
  private t = 0;
  private planetAng = 0;
  private params: SimParams = { g: 1, alpha: 1, strong: 1 };

  init() {}

  update(dt: number, p: SimParams) {
    this.t += dt;
    this.params = p;
    // Prędkość orbitalna ∝ √G
    this.planetAng += dt * 0.8 * Math.sqrt(Number(p.g));
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    const g = Number(this.params.g);
    const strong = Number(this.params.strong);
    const cx = w / 2;
    const cy = h / 2;

    // Gwiazda: przy większym G gwiazdy są gęstsze, gorętsze, krótkowieczne.
    const starR = Math.min(w, h) * 0.13 / Math.pow(g, 0.25);
    const hot = Math.min(1, Math.max(0, (g - 1) * 0.5 + (strong - 1) * 2));
    const hue = 45 - hot * 25; // złota → biało-niebieska? poglądowo: złota → czerwona przy słabej
    const unstable = strong > 1.09 || strong < 0.91;
    const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, starR * 2.2);
    grad.addColorStop(0, unstable ? '#f47c7c' : `hsl(${hue}, 90%, ${70 + hot * 15}%)`);
    grad.addColorStop(0.45, unstable ? 'rgba(244,124,124,0.35)' : `hsla(${hue}, 90%, 60%, 0.4)`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, starR * 2.2, 0, Math.PI * 2);
    ctx.fill();
    const flicker = unstable ? 1 + Math.sin(this.t * 30) * 0.15 : 1;
    ctx.fillStyle = unstable ? '#ffb0b0' : `hsl(${hue}, 85%, ${78 + hot * 12}%)`;
    ctx.beginPath();
    ctx.arc(cx, cy, starR * flicker, 0, Math.PI * 2);
    ctx.fill();

    // Ekosfera: r ∝ √L; L rośnie z G — poglądowo przesuwamy pierścień.
    const hz = Math.min(w, h) * 0.33 * Math.pow(g, 0.4);
    ctx.strokeStyle = 'rgba(110,231,160,0.35)';
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, hz, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(110,231,160,0.7)';
    ctx.font = '9px system-ui';
    ctx.fillText('ekosfera', cx + hz * 0.72, cy - hz * 0.72);

    // Planeta na stałej orbicie
    const orbR = Math.min(w, h) * 0.33;
    ctx.strokeStyle = 'rgba(141,151,180,0.25)';
    ctx.beginPath();
    ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
    ctx.stroke();
    const px = cx + orbR * Math.cos(this.planetAng);
    const py = cy + orbR * Math.sin(this.planetAng);
    const inHz = Math.abs(orbR - hz) < Math.min(w, h) * 0.06;
    ctx.fillStyle = inHz ? '#5cd6e8' : '#8d97b4';
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(167,139,250,0.85)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('MODEL TEORETYCZNY — hipotetyczny wszechświat', 10, 16);
  }
}

export const multiverseLab: LabDefinition = {
  id: 'multiverse',
  name: 'Multiverse Lab',
  tagline: 'Co gdyby stałe fizyczne były inne? (hipotezy)',
  icon: '🔮',
  accent: '#a78bfa',
  honesty: 'theoretical',
  honestyNote:
    'Wszystko tutaj to modele teoretyczne. Skalowania (czas życia gwiazd, progi stabilności jąder) są szacunkami rzędów wielkości z literatury fine-tuningu. Istnienie innych wszechświatów oraz interpretacja wielu światów to hipotezy bez potwierdzenia obserwacyjnego.',
  params: [
    {
      key: 'preset', label: 'Scenariusz', type: 'select', default: 'custom',
      options: [
        { value: 'custom', label: 'Własny' },
        { value: 'carbonless', label: 'Bez węgla' },
        { value: 'explosive', label: 'Wybuchowe gwiazdy' },
        { value: 'crushing', label: 'Ciężka grawitacja' },
      ],
    },
    {
      key: 'g', label: 'Grawitacja (×G)', type: 'slider', min: -1, max: 1, step: 0.05, default: 0,
      format: (v) => `${Math.pow(10, v).toFixed(2)}×`,
    },
    {
      key: 'alpha', label: 'Siła elektromagnetyczna (×α)', type: 'slider', min: 0.8, max: 1.2, step: 0.01, default: 1,
      format: (v) => `${v.toFixed(2)}×`,
    },
    {
      key: 'strong', label: 'Oddziaływanie silne', type: 'slider', min: 0.8, max: 1.2, step: 0.01, default: 1,
      format: (v) => `${v.toFixed(2)}×`,
    },
  ],
  createSim: () => {
    const sim = new AltStarSim();
    // Suwak G jest logarytmiczny (param = wykładnik); presety nadpisują suwaki.
    const upd = sim.update.bind(sim);
    sim.update = (dt, p) => {
      const eff = effectiveConstants(p);
      upd(dt, { ...p, g: eff.g, alpha: eff.alpha, strong: eff.strong });
    };
    return sim;
  },
  narrate(p) {
    const { g, alpha, strong, presetNote } = effectiveConstants(p);
    const starLife = 10 / (g * g); // Słońce ~10 mld lat, t ~ G⁻²
    const blocks = [];

    if (presetNote) {
      blocks.push({ title: presetNote.title, kind: 'hypothesis' as const, body: presetNote.body });
    }

    blocks.push({
      title: `Gwiazdy: żyją ~${starLife < 0.01 ? starLife.toExponential(1) : starLife.toFixed(starLife < 1 ? 2 : 1)} mld lat`,
      kind: 'hypothesis' as const,
      body:
        g > 1.5
          ? `Przy ${g.toFixed(1)}× silniejszej grawitacji gwiazdy palą się gwałtowniej (t ~ G⁻²). Odpowiednik Słońca zgasłby po ~${(starLife).toFixed(2)} mld lat — ewolucja złożonego życia na Ziemi potrzebowała ~4 mld. Okno na życie dramatycznie się zwęża.`
          : g < 0.7
            ? `Przy ${g.toFixed(2)}× słabszej grawitacji gwiazdy żyją ~${starLife.toFixed(0)} mld lat, ale trudniej im się zapalić, a formowanie galaktyk i planet spowalnia. Wszechświat robi się zimny i pusty.`
            : 'Grawitacja bliska naszej: gwiazdy pokroju Słońca palą wodór ~10 mld lat — wystarczająco długo, by na planetach zdążyła zajść ewolucja.',
    });

    const strongVerdict =
      strong > 1.09
        ? 'KATASTROFA: przy sile silnej +9% i więcej dwa protony wiążą się w diproton — gwiazdy spalałyby wodór wybuchowo, zamiast powoli przez miliardy lat.'
        : strong < 0.91
          ? 'KATASTROFA: przy sile silnej −9% i mniej deuter przestaje być związany — pierwsze ogniwo syntezy pierwiastków pęka. Wszechświat czystego wodoru: bez węgla, tlenu, chemii.'
          : 'Siła silna w "oknie życia" (±~9%): deuter stabilny, diproton nie — synteza pierwiastków w gwiazdach przebiega powoli i stabilnie, jak u nas.';
    blocks.push({ title: 'Jądra atomowe', kind: 'hypothesis' as const, body: strongVerdict });

    if (Math.abs(alpha - 1) > 0.04) {
      blocks.push({
        title: 'Chemia pod znakiem zapytania',
        kind: 'hypothesis' as const,
        body: `Przy α = ${alpha.toFixed(2)}× zmieniają się energie wiązań chemicznych i przebieg syntezy węgla w gwiazdach (rezonans Hoyle'a jest czuły na poziomie pojedynczych procent). Chemia węglowa, na której opiera się znane nam życie, staje się wątpliwa.`,
      });
    }

    blocks.push({
      title: 'Dlaczego fizycy w ogóle o tym myślą',
      kind: 'hypothesis' as const,
      body: 'Pozorna precyzja dostrojenia stałych to jeden z motorów debaty o multiwersum: teoria inflacji i teoria strun dopuszczają wiele "bąbli" z różnymi stałymi, a interpretacja wielu światów Everetta to odrębna hipoteza dotycząca pomiaru kwantowego. Żadna z tych idei nie ma dziś potwierdzenia obserwacyjnego — dlatego całe to laboratorium nosi fioletową etykietę.',
    });

    return blocks;
  },
  experiments: [multiverseTesseract],
};
