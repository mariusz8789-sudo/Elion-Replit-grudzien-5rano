import { describe, expect, it } from 'vitest';
import {
  bondPolarity,
  chshS,
  circularVelocity,
  decayRemaining,
  exponentialDiskMass,
  G_ASTRO,
  isothermalHaloMass,
  kardashevPower,
  keplerPosition,
  lensAmplification,
  lensImagePositions,
  lorentzGamma,
  lorentzTime,
  mondAcceleration,
  MOND_A0_ASTRO,
  sampleLocalHiddenPair,
  sampleSingletPair,
  schwarzschildRadius,
  project4Dto3D,
  rotate4D,
  SCHWARZSCHILD_CRITICAL_IMPACT,
  schwarzschildGeodesicRHS,
  semfBindingEnergy,
  semfBindingPerNucleon,
  semfStabilityGradient,
  singletCorrelation,
  solveKepler,
  stepSchwarzschildGeodesic,
  TESSERACT_EDGES,
  TESSERACT_VERTICES,
} from '../core/physics';
import { PLANETS } from '../data/solarSystem';
import { KNOWN_NUCLIDES } from '../data/nuclides';

/** Deterministyczny PRNG (mulberry32) — testy statystyczne bez flakiness. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('szczególna teoria względności', () => {
  it('γ(0) = 1, γ(0,6) = 1,25, γ(0,8) = 5/3', () => {
    expect(lorentzGamma(0)).toBeCloseTo(1, 12);
    expect(lorentzGamma(0.6)).toBeCloseTo(1.25, 10);
    expect(lorentzGamma(0.8)).toBeCloseTo(5 / 3, 10);
  });

  it('kolejność zdarzeń przestrzennopodobnych zależy od obserwatora', () => {
    // Zdarzenia z Minkowski Lab: A(x=-0,55, ct=0,12), B(x=0,62, ct=0,2)
    const tA = (b: number) => lorentzTime(0.12, -0.55, b);
    const tB = (b: number) => lorentzTime(0.2, 0.62, b);
    expect(tA(0)).toBeLessThan(tB(0)); // spoczynek: najpierw A
    expect(tA(0.5)).toBeGreaterThan(tB(0.5)); // szybki obserwator: najpierw B
  });
});

describe('soczewka grawitacyjna (punktowa)', () => {
  it('iloczyn pozycji obrazów = −θ_E² (θ+·θ− = −1 w jednostkach θ_E)', () => {
    for (const beta of [0.1, 0.5, 1, 1.7]) {
      const [p, m] = lensImagePositions(beta);
      expect(p * m).toBeCloseTo(-1, 10);
      expect(p - m).toBeCloseTo(Math.sqrt(beta * beta + 4), 10);
    }
  });

  it('β = 0 daje pierścień Einsteina (obrazy w ±θ_E)', () => {
    const [p, m] = lensImagePositions(0);
    expect(p).toBeCloseTo(1, 10);
    expect(m).toBeCloseTo(-1, 10);
  });

  it('wzmocnienie: A(1) = 3/√5, A(∞) → 1, A małych u rośnie nieograniczenie', () => {
    expect(lensAmplification(1)).toBeCloseTo(3 / Math.sqrt(5), 10);
    expect(lensAmplification(50)).toBeCloseTo(1, 3);
    expect(lensAmplification(0.01)).toBeGreaterThan(50);
  });
});

describe('rozpad promieniotwórczy', () => {
  it('po 1 T½ zostaje 50%, po 10 T½ mniej niż 0,1%', () => {
    expect(decayRemaining(1)).toBeCloseTo(0.5, 12);
    expect(decayRemaining(2)).toBeCloseTo(0.25, 12);
    expect(decayRemaining(10)).toBeLessThan(0.001);
  });
});

describe('skala Kardaszewa (wzór Sagana)', () => {
  it('K=0,73 ≈ dzisiejsza ludzkość (~2×10¹³ W)', () => {
    const P = kardashevPower(0.73);
    expect(P).toBeGreaterThan(1e13);
    expect(P).toBeLessThan(3e13);
  });
  it('K=1 → 10¹⁶ W, K=2 → 10²⁶ W', () => {
    expect(kardashevPower(1)).toBeCloseTo(1e16, -10);
    expect(kardashevPower(2)).toBeCloseTo(1e26, -20);
  });
});

describe('promień Schwarzschilda', () => {
  it('dla Słońca ≈ 2,95 km', () => {
    const rs = schwarzschildRadius(1.989e30);
    expect(rs).toBeGreaterThan(2900);
    expect(rs).toBeLessThan(3000);
  });
});

describe('splątanie i CHSH', () => {
  it('korelacja singletu: E(a,a) = −1, E(a, a+90°) = 0', () => {
    expect(singletCorrelation(0.3, 0.3)).toBeCloseTo(-1, 10);
    expect(singletCorrelation(0, Math.PI / 2)).toBeCloseTo(0, 10);
  });

  it('optymalne kąty dają |S| = 2√2 (granica Tsirelsona)', () => {
    const D = Math.PI / 180;
    const S = chshS(singletCorrelation, 0, 90 * D, 45 * D, 135 * D);
    expect(Math.abs(S)).toBeCloseTo(2 * Math.SQRT2, 6);
  });

  it('próbkowanie kwantowe odtwarza −cos(a−b) i łamie granicę klasyczną', () => {
    const rnd = mulberry32(42);
    const N = 30000;
    const D = Math.PI / 180;
    const angles: [number, number][] = [
      [0, 45 * D],
      [0, 135 * D],
      [90 * D, 45 * D],
      [90 * D, 135 * D],
    ];
    const E = angles.map(([a, b]) => {
      let sum = 0;
      let ones = 0;
      for (let i = 0; i < N; i++) {
        const [A, B] = sampleSingletPair(a, b, rnd);
        sum += A * B;
        if (A === 1) ones++;
      }
      // rozkład brzegowy 50/50 (splątanie nie przesyła informacji)
      expect(ones / N).toBeGreaterThan(0.47);
      expect(ones / N).toBeLessThan(0.53);
      return sum / N;
    });
    E.forEach((e, i) => {
      const [a, b] = angles[i];
      expect(e).toBeCloseTo(singletCorrelation(a, b), 1);
    });
    const S = Math.abs(E[0] - E[1] + E[2] + E[3]);
    expect(S).toBeGreaterThan(2.6); // > 2 = złamany lokalny realizm
    expect(S).toBeLessThan(2.95); // ≤ 2√2 + szum
  });

  it('lokalne ukryte zmienne NIGDY nie przekraczają |S| = 2', () => {
    const rnd = mulberry32(7);
    const N = 30000;
    const D = Math.PI / 180;
    const angles: [number, number][] = [
      [0, 45 * D],
      [0, 135 * D],
      [90 * D, 45 * D],
      [90 * D, 135 * D],
    ];
    const E = angles.map(([a, b]) => {
      let sum = 0;
      for (let i = 0; i < N; i++) {
        const [A, B] = sampleLocalHiddenPair(a, b, rnd);
        sum += A * B;
      }
      return sum / N;
    });
    const S = Math.abs(E[0] - E[1] + E[2] + E[3]);
    expect(S).toBeLessThan(2.1); // 2 + margines statystyczny
  });
});

describe('równanie Keplera (Prawdziwy Układ Słoneczny, Universe Lab)', () => {
  it('dla orbity kołowej (e=0) anomalia mimośrodowa E = M dokładnie', () => {
    for (const M of [0, 0.5, Math.PI / 2, Math.PI, 4, 2 * Math.PI - 0.01]) {
      expect(solveKepler(M, 0)).toBeCloseTo(M, 10);
    }
  });

  it('rozwiązanie spełnia definiujące równanie E − e·sinE = M dla dowolnych e i M', () => {
    const eccentricities = [0.01, 0.2056, 0.5, 0.9]; // Merkury=0.2056, plus skrajne przypadki
    const meanAnomalies = [0, 0.3, 1.5, Math.PI, 4.2, 6.0];
    for (const e of eccentricities) {
      for (const M of meanAnomalies) {
        const E = solveKepler(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 9);
      }
    }
  });

  it('w peryhelium (M=0) odległość od ogniska wynosi dokładnie a·(1−e)', () => {
    for (const p of PLANETS) {
      const pos = keplerPosition(p.semiMajorAxisAu, p.eccentricity, 0);
      const r = Math.hypot(pos.x, pos.y);
      expect(r).toBeCloseTo(p.semiMajorAxisAu * (1 - p.eccentricity), 9);
    }
  });

  it('w aphelium (M=π) odległość od ogniska wynosi dokładnie a·(1+e)', () => {
    for (const p of PLANETS) {
      const pos = keplerPosition(p.semiMajorAxisAu, p.eccentricity, Math.PI);
      const r = Math.hypot(pos.x, pos.y);
      expect(r).toBeCloseTo(p.semiMajorAxisAu * (1 + p.eccentricity), 9);
    }
  });

  it('Merkury ma najbardziej wydłużoną orbitę spośród 8 planet (największy mimośród)', () => {
    const maxEcc = Math.max(...PLANETS.map((p) => p.eccentricity));
    expect(PLANETS.find((p) => p.id === 'mercury')?.eccentricity).toBe(maxEcc);
  });

  it('trzecie prawo Keplera: T²∝a³ w granicach 1% dla realnych danych NASA (Słońce dominuje masą)', () => {
    // T[lata] ≈ a[AU]^1.5 dla obiektu okrążającego gwiazdę o masie Słońca —
    // planety mają znikomy wpływ na tę relację mimo różnych mas. Porównanie
    // względne (nie bezwzględne), bo okresy rozpięte są na 3 rzędy wielkości
    // (Merkury 0,24 roku vs Neptun 165 lat).
    for (const p of PLANETS) {
      const years = p.periodDays / 365.25;
      const predicted = Math.pow(p.semiMajorAxisAu, 1.5);
      const relativeError = Math.abs(years - predicted) / predicted;
      expect(relativeError, `${p.name}: ${years} vs przewidywane ${predicted}`).toBeLessThan(0.01);
    }
  });
});

describe('wzór SEMF / Weizsäcker (Mapa nuklidów, Nuclear Lab)', () => {
  it('brak nukleonów → zerowa energia wiązania', () => {
    expect(semfBindingEnergy(0, 0)).toBe(0);
    expect(semfBindingEnergy(-1, 5)).toBe(0);
  });

  it('B/A jest po prostu B podzielone przez A (spójność funkcji)', () => {
    for (const [z, n] of [[6, 6], [26, 30], [92, 146]] as const) {
      expect(semfBindingPerNucleon(z, n)).toBeCloseTo(semfBindingEnergy(z, n) / (z + n), 9);
    }
  });

  it('środek tablicy Mendelejewa (Fe-56) jest mocniej związany na nukleon niż bardzo lekkie i bardzo ciężkie jądra', () => {
    const deuteron = semfBindingPerNucleon(1, 1); // A=2
    const fe56 = semfBindingPerNucleon(26, 30); // A=56
    const u238 = semfBindingPerNucleon(92, 146); // A=238
    expect(fe56).toBeGreaterThan(deuteron);
    expect(fe56).toBeGreaterThan(u238);
  });

  it('dlatego rozszczepienie ciężkich jąder i fuzja lekkich jąder uwalniają energię (B/A rośnie w obu kierunkach ku środkowi)', () => {
    const light = semfBindingPerNucleon(1, 1); // A=2, fuzja startuje stąd
    const mid = semfBindingPerNucleon(26, 30); // A=56
    const heavy = semfBindingPerNucleon(92, 146); // A=238, rozszczepienie startuje stąd
    expect(mid).toBeGreaterThan(light);
    expect(mid).toBeGreaterThan(heavy);
  });

  it('gradient stabilności wskazuje β⁻ dla jąder bogatych w neutrony i β⁺/EC dla bogatych w protony przy tym samym A', () => {
    // A=120: realny stabilny izobar to Sn-120 (Z=50). Sprawdzamy tylko KIERUNEK.
    const protonRich = semfStabilityGradient(65, 55); // Z dużo powyżej 50
    const neutronRich = semfStabilityGradient(35, 85); // Z dużo poniżej 50
    expect(protonRich).toBeLessThan(0); // faworyzuje β⁺/EC (Z maleje)
    expect(neutronRich).toBeGreaterThan(0); // faworyzuje β⁻ (Z rośnie)
  });

  it('gradient stabilności jest bliski zeru blisko realnej doliny stabilności (Sn-120, Z=50)', () => {
    expect(Math.abs(semfStabilityGradient(50, 70))).toBeLessThan(1);
  });
});

describe('KNOWN_NUCLIDES — kluczowe zmierzone izotopy (Mapa nuklidów, NNDC)', () => {
  it('zawiera sensowny, zweryfikowany podzbiór (nie fabrykowaną pełną tablicę)', () => {
    expect(KNOWN_NUCLIDES.length).toBeGreaterThan(40);
    expect(KNOWN_NUCLIDES.length).toBeLessThan(200);
  });

  it('każdy wpis ma poprawne, dodatnie liczby kwantowe i okres półtrwania', () => {
    for (const k of KNOWN_NUCLIDES) {
      expect(k.z).toBeGreaterThanOrEqual(1);
      expect(k.n).toBeGreaterThanOrEqual(0);
      expect(k.halfLifeSec).toBeGreaterThan(0);
      expect(k.symbol.length).toBeGreaterThan(0);
    }
  });

  it('izotopy oznaczone "stabilny" mają nieskończony okres półtrwania i odwrotnie', () => {
    for (const k of KNOWN_NUCLIDES) {
      if (k.decayMode === 'stabilny') expect(k.halfLifeSec).toBe(Infinity);
      else expect(k.halfLifeSec).toBeLessThan(Infinity);
    }
  });

  it('U-238 i C-14 (już używane w podstawowym eksperymencie rozpadu) są też w mapie nuklidów', () => {
    expect(KNOWN_NUCLIDES.find((k) => k.symbol === 'U-238')?.halfLifeLabel).toContain('4,468 mld');
    expect(KNOWN_NUCLIDES.find((k) => k.symbol === 'C-14')?.halfLifeLabel).toContain('5 730');
  });
});

describe('geodezyjna zerowa Schwarzschilda (Einstein Lab, 2D i 3D)', () => {
  it('brak siły w nieskończoności (u=0)', () => {
    expect(schwarzschildGeodesicRHS(0, 1)).toBe(0);
  });

  it('na horyzoncie (u=1/rs) siła jest dodatnia (przyciąga do środka)', () => {
    const rs = 1;
    expect(schwarzschildGeodesicRHS(1 / rs, rs)).toBeGreaterThan(0);
  });

  /**
   * Symuluje ten sam sposób startu co GeodesicSim.spawn() w
   * einstein-geodesics.ts. Krok fizyki celowo -dphi (foton leci w stronę
   * malejącego φ — patrz komentarz przy wywołaniu w einstein-geodesics.ts).
   */
  function simulateCapture(bScale: number, rs = 1): boolean {
    const bc = SCHWARZSCHILD_CRITICAL_IMPACT * rs;
    const b = bc * bScale;
    const r0 = rs * 4000;
    const phi0 = Math.PI - Math.asin(Math.min(1, b / r0));
    let u = Math.sin(phi0) / b;
    let du = Math.cos(phi0) / b;
    const dphi = 0.001;
    for (let i = 0; i < 400000; i++) {
      const next = stepSchwarzschildGeodesic(u, du, -dphi, rs);
      u = next.u;
      du = next.du;
      if (u > 1 / (rs * 1.01)) return true; // pochłonięty
      if (u <= 1 / r0) return false; // uciekł z powrotem do startowej odległości
    }
    throw new Error('symulacja nie rozstrzygnęła się w limicie kroków');
  }

  it('foton z b < b_c zostaje pochłonięty', () => {
    expect(simulateCapture(0.9)).toBe(true);
  });

  it('foton z b > b_c ucieka (tylko ugięty)', () => {
    expect(simulateCapture(1.5)).toBe(false);
  });

  it('im bliżej b_c, tym trudniej rozstrzygnąć — ale 0,999× i 1,001× dają różne wyniki', () => {
    expect(simulateCapture(0.999)).toBe(true);
    expect(simulateCapture(1.001)).toBe(false);
  });
});

