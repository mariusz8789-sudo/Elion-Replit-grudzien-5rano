import type { ExperimentDef, Sim, SimParams } from '../../core/types';

/**
 * Geodezyjne fotonów wokół czarnej dziury Schwarzschilda + dysk akrecyjny.
 * Fizyka: dokładne równanie orbity zerowej d²u/dφ² = −u + (3/2)r_s u²
 * (u = 1/r), całkowane RK4 — to pełna OTW dla fotonu, nie przybliżenie.
 * Krytyczny parametr zderzenia: b_c = (3√3/2)·r_s ≈ 2,598 r_s.
 * Widok z góry (płaszczyzna równikowa); słynny obraz "Interstellar"
 * to widok z boku z soczewkowaniem — plan Etapu 2.
 */

const RS = 26; // promień Schwarzschilda w px ekranu

interface Photon {
  u: number;
  du: number;
  phi: number;
  dir: 1 | -1; // strona startu (góra/dół)
  b: number;
  dead: boolean;
  captured: boolean;
  trail: { x: number; y: number }[];
}

class GeodesicSim implements Sim {
  private photons: Photon[] = [];
  private spawnAcc = 0;
  private captured = 0;
  private escaped = 0;
  private t = 0;

  init() {}

  reset = () => {
    this.photons = [];
    this.captured = 0;
    this.escaped = 0;
  };

  private spawn(bScale: number) {
    const bc = (3 * Math.sqrt(3) / 2) * RS;
    // strumień fotonów wokół nastawionego b ± rozrzut
    const b = bc * bScale * (0.75 + Math.random() * 0.5);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const r0 = RS * 40;
    const phi0 = Math.PI - Math.asin(Math.min(1, b / r0));
    const u0 = Math.sin(phi0) / b;
    const du0 = Math.cos(phi0) / b;
    this.photons.push({ u: u0, du: du0, phi: phi0, dir: dir as 1 | -1, b, dead: false, captured: false, trail: [] });
  }

