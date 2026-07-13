/**
 * Sonifikacja naukowa (Priorytet 9). W przeciwieństwie do sound.ts (krótkie tony
 * potwierdzeń UI) tutaj CIĄGŁY oscylator mapuje ŻYWĄ zmienną modelu na parametr
 * dźwięku przez jawną transformację:
 *
 *   ZMIENNA ŹRÓDŁOWA → NORMALIZACJA (min–max) → CZĘSTOTLIWOŚĆ (skala log)
 *
 * To nie jest „dramatyczny dźwięk" doklejony do sceny — wysokość tonu jest
 * deterministyczną funkcją wartości węzła grafu, więc zmiana parametru słyszalnie
 * przesuwa ton. Mapowanie jest jawne i pokazywane w UI (nie ukryte).
 */

export interface SonificationMapping {
  /** Etykieta zmiennej źródłowej (do UI). */
  sourceLabel: string;
  unit: string;
  /** Zakres normalizacji wartości → [0,1]. */
  min: number;
  max: number;
  /** Zakres częstotliwości wyjściowej (Hz), mapowany logarytmicznie. */
  fMin: number;
  fMax: number;
}

export const DEFAULT_FREQ_MIN = 196; // ~G3
export const DEFAULT_FREQ_MAX = 1568; // ~G6 (3 oktawy)

/**
 * Czysta, testowalna transformacja: wartość → częstotliwość. Normalizacja
 * liniowa do [0,1] (z obcięciem), potem skala LOGARYTMICZNA częstotliwości
 * (percepcyjnie równomierna — oktawa to stały stosunek, nie różnica).
 */
export function normalizeToFrequency(value: number, m: SonificationMapping): number {
  if (!Number.isFinite(value)) return m.fMin;
  const span = m.max - m.min;
  const t = span === 0 ? 0 : Math.max(0, Math.min(1, (value - m.min) / span));
  return m.fMin * Math.pow(m.fMax / m.fMin, t);
}

type AC = AudioContext & { state: string };

/**
 * Ciągły sonifikator: jeden podtrzymywany oscylator, którego częstotliwość
 * podąża za wartością zmiennej. Bezpieczny w środowiskach bez WebAudio
 * (SSR/testy) — wtedy to ciche no-op.
 */
export class Sonifier {
  private ctx: AC | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private _running = false;

  get running(): boolean {
    return this._running;
  }

  start(initialFreq = DEFAULT_FREQ_MIN): boolean {
    if (this._running) return true;
    if (typeof window === 'undefined') return false;
    const Ctor = (window as unknown as { AudioContext?: new () => AC; webkitAudioContext?: new () => AC }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: new () => AC }).webkitAudioContext;
    if (!Ctor) return false;
    try {
      const ctx = new Ctor();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = initialFreq;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      // miękkie wejście, żeby nie było trzasku
      gain.gain.setTargetAtTime(0.06, ctx.currentTime, 0.05);
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      this.ctx = ctx; this.osc = osc; this.gain = gain; this._running = true;
      return true;
    } catch {
      return false;
    }
  }

  setValue(value: number, mapping: SonificationMapping): void {
    if (!this._running || !this.osc || !this.ctx) return;
    const f = normalizeToFrequency(value, mapping);
    try {
      // płynne dążenie do nowej wysokości (bez skoków/trzasków)
      this.osc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.04);
    } catch {
      /* ignoruj */
    }
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    const { ctx, osc, gain } = this;
    this.ctx = null; this.osc = null; this.gain = null;
    if (!ctx || !osc || !gain) return;
    try {
      gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.04);
      osc.stop(ctx.currentTime + 0.2);
      setTimeout(() => { ctx.close().catch(() => {}); }, 300);
    } catch {
      /* ignoruj */
    }
  }
}