describe('geometria 4D — obrót i rzut tesseraktu (Multiverse Lab)', () => {
  it('obrót o 0 radianów to identyczność', () => {
    const v: [number, number, number, number] = [1, 2, 3, 4];
    expect(rotate4D(v, 'xw', 0)).toEqual(v);
  });

  it('obrót o 90° w płaszczyźnie xy: (1,0,0,0) → (0,1,0,0)', () => {
    const [x, y, z, w] = rotate4D([1, 0, 0, 0], 'xy', Math.PI / 2);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(1, 9);
    expect(z).toBeCloseTo(0, 9);
    expect(w).toBeCloseTo(0, 9);
  });

  it('obrót zachowuje długość wektora (przekształcenie ortogonalne)', () => {
    const v: [number, number, number, number] = [1, -2, 0.5, 3];
    const normBefore = Math.hypot(...v);
    for (const plane of ['xy', 'xz', 'xw', 'yz', 'yw', 'zw'] as const) {
      const r = rotate4D(v, plane, 1.234);
      expect(Math.hypot(...r), `płaszczyzna ${plane}`).toBeCloseTo(normBefore, 9);
    }
  });

  it('rzut 4D→3D przy w=0 nie zmienia x,y,z (dzielnik = 1)', () => {
    const [x, y, z] = project4Dto3D([2, -1, 0.5, 0], 3);
    expect(x).toBeCloseTo(2, 9);
    expect(y).toBeCloseTo(-1, 9);
    expect(z).toBeCloseTo(0.5, 9);
  });

  it('rzut oddala punkty z dodatnim w (bliżej widza w 4D → większe na rzucie)', () => {
    const far = project4Dto3D([1, 0, 0, -1], 3);
    const near = project4Dto3D([1, 0, 0, 1], 3);
    expect(Math.abs(near[0])).toBeGreaterThan(Math.abs(far[0]));
  });

  it('tesserakt ma dokładnie 16 wierzchołków, wszystkie współrzędne ±1', () => {
    expect(TESSERACT_VERTICES.length).toBe(16);
    for (const v of TESSERACT_VERTICES) {
      for (const c of v) expect(Math.abs(c)).toBe(1);
    }
    // wszystkie 16 kombinacji unikalne
    const unique = new Set(TESSERACT_VERTICES.map((v) => v.join(',')));
    expect(unique.size).toBe(16);
  });

  it('tesserakt ma dokładnie 32 krawędzie, każdy wierzchołek ma stopień 4', () => {
    expect(TESSERACT_EDGES.length).toBe(32);
    const degree = new Array(16).fill(0);
    for (const [a, b] of TESSERACT_EDGES) {
      degree[a]++;
      degree[b]++;
    }
    for (const d of degree) expect(d).toBe(4);
  });
});

