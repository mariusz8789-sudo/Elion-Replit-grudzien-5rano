/**
 * Wybrane naturalne satelity — PRAWDZIWE odległości/okresy orbitalne (NASA
 * Planetary Satellite Fact Sheet, nssdc.gsfc.nasa.gov/planetary/factsheet/
 * satellite.html), ale świadomie OGRANICZONY zestaw: tylko Księżyc Ziemi,
 * cztery księżyce galileuszowe Jowisza i Tytan Saturna — te same ciała,
 * które są widoczne z Ziemi teleskopem amatorskim i mają realną wartość
 * poglądową. Dziesiątki mniejszych/dalszych księżyców pominięte celowo
 * (patrz honestyNote w universe-solar-system-3d.ts).
 */

export interface MoonData {
  id: string;
  name: string;
  parentId: string;
  /** Prawdziwa półoś wielka orbity wokół planety [km]. */
  distanceKm: number;
  /** Prawdziwy okres orbitalny [dni]. */
  periodDays: number;
  /** Promień [km]. */
  radiusKm: number;
  color: string;
}

export const MOONS: MoonData[] = [
  { id: 'moon', name: 'Księżyc', parentId: 'earth', distanceKm: 384400, periodDays: 27.322, radiusKm: 1737.4, color: '#c9c9c9' },
  { id: 'io', name: 'Io', parentId: 'jupiter', distanceKm: 421700, periodDays: 1.769, radiusKm: 1821.6, color: '#e0d060' },
  { id: 'europa', name: 'Europa', parentId: 'jupiter', distanceKm: 671034, periodDays: 3.551, radiusKm: 1560.8, color: '#d8c8a8' },
  { id: 'ganymede', name: 'Ganimedes', parentId: 'jupiter', distanceKm: 1070412, periodDays: 7.155, radiusKm: 2634.1, color: '#a8968a' },
  { id: 'callisto', name: 'Callisto', parentId: 'jupiter', distanceKm: 1882709, periodDays: 16.689, radiusKm: 2410.3, color: '#7a6e64' },
  { id: 'titan', name: 'Tytan', parentId: 'saturn', distanceKm: 1221870, periodDays: 15.945, radiusKm: 2574, color: '#e0a858' },
];
