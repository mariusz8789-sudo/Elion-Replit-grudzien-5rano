# Genesis Knowledge Base — Acquisition Roadmap & Completion Engineering Plan

> Author: Senior Staff Engineer audit · Scope: what it takes to (a) *finish* the current
> Genesis product and (b) *optionally* grow it into a grounded scientific-discovery platform.
> **Brutally honest throughout. No generic advice.**

---

## Part 0 — Read this first: what acquisition actually unblocks

Your premise was that Physics Lab / Education, CDE adapters, and backend i18n are blocked on
*additional verified domain knowledge*. After inspecting the codebase, that is **only partly
true**, and the distinction changes the whole plan:

| Remaining item | Real blocker | Needs datasets from this roadmap? |
|---|---|---|
| **Backend i18n** (488 Polish strings, 79 files) | **Software only** | ❌ No. Zero external knowledge. |
| **Physics/Education i18n** (~706 strings, ~14 lab modules) | **Bilingual STEM translation** + mechanical code | ⚠️ Only a *glossary* (OpenStax/NIST/IUPAC), not databases. |
| **CDE adapters** (2 models: planetary habitability, SEMF nuclide) | Verify ~10 constants + translate 6 labels | ⚠️ A handful of reference values (NIST/NASA/PDG), not databases. |
| **Future discovery modules** (real docking, ADMET, targets…) | **New software + these datasets** | ✅ Yes — this is where PDB/ChEMBL/PubChem/UniProt matter. |

**Consequence:** the large databases you listed (PDB, ChEMBL, PubChem, UniProt, Ensembl,
Reactome, KEGG…) **do not finish the current product**. They are the foundation for *new*
capabilities, which the standing "do not expand scope / do not start new features" mandate
excludes. This document therefore separates:

- **Part 1** — the engineering work that finishes what exists (mostly software + translation).
- **Part 2–4** — the acquisition roadmap, honestly labelled by whether each resource *completes
  existing modules* or *enables future ones*.

---

## Part 1 — Completion engineering plan (the "don't stop at planning" answer)

### 1.1 What becomes fully completable once resources are available

| Module | Completable when you have… | Then remaining work is… |
|---|---|---|
| **Backend i18n** | *nothing external* | 100% software (see 1.2 §A) |
| **CDE adapters** | a physics reference sheet (CODATA constants, SEMF coefficients, habitable-zone bounds) | ~1 day software + 6 label translations |
| **Physics/Education i18n** | a bilingual PL↔EN STEM terminology glossary + a domain reviewer | mechanical string conversion (same seam already used) |
| **Grounded Chemistry (already done)** | — | already complete & verified |
| **Future: real ADMET / docking / target search** | ChEMBL + PubChem + PDB + UniProt + a model | **new feature build** — out of current scope |

### 1.2 Remaining work that is SOFTWARE, not knowledge — with effort estimates

These require **development, not acquisition**. Effort in engineer-days (ed), single senior dev.

**A. Backend internationalization — 100% software, no domain knowledge. ★ largest concrete task**
- Build a backend message catalog mirroring the frontend seam: `packages/backend/src/i18n/{en,pl}.mjs` + a `t(key, locale, params)` helper.
- Thread a `locale` through the request context (`Accept-Language` header → `ctx.locale`), default `en`.
- Extract the **488** Polish string literals across **79** files (auth, campaign, corpus, api handlers, error messages) into keys; replace literals with `t()`.
- Return localized `message` fields in API responses so the frontend stops surfacing raw Polish (this is the root cause of the lab-readiness leak already patched on the client side).
- Add a parity test (EN/PL key sets equal) mirroring the frontend `i18n.test`.
- **Effort:** catalog + context wiring **2 ed**; extraction/replacement of 488 strings **4–6 ed**; EN translations of those 488 (technical, non-domain — auth/validation/status text) **2–3 ed**; tests **1 ed**. **Total ≈ 9–12 ed.**
- **Acquisition needed: none.**

