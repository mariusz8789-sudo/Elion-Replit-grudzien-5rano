import { describe, expect, it } from 'vitest';
import { formatHudTelemetry, pushHoloPoint, resetHoloPath, snapshotHoloPath } from '../core/holoTelemetry';

/**
 * The HUD readout is the one place where the 2040 shell shows numbers, so it
 * must show only what the backend measured or computed — and nothing when it
 * has nothing.
 */
describe('holoTelemetry — no measurement, no number', () => {
  it('renders an empty string when neither telemetry nor manifold exists', () => {
    expect(formatHudTelemetry(null, null)).toBe('');
  });
  it('renders measured machine values verbatim (cpu count, used/total GB, 1-min load)', () => {
    const s = formatHudTelemetry({ cpuCount: 8, totalMemBytes: 16e9, freeMemBytes: 4e9, loadAvg: [1.234, 1, 1] }, null);
    expect(s).toBe('CPU 8 · MEM 12.0/16.0G · LOAD 1.23');
  });
  it('renders the manifold geometry only once the path has at least 3 samples', () => {
    const m = { curvature: { mean: 0.12345 }, temporalStabilityIndex: 0.9312, sdf: { insideFraction: 0.25 }, pointCount: 2 };
    expect(formatHudTelemetry(null, m)).toBe('');
    expect(formatHudTelemetry(null, { ...m, pointCount: 3 })).toBe('M5D κ=0.123 · S=0.93 · SDF∈25%');
  });
  it('the ring buffer keeps the newest 64 camera samples, oldest first', () => {
    resetHoloPath();
    for (let i = 0; i < 70; i++) pushHoloPoint({ x: i, y: 0, z: 0, temporalT: i, hyperspaceW: 0 });
    const p = snapshotHoloPath();
    expect(p).toHaveLength(64);
    expect(p[0].x).toBe(6);
    expect(p[63].x).toBe(69);
    resetHoloPath();
    expect(snapshotHoloPath()).toHaveLength(0);
  });
});
