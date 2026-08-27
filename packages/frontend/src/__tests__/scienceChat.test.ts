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

describe('scienceChat: SCIENTIFIC INTENT — każda odpowiedź ma typowaną intencję', () => {
  beforeEach(() => { _resetRecipes(); registerCatalog(); });

  it('klasyfikuje intencje głównych komend', () => {
    expect(resolveCommand('pokaż czarną dziurę', null).intent).toBe('OPEN_SIMULATION');
    expect(resolveCommand('porównaj dwa modele', null).intent).toBe('COMPARE_MODELS');
    expect(resolveCommand('zwiększ masę 2x', ctx()).intent).toBe('CHANGE_PARAMETER');
    expect(resolveCommand('co jeśli zmniejszymy prędkość?', ctx()).intent).toBe('WHAT_IF');
    expect(resolveCommand('pokaż równanie', ctx()).intent).toBe('SHOW_EQUATION');
    expect(resolveCommand('założenia modelu', ctx()).intent).toBe('SHOW_ASSUMPTIONS');
    expect(resolveCommand('zrób zadanie', ctx()).intent).toBe('CREATE_TASK');
    expect(resolveCommand('co się zmieniło?', ctx()).intent).toBe('EXPLAIN');
    expect(resolveCommand('pauza', ctx()).intent).toBe('CONTROL');
    expect(resolveCommand('zapisz eksperyment', ctx()).intent).toBe('SAVE');
    expect(resolveCommand('pokaż zapisane', null).intent).toBe('LIST');
    expect(resolveCommand('wczytaj 1', null).intent).toBe('LOAD');
    expect(resolveCommand('zweryfikuj', ctx()).intent).toBe('VERIFY');
    expect(resolveCommand('pomoc', null).intent).toBe('HELP');
  });

  it('PROPOSE_EXPERIMENT bez kontekstu proponuje realny start (akcja open)', () => {
    const r = resolveCommand('zaproponuj kolejny eksperyment', null);
    expect(r.intent).toBe('PROPOSE_EXPERIMENT');
    expect(r.action?.type).toBe('open');
  });

  it('PROPOSE_EXPERIMENT w kontekście epidemii proponuje porównanie (akcja compare)', () => {
    const epiCtx = ctx({ labId: 'biology', experimentId: 'biology.epidemic', experimentName: 'Epidemia na wyspie (SIR/SEIR)' });
    const r = resolveCommand('zaproponuj eksperyment', epiCtx);
    expect(r.intent).toBe('PROPOSE_EXPERIMENT');
    expect(r.action?.type).toBe('compare');
  });
});

