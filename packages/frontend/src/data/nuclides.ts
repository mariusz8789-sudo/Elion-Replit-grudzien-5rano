/**
 * Kluczowe nuklidy — wartości zmierzone eksperymentalnie, ręcznie wybrany
 * i zweryfikowany podzbiór (~55 z ~3300 znanych izotopów). Genesis OS nie
 * generuje pełnej mapy nuklidów syntetycznie — Chart Nuklidów w Nuclear Lab
 * łączy TE realne, zacytowane punkty z ciągłym tłem przewidywanym wzorem
 * SEMF (core/physics.ts), żeby uczciwie odróżnić dane zmierzone od modelu.
 *
 * Źródło: NNDC (National Nuclear Data Center) / IAEA Live Chart of Nuclides,
 * wartości okresu półtrwania zaokrąglone do 3–4 cyfr znaczących.
 */

export interface KnownNuclide {
  z: number;
  n: number;
  symbol: string;
  halfLifeSec: number; // Infinity = stabilny (lub praktycznie stabilny)
  halfLifeLabel: string;
  decayMode: 'stabilny' | 'β⁻' | 'β⁺/EC' | 'α' | 'α+SF' | 'IT';
  note?: string;
}

const Y = 3.1557e7; // rok juliański w sekundach
const D = 86400;
const H = 3600;

