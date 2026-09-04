import type { NarrationBlock, ParamDef, SimParams } from './types';
import type { RunSample } from './experimentRun';
import type { ExperimentResult } from './experimentFabric/types';

/**
 * Warstwa 0 dla trybu "Stwórz eksperyment" — dokładnie ta sama filozofia co
 * narrator/engine.ts: deterministyczna, offline, zero halucynacji. Zamiast
 * czytać JEDEN aktualny stan symulacji, czyta CAŁY nagrany przebieg
 * (RunSample[]) i wyciąga z niego trend, płaskość, skoki i korelacje —
 * to jest właściwe miejsce na "AI wykrywa niespójności", bo to prawdziwa
 * analiza danych, nie zgadywanie modelu językowego. Warstwa LLM (opcjonalna,
 * przez istniejący NarratorPanel/askAI) dostaje te bloki jako kontekst i
 * może je rozwinąć — nie zastępuje ich.
 */

export interface StatTrend {
  key: string;
  min: number;
  max: number;
  mean: number;
  trend: 'rising' | 'falling' | 'stable';
  /** Odchylenie standardowe względem |średniej| — 0 = stała wartość. */
  relativeVariance: number;
}

function linregSlope(times: number[], values: number[]): number {
  const n = values.length;
  const xMean = times.reduce((a, b) => a + b, 0) / n;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (times[i] - xMean) * (values[i] - yMean);
    den += (times[i] - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function analyzeTrend(samples: RunSample[], key: string): StatTrend | null {
  const pairs = samples
    .filter((sample) => Number.isFinite(sample.t) && Number.isFinite(sample.stats[key]))
    .map((sample) => ({ t: sample.t, value: sample.stats[key] }));
  if (pairs.length < 2) return null;
  const values = pairs.map((pair) => pair.value);
  const times = pairs.map((pair) => pair.t);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const range = max - min;
  const timeSpan = Math.max(...times) - Math.min(...times);
  const slope = linregSlope(times, values);
  const normalizedSlope = range === 0 ? 0 : (slope * timeSpan) / range;
  const trend: StatTrend['trend'] = normalizedSlope > 0.15 ? 'rising' : normalizedSlope < -0.15 ? 'falling' : 'stable';
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const relativeVariance = mean !== 0 ? Math.sqrt(variance) / Math.abs(mean) : Math.sqrt(variance);
  return { key, min, max, mean, trend, relativeVariance };
}

/** Współczynnik korelacji Pearsona dwóch serii równej długości. */
function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const meanA = a.reduce((x, y) => x + y, 0) / n;
  const meanB = b.reduce((x, y) => x + y, 0) / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - meanA) * (b[i] - meanB);
    denA += (a[i] - meanA) ** 2;
    denB += (b[i] - meanB) ** 2;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}

/** Największy względny skok między kolejnymi próbkami — sygnał zmiany parametru w trakcie nagrywania lub niestabilności modelu. */
function largestJump(samples: RunSample[], key: string): number {
  const values = samples.map((sample) => sample.stats[key]);
  const finite = values.filter((value): value is number => Number.isFinite(value));
  if (finite.length < 2) return 0;
  const range = Math.max(...finite) - Math.min(...finite);
  if (range === 0) return 0;
  let maxJump = 0;
  for (let i = 1; i < values.length; i++) {
    const previous = values[i - 1];
    const current = values[i];
    if (!Number.isFinite(previous) || !Number.isFinite(current)) continue;
    maxJump = Math.max(maxJump, Math.abs(current - previous) / range);
  }
  return maxJump;
}

