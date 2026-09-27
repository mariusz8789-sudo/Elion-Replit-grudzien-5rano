import { describe, it, expect } from "vitest";
import { checkGpsAnomaly } from "../fraud";

describe("checkGpsAnomaly", () => {
  it("flags no anomaly for a plausible driving speed", () => {
    const prev = { lat: 52.2297, lng: 21.0122, createdAt: new Date("2026-01-01T10:00:00Z") };
    const next = { lat: 52.4064, lng: 16.9252, createdAt: new Date("2026-01-01T13:00:00Z") };
    // Warsaw -> Poznan (~280km) in 3 hours = ~93 km/h, plausible
    const result = checkGpsAnomaly(prev, next);
    expect(result.anomalous).toBe(false);
  });

  it("flags an anomaly for an impossibly fast jump", () => {
    const prev = { lat: 52.2297, lng: 21.0122, createdAt: new Date("2026-01-01T10:00:00Z") };
    const next = { lat: 40.7128, lng: -74.006, createdAt: new Date("2026-01-01T10:05:00Z") };
    // Warsaw -> New York in 5 minutes: physically impossible
    const result = checkGpsAnomaly(prev, next);
    expect(result.anomalous).toBe(true);
    expect(result.impliedSpeedKmh).toBeGreaterThan(1000);
    expect(result.reason).toBeDefined();
  });

  it("does not divide by zero or flag when timestamps are identical", () => {
    const point = { lat: 52.2297, lng: 21.0122, createdAt: new Date("2026-01-01T10:00:00Z") };
    const result = checkGpsAnomaly(point, { ...point });
    expect(result.anomalous).toBe(false);
  });

  it("uses the 180 km/h plausibility threshold consistently", () => {
    // ~16.6km in 3 minutes = ~333 km/h, over the threshold
    const prev = { lat: 52.2297, lng: 21.0122, createdAt: new Date("2026-01-01T10:00:00Z") };
    const next = { lat: 52.3797, lng: 21.0122, createdAt: new Date("2026-01-01T10:03:00Z") };
    const result = checkGpsAnomaly(prev, next);
    expect(result.anomalous).toBe(true);
    expect(result.impliedSpeedKmh).toBeGreaterThan(180);
  });
});
