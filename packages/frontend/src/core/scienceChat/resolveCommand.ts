import type { HonestyLevel, ParamDef, SimParams } from '../types';
import { resolveQuery } from '../generator/resolve';
import { getRecipes, type SimulationRecipe } from '../generator/recipe';
import { normalize } from '../generator/resolve';
import { defaultComparison, type ModelConfig } from '../epidemic/compare';
import { DEFAULT_EPIDEMIC, type EpidemicModel } from '../epidemic/sir';

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

/**
 * SCIENTIFIC INTENT — jawna, typowana klasyfikacja intencji użytkownika
 * (warstwa TEXT → SCIENTIFIC INTENT → MODEL SELECTION → EXPERIMENT). Każda
 * odpowiedź resolvera niesie swoją intencję, więc UI i testy mogą na niej
 * polegać, a nie zgadywać z treści. To NIE nowy resolver — to etykieta nad
 * istniejącą, deterministyczną ścieżką.
 */
export type ScientificIntent =
  | 'OPEN_SIMULATION' | 'CHANGE_PARAMETER' | 'WHAT_IF' | 'EXPLAIN'
  | 'SHOW_EQUATION' | 'SHOW_ASSUMPTIONS' | 'COMPARE_MODELS' | 'CREATE_TASK'
  | 'CHECK_RESULT' | 'VERIFY' | 'PROPOSE_EXPERIMENT'
  | 'SAVE' | 'LIST' | 'LOAD' | 'CONTROL' | 'HELP' | 'UNKNOWN';

export type ChatAction =
  | { type: 'open'; labId: string; experimentId?: string; params?: Partial<SimParams> }
  | { type: 'setParam'; key: string; value: number | boolean | string }
  | { type: 'control'; op: 'pause' | 'run' | 'reset' }
  | { type: 'save' }
  | { type: 'list' }
  | { type: 'load'; index: number }
  | { type: 'compare'; a: ModelConfig; b: ModelConfig }
  | { type: 'openRoute'; hash: string };

