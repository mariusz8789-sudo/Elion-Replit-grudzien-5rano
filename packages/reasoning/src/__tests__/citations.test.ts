/**
 * Edge citations — the ratchet.
 *
 * The platform's central promise is that every claim is checkable. Until now the
 * graph broke that promise silently: 36 edges asserted things about human biology
 * with nothing behind them but a sentence someone typed, and nothing in the code
 * said so. `honesty: 'exact'` reads like a warrant and is not one — it says what
 * KIND of claim is being made, never that anyone verified it.
 *
 * These tests do three jobs, and the third is the one that matters:
 *
 *   1. A malformed citation is REFUSED — not stored and hoped over.
 *   2. A test-fixture DOI can never reach the shipped graph.
 *   3. The number of uncited claim edges can only go DOWN.
 *
 * (3) is the ratchet. A number in a document drifts within a week; a number
 * pinned by a failing build does not. Add an uncited edge and this suite goes
 * red. Lower the constant without doing the work and it goes red too. The only
 * green path is to find the paper, add the PMID, and decrement by one.
 */
import { describe, expect, it } from 'vitest';
import {
  GRAPH_EDGES,
  CLAIM_EDGE_KINDS,
  UNCITED_CLAIM_EDGES,
  auditCitations,
  isClaimEdge,
  validateCitation,
  type GraphEdge,
} from '../knowledgeGraph.ts';
import type { Citation } from '../types.ts';

const edge = (over: Partial<GraphEdge> = {}): GraphEdge => ({
  from: 'telomere-attrition',
  to: 'cellular-senescence',
  kind: 'mechanistic',
  effect: 'promotes',
  mechanism: 'test edge',
  honesty: 'exact',
  citations: [],
  ...over,
});

/** A real citation: López-Otín et al., Hallmarks of Aging, Cell 2013. */
const REAL: Citation = { pmid: '23746838', doi: '10.1016/j.cell.2013.05.039', label: 'López-Otín 2013' };

