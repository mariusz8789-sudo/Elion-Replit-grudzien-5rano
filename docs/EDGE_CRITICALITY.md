# Edge criticality — which claim, if wrong, changes the answer?

**Status: implemented and tested.** Runs over the curated graph in ~20 ms and is
served publicly at `GET /api/reasoning/criticality` and
`GET /api/reasoning/review-priority`.

---

## The problem it solves is economic, not scientific

Genesis reasons over a curated mechanism graph that no expert has reviewed. The
review ledger — versioned, attributable, credit-bearing, deep-linkable — has been
built, tested and used **zero times**. The reason is visible in the ask itself:

> *"Please review the Genesis mechanism graph."*

That is 66 edges, unranked, for free, from a stranger. It is a rational thing to
decline.

This module changes the ask:

> *"These three claims decide what Genesis concludes. The other sixty-three
> change nothing. Review these three."*

Same instrument, a twentieth of the request, and the ranking is **derived rather
than asserted**.

---

## How the counterfactual is exact

`signedPaths(A, B)` returns every documented path from A to B **together with the
edges it traverses**. Removing an edge therefore kills exactly the paths that
contain it — no estimation is involved.

For each node pair with at least one path:

1. Compute the verdict normally.
2. For each edge appearing on any of those paths, re-judge the surviving subset.
3. Classify the difference.

The re-judgement uses `verdictFromPaths`, the **same function** `netInfluence`
uses. That function was extracted from `netInfluence` for this purpose: a second
implementation of the verdict rule would be a second source of truth for the most
consequential decision in the system — whether two mechanisms agree, disagree, or
are unconnected.

Paths are computed **once per pair** and re-judged per edge, so the cost is one
graph walk per pair rather than one per (pair, edge).

### Impact classes

| Class | Meaning | Weight |
|---|---|---|
| `reversal` | The verdict flips sign. Genesis would have said the opposite, with the same confidence | 100 |
| `severance` | The verdict becomes `no-known-path`. Serious, but the reader is told there is no answer rather than told something false | 40 |
| `conflict-created` / `conflict-resolved` | A reported conflict appears or disappears; direction unchanged | 15 |

A fifth case — a pair gaining a path when an edge is *removed* — is impossible.
The code throws rather than returning a plausible label, because a wrong label
would hide a bug behind a real-looking finding.

---

## What it measures, and what it does not

The output looks authoritative, so the report says these in its own words:

- **Structural dependence, not scientific importance.** A load-bearing edge is
  one the conclusions rest on. That is not a claim that it is doubtful, novel or
  interesting.
- **An inert edge is not a safe edge.** It may simply connect nothing yet, which
  is a fact about the graph's sparsity, not about the biology.
- **A graph in which nothing is load-bearing is not robust — it is
  disconnected.** The empty worklist explicitly warns about this, because "no
  edge needs reviewing" and "no edge connects anything" look identical from the
  outside and only one is good news.

## Criticality and review status are kept apart

An edge's criticality is a property of the **graph**; whether anyone has reviewed
it is a property of the **ledger**. They are combined only at the final ranking
step. Folding review status into the score would make a reviewed edge look less
structurally important than it is — a test pins that filing a review does not
change any criticality figure.

In the worklist:

- **Confirmed edges are dropped**, not down-ranked. An expert's scarce time
  should not go to re-confirming what another expert already confirmed *at this
  exact content version*.
- **Disputed edges are kept and promoted** (urgency ×2). A disputed load-bearing
  edge is the most urgent thing in the graph: Genesis is publishing conclusions
  that a named expert has already objected to.

---

## Why it is public

Both endpoints are readable without an account, for the same reason
`/api/review` is: an expert arriving from a cold email must be able to see what
is being asked of them **before** deciding whether to spend an hour on it.
Putting the ask behind a registration form is what makes the ask refusable.

Nothing private is exposed — both are derived from the public graph and the
public ledger.

---

## Current result on the shipped graph

At the time of writing, over the 66 curated edges:

- **18 are load-bearing**, 48 change no conclusion.
- Reviewing the top **3** addresses roughly **36%** of the graph's total
  structural dependence.
- **Zero reversals exist.** No single edge, removed, flips any verdict — every
  dependency is a severance. That is a real property of this graph and worth
  stating: the conclusions are not one sign-error away from inverting, but they
  are frequently one edge away from disappearing.

These numbers are computed on request, not stored, so they follow the graph.

---

## What this does not fix

It reduces the cost of the first review. It does not produce one. The binding
constraint on Genesis remains a named human being willing to disagree with
something in public, and no amount of code changes that.