describe('polarność wiązania chemicznego (Chemistry Lab)', () => {
  it('identyczna elektroujemność → Δχ=0, kowalencyjne niespolaryzowane, chmura wyśrodkowana', () => {
    const b = bondPolarity(2.55, 2.55);
    expect(b.deltaChi).toBe(0);
    expect(b.type).toBe('covalent-nonpolar');
    expect(b.skewFraction).toBe(0);
  });

  it('C–H (Δχ≈0,35) klasyfikowane jako kowalencyjne niespolaryzowane — klasyczny przykład z podręczników', () => {
    const b = bondPolarity(2.55, 2.2);
    expect(b.deltaChi).toBeCloseTo(0.35, 5);
    expect(b.type).toBe('covalent-nonpolar');
  });

  it('H–Cl (Δχ≈0,96) klasyfikowane jako kowalencyjne spolaryzowane', () => {
    const b = bondPolarity(2.2, 3.16);
    expect(b.deltaChi).toBeCloseTo(0.96, 5);
    expect(b.type).toBe('covalent-polar');
  });

  it('Na–Cl (Δχ≈2,23) klasyfikowane jako jonowe — podręcznikowy przykład soli kuchennej', () => {
    const b = bondPolarity(0.93, 3.16);
    expect(b.deltaChi).toBeCloseTo(2.23, 5);
    expect(b.type).toBe('ionic');
    // Wzór Hanney–Smitha daje dla NaCl ~71% charakteru jonowego — zgodne z
    // literaturą (cząsteczka w fazie gazowej ma istotny udział kowalencyjny;
    // to sieć krystaliczna ciała stałego jest w pełni jonowa).
    expect(b.skewFraction).toBeGreaterThan(0.65);
    expect(b.skewFraction).toBeLessThan(0.8);
  });

  it('skewFraction rośnie monotonicznie z Δχ i mieści się w [0,1)', () => {
    let prev = -1;
    for (const dchi of [0, 0.2, 0.5, 1, 1.7, 2.5, 3.5]) {
      const b = bondPolarity(1, 1 + dchi);
      expect(b.skewFraction).toBeGreaterThan(prev);
      expect(b.skewFraction).toBeLessThan(1);
      prev = b.skewFraction;
    }
  });

  it('funkcja jest symetryczna względem zamiany A i B (wiązanie nie ma kierunku)', () => {
    const b1 = bondPolarity(0.93, 3.16);
    const b2 = bondPolarity(3.16, 0.93);
    expect(b1.deltaChi).toBe(b2.deltaChi);
    expect(b1.type).toBe(b2.type);
    expect(b1.skewFraction).toBe(b2.skewFraction);
  });
});

