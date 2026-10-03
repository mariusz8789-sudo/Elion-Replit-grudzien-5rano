import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  doubleSlitProbabilityDensity,
  doubleSlitProfile,
  DOUBLE_SLIT_MEASURED_OFFSET_SCALE,
  DOUBLE_SLIT_PHASE_SCALE,
  DOUBLE_SLIT_WAVENUMBER_SCALE,
  DOUBLE_SLIT_WIDTH,
  type DoubleSlitConfig,
} from '../core/physics';
import { canonicalJson, fnv1a } from '../core/events/hash';
import { quantumLab } from '../labs/quantum';

/**
 * DOUBLE-SLIT — model wyodrębniony z renderera do Scientific Core.
 *
 * Najważniejszy test w tym pliku to ten pierwszy: ORACLE. Trzyma dosłowną
 * kopię starej, prywatnej metody `DoubleSlitSim.prob()` i porównuje ją z nową
 * czystą funkcją punkt po punkcie na gęstej siatce parametrów. Ekstrakcja ma
 * przenieść model, nie „poprawić" fizykę — a jedyny sposób, żeby to udowodnić,
 * to policzyć obie wersje i porównać wyniki, nie przeczytać obie i uznać, że
 * wyglądają tak samo.
 *
 * Kopia oracle żyje WYŁĄCZNIE w teście. W kodzie produkcyjnym istnieje jedna
 * implementacja — pilnuje tego osobny test na źródle renderera.
 */

/** Dosłowna kopia `DoubleSlitSim.prob()` sprzed ekstrakcji (LIVE 75e9e6e). */
function legacyProb(u: number, p: { lambda: number; slitDist: number; measured: boolean }): number {
  const lambda = Number(p.lambda);
  const d = Number(p.slitDist);
  const measured = Boolean(p.measured);
  const a = 0.35;
  const k = 5200 / lambda;
  const env = (off: number) => {
    const b = k * a * (u - off);
    const s = b === 0 ? 1 : Math.sin(b) / b;
    return s * s;
  };
  if (measured) {
    const off = d * 0.02;
    return 0.5 * env(-off) + 0.5 * env(off);
  }
  const phase = k * d * 0.06 * u;
  return env(0) * Math.cos(phase) ** 2;
}

const config = (over: Partial<DoubleSlitConfig> = {}): DoubleSlitConfig => ({
  wavelength: 550,
  slitDistance: 10,
  measured: false,
  ...over,
});

/** Zakresy dokładnie takie, jak dopuszcza UI Quantum Lab. */
const WAVELENGTHS = [400, 430, 470, 510, 550, 590, 630, 670, 700];
const SLIT_DISTANCES = [4, 6, 8, 10, 12, 14, 16, 18, 20];

describe('Double-slit — równoważność ze starą metodą renderera', () => {
  it('nowa czysta funkcja daje BIT W BIT ten sam wynik co stara prywatna metoda', () => {
    let compared = 0;
    for (const wavelength of WAVELENGTHS) {
      for (const slitDistance of SLIT_DISTANCES) {
        for (const measured of [false, true]) {
          for (let i = 0; i <= 400; i++) {
            const u = (i / 400) * 2 - 1;
            const legacy = legacyProb(u, { lambda: wavelength, slitDist: slitDistance, measured });
            const extracted = doubleSlitProbabilityDensity(u, { wavelength, slitDistance, measured });
            // Bez tolerancji: ta sama kolejność działań ma dać ten sam double.
            expect(extracted).toBe(legacy);
            compared++;
          }
        }
      }
    }
    expect(compared).toBe(WAVELENGTHS.length * SLIT_DISTANCES.length * 2 * 401);
  });

  it('zgadza się także w punkcie osobliwym sinc, gdzie b = 0', () => {
    // u = 0 przy niezmierzonej drodze trafia dokładnie w gałąź b === 0.
    expect(doubleSlitProbabilityDensity(0, config())).toBe(legacyProb(0, { lambda: 550, slitDist: 10, measured: false }));
    expect(doubleSlitProbabilityDensity(0, config())).toBe(1);
  });

  it('stałe modelu odpowiadają wartościom sprzed ekstrakcji', () => {
    expect(DOUBLE_SLIT_WIDTH).toBe(0.35);
    expect(DOUBLE_SLIT_WAVENUMBER_SCALE).toBe(5200);
    expect(DOUBLE_SLIT_MEASURED_OFFSET_SCALE).toBe(0.02);
    expect(DOUBLE_SLIT_PHASE_SCALE).toBe(0.06);
  });
});

