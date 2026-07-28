# Citation brief — Genesis mechanism graph

36 edges assert something about human biology with no source attached.
10 already have a proposed citation awaiting verification; **26 are open**.

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


## oncogenic-coupling  (13)

An ageing mechanism is coupled to an oncogenic axis. These are the safety-critical claims — the ones asserting that a longevity intervention touches tumour biology.

### Cellular senescence ──promotes──▶ p53 axis

> Senescence is one of the terminal outcomes p53 enforces after damage. The arrest IS part of the tumour-suppressive response, not merely correlated with it.

`cellular-senescence→tp53-axis→oncogenic-coupling` · declared honesty: `exact`

### Cellular senescence ──promotes──▶ RB axis

> Stable senescent arrest is maintained by p16INK4a–CDK4/6–RB signalling; p16 is a senescence marker and a tumour suppressor at the same time.

`cellular-senescence→rb-axis→oncogenic-coupling` · declared honesty: `exact`

### Telomerase ──promotes──▶ Oncogene activation

> TERT reactivation removes the replicative limit. Approximately 85–90% of human cancers do this; it is a canonical immortalisation step.

`telomerase→oncogene-activation→oncogenic-coupling` · declared honesty: `exact`

### Telomere attrition ──promotes──▶ Genomic instability

> Uncapped telomeres are processed as double-strand breaks, driving breakage–fusion–bridge cycles and chromosomal rearrangement.

`telomere-attrition→genomic-instability→oncogenic-coupling` · declared honesty: `exact`

### Yamanaka factors (OSKM) ──promotes──▶ Oncogene activation

> MYC is both a Yamanaka factor and one of the most frequently activated human oncogenes. This is why OSK (MYC omitted) is preferred in rejuvenation work.

`yamanaka-factors→oncogene-activation→oncogenic-coupling` · declared honesty: `exact`

### DNA damage and repair ──counteracts──▶ Genomic instability

> Intact repair suppresses the mutation and rearrangement burden that enables transformation.

`dna-repair→genomic-instability→oncogenic-coupling` · declared honesty: `exact`

### DNA damage and repair ──counteracts──▶ Tumour suppressor loss

> Repair capacity protects the tumour-suppressor loci themselves from inactivating mutation.

`dna-repair→tumour-suppressor-loss→oncogenic-coupling` · declared honesty: `exact`

### SASP (senescence-associated secretory phenotype) ──promotes──▶ Immune surveillance

> SASP chemokines recruit immune cells that clear senescent and pre-malignant cells — the beneficial arm of an otherwise damaging secretome.

`sasp→immune-surveillance→oncogenic-coupling` · declared honesty: `exact`

### SASP (senescence-associated secretory phenotype) ──promotes──▶ Oncogene activation

> The same secretome can be pro-tumourigenic in a paracrine fashion, supplying growth factors and proteases that favour neighbouring transformed cells.

`sasp→oncogene-activation→oncogenic-coupling` · declared honesty: `simplified`

### Stem-cell exhaustion and rejuvenation ──promotes──▶ Oncogene activation

> Restoring proliferative and self-renewal capacity restores the substrate that transformation requires; long-lived proliferative cells accumulate mutations.

`stem-cell-rejuvenation→oncogene-activation→oncogenic-coupling` · declared honesty: `simplified`

### Autophagy and proteostasis ──promotes──▶ Oncogene activation

> Context-dependent: autophagy suppresses transformation early, but supports survival of established tumours under metabolic and therapeutic stress.

`autophagy→oncogene-activation→oncogenic-coupling` · declared honesty: `simplified`

### Mitochondrial dysfunction ──promotes──▶ Genomic instability

> Dysfunctional mitochondria raise reactive oxygen species, increasing oxidative lesion burden on nuclear DNA.

`mitochondrial-dysfunction→genomic-instability→oncogenic-coupling` · declared honesty: `simplified`

### Epigenetic reprogramming ──promotes──▶ Tumour suppressor loss

> HYPOTHESIS: reprogramming remodels methylation genome-wide, which could in principle silence tumour-suppressor loci. Mechanistically plausible; not established.

`epigenetic-reprogramming→tumour-suppressor-loss→oncogenic-coupling` · declared honesty: `theoretical`


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

## Already proposed (do not re-search — verify instead)

- **Telomere attrition → Cellular senescence** — d'Adda di Fagagna 2003, DOI 10.1038/nature02118
  A DNA damage checkpoint response in telomere-initiated senescence. Nature 426:194-198
  _no PMID: no PubMed URL appeared in the results; the DOI was read from the Nature article URL_
- **Telomerase → Telomere attrition** — Bodnar 1998, DOI 10.1126/science.279.5349.349
  Extension of life-span by introduction of telomerase into normal human cells. Science 279:349-352
  _no PMID: no PubMed URL for this paper appeared in the results_
- **Cellular senescence → SASP (senescence-associated secretory phenotype)** — Coppé 2008, PMID 19053174 / 10.1371/journal.pbio.0060301
  Senescence-associated secretory phenotypes reveal cell-nonautonomous functions of oncogenic RAS and the p53 tumor suppressor. PLoS Biol 6:e301
- **SASP (senescence-associated secretory phenotype) → Cellular senescence** — Acosta 2008, PMID 18555777 / 10.1016/j.cell.2008.03.038
  Chemokine signaling via the CXCR2 receptor reinforces senescence. Cell 133:1006-1018
  ⚠ Acosta is about CXCR2-binding chemokines reinforcing arrest. The edge text names IL-1 and IL-6. Check whether this paper is the right primary source for the IL-1/IL-6 wording, or whether the edge text should change to match the evidence.
- **Mitochondrial dysfunction → Cellular senescence** — Wiley 2016, DOI 10.1016/j.cmet.2015.11.011
  Mitochondrial dysfunction induces senescence with a distinct secretory phenotype. Cell Metab 23:303-314
  _no PMID: the results gave two different PMIDs (26874922 and 26686024) and one of them belongs to a commentary with a similar title. Deliberately omitted rather than guessed._
- **Autophagy and proteostasis → Mitochondrial dysfunction** — Narendra 2008, PMID 19029340
  Parkin is recruited selectively to impaired mitochondria and promotes their autophagy. J Cell Biol 183:795-803
  _no DOI: the DOI in the results (10.1083/jcb.200810184) belongs to an adjacent commentary piece, PMID 19029341, not to this paper. Omitted rather than guessed._
- **Yamanaka factors (OSKM) → Epigenetic reprogramming** — Takahashi 2006, PMID 16904174
  Induction of pluripotent stem cells from mouse embryonic and adult fibroblast cultures by defined factors. Cell 126:663-676
- **Epigenetic reprogramming → Cellular senescence** — Ocampo 2016, PMID 27984723
  In vivo amelioration of age-associated hallmarks by partial reprogramming. Cell 167:1719-1733
  ⚠ This is a progeria mouse model. Whether it licenses a general claim about senescence reversal is exactly the kind of judgement the honesty label exists for.
- **Cellular senescence → Stem-cell exhaustion and rejuvenation** — Baker 2016, PMID 26840489
  Naturally occurring p16(Ink4a)-positive cells shorten healthy lifespan. Nature 530:184-189
- **Autophagy and proteostasis → Stem-cell exhaustion and rejuvenation** — García-Prat 2016, PMID 26738589 / 10.1038/nature16187
  Autophagy maintains stemness by preventing senescence. Nature 529:37-42

---

Debt pinned at 36 by `packages/reasoning/src/__tests__/citations.test.ts`.
Total edges in graph: 66. The other 30 record intent rather than findings and need no source.
