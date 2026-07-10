import type { LabDefinition, Sim, SimParams } from '../core/types';
import { universeCollision } from './experiments/universe-collision';
import { universeStarLife } from './experiments/universe-starlife';
import { universeSolarSystem } from './experiments/universe-solar-system';
import { universeSolarSystem3D } from './experiments/universe-solar-system-3d';

/**
 * Universe Lab — ekspansja Wszechświata.
 * Fizyka: równanie Friedmanna w płaskim wszechświecie (Ωm + ΩΛ = 1),
 * H(a) = H0·√(Ωm/a³ + ΩΛ). Galaktyki mają stałe współrzędne współporuszające;
 * rośnie czynnik skali a(t). Uproszczenia: brak promieniowania, struktury
 * lokalne nie odrywają się od ekspansji.
 */

interface Galaxy {
  x: number;
  y: number;
  hue: number;
  size: number;
}

class UniverseSim implements Sim {
  private galaxies: Galaxy[] = [];
  private a = 0.05;
  private ageGyr = 0;
  private H = 0;

  init() {
    if (this.galaxies.length === 0) this.seed();
  }

  private seed() {
    this.galaxies = [];
    for (let i = 0; i < 260; i++) {
      const r = Math.sqrt(Math.random());
      const th = Math.random() * Math.PI * 2;
      this.galaxies.push({
        x: r * Math.cos(th),
        y: r * Math.sin(th),
        hue: 190 + Math.random() * 120,
        size: 0.6 + Math.random() * 1.6,
      });
    }
  }

  reset = () => {
    this.a = 0.05;
    this.ageGyr = 0;
    this.seed();
  };

  update(dt: number, p: SimParams) {
    const H0 = Number(p.h0) / 978; // km/s/Mpc → 1/Gyr
    const oL = Number(p.omegaLambda);
    const om = 1 - oL;
    const speed = Number(p.speed); // Gyr na sekundę
    this.H = H0 * Math.sqrt(om / this.a ** 3 + oL);
    this.a += this.a * this.H * dt * speed;
    this.ageGyr += dt * speed;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const cx = w / 2;
    const cy = h / 2;
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.75);
    bgGrad.addColorStop(0, '#05060f');
    bgGrad.addColorStop(1, '#000004');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
    // Kamera oddala się częściowo, gdy ekspansja przerasta ekran — ekspansja
    // pozostaje widoczna, ale galaktyki nie znikają (audyt Etapu 0, pkt 2)
    const K = (Math.min(w, h) * 0.48) / Math.max(1, Math.pow(this.a / 1.1, 0.7));
    for (const g of this.galaxies) {
      const px = cx + g.x * this.a * K;
      const py = cy + g.y * this.a * K;
      if (px < -10 || px > w + 10 || py < -10 || py > h + 10) continue;
      // Poglądowe "przesunięcie ku czerwieni": im dalej, tym bardziej czerwono.
      const d = Math.hypot(g.x, g.y) * this.a;
      const hue = Math.max(0, g.hue - d * 160);
      // Jasność pozorna ∝ 1/d² (prawo odwrotnych kwadratów) — bliższe
      // galaktyki świecą mocniej, dalekie/przesunięte ku czerwieni gasną.
      const brightness = Math.min(1, 0.35 / (d * d + 0.12));
      ctx.fillStyle = `hsla(${hue}, 80%, 70%, 0.9)`;
      if (brightness > 0.3) {
        ctx.shadowColor = `hsla(${hue}, 85%, 65%, ${Math.min(0.9, brightness)})`;
        ctx.shadowBlur = 6 * brightness;
      }
      ctx.beginPath();
      ctx.arc(px, py, g.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // Obserwator
    ctx.fillStyle = '#f0b35c';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(240,179,92,0.8)';
    ctx.font = '10px system-ui';
    ctx.fillText('Ty jesteś tutaj', cx + 7, cy + 3);
    ctx.fillStyle = 'rgba(230,234,245,0.75)';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(`wiek: ${this.ageGyr.toFixed(1)} mld lat · a = ${this.a.toFixed(2)}`, 10, h - 12);
  }

  getStats() {
    return { ageGyr: Math.round(this.ageGyr * 10) / 10, a: Math.round(this.a * 100) / 100, H: this.H };
  }
}

export const universeLab: LabDefinition = {
  id: 'universe',
  name: 'Universe Lab',
  tagline: 'Ekspansja Wszechświata, galaktyki, ciemna energia',
  icon: '🌌',
  accent: '#f0b35c',
  honesty: 'simplified',
  honestyNote:
    'Równanie Friedmanna dla płaskiego wszechświata (materia + ciemna energia). Pominięte: promieniowanie, powstawanie struktur, lokalna grawitacja. Kolory galaktyk poglądowo ilustrują redshift.',
  params: [
    { key: 'h0', label: 'Stała Hubble\'a H₀', type: 'slider', min: 50, max: 100, step: 1, default: 70, unit: 'km/s/Mpc' },
    { key: 'omegaLambda', label: 'Ciemna energia Ω_Λ', type: 'slider', min: 0, max: 0.99, step: 0.01, default: 0.69 },
    { key: 'speed', label: 'Tempo czasu', type: 'slider', min: 0.2, max: 5, step: 0.1, default: 1, unit: 'mld lat/s' },
  ],
  createSim: () => new UniverseSim(),
  experiments: [universeSolarSystem, universeSolarSystem3D, universeCollision, universeStarLife],
  narrate(p, stats) {
    const h0 = Number(p.h0);
    const oL = Number(p.omegaLambda);
    const om = 1 - oL;
    const q0 = om / 2 - oL;
    const hubbleTime = 978 / h0;
    const v100 = h0 * 100;
    const blocks = [
      {
        title: `Prawo Hubble'a przy H₀ = ${h0} km/s/Mpc`,
        body: `Galaktyka odległa o 100 megaparseków ucieka od nas z prędkością ~${v100.toLocaleString('pl-PL')} km/s — to ${(v100 / 299792 * 100).toFixed(1)}% prędkości światła. Czas Hubble'a (odwrotność H₀) wynosi ~${hubbleTime.toFixed(1)} mld lat i wyznacza rząd wielkości wieku Wszechświata.`,
      },
      {
        title: q0 < 0 ? 'Ekspansja przyspiesza' : 'Ekspansja zwalnia',
        body:
          q0 < 0
            ? `Przy Ω_Λ = ${oL.toFixed(2)} ciemna energia dominuje nad grawitacją materii (Ω_m = ${om.toFixed(2)}) — dokładnie to odkryto w 1998 r. obserwując supernowe typu Ia (Nagroda Nobla 2011).`
            : `Przy Ω_Λ = ${oL.toFixed(2)} materia (Ω_m = ${om.toFixed(2)}) wciąż wygrywa — grawitacja hamuje ekspansję. Tak wyglądałby wszechświat bez dominującej ciemnej energii.`,
      },
    ];
    if (stats.a && stats.a > 1.5) {
      blocks.push({
        title: 'Eksperyment do wykonania',
        body: 'Czynnik skali przekroczył 1,5 — zestaw Ω_Λ do zera i porównaj, jak szybko rosłaby ta sama symulacja bez ciemnej energii. Przycisk „Od nowa" restartuje od Wielkiego Wybuchu.',
      });
    }
    return blocks;
  },
};