export interface ChatResponse {
  text: string;
  tag: EpistemicTag;
  /** Jawna, typowana intencja naukowa tej odpowiedzi (SCIENTIFIC INTENT). */
  intent: ScientificIntent;
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

/**
 * Buduje konfigurację porównania A vs B z SUROWEGO zdania (nie znormalizowanego —
 * normalize usuwa kropki dziesiętne i tworzy fałszywe „0" z „R0"). Wyłapuje
 * model (SIR/SEIR/SEIRD) i do dwóch liczb jako R0. Bez rozpoznanych liczb
 * używa domyślnego scenariusza z dyrektywy (SIR R0=1.5 vs 3.0).
 */
function buildComparison(raw: string): { a: ModelConfig; b: ModelConfig } {
  const low = raw.toLowerCase();
  const model: EpidemicModel = /seird/.test(low) ? 'SEIRD' : /seir/.test(low) ? 'SEIR' : /\bsir\b/.test(low) ? 'SIR' : 'SIR';
  // 1) Preferuj jawne „r0 = X" (X z kropką/przecinkiem).
  let nums = [...low.matchAll(/r0\s*[=:]?\s*(\d+(?:[.,]\d+)?)/g)].map((m) => parseFloat(m[1].replace(',', '.')));
  // 2) Inaczej ogólne liczby, ale najpierw usuń „r0", by cyfra 0 z niego nie liczyła się jako wartość.
  if (nums.length < 2) {
    nums = [...low.replace(/r0/g, ' ').matchAll(/\d+(?:[.,]\d+)?/g)]
      .map((m) => parseFloat(m[0].replace(',', '.'))).filter((x) => x >= 0 && x <= 20);
  }
  const mk = (r0: number, tag: 'A' | 'B'): ModelConfig => ({
    label: `Model ${tag} · ${model} R₀=${r0}`,
    params: { ...DEFAULT_EPIDEMIC, model, r0 },
  });
  if (nums.length >= 2) return { a: mk(nums[0], 'A'), b: mk(nums[1], 'B') };
  if (/sir|seir|seird/.test(low)) return { a: mk(1.5, 'A'), b: mk(3, 'B') };
  return defaultComparison();
}

export function resolveCommand(message: string, ctx: ChatSimSnapshot | null): ChatResponse {
  const norm = normalize(message);
  if (!norm) return { text: 'Napisz, co chcesz zobaczyć — np. „pokaż czarną dziurę" albo „zwiększ masę 2×".', tag: 'SYSTEM', intent: 'HELP' };

  // --- Sterowanie odtwarzaniem (istniejący activeSimControls) ---
  if (has(norm, 'pauza', 'zatrzymaj', 'wstrzymaj', 'stop ')) return { text: 'Wstrzymuję symulację.', tag: 'SYSTEM', intent: 'CONTROL', action: { type: 'control', op: 'pause' } };
  if (has(norm, 'reset', 'od nowa', 'zresetuj', 'restart')) return { text: 'Restartuję symulację do stanu początkowego.', tag: 'SYSTEM', intent: 'CONTROL', action: { type: 'control', op: 'reset' } };

  // --- Scientific Memory (sekcja 21): wczytanie / lista / zapis ---
  const loadMatch = norm.match(/(?:wczytaj|otworz zapisany|przywroc)\D*(\d+)/);
  if (loadMatch) return { text: `Wczytuję zapisany eksperyment #${loadMatch[1]}…`, tag: 'SYSTEM', intent: 'LOAD', action: { type: 'load', index: parseInt(loadMatch[1], 10) } };
  if (has(norm, 'zapisane eksperyment', 'moje eksperyment', 'pokaz zapisane', 'lista eksperyment', 'pamiec naukowa', 'historia eksperyment')) {
    return { text: 'Twoje zapisane eksperymenty (Pamięć Naukowa, lokalnie w tej przeglądarce):', tag: 'SYSTEM', intent: 'LIST', action: { type: 'list' } };
  }
  if (has(norm, 'zapisz eksperyment', 'zapisz to', 'zapisz symulacj', 'zapisz wynik', 'zapisz ten') || /^zapisz\b/.test(norm)) {
    if (!ctx) return { text: 'Nie ma otwartej symulacji do zapisania. Najpierw otwórz zjawisko, np. „problem trzech ciał".', tag: 'SYSTEM', intent: 'SAVE' };
    return { text: `Zapisuję „${ctx.experimentName}" do Pamięci Naukowej…`, tag: 'SYSTEM', intent: 'SAVE', action: { type: 'save' } };
  }

  // --- Zaproponuj kolejny eksperyment (SCIENTIFIC INTENT: PROPOSE_EXPERIMENT).
  //     Przed „otwórz", by „zaproponuj..." nie trafiło przypadkiem w nazwę zjawiska. ---
  if (has(norm, 'zaproponuj', 'kolejny eksperyment', 'nastepny eksperyment', 'co dalej', 'jaki eksperyment', 'propozycj', 'co teraz zbadac', 'zaproponuj eksperyment')) {
    return proposeExperiment(ctx);
  }

  // --- Evidence / Replay — otwiera istniejący panel dowodów bez tworzenia
  //     fikcyjnego pakietu i bez uruchamiania modelu z samej komendy.
  if (has(norm, 'evidence', 'replay', 'pakiet dowod', 'dowod i replay', 'dowody')) {
    return {
      text: 'Otwieram istniejący panel Evidence & Replay. Uruchomienie, replay i eksport są jawne; brak protokołu pozostaje PROTOCOL_REQUIRED, a brak drugiego wariantu VARIANT_REQUIRED.',
      tag: 'SYSTEM',
      intent: 'OPEN_SIMULATION',
      action: { type: 'openRoute', hash: '#/discovery-log' },
    };
  }

  // --- Pilot eksperymentu (P2.1 UI): plan -> potwierdzenie -> realny run ->
  //     Scenario Capsule -> eksport, na istniejącym Experiment Fabric. ---
  if (has(norm, 'pilot eksperymentu', 'otworz pilota', 'uruchom pilota', 'eksperyment krok po kroku', 'reprodukowalny eksperyment', 'scenario capsule', 'kapsula scenariusza')) {
    return {
      text: 'Otwieram Pilota eksperymentu: opisz albo wybierz model, zobacz jawny plan, potwierdź, uruchom istniejący silnik i pobierz odtwarzalny dowód metody (Scenario Capsule).',
      tag: 'SYSTEM',
      intent: 'OPEN_SIMULATION',
      action: { type: 'openRoute', hash: '#/pilot' },
    };
  }

  // --- Film koncepcyjny 2030 (reżyserowany przejazd po żywym silniku). ---
  if (has(norm, 'film koncepcyjny', 'koncept', 'concept film', 'pokaz wizje', 'wizja 2030', 'genesis 2030', 'concept video', 'trailer')) {
    return {
      text: 'Odtwarzam film koncepcyjny „Genesis OS 2030" — reżyserowany przejazd kamery po ŻYWEJ symulacji (agenci, kontakty, transmisja, interwencja, szpital, heatmapa). To CONCEPT / docelowa wizja, napędzana prawdziwym silnikiem — nie deklaracja gotowej funkcji.',
      tag: 'SYSTEM',
      intent: 'OPEN_SIMULATION',
      action: { type: 'openRoute', hash: '#/concept' },
    };
  }

  // --- Żywa symulacja wizualna „miasto" (Visual Scene Engine) — przed „otwórz",
  //     by trafić do sceny agentowej, a nie do modelu przedziałowego. ---
  if (has(norm, 'zywa symulacja', 'wizualna symulacja', 'symulacja wizualna', 'epidemia w miescie', 'male miasto', 'w miescie', 'pokaz miasto', 'scena', 'agenci w miescie', 'visual scene')) {
    return {
      text: 'Otwieram żywą symulację „Epidemia w małym mieście": setki agentów chodzą po mieście na żywo, a zakażenie powstaje z realnych kontaktów. Zmień R₀ lub włącz restrykcje i patrz, jak świat reaguje — wykres jest tylko skutkiem.',
      tag: 'MODEL',
      intent: 'OPEN_SIMULATION',
      action: { type: 'openRoute', hash: '#/city3d' },
    };
  }

  // --- Porównanie modeli (FAZA 1 / PRIORYTET 5) — MUSI być przed „otwórz",
  //     bo „porównaj SIR..." trafiłby w alias 'sir' i otworzył jeden model. ---
  if (has(norm, 'porownaj', 'porownanie', 'porownac', ' vs ', 'dwa modele', 'oba modele', 'model a', 'a vs b')) {
    const { a, b } = buildComparison(message);
    return {
      text: `Otwieram porównanie modeli: ${a.label} vs ${b.label}. Zobaczysz nałożone przebiegi, różnice (szczyt, łącznie zakażonych, zgony), równania i ograniczenia. To porównanie MODELU z MODELEM, nie z rzeczywistością.`,
      tag: 'MODEL',
      intent: 'COMPARE_MODELS',
      action: { type: 'compare', a, b },
    };
  }

  // --- Otwórz zjawisko (reuse generatora) — ma priorytet, gdy pada nazwa zjawiska ---
  const open = resolveQuery(message);
  const looksLikeOpen = has(norm, 'pokaz', 'stworz', 'zbuduj', 'otworz', 'uruchom', 'zasymuluj', 'symulacj', 'wyswietl', 'chce zobaczyc', 'zbadaj', 'przeanalizuj', 'model');
  if (open.best && (looksLikeOpen || !ctx)) {
    const r = open.best.recipe;
    return {
      text: `Otwieram: ${r.title}. ${r.summary}`,
      tag: 'MODEL',
      intent: 'OPEN_SIMULATION',
      action: { type: 'open', labId: r.labId, experimentId: r.experimentId, params: r.params },
    };
  }

  // --- Bez otwartej symulacji: dalsze komendy wymagają kontekstu ---
  if (!ctx) {
    if (has(norm, 'pomoc', 'help', 'co potrafisz', 'co umiesz')) return helpResponse();
    return {
      text: 'Nie mam teraz otwartej symulacji. Powiedz np. „pokaż czarną dziurę" albo „zasymuluj dylatację czasu", a potem będę mógł zmieniać parametry, wyjaśniać i tworzyć zadania.',
      tag: 'SYSTEM',
      intent: 'UNKNOWN',
    };
  }

  const recipe = recipeFor(ctx);

  // --- Równania ---
  if (has(norm, 'rownanie', 'rownania', 'wzor', 'wzory', 'equation')) {
    const eqs = recipe?.equations ?? [];
    if (eqs.length === 0) return { text: `Dla „${ctx.experimentName}" nie mam jeszcze zarejestrowanych równań w katalogu. TODO: uzupełnić metadane modelu.`, tag: 'MODEL', intent: 'SHOW_EQUATION', todo: true };
    return { text: `Równania modelu „${ctx.experimentName}":`, tag: 'MODEL', intent: 'SHOW_EQUATION', equations: eqs };
  }

  // --- Założenia / ograniczenia ---
  if (has(norm, 'zalozeni', 'ograniczeni', 'assumption', 'limit')) {
    const extra = recipe?.assumptions?.length ? ` Założenia: ${recipe.assumptions.join(' · ')}.` : '';
    return { text: `Model „${ctx.experimentName}" — poziom uczciwości: ${ctx.honesty}. ${ctx.honestyNote}${extra}`, tag: 'ZALOZENIE', intent: 'SHOW_ASSUMPTIONS' };
  }

  // --- Źródła (istnieją per-twierdzenie w Narratorze; katalog per-model to TODO) ---
  if (has(norm, 'zrodl', 'source', 'bibliograf', 'cytow')) {
    return { text: 'Źródła konkretnych twierdzeń pokazuje panel Narratora przy danej wartości. Spójny katalog źródeł per-model to TODO (Provenance dla generatora).', tag: 'SYSTEM', intent: 'EXPLAIN', todo: true };
  }

  // --- Zadanie / praca domowa / quiz (fundament, powiązane z realnym modelem) ---
  if (has(norm, 'zadanie', 'praca domowa', 'quiz', 'cwiczenie', 'zadanie dla ucznia')) {
    return taskResponse(ctx);
  }

  // --- Weryfikacja (Faza 6 — inwarianty; uczciwe TODO) ---
  if (has(norm, 'sprawdz wynik', 'zweryfikuj', 'weryfik', 'verify')) {
    return { text: 'Weryfikacja inwariantami (jednostki, zakresy, prawa zachowania) dla żywej symulacji to Faza 6 — interfejs gotowy, kontrole do podłączenia. TODO.', tag: 'SYSTEM', intent: 'VERIFY', todo: true };
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
  const isWhatIf = has(norm, 'co jesli', 'co sie stanie', 'gdyby');
  const wantsChange = has(norm, 'zwieksz', 'zmniejsz', 'zmien', 'ustaw', 'podwoj', 'obniz', 'podnie') || isWhatIf;
  if (wantsChange || (target && op)) {
    const paramIntent: ScientificIntent = isWhatIf ? 'WHAT_IF' : 'CHANGE_PARAMETER';
    if (!target) {
      const names = numericDefs.map((d) => d.label).join(', ') || 'brak regulowanych parametrów';
      return { text: `Który parametr zmienić? Dostępne w „${ctx.experimentName}": ${names}.`, tag: 'SYSTEM', intent: paramIntent };
    }
    if (target.type !== 'slider') {
      return { text: `Parametr „${target.label}" nie jest liczbowy — nie umiem go skalować. Dostępne liczbowe: ${numericDefs.map((d) => d.label).join(', ')}.`, tag: 'SYSTEM', intent: paramIntent };
    }
    const oldVal = Number(ctx.params[target.key] ?? target.default);
    const transform = op ?? ((o: number) => o * 2); // „co jeśli zwiększymy X" bez liczby → domyślnie ×2
    const newVal = clamp(transform(oldVal), target);
    if (newVal === oldVal) {
      return { text: `Parametr „${target.label}" jest już na granicy zakresu (${oldVal}${target.unit ? ' ' + target.unit : ''}) — nie mogę zmienić dalej w tę stronę.`, tag: 'WYNIK', intent: paramIntent };
    }
    const unit = target.unit ? ` ${target.unit}` : '';
    return {
      text: `Zmieniam „${target.label}": ${oldVal}${unit} → ${newVal}${unit}. Obserwuj scenę — to realny parametr silnika, nie animacja. Zapytaj „co się zmieniło?", by porównać wynik.`,
      tag: 'WYNIK',
      intent: paramIntent,
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
    text: `Nie rozpoznałem komendy w kontekście „${ctx.experimentName}". Spróbuj: „zwiększ ${numericDefs[0]?.label ?? 'parametr'} 2×", „pokaż równanie", „założenia modelu", „zrób zadanie", „porównaj modele" albo „zaproponuj kolejny eksperyment".`,
    tag: 'SYSTEM',
    intent: 'UNKNOWN',
  };
}

/**
 * PROPOSE_EXPERIMENT — deterministyczna propozycja kolejnego kroku badawczego.
 * Bez kontekstu: proponuje sensowny punkt startowy z katalogu (akcja open).
 * Z kontekstem epidemicznym: proponuje porównanie reżimów (akcja compare).
 * W innym kontekście z parametrem: proponuje konkretne „co jeśli?" na parametrze.
 */
function proposeExperiment(ctx: ChatSimSnapshot | null): ChatResponse {
  if (!ctx) {
    const r = getRecipes().find((x) => x.id === 'three-body') ?? getRecipes()[0];
    if (!r) return { text: 'Katalog jest pusty. Otwórz Generator symulacji i opisz zjawisko jednym zdaniem.', tag: 'SYSTEM', intent: 'PROPOSE_EXPERIMENT' };
    return {
      text: `Propozycja na start: „${r.title}". ${r.summary} Uruchamiam ten eksperyment — potem możesz zmieniać parametry i pytać „co się zmieniło?".`,
      tag: 'HIPOTEZA', intent: 'PROPOSE_EXPERIMENT',
      action: { type: 'open', labId: r.labId, experimentId: r.experimentId, params: r.params },
    };
  }
  // Model epidemiczny → zaproponuj porównanie reżimów R0 (realna akcja compare).
  if (ctx.labId === 'biology' && /epidem|lotnisk|airport/i.test(`${ctx.experimentId} ${ctx.experimentName}`)) {
    const { a, b } = defaultComparison();
    return {
      text: `Kolejny eksperyment: porównaj dwa reżimy — ${a.label} vs ${b.label} — i zobacz, jak R₀ przesuwa i podnosi szczyt. Otwieram panel porównania (możesz potem zmienić parametry obu modeli).`,
      tag: 'HIPOTEZA', intent: 'PROPOSE_EXPERIMENT',
      action: { type: 'compare', a, b },
    };
  }
  const slider = ctx.paramDefs.find((d) => d.type === 'slider');
  if (slider) {
    return {
      text: `Kolejny eksperyment (hipoteza do sprawdzenia): zmień „${slider.label}" i zbadaj reakcję wyniku. Np. „zwiększ ${slider.label} 2×", potem „co się zmieniło?". Chcesz zestawić dwa warianty obok siebie? Napisz „porównaj".`,
      tag: 'HIPOTEZA', intent: 'PROPOSE_EXPERIMENT',
    };
  }
  return {
    text: `„${ctx.experimentName}" nie ma regulowanego parametru liczbowego. Kolejnym krokiem może być otwarcie powiązanego zjawiska — np. „pokaż problem trzech ciał".`,
    tag: 'SYSTEM', intent: 'PROPOSE_EXPERIMENT',
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
    intent: 'EXPLAIN',
  };
}

function taskResponse(ctx: ChatSimSnapshot): ChatResponse {
  const p = ctx.paramDefs.find((d) => d.type === 'slider');
  if (!p) {
    return { text: `„${ctx.experimentName}" nie ma regulowanego parametru liczbowego, więc nie zbuduję z niego zadania obliczeniowego. Fundament generatora zadań jest gotowy — TODO: zadania jakościowe.`, tag: 'SYSTEM', intent: 'CREATE_TASK', todo: true };
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
    intent: 'CREATE_TASK',
    todo: true,
  };
}

function helpResponse(): ChatResponse {
  return {
    text:
      'Science Chat rozmawia z realnymi silnikami Genesis. Potrafię: otworzyć zjawisko („pokaż czarną dziurę"), ' +
      'zmienić parametr otwartej symulacji („zwiększ masę 2×", „co jeśli zmniejszymy prędkość?"), porównać dwa modele ' +
      '(„porównaj SIR R0=1.5 z SIR R0=3"), wyjaśnić stan („co się zmieniło?"), pokazać równania i założenia, ' +
      'zbudować zadanie oraz zaproponować kolejny eksperyment („zaproponuj eksperyment"). ' +
      'Weryfikacja inwariantami i katalog źródeł są w drodze (TODO).',
    tag: 'SYSTEM',
    intent: 'HELP',
  };
}

function round(v: number): number {
  if (!Number.isFinite(v)) return v;
  const a = Math.abs(v);
  if (a !== 0 && (a < 0.01 || a >= 1e5)) return Number(v.toPrecision(3)) as number;
  return Math.round(v * 1000) / 1000;
}