**B. Physics / Education i18n — software + translation (translation is the only "knowledge")**
- Mechanical: apply the existing `useI18n()` seam to ~14 lab modules + education screens (`GlossaryScreen`, `DiscoveryLogScreen`, `WhatIfScreen`, `QuantumDecisionExplorer`, `EngineeringNavigator`, `ConsequenceChainPanel`, `ModelConflictPanel`, `NodeLens`, `NarratorPanel`, `ScaleJourney`, `DiscoveryTimeline`, `CustomExperimentTab`, `RealityCanvas/Navigator`, `LabShell`) — ~706 strings.
- **Software effort:** ~**6–9 ed** (this session converted ~1,000+ strings across ~30 components at a comparable rate).
- **Translation effort (the knowledge part):** a bilingual STEM translator producing verified EN for the ~706 Polish strings, using the Part-2 glossaries so terms like *Jeans parameter*, *binding energy per nucleon*, *wavefunction collapse* are rendered correctly. ~**8–12 translator-days**. This is *human knowledge*, cheaply sourced (OpenStax/NIST/IUPAC/PDG), **not** a dataset ingestion.

**C. CDE adapters — mostly software, tiny knowledge**
- Convert the 2 adapters' 6 labels + the `CandidateDiscoveryScreen` chrome through the seam (~24 strings). **Software ≈ 1 ed.**
- Verify the encoded constants against authoritative refs: habitable equilibrium-temp band (200–330 K), Jeans-parameter retention threshold (≥15), SEMF binding-energy-per-nucleon cutoff (≥8.4 MeV), stability-valley gradient window. **Knowledge ≈ 0.5 day** with NIST CODATA + PDG + a nuclear-physics text. No dataset required.

**D. Cross-cutting software hardening surfaced in the audit (no knowledge needed)**
- **Stabilise the flaky backend test** (parallel port/timing contention): assign ports dynamically or serialise HTTP-binding tests. **≈ 0.5 ed.**
- **Add a lint script** (ESLint + config) — none exists today; `tsc --strict` is the only static gate. **≈ 1 ed.**
- **Add an i18n integration test** that boots every route in both locales and asserts no Polish-diacritic leakage under EN (codifies the manual scan). **≈ 1–2 ed.**
- **Code-split** the Three.js/physics bundle (index chunk ~945 kB). **≈ 1–2 ed.**
- **Backend i18n parity CI gate.** **≈ 0.5 ed.**

**Total remaining *software* to reach a fully bilingual, hardened current product:
≈ 20–28 engineer-days**, plus **≈ 8–12 translator-days** (the only true "knowledge" input, and it needs a *translator*, not a database).

### 1.3 What still requires software even *after* you acquire everything in Part 2

If you decide to expand scope into a real discovery platform, the datasets are necessary **but not
sufficient** — every one needs an engineered ingestion + integration layer:

| Future capability | Data (Part 2) | Software still required | Effort |
|---|---|---|---|
| Real ADMET prediction | ChEMBL, Tox21, PubChem BioAssay | model training/serving + calibration + provenance UI | 15–30 ed |
| Real molecular docking | PDB, PDBbind, RCSB | AutoDock Vina integration, pocket detection, job queue | 15–25 ed |
| Target / disease search | UniProt, Ensembl, Reactome, Open Targets | ETL into the knowledge graph + query API + UI | 10–20 ed |
| Literature grounding (RAG) | PubMed/PMC OA, Europe PMC, arXiv, OpenAlex, Crossref | ingest pipeline, embeddings store, citation UI, license filter | 20–35 ed |
| Patent landscaping | USPTO/EPO bulk, PatentsView | ETL + search + FTO disclaimer UI | 10–20 ed |
| Materials discovery | Materials Project, COD, OQMD | property store + featurization + adapters | 15–25 ed |

**Bottom line for Part 1:** the acquisition roadmap is a prerequisite for *new* modules, **but the
critical-path work to finish today's product is ~20–28 ed of software + ~2 weeks of translation,
none of which is blocked on the databases below.**

---

## Part 2 — Acquisition roadmap (per-source: what / why / where / license / files / folder / priority / module / uplift)

