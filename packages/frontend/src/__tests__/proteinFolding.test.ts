import { describe, expect, it } from 'vitest';
import {
  contactEnergy,
  isConnected,
  isSelfAvoiding,
  mcStep,
  parseSequence,
  straightChain,
  type Point,
} from '../core/proteinFolding';

/** Generator liniowy kongruentny — deterministyczny, powtarzalny RNG dla testów statystycznych. */
function seededRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('parseSequence', () => {
  it('akceptuje tylko H i P, ignoruje resztę, jest niewrażliwe na wielkość liter', () => {
    expect(parseSequence('hHpP123xyz')).toEqual(['H', 'H', 'P', 'P']);
  });
});

describe('contactEnergy — dokładna formuła kontaktowa modelu HP (Lau & Dill 1989)', () => {
  it('łańcuch prosty ma energię 0 (żadne dwie nie-sąsiadujące reszty nie są nigdy blisko siebie na linii)', () => {
    const seq = parseSequence('HHHHHHHH');
    expect(contactEnergy(seq, straightChain(8))).toBe(0);
  });

  it('konformacja spinki do włosów (hairpin) 6 reszt: dokładnie 2 kontakty geometryczne (0-5 i 1-4), ręcznie zweryfikowane', () => {
    const hairpin: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    expect(isConnected(hairpin)).toBe(true);
    expect(isSelfAvoiding(hairpin)).toBe(true);
    // wszystkie H: oba geometryczne kontakty liczą się -> energia -2
    expect(contactEnergy(parseSequence('HHHHHH'), hairpin)).toBe(-2);
    // H na końcach, P w środku: tylko kontakt (0,5) to H-H, (1,4) to P-P (nie liczy się)
    expect(contactEnergy(parseSequence('HPPPPH'), hairpin)).toBe(-1);
    // same P: żaden kontakt się nie liczy
    expect(contactEnergy(parseSequence('PPPPPP'), hairpin)).toBe(0);
  });

  it('energia jest zawsze ≤ 0 (kontakty tylko obniżają energię, nigdy nie podnoszą)', () => {
    const hairpin: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    for (const seq of ['HHHHHH', 'HPHPHP', 'PPPPPP', 'HPPPPH']) {
      expect(contactEnergy(parseSequence(seq), hairpin)).toBeLessThanOrEqual(0);
    }
  });
});

describe('mcStep (Metropolis) — zachowuje niezmienniki konformacji łańcucha', () => {
  it('po wielu krokach MC łańcuch pozostaje samounikający i spójny (nigdy nie łamie fizyki modelu)', () => {
    const seq = parseSequence('HPHPPHHPHHPH');
    let positions = straightChain(seq.length);
    const rnd = seededRng(42);
    for (let i = 0; i < 5000; i++) {
      const result = mcStep(seq, positions, 1.0, rnd);
      positions = result.positions;
      expect(isSelfAvoiding(positions)).toBe(true);
      expect(isConnected(positions)).toBe(true);
    }
  });

  it('przy bardzo niskiej temperaturze (T→0) NIGDY nie akceptuje ruchu podnoszącego energię (zachłanne zejście)', () => {
    const seq = parseSequence('HPHPPHHPHHPH');
    let positions = straightChain(seq.length);
    const rnd = seededRng(7);
    let lastEnergy = contactEnergy(seq, positions);
    for (let i = 0; i < 2000; i++) {
      const result = mcStep(seq, positions, 0.001, rnd);
      if (result.accepted) {
        expect(result.energy).toBeLessThanOrEqual(lastEnergy);
      }
      positions = result.positions;
      lastEnergy = result.energy;
    }
  });

  it('symulacja w niskiej temperaturze osiąga energię ≤ energii łańcucha startowego (szuka lepszych konformacji, nie gorszych)', () => {
    const seq = parseSequence('HPHPPHHPHHPHPH');
    let positions = straightChain(seq.length);
    const startEnergy = contactEnergy(seq, positions);
    const rnd = seededRng(99);
    let bestEnergy = startEnergy;
    for (let i = 0; i < 20000; i++) {
      const result = mcStep(seq, positions, 0.5, rnd);
      positions = result.positions;
      bestEnergy = Math.min(bestEnergy, result.energy);
    }
    expect(bestEnergy).toBeLessThanOrEqual(startEnergy);
    // sekwencja z licznymi H powinna znaleźć PRAWDZIWY kontakt hydrofobowy (energia < 0) w 20000 krokach
    expect(bestEnergy).toBeLessThan(0);
  });

  it('sam-P sekwencja (brak reszt hydrofobowych) zawsze ma energię 0, niezależnie od konformacji', () => {
    const seq = parseSequence('PPPPPPPPPP');
    let positions = straightChain(seq.length);
    const rnd = seededRng(5);
    for (let i = 0; i < 500; i++) {
      const result = mcStep(seq, positions, 2.0, rnd);
      positions = result.positions;
      expect(result.energy).toBe(0);
    }
  });
});
