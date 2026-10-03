import type { Locale } from '../../core/i18n';
import type { SceneEpistemicStatus, SceneLimit, SceneReplayVerdict, TimeScaleId } from '../../core/reality/sceneCapture';

/**
 * Scene capture panel of #/reality in Polish and English — the same pattern as
 * components/home/startText.ts: Polish for `pl`, English for every other
 * language. Status and limit CODES come from core/reality/sceneCapture.ts; this
 * file only puts them into plain words. Unknown codes are shown as the code.
 */
type Pair = readonly [string, string];
const pick = (pair: Pair, locale: Locale): string => pair[locale === 'pl' ? 0 : 1];

const TEXT = {
  title: ['Zapis i odtworzenie sceny', 'Save and replay the scene'],
  lead: [
    'Zapisz to, co widzisz, a potem policz to jeszcze raz. Jeśli wyjdzie to samo, scena jest wynikiem, a nie tylko obrazkiem.',
    'Save what you see, then compute it again. If it comes out the same, the scene is a result, not just a picture.',
  ],
  timeScale: ['Skala czasu świata', 'World time scale'],
  timeHintBefore: ['s na ekranie =', 's on screen ='],
  timeHintAfter: [
    'lat czasu świata. Czas świata jest liczony, nie przyspieszany.',
    'years of world time. World time is computed, not fast-forwarded.',
  ],
  thresholdLayer: ['Pokaż artystyczny „próg” między światami (bez modelu fizycznego)', 'Show the artistic “threshold” between worlds (no physical model)'],
  capture: ['Zapisz scenę', 'Save scene'],
  replay: ['Odtwórz zapis', 'Replay the save'],
  status: ['Co to jest', 'What this is'],
  fingerprint: ['Odcisk sceny', 'Scene fingerprint'],
  doesNotProve: ['Czego ta scena NIE dowodzi', 'What this scene does NOT prove'],
  replayResult: ['Odtworzenie', 'Replay'],
  technical: ['Szczegóły techniczne', 'Technical details'],
} as const satisfies Record<string, Pair>;

export type RealitySceneTextKey = keyof typeof TEXT;
export function realityText(key: RealitySceneTextKey, locale: Locale): string {
  return pick(TEXT[key], locale);
}

const STATUS: Readonly<Record<SceneEpistemicStatus, Pair>> = {
  MODEL: ['Model — policzone jawnym wzorem', 'Model — computed with an explicit formula'],
  SCENARIO: ['Scenariusz — porównanie wariantów jednego modelu', 'Scenario — comparing variants of one model'],
  CINEMATIC: ['Warstwa artystyczna — bez twierdzenia naukowego', 'Artistic layer — no scientific claim'],
  NOT_MODELED: ['Brak modelu — nie ma czego liczyć', 'No model — nothing to compute'],
  BLOCKED: ['Zablokowane — takiego twierdzenia Genesis nie stawia', 'Blocked — Genesis does not make this claim'],
};

const REPLAY: Readonly<Record<SceneReplayVerdict, Pair>> = {
  MATCH: ['Zgodne — policzone od nowa, wyszło to samo', 'Identical — recomputed, same result'],
  DRIFT: ['Rozjazd — policzone od nowa, wyszło coś innego', 'Drift — recomputed, a different result'],
  NOT_REPRODUCIBLE: ['Nie do odtworzenia — zapis jest niekompletny', 'Not reproducible — the save is incomplete'],
  BLOCKED: ['Zablokowane — tej sceny się nie odtwarza', 'Blocked — this scene is not replayed'],
};

const TIME_SCALE: Readonly<Record<TimeScaleId, Pair>> = {
  realtime: ['1 s = 1 s', '1 s = 1 s'],
  hour: ['1 s = 1 godzina', '1 s = 1 hour'],
  day: ['1 s = 1 doba', '1 s = 1 day'],
  year: ['1 s = 1 rok', '1 s = 1 year'],
  century: ['1 s = 1 wiek', '1 s = 1 century'],
};

const CLAIM: Readonly<Record<string, Pair>> = {
  'parallel-universes-exist': [
    'Rozgałęzienie to porównanie wariantów jednego modelu, a nie obserwacja równoległych wszechświatów.',
    'Branching compares variants of one model; it is not an observation of parallel universes.',
  ],
  'traversable-wormhole-confirmed': [
    'Przejście „progiem” jest warstwą artystyczną; nie ma tu modelu ani obserwacji tunelu czasoprzestrzennego.',
    'The “threshold” crossing is an artistic layer; there is no model or observation of a wormhole here.',
  ],
  'fifth-spatial-dimension-observed': [
    'Rzut 4D→3D to technika rysowania obiektu matematycznego, nie obserwacja dodatkowego wymiaru.',
    'A 4D→3D projection is a way of drawing a mathematical object, not an observation of an extra dimension.',
  ],
  'superposition-grants-access-to-all-realities': [
    'Superpozycja opisuje jeden układ; nie daje dostępu do innych rzeczywistości.',
    'Superposition describes one system; it gives no access to other realities.',
  ],
  'mind-reading-confirmed': [
    'Genesis nie ma modelu odczytu myśli; taka scena nie ma podstawy naukowej.',
    'Genesis has no model of reading minds; such a scene has no scientific basis.',
  ],
};

export function realityStatus(status: string, locale: Locale): string {
  const pair = (STATUS as Record<string, Pair>)[status];
  return pair ? pick(pair, locale) : status;
}

export function realityReplay(verdict: string, locale: Locale): string {
  const pair = (REPLAY as Record<string, Pair>)[verdict];
  return pair ? pick(pair, locale) : verdict;
}

export function realityTimeScale(id: TimeScaleId, locale: Locale): string {
  return pick(TIME_SCALE[id], locale);
}

export function realityLimit(limit: SceneLimit, locale: Locale): string {
  switch (limit.kind) {
    case 'no-model': return pick(['Ta scena nie liczy żadnej wielkości fizycznej.', 'This scene computes no physical quantity.'], locale);
    case 'model-bounds': return pick(['Wynik obowiązuje w granicach założeń modelu; nie jest pomiarem.', 'The result holds within the model’s assumptions; it is not a measurement.'], locale);
    case 'forbidden-claim': return CLAIM[limit.claim] ? pick(CLAIM[limit.claim]!, locale) : limit.claim;
    case 'unsolved-layer': return locale === 'pl'
      ? `Warstwa „${limit.layer}” nie ma za sobą modelu fizycznego — jest elementem obrazu, nie wynikiem.`
      : `The “${limit.layer}” layer has no physical model behind it — it is part of the picture, not a result.`;
  }
}
