import { getSettings } from './settings';

/**
 * Dźwięk UI — krótkie, syntezowane tony (Web Audio API), zero plików
 * audio: zero wagi w bundlu, zero zależności sieciowej, spójne z resztą
 * platformy (wszystko liczone, nic nie jest gotowym assetem). Każdy dźwięk
 * trwa <250ms i ma cichą amplitudę (gainPeak ≤ 0,06) — ma być subtelnym
 * potwierdzeniem, nie muzyką ani alarmem. Jeden globalny przełącznik w
 * Ustawieniach (`settings.soundEnabled`) wyłącza WSZYSTKO naraz.
 *
 * Zgodność z Safari/iOS i politykami autoplay (Chromium ma tę samą zasadę):
 * `AudioContext` utworzony poza wywołaniem zainicjowanym gestem użytkownika
 * startuje w stanie 'suspended' i NIGDY nie wznawia się sam. Wszystkie
 * funkcje `play*()` poniżej są dziś wywoływane wyłącznie z handlerów
 * kliknięcia/klawiatury (wejście do laboratorium, start/pauza, itd.), więc
 * warunek "gest użytkownika" jest spełniony — ale samo utworzenie kontekstu
 * to za mało: dopóki `resume()` faktycznie się nie rozstrzygnie, `currentTime`
 * stoi w miejscu, więc zaplanowanie dźwięku PRZED rozstrzygnięciem `resume()`
 * planuje go względem zamrożonego zegara i dźwięk cicho przepada. `tone()`
 * niżej czeka na `resume()` przed odczytaniem `currentTime` z tego właśnie
 * powodu.
 */

type AudioContextLike = {
  currentTime: number;
  state: string;
  resume: () => Promise<void>;
  createOscillator: () => OscillatorNode;
  createGain: () => GainNode;
  destination: AudioDestinationNode;
};

let ctx: AudioContextLike | null = null;
let ctxAttempted = false;

/** Tworzy (raz) i zwraca dzielony AudioContext, bez dotykania jego stanu suspended/running — patrz `tone()`. */
function getCtx(): AudioContextLike | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  if (ctxAttempted) return null; // już próbowaliśmy stworzyć i się nie udało — nie próbuj przy każdym dźwięku
  ctxAttempted = true;
  const AC = (window as unknown as { AudioContext?: new () => AudioContextLike; webkitAudioContext?: new () => AudioContextLike })
    .AudioContext ??
    (window as unknown as { webkitAudioContext?: new () => AudioContextLike }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    return ctx;
  } catch {
    // Konstruktor rzuca np. gdy przeglądarka wyczerpała limit jednoczesnych
    // kontekstów audio — rzadkie, ale realne w długiej sesji.
    return null;
  }
}

function enabled(): boolean {
  try {
    return getSettings().soundEnabled;
  } catch {
    return false;
  }
}

/** Faktyczne zaplanowanie dźwięku na kontekście, który jest już (albo właśnie stał się) 'running'. */
function scheduleTone(c: AudioContextLike, freq: number, startOffset: number, duration: number, gainPeak: number, type: OscillatorType): void {
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = c.currentTime + startOffset;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  } catch {
    /* silnik audio niedostępny/zablokowany w tej przeglądarce — cicho pomiń */
  }
}

/**
 * Pojedynczy krótki ton z płynną obwiednią (bez trzasku na starcie/końcu).
 * Safari/Chromium: jeśli kontekst jest 'suspended' (typowe dla iOS/autoplay
 * policy), CZEKA na rozstrzygnięcie `resume()` przed odczytaniem
 * `currentTime` — inaczej dźwięk planuje się względem zamrożonego zegara i
 * cicho przepada (patrz komentarz na górze pliku).
 */
function tone(freq: number, startOffset: number, duration: number, gainPeak: number, type: OscillatorType = 'sine'): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') {
    c.resume()
      .then(() => scheduleTone(c, freq, startOffset, duration, gainPeak, type))
      .catch(() => {
        /* przeglądarka odmówiła wznowienia (np. brak gestu użytkownika) — cicho pomiń */
      });
    return;
  }
  scheduleTone(c, freq, startOffset, duration, gainPeak, type);
}

/** Wejście do laboratorium — miękkie dwa tony wznoszące. */
export function playEnterLab(): void {
  if (!enabled()) return;
  tone(440, 0, 0.16, 0.045);
  tone(660, 0.055, 0.18, 0.04);
}

/** Start symulacji. */
export function playSimStart(): void {
  if (!enabled()) return;
  tone(523.25, 0, 0.09, 0.04);
}

/** Pauza symulacji — nieco niższy, "opadający" ton. */
export function playSimPause(): void {
  if (!enabled()) return;
  tone(329.63, 0, 0.09, 0.035);
}

/** Odkrycie / odblokowana odznaka — jasny, trzytonowy akord wznoszący. */
export function playAchievement(): void {
  if (!enabled()) return;
  tone(523.25, 0, 0.14, 0.05); // C5
  tone(659.25, 0.07, 0.14, 0.05); // E5
  tone(783.99, 0.14, 0.24, 0.055); // G5
}

/** Przejście między epokami w Discovery Timeline — pojedynczy, miękki ton. */
export function playTimelineTransition(): void {
  if (!enabled()) return;
  tone(392, 0, 0.13, 0.03);
}

/** Odpowiedź Narratora AI dotarła — bardzo cichy, krótki "tick". */
export function playNarratorEvent(): void {
  if (!enabled()) return;
  tone(880, 0, 0.05, 0.022);
}