describe('validateCitation refuses what a reader could not resolve', () => {
  it('accepts a bare PMID, a bare DOI, or both', () => {
    expect(validateCitation(REAL).ok).toBe(true);
    expect(validateCitation({ pmid: '23746838', label: 'López-Otín 2013' }).ok).toBe(true);
    expect(validateCitation({ doi: '10.1038/nature15759', label: 'Hensen 2015' }).ok).toBe(true);
  });

  it('REFUSES an edge citation with no identifier at all — this is the whole point', () => {
    const r = validateCitation({ label: 'Someone, probably, at some point' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/needs a PMID or a DOI/);
  });

  it('refuses null and undefined rather than treating absence as consent', () => {
    expect(validateCitation(null).ok).toBe(false);
    expect(validateCitation(undefined).ok).toBe(false);
  });

  it.each([
    ['PMID:23746838', 'the "PMID:" prefix'],
    ['https://pubmed.ncbi.nlm.nih.gov/23746838/', 'a URL'],
    ['023746838', 'a leading zero'],
    ['23746838 ', 'trailing whitespace'],
    ['not-a-number', 'letters'],
    ['', 'an empty string'],
  ])('refuses %s (%s)', (pmid) => {
    const r = validateCitation({ pmid, label: 'x' });
    expect(r.ok).toBe(false);
  });

  it.each([
    ['doi:10.1016/j.cell.2013.05.039', 'the "doi:" prefix'],
    ['https://doi.org/10.1016/j.cell.2013.05.039', 'a resolver URL'],
    ['10.1016', 'no suffix'],
    ['j.cell.2013.05.039', 'no registrant'],
  ])('refuses %s (%s)', (doi) => {
    expect(validateCitation({ doi, label: 'x' }).ok).toBe(false);
  });

  it('requires a human-readable label — a bare identifier is unreadable in the graph', () => {
    const r = validateCitation({ pmid: '23746838', label: '   ' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/label/i);
  });

  it('refuses a test-fixture DOI even though it is well-formed', () => {
    // This repository uses 10.1000/ and 10.0000/ for fixtures throughout. A
    // fixture reaching the shipped graph would be indistinguishable from a real
    // source to every downstream consumer, which is exactly the failure the
    // fixture convention exists to prevent.
    for (const doi of ['10.1000/fixture-study', '10.0000/genesis-test-fixture-1']) {
      const r = validateCitation({ doi, label: 'fixture' });
      expect(r.ok).toBe(false);
      expect(r.errors.join(' ')).toMatch(/fixture/i);
    }
  });
});

describe('auditCitations tells the truth about the shipped graph', () => {
  const audit = auditCitations();

  it('classifies every edge exactly once', () => {
    const total = audit.cited.length + audit.uncited.length + audit.invalid.length + audit.exempt.length;
    expect(total).toBe(GRAPH_EDGES.length);
  });

  it('exempts only `targets` edges, which record intent rather than a finding', () => {
    expect(audit.exempt.every((e) => e.kind === 'targets')).toBe(true);
    expect(audit.exempt.every((e) => !isClaimEdge(e))).toBe(true);
    // And nothing that asserts biology is quietly exempt.
    for (const kind of CLAIM_EDGE_KINDS) {
      expect(audit.exempt.some((e) => e.kind === kind)).toBe(false);
    }
  });

  it('ships no malformed citation — a broken source is worse than an absent one', () => {
    const detail = audit.invalid.map((i) => `${i.edge.from}→${i.edge.to}: ${i.errors.join('; ')}`);
    expect(detail).toEqual([]);
  });

  it('counts an edge as cited only when its citations all validate', () => {
    const good = auditCitations([edge({ citations: [REAL] })]);
    expect(good.cited).toHaveLength(1);

    // One valid and one broken citation is NOT "mostly cited".
    const mixed = auditCitations([edge({ citations: [REAL, { pmid: 'PMID:1', label: 'x' }] })]);
    expect(mixed.cited).toHaveLength(0);
    expect(mixed.invalid).toHaveLength(1);
  });
});

describe('the ratchet: uncited claims can only decrease', () => {
  const audit = auditCitations();

  it(`pins the current debt at ${UNCITED_CLAIM_EDGES} uncited claim edges`, () => {
    // If this fails going UP: an edge was added asserting biology with no source.
    // Cite it, or make it a `targets` edge if it records intent rather than a finding.
    //
    // If this fails going DOWN: good — you cited something. Lower the constant in
    // knowledgeGraph.ts by the number you fixed. That edit is the deliverable.
    expect(audit.uncited).toHaveLength(UNCITED_CLAIM_EDGES);
  });

  it('the constant cannot be lowered without the citations actually existing', () => {
    // Pins the two counts to each other, so editing UNCITED_CLAIM_EDGES alone
    // fails. The only green path is doing the work.
    const claims = GRAPH_EDGES.filter(isClaimEdge);
    expect(audit.cited.length + audit.invalid.length).toBe(claims.length - UNCITED_CLAIM_EDGES);
  });

  it('names what is unsourced, so the debt is a worklist and not a number', () => {
    const worklist = audit.uncited.map((e) => `${e.kind}: ${e.from} → ${e.to}`);
    expect(worklist.length).toBe(UNCITED_CLAIM_EDGES);
    // Every entry is addressable: a real pair of nodes and a real edge kind.
    for (const line of worklist) expect(line).toMatch(/^(mechanistic|oncogenic-coupling|measures): \S+ → \S+$/);
  });

  it('reaching zero is the milestone, and the test says so', () => {
    if (UNCITED_CLAIM_EDGES === 0) {
      // The debt is paid. Delete UNCITED_CLAIM_EDGES and this block, and assert
      // the invariant directly: every claim edge carries a resolvable source.
      expect(auditCitations().uncited).toEqual([]);
    } else {
      expect(UNCITED_CLAIM_EDGES).toBeGreaterThan(0);
    }
  });
});
