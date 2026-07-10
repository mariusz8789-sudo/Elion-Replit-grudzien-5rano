import type { LabDefinition, NarrationBlock, Sim, SimParams } from '../core/types';
import { sci } from '../core/useSimLoop';
import { einsteinGeodesics } from './experiments/einstein-geodesics';
import { einsteinLensing } from './experiments/einstein-lensing';
import { einsteinBlackHole3D } from './experiments/einstein-blackhole-3d';

/**
 * Einstein Lab — zakrzywienie biegu światła przy masie.
 * Fizyka: przybliżenie słabego pola OTW — ugięcie α = 4GM/(c²b), realizowane
 * przez całkowanie fotonów z "siłą" 2GM/r² (współczynnik 2 względem Newtona
 * odtwarza wynik Einsteina z 1915 r.). Metryka Kerra: poglądowa wizualizacja
 * frame-draggingu. Alcubierre: czysto hipotetyczny model, oznaczony.
 */

const G = 6.674e-11;
const C = 2.998e8;
const MSUN = 1.989e30;

interface Photon { x: number; y: number; vx: number; vy: number; dead: boolean; trail: { x: number; y: number }[] }

class GravityLightSim implements Sim {
  private photons: Photon[] = [];
  private w = 0;
  private h = 0;
  private spawnAcc = 0;
  private bubbleX = 0;
  private mode = 'schwarzschild';

  init(w: number, h: number) {
    this.w = w;
    this.h = h;
  }

  reset = () => {
    this.photons = [];
    this.bubbleX = 0;
  };

