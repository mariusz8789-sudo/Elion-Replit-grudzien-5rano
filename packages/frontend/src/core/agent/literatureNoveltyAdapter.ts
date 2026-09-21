import { fnv1a, canonicalJson } from '../events/hash';
import { makeEvidenceRef, type MatchedPriorArt, type SearchedCorpusEntry, type NoveltyOverall } from './discoveryContracts';

/**
 * PHASE F, Krok 4 — NOVELTY L5/L6: EXTERNAL LITERATURE SEARCH + RECHECK.
 *
 * NETWORK REALITY, CHECKED, NOT ASSUMED (Krok 0 audit): a direct test from
 * this interactive sandbox found `api.openalex.org`, `api.crossref.org`,
 * and even `www.ebi.ac.uk`/`clinicaltrials.gov` (which worked earlier THIS
 * SAME SESSION via a separate CI job for A1-A3) all rejected with
 * `connect_rejected` — this environment's network policy allows only
 * npm/pypi/crates/Anthropic. `makeOpenAlexClient`/`makeCrossrefClient`
 * below are REAL implementations (real endpoints, real response parsing)
 * that would work wherever that policy allows them — but in THIS sandbox
 * they will genuinely fail, and `runLiteratureLayer` maps that failure to
 * `NO_ACCESS`, never a fabricated result. This is not a workaround; it is
 * the same `NO_ACCESS_DECLARED` discipline this entire codebase already
 * uses whenever real data is genuinely unreachable.
 *
 * `LiteratureSearchClient` is the seam that makes this testable regardless
 * of network policy: tests inject a fake client implementing the same
 * interface with realistic canned data, so the aggregation/mapping logic
 * (which is the actual thing this file is responsible for) is fully
 * exercised without depending on live network access.
 *
 * `similarity` is a DISCLOSED keyword-overlap heuristic, never a claim of
 * real semantic similarity — this codebase has no embedding model, and
 * pretending otherwise would be exactly the kind of fabrication the rest
 * of Phase F refuses.
 */

export const LITERATURE_NOVELTY_ADAPTER_CONTRACT_VERSION = '1.0.0';

export interface LiteratureQuery {
  readonly text: string;
}

export interface LiteratureMatch {
  readonly id: string;
  readonly title: string;
  readonly year: number | null;
  readonly sourceUrl: string;
}

export interface LiteratureSearchClient {
  readonly name: string;
  search(query: LiteratureQuery): Promise<readonly LiteratureMatch[]>;
}

/**
 * A real OpenAlex client. Endpoint and response shape per OpenAlex's own
 * public API (`works?search=`, response `{ results: [{ id, title,
 * publication_year, doi }] }`). No API key required by that API; none used
 * here. Untestable end-to-end in this sandbox (network policy) — see
 * module doc — but the parsing logic itself is exercised by
 * `literatureNoveltyAdapter.test.ts` against injected fake HTTP responses.
 */
export function makeOpenAlexClient(fetchImpl: typeof fetch = fetch): LiteratureSearchClient {
  return {
    name: 'OpenAlex',
    async search(query: LiteratureQuery): Promise<readonly LiteratureMatch[]> {
      const url = `https://api.openalex.org/works?search=${encodeURIComponent(query.text)}&per-page=10`;
      const response = await fetchImpl(url);
      if (!response.ok) {
        throw new Error(`OpenAlex search failed: HTTP ${response.status}`);
      }
      const body = (await response.json()) as { readonly results?: readonly { readonly id: string; readonly title: string | null; readonly publication_year: number | null; readonly doi: string | null }[] };
      return (body.results ?? []).map((r) => ({
        id: r.id,
        title: r.title ?? '(untitled)',
        year: r.publication_year,
        sourceUrl: r.doi ?? r.id,
      }));
    },
  };
}