describe('scienceChat: porównanie modeli (COMPARE_MODELS, FAZA 1/P5)', () => {
  beforeEach(() => { _resetRecipes(); registerCatalog(); });

  it('"porównaj dwa modele" -> akcja compare z domyślnym scenariuszem (SIR 1.5 vs 3)', () => {
    const r = resolveCommand('porównaj dwa modele', null);
    expect(r.action?.type).toBe('compare');
    if (r.action?.type === 'compare') {
      expect(r.action.a.params.r0).toBe(1.5);
      expect(r.action.b.params.r0).toBe(3);
    }
  });

  it('"porównaj SIR R0=1.5 z SIR R0=3" -> wyłapuje obie liczby jako R0', () => {
    const r = resolveCommand('porównaj SIR R0=1.5 z SIR R0=3', null);
    expect(r.action?.type).toBe('compare');
    if (r.action?.type === 'compare') {
      expect(r.action.a.params.r0).toBe(1.5);
      expect(r.action.b.params.r0).toBe(3);
      expect(r.action.a.params.model).toBe('SIR');
    }
  });

  it('compare ma priorytet nad open — „porównaj SIR..." nie otwiera pojedynczego modelu', () => {
    const r = resolveCommand('porównaj SIR 2 z SIR 4', null);
    expect(r.action?.type).toBe('compare');
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

describe('scienceChat: Campaign entry point', () => {
  beforeEach(() => { _resetRecipes(); registerCatalog(); });

  it('otwiera istniejący CampaignScreen bez auto-startu kampanii', () => {
    const r = resolveCommand('Otwórz kampanię naukową', null);
    expect(r.intent).toBe('OPEN_CAMPAIGN');
    expect(r.action).toEqual({ type: 'openRoute', hash: '#/campaign' });
    expect(r.text).toMatch(/read-only|nie zostanie utworzona/i);
  });

  // Chromium proof wykazał, że naturalne krótkie formy trafiały wcześniej w
  // ogólny fallback „nie mam otwartej symulacji", więc Campaign wyglądał na
  // nieosiągalny. Rdzeń „kampani" pokrywa polską odmianę.
  it.each([
    'otwórz kampanię',
    'pokaż kampanię',
    'kampania',
    'wróć do kampanii',
    'open campaign',
  ])('rozpoznaje naturalną formę: %s', (phrase) => {
    const r = resolveCommand(phrase, null);
    expect(r.intent).toBe('OPEN_CAMPAIGN');
    expect(r.action).toEqual({ type: 'openRoute', hash: '#/campaign' });
  });

  it('działa także przy otwartej symulacji — nawigacja nie zależy od kontekstu', () => {
    const ctx = {
      labId: 'universe', experimentId: 'kepler', experimentName: 'Kepler',
      honesty: 'educational' as const, honestyNote: '', paramDefs: [],
      params: {}, stats: {},
    };
    const r = resolveCommand('otwórz kampanię', ctx);
    expect(r.intent).toBe('OPEN_CAMPAIGN');
    expect(r.action).toEqual({ type: 'openRoute', hash: '#/campaign' });
  });

  it('nadal nie tworzy ani nie uruchamia kampanii — tylko nawigacja', () => {
    const r = resolveCommand('uruchom kampanię', null);
    expect(r.intent).toBe('OPEN_CAMPAIGN');
    expect(r.action).toEqual({ type: 'openRoute', hash: '#/campaign' });
    expect(r.text).toMatch(/read-only/i);
  });
});

describe('scienceChat: Scientific Memory (zapis / lista / wczytanie)', () => {
  beforeEach(() => { _resetRecipes(); registerCatalog(); });

  it('"zbadaj problem trzech ciał" -> open na Universe (DEMO A)', () => {
    const r = resolveCommand('Zbadaj problem trzech ciał', null);
    expect(r.action?.type).toBe('open');
    if (r.action?.type === 'open') { expect(r.action.labId).toBe('universe'); expect(r.action.experimentId).toBe('threebody'); }
  });

  it('"zapisz eksperyment" z kontekstem -> akcja save', () => {
    const r = resolveCommand('zapisz eksperyment', ctx());
    expect(r.action).toEqual({ type: 'save' });
  });

  it('"zapisz eksperyment" bez kontekstu -> nie zapisuje, prosi o otwarcie', () => {
    const r = resolveCommand('zapisz eksperyment', null);
    expect(r.action).toBeUndefined();
    expect(r.text).toMatch(/otwórz|otworz/i);
  });

  it('"pokaż zapisane" -> akcja list', () => {
    const r = resolveCommand('pokaż zapisane', null);
    expect(r.action).toEqual({ type: 'list' });
  });

  it('"wczytaj 2" -> akcja load z indeksem', () => {
    const r = resolveCommand('wczytaj 2', null);
    expect(r.action).toEqual({ type: 'load', index: 2 });
  });
});

describe('scienceChat: uczciwe TODO dla niegotowych funkcji', () => {
  beforeEach(() => { _resetRecipes(); registerCatalog(); });

  it('"porównaj dwa modele" -> realna akcja compare (P5 gotowe), nawet z otwartą symulacją', () => {
    const r = resolveCommand('porównaj dwa modele', ctx());
    expect(r.action?.type).toBe('compare');
    expect(r.todo).toBeFalsy();
  });

  it('"sprawdź wynik" -> weryfikacja oznaczona TODO', () => {
    const r = resolveCommand('sprawdź wynik', ctx());
    expect(r.todo).toBe(true);
  });
});

describe('scienceChat: Evidence / Replay entry point', () => {
  beforeEach(() => { _resetRecipes(); registerCatalog(); });

  it('opens the existing discovery-log Evidence & Replay panel without running a fake experiment', () => {
    const r = resolveCommand('Pokaż Evidence i Replay', null);
    expect(r.intent).toBe('OPEN_SIMULATION');
    expect(r.action).toEqual({ type: 'openRoute', hash: '#/discovery-log' });
    expect(r.text).toMatch(/PROTOCOL_REQUIRED/);
    expect(r.text).toMatch(/VARIANT_REQUIRED/);
  });
});

describe('scienceChat: Pilot eksperymentu (P2.1 UI)', () => {
  beforeEach(() => { _resetRecipes(); registerCatalog(); });

  it('"pilot eksperymentu" -> otwiera #/pilot', () => {
    const r = resolveCommand('pilot eksperymentu', null);
    expect(r.action).toEqual({ type: 'openRoute', hash: '#/pilot' });
  });

  it('"uruchom pilota" -> otwiera #/pilot nawet z otwartą symulacją', () => {
    const r = resolveCommand('uruchom pilota', ctx());
    expect(r.action).toEqual({ type: 'openRoute', hash: '#/pilot' });
  });
});
