import type { HonestyLevel, ParamDef, SimParams } from '../types';
import { resolveQuery } from '../generator/resolve';
import { getRecipes, type SimulationRecipe } from '../generator/recipe';
import { normalize } from '../generator/resolve';

/**
 * Resolver komend Science Chat (INTENT / COMMAND RESOLVER w architekturze
 * USER → SCIENCE CHAT → RESOLVER → SELECTOR → ISTNIEJĄCY SILNIK). W pełni
 * deterministyczny i offline — te same słowa dają ten sam wynik, co jest
 * warunkiem uczciwości (żadnego zmyślania modelu przez LLM w ścieżce
 * sterującej). Funkcje jeszcze niezaimplementowane zwracają uczciwe TODO,
 * nie atrapę.
 *
 * Czysta funkcja: `resolveCommand(message, ctx)` — `ctx` to migawka aktualnej
 * symulacji (z core/simContext.ts) albo null, gdy nic nie jest otwarte.
 * Efekty uboczne (nawigacja, zmiana parametru, pauza) wykonuje komponent
 * ScienceChat na podstawie zwróconego `action`.
 */

/** Rozróżnienie epistemiczne wymagane przez wizję — widoczne przy każdej odpowiedzi. */
export type EpistemicTag =
  | 'FAKT' | 'MODEL' | 'ZALOZENIE' | 'HIPOTEZA' | 'WYNIK' | 'INTERPRETACJA' | 'SYSTEM';

export type ChatAction =
  | { type: 'open'; labId: string; experimentId?: string; params?: Partial<SimParams> }
  | { type: 'setParam'; key: string; value: number | boolean | string }
  | { type: 'control'; op: 'pause' | 'run' | 'reset' };

export interface ChatResponse {
  text: string;
  tag: EpistemicTag;
  action?: ChatAction;
  /** Oznacza funkcję świadomie jeszcze niegotową (uczciwe TODO, nie atrapa). */
  todo?: boolean;
  /** Dla odpowiedzi „pokaż równanie". */
  equations?: string[];
}

/** Migawka aktualnej symulacji dla resolvera (odsprzężona od żywego mostu — testowalna). */
export interface ChatSimSnapshot {
  labId: string;
  experimentId: string;
  experimentName: string;
  honesty: HonestyLevel;
  honestyNote: string;
  paramDefs: ParamDef[];
  params: SimParams;
  stats: Record<string, number>;
}

/** Synonimy nazw parametrów (znormalizowane) → dopasowanie po słowach kluczowych. */
const PARAM_SYNONYMS: Record<string, string[]> = {
  mass: ['masa', 'mase', 'masy', 'mass'],
  speed: ['predkosc', 'predkosci', 'szybkosc', 'speed', 'velocity'],
  temp: ['temperatura', 'temperature', 'temperatury', 'temp'],
  radius: ['promien', 'promienia', 'radius'],
  distance: ['odleglosc', 'dystans', 'distance'],
  charge: ['ladunek', 'charge'],
  energy: ['energia', 'energii', 'energy'],
};

function findParam(defs: ParamDef[], text: string): ParamDef | null {
  const norm = normalize(text);
  const words = new Set(norm.split(' '));
  // 1) bezpośrednio po etykiecie/kluczu parametru
  for (const d of defs) {
    const label = normalize(d.label);
    if (label && norm.includes(label)) return d;
    if (words.has(normalize(d.key))) return d;
  }
  // 2) przez tabelę synonimów (mapuje słowo z pytania na klucz)
  for (const d of defs) {
    const key = normalize(d.key);
    for (const [canon, syns] of Object.entries(PARAM_SYNONYMS)) {
      if (key.includes(canon) && syns.some((s) => words.has(s))) return d;
    }
  }
  return null;
}

