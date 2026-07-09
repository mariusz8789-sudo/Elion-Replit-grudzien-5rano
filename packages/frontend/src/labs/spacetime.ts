import type { LabDefinition, Sim, SimParams } from '../core/types';
import { spacetimeMinkowski } from './experiments/spacetime-minkowski';

/**
 * Space-Time Lab — dylatacja czasu na zegarach świetlnych.
 * Fizyka: dokładne wzory szczególnej teorii względności. W układzie
 * laboratoryjnym foton zegara ruchomego porusza się po ukośnej, dłuższej
 * drodze, więc tyka γ razy wolniej: γ = 1/√(1 − v²/c²). To nie przybliżenie —
 * to pełny wynik STW dla tej konfiguracji.
 */

class LightClockSim implements Sim {
  private y1 = 0; // foton zegara spoczywającego (0..1)
  private y2 = 0; // foton zegara ruchomego
  private dir1 = 1;
  private dir2 = 1;
  private ticks1 = 0;
  private ticks2 = 0;
  private x2 = 0; // pozycja pozioma zegara ruchomego
  private trail: { x: number; y: number }[] = [];

  init() {
    /* stan zachowywany między resize */
  }

  reset = () => {
    this.y1 = this.y2 = 0;
    this.dir1 = this.dir2 = 1;
    this.ticks1 = this.ticks2 = 0;
    this.x2 = 0;
    this.trail = [];
  };

  update(dt: number, p: SimParams) {
    const v = Number(p.v); // ułamek c
    const gammaInv = Math.sqrt(1 - v * v); // = 1/γ
    const cSpeed = 1.4; // pełne cykle zegara spoczywającego na sekundę

    this.y1 += this.dir1 * cSpeed * 2 * dt;
    if (this.y1 >= 1) { this.y1 = 1; this.dir1 = -1; }
    if (this.y1 <= 0) { this.y1 = 0; this.dir1 = 1; this.ticks1++; }

    // Składowa pionowa fotonu ruchomego zegara: c/γ (składowa pozioma = v).
    this.y2 += this.dir2 * cSpeed * 2 * gammaInv * dt;
    if (this.y2 >= 1) { this.y2 = 1; this.dir2 = -1; }
    if (this.y2 <= 0) { this.y2 = 0; this.dir2 = 1; this.ticks2++; }

    this.x2 = (this.x2 + v * 0.25 * dt) % 1;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    const clockH = h * 0.52;
    const top = h * 0.2;
    const mirror = (x: number, cw: number) => {
      ctx.fillStyle = '#8d97b4';
      ctx.fillRect(x - cw / 2, top - 5, cw, 4);
      ctx.fillRect(x - cw / 2, top + clockH + 1, cw, 4);
    };
    const photon = (x: number, yFrac: number, color: string) => {
      const y = top + clockH * (1 - yFrac);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    const cw = Math.min(w * 0.2, 90);
    const x1 = w * 0.25;
    mirror(x1, cw);
    photon(x1, this.y1, '#5cd6e8');

    const x2px = w * 0.45 + this.x2 * w * 0.45;
    // Ślad ukośnej drogi fotonu ruchomego zegara
    this.trail.push({ x: x2px, y: top + clockH * (1 - this.y2) });
    if (this.trail.length > 90) this.trail.shift();
    ctx.strokeStyle = 'rgba(240,179,92,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    this.trail.forEach((t, i) => (i === 0 ? ctx.moveTo(t.x, t.y) : ctx.lineTo(t.x, t.y)));
    ctx.stroke();
    mirror(x2px, cw);
    photon(x2px, this.y2, '#f0b35c');

    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = '#5cd6e8';
    ctx.fillText(`zegar spoczywa: ${this.ticks1} tyknięć`, 12, h - 30);
    ctx.fillStyle = '#f0b35c';
    ctx.fillText(`zegar w ruchu:  ${this.ticks2} tyknięć`, 12, h - 12);
    ctx.fillStyle = 'rgba(230,234,245,0.6)';
    ctx.font = '10px system-ui';
    ctx.fillText('foton ruchomego zegara przebywa dłuższą, ukośną drogę', 12, 16);
  }

  getStats() {
    return { ticks1: this.ticks1, ticks2: this.ticks2 };
  }
}

export const spacetimeLab: LabDefinition = {
  id: 'spacetime',
  name: 'Space-Time Lab',
  tagline: 'Dylatacja czasu, paradoks bliźniąt, zegary świetlne',
  icon: '⏳',
  accent: '#5cd6e8',
  honesty: 'exact',
  honestyNote:
    'Wzory dylatacji czasu są dokładnym wynikiem szczególnej teorii względności — bez uproszczeń. Uproszczona jest tylko grafika zegarów. Paradoks bliźniąt liczony dla lotu ze stałą prędkością z natychmiastowym zawrotem.',
  params: [
    {
      key: 'v', label: 'Prędkość zegara', type: 'slider', min: 0, max: 0.99, step: 0.01, default: 0.6,
      format: (v) => `${(v * 100).toFixed(0)}% c`,
    },
    { key: 'tripYears', label: 'Podróż bliźniaka (czas Ziemi)', type: 'slider', min: 2, max: 60, step: 1, default: 20, unit: 'lat' },
  ],
  createSim: () => new LightClockSim(),
  experiments: [spacetimeMinkowski],
  narrate(p, stats) {
    const v = Number(p.v);
    const gamma = 1 / Math.sqrt(1 - v * v);
    const trip = Number(p.tripYears);
    const travelerYears = trip / gamma;
    const t1 = Number(stats.ticks1 ?? 0);
    const t2 = Number(stats.ticks2 ?? 0);
    return [
      {
        title: `Czynnik Lorentza γ = ${gamma.toFixed(2)}`,
        body:
          v === 0
            ? 'Oba zegary spoczywają — tykają identycznie. Przesuń suwak prędkości, aby zobaczyć, jak ruch spowalnia czas.'
            : `Przy ${(v * 100).toFixed(0)}% prędkości światła czas ruchomego zegara płynie ${gamma.toFixed(2)}× wolniej. Na ekranie: ${t1} tyknięć zegara spoczywającego wobec ${t2} ruchomego — stosunek dąży do γ.`,
      },
      {
        title: 'Paradoks bliźniąt',
        body: `Bliźniak lecący ${(v * 100).toFixed(0)}% c przez ${trip} lat czasu ziemskiego wraca młodszy: postarzeje się o ${travelerYears.toFixed(1)} lat, jego brat na Ziemi o ${trip}. Różnica ${(trip - travelerYears).toFixed(1)} lat jest realna — to nie złudzenie, a geometria czasoprzestrzeni. Asymetrię rozstrzyga zwrot: to podróżnik zmienia układ odniesienia.`,
      },
      {
        title: 'To dzieje się naprawdę',
        body: 'Miony z promieniowania kosmicznego docierają do powierzchni Ziemi tylko dzięki dylatacji czasu, a zegary satelitów GPS trzeba korygować o efekty względnościowe — bez tego nawigacja myliłaby się o kilometry dziennie.',
      },
    ];
  },
};
