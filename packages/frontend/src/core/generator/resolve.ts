import { getRecipes, type SimulationRecipe } from './recipe';

/**
 * Deterministyczny resolver „język naturalny → przepis symulacji". Działa w
 * pełni offline i jest testowalny (żadnego LLM w tej ścieżce). Warstwa LLM
 * może później dokładać dopasowanie fuzzy, ale NIGDY nie jest jedynym źródłem —
 * uczciwość i powtarzalność wymagają ścieżki, która zawsze daje ten sam wynik.
 */

/** Normalizacja: małe litery, usunięcie polskich diakrytyków, redukcja do słów. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // znaki diakrytyczne łączące
    .replace(/ł/g, 'l') // ł nie rozkłada się przez NFD
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean);
}

export interface ResolveMatch {
  recipe: SimulationRecipe;
  score: number;
  /** Które aliasy trafiły (do wyjaśnienia „dlaczego to dopasowanie"). */
  matched: string[];
}

export interface ResolveResult {
  query: string;
  best: ResolveMatch | null;
  alternatives: ResolveMatch[];
}

/**
 * Punktacja: dla każdego przepisu sumujemy trafienia jego aliasów w zapytaniu.
 * Alias wielosłowowy (fraza) liczony jako trafienie tylko gdy cała fraza
 * występuje w znormalizowanym zapytaniu i waży więcej niż pojedyncze słowo
 * (specyficzność) — „masa gwiazdy" bije samo „masa".
 */
export function resolveQuery(query: string): ResolveResult {
  const norm = ` ${normalize(query)} `;
  const queryTokens = new Set(tokenize(query));

  const matches: ResolveMatch[] = [];
  for (const recipe of getRecipes()) {
    let score = 0;
    const matched: string[] = [];
    for (const aliasRaw of recipe.aliases) {
      const alias = normalize(aliasRaw);
      if (!alias) continue;
      const aliasWords = alias.split(' ');
      if (aliasWords.length > 1) {
        // Fraza: musi wystąpić w całości; waga = liczba słów (specyficzność).
        if (norm.includes(` ${alias} `)) {
          score += aliasWords.length;
          matched.push(aliasRaw);
        }
      } else if (queryTokens.has(alias)) {
        score += 1;
        matched.push(aliasRaw);
      }
    }
    if (score > 0) matches.push({ recipe, score, matched });
  }

  matches.sort((a, b) => b.score - a.score || a.recipe.title.localeCompare(b.recipe.title));
  return {
    query,
    best: matches[0] ?? null,
    alternatives: matches.slice(1, 4),
  };
}
