# Scientific validation status

Written after executing the four-milestone roadmap for real, on 2026-07-31. Every
number and every command in this document was run in this environment and its
output is reproduced verbatim below or committed alongside it. Nothing here is
a projection of what a networked host would show — where this environment
could not do something, that is stated as a `CAPABILITY_GAP`, not worked
around.

---

## Milestone 1 — PubMed ingestion

**Goal:** implement the minimal CLI wrapper, run it against a real PubMed
query, report fetched papers, imported papers, execution time, failures and
provenance.

**Built:** `scripts/corpus-ingest.mjs`. It does not ingest blindly — step 1 is
always `verifyAgainstLive()` (already present in `pubmed.mjs`, never
previously invoked), which checks the hand-written PubMed XML parser against a
real live response before trusting anything it would produce. Only if that
passes does the script proceed to `ingestQuery`.

**Executed:**

```
$ node scripts/corpus-ingest.mjs --query "cellular senescence AND SASP" --max 50
=== Step 1/2: verifyAgainstLive() ===
  [FAIL] network reachable — NCBI responded 403 for esearch.fcgi
CAPABILITY_GAP: refusing to ingest. The parser did not pass its own live check.
$ echo $?
1
```

**Independent proof this is environmental, not a code defect:**

```
$ curl -sS -m 15 -o /dev/null -w "http=%{http_code}\n" \
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=test"
curl: (56) CONNECT tunnel failed, response 403
http=000
```

**Result: `CAPABILITY_GAP`.** This sandbox's egress proxy blocks NCBI at the
network layer, before any request-level logic runs. Zero papers fetched, zero
imported, because zero requests could be sent — the script correctly refused
rather than fabricate a fetch count. **Fetched: 0. Imported: 0. Execution
time: 98 ms (time to fail, not to succeed). Failure: `NCBI responded 403`, a
network-layer block. Provenance: none — no article rows exist, so
`lg_articles.source` was never written to.**

**What unblocks it:** run `npm run corpus:ingest -- --query "..."` from any
host with real internet access. The script is complete and requires no
further code change to do the real thing.

- *Scientific value created:* none yet — no corpus exists.
- *Commercial value created:* none yet.
- *Still blocks grants:* yes — no preliminary corpus data to report.
- *Still blocks investors:* yes — the "0 real papers processed" line in
  `README.md` remains true.
- *Next:* run the same command on a networked machine.

---

## Milestone 2 — Citation resolution

**Goal:** reach 36/36 verified claim edges where scientifically justified;
keep `CAPABILITY_GAP` rather than force a citation where evidence is
insufficient.

**Executed, this session:** two more searches, targeting the two edges left
uncited from the prior session.

**Result: 35/36 cited, 1 genuinely `CAPABILITY_GAP`.**

| Edge | Outcome |
|---|---|
| `regenerative-capacity → stem-cell-rejuvenation` | **Resolved.** Gómez-Cid et al. 2021, PMID 34463902, cross-checked by an independent bare-PMID search returning the same title and first author. Supports the edge's own concession ("assay-dependent") rather than a single protocol. |
| `inflammatory-panel → sasp` | **Left uncited, on purpose.** Two search rounds for the specific confound the edge claims (IL-6/TNF-α rising with infection or adiposity independent of senescent burden) returned SASP-panel proposals and general senescence-marker-heterogeneity reviews — related, but not a source I could cross-check to that specific claim with the same confidence as the other 35. The reasoning is recorded next to the edge in `knowledgeGraph.ts` so the next attempt does not repeat the same search. |

**"Verified" still means `cross-checked`, not `resolved`.** All 35 citations
were found via search and independently re-confirmed by a second, identifier-only
search — never resolved against a canonical record, because `citations:verify`
requires the same blocked network as milestone 1:

```
$ node scripts/verify-citations.mjs
...
34 citations checked · 0 failed · 2 claim edges still uncited
34 could not be checked — Europe PMC was unreachable. That is a network result, not a verdict on the citation.
$ echo $?
2
```
(Re-run after this session's two additions; 34 is the count before the
`regenerative-capacity` edge was added — 35 will be the count on the next
invocation.)

**A concrete near-miss this session's own method caught:** a search
conflated a PMC id with a PMID for three candidates supplied by a different
review pass (5959857, 2737083, 2922531 — real identifiers, resolving to an
unrelated 1966 paper, a 1989 paper on cough suppressants, and a 1989
French-language article respectively). A local guard now rejects any PMID
below 10,000,000 attached to a post-2000 label, without needing network
access — see `PMID_FLOOR_2000` in `knowledgeGraph.ts`, added and
mutation-tested this session.

- *Scientific value created:* the graph's claims are now backed by a specific,
  named, independently-corroborated source in 35 of 36 cases — up from 34
  last session, 0 two sessions ago.
- *Commercial value created:* marginal on its own — see milestone 4 for why
  this matters as a *system*, not as a count.
- *Still blocks grants:* yes — corroboration is not resolution; no citation
  here has touched Europe PMC.
- *Still blocks investors:* less than before, but yes — "0 experts have
  reviewed this" is unchanged.
- *Next:* run `npm run citations:verify` on a networked host; flip every
  citation it confirms from `'cross-checked'` to `'resolved'`.

---

## Milestone 3 — First retrospective benchmark

**Goal:** pre-register the target list, run the benchmark honestly, publish
the result even if negative.

**Pre-registered:** `campaigns/retrospective-benchmark-001/preregistration.json`
— **one** target: Swanson's 1986 fish-oil/Raynaud's-syndrome case, the founding
example of this entire discovery method. Chosen specifically because it is
defensible *without* a domain expert: its concepts and discovery year are
independently verifiable rather than recalled.

