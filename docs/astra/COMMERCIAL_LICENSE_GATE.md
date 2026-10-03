# Commercial licence gate

Updated 2026-10-01 against authoritative sources and main `5d064c4e`, PR54 `fc29ef60`, PR56 `0a372cdd`. This is an engineering admission audit, not a legal opinion or blanket commercial release clearance.

## Exact item and use decisions

- `APPROVED`: authoritative terms and completed notices permit the declared use of the identified item.
- `CONDITIONAL`: commercial use requires recorded attribution, redistribution, origin or deployment obligations; resolve these for the concrete item before use.
- `BLOCKED`: terms or product evidence forbid the declared use. A scientific product block is separate from copyright restrictions.
- `UNKNOWN`: authoritative terms, provenance or intended-use scope are not established.

UNKNOWN/BLOCKED fail closed. Human approval cannot manufacture rights. API access, payment, an OA label or a code licence does not establish rights to all text, data, weights or deliverables.

Each delivery item requires `itemId`, category, exact version/accession/hash, source URL, licence text/hash, intended use (retrieval, storage, model input/training, display, redistribution), distribution mode, status, obligations, decision owner/date and evidence refs. Missing evidence remains UNKNOWN. A mutable policy URL below is discovery evidence, not a pinned release manifest. Preserve a terms snapshot/hash and actual admitted source bytes when assembling the release.

## Literature and data