describe('Double-slit — czystość i determinizm', () => {
  it('ta sama konfiguracja daje identyczny wynik przy powtórzeniu', () => {
    const first = doubleSlitProfile(config(), 257);
    const second = doubleSlitProfile(config(), 257);

    expect(second).toEqual(first);
    expect(fnv1a(canonicalJson(second))).toBe(fnv1a(canonicalJson(first)));
  });

  it('wynik nie zależy od kolejności wywołań ani od poprzednich konfiguracji', () => {
    const reference = doubleSlitProfile(config(), 129);

    doubleSlitProfile(config({ wavelength: 700, slitDistance: 20, measured: true }), 129);
    doubleSlitProfile(config({ wavelength: 400 }), 33);

    expect(doubleSlitProfile(config(), 129)).toEqual(reference);
  });

  it('każda wartość jest skończona i mieści się w [0, 1]', () => {
    for (const wavelength of WAVELENGTHS) {
      for (const slitDistance of SLIT_DISTANCES) {
        for (const measured of [false, true]) {
          for (const value of doubleSlitProfile({ wavelength, slitDistance, measured }, 201)) {
            expect(Number.isFinite(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            // Renderer używa tej wartości jako prawdopodobieństwa akceptacji
            // w losowaniu odrzucającym — wynik > 1 cicho zniekształciłby rozkład.
            expect(value).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('profil jest symetryczny względem środka ekranu', () => {
    for (const measured of [false, true]) {
      const profile = doubleSlitProfile(config({ measured }), 201);
      for (let i = 0; i < profile.length; i++) {
        expect(profile[i]).toBeCloseTo(profile[profile.length - 1 - i], 12);
      }
    }
  });

  it('odrzuca bezsensowną liczbę próbek zamiast zwracać pustą tablicę', () => {
    expect(() => doubleSlitProfile(config(), 1)).toThrow();
    expect(() => doubleSlitProfile(config(), 2.5)).toThrow();
  });
});

describe('Double-slit — zależność od parametrów', () => {
  it('zmiana długości fali zmienia rozkład', () => {
    expect(doubleSlitProfile(config({ wavelength: 400 }), 129))
      .not.toEqual(doubleSlitProfile(config({ wavelength: 700 }), 129));
  });

  it('zmiana rozstawu szczelin zmienia rozkład', () => {
    expect(doubleSlitProfile(config({ slitDistance: 4 }), 129))
      .not.toEqual(doubleSlitProfile(config({ slitDistance: 20 }), 129));
  });

  it('gęstsze prążki przy większym rozstawie szczelin — Δy ∝ λ/d', () => {
    // Liczba maksimów lokalnych rośnie, gdy rośnie d: to jest ta sama
    // zależność, którą opisuje narracja laboratorium.
    const maxima = (slitDistance: number) => {
      const profile = doubleSlitProfile(config({ slitDistance }), 2001);
      let count = 0;
      for (let i = 1; i < profile.length - 1; i++) {
        if (profile[i] > profile[i - 1] && profile[i] > profile[i + 1]) count++;
      }
      return count;
    };

    expect(maxima(20)).toBeGreaterThan(maxima(4));
  });
});

describe('Double-slit — superpozycja a pomiar drogi', () => {
  it('pomiar drogi daje INNY rozkład niż jego brak', () => {
    const superposed = doubleSlitProfile(config({ measured: false }), 401);
    const measured = doubleSlitProfile(config({ measured: true }), 401);

    expect(measured).not.toEqual(superposed);
  });

  it('bez pomiaru rozkład ma zera interferencyjne; z pomiarem znikają', () => {
    const superposed = doubleSlitProfile(config({ measured: false }), 2001);
    const measured = doubleSlitProfile(config({ measured: true }), 2001);

    // Pierwsze zero interferencyjne leży przy u ≈ 0,277 (cos² = 0 gdy
    // k·d·0,06·u = π/2), więc okno musi je obejmować — stąd u ∈ [−0,4; 0,4].
    // Obwiednia sinc² jest tam nadal wyraźnie niezerowa, więc zero pochodzi od
    // interferencji, a nie od wygaszenia obwiedni.
    const centre = (values: number[]) => values.slice(Math.floor(values.length * 0.3), Math.ceil(values.length * 0.7));

    expect(Math.min(...centre(superposed))).toBeLessThan(1e-6);
    expect(Math.min(...centre(measured))).toBeGreaterThan(0.5);
  });

  it('z pomiarem rozkład jest sumą dwóch przesuniętych obwiedni — brak członu cos²', () => {
    const slitDistance = 10;
    const offset = slitDistance * DOUBLE_SLIT_MEASURED_OFFSET_SCALE;
    const k = DOUBLE_SLIT_WAVENUMBER_SCALE / 550;
    const envelope = (u: number, off: number) => {
      const b = k * DOUBLE_SLIT_WIDTH * (u - off);
      const s = b === 0 ? 1 : Math.sin(b) / b;
      return s * s;
    };

    for (const u of [-0.5, -0.1, 0, 0.1, 0.5]) {
      expect(doubleSlitProbabilityDensity(u, config({ measured: true, slitDistance })))
        .toBeCloseTo(0.5 * envelope(u, -offset) + 0.5 * envelope(u, offset), 15);
    }
  });
});

describe('Double-slit — odciskalność i zdatność do capture/replay', () => {
  it('ten sam model daje ten sam odcisk, zmieniony parametr daje inny', () => {
    const fingerprint = (c: DoubleSlitConfig) => fnv1a(canonicalJson({ config: c, profile: doubleSlitProfile(c, 257) }));

    expect(fingerprint(config())).toBe(fingerprint(config()));
    expect(fingerprint(config({ measured: true }))).not.toBe(fingerprint(config()));
    expect(fingerprint(config({ wavelength: 700 }))).not.toBe(fingerprint(config()));
    expect(fingerprint(config({ slitDistance: 4 }))).not.toBe(fingerprint(config()));
  });

  it('odcisk jest stabilny między niezależnymi wywołaniami — nie ma stanu ukrytego', () => {
    const a = fnv1a(canonicalJson(doubleSlitProfile(config({ measured: true }), 101)));
    doubleSlitProfile(config({ wavelength: 400, slitDistance: 4, measured: false }), 999);
    const b = fnv1a(canonicalJson(doubleSlitProfile(config({ measured: true }), 101)));

    expect(b).toBe(a);
  });
});

describe('Double-slit — jedna implementacja, renderer tylko ją wywołuje', () => {
  const source = readFileSync(fileURLToPath(new URL('../labs/quantum.ts', import.meta.url)), 'utf8');

  it('renderer importuje model ze Scientific Core', () => {
    expect(source).toContain("from '../core/physics'");
    expect(source).toContain('doubleSlitProbabilityDensity');
  });

  it('renderer nie zawiera już własnej kopii wzoru', () => {
    // Stałe modelu i kształt sinc² nie mogą wrócić do warstwy rysującej —
    // dwie kopie wzoru to dwa modele, które kiedyś się rozjadą.
    expect(source).not.toContain('5200 /');
    expect(source).not.toMatch(/Math\.sin\(b\)\s*\/\s*b/);
    expect(source).not.toMatch(/private\s+prob\s*\(/);
  });

  it('Quantum Lab dalej wystawia te same parametry i domyślne wartości', () => {
    const byKey = Object.fromEntries(quantumLab.params.map((p) => [p.key, p]));

    expect(byKey.lambda.default).toBe(550);
    expect(byKey.slitDist.default).toBe(10);
    expect(byKey.measured.default).toBe(false);
    expect(quantumLab.honesty).toBe('exact');
    expect(quantumLab.experiments).toHaveLength(6);
  });

  it('sim laboratorium dalej się tworzy i liczy trafienia bez DOM', () => {
    expect(quantumLab.createSim).toBeDefined();
    const sim = quantumLab.createSim!();
    sim.init(800, 600);
    const params = { lambda: 550, slitDist: 10, measured: false, rate: 60 };

    for (let i = 0; i < 120; i++) sim.update(1 / 60, params as never);

    expect(Number(sim.getStats?.().count)).toBeGreaterThan(0);
  });
});