/** Wykrywa mnożnik/wartość docelową ze zdania. Zwraca funkcję transformującą starą wartość. */
function detectNumericOp(text: string): ((old: number) => number) | null {
  // Znaki mnożenia (× ✕ *) normalize usuwa — zamień je na 'x', by „2×" == „2x".
  const norm = normalize(text.replace(/[×✕*]/g, 'x'));
  const setTo = norm.match(/\b(?:ustaw|na|do|=)\s*(\d+(?:[.,]\d+)?)/);
  if (setTo) { const v = parseFloat(setTo[1].replace(',', '.')); return () => v; }
  const factor = norm.match(/(\d+(?:[.,]\d+)?)\s*(?:x|razy|krotnie)/);
  const dwu = /\bdwukrotnie\b|\bdwa razy\b|\bpodwoj/.test(norm);
  const polowa = /\bo polowe\b|\bpolowe\b|\bpol\b|\bhalf\b/.test(norm);
  const inc = /\bzwieksz|zwiekszymy|wieksz|podnie|increase|raise/.test(norm);
  const dec = /\bzmniejsz|zmniejszymy|mniejsz|obniz|decrease|lower|reduce/.test(norm);
  if (factor) { const f = parseFloat(factor[1].replace(',', '.')); return (o) => (dec ? o / f : o * f); }
  if (dwu) return (o) => o * 2;
  if (polowa) return (o) => o / 2;
  if (inc) return (o) => o * 1.5;
  if (dec) return (o) => o / 1.5;
  return null;
}

function clamp(v: number, d: ParamDef): number {
  let out = v;
  if (typeof d.min === 'number') out = Math.max(d.min, out);
  if (typeof d.max === 'number') out = Math.min(d.max, out);
  return out;
}

/** Równania/założenia z katalogu generatora dla otwartego eksperymentu. */
function recipeFor(ctx: ChatSimSnapshot): SimulationRecipe | undefined {
  const all = getRecipes();
  return (
    all.find((r) => r.labId === ctx.labId && r.experimentId === ctx.experimentId) ??
    all.find((r) => r.labId === ctx.labId)
  );
}

const has = (norm: string, ...kw: string[]) => kw.some((k) => norm.includes(k));