export const KNOWN_NUCLIDES: KnownNuclide[] = [
  { z: 1, n: 0, symbol: 'H-1', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 1, n: 1, symbol: 'H-2 (D)', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 1, n: 2, symbol: 'H-3 (T)', halfLifeSec: 12.32 * Y, halfLifeLabel: '12,32 roku', decayMode: 'β⁻' },
  { z: 2, n: 1, symbol: 'He-3', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 2, n: 2, symbol: 'He-4', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny', note: 'cząstka α, najciaśniej związane lekkie jądro' },
  { z: 3, n: 3, symbol: 'Li-6', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 3, n: 4, symbol: 'Li-7', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 4, n: 3, symbol: 'Be-7', halfLifeSec: 53.22 * D, halfLifeLabel: '53,22 dnia', decayMode: 'β⁺/EC' },
  { z: 4, n: 5, symbol: 'Be-9', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 4, n: 6, symbol: 'Be-10', halfLifeSec: 1.51e6 * Y, halfLifeLabel: '1,51 mln lat', decayMode: 'β⁻' },
  { z: 5, n: 5, symbol: 'B-10', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 5, n: 6, symbol: 'B-11', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 6, n: 6, symbol: 'C-12', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 6, n: 7, symbol: 'C-13', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 6, n: 8, symbol: 'C-14', halfLifeSec: 5730 * Y, halfLifeLabel: '5 730 lat', decayMode: 'β⁻', note: 'datowanie radiowęglowe' },
  { z: 7, n: 7, symbol: 'N-14', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 7, n: 8, symbol: 'N-15', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 8, n: 8, symbol: 'O-16', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 8, n: 9, symbol: 'O-17', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 8, n: 10, symbol: 'O-18', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 9, n: 10, symbol: 'F-19', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 10, n: 10, symbol: 'Ne-20', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 11, n: 11, symbol: 'Na-22', halfLifeSec: 2.602 * Y, halfLifeLabel: '2,602 roku', decayMode: 'β⁺/EC', note: 'źródło pozytonów w laboratoriach' },
  { z: 11, n: 12, symbol: 'Na-23', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 13, n: 13, symbol: 'Al-26', halfLifeSec: 7.17e5 * Y, halfLifeLabel: '717 tys. lat', decayMode: 'β⁺/EC', note: 'nuklid kosmogeniczny' },
  { z: 13, n: 14, symbol: 'Al-27', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 14, n: 14, symbol: 'Si-28', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 15, n: 16, symbol: 'P-31', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 15, n: 17, symbol: 'P-32', halfLifeSec: 14.27 * D, halfLifeLabel: '14,27 dnia', decayMode: 'β⁻', note: 'znacznik w biologii molekularnej' },
  { z: 16, n: 16, symbol: 'S-32', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 17, n: 18, symbol: 'Cl-35', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 17, n: 20, symbol: 'Cl-37', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 18, n: 22, symbol: 'Ar-40', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 19, n: 20, symbol: 'K-39', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 19, n: 21, symbol: 'K-40', halfLifeSec: 1.248e9 * Y, halfLifeLabel: '1,248 mld lat', decayMode: 'β⁻', note: 'rozgałęzia się też do Ar-40 (EC) — podstawa datowania K-Ar; źródło ~ciepła Ziemi' },
  { z: 20, n: 20, symbol: 'Ca-40', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 26, n: 30, symbol: 'Fe-56', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny', note: 'blisko szczytu krzywej energii wiązania — koniec syntezy w gwiazdach' },
  { z: 27, n: 32, symbol: 'Co-59', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 27, n: 33, symbol: 'Co-60', halfLifeSec: 5.271 * Y, halfLifeLabel: '5,271 roku', decayMode: 'β⁻', note: 'radioterapia, defektoskopia' },
  { z: 28, n: 30, symbol: 'Ni-58', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 29, n: 34, symbol: 'Cu-63', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 30, n: 34, symbol: 'Zn-64', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 38, n: 50, symbol: 'Sr-88', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny', note: 'magiczne N=50' },
  { z: 38, n: 52, symbol: 'Sr-90', halfLifeSec: 28.8 * Y, halfLifeLabel: '28,8 roku', decayMode: 'β⁻', note: 'produkt rozszczepienia, skażenie po awariach reaktorów' },
  { z: 40, n: 50, symbol: 'Zr-90', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny', note: 'magiczne N=50' },
  { z: 43, n: 56, symbol: 'Tc-99', halfLifeSec: 2.111e5 * Y, halfLifeLabel: '211 tys. lat', decayMode: 'β⁻', note: 'technet (Z=43) nie ma stabilnych izotopów' },
  { z: 43, n: 56, symbol: 'Tc-99m', halfLifeSec: 6.01 * H, halfLifeLabel: '6,01 godz. (izomer)', decayMode: 'IT', note: 'najczęściej używany izotop w medycynie nuklearnej (~80% badań SPECT)' },
  { z: 53, n: 74, symbol: 'I-127', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny' },
  { z: 53, n: 76, symbol: 'I-129', halfLifeSec: 1.57e7 * Y, halfLifeLabel: '15,7 mln lat', decayMode: 'β⁻' },
  { z: 53, n: 78, symbol: 'I-131', halfLifeSec: 8.02 * D, halfLifeLabel: '8,02 dnia', decayMode: 'β⁻', note: 'medycyna nuklearna; uwalniany po awariach reaktorów' },
  { z: 55, n: 78, symbol: 'Cs-133', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny', note: 'definicja sekundy SI (przejście nadsubtelne)' },
  { z: 55, n: 82, symbol: 'Cs-137', halfLifeSec: 30.1 * Y, halfLifeLabel: '~30,1 roku', decayMode: 'β⁻', note: 'produkt rozszczepienia, główne skażenie po Czarnobylu' },
  { z: 82, n: 124, symbol: 'Pb-206', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny', note: 'koniec łańcucha U-238' },
  { z: 82, n: 125, symbol: 'Pb-207', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny', note: 'koniec łańcucha U-235' },
  { z: 82, n: 126, symbol: 'Pb-208', halfLifeSec: Infinity, halfLifeLabel: 'stabilny', decayMode: 'stabilny', note: 'podwójnie magiczny (Z=82, N=126) — koniec łańcucha Th-232' },
  { z: 82, n: 128, symbol: 'Pb-210', halfLifeSec: 22.3 * Y, halfLifeLabel: '22,3 roku', decayMode: 'β⁻' },
  { z: 83, n: 126, symbol: 'Bi-209', halfLifeSec: 2.01e19 * Y, halfLifeLabel: '~2,01×10¹⁹ lat', decayMode: 'α', note: 'najdłuższy zmierzony okres półtrwania — α zmierzone dopiero w 2003 r. (Marcillac i in., Nature 422, 876); dłużej niż wiek Wszechświata' },
  { z: 84, n: 126, symbol: 'Po-210', halfLifeSec: 138.4 * D, halfLifeLabel: '138,4 dnia', decayMode: 'α', note: 'odkryty przez Marię Skłodowską-Curie (1898)' },
  { z: 86, n: 136, symbol: 'Rn-222', halfLifeSec: 3.82 * D, halfLifeLabel: '3,82 dnia', decayMode: 'α', note: 'gaz radonowy — źródło dawki w domach' },
  { z: 88, n: 138, symbol: 'Ra-226', halfLifeSec: 1600 * Y, halfLifeLabel: '1 600 lat', decayMode: 'α', note: 'odkryty przez Marię Skłodowską-Curie (1898)' },
  { z: 90, n: 140, symbol: 'Th-230', halfLifeSec: 75400 * Y, halfLifeLabel: '75 400 lat', decayMode: 'α' },
  { z: 90, n: 142, symbol: 'Th-232', halfLifeSec: 1.405e10 * Y, halfLifeLabel: '14,05 mld lat', decayMode: 'α', note: 'dłuższy okres półtrwania niż wiek Wszechświata' },
  { z: 92, n: 141, symbol: 'U-233', halfLifeSec: 1.592e5 * Y, halfLifeLabel: '159 200 lat', decayMode: 'α' },
  { z: 92, n: 143, symbol: 'U-235', halfLifeSec: 7.04e8 * Y, halfLifeLabel: '704 mln lat', decayMode: 'α', note: 'paliwo rozszczepialne (Nuclear Lab → Reakcja łańcuchowa)' },
  { z: 92, n: 146, symbol: 'U-238', halfLifeSec: 4.468e9 * Y, halfLifeLabel: '4,468 mld lat', decayMode: 'α', note: 'zegar wieku Ziemi; początek łańcucha 14 rozpadów do Pb-206' },
  { z: 93, n: 144, symbol: 'Np-237', halfLifeSec: 2.144e6 * Y, halfLifeLabel: '2,144 mln lat', decayMode: 'α' },
  { z: 94, n: 144, symbol: 'Pu-238', halfLifeSec: 87.7 * Y, halfLifeLabel: '87,7 roku', decayMode: 'α', note: 'paliwo RTG (Voyager, Curiosity, New Horizons)' },
  { z: 94, n: 145, symbol: 'Pu-239', halfLifeSec: 24110 * Y, halfLifeLabel: '24 110 lat', decayMode: 'α', note: 'paliwo reaktorowe i broń jądrowa' },
  { z: 94, n: 147, symbol: 'Pu-241', halfLifeSec: 14.33 * Y, halfLifeLabel: '14,33 roku', decayMode: 'β⁻' },
  { z: 95, n: 146, symbol: 'Am-241', halfLifeSec: 432.2 * Y, halfLifeLabel: '432,2 roku', decayMode: 'α', note: 'czujki dymu' },
  { z: 96, n: 148, symbol: 'Cm-244', halfLifeSec: 18.1 * Y, halfLifeLabel: '18,1 roku', decayMode: 'α' },
  { z: 98, n: 154, symbol: 'Cf-252', halfLifeSec: 2.645 * Y, halfLifeLabel: '2,645 roku', decayMode: 'α+SF', note: 'silne spontaniczne rozszczepienie (~3%) — przenośne źródło neutronów' },
];

export function findKnownNuclide(z: number, n: number): KnownNuclide | undefined {
  return KNOWN_NUCLIDES.find((k) => k.z === z && k.n === n);
}