| Item and intended scope | Status | Authoritative evidence and condition |
|---|---|---|
| Europe PMC metadata/API discovery | CONDITIONAL | [Services](https://europepmc.org/developers), [OA policy](https://europepmc.org/downloads/openaccess): supported channels and provenance; metadata access is not full-text clearance |
| Europe PMC text, abstracts, figures, supplements | CONDITIONAL per item | [OA policy](https://europepmc.org/downloads/openaccess): article licences differ. Check exact material and commercial use; free-to-read is insufficient |
| Europe PMC NC/restricted content for commercial redistribution | BLOCKED absent separate rights | Article terms control; absent licence is UNKNOWN rather than presumed permissive |
| PubChem | CONDITIONAL per origin | [Downloads](https://pubchem.ncbi.nlm.nih.gov/docs/downloads), [source catalogue](https://pubchem.ncbi.nlm.nih.gov/docs/data-sources): contributor terms apply. Pin record/release and source; not blanket public domain or independent measurements |
| ChEMBL | CONDITIONAL | [Database](https://www.ebi.ac.uk/chembldb/), [licensing](https://chembl.github.io/chembl-licensing/): CC BY-SA 3.0, release attribution and applicable share-alike/change notices |
| BindingDB own curation | CONDITIONAL | [Provider paper](https://www.bindingdb.org/rwd/bind/gkae1075.pdf): CC BY 4.0; cite origin and modifications, pin dump/rows |
| ChEMBL-derived records in BindingDB | CONDITIONAL | Same provider paper explicitly retains CC BY-SA 3.0; preserve per-record origin and inherited terms |
| Reactome database/derived data files | APPROVED for CC0 data | [Licence](https://reactome.org/license): CC0 data; pin scientific release/provenance. Illustrations/code/FoamTree have separate terms |
| Reactome illustrations/code | CONDITIONAL | Same policy: illustrations CC BY 4.0; software and third-party components separately licensed. Data clearance does not cover all assets |
| HPA copyrightable database content | CONDITIONAL | [Licence](https://www.proteinatlas.org/about/licence): CC BY 4.0, publication/site and item/version citations; separate third-party checks |
| HPA AlphaFold 3 subset for commercial use | BLOCKED absent separate rights | HPA external-data table lists CC BY-NC-SA 4.0; general CC BY does not override that subset |
| UniProt copyrightable database content | CONDITIONAL | [Official licence](https://www.uniprot.org/help/license), [official API policy](https://www.uniprot.org/api-documentation/support-data), [provider-supplied declaration](https://pubchem.ncbi.nlm.nih.gov/source/15338): CC BY 4.0. Pin accession/release, attribution/changes; external cross-references are not automatically cleared. Direct help extraction was JavaScript-limited; indexed official API text and provider declaration support this conditional classification |
| RCSB PDB archive/API data | APPROVED for CC0 data | [Usage policy](https://www2.rcsb.org/pages/usage-policy): CC0 archive/API data; entry/chain/state/hash and scientific citation still required. Target preparation/admission are separate |
| RCSB prose or illustrations outside that scope | CONDITIONAL or UNKNOWN per asset | Same policy distinguishes copyrighted articles and CC BY illustrations; do not bulk-clear site content |
| PoseBusters benchmark record 8278563 | CONDITIONAL | [Exact Zenodo record](https://zenodo.org/records/8278563), [metadata](https://zenodo.org/api/records/8278563): CC BY 4.0. Pin file/hash and actual subset, preserve PDB origins. Original 428 cases differ from 308-case journal subset; licence is not scientific validation |
| Unidentified PoseBusters/Astex archive/subset | UNKNOWN | A benchmark name does not identify licensed bytes. Match release, source chain and subset before export |
| CERN CMS record 5208 | APPROVED for this CC0 record | [Exact record](https://opendata.cern.ch/record/5208): CC0; educational subset unsuitable for full physics analysis. No CERN endorsement |
| Other CMS Open Data | CONDITIONAL | [CMS policy](https://opendata.cern.ch/record/415/files/CMS-Data-Policy-1.3.pdf); check exact record/citation. Unrelated U.S. CMS health datasets remain UNKNOWN |
| Customer/private or clinical data | UNKNOWN until contract | Exact rights, lawful basis, privacy classification, retention and export terms required |

## Code models and release dependencies

| Item | Status | Scope and action |
|---|---|---|
| Genesis code/contributors | CONDITIONAL | Confirm company ownership, assignments and customer terms |
| Exact npm/Python dependencies, containers/base images | UNKNOWN until release audit | Exact-build SBOM, transitive notices, OS/GPU/runtime and redistribution review |
| RDKit code | CONDITIONAL | BSD-3-Clause baseline; pin actual distribution/notices. ResearchRun adapter does not clear transitive dependencies |
| Vina/PySCF code | CONDITIONAL | Apache-2.0 baseline; pin distribution/dependencies. PR56 ports exist; runtime, inputs and integration separately gated |
| OpenMM/Biopython code | CONDITIONAL | Exact component/distribution notices. PR56 OpenMM is a bounded TIP3P reference, not candidate MD validation |
| ADMET and retrosynthesis code versus weights/data/templates/stock | UNKNOWN release clearance; commercial execution BLOCKED by PR56 admission | Reuse Sol S6/S8 gates and audit. Code permission does not establish model/training/template/stock rights; no Astra override |
| PoseBusters inspected upstream source | CONDITIONAL | [Pinned LICENSE](https://github.com/maabuu/posebusters/blob/1dd61e568d4507b5ab5579e161806447bca3b859/LICENSE) is MIT, retain notice. [PyPI 0.6.5](https://pypi.org/project/posebusters/0.6.5/) metadata says BSD: inspect the actual shipped archive, not metadata/current upstream alone |
| GNINA code | CONDITIONAL | [Pinned explanation](https://github.com/gnina/gnina/blob/6fe1ce2bb9c35c8067de9f49bb9169857dfbad70/README.md#license): GPL/Apache; Apache-only use requires removing OpenBabel references. Verify build/linkage/dependencies/notices; GPL itself is not a commercial-use prohibition |
| GNINA weights/training data | UNKNOWN | Model-specific authoritative grants/provenance needed; code terms do not establish them |
| GNINA product admission | BLOCKED | Main [Run 8](../evidence/posebusters-run8-unseen-benchmark.md): DOES_NOT_GENERALISE. Benchmark-only; no product promotion through changed wording or licence status |
| Proprietary APIs/hosted models | UNKNOWN until agreement | Retention, region, output/data rights, intended use and availability |
| 3D/images/GLB assets | UNKNOWN until item evidence | Author/source/licence/hash; scientific data licence does not clear visual assets |

## Immutable evidence and limits

Read through upstream GitHub content APIs on 2026-10-01; SHA-256 values cover decoded original bytes, not rendered HTML. These are audit pins, not assertions that Genesis ships these revisions.

| Source | Revision/file | SHA-256 |
|---|---|---|
| GNINA | `6fe1ce2bb9c35c8067de9f49bb9169857dfbad70/README.md` | `b6ed3a633154d49044478f2f9af3199b6fdecb0ed75ec566c1a9903ceddcafb9` |
| PoseBusters | `1dd61e568d4507b5ab5579e161806447bca3b859/LICENSE` | `90bc701d0de82dc12c78cfde9f7d4c5d66e2dbc21604d95b67c5ad4e368a4149` |

Policy pages are discovery references, not falsely pinned delivery datasets. The release manifest covers only the used transitive components with actual accepted decisions; unrelated repository experiments do not become approved or block that release. Chemistry/biology/physics priorities are in [Genesis Advantage Track](./GENESIS_ADVANTAGE_PLAN.md).
