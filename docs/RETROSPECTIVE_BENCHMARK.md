# Retrospective Benchmark — design

**Status: designed, not run.** No corpus exists yet, because the environment this
was written in cannot reach NCBI. Nothing in this document may be described as a
result until the protocol below has been executed and its output published,
including if the output is a failure.

---

## 1. The question

> If Genesis had existed in 2015, would it have proposed the discoveries the field
> made between 2016 and 2024 — *before* they were made?

This is the only test that converts "interesting tool" into "tool that works". It
is also the only claim in the entire product that an investor cannot argue with,
and the only one a domain expert will accept without trusting the authors.

It can fail. That is the point of running it.

---

## 2. Why this must come after expert review

A retrospective benchmark run over an **unreviewed** graph demonstrates only that
one unverified curation predicted something. The argument is circular: if the
curated edges are wrong, "the 2015 graph implied X" tells you nothing about the
world, only about the curator.

**Prerequisite:** the mechanism edges used in the benchmark must carry
expert-confirmed status in the review ledger (`edgesPassingStandard(db, keys,
'expert-confirmed')`). The benchmark should be run twice — once on the full graph
and once on the confirmed subset — and both numbers reported. A large gap between
them is itself a finding worth publishing.

---

## 3. Protocol

### 3.1 Pre-registration (mandatory, before any corpus is built)

Choosing which discoveries to test *after* seeing what the engine outputs is
p-hacking with extra steps. The target list, the cut-off year, the parameters and
the success criteria are fixed in a signed, timestamped file committed to the
repository **before** the first `rebuildStatistics()` call.

Anything added to the target list afterwards is reported separately and labelled
post-hoc.

### 3.2 Corpus

| Parameter | Value | Why |
|---|---|---|
| Query | Ageing/senescence/longevity MeSH slice | Full PubMed is unnecessary and slower |
| Size | 200k–500k articles | Enough for concept sparsity (see §5.1) |
| Cut-off | 31 December 2015 | Ten years before the present, ~8 years of held-out literature |
| Statistics | `rebuildStatistics(db, { throughYear: 2015 })` | Already implemented |

### 3.3 Targets

Post-2015 findings in ageing biology, each expressible as a concept pair (A, C)
that did **not** co-occur in the pre-2016 literature. Candidate list to be fixed
at pre-registration; likely entries include:

- Cyclic partial reprogramming ameliorating age-associated phenotypes *in vivo*
  (2016)
- Clearance of p16-positive senescent cells extending median healthspan (2016)
- Senescent-cell involvement in idiopathic pulmonary fibrosis (2017)
- Urolithin A and mitophagy induction (2016)
- Taurine deficiency as a driver of ageing (2023)

For each target, the pair (A, C) and the publication that established it are
recorded, and A–C non-co-occurrence before 2016 is **verified in the corpus**
rather than assumed. A target that already co-occurred pre-2016 is disqualified —
it was not a hidden link.

### 3.4 Execution

For each target:

1. `openDiscovery(db, A)` on the 2015 corpus.
2. Record whether C appears among the candidates, and **at what rank**.
3. `closedDiscovery(db, A, C)` to recover the bridging concepts B.
4. Record the bridges and check whether they match the mechanism the eventual
   publication actually reported.

Point 4 matters more than point 2. Proposing the right pair for the wrong reason
is a coincidence; proposing it *via the mechanism that turned out to be correct*
is a discovery.

---

## 4. What counts as success

**A hit is not "C appeared somewhere in the output".** Open discovery on a large
corpus returns thousands of candidates; finding one match in a long list is
expected by chance and proves nothing.

| Metric | Meaning | Threshold to claim anything |
|---|---|---|
| Rank of C | Position among candidates for A | Top 100, ideally top 20 |
| Precision@20 | Fraction of the top 20 that later became real findings | Must exceed the null model |
| Bridge accuracy | Did B match the published mechanism? | Reported per target, not aggregated |
| Null comparison | Same metrics over frequency-matched random pairs | **The benchmark is meaningless without this** |

