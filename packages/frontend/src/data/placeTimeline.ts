import type { ConfirmationLevel } from '../core/citation';

export interface PlaceEpoch {
  id: string;
  name: string;
  year: number;
  confirmation: ConfirmationLevel;
  teaser: string;
  summary: string;
  color: string;
}

/**
 * Jedno miejsce obserwowane przez wiele skal czasu. To nie jest rekonstrukcja
 * konkretnej lokalizacji ani prognoza przyszłości: jest jawnie scenariuszem
 * wizualnym, który pozwala sterować ciągłą zmianą środowiska.
 */
export const PLACE_EPOCHS: PlaceEpoch[] = [
  {
    id: 'desert',
    name: 'Pustynia — punkt odniesienia',
    year: 0,
    confirmation: 'fiction',
    teaser: 'Stały punkt obserwacji, sucha równina i niezmienne miejsce kamery.',
    summary: 'Początek scenariusza. Kamera pozostaje w jednym miejscu, a przemiany są warstwą modelowo-artystyczną, nie zapisem konkretnej lokalizacji.',
    color: '#d6a15b',
  },
  {
    id: 'life',
    name: 'Życie i roślinność',
    year: 1_000,
    confirmation: 'fiction',
    teaser: 'Woda, trawy i pierwsze stabilne ślady życia w tej scenariuszowej dolinie.',
    summary: 'Wizualny etap środowiskowy. Nie twierdzi, kiedy ani gdzie dokładnie powstało życie; pokazuje jedynie kontrolowaną zmianę parametrów sceny.',
    color: '#6ee7a0',
  },
  {
    id: 'settlement',
    name: 'Osada i pierwsi mieszkańcy',
    year: 5_000,
    confirmation: 'fiction',
    teaser: 'Ścieżki, ogień, schronienia i wspólnota wokół tego samego punktu.',
    summary: 'Scenariusz rozwoju osady. Obecność ludzi jest narracją wizualną, a nie dowodem konkretnego wydarzenia archeologicznego.',
    color: '#f0b35c',
  },
  {
    id: 'city',
    name: 'Miasto i samochody',
    year: 2_026,
    confirmation: 'fiction',
    teaser: 'Drogi, światła, budynki i ruch cywilizacji przechodzą przez kadr.',
    summary: 'Współczesna warstwa scenariuszowa. Parametry infrastruktury są sterowalne, ale scena nie jest cyfrowym bliźniakiem żadnego realnego miasta.',
    color: '#5cd6e8',
  },
  {
    id: 'ruins',
    name: 'Ruiny i cisza',
    year: 12_026,
    confirmation: 'fiction',
    teaser: 'Zabudowa znika, natura przejmuje konstrukcje, a obserwator pozostaje.',
    summary: 'Kontrfaktyczny obraz degradacji środowiska zbudowany dla refleksji i eksperymentu narracyjnego; nie jest prognozą cywilizacji.',
    color: '#a78bfa',
  },
  {
    id: 'renewal',
    name: 'Odrodzenie',
    year: 1_000_000,
    confirmation: 'fiction',
    teaser: 'Nowa roślinność, nowe ślady obecności i ten sam punkt obserwacji.',
    summary: 'Otwarty scenariusz odrodzenia. To warstwa cinematic/hypothesis, która może później zostać zastąpiona danymi lub modelem środowiskowym po osobnej walidacji.',
    color: '#e879f9',
  },
  {
    id: 'mythic-origin',
    name: 'Początek — warstwa mitologiczna',
    year: -1,
    confirmation: 'fiction',
    teaser: 'Adam i Ewa jako symboliczna opowieść, nie fakt naukowy.',
    summary: 'Opcjonalny wariant narracyjny. Motyw religijny jest prezentowany wyłącznie jako mit/fiction i nie miesza się z chronologią naukową.',
    color: '#f8d9a0',
  },
];
