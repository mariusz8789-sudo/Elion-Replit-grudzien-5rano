import { describe, expect, it } from 'vitest';
import { GenesisScientificCitySim } from '../core/three/genesisScientificCitySim';

/**
 * GENESIS WORLD INTERACTION — the interactive replay scrubber. `scrubReplayTo` is a thin wrapper
 * around the SAME `startReplay`/`this.replay.cursor` state `advanceReplay` already drives, which
 * `syncScene`'s own `getFrameState(this.activeEngine, this.replay?.cursor)` (unmodified by this
 * feature) reads every frame — this file only proves the bounds/clamping contract, not a second
 * rendering path (already covered by `genesisScientificCitySim.test.ts`).
 */
describe('GenesisScientificCitySim — interactive replay scrubber (GENESIS WORLD INTERACTION)', () => {
  it('getReplayBounds() is honestly null before anything has happened yet — nothing real to scrub through', () => {
    const sim = new GenesisScientificCitySim();
    expect(sim.getReplayBounds()).toBeNull();
  });

  it('scrubReplayTo() before any history refuses (false) rather than fabricating a frame', () => {
    const sim = new GenesisScientificCitySim();
    expect(sim.scrubReplayTo(0)).toBe(false);
  });

  it('after real ticks, getReplayBounds() reflects the real [0, current tick] window', () => {
    const sim = new GenesisScientificCitySim();
    sim.step(6);
    const bounds = sim.getReplayBounds();
    expect(bounds).not.toBeNull();
    expect(bounds!.fromTick).toBe(0);
    expect(bounds!.toTick).toBe(sim.getStats().tick);
  });

  it('scrubReplayTo() jumps the cursor to the requested real tick, reflected in getStats()', () => {
    const sim = new GenesisScientificCitySim();
    sim.step(6);
    const toTick = sim.getStats().tick;
    const midTick = Math.floor(toTick / 2);
    expect(sim.scrubReplayTo(midTick)).toBe(true);
    const stats = sim.getStats();
    expect(stats.replaying).toBe(1);
    expect(stats.replayTick).toBe(midTick);
    // Scrubbing is a VIEW, not a mutation — the engine's own real tick is untouched.
    expect(stats.tick).toBe(toTick);
  });

  it('scrubReplayTo() clamps to the real bounds instead of accepting an out-of-range tick', () => {
    const sim = new GenesisScientificCitySim();
    sim.step(4);
    const toTick = sim.getStats().tick;
    expect(sim.scrubReplayTo(9999)).toBe(true);
    expect(sim.getStats().replayTick).toBe(toTick);
    expect(sim.scrubReplayTo(-50)).toBe(true);
    expect(sim.getStats().replayTick).toBe(0);
  });

  it('scrubbing past the end clears replay mode the same honest way advanceReplay already does, on the next scrub call', () => {
    const sim = new GenesisScientificCitySim();
    sim.step(4);
    sim.scrubReplayTo(2);
    expect(sim.isReplaying()).toBe(true);
    sim.stopReplay();
    expect(sim.isReplaying()).toBe(false);
    expect(sim.getStats().replayTick).toBe(-1);
  });
});