**Licensing legend:** 🟢 open & redistributable · 🟡 open with conditions (attribution / share-alike /
non-commercial) · 🔴 restricted or paid for bulk/commercial use. **Verify each license at download
time — terms change.** "Uplift (finish)" = value to *completing the current product*; "Uplift
(future)" = value to a *new discovery platform*, on a 0–5 scale.

### A. Foundational education & terminology (unblocks translation + is the cheapest, highest-leverage set)

| Source | What / files | Why | Where (official) | License | Priority | Module | Uplift finish / future |
|---|---|---|---|---|---|---|---|
| **OpenStax** | Textbooks: University Physics 1–3, Chemistry 2e, Biology 2e, Calculus, College Algebra — **PDF + the CNXML/HTML from their GitHub** | Canonical EN terminology for physics/chem/bio/math → drives correct lab & CDE translations; safe glossary corpus | openstax.org/subjects · github.com/openstax | 🟡 CC BY 4.0 | **Critical** | Physics, Education, CDE | **4** / 3 |
| **NIST** | CODATA constants (JSON), Atomic Spectra DB, Chemistry WebBook, DLMF (math functions) | Verifies CDE constants (equilibrium temp, escape/thermal velocity, SEMF); authoritative physics/chem values | physics.nist.gov · webbook.nist.gov · dlmf.nist.gov | 🟡 US-gov data, some SRD terms | **Critical** | CDE, Physics | **4** / 4 |
| **Particle Data Group (PDG)** | *Review of Particle Physics* PDF + `pdgLive`/data files | Nuclear/particle terminology & values for `nuclear.ts`, `particle.ts` | pdg.lbl.gov | 🟢 free | High | Physics, CDE | 3 / 3 |
| **IUPAC** | Gold Book (terminology) + nomenclature PDFs | Correct chemistry term translation (already partly done via RDKit) | goldbook.iupac.org · iupac.org | 🟡 free, attribution | High | Education, Chemistry | 3 / 2 |
| **MIT OpenCourseWare** | Course notes/problem sets (PDF) for 8.01/8.02/5.111/18.01 etc. | Pedagogical framing for Education module wording | ocw.mit.edu | 🟡 **CC BY-NC-SA** (⚠ NC — blocks commercial reuse) | Medium | Education | 2 / 1 |
| **OEIS / DLMF / ProofWiki** | OEIS (bulk `stripped.gz`), DLMF, ProofWiki dump | Mathematics lab terminology & sequences | oeis.org · dlmf.nist.gov · proofwiki.org | 🟢/🟡 (ProofWiki CC BY-SA) | Medium | Physics(math), Education | 2 / 2 |

### B. Chemistry & drug-discovery data (future ADMET/docking/target modules)

| Source | What / files | Why | Where | License | Priority | Module | Uplift finish / future |
|---|---|---|---|---|---|---|---|
| **PubChem** | Compounds (SDF bulk via FTP), BioAssay, PUG-REST API | Structures, properties, bioactivity for future grounding | pubchem.ncbi.nlm.nih.gov · ftp.ncbi.nlm.nih.gov/pubchem | 🟢 public domain | **Critical (future)** | Future discovery | 0 / 5 |
| **ChEMBL** | Full DB dump (SQLite/PostgreSQL, SDF), REST API | Curated bioactivities/targets → real ADMET/SAR | ebi.ac.uk/chembl · ftp.ebi.ac.uk/pub/databases/chembl | 🟡 **CC BY-SA 3.0** (share-alike) | **Critical (future)** | Future discovery | 0 / 5 |
| **Protein Data Bank (PDB)** | mmCIF/PDB structures (RCSB FTP), PDBbind | Docking targets & binding data | rcsb.org · files.rcsb.org · wwpdb.org | 🟢 CC0 | **Critical (future)** | Future discovery | 0 / 5 |
| **UniProt** | `uniprot_sprot` (XML/FASTA), REST API | Protein/target annotations for KG | uniprot.org · ftp.uniprot.org | 🟡 CC BY 4.0 | High (future) | Future discovery | 0 / 4 |
| **DrugBank** | Open-data subset (XML/CSV) | Drug/target reference | go.drugbank.com/releases | 🟡 open subset free; full is 🔴 paid | Medium (future) | Future discovery | 0 / 3 |
| **NIST Chemistry WebBook** | Thermochemistry, IR/MS spectra | Grounded physical-chemistry facts | webbook.nist.gov | 🟡 terms | Medium | Chemistry | 1 / 3 |
| **Crystallography Open Database (COD)** | CIF bulk | Materials/crystal structures | crystallography.net | 🟢 open | Optional (future) | Materials | 0 / 3 |

