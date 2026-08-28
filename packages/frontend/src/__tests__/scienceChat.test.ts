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

  it('Protocol / A-B otwiera istniejący Pilot read-only, bez uruchamiania modelu', () => {
    const r = resolveCommand('zaprojektuj protokół A/B', null);
    expect(r.intent).toBe('OPEN_SIMULATION');
    expect(r.action).toEqual({ type: 'openRoute', hash: '#/pilot?mode=protocol' });
    expect(r.text).toMatch(/żaden run nie zostanie uruchomiony/i);
  });

  it('Pamięć Naukowa otwiera istniejącą historię lokalną, bez claimu reprodukcji', () => {
    const r = resolveCommand('pokaż Pamięć Naukową', null);
    expect(r.intent).toBe('OPEN_SIMULATION');
    expect(r.action).toEqual({ type: 'openRoute', hash: '#/memory' });
    expect(r.text).toMatch(/nie jest dowodem reprodukcji/i);
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

  it('tunelowanie pokazuje równanie istniejącego runnera i jego granice', () => {
    const r = resolveCommand('pokaż równania', ctx({ labId: 'quantum', experimentId: 'tunneling', experimentName: 'Tunelowanie kwantowe' }));
    expect(r.todo).toBeFalsy();
    expect(r.tag).toBe('MODEL');
    expect((r.equations ?? []).join(' ')).toMatch(/Schrödinger|ψ|split/i);
    expect((r.equations ?? []).join(' ')).toMatch(/barierą/);
  });

  it('podwójne wahadło pokazuje model RK4 i jawny dryf energii', () => {
    const r = resolveCommand('pokaż równanie', ctx({ labId: 'universe', experimentId: 'doublependulum', experimentName: 'Podwójne wahadło' }));
    expect(r.todo).toBeFalsy();
    expect(r.tag).toBe('MODEL');
    expect((r.equations ?? []).join(' ')).toMatch(/Lagrange|RK4|energii/);
  });

  it('double-slit pokazuje P(u)=|ψ|² i granicę pomiaru drogi', () => {
    const r = resolveCommand('pokaż równanie', ctx({ labId: 'quantum', experimentId: 'double-slit', experimentName: 'Doświadczenie z dwiema szczelinami' }));
    expect(r.todo).toBeFalsy();
    expect(r.tag).toBe('MODEL');
    expect((r.equations ?? []).join(' ')).toMatch(/P\(u\)|ψ|pomiar/i);
  });

  it('World Chronicle otwiera interaktywną oś jednego miejsca z jawnym statusem', () => {
    const r = resolveCommand('pokaż ewolucję od pustyni do miasta', null);
    expect(r.intent).toBe('OPEN_SIMULATION');
    expect(r.action).toEqual({ type: 'openRoute', hash: '#/timeline?mode=place' });
    expect(r.text).toMatch(/SCENARIO\/CINEMATIC/i);
    expect(r.text).toMatch(/jednego miejsca/i);
  });

  it('Observer at the Junction otwiera istniejący Reality Navigator z granicą model/scenario', () => {
    const r = resolveCommand('pokaż Observer at the Junction', null);
    expect(r.intent).toBe('OPEN_SIMULATION');
    expect(r.action).toEqual({ type: 'openRoute', hash: '#/reality' });
    expect(r.tag).toBe('MODEL');
    expect(r.text).toMatch(/nie są dowodem fizycznego multiwersum/i);
  });

  it('most Asgard i wormhole kierują do tego samego scenariusza, nie do fikcyjnego solvera', () => {
    for (const prompt of ['pokaż most Asgard', 'uruchom wormhole']) {
      const r = resolveCommand(prompt, null);
      expect(r.action).toEqual({ type: 'openRoute', hash: '#/reality' });
      expect(r.text).toMatch(/scenariuszowego „mostu”/i);
      expect(r.text).toMatch(/nie są dowodem fizycznego multiwersum/i);
    }
  });

  it('tesserakt 4D ujawnia rzut matematyczny i nie udaje fizycznego wymiaru', () => {
    const ctxSnapshot = ctx({ labId: 'multiverse', experimentId: 'tesseract', experimentName: 'Tesserakt 4D' });
    const equationResponse = resolveCommand('pokaż równanie', ctxSnapshot);
    const assumptionsResponse = resolveCommand('jakie są założenia modelu', ctxSnapshot);
    expect(equationResponse.todo).toBeFalsy();
    expect(equationResponse.tag).toBe('MODEL');
    expect((equationResponse.equations ?? []).join(' ')).toMatch(/4D|4→3D|16/);
    expect(assumptionsResponse.text).toMatch(/fizycznego piątego wymiaru/i);
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

  it('"sprawdź wynik" -> wykonuje zakresową walidację snapshotu bez udawania walidacji solvera', () => {
    const r = resolveCommand('sprawdź wynik', ctx());
    expect(r.intent).toBe('VERIFY');
    expect(r.todo).toBeFalsy();
    expect(r.tag).toBe('FAKT');
    expect(r.text).toMatch(/VERIFY PASS/);
    expect(r.text).toMatch(/NOT_MODELED/);
  });

  it('VERIFY blokuje parametr poza zadeklarowanym zakresem', () => {
    const r = resolveCommand('zweryfikuj', ctx({ params: { mass: 101, speed: 0.5 } }));
    expect(r.intent).toBe('VERIFY');
    expect(r.tag).toBe('SYSTEM');
    expect(r.text).toMatch(/VERIFY BLOCKED/);
    expect(r.text).toMatch(/powyżej maksimum/);
  });

  it('VERIFY blokuje się bez otwartej symulacji', () => {
    const r = resolveCommand('zweryfikuj', null);
    expect(r.intent).toBe('VERIFY');
    expect(r.text).toMatch(/VERIFY BLOCKED/);
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

describe('scienceChat: model provenance source response', () => {
  beforeEach(() => { _resetRecipes(); registerCatalog(); });

  it('returns registry locator and does not claim an external citation exists', () => {
    const r = resolveCommand('pokaż źródła modelu', ctx({ experimentName: 'Czarna dziura 3D' }));
    expect(r.intent).toBe('EXPLAIN');
    expect(r.tag).toBe('MODEL');
    expect(r.todo).toBeUndefined();
    expect(r.text).toContain('Genesis registry');
    expect(r.text).toContain('Brak zarejestrowanej niezależnej referencji zewnętrznej');
    expect(r.text).toContain('To nie jest dowód pomiarowy');
  });

  it('fails closed when the open experiment has no catalog entry', () => {
    const r = resolveCommand('pokaż źródła', ctx({ labId: 'unknown-lab', experimentId: 'unknown-experiment', experimentName: 'Nieznany eksperyment' }));
    expect(r.intent).toBe('EXPLAIN');
    expect(r.tag).toBe('SYSTEM');
    expect(r.text).toContain('Nie mogę uczciwie wskazać źródła');
  });
});


describe('scienceChat: Hubble tension model metadata', () => {
  beforeEach(() => { _resetRecipes(); registerCatalog(); });

  it('exposes the implemented delta and combined-uncertainty equations', () => {
    const r = resolveCommand('pokaż równania', ctx({ labId: 'universe', experimentId: 'shoes', experimentName: 'Ekspansja Wszechświata (napięcie Hubble’a)' }));
    expect(r.intent).toBe('SHOW_EQUATION');
    expect(r.tag).toBe('MODEL');
    expect(r.equations).toEqual(expect.arrayContaining([
      expect.stringContaining('ΔH₀'),
      expect.stringContaining('σ_combined'),
      expect.stringContaining('tension'),
    ]));
  });
});
