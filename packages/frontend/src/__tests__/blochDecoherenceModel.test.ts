import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  applyCircuit,
  blochVector,
  collapseByMeasurement,
  probabilityOfZero,
  stepBlochVectorLength,
  BLOCH_DECOHERENCE_RATE_PER_SECOND,
  BLOCH_MIN_VECTOR_LENGTH,
  BLOCH_RECOHERENCE_RATE_PER_SECOND,
  type C,
} from '../labs/experiments/quantum-bloch';
import { canonicalJson, fnv1a } from '../core/events/hash';

/**
 * BLOCH — dekoherencja i pomiar rzutowy, wyodrębnione z renderera 3D.
 *
 * Renderer trzymał trzy kawałki modelu: ewolucję długości wektora Blocha
 * (prywatne pole `shrink`, pokazywane użytkownikowi jako |r⃗|), regułę pomiaru
 * rzutowego i regułę Borna w getStats(). Żadnego z nich nie dało się
 * przetestować ani odtworzyć, bo żyły w klasie Sim3D zależnej od Three.js.
 *
 * TOLERANCJA: zero. Ekstrakcja zachowuje tę samą kolejność działań
 * zmiennoprzecinkowych, więc oracle i nowa funkcja muszą dać identyczne
 * wartości `double` — porównanie idzie przez `toBe`, nie `toBeCloseTo`.
 * Tolerancja jest ustalona TU, przed napisaniem asercji, i nie została
 * dobrana po zobaczeniu wyniku.
 */

/** Dosłowna kopia pętli dekoherencji z update() sprzed ekstrakcji (LIVE 7664a63). */
function legacyShrinkStep(shrink: number, dt: number, decoherence: boolean): number {
  if (decoherence) return Math.max(0.02, shrink - dt * 0.12);
  if (shrink < 1) return Math.min(1, shrink + dt * 0.3);
  return shrink;
}

/** Dosłowna kopia gałęzi pomiaru z apply('M') sprzed ekstrakcji. */
function legacyMeasure(a: C, _b: C, draw: number): { a: C; b: C; measured: string } {
  const p0 = a[0] ** 2 + a[1] ** 2;
  const zero = draw < p0;
  return {
    a: zero ? [1, 0] : [0, 0],
    b: zero ? [0, 0] : [1, 0],
    measured: zero ? '|0⟩' : '|1⟩',
  };
}

const ZERO: [C, C] = [[1, 0], [0, 0]];

describe('Bloch — dekoherencja, równoważność ze starą pętlą renderera', () => {
  it('daje bit w bit ten sam wynik co pętla sprzed ekstrakcji', () => {
    let compared = 0;
    // dt obejmuje realne klatki (~16 ms), duże przeskoki po throttlingu karty
    // i wartość zerową, którą update() dostaje przy zatrzymanej symulacji.
    for (const dt of [0, 1 / 240, 1 / 120, 1 / 60, 1 / 30, 0.1, 0.25, 0.5, 1, 2.5]) {
      for (const decohering of [false, true]) {
        for (let i = 0; i <= 100; i++) {
          const shrink = i / 100;
          expect(stepBlochVectorLength(shrink, dt, decohering)).toBe(legacyShrinkStep(shrink, dt, decohering));
          compared++;
        }
      }
    }
    expect(compared).toBe(10 * 2 * 101);
  });

  it('stałe tempa odpowiadają wartościom sprzed ekstrakcji', () => {
    expect(BLOCH_DECOHERENCE_RATE_PER_SECOND).toBe(0.12);
    expect(BLOCH_RECOHERENCE_RATE_PER_SECOND).toBe(0.3);
    expect(BLOCH_MIN_VECTOR_LENGTH).toBe(0.02);
  });

  it('stan czysty bez sprzężenia z otoczeniem nie drgnie', () => {
    // Ta gałąź w oryginale była osobnym `else if (shrink < 1)`; brak zmiany
    // przy |r⃗| = 1 jest zachowaniem, nie przypadkiem.
    for (const dt of [0, 1 / 60, 1]) expect(stepBlochVectorLength(1, dt, false)).toBe(1);
  });
});

