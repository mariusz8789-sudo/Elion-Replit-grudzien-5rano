import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DISCOVERY_QUESTION_PHRASINGS,
  discoveryQuestionCatalog,
  hasDiscoveryLoopMarker,
  hasDiscoveryReplayMarker,
  isDiscoveryLoopRequest,
  resolveDiscoveryQuestion,
} from '../core/scienceChat/discoveryQuestions';
import { HYPOTHESIS_PROBLEMS } from '../core/experimentFabric/hypothesisLoop';
import { parseScienceChatMessage } from '../core/experimentFabric/parser';
import { resolveCommand } from '../core/scienceChat/resolveCommand';
import { _resetRecipes } from '../core/generator/recipe';
import { registerCatalog } from '../core/generator/catalog';

/** The repo's standard in-memory localStorage double — `core/storage.ts` is a silent no-op without one. */
function makeFakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, v); },
  } as Storage;
}

/**
 * CHAT ENTRY FOR THE SCIENTIFIC DISCOVERY LOOP.
 *
 * Everything here tests the ROUTING, which is all `discoveryQuestions.ts` does:
 * that a question reaches the right declared problem, that a question outside
 * the catalog reaches no executor at all, and that the one place this had to
 * interact with an existing interceptor (`parser.ts`) behaves as claimed. The
 * loop itself is tested where it lives (`hypothesisLoop`/`scientificDiscoveryLoop`
 * suites) — nothing is re-tested or re-implemented here.
 */

describe('resolveDiscoveryQuestion — literal matching against the real declared catalog', () => {
  it('offers exactly the problems HYPOTHESIS_PROBLEMS declares, never a hand-kept second list', () => {
    const catalog = discoveryQuestionCatalog();
    expect(catalog.map((entry) => entry.problemId)).toEqual(HYPOTHESIS_PROBLEMS.map((problem) => problem.problemId));
  });

  it('resolves every declared problem from its own verbatim statement — including one added later', () => {
    for (const problem of HYPOTHESIS_PROBLEMS) {
      const resolution = resolveDiscoveryQuestion(problem.statement);
      expect(resolution.status).toBe('GOVERNED');
      expect(resolution.problem?.problemId).toBe(problem.problemId);
    }
  });

  it('resolves every declared problem from its own problemId', () => {
    for (const problem of HYPOTHESIS_PROBLEMS) {
      expect(resolveDiscoveryQuestion(problem.problemId).problem?.problemId).toBe(problem.problemId);
    }
  });

  it('every declared problem has at least one phrasing — a question nobody can reach from chat is the defect this guards', () => {
    for (const problem of HYPOTHESIS_PROBLEMS) {
      const phrasings = DISCOVERY_QUESTION_PHRASINGS[problem.problemId];
      expect(phrasings, `no chat phrasings declared for ${problem.problemId}`).toBeDefined();
      expect(phrasings!.length).toBeGreaterThan(0);
    }
  });

  it('every declared phrasing actually resolves to the problem it is declared under — no dead or misrouted phrasing', () => {
    for (const [problemId, phrasings] of Object.entries(DISCOVERY_QUESTION_PHRASINGS)) {
      for (const phrase of phrasings) {
        const resolution = resolveDiscoveryQuestion(phrase);
        expect(resolution.status, `"${phrase}" did not resolve at all`).toBe('GOVERNED');
        expect(resolution.problem?.problemId, `"${phrase}" is declared under ${problemId} but resolved elsewhere`).toBe(problemId);
      }
    }
  });

  it('matches without diacritics, because it folds text with Genesis\'s own normalize', () => {
    expect(resolveDiscoveryQuestion('jak pozno mozna wprowadzic izolacje').problem?.problemId).toBe('problem:intervention-timing');
    expect(resolveDiscoveryQuestion('jak późno można wprowadzić izolację').problem?.problemId).toBe('problem:intervention-timing');
  });

  it('refuses a question outside the catalog — and shows the real catalog instead of failing silently', () => {
    const resolution = resolveDiscoveryQuestion('czy kawa powoduje deszcz w Krakowie');
    expect(resolution.status).toBe('NOT_AVAILABLE');
    expect(resolution.problem).toBeNull();
    expect(resolution.available).toHaveLength(HYPOTHESIS_PROBLEMS.length);
    expect(resolution.reason).toContain('zadeklarowanej powierzchni modelu');
  });

  it('records the question verbatim rather than a paraphrase of it', () => {
    const asked = '  Jak późno można wprowadzić izolację?  ';
    expect(resolveDiscoveryQuestion(asked).askedText).toBe(asked.trim());
  });

  it('is deterministic: the same question always produces the same fingerprint, and different ones differ', () => {
    const a = resolveDiscoveryQuestion('jak pozno mozna wprowadzic izolacje');
    const b = resolveDiscoveryQuestion('jak pozno mozna wprowadzic izolacje');
    expect(a.resolutionFingerprint).toBe(b.resolutionFingerprint);
    expect(resolveDiscoveryQuestion('rdkit').resolutionFingerprint).not.toBe(a.resolutionFingerprint);
  });
});

