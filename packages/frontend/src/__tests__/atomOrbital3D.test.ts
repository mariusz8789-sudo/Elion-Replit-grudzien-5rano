import { describe, expect, it } from 'vitest';
import { ORBITALS } from '../labs/atom';
import { findMaxWeightedDensityXZPlane, sampleOrbitalCloudInto } from '../labs/experiments/atom-orbital-3d';

describe('ORBITALS.Y — część kątowa jako funkcja pełnego wektora jednostkowego (dx,dy,dz)', () => {
  it('2pz/3pz: Y=dz — dodatnie dla dz>0, ujemne dla dz<0, zero na równiku', () => {
    expect(ORBITALS['2pz'].Y(0, 0, 1)).toBeCloseTo(1, 9);
    expect(ORBITALS['2pz'].Y(0, 0, -1)).toBeCloseTo(-1, 9);
    expect(ORBITALS['2pz'].Y(1, 0, 0)).toBeCloseTo(0, 9);
  });

  it('3dz2: Y=3dz²−1 — dodatnie na biegunach, ujemne na równiku (pierścień węzłowy przy |dz|=1/√3)', () => {
    expect(ORBITALS['3dz2'].Y(0, 0, 1)).toBeCloseTo(2, 9);
    expect(ORBITALS['3dz2'].Y(1, 0, 0)).toBeCloseTo(-1, 9);
    const dzNode = 1 / Math.sqrt(3);
    expect(ORBITALS['3dz2'].Y(Math.sqrt(1 - dzNode * dzNode), 0, dzNode)).toBeCloseTo(0, 9);
  });

  it('3dxz: Y=2·dx·dz — cztery płaty na przemian dodatnie/ujemne w płaszczyźnie x–z, zero na osiach', () => {
    const s = 1 / Math.SQRT2;
    expect(ORBITALS['3dxz'].Y(s, 0, s)).toBeCloseTo(1, 9); // ćwiartka (+x,+z): dodatni
    expect(ORBITALS['3dxz'].Y(-s, 0, s)).toBeCloseTo(-1, 9); // (-x,+z): ujemny
    expect(ORBITALS['3dxz'].Y(s, 0, -s)).toBeCloseTo(-1, 9); // (+x,-z): ujemny
    expect(ORBITALS['3dxz'].Y(-s, 0, -s)).toBeCloseTo(1, 9); // (-x,-z): dodatni
    expect(ORBITALS['3dxz'].Y(1, 0, 0)).toBeCloseTo(0, 9); // na osi x: węzeł
    expect(ORBITALS['3dxz'].Y(0, 0, 1)).toBeCloseTo(0, 9); // na osi z: węzeł
  });

  it('s-orbitale (1s,2s,3s) są izotropowe: Y=1 niezależnie od kierunku', () => {
    for (const key of ['1s', '2s', '3s']) {
      expect(ORBITALS[key].Y(1, 0, 0)).toBe(1);
      expect(ORBITALS[key].Y(0, 1, 0)).toBe(1);
      expect(ORBITALS[key].Y(0, 0, 1)).toBe(1);
    }
  });

  it('3dxz nie zależy od dy poza normalizacją r — Y jest funkcją WYŁĄCZNIE dx,dz przekazanych (spójne z xz/r² po unormowaniu)', () => {
    // Dla tego samego (dx,dz) znormalizowanego wektora, Y nie zmienia się gdy dy=0 zamieniamy na inną wartość
    // przekazaną jawnie (funkcja przyjmuje już unormowane składowe, nie liczy r sama).
    expect(ORBITALS['3dxz'].Y(0.6, 0.1, 0.8)).toBeCloseTo(ORBITALS['3dxz'].Y(0.6, -0.3, 0.8), 9);
  });
});

describe('findMaxWeightedDensityXZPlane — maksimum r²|ψ|² do normalizacji Monte Carlo', () => {
  it('zwraca dodatnią liczbę dla każdego zarejestrowanego orbitalu', () => {
    for (const orb of Object.values(ORBITALS)) {
      expect(findMaxWeightedDensityXZPlane(orb)).toBeGreaterThan(0);
    }
  });

  it('dla 1s maksimum WAŻONE r²R(r)² leży przy r=1 (nie r=0), zgodnie z d/dr[r²e⁻²ʳ]=0 → r=1', () => {
    // R(r)=2e^-r, więc r²R(r)²=4r²e^-2r, maksimum przy r=1: 4·1·e⁻²≈0,5413
    const max = findMaxWeightedDensityXZPlane(ORBITALS['1s'], 2000);
    expect(max).toBeCloseTo(4 * Math.exp(-2), 2);
  });
});

describe('sampleOrbitalCloudInto — chmura punktów Monte Carlo (odrzucanie, promień losowany jednostajnie z wagą r² w akceptacji)', () => {
  it('wypełnia bufor W PEŁNI punktami leżącymi w kuli o promieniu extent i przypisuje kolor cyjan/fiolet zgodnie ze znakiem ψ', () => {
    const orb = ORBITALS['2pz'];
    const count = 2000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const maxDensity = findMaxWeightedDensityXZPlane(orb);
    const filled = sampleOrbitalCloudInto(orb, positions, colors, count, maxDensity);

    expect(filled).toBe(count); // budżet prób z dużym zapasem — powinno się wypełnić w całości
    let sawPositive = false;
    let sawNegative = false;
    for (let i = 0; i < filled; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      const r = Math.hypot(x, y, z);
      expect(r).toBeLessThanOrEqual(orb.extent + 1e-6);
      const g = colors[i * 3 + 1];
      // cyjan ma wysoki kanał G (0.84), fiolet niższy (0.42) — patrz stałe w module
      if (g > 0.6) sawPositive = true;
      else sawNegative = true;
    }
    // 2pz ma jawnie dwa płaty przeciwnego znaku — oba muszą się pojawić w próbie 2000 punktów
    expect(sawPositive).toBe(true);
    expect(sawNegative).toBe(true);
  });

  it('dla orbitalu 1s (wszędzie dodatni) wszystkie punkty mają barwę cyjan (brak fioletowych), pełne wypełnienie mimo ciasnego rozkładu radialnego', () => {
    const orb = ORBITALS['1s'];
    const count = 500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const maxDensity = findMaxWeightedDensityXZPlane(orb);
    const filled = sampleOrbitalCloudInto(orb, positions, colors, count, maxDensity);
    expect(filled).toBe(count);
    for (let i = 0; i < filled; i++) {
      expect(colors[i * 3 + 1]).toBeCloseTo(0.84, 5);
    }
  });

  it('dla ciasnego orbitalu 1s wydajność jest wystarczająca, by wypełnić 16000 punktów (produkcyjny budżet) w rozsądnym czasie prób', () => {
    const orb = ORBITALS['1s'];
    const count = 16000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const maxDensity = findMaxWeightedDensityXZPlane(orb);
    const filled = sampleOrbitalCloudInto(orb, positions, colors, count, maxDensity);
    // Przed naprawą (próbkowanie jednostajne w OBJĘTOŚCI zamiast promienia) ten
    // sam budżet prób wypełniał dla 1s tylko ok. 1/5 z 16000 — regresja tego
    // testu wykrywa powrót do starego, wolnego algorytmu.
    expect(filled).toBe(count);
  });
});