describe('Bloch — dekoherencja, własności modelu', () => {
  it('|r⃗| maleje monotonicznie przy sprzężeniu i nie schodzi poniżej progu', () => {
    let r = 1;
    const trajectory = [r];
    // 0,12/s przy 60 FPS to 0,002 na krok, więc zejście z 1 do progu 0,02
    // wymaga 490 kroków; 600 daje zapas i sprawdza, że próg trzyma.
    for (let i = 0; i < 600; i++) {
      const next = stepBlochVectorLength(r, 1 / 60, true);
      expect(next).toBeLessThanOrEqual(r);
      r = next;
      trajectory.push(r);
    }
    expect(r).toBe(BLOCH_MIN_VECTOR_LENGTH);
    expect(Math.min(...trajectory)).toBeGreaterThanOrEqual(BLOCH_MIN_VECTOR_LENGTH);
  });

  it('|r⃗| wraca do dokładnie 1 po wyłączeniu sprzężenia i tam zostaje', () => {
    let r = BLOCH_MIN_VECTOR_LENGTH;
    for (let i = 0; i < 400; i++) r = stepBlochVectorLength(r, 1 / 60, false);
    expect(r).toBe(1);
    expect(stepBlochVectorLength(r, 1 / 60, false)).toBe(1);
  });

  it('ze stanu osiągalnego nigdy nie wychodzi poza [próg, 1] ani nie daje NaN', () => {
    // Osiągalne |r⃗| to [próg, 1]: pole startuje na 1, a gałąź dekoherencji
    // trzyma dolny próg. Test chodzi po tym zakresie, a nie po wartościach,
    // których model nigdy nie zobaczy.
    for (const dt of [0, 1 / 60, 0.5, 5]) {
      for (const decohering of [false, true]) {
        for (let i = 0; i <= 20; i++) {
          const reachable = BLOCH_MIN_VECTOR_LENGTH + (i / 20) * (1 - BLOCH_MIN_VECTOR_LENGTH);
          const value = stepBlochVectorLength(reachable, dt, decohering);
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(BLOCH_MIN_VECTOR_LENGTH);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('próg jest JEDNOSTRONNY — to własność istniejącego modelu, nie niedopatrzenie testu', () => {
    // Oryginalna pętla nakładała Math.max(0.02, …) wyłącznie w gałęzi
    // dekoherencji. Wejście poniżej progu przy wyłączonym sprzężeniu przechodzi
    // przez min(1, …) i nie jest podnoszone do progu. Stan taki jest w aplikacji
    // nieosiągalny, ale zachowanie zostaje udokumentowane, a nie „poprawione":
    // zmiana tego byłaby zmianą fizyki, nie ekstrakcją.
    expect(stepBlochVectorLength(0, 0, false)).toBe(0);
    expect(stepBlochVectorLength(0, 1 / 60, false)).toBe(0.005);
    expect(stepBlochVectorLength(0, 0, true)).toBe(BLOCH_MIN_VECTOR_LENGTH);
  });

  it('dekoherencja jest szybsza niż powrót do koherencji — to nie jest symetryczny suwak', () => {
    const decayed = stepBlochVectorLength(0.5, 1, true);
    const recovered = stepBlochVectorLength(0.5, 1, false);
    expect(0.5 - decayed).toBeCloseTo(BLOCH_DECOHERENCE_RATE_PER_SECOND, 15);
    expect(recovered - 0.5).toBeCloseTo(BLOCH_RECOHERENCE_RATE_PER_SECOND, 15);
  });

  it('jest czysta: brak stanu modułu, ta sama para (stan, dt) zawsze ten sam wynik', () => {
    const first = stepBlochVectorLength(0.73, 1 / 60, true);
    for (let i = 0; i < 50; i++) stepBlochVectorLength(Math.random(), Math.random(), i % 2 === 0);
    expect(stepBlochVectorLength(0.73, 1 / 60, true)).toBe(first);
  });
});

describe('Bloch — pomiar rzutowy', () => {
  it('daje bit w bit ten sam wynik co gałąź pomiaru sprzed ekstrakcji', () => {
    const states: [C, C][] = [
      ZERO,
      [[0, 0], [1, 0]],
      applyCircuit(ZERO, ['H']),
      applyCircuit(ZERO, ['H', 'S']),
      applyCircuit(ZERO, ['H', 'T', 'Z']),
      applyCircuit(ZERO, ['X', 'H']),
    ];
    for (const state of states) {
      for (let i = 0; i <= 100; i++) {
        const draw = i / 100;
        const legacy = legacyMeasure(state[0], state[1], draw);
        const extracted = collapseByMeasurement(state, draw);
        expect(extracted.outcome).toBe(legacy.measured);
        expect(extracted.state[0]).toEqual(legacy.a);
        expect(extracted.state[1]).toEqual(legacy.b);
      }
    }
  });

  it('kolaps prowadzi do stanu bazowego, nie do obrotu stanu sprzed pomiaru', () => {
    const superposed = applyCircuit(ZERO, ['H']);
    expect(blochVector(superposed[0], superposed[1])[2]).toBeCloseTo(0, 12);

    for (const draw of [0, 0.49, 0.51, 0.99]) {
      const collapsed = collapseByMeasurement(superposed, draw);
      const [x, y, z] = blochVector(collapsed.state[0], collapsed.state[1]);
      expect(Math.abs(z)).toBe(1);
      expect(x).toBe(0);
      expect(y).toBe(0);
    }
  });

  it('reguła Borna: |0⟩ wychodzi dokładnie wtedy, gdy losowanie < P(|0⟩)', () => {
    const superposed = applyCircuit(ZERO, ['H']);
    const p0 = probabilityOfZero(superposed);
    expect(p0).toBeCloseTo(0.5, 12);

    expect(collapseByMeasurement(superposed, p0 - 1e-9).outcome).toBe('|0⟩');
    expect(collapseByMeasurement(superposed, p0).outcome).toBe('|1⟩');
    expect(collapseByMeasurement(ZERO, 0.999999).outcome).toBe('|0⟩');
    expect(collapseByMeasurement([[0, 0], [1, 0]], 0).outcome).toBe('|1⟩');
  });

  it('jest deterministyczny przy zadanym losowaniu — losowość jest wejściem, nie ukrytym stanem', () => {
    const state = applyCircuit(ZERO, ['H', 'T']);
    const digest = (draw: number) => fnv1a(canonicalJson(collapseByMeasurement(state, draw)));

    expect(digest(0.25)).toBe(digest(0.25));
    expect(digest(0.25)).not.toBe(digest(0.75));
  });

  it('częstości przy wielu losowaniach odtwarzają P(|0⟩) modelu', () => {
    const state = applyCircuit(ZERO, ['H', 'T']);
    const p0 = probabilityOfZero(state);
    // Deterministyczna siatka losowań zamiast Math.random(): sprawdzamy regułę,
    // nie generator, więc test nie może być losowy.
    const draws = 10_000;
    let zeros = 0;
    for (let i = 0; i < draws; i++) {
      if (collapseByMeasurement(state, (i + 0.5) / draws).outcome === '|0⟩') zeros++;
    }
    expect(zeros / draws).toBeCloseTo(p0, 3);
  });
});

describe('Bloch — jedna implementacja, renderer tylko ją wywołuje', () => {
  const source = readFileSync(fileURLToPath(new URL('../labs/experiments/quantum-bloch-3d.ts', import.meta.url)), 'utf8');

  it('renderer 3D importuje model z modułu fizyki', () => {
    expect(source).toContain('stepBlochVectorLength');
    expect(source).toContain('collapseByMeasurement');
    expect(source).toContain('probabilityOfZero');
  });

  it('renderer nie zawiera już własnej kopii dekoherencji, pomiaru ani reguły Borna', () => {
    expect(source).not.toContain('Math.max(0.02');
    expect(source).not.toContain('dt * 0.12');
    expect(source).not.toContain('dt * 0.3');
    expect(source).not.toMatch(/this\.a\[0\] \*\* 2 \+ this\.a\[1\] \*\* 2/);
  });

  it('losowanie zostaje przy rendererze, model go nie zawiera', () => {
    const model = readFileSync(fileURLToPath(new URL('../labs/experiments/quantum-bloch.ts', import.meta.url)), 'utf8');
    expect(model).not.toContain('Math.random');
    expect(model).not.toContain('Date.now');
    expect(source).toContain('collapseByMeasurement([this.a, this.b], Math.random())');
  });
});