/** Zestawienie dostępnych parametrów, ich zakresów i wartości użytych w tym przebiegu — kontekst dla człowieka i dla LLM przy sugerowaniu następnego testu. */
export function paramRangeSummary(defs: ParamDef[], params: SimParams): NarrationBlock {
  const lines = defs.map((d) => {
    const v = params[d.key];
    if (d.type === 'slider') {
      return `${d.label}: ${v} (zakres ${d.min}–${d.max}${d.unit ? ' ' + d.unit : ''})`;
    }
    if (d.type === 'toggle') return `${d.label}: ${v ? 'włączone' : 'wyłączone'}`;
    return `${d.label}: ${v}`;
  });
  return {
    title: 'Parametry tego przebiegu',
    body: lines.join(' · '),
  };
}

/**
 * Główna analiza nagranego przebiegu. Zwraca bloki w formacie NarrationBlock
 * (ten sam typ co narrator/engine.ts) — więc NarratorPanel i cały pipeline
 * "Zapytaj AI" (buildContext → askAI → backend grounding) działają bez
 * żadnych zmian.
 */
/**
 * Analiza pojedynczego canonical Fabric result. Nie wyprowadza trendu ani
 * związku przyczynowego: opisuje wyłącznie rzeczywisty zakres outputs i jasno
 * oznacza, że do analizy czasowej potrzebne są prerejestrowane powtórzenia.
 */
export function analyzeExperimentResult(result: ExperimentResult): NarrationBlock[] {
  if (result.status !== 'completed') {
    return [{ title: 'Analiza zablokowana', body: `Wynik ma status ${result.status}; nie analizuję go jako pomiaru.`, kind: 'warning' }];
  }
  const entries = Object.entries(result.outputs);
  const numeric = entries.filter(([, value]) => typeof value === 'number');
  const series = entries.filter(([, value]) => Array.isArray(value));
  if (entries.length === 0) {
    return [{ title: 'Brak obserwowalnych outputs', body: 'Canonical result nie zawiera outputs do analizy.', kind: 'warning' }];
  }
  return [{
    title: 'Analiza pojedynczego wyniku',
    body: `Zarejestrowano ${entries.length} outputs: ${numeric.length} skalarnych i ${series.length} seryjnych. To opis jednego realnego wyniku; nie wyznaczono trendu ani korelacji. Do takiej analizy potrzebne są prerejestrowane powtórzenia.`,
    kind: 'insight',
  }];
}

