import { describe, expect, it, vi } from 'vitest';
import { TransitController, type TransitContext } from '../core/reality/transit';

const CTX: TransitContext = { fromBranchId: 'b1', toBranchId: 'b2', fromSceneId: 's1', toSceneId: 's2' };

describe('TransitController', () => {
  it('starts idle with no context', () => {
    const t = new TransitController();
    expect(t.isActive).toBe(false);
    expect(t.getState().phase).toBe('idle');
    expect(t.getState().context).toBeNull();
  });

  it('begin() activates and carries the context; a second begin() while active is ignored', () => {
    const t = new TransitController();
    expect(t.begin(CTX)).toBe(true);
    expect(t.isActive).toBe(true);
    expect(t.getState().context).toEqual(CTX);
    expect(t.begin({ ...CTX, toBranchId: 'other' })).toBe(false);
    expect(t.getState().context!.toBranchId).toBe('b2'); // unchanged
  });

  it('advances through departing -> in-transit -> arriving in order', () => {
    const t = new TransitController([
      { phase: 'departing', duration: 1 },
      { phase: 'in-transit', duration: 1 },
      { phase: 'arriving', duration: 1 },
    ]);
    t.begin(CTX);
    expect(t.advance(0.5).phase).toBe('departing');
    expect(t.advance(1).phase).toBe('in-transit'); // elapsed 1.5
    expect(t.advance(1).phase).toBe('arriving'); // elapsed 2.5
  });

  it('phaseProgress runs 0->1 within a phase and total progress runs 0->1 across all phases', () => {
    const t = new TransitController([
      { phase: 'departing', duration: 2 },
      { phase: 'in-transit', duration: 2 },
      { phase: 'arriving', duration: 2 },
    ]);
    t.begin(CTX);
    const s = t.advance(1); // halfway through the first (departing) phase
    expect(s.phase).toBe('departing');
    expect(s.phaseProgress).toBeCloseTo(0.5);
    expect(s.progress).toBeCloseTo(1 / 6);
  });

  it('reaches complete at total duration and clamps beyond it', () => {
    const t = new TransitController([{ phase: 'departing', duration: 1 }, { phase: 'in-transit', duration: 1 }, { phase: 'arriving', duration: 1 }]);
    t.begin(CTX);
    const s = t.advance(100);
    expect(s.phase).toBe('complete');
    expect(s.progress).toBe(1);
  });

  it('consumeCompletion returns the context exactly once, then resets to idle', () => {
    const t = new TransitController([{ phase: 'departing', duration: 1 }, { phase: 'in-transit', duration: 1 }, { phase: 'arriving', duration: 1 }]);
    t.begin(CTX);
    t.advance(5); // to complete
    expect(t.consumeCompletion()).toEqual(CTX);
    expect(t.consumeCompletion()).toBeNull(); // second call yields nothing
    expect(t.isActive).toBe(false);
    expect(t.getState().phase).toBe('idle');
  });

  it('consumeCompletion returns null before the transit is complete', () => {
    const t = new TransitController([{ phase: 'departing', duration: 1 }, { phase: 'in-transit', duration: 1 }, { phase: 'arriving', duration: 1 }]);
    t.begin(CTX);
    t.advance(1); // still in progress
    expect(t.consumeCompletion()).toBeNull();
    expect(t.isActive).toBe(true);
  });

  it('a fresh transit can begin after the previous one completes', () => {
    const t = new TransitController([{ phase: 'departing', duration: 1 }, { phase: 'in-transit', duration: 1 }, { phase: 'arriving', duration: 1 }]);
    t.begin(CTX);
    t.advance(5);
    t.consumeCompletion();
    const CTX2: TransitContext = { fromBranchId: 'b2', toBranchId: 'b3', fromSceneId: 's2', toSceneId: 's2' };
    expect(t.begin(CTX2)).toBe(true);
    expect(t.getState().context).toEqual(CTX2);
  });

  it('notifies subscribers on begin and advance', () => {
    const t = new TransitController();
    const listener = vi.fn();
    t.subscribe(listener);
    t.begin(CTX);
    t.advance(0.5);
    expect(listener).toHaveBeenCalled();
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('advance on an inactive controller is a no-op returning idle', () => {
    const t = new TransitController();
    expect(t.advance(1).phase).toBe('idle');
  });
});
