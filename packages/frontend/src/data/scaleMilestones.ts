/**
 * Kamienie milowe skali przestrzennej — od kwarku (10⁻¹⁸ m) do obserwowalnego
 * Wszechświata (8,8×10²⁶ m). Rozmiary są rzeczywiste (rzędy wielkości
 * ugruntowane obserwacyjnie); grafika, która je renderuje, jest symboliczna.
 * Współdzielone przez ScaleJourney.tsx (ekran główny) i DiscoveryTimeline.tsx
 * (soczewka skali osi czasu) — jedno miejsce prawdy o rozmiarach.
 */

export interface ScaleMilestone {
  size: number; // metry (charakterystyczny rozmiar)
  name: string;
  note: string;
  color: string;
}

export const SCALE_MILESTONES: ScaleMilestone[] = [
  { size: 1e-18, name: 'Kwark', note: 'górna granica rozmiaru — punktowy?', color: '#f47c7c' },
  { size: 1.7e-15, name: 'Proton', note: 'trzy kwarki związane gluonami', color: '#f0b35c' },
  { size: 1e-14, name: 'Jądro złota', note: '79 protonów, 118 neutronów', color: '#f0b35c' },
  { size: 1e-10, name: 'Atom wodoru', note: 'jądro + chmura elektronowa', color: '#5cd6e8' },
  { size: 2e-9, name: 'Helisa DNA', note: 'szerokość podwójnej helisy', color: '#6ee7a0' },
  { size: 1e-7, name: 'Wirus', note: 'na granicy życia', color: '#6ee7a0' },
  { size: 1e-5, name: 'Komórka', note: 'podstawowa jednostka życia', color: '#6ee7a0' },
  { size: 1.7, name: 'Człowiek', note: 'ty jesteś w połowie tej skali', color: '#e6eaf5' },
  { size: 8848, name: 'Mount Everest', note: 'najwyższy szczyt Ziemi', color: '#8d97b4' },
  { size: 1.27e7, name: 'Ziemia', note: 'średnica: 12 742 km', color: '#5cd6e8' },
  { size: 1.39e9, name: 'Słońce', note: '109 średnic Ziemi', color: '#f0b35c' },
  { size: 9e12, name: 'Układ Słoneczny', note: 'do orbity Neptuna', color: '#f0b35c' },
  { size: 9.46e15, name: 'Rok świetlny', note: 'światło leci rok', color: '#a78bfa' },
  { size: 4.1e16, name: 'Proxima Centauri', note: 'najbliższa gwiazda: 4,2 ly', color: '#a78bfa' },
  { size: 9.5e20, name: 'Droga Mleczna', note: '~200 mld gwiazd', color: '#a78bfa' },
  { size: 1e23, name: 'Grupa Lokalna', note: '~80 galaktyk', color: '#a78bfa' },
  { size: 8.8e26, name: 'Obserwowalny Wszechświat', note: '93 mld lat świetlnych', color: '#e6eaf5' },
];

export const SCALE_LOG_MIN = -18.3;
export const SCALE_LOG_MAX = 27.2;
