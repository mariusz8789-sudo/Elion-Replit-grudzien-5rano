/**
 * Prawdziwe elementy orbitalne 8 planet — NASA Planetary Fact Sheet
 * (nssdc.gsfc.nasa.gov/planetary/factsheet), wartości ogólnie dostępne i
 * stabilne (te same liczby w każdym podręczniku astronomii, niska szansa
 * pomyłki bez dostępu do sieci). To STATYCZNE elementy orbitalne (kształt,
 * mimośród, okres) — NIE żywa efemeryda: pozycje kątowe planet w
 * symulacji startują dowolnie (nie odpowiadają rzeczywistemu ułożeniu
 * planet dzisiaj). Prawdziwe "gdzie jest Mars teraz" wymaga NASA JPL
 * Horizons (patrz scripts/fetch-real-data.mjs) — do zrobienia poza tym
 * sandboxem (sieć zablokowana, patrz README „Znane ograniczenia").
 */

export interface PlanetData {
  id: string;
  name: string;
  /** Półoś wielka [AU]. */
  semiMajorAxisAu: number;
  /** Mimośród orbity (0 = koło). */
  eccentricity: number;
  /** Okres orbitalny [dni ziemskich]. */
  periodDays: number;
  /** Masa względem Ziemi. */
  massEarths: number;
  /** Promień [km]. */
  radiusKm: number;
  color: string;
  /**
   * Nachylenie osi obrotu do płaszczyzny orbity [stopnie] — NASA Planetary
   * Fact Sheet ("Obliquity to orbit"). Wenus >90° odzwierciedla PRAWDZIWY
   * ruch wsteczny (retrogradacja) — to nie błąd danych.
   */
  axialTiltDeg: number;
  /**
   * Pierścienie: przybliżony PRAWDZIWY zasięg (promień wewnętrzny/zewnętrzny
   * jako wielokrotność promienia planety) i orientacyjna nieprzezroczystość
   * — patrz honestyNote w universe-solar-system-3d.ts. Tylko Saturn i Uran
   * mają w tej symulacji renderowane pierścienie (Jowisz i Neptun też mają
   * prawdziwe, ale są zbyt słabe/wąskie, by dodawać wartość poglądową).
   */
  ring?: { innerFactor: number; outerFactor: number; opacity: number };
}

export const PLANETS: PlanetData[] = [
  { id: 'mercury', name: 'Merkury', semiMajorAxisAu: 0.387, eccentricity: 0.2056, periodDays: 87.969, massEarths: 0.0553, radiusKm: 2439.7, color: '#a8a29e', axialTiltDeg: 0.034 },
  { id: 'venus', name: 'Wenus', semiMajorAxisAu: 0.723, eccentricity: 0.0068, periodDays: 224.701, massEarths: 0.815, radiusKm: 6051.8, color: '#e8c88a', axialTiltDeg: 177.4 },
  { id: 'earth', name: 'Ziemia', semiMajorAxisAu: 1.0, eccentricity: 0.0167, periodDays: 365.256, massEarths: 1.0, radiusKm: 6371.0, color: '#5cb8e8', axialTiltDeg: 23.44 },
  { id: 'mars', name: 'Mars', semiMajorAxisAu: 1.524, eccentricity: 0.0934, periodDays: 686.98, massEarths: 0.1074, radiusKm: 3389.5, color: '#c1502e', axialTiltDeg: 25.19 },
  { id: 'jupiter', name: 'Jowisz', semiMajorAxisAu: 5.203, eccentricity: 0.0489, periodDays: 4332.59, massEarths: 317.8, radiusKm: 69911, color: '#e0b98f', axialTiltDeg: 3.13 },
  { id: 'saturn', name: 'Saturn', semiMajorAxisAu: 9.537, eccentricity: 0.0565, periodDays: 10759.22, massEarths: 95.16, radiusKm: 58232, color: '#eddca0', axialTiltDeg: 26.73, ring: { innerFactor: 1.2, outerFactor: 2.3, opacity: 0.6 } },
  { id: 'uranus', name: 'Uran', semiMajorAxisAu: 19.191, eccentricity: 0.0457, periodDays: 30688.5, massEarths: 14.54, radiusKm: 25362, color: '#a9dbe0', axialTiltDeg: 97.77, ring: { innerFactor: 1.6, outerFactor: 2.0, opacity: 0.25 } },
  { id: 'neptune', name: 'Neptun', semiMajorAxisAu: 30.069, eccentricity: 0.0113, periodDays: 60195, massEarths: 17.15, radiusKm: 24622, color: '#5f7cd6', axialTiltDeg: 28.32 },
];
