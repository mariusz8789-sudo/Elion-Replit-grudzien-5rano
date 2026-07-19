import { describe, it, expect } from "vitest";
import { packBin, type Placement } from "./binPacking";

function overlaps(a: Placement, b: Placement): boolean {
  return (
    a.x < b.x + b.length && a.x + a.length > b.x &&
    a.y < b.y + b.width && a.y + a.width > b.y &&
    a.z < b.z + b.height && a.z + a.height > b.z
  );
}

const van = { length: 250, width: 150, height: 150 };

describe("packBin", () => {
  it("places an item that fits well inside the empty bounds", () => {
    const result = packBin(van, [{ id: "a", length: 100, width: 100, height: 100 }]);
    expect(result.unplaced).toEqual([]);
    expect(result.placements).toHaveLength(1);
    const p = result.placements[0];
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.z).toBeGreaterThanOrEqual(0);
    expect(p.x + p.length).toBeLessThanOrEqual(van.length);
    expect(p.y + p.width).toBeLessThanOrEqual(van.width);
    expect(p.z + p.height).toBeLessThanOrEqual(van.height);
  });

  it("marks an item larger than the bin in every rotation as unplaced", () => {
    const result = packBin(van, [{ id: "too-big", length: 300, width: 300, height: 300 }]);
    expect(result.unplaced).toEqual(["too-big"]);
    expect(result.placements).toHaveLength(0);
  });

  it("never overlaps two placed items", () => {
    const items = [
      { id: "1", length: 80, width: 80, height: 80 },
      { id: "2", length: 60, width: 60, height: 60 },
      { id: "3", length: 100, width: 50, height: 50 },
      { id: "4", length: 40, width: 40, height: 40 },
      { id: "5", length: 120, width: 90, height: 70 },
    ];
    const result = packBin(van, items);
    for (let i = 0; i < result.placements.length; i++) {
      for (let j = i + 1; j < result.placements.length; j++) {
        expect(overlaps(result.placements[i], result.placements[j])).toBe(false);
      }
    }
  });

  it("keeps every placement fully within the bin bounds regardless of chosen rotation", () => {
    const items = [
      { id: "1", length: 200, width: 40, height: 40 },
      { id: "2", length: 30, width: 140, height: 30 },
    ];
    const result = packBin(van, items);
    for (const p of result.placements) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.z).toBeGreaterThanOrEqual(0);
      expect(p.x + p.length).toBeLessThanOrEqual(van.length);
      expect(p.y + p.width).toBeLessThanOrEqual(van.width);
      expect(p.z + p.height).toBeLessThanOrEqual(van.height);
    }
  });

  it("computes utilizationPercent from only the placed volume, not unplaced items", () => {
    const result = packBin(van, [
      { id: "fits", length: 50, width: 50, height: 50 },
      { id: "too-big", length: 999, width: 999, height: 999 },
    ]);
    const binVolume = van.length * van.width * van.height;
    expect(result.usedVolume).toBe(50 * 50 * 50);
    expect(result.utilizationPercent).toBeCloseTo((result.usedVolume / binVolume) * 100, 2);
    expect(result.unplaced).toEqual(["too-big"]);
  });

  it("is deterministic - identical input always produces identical placements", () => {
    const items = [
      { id: "1", length: 80, width: 80, height: 80 },
      { id: "2", length: 60, width: 60, height: 60 },
      { id: "3", length: 40, width: 40, height: 40 },
    ];
    const result1 = packBin(van, items);
    const result2 = packBin(van, items);
    expect(result1).toEqual(result2);
  });

  it("returns zero utilization for an empty item list", () => {
    const result = packBin(van, []);
    expect(result.placements).toEqual([]);
    expect(result.unplaced).toEqual([]);
    expect(result.utilizationPercent).toBe(0);
  });
});
