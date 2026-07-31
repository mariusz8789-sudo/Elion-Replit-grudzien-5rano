import type { SimParams } from '../core/types';

/**
 * "Co by było, gdyby?" — katalog dramatycznych, ale realnych pytań, każde
 * mapowane na PARAMETRY już istniejącego eksperymentu bazowego laboratorium
 * (core/scenarioBridge.ts). Zero nowej fizyki i zero nowego silnika: to
 * warstwa nawigacyjna nad tym, co już policzone i przetestowane. Poziom
 * wiarygodności karty NIE jest tu ręcznie wpisywany drugi raz — ekran
 * (WhatIfScreen.tsx) czyta go live z `HonestyLevel` tego samego
 * laboratorium/eksperymentu, żeby te dwie oceny nigdy nie mogły się rozjechać.
 */
export interface WhatIfScenario {
  id: string;
  question: string;
  teaser: string;
  labId: string;
  params: Partial<SimParams>;
  /** Eksperyment docelowy w laboratorium, jeśli inny niż bazowy — patrz core/scenarioBridge.ts. */
  experimentId?: string;
}

export const WHAT_IF_SCENARIOS: WhatIfScenario[] = [
  {
    id: 'no-dark-energy',
    question: 'Co by było, gdyby zniknęła ciemna energia?',
    teaser: 'Ω_Λ = 0 — ekspansja zwalnia zamiast przyspieszać. Zobacz różnicę na żywo.',
    labId: 'universe',
    experimentId: 'expansion-2d',
    params: { omegaLambda: 0 },
  },
  {
    id: 'runaway-expansion',
    question: 'Co by było, gdyby ciemna energia zdominowała niemal całkowicie?',
    teaser: 'Ω_Λ = 0,99 — galaktyki rozbiegają się gwałtowniej niż w naszym Wszechświecie.',
    labId: 'universe',
    experimentId: 'expansion-2d',
    params: { omegaLambda: 0.99 },
  },
  {
    id: 'explosive-stars',
    question: 'Co by było, gdyby oddziaływanie silne było o 14% mocniejsze?',
    teaser: 'Diproton staje się związany — gwiazdy spalają paliwo w mgnieniu oka.',
    labId: 'multiverse',
    params: { preset: 'explosive' },
  },
  {
    id: 'carbonless-universe',
    question: 'Co by było, gdyby zabrakło węgla we Wszechświecie?',
    teaser: 'Oddziaływanie silne osłabione o 14% — deuter się nie wiąże, chemia organiczna nigdy nie powstaje.',
    labId: 'multiverse',
    params: { preset: 'carbonless' },
  },
  {
    id: 'crushing-gravity',
    question: 'Co by było, gdyby grawitacja była 5× silniejsza?',
    teaser: 'Gwiazdy żyją ~25× krócej — okno na ewolucję złożonego życia niemal się zamyka.',
    labId: 'multiverse',
    params: { preset: 'crushing' },
  },
  {
    id: 'spinning-black-hole',
    question: 'Co by było, gdyby czarna dziura wirowała?',
    teaser: 'Metryka Kerra: frame-dragging zawija tory fotonów wokół obracającej się masy.',
    labId: 'einstein',
    experimentId: 'kerr-3d',
    params: { spin: 0.9 },
  },
  {
    id: 'near-light-speed',
    question: 'Co by było, gdyby zegar leciał z 99% prędkości światła?',
    teaser: 'Dylatacja czasu przestaje być ciekawostką z podręcznika — γ ≈ 7×.',
    labId: 'spacetime',
    params: { v: 0.99 },
  },
  {
    id: 'measured-path',
    question: 'Co by było, gdyby zmierzono, którą szczeliną leci cząstka?',
    teaser: 'Prążki interferencyjne znikają — informacja o drodze niszczy superpozycję.',
    labId: 'quantum',
    params: { measured: true },
  },
  {
    id: 'galactic-civilization',
    question: 'Co by było, gdyby cywilizacja zużywała energię całej galaktyki?',
    teaser: 'Skala Kardaszewa K=3 — poza wszystkim, co dziś potrafimy sobie wyobrazić inżyniersko.',
    labId: 'civilization',
    params: { k: 3.0 },
  },
];
