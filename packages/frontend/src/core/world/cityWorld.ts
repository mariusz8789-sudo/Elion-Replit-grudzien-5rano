import type { WorldObject } from '../simulation/types';

/**
 * CITY WORLD — statyczna geometria „małego miasta" dla Visual Scene Engine.
 *
 * Budynki (domy, sklep, szkoła, szpital, izolatka, park) rozmieszczone wokół
 * siatki ulic. Świat dostarcza CELE RUCHU agentom (dokąd idą) i wie, które
 * obiekty są zamknięte przez interwencję. To NIE dekoracja — pozycje budynków
 * realnie sterują tym, gdzie agenci się gromadzą, więc gdzie dochodzi do
 * kontaktów i transmisji.
 */

export type BuildingKind = 'home' | 'shop' | 'school' | 'hospital' | 'isolation' | 'park';

export interface Building extends WorldObject {
  kind: BuildingKind;
  cx: number; cy: number; // środek (punkt docelowy)
}

export interface CityLayout {
  width: number;
  height: number;
  buildings: Building[];
  /** Poziome i pionowe ulice (pasy) — tło + „gdzie agenci chodzą". */
  streetsH: number[];
  streetsV: number[];
}

/** Deterministyczny układ miasta (zależny tylko od rozmiaru — powtarzalny). */
export function buildCity(width = 900, height = 620): CityLayout {
  const b: Building[] = [];
  const add = (kind: BuildingKind, x: number, y: number, w: number, h: number, label?: string) =>
    b.push({ kind, x, y, w, h, cx: x + w / 2, cy: y + h / 2, label });

  // Główne obiekty publiczne (środek/rogi), reszta to domy w dzielnicach.
  add('shop', width * 0.44, height * 0.12, 90, 60, 'Sklep');
  add('school', width * 0.10, height * 0.12, 110, 70, 'Szkoła');
  add('hospital', width * 0.78, height * 0.10, 110, 80, 'Szpital');
  add('isolation', width * 0.80, height * 0.74, 130, 110, 'Izolacja');
  add('park', width * 0.40, height * 0.60, 150, 120, 'Park');

  // Dzielnice mieszkalne: siatka małych domów w trzech kwartałach.
  const homeBlocks = [
    { x: width * 0.04, y: height * 0.42, cols: 3, rows: 3 },
    { x: width * 0.62, y: height * 0.40, cols: 3, rows: 2 },
    { x: width * 0.20, y: height * 0.74, cols: 4, rows: 2 },
  ];
  const hw = 42, hh = 34, gap = 16;
  for (const blk of homeBlocks) {
    for (let r = 0; r < blk.rows; r++) {
      for (let c = 0; c < blk.cols; c++) {
        add('home', blk.x + c * (hw + gap), blk.y + r * (hh + gap), hw, hh);
      }
    }
  }

  // Ulice: pasy między rzędami obiektów (czytelne tło, nie kolizyjne).
  const streetsH = [height * 0.30, height * 0.55, height * 0.70];
  const streetsV = [width * 0.35, width * 0.58, width * 0.75];

  return { width, height, buildings: b, streetsH, streetsV };
}

/** Indeksy domów (agent „mieszka" w jednym z nich i wraca do niego). */
export function homeIndices(layout: CityLayout): number[] {
  const idx: number[] = [];
  layout.buildings.forEach((bl, i) => { if (bl.kind === 'home') idx.push(i); });
  return idx;
}

/** Losowy punkt WEWNĄTRZ budynku (z marginesem), przez podany RNG. */
export function pointInBuilding(bl: Building, rng: () => number, margin = 6): { x: number; y: number } {
  return {
    x: bl.x + margin + rng() * Math.max(1, bl.w - margin * 2),
    y: bl.y + margin + rng() * Math.max(1, bl.h - margin * 2),
  };
}
