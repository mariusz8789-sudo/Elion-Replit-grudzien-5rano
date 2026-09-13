import { describe, expect, it } from 'vitest';
import {
  makeOpenAlexClient,
  makeCrossrefClient,
  runLiteratureLayer,
  overallFromLiteratureLayer,
  keywordOverlapSimilarity,
  type LiteratureSearchClient,
} from '../core/agent/literatureNoveltyAdapter';

/** A fake OpenAlex HTTP response, shaped exactly like the real API. */
function fakeOpenAlexFetch(matchQuery: boolean): typeof fetch {
  return (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        results: matchQuery
          ? [{ id: 'https://openalex.org/W123', title: 'Orbital period and semi-major axis relation', publication_year: 1619, doi: 'https://doi.org/10.1/kepler' }]
          : [],
      }),
    }) as unknown as Response) as unknown as typeof fetch;
}

describe('makeOpenAlexClient / makeCrossrefClient — parsing logic against injected fake HTTP', () => {
  it('OpenAlex client parses a real-shaped response into LiteratureMatch[]', async () => {
    const client = makeOpenAlexClient(fakeOpenAlexFetch(true));
    const matches = await client.search({ text: 'orbital period semi-major axis' });
    expect(matches.length).toBe(1);
    expect(matches[0]!.title).toBe('Orbital period and semi-major axis relation');
    expect(matches[0]!.year).toBe(1619);
  });

  it('OpenAlex client returns an empty array for a genuinely novel query', async () => {
    const client = makeOpenAlexClient(fakeOpenAlexFetch(false));
    const matches = await client.search({ text: 'a genuinely unprecedented claim' });
    expect(matches).toEqual([]);
  });

  it('OpenAlex client throws on a non-ok HTTP status, never fabricates a result', async () => {
    const failFetch = (async () => ({ ok: false, status: 500 }) as unknown as Response) as unknown as typeof fetch;
    const client = makeOpenAlexClient(failFetch);
    await expect(client.search({ text: 'x' })).rejects.toThrow();
  });

  it('Crossref client parses a real-shaped response', async () => {
    const crossrefFetch = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ message: { items: [{ DOI: '10.1/x', title: ['A prior finding'], published: { 'date-parts': [[2020]] } }] } }),
      }) as unknown as Response) as unknown as typeof fetch;
    const client = makeCrossrefClient(crossrefFetch);
    const matches = await client.search({ text: 'x' });
    expect(matches.length).toBe(1);
    expect(matches[0]!.title).toBe('A prior finding');
    expect(matches[0]!.year).toBe(2020);
  });
});

describe('keywordOverlapSimilarity — a disclosed heuristic, never a semantic claim', () => {
  it('scores 1.0 when every significant query word appears in the title', () => {
    expect(keywordOverlapSimilarity('orbital period axis', 'The orbital period and semi-major axis relation')).toBeCloseTo(1, 5);
  });
  it('scores 0 for completely unrelated text', () => {
    expect(keywordOverlapSimilarity('orbital period axis', 'unrelated topic entirely')).toBe(0);
  });
});

describe('runLiteratureLayer — honest aggregation across multiple sources', () => {
  it('a working client with a real match -> status OK, full coverage', async () => {
    const client = makeOpenAlexClient(fakeOpenAlexFetch(true));
    const result = await runLiteratureLayer([client], { text: 'orbital period axis' }, 'L5');
    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.matches.length).toBe(1);
      expect(result.corpusEntry.coverageEstimate).toContain('full');
    }
  });

  it('a mix of one working and one failing client -> status OK, PARTIAL coverage reported honestly', async () => {
    const working = makeOpenAlexClient(fakeOpenAlexFetch(false));
    const failing: LiteratureSearchClient = { name: 'Broken', search: async () => { throw new Error('simulated failure'); } };
    const result = await runLiteratureLayer([working, failing], { text: 'x' }, 'L5');
    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.corpusEntry.coverageEstimate).toContain('partial');
      expect(result.corpusEntry.coverageEstimate).toContain('1/2');
    }
  });

  it('ALL clients failing -> NO_ACCESS, never a fabricated OK', async () => {
    const failing: LiteratureSearchClient = { name: 'Broken', search: async () => { throw new Error('simulated failure'); } };
    const result = await runLiteratureLayer([failing, failing], { text: 'x' }, 'L6');
    expect(result.status).toBe('NO_ACCESS');
  });

  it('zero clients declared -> NO_ACCESS', async () => {
    const result = await runLiteratureLayer([], { text: 'x' }, 'L5');
    expect(result.status).toBe('NO_ACCESS');
  });
});

describe('overallFromLiteratureLayer', () => {
  it('a strong match (above threshold) -> KNOWN', async () => {
    const client = makeOpenAlexClient(fakeOpenAlexFetch(true));
    const result = await runLiteratureLayer([client], { text: 'orbital period axis' }, 'L5');
    expect(overallFromLiteratureLayer(result, 0.5)).toBe('KNOWN');
  });

  it('no matches -> NO_KNOWN_PRIOR_FOUND', async () => {
    const client = makeOpenAlexClient(fakeOpenAlexFetch(false));
    const result = await runLiteratureLayer([client], { text: 'x' }, 'L5');
    expect(overallFromLiteratureLayer(result, 0.5)).toBe('NO_KNOWN_PRIOR_FOUND');
  });

  it('NO_ACCESS passes through unchanged', async () => {
    const result = await runLiteratureLayer([], { text: 'x' }, 'L5');
    expect(overallFromLiteratureLayer(result, 0.5)).toBe('NO_ACCESS');
  });
});

describe('environment reality — the REAL client, against the REAL global fetch, in THIS sandbox', () => {
  it('makeOpenAlexClient() with no injected fetch genuinely fails against the live network here, and runLiteratureLayer reports NO_ACCESS end-to-end', async () => {
    const realClient = makeOpenAlexClient();
    const result = await runLiteratureLayer([realClient], { text: 'orbital period semi-major axis' }, 'L5');
    // This is not a mock assertion — it is the Krok 0 network finding,
    // re-verified programmatically: this sandbox's network policy blocks
    // OpenAlex, so the real client genuinely cannot reach it.
    expect(result.status).toBe('NO_ACCESS');
  }, 15000);
});