### C. Biology & pathways (future target/disease modules)

| Source | What / files | Why | Where | License | Priority | Module | Uplift finish / future |
|---|---|---|---|---|---|---|---|
| **Ensembl** | Genome/annotation (GFF3/FASTA), REST | Gene/target context | ensembl.org · ftp.ensembl.org | 🟢 no restrictions (EMBL-EBI) | High (future) | Future discovery | 0 / 4 |
| **Reactome** | Pathways (BioPAX/SBML, graph dump), API | Open pathway KG (KEGG alternative) | reactome.org | 🟢 CC0 | **High (future)** | Future discovery | 0 / 4 |
| **Gene Ontology + GOA** | OBO/OWL + annotations | Functional annotation of targets | geneontology.org | 🟡 CC BY 4.0 | High (future) | Future discovery | 0 / 4 |
| **WikiPathways** | GPML/RDF dumps | Open, redistributable pathways | wikipathways.org | 🟢 CC0 | Medium (future) | Future discovery | 0 / 3 |
| **KEGG** | Pathways/compounds | Reference pathways | kegg.jp / genome.jp | 🔴 **web free; bulk/commercial = PAID license** (KEGG/Pathway Solutions) | **Optional** — prefer Reactome/WikiPathways | Future discovery | 0 / 2 |
| **NCBI (GenBank/RefSeq/dbSNP/MeSH)** | Sequence + MeSH (XML) | Sequences + medical vocabulary | ncbi.nlm.nih.gov · ftp.ncbi.nlm.nih.gov | 🟢 mostly public domain | Medium (future) | Future discovery | 0 / 3 |

### D. Literature, metadata & discovery (future RAG / evidence grounding)

| Source | What / files | Why | Where | License | Priority | Module | Uplift finish / future |
|---|---|---|---|---|---|---|---|
| **OpenAlex** | Full snapshot (JSONL, S3) or API | Open scholarly graph — works/authors/concepts | openalex.org · docs.openalex.org | 🟢 CC0 | **High (future)** | Future RAG | 0 / 5 |
| **Crossref** | Metadata dump / REST API | DOIs, citations, licenses | crossref.org · api.crossref.org | 🟢 metadata CC0 | High (future) | Future RAG | 0 / 4 |
| **PubMed / PMC** | PMC **Open Access Subset** (XML/txt via FTP); E-utilities API | Redistributable biomedical full text | ncbi.nlm.nih.gov/pmc · ftp.ncbi.nlm.nih.gov/pub/pmc | 🟡 OA subset per-article CC; abstracts via API have terms | **High (future)** | Future RAG | 0 / 5 |
| **Europe PMC** | OA articles + REST/bulk | EU mirror, OA full text | europepmc.org | 🟡 OA subset CC | High (future) | Future RAG | 0 / 4 |
| **arXiv** | Metadata (Kaggle/OAI), full text via **AWS S3 requester-pays** | Preprints (physics/CS/math) | arxiv.org · info.arxiv.org/help/bulk_data | 🔴/🟡 **per-paper license varies**; bulk redistribution restricted | Medium (future) | Future RAG | 0 / 4 |
| **DOAJ** | Article metadata dump | Index of OA journals | doaj.org | 🟢 metadata CC0 | Medium (future) | Future RAG | 0 / 3 |
| **NASA ADS** | Astro literature API | Physics/astro references | ui.adsabs.harvard.edu | 🟡 API terms | Optional | Physics | 0 / 3 |

### E. Repositories & general datasets (per-item license — **check every LICENSE / deposit**)

