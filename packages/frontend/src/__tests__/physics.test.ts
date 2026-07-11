import { describe, expect, it } from 'vitest';
import {
  binarySeparationMeters,
  bondPolarity,
  chirpFrequency,
  chirpMassSolar,
  chshS,
  circularVelocity,
  decayRemaining,
  dnaMeltingTempWallace,
  equivalenceVolumeMl,
  exponentialDiskMass,
  G_ASTRO,
  G_ASTRO_YEAR,
  EARTH_MASSES_PER_SOLAR,
  orbitalElementsFromState,
  visVivaSpeed,
  gaussianPdf,
  iscoFrequency,
  isothermalHaloMass,
  kardashevPower,
  keplerPosition,
  kerrCriticalImpactParameter,
  kerrEquatorialF,
  kerrErgosphereEquatorRadius,
  kerrHorizonRadius,
  kerrPhotonOrbitRadius,
  lorenzChaosThreshold,
  lorenzDerivative,
  type LorenzState,
  lensAmplification,
  lensImagePositions,
  lorentzGamma,
  lorentzTime,
  measurementTensionSigma,
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
  stepKerrEquatorialGeodesic,
  stepLorenzRK4,
  stepSchwarzschildGeodesic,
  TESSERACT_EDGES,
  TESSERACT_VERTICES,
  timeToMerger,
  titrationPH,
} from '../core/physics';
import { PLANETS } from '../data/solarSystem';
import { MOONS } from '../data/moons';
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

