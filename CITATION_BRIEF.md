# Citation brief — Genesis mechanism graph

2 edges assert something about human biology with no source attached.
0 already have a proposed citation awaiting verification; **2 are open**.

## What I need for each edge

A primary paper that supports **the directed claim as written** — not a paper about
both endpoints, and not a review unless the edge is a summary of a field.

For each one, give me:

| field | rule |
|---|---|
| PMID | digits only, e.g. `23746838`. Not `PMID:23746838`, not a URL |
| DOI | bare, e.g. `10.1016/j.cell.2013.05.039`. Not `doi:`, not `https://doi.org/` |
| title + first author + year | so I can tell at a glance whether it is the right paper |
| one line on why it supports THIS claim | direction matters: A→B is not B→A |

**If you are not certain of an identifier, omit it and say so.** A DOI alone is
usable. A wrong PMID is worse than none: it looks checked. Every identifier is
machine-resolved against Europe PMC before it enters the graph
(`npm run citations:verify`), so a fabricated one will be caught — it will just
have wasted both our time.

---


## measures  (2)

A biomarker reads out a mechanism. The claim is that the assay actually measures that mechanism, not that it correlates with age.

### Inflammatory panel ──measures──▶ SASP (senescence-associated secretory phenotype)

> Circulating cytokines partly reflect SASP output, but the same analytes move with infection and adiposity.

`inflammatory-panel→sasp→measures` · declared honesty: `simplified`

### Regenerative capacity ──measures──▶ Stem-cell exhaustion and rejuvenation

> Functional readout of the compartment, though assay-dependent.

`regenerative-capacity→stem-cell-rejuvenation→measures` · declared honesty: `simplified`


---

Debt pinned at 2 by `packages/reasoning/src/__tests__/citations.test.ts`.
Total edges in graph: 66. The other 30 record intent rather than findings and need no source.
