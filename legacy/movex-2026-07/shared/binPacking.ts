// Deterministic 3D bin-packing (best-fit guillotine split heuristic), used by SmartLoad 3D.
// This is a real, well-known packing algorithm - not a placeholder and not "AI". It can later
// be swapped for a learned/optimized packer without changing this module's public contract.

export interface BinDimensions {
  length: number;
  width: number;
  height: number;
}

export interface PackItem {
  id: string;
  length: number;
  width: number;
  height: number;
}

export interface Placement {
  id: string;
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
}

export interface PackResult {
  placements: Placement[];
  unplaced: string[];
  binVolume: number;
  usedVolume: number;
  utilizationPercent: number;
}

interface FreeSpace {
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
}

// All 6 axis-aligned orientations a rigid rectangular box can be rotated into.
const ROTATIONS: Array<(l: number, w: number, h: number) => [number, number, number]> = [
  (l, w, h) => [l, w, h],
  (l, w, h) => [l, h, w],
  (l, w, h) => [w, l, h],
  (l, w, h) => [w, h, l],
  (l, w, h) => [h, l, w],
  (l, w, h) => [h, w, l],
];

export function packBin(bin: BinDimensions, items: PackItem[]): PackResult {
  const binVolume = bin.length * bin.width * bin.height;
  // First-Fit Decreasing by volume: placing the largest items first is a standard heuristic
  // that meaningfully improves packing density over insertion order.
  const sorted = [...items].sort(
    (a, b) => b.length * b.width * b.height - a.length * a.width * a.height,
  );

  const freeSpaces: FreeSpace[] = [
    { x: 0, y: 0, z: 0, length: bin.length, width: bin.width, height: bin.height },
  ];
  const placements: Placement[] = [];
  const unplaced: string[] = [];

  for (const item of sorted) {
    let bestSpaceIdx = -1;
    let bestDims: [number, number, number] | null = null;
    let bestLeftoverVolume = Infinity;

    for (let i = 0; i < freeSpaces.length; i++) {
      const space = freeSpaces[i];
      for (const rotate of ROTATIONS) {
        const [l, w, h] = rotate(item.length, item.width, item.height);
        if (l <= space.length && w <= space.width && h <= space.height) {
          const leftover = space.length * space.width * space.height - l * w * h;
          if (leftover < bestLeftoverVolume) {
            bestLeftoverVolume = leftover;
            bestSpaceIdx = i;
            bestDims = [l, w, h];
          }
        }
      }
    }

    if (bestSpaceIdx === -1 || !bestDims) {
      unplaced.push(item.id);
      continue;
    }

    const space = freeSpaces[bestSpaceIdx];
    const [l, w, h] = bestDims;
    placements.push({ id: item.id, x: space.x, y: space.y, z: space.z, length: l, width: w, height: h });

    freeSpaces.splice(bestSpaceIdx, 1);
    const newSpaces: FreeSpace[] = [
      { x: space.x + l, y: space.y, z: space.z, length: space.length - l, width: space.width, height: space.height },
      { x: space.x, y: space.y + w, z: space.z, length: l, width: space.width - w, height: space.height },
      { x: space.x, y: space.y, z: space.z + h, length: l, width: w, height: space.height - h },
    ].filter((s) => s.length > 0 && s.width > 0 && s.height > 0);
    freeSpaces.push(...newSpaces);
  }

  const usedVolume = placements.reduce((sum, p) => sum + p.length * p.width * p.height, 0);
  return {
    placements,
    unplaced,
    binVolume,
    usedVolume,
    utilizationPercent: binVolume > 0 ? Math.round((usedVolume / binVolume) * 10000) / 100 : 0,
  };
}