### 4.1 The null model

For every target, sample control pairs matched on individual concept frequency
that also did not co-occur before 2016, and measure how often they appear in the
top-k. If real discoveries do not rank above frequency-matched controls, the
engine is ranking by popularity and the whole exercise has failed.

**This comparison is the benchmark.** Everything else is descriptive.

---

## 5. Threats to validity, and what to do about them

### 5.1 Corpus density (measured, not hypothetical)

nPMI measures association against what independent frequency predicts. In a small
corpus every concept occupies a large fraction of the records, association
collapses toward zero, and even genuine relationships look unsurprising. This was
observed while building the test fixtures: a 111-article corpus produced nPMI
0.085 for a pair constructed to be strongly related.

**Mitigation:** minimum 200k articles. Report the concept-frequency distribution
alongside the results.

### 5.2 MeSH re-indexing leakage — the most serious threat

NLM revises the MeSH vocabulary annually and **re-indexes older articles against
newer terms**. A 2010 article may therefore carry a heading that did not exist in
2010. If the concept central to a post-2016 discovery was introduced as a
descriptor after 2015, the "2015 corpus" silently contains post-2015 knowledge and
the benchmark is contaminated.

**Mitigation, in order of rigour:**

1. For every concept used, check the MeSH descriptor's `DateEstablished` and
   exclude any introduced after the cut-off.
2. Prefer the archived 2015 MeSH release over the current vocabulary.
3. At minimum, report which target concepts were established after 2015 and treat
   those targets as contaminated.

Not addressing this would be the single easiest way for a reviewer to dismiss the
entire result, and they would be right.

### 5.3 Survivorship in the target list

Only discoveries that turned out to be *correct and famous* get proposed as
targets. The engine is never scored on the 2016 findings that failed to replicate
— though it may well have proposed those too.

**Mitigation:** include at least three targets that were prominent post-2015 and
subsequently **failed to replicate**. An engine that ranks those highly too is
pattern-matching on hype, not on mechanism, and that is worth knowing.

### 5.4 Publication-lag skew

Work is published years after it starts. A 2016 paper reflects thinking from
2013–2014, some of which is visible in the 2015 literature as conference
abstracts and preprints.

**Mitigation:** report results at cut-offs of 2015, 2013 and 2010. Performance
that survives an earlier cut-off is far stronger evidence.

---

## 6. Reporting

The output is a single table, published in full including failures:

| Target | Year | Rank of C | In top 20 | Bridge matched | Null rank (median) | Contaminated |
|---|---|---|---|---|---|---|

Plus: corpus size, cut-off, parameters, MeSH release used, and the proportion of
edges that were expert-confirmed.

**Every target is reported.** Selecting the ones that worked would make the
benchmark worthless and, if discovered later, would destroy the credibility of
everything else in the platform.

---

## 7. Effort

| Stage | Estimate |
|---|---|
| PubMed ingest (200–500k records, rate-limited) | 2–4 days wall-clock, mostly unattended |
| MeSH descriptor load + establishment dates | 2–3 days |
| Pre-registration and target curation (needs a domain expert) | 1 week |
| Null model and metrics | 3–4 days |
| Analysis and write-up | 1 week |

**Total: 4–6 weeks**, of which about one week requires domain expertise.

---

## 8. If it fails

A negative result is not a wasted six weeks. It answers, cheaply and early, the
question that would otherwise be answered expensively and late — and it narrows
the design honestly:

- **Targets rank no better than the null model** → co-occurrence alone is
  insufficient, and the curated mechanism graph is doing the real work. That
  redirects effort toward expert curation, which is the moat anyway.
- **Hits, but via the wrong bridges** → the engine finds pairs, not mechanisms.
  Still useful for hypothesis generation; must never be described as mechanistic.
- **Only contaminated targets hit** → the method is unproven and the honest move
  is to say so and rebuild against an archived vocabulary.

Publishing a negative result here would itself be a differentiator. Nobody else in
this space publishes their failures, which is precisely why nobody believes their
successes.
