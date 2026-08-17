import { describe, it, expect, beforeEach } from 'vitest';
import { resolveCommand, type ChatSimSnapshot } from '../core/scienceChat/resolveCommand';
import { _resetRecipes } from '../core/generator/recipe';
import { registerCatalog } from '../core/generator/catalog';
import type { ParamDef } from '../core/types';

const massDef: ParamDef = { key: 'mass', label: 'Masa', type: 'slider', default: 10, min: 1, max: 100, unit: 'M☉' };
const speedDef: ParamDef = { key: 'speed', label: 'Prędkość', type: 'slider', default: 0.5, min: 0, max: 0.99 };

function ctx(overrides: Partial<ChatSimSnapshot> = {}): ChatSimSnapshot {
  return {
    labId: 'einstein', experimentId: '__base', experimentName: 'Czarna dziura 3D',
    honesty: 'simplified', honestyNote: 'Metryka Schwarzschilda.',
    paramDefs: [massDef, speedDef], params: { mass: 10, speed: 0.5 }, stats: { rs: 3.2 },
    ...overrides,
  };
}

describe('scienceChat: open (reuse generatora)', () => {
  beforeEach(() => { _resetRecipes(); registerCatalog(); });

  it('"pokaż czarną dziurę" -> akcja open na realny lab', () => {
    const r = resolveCommand('pokaż czarną dziurę', null);
    expect(r.action?.type).toBe('open');
    if (r.action?.type === 'open') expect(r.action.labId).toBe('einstein');
  });

  it('bez kontekstu i bez rozpoznanego zjawiska — nie udaje, prosi o otwarcie', () => {
    const r = resolveCommand('zwiększ masę', null);
    expect(r.action).toBeUndefined();
    expect(r.text).toMatch(/otwart/i);
  });
});

describe('scienceChat: sterowanie parametrem aktualnej symulacji', () => {
  beforeEach(() => { _resetRecipes(); registerCatalog(); });

  it('"zwiększ masę 2×" -> setParam mass = 20 (realna zmiana, klamrowana do zakresu)', () => {
    const r = resolveCommand('zwiększ masę 2x', ctx());
    expect(r.action).toEqual({ type: 'setParam', key: 'mass', value: 20 });
    expect(r.tag).toBe('WYNIK');
  });

  it('"co jeśli zmniejszymy prędkość?" -> zmniejsza właściwy parametr', () => {
    const r = resolveCommand('co jeśli zmniejszymy prędkość?', ctx());
    expect(r.action?.type).toBe('setParam');
    if (r.action?.type === 'setParam') {
      expect(r.action.key).toBe('speed');
      expect(Number(r.action.value)).toBeLessThan(0.5);
    }
  });

  it('"ustaw masę na 50" -> setParam mass = 50', () => {
    const r = resolveCommand('ustaw masę na 50', ctx());
    expect(r.action).toEqual({ type: 'setParam', key: 'mass', value: 50 });
  });

  it('klamruje do max zakresu (masa ×100 z 10 -> 100, nie 1000)', () => {
    const r = resolveCommand('zwiększ masę 100x', ctx());
    if (r.action?.type === 'setParam') expect(r.action.value).toBe(100);
  });

  it('zmiana bez wskazanego parametru — pyta który, nie zgaduje', () => {
    const r = resolveCommand('zwiększ', ctx());
    expect(r.action).toBeUndefined();
    expect(r.text).toMatch(/Masa|Prędkość/);
  });
});

describe('scienceChat: wyjaśnienia, równania, założenia, zadania', () => {
  beforeEach(() => { _resetRecipes(); registerCatalog(); });

  it('"pokaż równanie" -> zwraca równania z katalogu (gdy są)', () => {
    const r = resolveCommand('pokaż równanie', ctx({ labId: 'spacetime', experimentId: 'spacetime.c-slider', experimentName: 'Dylatacja czasu' }));
    expect(r.tag).toBe('MODEL');
    expect((r.equations ?? []).join(' ')).toMatch(/γ|gamma|v/i);
  });

  it('"założenia modelu" -> tag ZALOZENIE + honestyNote', () => {
    const r = resolveCommand('jakie są założenia modelu', ctx());
    expect(r.tag).toBe('ZALOZENIE');
    expect(r.text).toMatch(/Schwarzschild/);
  });

  it('"co się zmieniło?" -> WYNIK SYMULACJI, nie dowód rzeczywistości', () => {
    const r = resolveCommand('co się zmieniło?', ctx());
    expect(r.tag).toBe('WYNIK');
    expect(r.text).toMatch(/nie dowód|nie jest dowod|WYNIK SYMULACJI/i);
  });

  it('"zrób zadanie" -> zadanie powiązane z realnym parametrem + TODO na auto-ocenę', () => {
    const r = resolveCommand('zrób zadanie dla ucznia', ctx());
    expect(r.text).toMatch(/Masa/);
    expect(r.todo).toBe(true);
  });
});

describe('scienceChat: uczciwe TODO dla niegotowych funkcji', () => {
  beforeEach(() => { _resetRecipes(); registerCatalog(); });

  it('"porównaj dwa modele" -> TODO (Faza 5), nie atrapa', () => {
    const r = resolveCommand('porównaj dwa modele', ctx());
    expect(r.todo).toBe(true);
    expect(r.action).toBeUndefined();
  });

  it('"sprawdź wynik" -> weryfikacja oznaczona TODO', () => {
    const r = resolveCommand('sprawdź wynik', ctx());
    expect(r.todo).toBe(true);
  });
});