export function resolveCommand(message: string, ctx: ChatSimSnapshot | null): ChatResponse {
  const norm = normalize(message);
  if (!norm) return { text: 'Napisz, co chcesz zobaczyć — np. „pokaż czarną dziurę" albo „zwiększ masę 2×".', tag: 'SYSTEM' };

  // --- Sterowanie odtwarzaniem (istniejący activeSimControls) ---
  if (has(norm, 'pauza', 'zatrzymaj', 'wstrzymaj', 'stop ')) return { text: 'Wstrzymuję symulację.', tag: 'SYSTEM', action: { type: 'control', op: 'pause' } };
  if (has(norm, 'reset', 'od nowa', 'zresetuj', 'restart')) return { text: 'Restartuję symulację do stanu początkowego.', tag: 'SYSTEM', action: { type: 'control', op: 'reset' } };

  // --- Otwórz zjawisko (reuse generatora) — ma priorytet, gdy pada nazwa zjawiska ---
  const open = resolveQuery(message);
  const looksLikeOpen = has(norm, 'pokaz', 'stworz', 'zbuduj', 'otworz', 'uruchom', 'zasymuluj', 'symulacj', 'wyswietl', 'chce zobaczyc');
  if (open.best && (looksLikeOpen || !ctx)) {
    const r = open.best.recipe;
    return {
      text: `Otwieram: ${r.title}. ${r.summary}`,
      tag: 'MODEL',
      action: { type: 'open', labId: r.labId, experimentId: r.experimentId, params: r.params },
    };
  }

  // --- Porównanie modeli (Faza 5) — uczciwe TODO ---
  if (has(norm, 'porownaj', 'porownanie', 'vs ', 'dwa modele')) {
    return { text: 'Porównywanie dwóch modeli obok siebie to Faza 5 (zaprojektowana, jeszcze nie podłączona). Zapisuję to jako wymaganie. Na razie mogę otworzyć jeden model i zmieniać jego parametry.', tag: 'SYSTEM', todo: true };
  }

  // --- Bez otwartej symulacji: dalsze komendy wymagają kontekstu ---
  if (!ctx) {
    if (has(norm, 'pomoc', 'help', 'co potrafisz', 'co umiesz')) return helpResponse();
    return {
      text: 'Nie mam teraz otwartej symulacji. Powiedz np. „pokaż czarną dziurę" albo „zasymuluj dylatację czasu", a potem będę mógł zmieniać parametry, wyjaśniać i tworzyć zadania.',
      tag: 'SYSTEM',
    };
  }

  const recipe = recipeFor(ctx);

  // --- Równania ---
  if (has(norm, 'rownanie', 'rownania', 'wzor', 'wzory', 'equation')) {
    const eqs = recipe?.equations ?? [];
    if (eqs.length === 0) return { text: `Dla „${ctx.experimentName}" nie mam jeszcze zarejestrowanych równań w katalogu. TODO: uzupełnić metadane modelu.`, tag: 'MODEL', todo: true };
    return { text: `Równania modelu „${ctx.experimentName}":`, tag: 'MODEL', equations: eqs };
  }

  // --- Założenia / ograniczenia ---
  if (has(norm, 'zalozeni', 'ograniczeni', 'assumption', 'limit')) {
    const extra = recipe?.assumptions?.length ? ` Założenia: ${recipe.assumptions.join(' · ')}.` : '';
    return { text: `Model „${ctx.experimentName}" — poziom uczciwości: ${ctx.honesty}. ${ctx.honestyNote}${extra}`, tag: 'ZALOZENIE' };
  }

  // --- Źródła (istnieją per-twierdzenie w Narratorze; katalog per-model to TODO) ---
  if (has(norm, 'zrodl', 'source', 'bibliograf', 'cytow')) {
    return { text: 'Źródła konkretnych twierdzeń pokazuje panel Narratora przy danej wartości. Spójny katalog źródeł per-model to TODO (Provenance dla generatora).', tag: 'SYSTEM', todo: true };
  }

  // --- Zadanie / praca domowa / quiz (fundament, powiązane z realnym modelem) ---
  if (has(norm, 'zadanie', 'praca domowa', 'quiz', 'cwiczenie', 'zadanie dla ucznia')) {
    return taskResponse(ctx);
  }

  // --- Weryfikacja (Faza 6 — inwarianty; uczciwe TODO) ---
  if (has(norm, 'sprawdz wynik', 'zweryfikuj', 'weryfik', 'verify')) {
    return { text: 'Weryfikacja inwariantami (jednostki, zakresy, prawa zachowania) dla żywej symulacji to Faza 6 — interfejs gotowy, kontrole do podłączenia. TODO.', tag: 'SYSTEM', todo: true };
  }

  // --- „Co się zmieniło?" / analiza aktualnego wyniku (PRZED zmianą parametru,
  //     bo „zmieniło" zawiera podłańcuch „zmien") ---
  if (has(norm, 'co sie zmienilo', 'co sie stalo', 'analiz') || (has(norm, 'wynik') && !has(norm, 'sprawdz'))) {
    return explainState(ctx);
  }

  // --- Zmiana parametru / „co jeśli?" ---
  const numericDefs = ctx.paramDefs.filter((d) => d.type === 'slider');
  const target = findParam(ctx.paramDefs, message);
  const op = detectNumericOp(message);
  const wantsChange = has(norm, 'zwieksz', 'zmniejsz', 'zmien', 'ustaw', 'co jesli', 'co sie stanie', 'podwoj', 'obniz', 'podnie');
  if (wantsChange || (target && op)) {
    if (!target) {
      const names = numericDefs.map((d) => d.label).join(', ') || 'brak regulowanych parametrów';
      return { text: `Który parametr zmienić? Dostępne w „${ctx.experimentName}": ${names}.`, tag: 'SYSTEM' };
    }
    if (target.type !== 'slider') {
      return { text: `Parametr „${target.label}" nie jest liczbowy — nie umiem go skalować. Dostępne liczbowe: ${numericDefs.map((d) => d.label).join(', ')}.`, tag: 'SYSTEM' };
    }
    const oldVal = Number(ctx.params[target.key] ?? target.default);
    const transform = op ?? ((o: number) => o * 2); // „co jeśli zwiększymy X" bez liczby → domyślnie ×2
    const newVal = clamp(transform(oldVal), target);
    if (newVal === oldVal) {
      return { text: `Parametr „${target.label}" jest już na granicy zakresu (${oldVal}${target.unit ? ' ' + target.unit : ''}) — nie mogę zmienić dalej w tę stronę.`, tag: 'WYNIK' };
    }
    const unit = target.unit ? ` ${target.unit}` : '';
    return {
      text: `Zmieniam „${target.label}": ${oldVal}${unit} → ${newVal}${unit}. Obserwuj scenę — to realny parametr silnika, nie animacja. Zapytaj „co się zmieniło?", by porównać wynik.`,
      tag: 'WYNIK',
      action: { type: 'setParam', key: target.key, value: newVal },
    };
  }

  // --- Wyjaśnij (dlaczego / jak laikowi) ---
  if (has(norm, 'wyjasnij', 'dlaczego', 'wytlumacz', 'jak laikowi', 'co to')) {
    return explainState(ctx, /* lay */ has(norm, 'laikowi', 'prosto', 'prosciej'));
  }

  if (has(norm, 'pomoc', 'help', 'co potrafisz', 'co umiesz')) return helpResponse();

  // --- Nierozpoznane w kontekście symulacji ---
  return {
    text: `Nie rozpoznałem komendy w kontekście „${ctx.experimentName}". Spróbuj: „zwiększ ${numericDefs[0]?.label ?? 'parametr'} 2×", „pokaż równanie", „założenia modelu", „zrób zadanie" albo „co się zmieniło?".`,
    tag: 'SYSTEM',
  };
}