describe('the Fabric single-experiment planner steps aside only for an explicit, in-catalog loop request', () => {
  /**
   * The real reason this module needs markers at all: `parseScienceChatMessage`
   * already claims the DOMAIN of most declared questions, and `ScienceChat.tsx`
   * plans a single Fabric experiment for those before `resolveCommand` runs.
   * This asserts that collision is real rather than assumed — if the parser
   * ever stops claiming these, the narrow bypass can be removed.
   */
  it('the collision is real: the bare question IS claimed by the Fabric parser', () => {
    const parsed = parseScienceChatMessage('jak pozno mozna wprowadzic izolacje');
    expect(parsed.modelId !== undefined || parsed.domainId !== 'unknown').toBe(true);
  });

  it('an explicit loop request on a declared question takes the loop path', () => {
    expect(isDiscoveryLoopRequest('zbadaj: jak późno można wprowadzić izolację')).toBe(true);
  });

  it('a loop marker on a question OUTSIDE the catalog does NOT hijack the existing Fabric behaviour', () => {
    expect(hasDiscoveryLoopMarker('zbadaj wpływ temperatury na lepkość oleju')).toBe(true);
    expect(isDiscoveryLoopRequest('zbadaj wpływ temperatury na lepkość oleju')).toBe(false);
  });

  it('a declared question WITHOUT a loop marker does not take the loop path', () => {
    expect(isDiscoveryLoopRequest('jak późno można wprowadzić izolację')).toBe(false);
  });

  it('run and replay markers are distinct — "odtwórz pętlę" is not a request to run a new one', () => {
    expect(hasDiscoveryReplayMarker('odtwórz pętlę')).toBe(true);
    expect(hasDiscoveryLoopMarker('odtwórz pętlę')).toBe(false);
  });
});

describe('resolveCommand: the one router returns the loop action, and refuses honestly', () => {
  // Same setup the existing scienceChat suite uses — the router resolves real
  // phenomena through the real catalog, so the catalog has to be registered.
  beforeEach(() => { _resetRecipes(); registerCatalog(); });

  it('returns runDiscoveryLoop with the resolved problemId — never with a guessed one', () => {
    const res = resolveCommand('zbadaj: jak późno można wprowadzić izolację', null);
    expect(res.action).toEqual({ type: 'runDiscoveryLoop', problemId: 'problem:intervention-timing' });
    expect(res.text).toContain('problem:intervention-timing');
  });

  it('an out-of-catalog loop request returns NO action at all — nothing is executed on a question Genesis cannot answer', () => {
    const res = resolveCommand('postaw konkurencyjne hipotezy o pogodzie w Krakowie', null);
    expect(res.action).toBeUndefined();
    for (const problem of HYPOTHESIS_PROBLEMS) expect(res.text).toContain(problem.statement);
  });

  it('returns replayDiscoveryLoop for a replay request', () => {
    expect(resolveCommand('odtwórz pętlę odkrycia', null).action).toEqual({ type: 'replayDiscoveryLoop' });
  });

  it('every declared problem is reachable end-to-end through the real router, not only through the resolver', () => {
    for (const problem of HYPOTHESIS_PROBLEMS) {
      const res = resolveCommand(`zbadaj: ${problem.statement}`, null);
      expect(res.action, `${problem.problemId} is unreachable from chat`).toEqual({ type: 'runDiscoveryLoop', problemId: problem.problemId });
    }
  });

  it('does not swallow the existing cyber and decipherment intents', () => {
    expect(resolveCommand('dochodzenie bezpieczeństwa', null).action).toEqual({ type: 'runCyber' });
    expect(resolveCommand('deszyfracja: DWWDFNDWGDZQ', null).action?.type).toBe('runDecipherment');
  });
});

