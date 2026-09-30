# Commercial license gate

This is an engineering clearance framework, not legal advice. Final commercial deployment should be reviewed by counsel for the selected distribution model and jurisdiction.

## Classification

| Status | Meaning |
|---|---|
| `APPROVED` | Exact pinned artifact and intended use were reviewed; obligations are implemented |
| `CONDITIONAL` | Commercial use may be possible after stated obligations or deployment restrictions |
| `BLOCKED` | Known terms conflict with the intended commercial use or redistribution |
| `UNKNOWN` | Authoritative terms, provenance or artifact identity are missing |

`UNKNOWN` and `BLOCKED` fail closed for customer delivery.

## Required record

Every dependency, dataset, model or asset records:

- category and exact artifact name;
- version, hash and source URL;
- copyright owner/provider;
- SPDX identifier where applicable;
- authoritative terms URL and captured date;
- intended use: SaaS, internal compute, on-prem distribution, container distribution, report redistribution;
- commercial-use, modification, derivative, redistribution and attribution decisions;
- source-code disclosure or share-alike obligations;
- model-weight and training-data terms separately;
- personal/clinical data restrictions;
- decision, reviewer, date and remediation.

## Pilot priority matrix

These are preliminary classifications. They become `APPROVED` only after the exact locked artifacts and transitive SBOM are verified.

| Component | Known upstream terms | Preliminary status | Gate |
|---|---|---|---|
| Genesis proprietary code | Repository is proprietary/unlicensed externally | `CONDITIONAL` | Confirm company ownership, contributor assignments and customer license |
| RDKit | BSD-3-Clause | `CONDITIONAL` | Pin version; ship copyright/license notices; scan bundled components |
| PySCF | Apache-2.0 | `CONDITIONAL` | Preserve LICENSE/NOTICE; review optional extensions separately |
| AutoDock Vina | Apache-2.0 | `CONDITIONAL` | Preserve notices; verify bundled AutoDock parameter/data files separately |
| Meeko | LGPL-2.1 | `CONDITIONAL` | Keep separable library usage; provide notices/source obligations for distributed form |
| OpenMM | Mixed by platform: core/CPU mainly MIT, CUDA/OpenCL portions LGPL and bundled components have their own terms | `CONDITIONAL` | Resolve actual platform and every distributed binary/library |
| Biopython | Biopython License; some files dual BSD-3-Clause | `CONDITIONAL` | Pin distribution and include the exact license set |
| ADMET-AI code | MIT | `CONDITIONAL` | Code clearance does not clear weights/training datasets |
| ADMET-AI weights | Bundled model artifacts trained on TDC datasets | `UNKNOWN` | Record checkpoint hashes and authoritative weight terms |
| TDC training datasets | Dataset-specific terms | `UNKNOWN` | Review every endpoint dataset; do not infer from TDC code license |
| RCSB PDB archive files | CC0 1.0; external integrated data can carry provider terms | `CONDITIONAL` | Promote only an exact PDB ID/release/hash after review; cite authors/RCSB and gate integrated external annotations separately |
| ChEMBL data | CC BY-SA 3.0 plus EMBL-EBI terms | `CONDITIONAL` | Attribution, share-alike/database redistribution analysis, release DOI and API-use policy |
| PubChem | US government/public resource with provider and third-party caveats | `CONDITIONAL` | Capture exact record provenance and NCBI usage/API policy; do not treat third-party submissions as cleared by default |
| Customer structures/data | Customer contract and data-processing terms | `UNKNOWN` until intake | Customer warranty, permitted purpose, retention, deletion and confidentiality |
| Scientific publications | Publisher/article-specific copyright and open-access license | `CONDITIONAL` | Store citations/passages only as permitted; full text requires redistribution rights |
| BodyParts3D anatomy | CC BY 4.0 | `CONDITIONAL` | Required attribution, modification notice and source record |
| HRA/VHP-derived anatomy | Source-specific and VHP/NLM review outstanding | `BLOCKED` for commercial release until cleared | Written legal review and provenance chain |
| Unknown local GLB/images/models | Missing authoritative provenance/license | `BLOCKED` | Replace or document source, author, license and hash |
| NC/editorial-only/watermarked/ripped assets | Noncommercial or prohibited origin | `BLOCKED` | Do not ship or use in commercial demos |
| External AI/API services | Provider terms, DPA, region and output/data-use rules | `UNKNOWN` until provider/version selected | Capture terms snapshot; prohibit training/retention where required |

## Deployment changes the answer

The audit must separately evaluate:

1. hosted SaaS with no binary distribution;
2. private/dedicated cloud;
3. customer on-prem container distribution;
4. source-available delivery;
5. report/data redistribution.

LGPL, share-alike and database-license obligations can differ materially between these modes.

## Automated release gates

- SBOM contains every direct and transitive package and base image.
- All artifacts in the transitive closure actually executed or delivered by the pilot map to a license record; unrelated repository assets remain excluded rather than blocking the pilot.
- License/notice bundle is generated from pinned artifacts.
- `UNKNOWN`, `BLOCKED`, NC, editorial-only and unverified assets fail the commercial build.
- Copyleft/share-alike components trigger a deployment-specific human review.
- Model code, weights, training data and output terms are never collapsed into one row.
- Dataset snapshots include release, query, retrieval time and hash.
- Terms snapshots are retained with review date because online terms change.
- License evidence is pinned to a tag/commit/release or captured terms snapshot with hash; a moving `master` URL alone is insufficient.

## Authoritative sources reviewed

- RDKit BSD-3-Clause: https://github.com/rdkit/rdkit/blob/master/license.txt
- PySCF Apache-2.0: https://github.com/pyscf/pyscf
- AutoDock Vina Apache-2.0: https://github.com/ccsb-scripps/AutoDock-Vina
- Meeko LGPL-2.1: https://github.com/forlilab/Meeko
- OpenMM component licenses: https://github.com/openmm/openmm/blob/master/docs-source/licenses/Licenses.txt
- ADMET-AI MIT code: https://github.com/swansonk14/admet_ai/blob/main/LICENSE.txt
- Biopython license information: https://biopython.org/wiki/SourceCode
- ChEMBL data license: https://chembl.gitbook.io/chembl-interface-documentation/about
- RCSB PDB policy: https://www.rcsb.org/pages/policies
- EMBL-EBI terms: https://www.ebi.ac.uk/about/terms-of-use/
