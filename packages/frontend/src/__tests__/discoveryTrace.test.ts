import { afterEach, describe, expect, it, vi } from 'vitest';

import { traceResearchChain, traceShape, type TraceEntry } from '../core/agent/discoveryTrace';
import type { ResearchChainResult } from '../core/agent/researchChain';

/**
 * A TRACE IS ONLY WORTH ANYTHING IF ITS SOURCES CHECK OUT.
 *
 * Any function can emit a tidy QUESTION → HYPOTHESIS → PREDICTION → … sequence
 * by composing sentences, and it would be indistinguishable from an honest
 * record. So this test does not check that the trace LOOKS right — it walks the
 * `source` path of every entry into the real chain result and compares the
 * value found there against the one the entry reports.
 */

function makeFakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

/**
 * Walks a `source` path like `steps[0].outcome.run.native.rounds[1].observed`
 * against the real object. Returns a sentinel for paths this walker does not
 * handle, which the test treats as a failure rather than a pass.
 */
const UNWALKABLE = Symbol('unwalkable');

function walk(root: unknown, path: string): unknown {
  // The one entry kind whose source is a function call rather than a path.
  if (path.startsWith('selectNextResearchQuestion(')) return UNWALKABLE;
  let current: unknown = root;
  for (const token of path.split('.')) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)((?:\[\d+\])*)$/.exec(token);
    if (match === null) return UNWALKABLE;
    if (current === null || typeof current !== 'object') return UNWALKABLE;
    current = (current as Record<string, unknown>)[match[1]!];
    for (const index of match[2]!.matchAll(/\[(\d+)\]/g)) {
      if (!Array.isArray(current)) return UNWALKABLE;
      current = current[Number(index[1])];
    }
  }
  return current;
}

async function chainAt(truth: number): Promise<ResearchChainResult> {
  vi.stubGlobal('window', { localStorage: makeFakeStorage() });
  const { runResearchChain } = await import('../core/agent/researchChain');
  const { proteinFoldingInquiry } = await import('../core/agent/proteinFoldingInquiry');
  return runResearchChain(proteinFoldingInquiry(truth), 4);
}

describe('discoveryTrace — every element sourced from real system state', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('THE DEFINING CHECK: every entry\'s source path really holds the value it reports', async () => {
    const chain = await chainAt(0.5);
    const entries = traceResearchChain(chain);
    expect(entries.length).toBeGreaterThan(20);

    const unresolved: TraceEntry[] = [];
    const mismatched: string[] = [];
    let walked = 0;

    for (const entry of entries) {
      const found = walk(chain, entry.source);
      if (found === UNWALKABLE) {
        unresolved.push(entry);
        continue;
      }
      walked++;
      if (found !== entry.value) {
        mismatched.push(`${entry.source}: trace says ${String(entry.value)}, object holds ${String(found)}`);
      }
    }

    expect(mismatched).toEqual([]);
    // The check has to actually reach most of the trace, or it proves nothing.
    expect(walked).toBeGreaterThan(entries.length * 0.8);
    // The only entries a path-walker cannot reach are the NEXT_QUESTION ones,
    // whose source is a named function call on a stated input — deliberately
    // honest about being recomputed rather than stored.
    for (const entry of unresolved) expect(entry.kind).toBe('NEXT_QUESTION');
  }, 120_000);

  it('records the full named sequence when the session really performed it', async () => {
    const shape = traceShape(traceResearchChain(await chainAt(0.5)));
    for (const kind of [
      'QUESTION',
      'HYPOTHESIS',
      'EXPERIMENT',
      'PREDICTION',
      'OBSERVATION',
      'ASSESSMENT',
      'FALSIFICATION',
      'GENERATION',
      'MEMORY_UPDATE',
      'NEXT_QUESTION',
    ] as const) {
      expect(shape, `missing ${kind}`).toContain(kind);
    }
  }, 120_000);

  it('a session that generated nothing has NO generation entries, rather than an empty heading', async () => {
    // A fold at 1.0 leaves h:warm standing, so nothing is derived.
    const entries = traceResearchChain(await chainAt(1.0));
    expect(entries.some((e) => e.kind === 'GENERATION')).toBe(false);
    // The elements it DID perform are still there.
    expect(entries.some((e) => e.kind === 'OBSERVATION')).toBe(true);
    expect(entries.some((e) => e.kind === 'FALSIFICATION')).toBe(true);
  }, 120_000);

  it('a self-chosen second step appears in the trace as its own step, with its own question', async () => {
    const entries = traceResearchChain(await chainAt(0.5));
    const questions = entries.filter((e) => e.kind === 'QUESTION');
    expect(questions.length).toBeGreaterThanOrEqual(2);
    expect(questions[1]!.step).toBe(2);
    // The second question is the one the selector chose, not a restatement.
    expect(String(questions[1]!.value)).not.toBe(String(questions[0]!.value));
    expect(String(questions[1]!.value)).toContain('[0.3, 0.7]');
  }, 120_000);
});