/**
 * REGRESSION, found by the existing suite rather than by inspection.
 *
 * `zbadaj` is an ordinary Polish verb that older intents already owned. The
 * first version of this block matched it unconditionally and swallowed
 * "Zbadaj problem trzech ciał", which had opened the Universe lab since long
 * before the discovery loop had a chat entry. A generic verb now routes to the
 * loop only when the question itself is one Genesis declares.
 */
describe('generic research verbs do not swallow the intents that already owned them', () => {
  beforeEach(() => { _resetRecipes(); registerCatalog(); });

  it('"Zbadaj problem trzech ciał" still opens the Universe lab', () => {
    const res = resolveCommand('Zbadaj problem trzech ciał', null);
    expect(res.action?.type).toBe('open');
  });

  it('an EXPLICIT loop request on an unknown question still refuses honestly, with the catalog', () => {
    const res = resolveCommand('uruchom pętlę odkrycia dla pogody w Krakowie', null);
    expect(res.action).toBeUndefined();
    expect(res.text).toContain('Nie uruchamiam pętli');
    for (const problem of HYPOTHESIS_PROBLEMS) expect(res.text).toContain(problem.statement);
  });
});

/**
 * THE SIGNAL THAT MAKES THE LAST ARROW VISIBLE WITHOUT A RELOAD.
 *
 * Found in a real browser run: "zapisz" reported a successful save while the
 * Next Question card beside it still read "Pamięć Naukowa jest pusta", because
 * every Memory reader loaded once at mount. That was invisible while writers
 * lived on screens you navigated away from; chat entry puts writer and reader
 * on the same screen at the same moment.
 */
describe('Science Memory announces its own writes', () => {
  it('fires on a real save and on a real delete, and stops after unsubscribe', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { subscribeScienceMemoryChanges } = await import('../core/scienceMemoryEvents');
    const { saveExperiment, deleteExperiment } = await import('../core/scienceMemory');

    let fired = 0;
    const unsubscribe = subscribeScienceMemoryChanges(() => { fired += 1; });

    const saved = saveExperiment({
      labId: 'lab-1', experimentId: 'e-1', experimentName: 'Test', params: {}, stats: {},
      honesty: 'simplified', honestyNote: 'test fixture',
    });
    expect(fired).toBe(1);

    deleteExperiment(saved.id);
    expect(fired).toBe(2);

    unsubscribe();
    saveExperiment({
      labId: 'lab-1', experimentId: 'e-2', experimentName: 'Test 2', params: {}, stats: {},
      honesty: 'simplified', honestyNote: 'test fixture',
    });
    expect(fired).toBe(2);

    vi.unstubAllGlobals();
  });

  it('a discovery loop saved through the real helper also announces itself — the chat path, not just saveExperiment', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { subscribeScienceMemoryChanges } = await import('../core/scienceMemoryEvents');
    const { saveScientificDiscoveryLoopToMemory } = await import('../core/scienceMemory');
    const { runScientificDiscoveryLoop } = await import('../core/experimentFabric/scientificDiscoveryLoop');

    let fired = 0;
    const unsubscribe = subscribeScienceMemoryChanges(() => { fired += 1; });
    saveScientificDiscoveryLoopToMemory(runScientificDiscoveryLoop('problem:intervention-timing'));
    expect(fired).toBe(1);
    unsubscribe();
    vi.unstubAllGlobals();
  });
});
