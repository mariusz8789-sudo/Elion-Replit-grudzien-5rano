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
  UNRESOLVED_CITATIONS,
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
const REAL: Citation = { pmid: '23746838', doi: '10.1016/j.cell.2013.05.039', label: 'López-Otín 2013', checked: 'resolved' };

describe('validateCitation refuses what a reader could not resolve', () => {
  it('accepts a bare PMID, a bare DOI, or both', () => {
    expect(validateCitation(REAL).ok).toBe(true);
    expect(validateCitation({ pmid: '23746838', label: 'López-Otín 2013', checked: 'resolved' }).ok).toBe(true);
    expect(validateCitation({ doi: '10.1038/nature15759', label: 'Hensen 2015', checked: 'cross-checked' }).ok).toBe(true);
  });

  it('REFUSES an edge citation with no identifier at all — this is the whole point', () => {
    const r = validateCitation({ label: 'Someone, probably, at some point', checked: 'resolved' });
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
    const r = validateCitation({ pmid, label: 'x', checked: 'resolved' });
    expect(r.ok).toBe(false);
  });

  it.each([
    ['doi:10.1016/j.cell.2013.05.039', 'the "doi:" prefix'],
    ['https://doi.org/10.1016/j.cell.2013.05.039', 'a resolver URL'],
    ['10.1016', 'no suffix'],
    ['j.cell.2013.05.039', 'no registrant'],
  ])('refuses %s (%s)', (doi) => {
    expect(validateCitation({ doi, label: 'x', checked: 'resolved' }).ok).toBe(false);
  });

  it('requires a human-readable label — a bare identifier is unreadable in the graph', () => {
    const r = validateCitation({ pmid: '23746838', label: '   ', checked: 'resolved' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/label/i);
  });

  it('refuses a test-fixture DOI even though it is well-formed', () => {
    // This repository uses 10.1000/ and 10.0000/ for fixtures throughout. A
    // fixture reaching the shipped graph would be indistinguishable from a real
    // source to every downstream consumer, which is exactly the failure the
    // fixture convention exists to prevent.
    for (const doi of ['10.1000/fixture-study', '10.0000/genesis-test-fixture-1']) {
      const r = validateCitation({ doi, label: 'fixture', checked: 'resolved' });
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
    const mixed = auditCitations([edge({ citations: [REAL, { pmid: 'PMID:1', label: 'x', checked: 'resolved' }] })]);
    expect(mixed.cited).toHaveLength(0);
    expect(mixed.invalid).toHaveLength(1);
  });
});

describe('a PMC id pasted as a PMID is caught by its own date', () => {
  // Not hypothetical. A search assistant proposed all three of these for the
  // papers named. Each is a valid PMID that resolves to something entirely
  // unrelated, decades older — the "PMC" prefix had been stripped.
  it.each([
    ['5959857', 'Gonzalez-Meljem 2018', 'really a 1966 paper on air sampling in the upper atmosphere'],
    ['2737083', 'Levine 2009', 'really a 1989 study of cough suppressants'],
    ['2922531', 'Nakagawa 2010', 'really a 1989 French-language article'],
  ])('refuses %s claimed as %s (%s)', (pmid, label) => {
    const r = validateCitation({ pmid, label, checked: 'cross-checked' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/PMC/);
  });

  it('does NOT refuse a genuinely old paper with a short PMID', () => {
    // Kim 1994 really does have a seven-digit PMID. The guard keys on the
    // mismatch between the year and the id, not on the id being short.
    expect(validateCitation({ pmid: '7605428', label: 'Kim 1994', checked: 'cross-checked' }).ok).toBe(true);
    expect(validateCitation({ pmid: '9872311', label: 'Lengauer 1998', checked: 'cross-checked' }).ok).toBe(true);
  });

  it('does not fire when the label carries no year to check against', () => {
    expect(validateCitation({ pmid: '5959857', label: 'some paper', checked: 'cross-checked' }).ok).toBe(true);
  });

  it('every PMID in the shipped graph survives the check', () => {
    for (const e of GRAPH_EDGES.filter(isClaimEdge)) {
      for (const c of e.citations) {
        expect(validateCitation(c).ok, `${e.from}→${e.to}: ${c.label}`).toBe(true);
      }
    }
  });
});

describe('a citation must say how far it was checked', () => {
  it('refuses a citation that does not declare its check level', () => {
    const r = validateCitation({ pmid: '23746838', label: 'López-Otín 2013' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/cross-checked/);
  });

  it('refuses an invented check level', () => {
    // @ts-expect-error deliberately outside the union
    expect(validateCitation({ pmid: '1', label: 'x', checked: 'verified-ish' }).ok).toBe(false);
  });

  it('every citation in the shipped graph declares one', () => {
    for (const edge of GRAPH_EDGES.filter(isClaimEdge)) {
      for (const c of edge.citations) {
        expect(['cross-checked', 'resolved']).toContain(c.checked);
      }
    }
  });
});

describe('the second ratchet: unresolved citations can only decrease', () => {
  const audit = auditCitations();

  it(`pins ${UNRESOLVED_CITATIONS} citations as found-but-not-machine-resolved`, () => {
    // These identifiers were read out of canonical URLs and independently
    // re-looked-up. No canonical record was fetched, because the environment
    // that curated this graph cannot reach Europe PMC, NCBI or Crossref.
    //
    // Going UP means someone added a citation without resolving it — allowed,
    // but it must be counted. Going DOWN means `npm run citations:verify`
    // confirmed one: flip its `checked` to 'resolved' and decrement here.
    expect(audit.unresolved).toHaveLength(UNRESOLVED_CITATIONS);
  });

  it('cannot be lowered without a citation actually being marked resolved', () => {
    const all = GRAPH_EDGES.filter(isClaimEdge).flatMap((e) => e.citations);
    const resolved = all.filter((c) => c.checked === 'resolved');
    expect(resolved).toHaveLength(all.length - UNRESOLVED_CITATIONS);
  });

  it('does not let an unresolved citation masquerade as a resolved one', () => {
    // The audit counts the edge as CITED either way — it does have a source —
    // while listing the citation as unresolved. Both facts are true and the
    // graph reports both rather than picking the flattering one.
    const one = auditCitations([edge({ citations: [{ pmid: '19053174', label: 'Coppé 2008', checked: 'cross-checked' }] })]);
    expect(one.cited).toHaveLength(1);
    expect(one.unresolved).toHaveLength(1);
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