| Source | What | License caution | Priority | Uplift finish / future |
|---|---|---|---|---|
| **Zenodo** | Datasets/software (DOI'd) | 🟡 per-deposit (many CC BY/CC0) | High (future) | 0 / 4 |
| **Figshare** | Datasets/figures | 🟡 per-item | Medium (future) | 0 / 3 |
| **Dryad** | Research datasets | 🟢 **CC0** (policy) | Medium (future) | 0 / 3 |
| **Kaggle Datasets** | Curated scientific datasets | 🟡 **per-dataset** (varies widely) | Medium (future) | 0 / 3 |
| **GitHub scientific repos** | RDKit, Open Babel, AutoDock Vina, ASE, scikit-bio, Biopython, DeepChem | 🟡 per-repo (BSD/MIT/Apache/GPL) — GPL affects distribution | High (future) | 1 / 4 |
| **Hugging Face / Papers with Code / OpenML** | AI models/datasets/benchmarks | 🟡 per-model/dataset | Medium (future) | 0 / 3 |

### F. Space, physics, environment, materials, medicine (authoritative, domain-specific)

| Domain | Sources (official) | License | Priority | Uplift finish / future |
|---|---|---|---|---|
| **Space** | NASA (data.nasa.gov, Earthdata, PDS), ESA (esa.int, Copernicus/CDS), CERN Open Data (opendata.cern.ch), LIGO GWOSC (gwosc.org) | 🟢 mostly public-domain/CC (⚠ check ESA per-asset) | Medium | 1 / 4 |
| **Physics** | NIST PML, PDG, HITRAN (hitran.org, spectroscopy) | 🟡 | High | 3 / 3 |
| **Materials science** | Materials Project (materialsproject.org, free API key), AFLOW, NOMAD, OQMD | 🟡 API terms / mixed | Optional (future) | 0 / 4 |
| **Medicine / regulatory** | WHO ICD-11 & guidelines, openFDA (open.fda.gov), EMA, ClinicalTrials.gov, RxNorm, NLM MeSH | WHO 🟡 **CC BY-NC-SA 3.0 IGO**; FDA/ClinicalTrials 🟢 US-gov; SNOMED/UMLS 🔴 license | Medium (future) | 0 / 4 |
| **Patents** | USPTO bulk (bulkdata.uspto.gov) + **PatentsView API**; EPO **OPS API**; ⚠ **do not scrape Google Patents** — use its **BigQuery public dataset** instead | USPTO 🟢 public domain; EPO 🟡 OPS terms; Google 🟡 BigQuery terms | Medium (future) | 0 / 3 |
| **Economics/social** | OECD (data.oecd.org), World Bank Open Data (🟢 CC BY 4.0), Our World in Data (🟢 CC BY) | OECD 🟡 terms | Optional | 0 / 2 |

---

## Part 3 — Folder structure (Genesis Knowledge Base)

Store everything under a top-level `knowledge-base/` (git-ignored; large binaries do **not** belong
in the repo — track provenance manifests instead). Suggested tree:

```
knowledge-base/
├── MANIFEST.md                     # index: source, version, license, download date, sha256
├── LICENSES/                       # a copy of each source's license text (compliance record)
├── education/
│   ├── openstax/{physics,chemistry,biology,math}/   # PDF + cnxml
│   ├── mit-ocw/            (⚠ NC — segregate; not for commercial reuse)
│   └── iupac-goldbook/
├── reference-constants/            # drives CDE + physics labs
│   ├── nist-codata/constants.json
│   ├── pdg/rpp.pdf + data/
│   └── dlmf/
├── glossaries/                     # PL↔EN STEM terminology used by translators
│   └── stem-terms.csv
├── chemistry/
│   ├── pubchem/{sdf,bioassay}/
│   ├── chembl/  (CC BY-SA — keep license visible in derived outputs)
│   ├── nist-webbook/
│   └── cod/
├── biology/
│   ├── uniprot/  ├── ensembl/  ├── reactome/  ├── wikipathways/  ├── geneontology/
│   └── ncbi/{refseq,mesh}/
├── literature/
│   ├── openalex/   ├── crossref/   ├── pmc-oa-subset/   ├── europepmc/
│   ├── arxiv/  (⚠ per-paper license; store license field per record)
│   └── doaj/
├── physics-space/
│   ├── nasa/  ├── esa/  ├── cern-opendata/  ├── ligo-gwosc/  └── hitran/
├── materials/{materials-project,cod,oqmd,nomad}/
├── medicine/{who-icd11,openfda,clinicaltrials,rxnorm,mesh}/   (⚠ SNOMED/UMLS excluded unless licensed)
├── patents/{uspto-bulk,patentsview,epo-ops}/
├── repos/                          # cloned scientific code (submodules or pinned tags)
│   └── {rdkit,openbabel,autodock-vina,biopython,ase,deepchem}/
└── _ingested/                      # normalized parquet/JSONL Genesis actually loads
    └── ...                         # produced by the ingestion pipeline (Part 1.3)
```

**Compliance rules baked into the structure:**
- `MANIFEST.md` + `LICENSES/` make every asset's license auditable → the "largest *legally usable*"
  goal is enforced by construction.
- MIT-OCW (NC) and any 🔴 source are physically segregated so a commercial build can exclude them.
- Share-alike sources (ChEMBL CC BY-SA, ProofWiki CC BY-SA) must carry their license into any
  derived/exported artifact — note this in `_ingested/` outputs.
- `knowledge-base/` is git-ignored; only `MANIFEST.md` + `LICENSES/` + small glossaries are committed.

---

## Part 4 — Master checklist (step-by-step)

### Phase 0 — Decide scope (do this first)
- [ ] Confirm whether you are (a) **finishing the current product** or (b) **expanding into a
      discovery platform**. If (a) only, you need almost none of Section B–F — skip to the
      translation + software plan in Part 1.

### Phase 1 — Finish the current product (no big downloads)
- [ ] Acquire **OpenStax** (physics/chem/bio/math) + **NIST CODATA** + **PDG** + **IUPAC Gold Book**
      → `knowledge-base/education/` + `reference-constants/` + `glossaries/`.
- [ ] Build **PL↔EN STEM glossary** (`glossaries/stem-terms.csv`) from the above.
- [ ] **Software:** implement backend i18n (Part 1.2 §A, ~9–12 ed).
- [ ] **Software + translation:** convert physics/education labs + CDE via the seam (§B/§C).
- [ ] **Software:** flaky-test fix, lint script, i18n integration test, bundle split (§D).

### Phase 2 — Foundation for future discovery (only if expanding scope)
- [ ] **Critical:** PubChem (FTP SDF), ChEMBL (dump), PDB (RCSB FTP), UniProt (Swiss-Prot).
- [ ] **High:** Reactome (CC0), Ensembl, Gene Ontology, OpenAlex (CC0 snapshot), Crossref, PMC OA subset.
- [ ] **Medium:** Europe PMC, WikiPathways, DrugBank open subset, NIST WebBook, Zenodo/Dryad targeted sets.
- [ ] **Optional / license-gated:** KEGG (prefer Reactome), arXiv bulk (per-paper license), SNOMED/UMLS (license), OECD, patents.
- [ ] For **every** download: record source + version + license + date + sha256 in `MANIFEST.md`,
      copy license into `LICENSES/`, segregate 🔴/NC sources.

### Phase 3 — Integrate (software, Part 1.3)
- [ ] Build the ingestion pipeline (normalize → `_ingested/` parquet/JSONL).
- [ ] Add per-capability adapters + provenance UI + license-filter gate.
- [ ] Each future module: 10–35 ed of software on top of the data (see Part 1.3 table).

---

### One-paragraph honest summary
Finishing today's Genesis needs **~20–28 engineer-days of software + ~2 weeks of STEM
translation** — and the *only* external knowledge required is a physics/chem glossary
(OpenStax + NIST + PDG + IUPAC), **not** any database. Backend i18n specifically needs **zero**
domain knowledge. The PDB/ChEMBL/PubChem/UniProt/OpenAlex tier is real and valuable, but it
belongs to a *future, scope-expanding* discovery platform, and each of those datasets still
requires 10–35 ed of integration software before it improves Genesis at all. Build the glossary
+ do the software to finish; acquire the database tier only when you decide to expand.