export function analyzeRun(samples: RunSample[]): NarrationBlock[] {
  if (samples.length < 3) {
    return [
      {
        title: 'Za mało danych do analizy',
        body: 'Nagraj co najmniej kilka sekund przebiegu — analiza potrzebuje minimum 3 próbek, żeby ocenić trend.',
      },
    ];
  }

  const keys = [...new Set(samples.flatMap((sample) => Object.keys(sample.stats)))];
  const blocks: NarrationBlock[] = [];
  if (keys.length === 0) {
    return [{
      title: 'Brak obserwowalnych wielkości',
      body: 'Przebieg nie zawiera żadnej statystyki do analizy. Nie można uczciwie wnioskować o trendzie ani stabilizacji modelu.',
      kind: 'warning',
    }];
  }

  // Niespójność #1: wartości nieskończone/NaN w przebiegu (nie powinny się zdarzyć —
  // sim.getStats() jest testowane pod tym kątem w sims.test.ts, ale to prawdziwa
  // kontrola, nie założenie).
  const nonFiniteKeys = keys.filter((k) => samples.some((s) => s.stats[k] !== undefined && !Number.isFinite(s.stats[k])));
  if (nonFiniteKeys.length > 0) {
    blocks.push({
      title: 'Niespójność: wartości nieskończone',
      body: `Statystyki ${nonFiniteKeys.join(', ')} przyjęły w trakcie przebiegu wartość NaN lub nieskończoną — to sygnał błędu modelu przy tej kombinacji parametrów, nie normalny wynik fizyczny. Zgłoś to jako błąd, jeśli się powtarza.`,
      kind: 'warning',
    });
  }

  const missingKeys = keys.filter((k) => samples.some((s) => s.stats[k] === undefined));
  if (missingKeys.length > 0) {
    blocks.push({
      title: 'Niespójność: niepełna seria obserwacji',
      body: `Statystyki ${missingKeys.join(', ')} nie występują w każdej próbce. Trendy liczone z niepełnej serii są częściowe i nie powinny być traktowane jako pełny przebieg; sprawdź źródło próbek przed porównaniem modeli.`,
      kind: 'warning',
    });
  }

  const trends = keys.map((k) => analyzeTrend(samples, k)).filter((t): t is StatTrend => t !== null);

  // Niespójność #2: przebieg całkowicie płaski — nic się nie zmieniło.
  const allFlat = trends.length > 0 && trends.every((t) => t.trend === 'stable' && t.relativeVariance < 0.01);
  if (allFlat) {
    blocks.push({
      title: 'Przebieg jest płaski',
      body: `Żadna z obserwowanych wielkości (${trends.map((t) => t.key).join(', ')}) nie zmieniła się istotnie w czasie nagrywania. To częsty sygnał metodologiczny — parametry mogą być ustawione w punkcie, gdzie model nie pokazuje nic ciekawego. Spróbuj wyraźnie zmienić jeden parametr o dużą wartość i nagrać ponownie.`,
      kind: 'warning',
    });
  }

  // Trendy — pokazuj tylko te, które faktycznie się ruszają (max 4, żeby nie zasypać).
  const dynamic = trends.filter((t) => t.trend !== 'stable').sort((a, b) => b.relativeVariance - a.relativeVariance).slice(0, 4);
  for (const t of dynamic) {
    blocks.push({
      title: `${t.key}: ${t.trend === 'rising' ? 'rośnie' : 'maleje'} w czasie nagrywania`,
      body: `Zakres ${formatNum(t.min)}–${formatNum(t.max)}, średnia ${formatNum(t.mean)} na podstawie ${samples.length} próbek.`,
    });
  }

  // Niespójność #3: skokowa zmiana (możliwa zmiana parametru w trakcie nagrywania).
  for (const t of trends) {
    const jump = largestJump(samples, t.key);
    if (jump > 0.6) {
      blocks.push({
        title: `Skokowa zmiana w ${t.key}`,
        body: 'Ta wielkość zmieniła się gwałtownie między dwiema kolejnymi próbkami zamiast płynnie — jeśli zmieniłeś suwak w trakcie nagrywania, to normalne; jeśli nie, to warto powtórzyć przebieg i sprawdzić, czy się powtarza.',
      });
    }
  }

  // Hipoteza: dwie wielkości poruszające się razem — obserwacja korelacji, nie przyczynowości.
  if (dynamic.length >= 2) {
    const [a, b] = dynamic;
    const paired = samples
      .map((sample) => ({ a: sample.stats[a.key], b: sample.stats[b.key] }))
      .filter((pair): pair is { a: number; b: number } => Number.isFinite(pair.a) && Number.isFinite(pair.b));
    const va = paired.map((pair) => pair.a);
    const vb = paired.map((pair) => pair.b);
    if (va.length === vb.length && va.length >= 2) {
      const r = pearson(va, vb);
      if (Math.abs(r) > 0.7) {
        blocks.push({
          title: `Hipoteza: ${a.key} i ${b.key} są ze sobą powiązane`,
          body: `Współczynnik korelacji Pearsona r=${r.toFixed(2)} w tym przebiegu. To obserwacja, nie dowód związku przyczynowego — następny test: zmień tylko JEDEN parametr na raz i sprawdź, czy korelacja się utrzymuje.`,
          kind: 'hypothesis',
        });
      }
    }
  }

  if (blocks.length === 0) {
    blocks.push({
      title: 'Przebieg ustabilizowany',
      body: 'Obserwowane wielkości wahają się wokół stałych wartości bez wyraźnego trendu — model osiągnął stan ustalony przy tych parametrach.',
    });
  }

  return blocks;
}

function formatNum(v: number): string {
  if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(2);
  return v.toFixed(v % 1 === 0 ? 0 : 3);
}