function explainState(ctx: ChatSimSnapshot, lay = false): ChatResponse {
  const params = ctx.paramDefs
    .filter((d) => d.type === 'slider')
    .map((d) => `${d.label}: ${ctx.params[d.key] ?? d.default}${d.unit ? ' ' + d.unit : ''}`)
    .join(' · ');
  const statKeys = Object.keys(ctx.stats);
  const stats = statKeys.length ? statKeys.slice(0, 4).map((k) => `${k}: ${round(ctx.stats[k])}`).join(' · ') : 'brak liczników na tym etapie';
  const lead = lay
    ? `W prostych słowach — „${ctx.experimentName}" pokazuje zjawisko na żywo. `
    : `Aktualny stan „${ctx.experimentName}". `;
  return {
    text: `${lead}Parametry — ${params || 'brak regulowanych'}. Odczyty — ${stats}. To WYNIK SYMULACJI modelu (${ctx.honesty}), nie dowód o rzeczywistości: ${ctx.honestyNote}`,
    tag: 'WYNIK',
  };
}

function taskResponse(ctx: ChatSimSnapshot): ChatResponse {
  const p = ctx.paramDefs.find((d) => d.type === 'slider');
  if (!p) {
    return { text: `„${ctx.experimentName}" nie ma regulowanego parametru liczbowego, więc nie zbuduję z niego zadania obliczeniowego. Fundament generatora zadań jest gotowy — TODO: zadania jakościowe.`, tag: 'SYSTEM', todo: true };
  }
  const lo = typeof p.min === 'number' ? p.min : Number(p.default);
  const hi = typeof p.max === 'number' ? p.max : Number(p.default) * 2;
  const a = round(lo + (hi - lo) * 0.25);
  const b = round(lo + (hi - lo) * 0.75);
  const stat = Object.keys(ctx.stats)[0];
  const observe = stat ? `Zapisz odczyt „${stat}" przed i po zmianie.` : 'Opisz, co zmienia się na scenie.';
  return {
    text:
      `Zadanie (eksperymentalne, powiązane z modelem „${ctx.experimentName}"):\n` +
      `1. Ustaw „${p.label}" = ${a}${p.unit ? ' ' + p.unit : ''}. ${observe}\n` +
      `2. Zmień „${p.label}" na ${b}${p.unit ? ' ' + p.unit : ''}. Ponów obserwację.\n` +
      `3. Wyjaśnij, dlaczego wynik się zmienił, odwołując się do modelu.\n` +
      `Punktacja i auto-ocena wyniku liczbowego: fundament gotowy — TODO (Faza 4).`,
    tag: 'SYSTEM',
    todo: true,
  };
}

function helpResponse(): ChatResponse {
  return {
    text:
      'Science Chat rozmawia z realnymi silnikami Genesis. Potrafię: otworzyć zjawisko („pokaż czarną dziurę"), ' +
      'zmienić parametr otwartej symulacji („zwiększ masę 2×", „co jeśli zmniejszymy prędkość?"), wyjaśnić stan ' +
      '(„co się zmieniło?", „wyjaśnij jak laikowi"), pokazać równania i założenia modelu, oraz zbudować zadanie ' +
      'z bieżącego eksperymentu. Porównanie modeli, weryfikacja inwariantami i katalog źródeł są w drodze (TODO).',
    tag: 'SYSTEM',
  };
}

function round(v: number): number {
  if (!Number.isFinite(v)) return v;
  const a = Math.abs(v);
  if (a !== 0 && (a < 0.01 || a >= 1e5)) return Number(v.toPrecision(3)) as number;
  return Math.round(v * 1000) / 1000;
}
