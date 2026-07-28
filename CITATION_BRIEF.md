# Citation brief — Genesis mechanism graph

14 edges assert something about human biology with no source attached.
0 already have a proposed citation awaiting verification; **14 are open**.

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


## mechanistic  (3)

A drives or opposes B mechanistically.

### DNA damage and repair ──counteracts──▶ Cellular senescence

> Resolving double-strand breaks terminates the persistent damage response that would otherwise enforce arrest.

`dna-repair→cellular-senescence→mechanistic` · declared honesty: `exact`

### DNA damage and repair ──counteracts──▶ Telomere attrition

> Telomeric DNA is prone to oxidative lesions; repair capacity affects the rate of telomere loss beyond the end-replication problem.

`dna-repair→telomere-attrition→mechanistic` · declared honesty: `simplified`

### SASP (senescence-associated secretory phenotype) ──counteracts──▶ Stem-cell exhaustion and rejuvenation

> Chronic inflammatory signalling in the niche impairs stem-cell function and biases lineage output.

`sasp→stem-cell-rejuvenation→mechanistic` · declared honesty: `simplified`


## oncogenic-coupling  (1)

An ageing mechanism is coupled to an oncogenic axis. These are the safety-critical claims — the ones asserting that a longevity intervention touches tumour biology.

### Mitochondrial dysfunction ──promotes──▶ Genomic instability

> Dysfunctional mitochondria raise reactive oxygen species, increasing oxidative lesion burden on nuclear DNA.

`mitochondrial-dysfunction→genomic-instability→oncogenic-coupling` · declared honesty: `simplified`


## measures  (10)

A biomarker reads out a mechanism. The claim is that the assay actually measures that mechanism, not that it correlates with age.

### Epigenetic clock ──measures──▶ Epigenetic reprogramming

> Reads the methylation state the mechanism acts on — which also makes it circular as an endpoint for reprogramming interventions.

`epigenetic-clock→epigenetic-reprogramming→measures` · declared honesty: `simplified`

### Telomere length ──measures──▶ Telomere attrition

> Direct measurement of the quantity the mechanism describes.

`telomere-length→telomere-attrition→measures` · declared honesty: `exact`

### Telomere length ──measures──▶ Telomerase

> Indirect: length reflects the balance of attrition and extension, not telomerase activity itself. Use TRAP for activity.

`telomere-length→telomerase→measures` · declared honesty: `simplified`

### Senescent burden (p16INK4a) ──measures──▶ Cellular senescence

> Proxy for senescent load; p16 also rises in non-senescent contexts, so a panel is required.

`p16-burden→cellular-senescence→measures` · declared honesty: `simplified`

### Inflammatory panel ──measures──▶ SASP (senescence-associated secretory phenotype)

> Circulating cytokines partly reflect SASP output, but the same analytes move with infection and adiposity.

`inflammatory-panel→sasp→measures` · declared honesty: `simplified`

### NAD+ pool ──measures──▶ Mitochondrial dysfunction

> NAD+ availability constrains oxidative metabolism and sirtuin activity.

`nad-pool→mitochondrial-dysfunction→measures` · declared honesty: `exact`

### NAD+ pool ──measures──▶ DNA damage and repair

> NAD+ is the required substrate for PARP-mediated repair signalling.

`nad-pool→dna-repair→measures` · declared honesty: `exact`

### Mitochondrial capacity ──measures──▶ Mitochondrial dysfunction

> Direct functional readout of the mechanism.

`mitochondrial-capacity→mitochondrial-dysfunction→measures` · declared honesty: `exact`

### Autophagic flux ──measures──▶ Autophagy and proteostasis

> Direct measurement of pathway throughput.

`autophagic-flux→autophagy→measures` · declared honesty: `exact`

### Regenerative capacity ──measures──▶ Stem-cell exhaustion and rejuvenation

> Functional readout of the compartment, though assay-dependent.

`regenerative-capacity→stem-cell-rejuvenation→measures` · declared honesty: `simplified`


---

Debt pinned at 14 by `packages/reasoning/src/__tests__/citations.test.ts`.
Total edges in graph: 66. The other 30 record intent rather than findings and need no source.
