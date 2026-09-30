# Commercial licence gate

## Policy

Every item actually executed, embedded, redistributed or shown to a customer receives one status:

- `APPROVED`: authoritative terms and required notices permit the declared use;
- `CONDITIONAL`: commercial use appears possible only with recorded obligations or deployment limits;
- `BLOCKED`: terms or product evidence prohibit the declared use;
- `UNKNOWN`: authoritative terms, provenance or scope have not been established.

`UNKNOWN` and `BLOCKED` fail closed. Human approval cannot manufacture rights.

## Required record

`itemId`, category, exact version/hash, supplier/source URL, licence text/hash, intended use, distribution mode, status, obligations, decision owner, review date and evidence references.

## Current audit baseline

| Category / item | Status | Basis and required action |
|---|---|---|
| Genesis source code | `CONDITIONAL` | Confirm company ownership, contributor assignments and customer licence before sale |
| npm/Python transitive dependencies | `UNKNOWN` | Generate SBOM for the exact build; review every shipped dependency and notice |
| RDKit | `CONDITIONAL` | BSD-3-Clause; pin build and retain notices; ResearchRun adapter exists |
| AutoDock Vina | `CONDITIONAL` | Apache-2.0 code; pin binary/container and notices; no current ResearchRun adapter |
| OpenMM | `CONDITIONAL` | permissive code with component notices; pin distribution; no current ResearchRun adapter |
| PySCF | `CONDITIONAL` | Apache-2.0; pin distribution and dependencies; secondary vertical only |
| Biopython | `CONDITIONAL` | Biopython licence / file-specific terms; include exact distribution notices |
| Containers/base images | `UNKNOWN` | Review image, OS packages, CUDA/GPU terms and redistribution mode per digest |
| Proprietary/hosted models and APIs | `UNKNOWN` | Record provider contract, retention, training use, region, output rights and availability |
| Model weights generally | `UNKNOWN` | Code licence does not prove weight or training-data rights |
| GNINA code | `CONDITIONAL` | Dual GPL/Apache; Apache-only use requires removing OpenBabel references and verification |
| GNINA weights | `UNKNOWN` | Establish model-by-model weight and training-data rights |
| GNINA product use | `BLOCKED` | Run 8 concluded `DOES_NOT_GENERALISE`; benchmark evidence must not enter product claims |
| PoseBusters package | `CONDITIONAL` | BSD package; pin version and notices |
| PoseBusters benchmark inputs | `UNKNOWN` | Third-party structural datasets require their own licence/provenance review |
| ChEMBL | `CONDITIONAL` | Pin release and comply with CC BY-SA/data attribution; verify exact exported subset |
| PubChem | `CONDITIONAL` | PubChem aggregates hundreds of contributors; pin record/FTP release, preserve source attribution, and review the originating source licence because PubChem availability is not a blanket commercial licence |
| RCSB PDB structures | `CONDITIONAL` | Record entry provenance, citations and third-party annotations; target remains runtime/data gated |
| BindingDB curated data | `CONDITIONAL` | Current publication states CC BY 4.0; pin dump and attribution; verify source-record restrictions |
| Reactome data | `APPROVED` | Data and derived files are CC0; still pin release and cite as scientific provenance |
| Human Protein Atlas | `CONDITIONAL` | CC BY 4.0 for copyrightable database parts; item citation required; third-party fields need separate review |
| Europe PMC metadata/API | `CONDITIONAL` | Use supported APIs and retain provenance |
| Europe PMC full text | `CONDITIONAL` | Article-specific licence controls reuse; only approved OA subset content may be redistributed |
| Scientific publications generally | `CONDITIONAL` | Citation metadata is distinct from copyrighted full text/figures; check each article |
| CMS Open Data (CERN experiment) | `CONDITIONAL` | CMS policy releases data under CC0 with persistent citation expected; pin exact record |
| U.S. CMS health datasets | `UNKNOWN` | Dataset-specific privacy, suppression and use terms; never infer from CERN CMS |
| Customer/private scientific data | `UNKNOWN` | Requires contract, lawful basis, privacy/security classification and retention terms |
| Existing 3D/images/GLB assets | `UNKNOWN` | Require author/source/licence/hash; unproven assets cannot enter commercial deliverable |
| External services | `UNKNOWN` | Review ToS, DPA, SLA, data use, output rights, export controls and subprocessors |

## Gate outcome

The commercial release manifest includes only the transitive closure of components used by the selected vertical. Unrelated repository experiments neither become approved nor block the pilot; they remain outside the deliverable.

## Authoritative references checked on 2026-09-30

- [Reactome licence](https://reactome.org/license)
- [Human Protein Atlas licence](https://www.proteinatlas.org/about/licence)
- [Europe PMC copyright](https://europepmc.org/Copyright) and [Open Access subset](https://europepmc.org/downloads/openaccess)
- [PubChem downloads and source-specific licensing](https://pubchem.ncbi.nlm.nih.gov/docs/downloads)
- [GNINA upstream licence explanation](https://github.com/gnina/gnina#license)
- [PoseBusters package record](https://pypi.org/project/posebusters/)
- [CMS Open Data policy](https://opendata.cern.ch/record/415/files/CMS-Data-Policy-1.3.pdf)
- [BindingDB 2024 database paper](https://www.bindingdb.org/rwd/bind/gkae1075.pdf)

Exact engine repositories/licence files and dataset records remain required in each release decision. This is an engineering gate, not a legal opinion.
