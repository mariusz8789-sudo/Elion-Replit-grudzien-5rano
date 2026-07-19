import { describe, it, expect } from "vitest";
import {
  lerp,
  interpolateLngLat,
  haversineMeters,
  bearingDegrees,
  interpolationDurationMs,
  type LngLat,
} from "./mapInterpolation";

describe("lerp", () => {
  it("returns the endpoints at t=0 and t=1", () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
  });
  it("returns the midpoint at t=0.5", () => {
    expect(lerp(10, 20, 0.5)).toBe(15);
  });
  it("clamps t outside [0,1]", () => {
    expect(lerp(10, 20, -1)).toBe(10);
    expect(lerp(10, 20, 2)).toBe(20);
  });
});

describe("interpolateLngLat", () => {
  const a: LngLat = [13.4, 52.5];
  const b: LngLat = [11.6, 48.1];
  it("returns start at t=0 and end at t=1", () => {
    expect(interpolateLngLat(a, b, 0)).toEqual(a);
    expect(interpolateLngLat(a, b, 1)).toEqual(b);
  });
  it("returns the straight-line midpoint at t=0.5", () => {
    expect(interpolateLngLat(a, b, 0.5)).toEqual([12.5, 50.3]);
  });
  it("advances monotonically along each axis", () => {
    const q = interpolateLngLat(a, b, 0.25);
    expect(q[0]).toBeGreaterThan(b[0]);
    expect(q[0]).toBeLessThan(a[0]);
    expect(q[1]).toBeLessThan(a[1]);
    expect(q[1]).toBeGreaterThan(b[1]);
  });
});

describe("haversineMeters", () => {
  it("is zero for identical points", () => {
    expect(haversineMeters([13.4, 52.5], [13.4, 52.5])).toBe(0);
  });
  it("matches the known Berlin->Munich great-circle distance (~504 km) within 1%", () => {
    const d = haversineMeters([13.405, 52.52], [11.582, 48.135]);
    expect(d).toBeGreaterThan(499_000);
    expect(d).toBeLessThan(509_000);
  });
  it("computes ~111 km for one degree of latitude", () => {
    const d = haversineMeters([0, 0], [0, 1]);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe("bearingDegrees", () => {
  it("is 90 (east) when moving along the equator to the east", () => {
    expect(bearingDegrees([0, 0], [1, 0])).toBeCloseTo(90, 1);
  });
  it("is 0 (north) when moving straight up", () => {
    expect(bearingDegrees([0, 0], [0, 1])).toBeCloseTo(0, 1);
  });
  it("always returns a value in [0, 360)", () => {
    const b = bearingDegrees([1, 1], [0, 0]);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

describe("interpolationDurationMs", () => {
  it("scales with distance within the unclamped range", () => {
    // Wide bounds so neither sample hits the floor/ceiling and we observe raw scaling.
    const near = interpolationDurationMs(200, { minMs: 0, maxMs: 1_000_000 });
    const far = interpolationDurationMs(2000, { minMs: 0, maxMs: 1_000_000 });
    expect(far).toBeGreaterThan(near);
  });
  it("clamps tiny movements to the floor and huge jumps to the ceiling", () => {
    expect(interpolationDurationMs(1, { minMs: 500 })).toBe(500);
    expect(interpolationDurationMs(10_000_000, { maxMs: 5000 })).toBe(5000);
  });
  it("respects a custom speed", () => {
    // 1400 m at 14 m/s = 100_000 ms raw -> but clamped; use small distance to see raw scaling
    const slow = interpolationDurationMs(700, { metersPerSecond: 7, minMs: 0, maxMs: 1_000_000 });
    const fast = interpolationDurationMs(700, { metersPerSecond: 14, minMs: 0, maxMs: 1_000_000 });
    expect(slow).toBeCloseTo(fast * 2, 5);
  });
});
