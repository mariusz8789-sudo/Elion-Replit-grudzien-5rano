# Biotech source findings

## Candidate source selected for the first fixture

**PubChem PUG REST (NIH/NLM)** is the selected public source for the first small, pinned compound fixture. The official documentation states that PUG REST is an HTTP API built around stable PubChem identifiers: SID for substances, CID for compounds, and AID for assays. It supports JSON output and property retrieval by CID/name/structure, and is intended for small programmatic requests rather than bulk extraction. Source: https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest-tutorial

## Why not claim more than the source provides

PubChem compound records can provide chemical identity/properties, but a compound record alone does not establish a biological target, therapeutic efficacy, or safety claim. Missing fields must remain `UNKNOWN` or `VERIFY_REQUIRED`; no BiologicalEvidence/SafetySignal should be fabricated from a chemical record.

## Alternative considered

ChEMBL provides a public manually curated bioactivity database and documented web services, but a first fixture must still define a pinned release/query and preserve its exact release metadata. Source: https://chembl.gitbook.io/chembl-interface-documentation/web-services and https://www.ebi.ac.uk/chembl/

## Implementation boundary

The next implementation may add only a source-neutral adapter/fixture for a small, deterministic PubChem CID property response, preserving source URL, CID, retrieval date, and response fingerprint. It must not create biological targets, toxicity claims, rankings of therapies, or biological execution from compound identity alone.
