import type { ExperimentDef, Sim, SimParams } from '../../core/types';

/**
 * Kolonizacja międzygwiezdna — model perkolacyjny: sondy lecą do najbliższych
 * gwiazd ze stałą prędkością, po dotarciu kolonia buduje kolejne sondy
 * (opóźnienie konsolidacji). Rachunek czasu ekspansji jest rzetelny co do
 * rzędu wielkości (front ~v·t); wszystko o motywacjach cywilizacji to
 * spekulacja — patrz paradoks Fermiego.
 */

interface StarNode {
  x: number;
  y: number;
  state: 'wild' | 'travelling' | 'colonized';
  eta: number; // czas dotarcia sondy (lata sym.)
  readyAt: number; // kiedy kolonia może wysyłać sondy
}

const FIELD_LY = 200; // szerokość pola w latach świetlnych

class ColonizationSim implements Sim {
  private stars: StarNode[] = [];
  private w = 0;
  private h = 0;
  private years = 0;
  private links: { a: number; b: number; t: number }[] = [];

  init(w: number, h: number) {
    this.w = w;
    this.h = h;
    if (this.stars.length === 0) this.seed();
  }

  private seed() {
    this.stars = [];
    this.links = [];
    this.years = 0;
    for (let i = 0; i < 420; i++) {
      this.stars.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h * 0.94,
        state: 'wild',
        eta: 0,
        readyAt: 0,
      });
    }
    // start: gwiazda najbliższa środka
    let best = 0;
    let bd = Infinity;
    this.stars.forEach((s, i) => {
      const d = (s.x - this.w / 2) ** 2 + (s.y - this.h / 2) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    this.stars[best].state = 'colonized';
    this.stars[best].readyAt = 0;
  }

  reset = () => {
    this.seed();
  };

  update(dt: number, p: SimParams) {
    const speedC = Math.pow(10, Number(p.speed)); // ułamek c
    const settleY = Number(p.settle); // lata konsolidacji
    const yearsPerSec = 220;
    const dy = dt * yearsPerSec;
    this.years += dy;

    const lyPerPx = FIELD_LY / this.w;
    const reach = this.w * 0.09; // zasięg pojedynczego skoku (px)

    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      if (s.state === 'travelling' && this.years >= s.eta) {
        s.state = 'colonized';
        s.readyAt = this.years + settleY;
      }
      if (s.state !== 'colonized' || this.years < s.readyAt) continue;
      // kolonia wysyła sondę do najbliższej dzikiej gwiazdy w zasięgu
      let bestJ = -1;
      let bd = Infinity;
      for (let j = 0; j < this.stars.length; j++) {
        const t = this.stars[j];
        if (t.state !== 'wild') continue;
        const d2 = (t.x - s.x) ** 2 + (t.y - s.y) ** 2;
        if (d2 < bd && d2 < reach * reach) {
          bd = d2;
          bestJ = j;
        }
      }
      if (bestJ >= 0) {
        const t = this.stars[bestJ];
        const distLy = Math.sqrt(bd) * lyPerPx;
        t.state = 'travelling';
        t.eta = this.years + distLy / speedC;
        s.readyAt = this.years + settleY * 0.4; // kolejne sondy szybciej
        this.links.push({ a: i, b: bestJ, t: 1 });
      }
    }
    for (const l of this.links) l.t -= dt * 0.25;
    this.links = this.links.filter((l) => l.t > 0);
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    for (const l of this.links) {
      const a = this.stars[l.a];
      const b = this.stars[l.b];
      ctx.strokeStyle = `rgba(240,179,92,${l.t * 0.5})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const s of this.stars) {
      if (s.state === 'colonized') {
        ctx.fillStyle = '#f0b35c';
        ctx.shadowColor = '#f0b35c';
        ctx.shadowBlur = 5;
        ctx.fillRect(s.x - 1.4, s.y - 1.4, 2.8, 2.8);
        ctx.shadowBlur = 0;
      } else if (s.state === 'travelling') {
        ctx.fillStyle = 'rgba(92,214,232,0.9)';
        ctx.fillRect(s.x - 1.2, s.y - 1.2, 2.4, 2.4);
      } else {
        ctx.fillStyle = 'rgba(200,215,255,0.45)';
        ctx.fillRect(s.x - 1, s.y - 1, 1.8, 1.8);
      }
    }
    const colonized = this.stars.filter((s) => s.state === 'colonized').length;
    ctx.fillStyle = 'rgba(230,234,245,0.75)';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(
      `rok ${Math.round(this.years).toLocaleString('pl-PL')} · skolonizowano ${colonized}/420 (pole ${FIELD_LY} lat św.)`,
      10, h - 8,
    );
  }

  getStats() {
    const colonized = this.stars.filter((s) => s.state === 'colonized').length;
    return { years: Math.round(this.years), colonized, frac: Math.round((colonized / 420) * 100) };
  }
}

export const civilizationColonization: ExperimentDef = {
  id: 'colonization',
  name: 'Kolonizacja',
  honesty: 'theoretical',
  honestyNote:
    'Model perkolacyjny ekspansji międzygwiezdnej. Rachunek czasu (front ≈ prędkość × czas + postoje) jest rzetelny co do rzędu wielkości i pochodzi z literatury paradoksu Fermiego; wszystko o motywacjach i technologii cywilizacji to spekulacja.',
  params: [
    {
      key: 'speed', label: 'Prędkość sond', type: 'slider',
      min: -3, max: -1, step: 0.1, default: -2,
      format: (v) => `${(Math.pow(10, v) * 100).toFixed(v < -2 ? 1 : 0)}% c`,
    },
    { key: 'settle', label: 'Konsolidacja kolonii', type: 'slider', min: 20, max: 800, step: 20, default: 200, unit: 'lat' },
  ],
  createSim: () => new ColonizationSim(),
  narrate(p, stats) {
    const frac = Number(stats.frac ?? 0);
    const years = Number(stats.years ?? 0);
    const speedC = Math.pow(10, Number(p.speed));
    // ekstrapolacja na Galaktykę: 100 000 ly / (v efektywne)
    const effV = speedC * 0.5; // postoje mniej więcej połowią tempo
    const galaxyYears = 100000 / effV;
    return [
      {
        title: frac < 60 ? `Front ekspansji: ${frac}% pola po ${years.toLocaleString('pl-PL')} latach` : `Pole nasycone w ${years.toLocaleString('pl-PL')} lat`,
        body: `Przy sondach ${(speedC * 100).toFixed(1)}% c i postojach na budowę kolonii front rozchodzi się z efektywną prędkością ~połowy prędkości sond. Ekstrapolacja na całą Drogę Mleczną (100 tys. lat św.): ~${(galaxyYears / 1e6).toFixed(0)} mln lat. Wiek Galaktyki to ~13 000 mln lat — miejsca na "już dawno powinni tu być" jest aż nadto.`,
      },
      {
        title: 'To jest serce paradoksu Fermiego',
        body: 'Hart (1975) policzył dokładnie to, co widzisz: kolonizacja Galaktyki trwa mgnienie w skali jej wieku, a mimo to nie widzimy nikogo (przegląd podczerwieni Ĝ w 10⁵ galaktyk: zero sygnatur cywilizacji typu III). Odpowiedzi — „jesteśmy pierwsi", „wielki filtr", „nie kolonizują" — pozostają hipotezami. Symulacja pokazuje siłę pytania, nie odpowiedź.',
      },
    ];
  },
};