/** A real Crossref client, same discipline as `makeOpenAlexClient`. */
export function makeCrossrefClient(fetchImpl: typeof fetch = fetch): LiteratureSearchClient {
  return {
    name: 'Crossref',
    async search(query: LiteratureQuery): Promise<readonly LiteratureMatch[]> {
      const url = `https://api.crossref.org/works?query=${encodeURIComponent(query.text)}&rows=10`;
      const response = await fetchImpl(url);
      if (!response.ok) {
        throw new Error(`Crossref search failed: HTTP ${response.status}`);
      }
      const body = (await response.json()) as { readonly message?: { readonly items?: readonly { readonly DOI: string; readonly title?: readonly string[]; readonly published?: { readonly ['date-parts']?: readonly (readonly number[])[] } }[] } };
      return (body.message?.items ?? []).map((item) => ({
        id: item.DOI,
        title: item.title?.[0] ?? '(untitled)',
        year: item.published?.['date-parts']?.[0]?.[0] ?? null,
        sourceUrl: `https://doi.org/${item.DOI}`,
      }));
    },
  };
}

/** A disclosed keyword-overlap heuristic — the fraction of the query's own significant words that appear in the candidate title. Never a claim of semantic understanding. */
export function keywordOverlapSimilarity(queryText: string, title: string): number {
  const words = (s: string): readonly string[] => s.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const queryWords = new Set(words(queryText));
  if (queryWords.size === 0) return 0;
  const titleWords = new Set(words(title));
  let hits = 0;
  for (const w of queryWords) if (titleWords.has(w)) hits += 1;
  return hits / queryWords.size;
}

export type LiteratureLayerResult =
  | { readonly status: 'OK'; readonly matches: readonly MatchedPriorArt[]; readonly corpusEntry: SearchedCorpusEntry }
  | { readonly status: 'NO_ACCESS'; readonly reason: string; readonly corpusEntry: SearchedCorpusEntry };

/**
 * Tries every declared client; NO_ACCESS only when ALL of them fail — a
 * partial result (some clients reachable, some not) is still real evidence
 * and reported as `OK` with whatever was actually found, never silently
 * downgraded because one source among several was unreachable.
 */
export async function runLiteratureLayer(clients: readonly LiteratureSearchClient[], query: LiteratureQuery, layerName: 'L5' | 'L6'): Promise<LiteratureLayerResult> {
  const timestamp = new Date().toISOString();
  const queryFingerprint = fnv1a(canonicalJson({ text: query.text }));
  const failures: string[] = [];
  const allMatches: MatchedPriorArt[] = [];

  for (const client of clients) {
    try {
      const results = await client.search(query);
      for (const r of results) {
        allMatches.push({
          ref: makeEvidenceRef(r.id, `literature:${client.name}`, r.title),
          similarity: keywordOverlapSimilarity(query.text, r.title),
          matchedClaim: r.title,
        });
      }
    } catch (err) {
      failures.push(`${client.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const corpusEntry: SearchedCorpusEntry = {
    name: `${layerName}:${clients.map((c) => c.name).join('+') || '(no clients declared)'}`,
    version: '1',
    timestamp,
    queryFingerprint,
    coverageEstimate: failures.length === clients.length
      ? 'none reached'
      : failures.length > 0
        ? `partial (${clients.length - failures.length}/${clients.length} sources reached)`
        : `full (${clients.length}/${clients.length} sources reached)`,
  };

  if (clients.length === 0 || failures.length === clients.length) {
    return {
      status: 'NO_ACCESS',
      reason: clients.length === 0
        ? `No literature search clients were declared for ${layerName}.`
        : `All ${clients.length} declared client(s) failed: ${failures.join('; ')}`,
      corpusEntry,
    };
  }

  return { status: 'OK', matches: allMatches, corpusEntry };
}

/** Maps a layer result to the `NoveltyOverall` vocabulary `discoveryContracts.ts` expects, at a caller-declared similarity threshold above which a match counts as "known". */
export function overallFromLiteratureLayer(result: LiteratureLayerResult, matchThreshold: number): NoveltyOverall {
  if (result.status === 'NO_ACCESS') return 'NO_ACCESS';
  const strongMatch = result.matches.some((m) => m.similarity >= matchThreshold);
  return strongMatch ? 'KNOWN' : 'NO_KNOWN_PRIOR_FOUND';
}