describe('krzywa rotacji galaktyki: dysk + halo ciemnej materii + MOND', () => {
  const DISK_MASS = 5e10;
  const SCALE_LENGTH = 3;
  const CORE_RADIUS = 3;

  it('masa dysku wykładniczego rośnie monotonicznie i dąży do masy całkowitej', () => {
    let prev = -1;
    for (const r of [0.5, 1, 3, 6, 12, 25, 60]) {
      const m = exponentialDiskMass(r, DISK_MASS, SCALE_LENGTH);
      expect(m).toBeGreaterThan(prev);
      expect(m).toBeLessThanOrEqual(DISK_MASS);
      prev = m;
    }
    expect(exponentialDiskMass(60, DISK_MASS, SCALE_LENGTH) / DISK_MASS).toBeGreaterThan(0.999);
  });

  it('bez halo (v∞=0) prędkość maleje na dużych promieniach jak w Układzie Słonecznym (Keplerowsko)', () => {
    const mDiskFar = exponentialDiskMass(30, DISK_MASS, SCALE_LENGTH);
    const v20 = circularVelocity(exponentialDiskMass(20, DISK_MASS, SCALE_LENGTH), 20);
    const v30 = circularVelocity(mDiskFar, 30);
    expect(v30).toBeLessThan(v20); // spada, bo M(r) już prawie stałe, a r rośnie
  });

  it('halo pseudo-izotermiczne: M(r)∝r przy r≫rc, więc v(r)→stała (spłaszczenie krzywej)', () => {
    const rho0 = 1e7;
    const v10 = circularVelocity(isothermalHaloMass(10, rho0, CORE_RADIUS), 10);
    const v20 = circularVelocity(isothermalHaloMass(20, rho0, CORE_RADIUS), 20);
    const v40 = circularVelocity(isothermalHaloMass(40, rho0, CORE_RADIUS), 40);
    // przy dużych r/rc krzywa jest niemal płaska — różnica v40 vs v20 dużo mniejsza niż v20 vs v10
    expect(Math.abs(v40 - v20)).toBeLessThan(Math.abs(v20 - v10));
  });

  it('MOND: w reżimie słabego pola g_MOND > g_Newton (silniejsza efektywna grawitacja)', () => {
    const gN = 1; // (km/s)²/kpc, dużo mniejsze niż MOND_A0_ASTRO — reżim głęboki
    const gMond = mondAcceleration(gN, MOND_A0_ASTRO);
    expect(gMond).toBeGreaterThan(gN);
  });

  it('MOND: przy g_N≫a0 (silne pole) g_MOND→g_N (odtwarza Newtona)', () => {
    const gN = MOND_A0_ASTRO * 1e6;
    const gMond = mondAcceleration(gN, MOND_A0_ASTRO);
    expect(gMond / gN).toBeCloseTo(1, 2);
  });

  it('MOND daje asymptotycznie płaską krzywą bez ciemnej materii (relacja Tully’ego–Fishera)', () => {
    const vAt = (r: number) => {
      const mDisk = exponentialDiskMass(r, DISK_MASS, SCALE_LENGTH);
      const gN = (G_ASTRO * mDisk) / (r * r);
      const g = mondAcceleration(gN);
      return Math.sqrt(g * r);
    };
    const v20 = vAt(20);
    const v40 = vAt(40);
    // płaska krzywa: różnica względna mała na dużych promieniach
    expect(Math.abs(v40 - v20) / v20).toBeLessThan(0.05);
    // przewidywana wartość asymptotyczna v∞=(G·M·a0)^¼ — przy r=40 kpc krzywa
    // jest już blisko, ale jeszcze nie dokładnie na granicy (zbieżność wolna)
    const vInfPredicted = Math.pow(G_ASTRO * DISK_MASS * MOND_A0_ASTRO, 0.25);
    expect(Math.abs(v40 - vInfPredicted) / vInfPredicted).toBeLessThan(0.1);
  });
});
