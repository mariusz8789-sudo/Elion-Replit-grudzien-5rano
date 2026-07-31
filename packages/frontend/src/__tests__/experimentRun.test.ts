import { describe, expect, it } from 'vitest';
import { appendSample, MAX_SAMPLES } from '../core/experimentRun';

describe('experimentRun: ring buffer', () => {
  it('appends samples in order', () => {
    let samples = appendSample([], 0, { a: 1 });
    samples = appendSample(samples, 1, { a: 2 });
    expect(samples).toEqual([
      { t: 0, stats: { a: 1 } },
      { t: 1, stats: { a: 2 } },
    ]);
  });

  it('caps at MAX_SAMPLES, dropping the oldest', () => {
    let samples: ReturnType<typeof appendSample> = [];
    for (let i = 0; i < MAX_SAMPLES + 10; i++) {
      samples = appendSample(samples, i, { a: i });
    }
    expect(samples.length).toBe(MAX_SAMPLES);
    expect(samples[0].t).toBe(10); // the first 10 were dropped
    expect(samples[samples.length - 1].t).toBe(MAX_SAMPLES + 9);
  });

  it('does not mutate the input array', () => {
    const original = [{ t: 0, stats: { a: 1 } }];
    const next = appendSample(original, 1, { a: 2 });
    expect(original.length).toBe(1);
    expect(next.length).toBe(2);
  });
});
