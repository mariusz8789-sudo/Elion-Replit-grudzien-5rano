/**
 * SIMULATION CLOCK — niezależny od Reacta zegar symulacji (Visual Scene Engine).
 *
 * Zamienia UPŁYW CZASU RZECZYWISTEGO (z requestAnimationFrame) na CZAS
 * SYMULACJI [dni], skalowany mnożnikiem prędkości (0/1/2/5/10/50×), i wywołuje
 * silnik STAŁYM KROKIEM (fixed timestep) — dzięki temu dynamika jest
 * deterministyczna i niezależna od liczby klatek na sekundę. To NIE jest
 * odtwarzanie nagranych klatek: każdy krok naprawdę liczy stan.
 */

export type ClockSpeed = 0 | 1 | 2 | 5 | 10 | 50;
export const CLOCK_SPEEDS: ClockSpeed[] = [0, 1, 2, 5, 10, 50];

export interface ClockOptions {
  /** Ile dni symulacji przypada na 1 sekundę czasu rzeczywistego przy prędkości 1×. */
  daysPerSecondAt1x?: number;
  /** Stały krok całkowania [dni]. Mniejszy = dokładniej, drożej. */
  fixedStepDays?: number;
  /** Górny limit dni na jedną klatkę (ochrona przed „spiralą śmierci" po zawieszeniu karty). */
  maxDaysPerFrame?: number;
}

export class SimulationClock {
  private _time = 0;            // czas symulacji [dni]
  private _running = false;
  private _speed: ClockSpeed = 1;
  private acc = 0;              // akumulator dni do wydania w stałych krokach
  readonly daysPerSecondAt1x: number;
  readonly fixedStepDays: number;
  readonly maxDaysPerFrame: number;

  constructor(opts: ClockOptions = {}) {
    this.daysPerSecondAt1x = opts.daysPerSecondAt1x ?? 0.7;
    this.fixedStepDays = opts.fixedStepDays ?? 0.05;
    this.maxDaysPerFrame = opts.maxDaysPerFrame ?? 4;
  }

  get time(): number { return this._time; }
  get running(): boolean { return this._running; }
  get speed(): ClockSpeed { return this._speed; }

  play(): void { this._running = true; }
  pause(): void { this._running = false; }
  toggle(): void { this._running = !this._running; }
  setSpeed(s: ClockSpeed): void { this._speed = s; if (s === 0) this._running = false; else this._running = true; }

  reset(): void { this._time = 0; this.acc = 0; this._running = false; }

  /**
   * Zaawansuj zegar o `realSeconds` i wykonaj `step(dtDays)` tyle razy, ile
   * mieści się stałych kroków. Zwraca liczbę wykonanych kroków.
   */
  advance(realSeconds: number, step: (dtDays: number) => void): number {
    if (!this._running || this._speed === 0) return 0;
    let simDays = realSeconds * this.daysPerSecondAt1x * this._speed;
    if (simDays > this.maxDaysPerFrame) simDays = this.maxDaysPerFrame;
    this.acc += simDays;
    let steps = 0;
    while (this.acc >= this.fixedStepDays) {
      step(this.fixedStepDays);
      this._time += this.fixedStepDays;
      this.acc -= this.fixedStepDays;
      steps++;
    }
    return steps;
  }

  /** Jeden ręczny krok (przycisk „Krok") — działa też, gdy zegar jest w pauzie. */
  singleStep(step: (dtDays: number) => void): void {
    step(this.fixedStepDays);
    this._time += this.fixedStepDays;
  }
}
