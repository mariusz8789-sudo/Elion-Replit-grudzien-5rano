import { describe, expect, it } from 'vitest';
import { generateCameraPath } from '../core/lookingGlass/urbanTransformation/cinematicDirector';
import type { TemporalLocationAnchor } from '../core/lookingGlass/urbanTransformation/contracts';

const anchor: TemporalLocationAnchor = { locationId: 'warsaw', label: 'test street', position: [10, 0, 20], yaw: 0, extentMeters: 100 };

describe('generateCameraPath — reuses the existing Looking Glass perspective/placeCamera math', () => {
  it('produces durationSeconds * fps points', () => {
    const path = generateCameraPath(anchor, 'OBSERVER', 5, 24);
    expect(path.points).toHaveLength(120);
  });

  it('every camera point looks at (or near) the fixed anchor, not a drifting target', () => {
    const path = generateCameraPath(anchor, 'ANCHORED_HUMAN', 2, 10);
    for (const point of path.points) {
      expect(point.target[0]).toBeCloseTo(anchor.position[0], 5);
      expect(point.target[2]).toBeCloseTo(anchor.position[2], 5);
    }
  });

  it('an ANCHORED_HUMAN viewpoint sweeps a full orbit across the clip (stationary observer, moving time)', () => {
    const path = generateCameraPath(anchor, 'ANCHORED_HUMAN', 4, 4);
    const first = path.points[0].position;
    const last = path.points.at(-1)!.position;
    // Full 2*pi sweep should bring the camera back close to where it started.
    expect(Math.hypot(first[0] - last[0], first[2] - last[2])).toBeLessThan(1);
  });

  it('timestamps are monotonically increasing and start at zero', () => {
    const path = generateCameraPath(anchor, 'OBSERVER', 3, 12);
    expect(path.points[0].timestampSeconds).toBe(0);
    for (let i = 1; i < path.points.length; i++) {
      expect(path.points[i].timestampSeconds).toBeGreaterThan(path.points[i - 1].timestampSeconds);
    }
  });

  it('is deterministic for the same inputs', () => {
    const a = generateCameraPath(anchor, 'DRIVER_POV', 2, 8);
    const b = generateCameraPath(anchor, 'DRIVER_POV', 2, 8);
    expect(a).toEqual(b);
  });
});