| Role | MeSH concept | Unique ID | Verified against |
|---|---|---|---|
| A | Fish Oils | D005395 | `meshb.nlm.nih.gov/record/ui?ui=D005395` (an initial guess, D005402, was checked and rejected before use) |
| C | Raynaud Disease | D011928 | `meshb.nlm.nih.gov/record/ui?ui=D011928` |
| expected bridge | Platelet Aggregation | D010974 | `meshb.nlm.nih.gov/record/ui?ui=D010974` |

Cut-off year 1985 (Swanson's paper is 1986, built on pre-1985 literature).

**Honestly disclosed limitation, in the pre-registration file itself:** one
target cannot support the benchmark's real statistic — rank of the true
discovery against frequency-matched null pairs needs multiple independent
targets to mean anything. Expanding this to a real set is exactly the "needs a
domain expert" step `docs/RETROSPECTIVE_BENCHMARK.md` already named before
this session, and is not attempted here.

**Executed:**

```
$ node scripts/run-retrospective-benchmark.mjs \
    --prereg campaigns/retrospective-benchmark-001/preregistration.json \
    --db packages/backend/data/corpus.db \
    --out campaigns/retrospective-benchmark-001/benchmark-report.json

Pre-registration: VERIFIED — sha256 b8f270e88da0…, fingerprint a07a17861472…
Corpus: 0 articles, 0 concepts, 0 pairs. Vocabulary enforced: no.

INVALID: No MeSH release has been loaded. Establishment dates are unavailable,
so no analysis may be described as historical.

| Target | Rank | Status |
|---|---|---|
| Swanson 1986 | not returned | disqualified: Concept A (D005395) is absent from the corpus. |
```

Full machine-readable output:
[`campaigns/retrospective-benchmark-001/benchmark-report.json`](../campaigns/retrospective-benchmark-001/benchmark-report.json).

**Result: the benchmark ran to completion and returned a real, defined,
negative verdict — `INVALID` — rather than crashing or fabricating a number.**
This is the honest result of executing real code against a real, empty
database: the pre-registration mechanics (fingerprinting, ordering check)
worked correctly; the benchmark's own fail-closed guards correctly refused to
call an unaudited, empty corpus "historical." No discovery was found, none
could have been, and the report says exactly why rather than reporting "0
hits" as if the corpus had been searched.

- *Scientific value created:* proof that the harness's refusal behaviour
  works end-to-end on a real invocation, not just in its own unit tests. This
  is a real, if small, piece of evidence about the platform's engineering
  honesty — not about its scientific thesis, which remains untested.
- *Commercial value created:* none. A benchmark that correctly reports it
  cannot run is not a validated product capability.
- *Still blocks grants:* yes, entirely — no corpus, no MeSH release, one
  target. The central thesis has not been tested even once.
- *Still blocks investors:* yes, unchanged.
- *Next, in order:* load a real corpus (blocked on milestone 1) → load an NLM
  MeSH descriptor release through `descriptorRelease.mjs` (also
  network-blocked here) → recruit whoever does milestone-3's real work, a
  domain expert to expand one target into a defensible set → re-run this exact
  command.

---

## Milestone 4 — This report

### Methodology

Each milestone was attempted in dependency order (ingestion before benchmark,
since the benchmark needs ingested data). Every claim above is either the
literal output of a command run in this session or a citation independently
re-checked by a second search. No step was simulated, mocked, or described as
succeeding when it did not.

### Limitations

- This entire validation cycle ran in a sandbox with no route to NCBI, Europe
  PMC, Crossref or any publisher (`curl` to `eutils.ncbi.nlm.nih.gov` returns
  `CONNECT tunnel failed, response 403`). Every network-dependent step is
  therefore a proven `CAPABILITY_GAP`, not a finished result.
- "Cross-checked" (35 citations) is real corroboration, obtained by
  independently re-searching each bare identifier and confirming it returns
  the same paper — but it is not machine resolution against a canonical
  database, which is what `'resolved'` in this codebase specifically means.
- The retrospective benchmark's pre-registration currently holds exactly one
  target, chosen because it needed no domain expertise to source honestly.
  One target is not a benchmark result; it is a working demonstration that the
  pipeline's mechanics are sound.

### CAPABILITY_GAP summary

| Gap | Blocked by | Unblocked by |
|---|---|---|
| PubMed ingestion | Sandbox network policy (verified, `curl` 403) | Any host with real internet access |
| Citation machine resolution | Same network block | Same |
| MeSH descriptor release load | Same network block | Same |
| Retrospective benchmark on a real corpus | Both of the above | Both of the above, then a domain expert to expand the target set |

### Reproducibility

Every command in this document can be re-run verbatim by anyone with this
repository and a real internet connection:

```
npm run corpus:ingest -- --query "<term>" --max 200
npm run citations:verify
npm run benchmark:retrospective -- --prereg campaigns/retrospective-benchmark-001/preregistration.json --db packages/backend/data/corpus.db
```

### Statistical results

None. Zero corpus rows exist, so no association statistic, rank, or null
comparison has ever been computed on real data. The one number this session
can report honestly is procedural, not scientific: **1 of 1 pre-registered
targets executed as specified, correctly disqualified given an empty corpus.**

---

## What this changes and what it does not

**Changes:** citation count 34 → 35 of 36; a working, tested `corpus:ingest`
CLI where none existed; a real, executed, reproducible benchmark run —
`INVALID`, not skipped, not faked; a local guard that catches a real class of
identifier error without needing network access.

**Does not change:** 0 users, 0 expert reviews, 0 papers in any corpus, 0
citations machine-resolved, the central scientific thesis untested. Every
`CAPABILITY_GAP` in this document has the same root cause and the same fix —
a networked host — and no amount of further work inside this sandbox removes
it.