  update(dt: number, p: SimParams) {
    this.t += dt;
    this.spawnAcc += dt;
    if (this.spawnAcc > 0.3 && this.photons.length < 42) {
      this.spawnAcc = 0;
      this.spawn(Number(p.impact));
    }
    const dphi = 0.02;
    const f = (u: number) => -u + 1.5 * RS * u * u;
    for (const ph of this.photons) {
      if (ph.dead) {
        ph.trail.shift();
        continue;
      }
      const steps = Math.round(dt * 220);
      for (let s = 0; s < steps; s++) {
        // RK4 dla u(φ)
        const k1u = ph.du;
        const k1d = f(ph.u);
        const k2u = ph.du + 0.5 * dphi * k1d;
        const k2d = f(ph.u + 0.5 * dphi * k1u);
        const k3u = ph.du + 0.5 * dphi * k2d;
        const k3d = f(ph.u + 0.5 * dphi * k2u);
        const k4u = ph.du + dphi * k3d;
        const k4d = f(ph.u + dphi * k3u);
        ph.u += (dphi / 6) * (k1u + 2 * k2u + 2 * k3u + k4u);
        ph.du += (dphi / 6) * (k1d + 2 * k2d + 2 * k3d + k4d);
        ph.phi -= dphi; // foton leci w stronę malejącego φ (z lewej)
        if (ph.u > 1 / (RS * 1.01)) {
          ph.dead = true;
          ph.captured = true;
          this.captured++;
          break;
        }
        if (ph.u <= 1 / (RS * 44)) {
          ph.dead = true;
          this.escaped++;
          break;
        }
      }
      const r = 1 / ph.u;
      ph.trail.push({ x: r * Math.cos(ph.phi), y: ph.dir * r * Math.sin(ph.phi) });
      if (ph.trail.length > 160) ph.trail.shift();
    }
    this.photons = this.photons.filter((ph) => !ph.dead || ph.trail.length > 0);
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;

    // dysk akrecyjny: ISCO materii = 3 r_s do ~7 r_s; strona zbliżająca się
    // jaśniejsza (relatywistyczne wzmocnienie — poglądowo w widoku z góry)
    const isco = 3 * RS;
    for (let rr = isco; rr < 7 * RS; rr += 3) {
      const tGrad = 1 - (rr - isco) / (7 * RS - isco);
      for (let a = 0; a < Math.PI * 2; a += 0.05) {
        const rot = a + this.t * (14 / rr);
        const boost = 1 + 0.55 * Math.sin(rot); // strona ruchu ku nam
        const alpha = 0.12 + 0.4 * tGrad * boost;
        const hue = 35 + tGrad * 15;
        ctx.fillStyle = `hsla(${hue}, 90%, ${55 + tGrad * 25}%, ${alpha})`;
        ctx.fillRect(cx + rr * Math.cos(rot), cy + rr * Math.sin(rot) * 0.98, 2, 2);
      }
    }

    // tory fotonów
    for (const ph of this.photons) {
      ctx.strokeStyle = ph.captured ? 'rgba(244,124,124,0.7)' : 'rgba(92,214,232,0.65)';
      ctx.beginPath();
      ph.trail.forEach((pt, i) => {
        const x = cx + pt.x;
        const y = cy + pt.y;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // sfera fotonowa i horyzont
    ctx.strokeStyle = 'rgba(240,179,92,0.45)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, 1.5 * RS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(cx, cy, RS, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.strokeStyle = 'rgba(230,234,245,0.6)';
    ctx.stroke();

    ctx.fillStyle = 'rgba(230,234,245,0.7)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(`pochłonięte: ${this.captured} · uciekło: ${this.escaped}`, 10, h - 10);
    ctx.fillStyle = 'rgba(240,179,92,0.7)';
    ctx.fillText('sfera fotonowa 1,5 rₛ', cx + 1.5 * RS + 6, cy - 4);
  }

  getStats() {
    return { captured: this.captured, escaped: this.escaped };
  }
}

export const einsteinGeodesics: ExperimentDef = {
  id: 'geodesics',
  name: 'Geodezyjne + dysk',
  honesty: 'exact',
  honestyNote:
    'Tory fotonów: pełne równanie geodezyjnej zerowej Schwarzschilda (d²u/dφ² = −u + 1,5 r_s u²), całkowane RK4 — dokładna OTW. Dysk akrecyjny: poglądowy (widok z góry, jasność strony zbliżającej się ilustruje wzmocnienie relatywistyczne). Rendering z soczewkowaniem "jak Interstellar" — Etap 2.',
  params: [
    {
      key: 'impact', label: 'Parametr zderzenia b / b_krytyczne', type: 'slider',
      min: 0.5, max: 2.2, step: 0.05, default: 1.1,
      format: (v) => `${v.toFixed(2)}×`,
    },
  ],
  createSim: () => new GeodesicSim(),
  narrate(p, stats) {
    const bScale = Number(p.impact);
    const cap = Number(stats.captured ?? 0);
    const esc = Number(stats.escaped ?? 0);
    return [
      {
        title: `Granica: b_c = 2,598 r_s`,
        body:
          bScale < 0.95
            ? `Fotony celują poniżej krytycznego parametru zderzenia b_c = (3√3/2)·r_s — spirala śmierci: przecinają sferę fotonową (przerywany okrąg, 1,5 r_s) i wszystkie kończą pod horyzontem (czerwone tory). Dotąd pochłonięte: ${cap}.`
            : bScale < 1.25
              ? `Jesteś tuż przy b_c — fotony okrążają czarną dziurę po kilka razy, zanim zdecydują się uciec albo wpaść (${cap} pochłoniętych, ${esc} uciekło). Te niemal-uwięzione orbity tworzą słynny "pierścień fotonowy" widoczny na obrazach z Teleskopu Horyzontu Zdarzeń.`
              : `Przy b znacznie powyżej b_c fotony są tylko odchylane (${esc} uciekło) — im dalej mijają masę, tym słabiej. Dokładnie to ugięcie, zsumowane po wszystkich promieniach, daje soczewkowanie grawitacyjne całych galaktyk.`,
      },
      {
        title: 'Dysk akrecyjny: najjaśniejsze obiekty Wszechświata',
        body: 'Materia spiralująca ku ISCO (3 r_s — najciaśniejsza stabilna orbita) rozgrzewa się do milionów kelwinów tarciem. Strona dysku pędząca w naszą stronę świeci jaśniej (relatywistyczne wzmocnienie Dopplera) — stąd asymetria jasności na obrazie M87* z EHT. Kwazary tym mechanizmem prześwietlają połowę obserwowalnego Wszechświata.',
      },
    ];
  },
};
