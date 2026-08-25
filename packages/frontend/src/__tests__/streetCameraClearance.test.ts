import { describe, expect, it } from 'vitest';

/**
 * Regresja, która wracała dwa razy: kamera uliczna lądowała tuż za pniem i pień
 * wypełniał pierwszy plan. Kadr jest teraz wyliczany z układu szpaleru, więc ten
 * test pilnuje samej reguły doboru, a nie konkretnej liczby.
 */
function largestGapCentre(obstacles: readonly number[], from: number, to: number): number {
  const marks = [from, ...obstacles.filter((x) => x > from && x < to), to];
  let bestCentre = (from + to) / 2;
  let bestWidth = -1;
  for (let i = 1; i < marks.length; i++) {
    const width = marks[i] - marks[i - 1];
    if (width > bestWidth) { bestWidth = width; bestCentre = (marks[i - 1] + marks[i]) / 2; }
  }
  return bestCentre;
}

/** Odtwarza realny rozstaw z addStreetTrees dla danej szerokości świata. */
function treeRowX(worldW: number, spacing = 8.6): number[] {
  const xs: number[] = [];
  for (let x = -worldW / 2 + 1.6; x < worldW / 2; x += spacing) xs.push(x);
  return xs;
}

const WORLD_W = 900 * 0.02;
const TRUNK_RADIUS_MAX = 4.5 * 0.05; // najgrubszy pień: height 4.5 × promień 0.05

describe('STREET camera clearance', () => {
  it('stands in the middle of the widest gap, not next to a trunk', () => {
    const row = treeRowX(WORLD_W);
    const centre = largestGapCentre(row, -WORLD_W / 2, WORLD_W / 2);
    const nearest = Math.min(...row.map((x) => Math.abs(x - centre)));
    // Realny prześwit, nie „kilka centymetrów od kory".
    expect(nearest).toBeGreaterThan(2);
    expect(nearest).toBeGreaterThan(TRUNK_RADIUS_MAX * 10);
  });

  it('the old hard-coded position was genuinely too close — this is what regressed', () => {
    const row = treeRowX(WORLD_W);
    const oldCameraX = -WORLD_W * 0.46;
    const nearestToOld = Math.min(...row.map((x) => Math.abs(x - oldCameraX)));
    const nearestToNew = Math.min(...row.map((x) => Math.abs(x - largestGapCentre(row, -WORLD_W / 2, WORLD_W / 2))));
    expect(nearestToNew).toBeGreaterThan(nearestToOld * 3);
  });

  it('self-corrects when the tree spacing changes', () => {
    for (const spacing of [4, 6.2, 8.6, 12]) {
      const row = treeRowX(WORLD_W, spacing);
      const centre = largestGapCentre(row, -WORLD_W / 2, WORLD_W / 2);
      const nearest = Math.min(...row.map((x) => Math.abs(x - centre)));
      // Przy każdym rozstawie kamera trafia w prześwit, nie w pień.
      expect(nearest).toBeGreaterThan(TRUNK_RADIUS_MAX * 4);
    }
  });

  it('handles an empty row without collapsing to a trunk position', () => {
    expect(largestGapCentre([], -WORLD_W / 2, WORLD_W / 2)).toBe(0);
  });
});
