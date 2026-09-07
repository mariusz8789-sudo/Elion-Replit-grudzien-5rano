/**
 * LOOKING GLASS — THE ONE AUTHORITY ON WHAT TIME THE WORLD MAY BE SHOWN AT.
 *
 * Every integrity bug this project has hit was the same shape: a number that
 * looked right and pointed at something that did not exist. An event's day-72
 * timestamp read as state 72 when twelve states existed. A marker clamped to
 * a span it did not belong to, counting backwards. A frame advancing by
 * however long it took and skipping states nobody saw. None of those were
 * found by reading the code; all of them were found by running it.
 *
 * They kept recurring because the rule lived in several places at once — the
 * director decided one way, the mode machine another, and the screen applied
 * a `Math.min` of its own. This module is the single place that decides, and
 * every path routes through it: the sequence, the scrub bar, an event jump,
 * a replay, a resume.
 *
 * THE RULE IS EXISTENCE, NOT RANGE. A tick inside [first, last] is not
 * automatically real. A run may have gaps — states the model did not
 * produce, days it skipped — and interpolating across one shows a world
 * state that was never computed. So the clock holds the ACTUAL ticks and
 * grants only those.
 *
 * A refusal is never silent: every resolution carries a reason, so a screen
 * can say why the world did not move instead of appearing to ignore a click.
 */

export type TimeRequestSource =
  /** The cinematic sequence advancing on its own. */
  | 'SEQUENCE'
  /** The user dragging the timeline. */
  | 'SCRUB'
  /** Jumping to an event the user selected. */
  | 'EVENT_JUMP'
  /** Returning to a verified moment. */
  | 'REPLAY'
  /** Continuing a sequence that was interrupted. */
  | 'RESUME'
  /** Opening the world. */
  | 'INITIAL';

export interface TimeRequest {
  readonly source: TimeRequestSource;
  /** The tick being asked for. Null means "the caller has no opinion". */
  readonly tick: number | null;
  /** Where the world is now, held when a request cannot be granted. */
  readonly current: number;
}

export interface TimeResolution {
  /** False when the world must not move. */
  readonly granted: boolean;
  /** The tick to show. Always a tick that exists, or the held current one. */
  readonly worldTime: number;
  readonly source: TimeRequestSource;
  /** Why, in terms a UI can show a person. Never empty. */
  readonly reason: string;
  /** True when the request was moved to the nearest real tick. */
  readonly snapped: boolean;
}

export class WorldClock {
  private readonly ticks: readonly number[];
  private readonly available: ReadonlySet<number>;

  /**
   * @param ticks the ticks the run actually produced, in any order. Duplicates
   * and disorder are tolerated because adapters produce them; gaps are
   * preserved deliberately, because a gap is information.
   */
  constructor(ticks: readonly number[]) {
    const unique = Array.from(new Set(ticks)).sort((a, b) => a - b);
    this.ticks = unique;
    this.available = new Set(unique);
  }

  get isEmpty(): boolean { return this.ticks.length === 0; }
  get first(): number | null { return this.ticks[0] ?? null; }
  get last(): number | null { return this.ticks[this.ticks.length - 1] ?? null; }
  get count(): number { return this.ticks.length; }
  get allTicks(): readonly number[] { return this.ticks; }

  /** Whether the run genuinely produced this tick. */
  has(tick: number): boolean { return this.available.has(tick); }

  /**
   * The real tick closest to a requested one. Ties go to the earlier tick, so
   * the choice is deterministic rather than dependent on iteration order.
   */
  nearest(tick: number): number | null {
    if (this.ticks.length === 0) return null;
    let best = this.ticks[0];
    let bestDistance = Math.abs(best - tick);
    for (const candidate of this.ticks) {
      const distance = Math.abs(candidate - tick);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** The next real tick at or after `tick`, for stepping forward over a gap. */
  nextAtOrAfter(tick: number): number | null {
    return this.ticks.find((candidate) => candidate >= tick) ?? null;
  }

  /**
   * Decides what the world may show. The only function permitted to answer
   * this question.
   */
  resolve(request: TimeRequest): TimeResolution {
    const { source, tick, current } = request;

    if (this.ticks.length === 0) {
      return {
        granted: false, worldTime: current, source, snapped: false,
        reason: 'this run produced no states, so there is no time to show',
      };
    }

    if (tick === null) {
      return {
        granted: false, worldTime: current, source, snapped: false,
        reason: 'no time was requested; the world holds where it is',
      };
    }

    if (!Number.isFinite(tick)) {
      return {
        granted: false, worldTime: current, source, snapped: false,
        reason: 'the requested time is not a number',
      };
    }

    if (this.has(tick)) {
      return { granted: true, worldTime: tick, source, snapped: false, reason: 'the run produced this tick' };
    }

    // Inside the range but absent means a real gap in the run. Snapping to a
    // neighbour is honest — and is flagged — where interpolating would show a
    // state the model never computed.
    const nearest = this.nearest(tick)!;
    const first = this.first!;
    const last = this.last!;
    const outside = tick < first || tick > last;
    return {
      granted: true,
      worldTime: nearest,
      source,
      snapped: true,
      reason: outside
        ? `time ${tick} is outside this run (${first}–${last}); showing the nearest real tick ${nearest}`
        : `this run has no state at ${tick}; showing the nearest real tick ${nearest}`,
    };
  }

  /**
   * A tick that belongs to a DIFFERENT run must never move this world, even
   * if the number happens to exist here — day 72 of a 72-day run and day 72
   * of this one are not the same moment. Callers holding a marker use this
   * rather than `resolve`.
   */
  resolveForeign(request: TimeRequest & { readonly onViewerClock: boolean }): TimeResolution {
    if (!request.onViewerClock) {
      return {
        granted: false,
        worldTime: request.current,
        source: request.source,
        snapped: false,
        reason: 'this marker belongs to a different run, so it has no position on this timeline',
      };
    }
    return this.resolve(request);
  }
}