  update(dt: number, p: SimParams) {
    this.mode = String(p.metric);
    if (this.mode === 'alcubierre') {
      this.bubbleX = (this.bubbleX + dt * 0.25) % 1.3;
      return;
    }
    // Promień Schwarzschilda na ekranie: stała wizualna (fizyka w narracji).
    const rsPx = 14;
    const cPx = 160; // "prędkość światła" w px/s
    const strength = 2 * rsPx * cPx * cPx * 0.5; // ~2GM w jednostkach ekranu

    this.spawnAcc += dt;
    if (this.spawnAcc > 0.25 && this.photons.length < 60) {
      this.spawnAcc = 0;
      const y = this.h * (0.08 + Math.random() * 0.84);
      this.photons.push({ x: -5, y, vx: cPx, vy: 0, dead: false, trail: [] });
    }

    const cx = this.w / 2;
    const cy = this.h / 2;
    for (const ph of this.photons) {
      if (ph.dead) continue;
      const sub = 4;
      for (let i = 0; i < sub; i++) {
        const ddt = dt / sub;
        const dx = cx - ph.x;
        const dy = cy - ph.y;
        const r2 = dx * dx + dy * dy;
        const r = Math.sqrt(r2);
        if (r < rsPx * 1.5) { ph.dead = true; break; } // sfera fotonowa
        const a = strength / r2;
        ph.vx += (a * dx / r) * ddt;
        ph.vy += (a * dy / r) * ddt;
        if (String(p.metric) === 'kerr') {
          // Poglądowy frame-dragging: składowa styczna narastająca przy masie.
          const drag = (strength * 0.35) / r2;
          ph.vx += (-dy / r) * drag * ddt;
          ph.vy += (dx / r) * drag * ddt;
        }
        // renormalizacja |v| = c
        const sp = Math.hypot(ph.vx, ph.vy);
        ph.vx = (ph.vx / sp) * cPx;
        ph.vy = (ph.vy / sp) * cPx;
        ph.x += ph.vx * ddt;
        ph.y += ph.vy * ddt;
      }
      ph.trail.push({ x: ph.x, y: ph.y });
      if (ph.trail.length > 70) ph.trail.shift();
      if (ph.x > this.w + 20 || ph.x < -30 || ph.y < -30 || ph.y > this.h + 30) {
        ph.trail.shift();
        if (ph.trail.length === 0) ph.dead = true;
      }
    }
    this.photons = this.photons.filter((ph) => !ph.dead || ph.trail.length > 0);
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const rsPx = 14;

    if (this.mode === 'alcubierre') {
      this.renderAlcubierre(ctx, w, h);
      return;
    }

    // Siatka czasoprzestrzeni (wizualizacja poglądowa)
    ctx.strokeStyle = 'rgba(92,214,232,0.16)';
    ctx.lineWidth = 1;
    const step = 34;
    const warp = (x: number, y: number) => {
      const dx = cx - x;
      const dy = cy - y;
      const r = Math.max(Math.hypot(dx, dy), rsPx * 1.2);
      const k = (rsPx * 22) / (r * r);
      return { x: x + dx * k, y: y + dy * k };
    };
    for (let gx = 0; gx <= w; gx += step) {
      ctx.beginPath();
      for (let gy = 0; gy <= h; gy += 8) {
        const p = warp(gx, gy);
        if (gy === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    for (let gy = 0; gy <= h; gy += step) {
      ctx.beginPath();
      for (let gx = 0; gx <= w; gx += 8) {
        const p = warp(gx, gy);
        if (gx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // Fotony
    for (const ph of this.photons) {
      ctx.strokeStyle = 'rgba(240,179,92,0.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ph.trail.forEach((t, i) => (i === 0 ? ctx.moveTo(t.x, t.y) : ctx.lineTo(t.x, t.y)));
      ctx.stroke();
    }

    // Czarna dziura: horyzont + pierścień fotonowy
    ctx.beginPath();
    ctx.arc(cx, cy, rsPx * 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(240,179,92,0.5)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, rsPx, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.strokeStyle = 'rgba(230,234,245,0.5)';
    ctx.stroke();
  }

  /** Bańka Alcubierre'a — czysto poglądowa wizualizacja modelu hipotetycznego. */
  private renderAlcubierre(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const bx = -w * 0.15 + this.bubbleX * w;
    const by = h / 2;
    const R = Math.min(w, h) * 0.16;
    ctx.strokeStyle = 'rgba(167,139,250,0.25)';
    ctx.lineWidth = 1;
    const step = 30;
    for (let gx = 0; gx <= w; gx += step) {
      ctx.beginPath();
      for (let gy = 0; gy <= h; gy += 8) {
        const dx = gx - bx;
        const dy = gy - by;
        const r = Math.hypot(dx, dy);
        // Kontrakcja przed bańką, ekspansja za nią (kształt poglądowy).
        const k = Math.exp(-((r - R) ** 2) / (R * R)) * (dx > 0 ? -14 : 14);
        ctx.lineTo(gx + k, gy);
      }
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(bx, by, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(167,139,250,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#e6eaf5';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('bańka warp (model hipotetyczny)', w / 2, h - 14);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a78bfa';
    ctx.beginPath();
    ctx.arc(bx, by, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const einsteinLab: LabDefinition = {
  id: 'einstein',
  name: 'Einstein Lab',
  tagline: 'OTW: zakrzywienie światła, metryki, czarne dziury',
  icon: '🕳️',
  accent: '#a78bfa',
  honesty: 'simplified',
  honestyNote:
    'Ugięcie światła: przybliżenie słabego pola OTW (α = 4GM/c²b) — poprawne z dala od horyzontu. Siatka i frame-dragging Kerra są poglądowe. Metryka Alcubierre\'a to model hipotetyczny: matematycznie spójny, wymaga egzotycznej materii, której istnienia nie potwierdzono.',
  params: [
    {
      key: 'mass', label: 'Masa centralna', type: 'slider', min: 1, max: 9, step: 0.1, default: 6,
      format: (v) => `10${String(Math.round(v)).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d])} mas Słońca`,
    },
    {
      key: 'metric', label: 'Metryka', type: 'select', default: 'schwarzschild',
      options: [
        { value: 'schwarzschild', label: 'Schwarzschilda' },
        { value: 'kerr', label: 'Kerra (rotacja)' },
        { value: 'alcubierre', label: 'Alcubierre\'a (hipoteza)' },
      ],
    },
  ],
  createSim: () => new GravityLightSim(),
  experiments: [einsteinGeodesics, einsteinBlackHole3D, einsteinLensing],
  narrate(p) {
    const M = 10 ** Number(p.mass) * MSUN;
    const rs = (2 * G * M) / (C * C);
    const metric = String(p.metric);
    const blocks: NarrationBlock[] = [
      {
        title: `Promień Schwarzschilda: ${sci(rs / 1000, 2)} km`,
        body: `Dla masy 10^${Math.round(Number(p.mass))} mas Słońca horyzont zdarzeń ma promień r_s = 2GM/c² ≈ ${sci(rs / 1000, 2)} km. Sfera fotonowa (1,5 r_s) to granica, poniżej której światło zostaje uwięzione — symulacja pochłania tam fotony. Dla porównania: Sagittarius A* w centrum Drogi Mlecznej (4×10⁶ M☉) ma horyzont ~12 mln km.`,
      },
    ];
    if (metric === 'kerr') {
      blocks.push({
        title: 'Metryka Kerra — wirująca czarna dziura',
        body: 'Rotująca masa "ciągnie" za sobą czasoprzestrzeń (frame-dragging) — fotony są odchylane stycznie, co widać w zawijaniu torów. Efekt zmierzyła sonda Gravity Probe B (2011). Wizualizacja jest poglądowa: pełna geodezyjna Kerra trafi do Etapu 1.',
      });
    }
    if (metric === 'alcubierre') {
      blocks.push({
        title: 'Napęd Alcubierre\'a — hipoteza, nie technologia',
        kind: 'hypothesis' as const,
        body: 'Metryka z 1994 r.: bańka kurcząca przestrzeń przed statkiem i rozszerzająca za nim. Matematycznie zgodna z OTW, ale wymaga materii o ujemnej gęstości energii w astronomicznych ilościach — nic takiego nie zaobserwowano. Traktuj jako ćwiczenie z geometrii, nie zapowiedź podróży nadświetlnych.',
      });
    } else {
      blocks.push({
        title: 'Test z 1919 roku',
        body: 'Ugięcie światła gwiazd przy tarczy Słońca (1,75 sekundy łuku) zmierzone podczas zaćmienia przez ekspedycję Eddingtona uczyniło Einsteina sławnym z dnia na dzień. Ten sam wzór α = 4GM/c²b napędza fotony na tym ekranie.',
      });
    }
    return blocks;
  },
};