describe('geodezyjna równikowa Kerra (Einstein Lab 3D — wirująca czarna dziura)', () => {
  const M = 1;

  it('przy spinie a=0 daje DOKŁADNIE ten sam tor co geodezyjna Schwarzschilda (ten sam wzór, inna parametryzacja)', () => {
    const b = 6;
    let uK = 0.001;
    let duK = 0.02 * 0.001;
    let uS = 0.001;
    let duS = 0.02 * 0.001;
    const dphi = 0.001;
    let maxDiff = 0;
    for (let i = 0; i < 3000; i++) {
      const rK = stepKerrEquatorialGeodesic(uK, duK, dphi, 0, b, M);
      const rS = stepSchwarzschildGeodesic(uS, duS, dphi, 2 * M);
      uK = rK.u;
      duK = rK.du;
      uS = rS.u;
      duS = rS.du;
      maxDiff = Math.max(maxDiff, Math.abs(uK - uS), Math.abs(duK - duS));
    }
    expect(maxDiff).toBeLessThan(1e-6);
  });

  it('przy a=0 promień sferycznej orbity fotonowej wynosi dokładnie 3M dla obu kierunków (granica Schwarzschilda)', () => {
    expect(kerrPhotonOrbitRadius(0, M, 1)).toBeCloseTo(3 * M, 9);
    expect(kerrPhotonOrbitRadius(0, M, -1)).toBeCloseTo(3 * M, 9);
  });

  it('przy a=0 krytyczny parametr zderzenia wynosi dokładnie 3√3·M (granica Schwarzschilda)', () => {
    expect(kerrCriticalImpactParameter(0, M, 1)).toBeCloseTo(3 * Math.sqrt(3) * M, 9);
    expect(kerrCriticalImpactParameter(0, M, -1)).toBeCloseTo(-3 * Math.sqrt(3) * M, 9);
  });

  it('przy ekstremalnym spinie (a→M) orbita prograde → r=M, orbita retrograde → r=4M (znany wynik dla ekstremalnej Kerra)', () => {
    const a = 0.999999 * M;
    expect(kerrPhotonOrbitRadius(a, M, 1)).toBeCloseTo(M, 2);
    expect(kerrPhotonOrbitRadius(a, M, -1)).toBeCloseTo(4 * M, 3);
  });

  it('promień horyzontu r+ = M+√(M²−a²) maleje ze spinem i osiąga M przy ekstremalnym a=M', () => {
    expect(kerrHorizonRadius(0, M)).toBeCloseTo(2 * M, 9);
    expect(kerrHorizonRadius(0.6 * M, M)).toBeLessThan(2 * M);
    expect(kerrHorizonRadius(0.999999 * M, M)).toBeCloseTo(M, 2);
  });

  it('ergosfera na równiku ma promień dokładnie 2M, niezależnie od spinu (definicja r_ergo(π/2)=2M)', () => {
    expect(kerrErgosphereEquatorRadius(M)).toBeCloseTo(2 * M, 9);
    expect(kerrErgosphereEquatorRadius(5)).toBeCloseTo(10, 9);
  });

  it('efekt wleczenia układów inercjalnych: przy dużym spinie orbita prograde jest bliżej horyzontu niż retrograde', () => {
    const a = 0.9 * M;
    const rPro = kerrPhotonOrbitRadius(a, M, 1);
    const rRetro = kerrPhotonOrbitRadius(a, M, -1);
    expect(rPro).toBeLessThan(rRetro);
    expect(rPro).toBeGreaterThan(kerrHorizonRadius(a, M));
  });

  /** Ten sam schemat startu co simulateCapture() dla Schwarzschilda wyżej, uogólniony na Kerra. */
  function simulateKerrCapture(bSigned: number, a: number, mass = M): boolean {
    const r0 = mass * 4000;
    const phi0 = Math.PI - Math.asin(Math.min(1, Math.abs(bSigned) / r0));
    let u = Math.sin(phi0) / Math.abs(bSigned);
    let du = Math.cos(phi0) / Math.abs(bSigned);
    const dphi = 0.001;
    const rPlus = kerrHorizonRadius(a, mass);
    for (let i = 0; i < 400000; i++) {
      const next = stepKerrEquatorialGeodesic(u, du, -dphi, a, bSigned, mass);
      u = next.u;
      du = next.du;
      if (u <= 0) return false;
      const r = 1 / u;
      if (r <= rPlus * 1.002) return true;
      if (r > r0) return false;
    }
    throw new Error('symulacja nie rozstrzygnęła się w limicie kroków');
  }

  it('foton prograde z |b| poniżej krytycznego zostaje pochłonięty, powyżej ucieka', () => {
    const a = 0.9 * M;
    const bc = kerrCriticalImpactParameter(a, M, 1);
    expect(simulateKerrCapture(bc * 0.8, a)).toBe(true);
    expect(simulateKerrCapture(bc * 1.3, a)).toBe(false);
  });

  it('foton retrograde z |b| poniżej krytycznego zostaje pochłonięty, powyżej ucieka (b ujemne)', () => {
    const a = 0.9 * M;
    const bc = kerrCriticalImpactParameter(a, M, -1);
    expect(simulateKerrCapture(bc * 0.8, a)).toBe(true);
    expect(simulateKerrCapture(bc * 1.3, a)).toBe(false);
  });

  it('kerrEquatorialF jest zawsze nieujemna (to kwadrat du/dφ z konstrukcji)', () => {
    for (const a of [0, 0.3, 0.7, 0.9]) {
      for (const u of [0.01, 0.05, 0.1, 0.2]) {
        expect(kerrEquatorialF(u, a, 6, M)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('atraktor Lorenza (Lorenz 1963, Universe Lab)', () => {
  const SIGMA = 10;
  const BETA = 8 / 3;

  it('próg chaosu ρ_h dla klasycznych σ=10, β=8/3 wynosi dokładnie σ(σ+β+3)/(σ−β−1) ≈ 24,74', () => {
    expect(lorenzChaosThreshold(SIGMA, BETA)).toBeCloseTo(24.7368421, 6);
  });

  it('symetria równań: f(−x,−y,z) = (−f_x, −f_y, f_z) — jeśli (x,y,z) jest rozwiązaniem, (−x,−y,z) też jest', () => {
    const s = { x: 3.2, y: -1.7, z: 15.4 };
    const f1 = lorenzDerivative(s, SIGMA, 28, BETA);
    const f2 = lorenzDerivative({ x: -s.x, y: -s.y, z: s.z }, SIGMA, 28, BETA);
    expect(f2.x).toBeCloseTo(-f1.x, 9);
    expect(f2.y).toBeCloseTo(-f1.y, 9);
    expect(f2.z).toBeCloseTo(f1.z, 9);
  });

  it('poniżej progu chaosu (ρ mały) trajektoria zbiega do początku układu (jedyny stabilny punkt stały dla ρ<1)', () => {
    let s = { x: 5, y: 5, z: 5 };
    const dt = 0.005;
    for (let i = 0; i < 20000; i++) s = stepLorenzRK4(s, dt, SIGMA, 0.5, BETA);
    const norm = Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
    expect(norm).toBeLessThan(0.01);
  });

  it('w reżimie chaotycznym (ρ=28, klasyczny Lorenz) trajektoria pozostaje ograniczona (atraktor, nie ucieczka do nieskończoności)', () => {
    let s = { x: 1, y: 1, z: 1 };
    const dt = 0.005;
    let maxNorm = 0;
    for (let i = 0; i < 40000; i++) {
      s = stepLorenzRK4(s, dt, SIGMA, 28, BETA);
      maxNorm = Math.max(maxNorm, Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z));
    }
    expect(maxNorm).toBeLessThan(100); // znany atraktor mieści się dobrze poniżej tej granicy
    expect(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z)).toBe(true);
  });

  it('efekt motyla: dwie trajektorie startujące 1e-6 od siebie przy ρ=28 rozjeżdżają się wykładniczo (czułość na warunki początkowe)', () => {
    const dt = 0.005;
    let a = { x: 1, y: 1, z: 1 };
    let b = { x: 1 + 1e-6, y: 1, z: 1 };
    const dist = (p: LorenzState, q: LorenzState) =>
      Math.sqrt((p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2);
    const d0 = dist(a, b);
    for (let i = 0; i < 4000; i++) {
      a = stepLorenzRK4(a, dt, SIGMA, 28, BETA);
      b = stepLorenzRK4(b, dt, SIGMA, 28, BETA);
    }
    const d1 = dist(a, b);
    expect(d1).toBeGreaterThan(d0 * 100);
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

describe('chirp fali grawitacyjnej (inspiral podwójnego układu zwartego)', () => {
  it('masa ćwierkowa dla równych mas: ℳ = m/2^0.2 (relacja dokładna)', () => {
    const m = 30;
    const expected = m / Math.pow(2, 0.2);
    expect(chirpMassSolar(m, m)).toBeCloseTo(expected, 6);
  });

  it('masa ćwierkowa jest symetryczna i mniejsza niż masa całkowita', () => {
    expect(chirpMassSolar(36, 29)).toBeCloseTo(chirpMassSolar(29, 36), 6);
    expect(chirpMassSolar(36, 29)).toBeLessThan(36 + 29);
  });

  it('masa ćwierkowa GW150914-podobnego układu (36+29 M☉) mieści się w oczekiwanym rzędzie wielkości (~28 M☉)', () => {
    const mc = chirpMassSolar(36, 29);
    expect(mc).toBeGreaterThan(25);
    expect(mc).toBeLessThan(31);
  });

  it('chirpFrequency i timeToMerger są wzajemnie odwrotne', () => {
    const mc = chirpMassSolar(36, 29);
    for (const f of [20, 50, 100]) {
      const tau = timeToMerger(mc, f);
      const fBack = chirpFrequency(mc, tau);
      expect(fBack).toBeCloseTo(f, 3);
    }
  });

  it('częstotliwość rośnie w miarę zbliżania się do połączenia (τ maleje)', () => {
    const mc = chirpMassSolar(36, 29);
    let prev = 0;
    for (const tau of [1, 0.5, 0.2, 0.05, 0.01]) {
      const f = chirpFrequency(mc, tau);
      expect(f).toBeGreaterThan(prev);
      prev = f;
    }
  });

  it('separacja orbitalna przy częstotliwości ISCO równa się dokładnie 6GM/c² (promień ISCO Schwarzschilda)', () => {
    const totalMass = 65; // M☉, GW150914-podobny
    const fIsco = iscoFrequency(totalMass);
    const sepAtIsco = binarySeparationMeters(totalMass, fIsco);
    const G_SI = 6.674e-11;
    const C_SI = 2.998e8;
    const M_SUN_KG = 1.989e30;
    const rIsco = (6 * G_SI * totalMass * M_SUN_KG) / (C_SI * C_SI);
    expect(sepAtIsco / rIsco).toBeCloseTo(1, 2);
  });

  it('separacja orbitalna maleje w miarę rosnącej częstotliwości (inspiral)', () => {
    const totalMass = 65;
    const sep20 = binarySeparationMeters(totalMass, 20);
    const sepIsco = binarySeparationMeters(totalMass, iscoFrequency(totalMass));
    expect(sepIsco).toBeLessThan(sep20);
  });

  it('cięższy układ ma niższą częstotliwość ISCO (większe czarne dziury = niższa częstotliwość połączenia)', () => {
    expect(iscoFrequency(120)).toBeLessThan(iscoFrequency(20));
  });
});

describe('miareczkowanie kwasowo-zasadowe (bilans ładunku)', () => {
  const KA_ACETIC = 1.8e-5;

  it('objętość równoważnikowa: C_a·V_a = C_b·V_eq', () => {
    expect(equivalenceVolumeMl(0.1, 25, 0.1)).toBeCloseTo(25, 9);
    expect(equivalenceVolumeMl(0.2, 25, 0.1)).toBeCloseTo(50, 9);
  });

  it('w punkcie półrównoważnikowym pH = pKa (dokładnie, z dokładnością do autodysocjacji wody)', () => {
    const pKa = -Math.log10(KA_ACETIC);
    const ph = titrationPH(0.1, 25, 0.1, 12.5, KA_ACETIC);
    expect(ph).toBeCloseTo(pKa, 2);
  });

  it('pH rośnie monotonicznie w miarę dodawania zasady', () => {
    let prev = -1;
    for (const vb of [0.001, 5, 12.5, 20, 24, 25, 26, 30, 40, 60]) {
      const ph = titrationPH(0.1, 25, 0.1, vb, KA_ACETIC);
      expect(ph).toBeGreaterThan(prev);
      prev = ph;
    }
  });

  it('punkt równoważnikowy słabego kwasu jest ZASADOWY (pH>7), nie obojętny', () => {
    const veq = equivalenceVolumeMl(0.1, 25, 0.1);
    const ph = titrationPH(0.1, 25, 0.1, veq, KA_ACETIC);
    expect(ph).toBeGreaterThan(7);
  });

  it('słabszy kwas (mniejsze Ka) ma BARDZIEJ zasadowy punkt równoważnikowy (mocniejsza sprzężona zasada)', () => {
    const veq = 25;
    const phAcetic = titrationPH(0.1, 25, 0.1, veq, 1.8e-5); // kwas octowy
    const phHcn = titrationPH(0.1, 25, 0.1, veq, 6.2e-10); // kwas cyjanowodorowy, dużo słabszy
    expect(phHcn).toBeGreaterThan(phAcetic);
  });

  it('na starcie (czysty słaby kwas) pH jest bliskie klasycznemu przybliżeniu pH≈½(pKa−log₁₀Ca)', () => {
    const pKa = -Math.log10(KA_ACETIC);
    const approx = 0.5 * (pKa - Math.log10(0.1));
    const exact = titrationPH(0.1, 25, 0.1, 1e-6, KA_ACETIC);
    expect(Math.abs(exact - approx)).toBeLessThan(0.05);
  });
});

describe('napięcie Hubble\'a (porównanie niezależnych pomiarów)', () => {
  it('gaussianPdf osiąga maksimum dokładnie w x=mean', () => {
    const mean = 70;
    const sigma = 2;
    const atMean = gaussianPdf(mean, mean, sigma);
    const nearby = gaussianPdf(mean + 0.5, mean, sigma);
    expect(atMean).toBeGreaterThan(nearby);
    expect(gaussianPdf(mean - 0.5, mean, sigma)).toBeCloseTo(nearby, 9); // symetria
  });

  it('gaussianPdf całkuje się (numerycznie) do ~1 na szerokim zakresie', () => {
    const mean = 0;
    const sigma = 1;
    let sum = 0;
    const dx = 0.01;
    for (let x = -8; x <= 8; x += dx) sum += gaussianPdf(x, mean, sigma) * dx;
    expect(sum).toBeCloseTo(1, 2);
  });

  it('measurementTensionSigma jest zerowe dla identycznych pomiarów', () => {
    expect(measurementTensionSigma(70, 1, 70, 1)).toBe(0);
  });

  it('measurementTensionSigma odtwarza publikowaną wartość ~5σ dla SH0ES vs Planck (Riess 2022 / Planck 2020)', () => {
    const tension = measurementTensionSigma(73.04, 1.04, 67.4, 0.5);
    expect(tension).toBeGreaterThan(4);
    expect(tension).toBeLessThan(5.5);
  });

  it('dodanie systematyki do jednej niepewności ZMNIEJSZA napięcie (nigdy nie zwiększa)', () => {
    const base = measurementTensionSigma(73.04, 1.04, 67.4, 0.5);
    const withExtra = measurementTensionSigma(73.04, 1.04, 67.4, 0.5 + 2);
    expect(withExtra).toBeLessThan(base);
  });

  it('measurementTensionSigma jest symetryczne względem zamiany pomiarów', () => {
    const a = measurementTensionSigma(73, 1, 67, 0.5);
    const b = measurementTensionSigma(67, 0.5, 73, 1);
    expect(a).toBeCloseTo(b, 9);
  });
});

describe('jednostki wygodne mechaniki nieba (AU, rok, masa Słońca) — Stabilność planetarna, Universe Lab', () => {
  it('G_ASTRO_YEAR = 4π² dokładnie (konsekwencja III prawa Keplera dla Ziemi: a=1 AU, T=1 rok)', () => {
    expect(G_ASTRO_YEAR).toBeCloseTo(39.4784176, 6);
  });

  it('EARTH_MASSES_PER_SOLAR odpowiada znanemu stosunkowi mas (IAU) ~332 946', () => {
    expect(EARTH_MASSES_PER_SOLAR).toBeCloseTo(332946, 0);
  });

  it('visVivaSpeed na orbicie kołowej (r=a) daje dokładnie v=√(μ/a)', () => {
    const mu = G_ASTRO_YEAR;
    const a = 1;
    expect(visVivaSpeed(mu, a, a)).toBeCloseTo(Math.sqrt(mu / a), 9);
  });

  it('okres orbity kołowej a=1 AU wokół 1 M_słońca wynosi dokładnie 1 rok (T=2πa/v)', () => {
    const mu = G_ASTRO_YEAR;
    const a = 1;
    const v = visVivaSpeed(mu, a, a);
    const period = (2 * Math.PI * a) / v;
    expect(period).toBeCloseTo(1, 9);
  });

  it('orbitalElementsFromState odzyskuje DOKŁADNIE (a,e) ze stanu (x,y,vx,vy) startu w peryhelium (odwracalność)', () => {
    const mu = G_ASTRO_YEAR;
    const a = 5.203; // Jowisz
    const e = 0.0489;
    const rPeri = a * (1 - e);
    const vPeri = visVivaSpeed(mu, rPeri, a);
    const angle = 1.1; // dowolny obrót — elementy orbitalne nie zależą od orientacji
    const x = rPeri * Math.cos(angle);
    const y = rPeri * Math.sin(angle);
    const vx = -vPeri * Math.sin(angle);
    const vy = vPeri * Math.cos(angle);
    const el = orbitalElementsFromState(x, y, vx, vy, mu);
    expect(el.semiMajorAxisAu).toBeCloseTo(a, 9);
    expect(el.eccentricity).toBeCloseTo(e, 9);
  });

  it('orbitalElementsFromState dla orbity kołowej daje e=0 dokładnie', () => {
    const mu = G_ASTRO_YEAR;
    const a = 2.5;
    const v = visVivaSpeed(mu, a, a);
    const el = orbitalElementsFromState(a, 0, 0, v, mu);
    expect(el.eccentricity).toBeCloseTo(0, 9);
    expect(el.semiMajorAxisAu).toBeCloseTo(a, 9);
  });
});

describe('reguła Wallace\'a — temperatura topnienia DNA (Biology Lab)', () => {
  it('liczy dokładnie 2°C na parę A/T i 4°C na parę G/C', () => {
    expect(dnaMeltingTempWallace('ATGC')).toBe(12);
    expect(dnaMeltingTempWallace('AAAA')).toBe(8);
    expect(dnaMeltingTempWallace('GCGC')).toBe(16);
    expect(dnaMeltingTempWallace('')).toBe(0);
  });

  it('jest niewrażliwa na wielkość liter', () => {
    expect(dnaMeltingTempWallace('atgc')).toBe(dnaMeltingTempWallace('ATGC'));
  });

  it('sekwencja bogata w G/C ma wyższą Tm niż ta sama długość bogata w A/T (silniejsze parowanie G≡C, 3 wiązania wodorowe vs 2)', () => {
    const gcRich = dnaMeltingTempWallace('GCGCGCGC');
    const atRich = dnaMeltingTempWallace('ATATATAT');
    expect(gcRich).toBeGreaterThan(atRich);
  });
});

describe('nachylenie osi obrotu i pierścienie planet (Universe Lab 3D — przybliżenie kamery)', () => {
  it('każda planeta ma nachylenie osi w prawidłowym zakresie [0°,180°]', () => {
    for (const p of PLANETS) {
      expect(p.axialTiltDeg).toBeGreaterThanOrEqual(0);
      expect(p.axialTiltDeg).toBeLessThanOrEqual(180);
    }
  });

  it('Uran ma ekstremalne nachylenie osi (>90°, "toczy się na boku") — realny, znany fakt NASA', () => {
    const uranus = PLANETS.find((p) => p.id === 'uranus');
    expect(uranus?.axialTiltDeg).toBeGreaterThan(90);
  });

  it('Wenus ma nachylenie >90° — kodowanie prawdziwej retrogradacji, nie błąd danych', () => {
    const venus = PLANETS.find((p) => p.id === 'venus');
    expect(venus?.axialTiltDeg).toBeGreaterThan(90);
  });

  it('tylko Saturn i Uran mają zdefiniowany pierścień, oba z dodatnim, uporządkowanym zasięgiem', () => {
    for (const p of PLANETS) {
      if (!p.ring) continue;
      expect(['saturn', 'uranus']).toContain(p.id);
      expect(p.ring.outerFactor).toBeGreaterThan(p.ring.innerFactor);
      expect(p.ring.innerFactor).toBeGreaterThan(1); // pierścień zaczyna się POZA powierzchnią planety
      expect(p.ring.opacity).toBeGreaterThan(0);
      expect(p.ring.opacity).toBeLessThanOrEqual(1);
    }
  });
});

describe('MOONS — dane księżyców (Universe Lab 3D, widoczne po przybliżeniu kamery)', () => {
  it('każdy księżyc wskazuje istniejącą planetę', () => {
    for (const m of MOONS) {
      expect(PLANETS.find((p) => p.id === m.parentId), `księżyc "${m.id}" → nieznana planeta "${m.parentId}"`).toBeDefined();
    }
  });

  it('każdy księżyc ma dodatnią odległość, okres i promień', () => {
    for (const m of MOONS) {
      expect(m.distanceKm).toBeGreaterThan(0);
      expect(m.periodDays).toBeGreaterThan(0);
      expect(m.radiusKm).toBeGreaterThan(0);
    }
  });

  it('księżyce galileuszowe Jowisza są uporządkowane rosnąco wg prawdziwej odległości (Io < Europa < Ganimedes < Callisto)', () => {
    const jupiterMoons = MOONS.filter((m) => m.parentId === 'jupiter');
    const order = ['io', 'europa', 'ganymede', 'callisto'];
    const sorted = [...jupiterMoons].sort((a, b) => a.distanceKm - b.distanceKm).map((m) => m.id);
    expect(sorted).toEqual(order);
  });

  it('Io (najbliższy księżyc galileuszowy) ma najkrótszy okres orbitalny — zgodne z trzecim prawem Keplera', () => {
    const jupiterMoons = MOONS.filter((m) => m.parentId === 'jupiter');
    const io = jupiterMoons.find((m) => m.id === 'io')!;
    for (const m of jupiterMoons) {
      if (m.id === 'io') continue;
      expect(io.periodDays).toBeLessThan(m.periodDays);
    }
  });
});
