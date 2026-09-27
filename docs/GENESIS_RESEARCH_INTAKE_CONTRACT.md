# Genesis Research Intake Contract

**Module:** `packages/backend/src/campaign/researchIntake.mjs`
**Tests:** `packages/backend/src/campaign/researchIntake.test.mjs` (42 tests), `packages/backend/src/apiResearchIntake.test.mjs` (15 tests)
**API:** `POST /api/projects/:id/research-intake`
**Contract version:** `RESEARCH_INTAKE_CONTRACT_VERSION = '1.0.0'`

## What this is

The governed intake layer between a raw research question and Genesis's EXISTING candidate and
campaign engines. It classifies the input, resolves its identity honestly, grounds it against a
disease/target only when a real source backs the grounding, discovers candidates without ever
inventing one, and hands the result to the existing campaign pipeline — never a second one.

This file adds **no second Drug Discovery engine, no second campaign orchestrator, no second
identity client, no second Evidence source of truth.** Every real computation is delegated:

| Concern | Delegated to |
|---|---|
| SMILES identity/canonicalization | `campaign/drugAdapter.mjs` (RDKit-backed), guarded by `campaign/scientificIntegration.mjs::candidateIdentityGuard` |
| External PubChem/ChEMBL lookups | `biotechProxy.mjs::fetchBiotechSource` (the one allowlisted egress path in this repo) |
| Bundled, hash-verified target activity data | `campaign/glp1rDataset.mjs`, `campaign/giprQsar.mjs` (via `campaign/activityDataset.mjs`) |
| Compute-stage capability checks | `campaign/toolchain.mjs::capabilityAvailable` |
| Campaign persistence | `campaign/persistence.mjs::createCampaign/addCandidate` |
| Deterministic hashing | `provenance.mjs::sha256Hex16` |

## 1. Accepted input types

```
DISEASE_OR_CONDITION | BIOLOGICAL_TARGET | COMPOUND_NAME | CAS_NUMBER |
PUBCHEM_CID | CHEMBL_ID | MOLECULAR_FORMULA | SMILES | VACCINE_OR_BIOLOGIC_REQUEST
```

`classifyResearchInput(originalQuery, declaredInputKind = 'AUTO')` is deterministic and
non-LLM. If `declaredInputKind` is anything other than `'AUTO'`, it is trusted as the caller's
own declaration and is **never silently overridden** — Genesis does not reinterpret one modality
as another. In `AUTO` mode, detection order is: vaccine/biologic keywords → ChEMBL ID shape →
CAS shape → bare integer (PubChem CID) → real RDKit canonicalization success (SMILES) →
plausible element-only formula → bundled target alias → bundled disease/target keyword →
otherwise `COMPOUND_NAME` (which will itself honestly fail via `BLOCKED_SOURCE` if wrong, never
fabricating anything).

## 2. Canonical flow

```
RESEARCH INPUT
  → INPUT CLASSIFICATION            (classifyResearchInput)
  → IDENTITY RESOLUTION             (resolveIdentity)            [compound-identity inputs]
  → TARGET/DISEASE GROUNDING        (groundDiseaseOrTarget)      [target/disease inputs]
  → SOURCE-BACKED CANDIDATE SET     (discoverBundledCandidates / candidateFromResolvedIdentity)
  → [EXISTING CAMPAIGN]             (prepareCampaignDraft, opt-in)
  → [EXISTING COMPUTE ENGINES]      (checkRequestedComputeCapabilities — capability check only)
  → RESEARCH OUTPUT                 (one ResearchIntakeResult, resolveResearchIntake)
```

A vaccine/biologic request short-circuits immediately to `BLOCKED_MODALITY` (§6) and never enters
the small-molecule identity/candidate path.

## 3. Identity resolution rules

- **SMILES**: resolved entirely offline through `candidateIdentityGuard({ smiles })` (the same
  reusable pre-check every generated candidate already goes through before persistence), then
  `drugAdapter.describe` for formula/InChI/InChIKey. No external source needed.
- **Compound name / PubChem CID / ChEMBL ID / CAS number**: resolved only through the real,
  allowlisted `biotechProxy.mjs` egress. An unreachable provider, a 4xx/5xx response, or a record
  with no usable structure returns `BLOCKED_SOURCE` — **never an invented SMILES.**
- **CAS number**: a CAS-shaped string is validated against its own Luhn-style check digit
  (`isValidCasChecksum`) before any lookup is attempted. Matching the regex shape alone is never
  accepted as a verified identity — a checksum-invalid CAS-shaped string returns
  `BLOCKED_IDENTITY` without ever calling out to a source.
- **Molecular formula**: never a unique chemical identity (isomers share a formula). Always
  produces the distinct internal `'PARTIAL'` identity status, surfaced as `PARTIALLY_RESOLVED` —
  real, honest, partial information, not a failure.
- **Conflicting identifiers**: when a request carries a `secondaryIdentifier`, both identities are
  resolved independently and compared (`detectIdentityConflict`) on formula and InChIKey. A
  genuine disagreement between two independently RESOLVED identities returns
  `CONFLICTING_IDENTITY` with the specific conflicting field.
- **No scraping, no generic URL fetching.** Every external call goes through the single
  allowlisted `fetchBiotechSource` (PubChem PUG-REST, ChEMBL REST) — nothing else.

## 4. Disease/target grounding requirements

`groundDiseaseOrTarget(inputKind, value)` only ever claims a grounding that is genuinely
source-backed in this repo:

- **`BUNDLED_TARGETS`**: `GLP1R` (`CHEMBL1784`, Homo sapiens, via `glp1rDataset.mjs`) and `GIPR`
  (`CHEMBL4383`, Homo sapiens, via `giprQsar.mjs`) — the only two targets with a bundled,
  sha256-verified ChEMBL activity pin in this repo.
- **`DISEASE_TO_TARGET_KEYWORDS`**: a small, explicit, hardcoded mapping (type 2
  diabetes/obesity → GLP1R/GIPR) backed by the SAME pharmacology this repo's own
  `campaign/tirzepatideBaseline.mjs` comparator dataset already documents — never invented for
  this module.
- Any disease/target input that matches neither returns `BLOCKED_TARGET` with an explicit reason.
  **A disease name alone never invents a target, mechanism, or binding claim.**
- A direct target alias match (e.g. "GLP1R") is treated as `RESOLVED`; a disease→target
  *inference* (e.g. "type 2 diabetes" → GLP1R) is treated as `PARTIALLY_RESOLVED`, since it is one
  inferential step further from the user's literal input.

## 5. Candidate origin classification

Every candidate carries exactly one origin:

```
SOURCE_BACKED_KNOWN_COMPOUND | USER_SUPPLIED_COMPOUND | GENERATED_HYPOTHESIS | UNRESOLVED
```

- Candidates pulled from a bundled activity pin (`discoverBundledCandidates`) are always
  `SOURCE_BACKED_KNOWN_COMPOUND`, carrying the pin row's own recorded `sourceUrl`/`sourceId`.
- A directly resolved identity (`candidateFromResolvedIdentity`) is `USER_SUPPLIED_COMPOUND` when
  the caller supplied the SMILES directly, `SOURCE_BACKED_KNOWN_COMPOUND` when it came back from a
  real PubChem/ChEMBL lookup, and `UNRESOLVED` when identity resolution did not reach `RESOLVED`.
- This module never generates a `GENERATED_HYPOTHESIS` candidate itself (it has no generative
  engine) — the classification exists so that if/when the existing campaign engine's own
  candidate generation is surfaced through this layer in a future change, generated candidates are
  never silently mixed with known compounds without their origin being visibly different.
- Candidate IDs are derived entirely from content (`contentCandidateId`, `sha256Hex16`), never a
  mutable counter, so two independent runs over the same input always produce the same candidate
  IDs (required for deterministic replay, §8).
- **Ranking is a research-priority ordering only — it never proves or claims medical efficacy.**

## 6. Vaccine / biologic modality separation

A request matching vaccine/antibody/protein/peptide/nucleic-acid/biologic keywords
(`VACCINE_KEYWORDS`) is classified `VACCINE_OR_BIOLOGIC_REQUEST` and routed to
`buildModalityBlockedResult`, which returns `status: 'BLOCKED_MODALITY'` **before any
small-molecule identity, candidate, or compute-stage code runs.** It never fabricates an antigen
sequence, epitope, immunogenicity estimate, or vaccine efficacy claim. The result carries:

- `blockedCapabilities: ['SMALL_MOLECULE_PIPELINE_NOT_APPLICABLE']`
- `nextExperiment.requiredNextData`: what a real specialist pipeline would need (a verified
  antigen/target sequence, a modality-appropriate engine)
- `nextExperiment.requiredSpecialistCapability`: `'VACCINE_OR_BIOLOGIC_DESIGN_ENGINE (not implemented)'`
- `nextExperiment.researchPlanPlaceholder`: an honest statement that this repo does not implement
  that capability today, not a fabricated plan.

This boundary is covered by dedicated tests (both in `researchIntake.test.mjs` and
`apiResearchIntake.test.mjs`).

## 7. Synthesis-readiness boundary

`classifySynthesisReadiness(candidate, options)` never generates an invented operational chemical
recipe. It only classifies, from caller-disclosed facts (never inferred from a bare structure):

```
SOURCE_BACKED_SYNTHESIS_REFERENCE | RETROSYNTHESIS_HYPOTHESIS | SOURCE_REQUIRED |
SAFETY_REVIEW_REQUIRED | BLOCKED
```

- `BLOCKED` for any `UNRESOLVED`-origin candidate.
- `SOURCE_BACKED_SYNTHESIS_REFERENCE` only when a real reference URL is supplied
  (`hasSourceBackedRoute` + `sourceReferenceUrl`) — still always paired with a safety/legal review
  reminder.
- `RETROSYNTHESIS_HYPOTHESIS` when only a high-level hypothesis is on file — explicitly labeled as
  not guaranteed or validated, requiring independent validation.
- `SOURCE_REQUIRED` (the default) when neither is on file.
- No path in this function can ever produce a guaranteed-yield, dosing, or clinical-use claim —
  enforced additionally by `assertNoClinicalLanguage`, which throws on any candidate JSON
  containing dosing/prescription/"clinically effective"/"cure"/"safe for human use" language
  before a terminal result is ever returned.

## 8. Research output (`ResearchIntakeResult`)

One canonical structure, returned by `resolveResearchIntake` for every input:

```
{
  contractVersion, normalizedResearchQuestion, status, inputKind,
  resolvedIdentity, resolvedGrounding, candidateMatrix, stageResults,
  provenance, evidenceReferences, conflictingEvidence, safetyVetoes,
  falsificationOutcomes, blockedCapabilities,
  selectedResearchPriorityCandidate, selectionExplanation,
  nextExperiment, synthesisReadiness, limitations,
  deterministicFingerprint, replayInputs
}
```

`status` is one of `RESOLVED | PARTIALLY_RESOLVED | BLOCKED_IDENTITY | BLOCKED_TARGET |
BLOCKED_SOURCE | BLOCKED_MODALITY | CONFLICTING_IDENTITY | UNSUPPORTED`.

**Deterministic replay:** `deterministicFingerprint` is `sha256Hex16` over contract version,
normalized query, input kind, status, sorted candidate IDs, sorted candidate SMILES, and grounded
target keys. `replayInputs` carries exactly what a caller needs to reproduce the same call
(`originalQuery`, `declaredInputKind`, `maxCandidateBudget`). Two independent calls with the same
input always produce the same fingerprint (Test 16).

**The winner is labeled exactly `RESEARCH_PRIORITY_CANDIDATE`.** It is never called a proven
drug, a cure, a successful vaccine, or a clinically effective treatment — `selectionExplanation`
states explicitly that this is a research-priority ranking only.

## 9. Evidence and safety behavior

- `evidenceReferences` is collected from each candidate's `supportingEvidenceIds` — this module
  does not write its own Evidence records; it surfaces whatever the existing campaign/Evidence
  path has already attached to a candidate.
- `conflictingEvidence` carries any detected identity conflicts (§3) as structured, visible
  entries — conflicting evidence is never hidden or silently resolved.
- `safetyVetoes` lists any candidate whose `safetyStatus === 'VETOED'`. A safety veto is a hard
  block: `researchGateStatus` (populated by the existing
  `scientificIntegration.mjs::researchGateVerdict`, once compute stages have run) never promotes a
  vetoed candidate to `RESEARCH_PRIORITY_ELIGIBLE` — enforced in the existing gate logic this
  module reuses, not reimplemented here.

## 10. Compute-stage semantics

`checkRequestedComputeCapabilities(requestedComputeStages)` performs exactly one bounded,
cached `capabilityAvailable(...)` check per requested stage (`docking` → `'molecular-docking'`,
`quantum` → `'quantum-chemistry'`, `admet` → `'admet-estimation'`) and never installs, builds, or
probes an engine beyond that single check.

- An unbound or unavailable engine reports `'BLOCKED'` — never a synthetic `'AVAILABLE'`.
- PySCF (`quantum-chemistry`) absence is fail-closed and reported the same way as any other
  blocked capability; it never blocks the other stages, and this module performs only the one
  bounded capability check — it does not build or install PySCF from source.
- Real successful tool execution and result interpretation continue to flow through the existing
  `campaign/multiFidelity.mjs` / `scientificIntegration.mjs` pipeline once a campaign draft is
  actually run (a separate, existing, explicit action — see §11).

## 11. API

`POST /api/projects/:id/research-intake` (added in `api.mjs`, immediately before the existing
campaign route dispatch — same router style, same `ok(body)`/`err(status, error, message)`
helpers as every other route in this file).

**Request body:**

```json
{
  "originalQuery": "GLP1R",
  "declaredInputKind": "AUTO",
  "maxCandidateBudget": 5,
  "secondaryIdentifier": { "inputKind": "SMILES", "value": "..." },
  "prepareCampaignDraft": false
}
```

**Behavior:**

- Requires authentication (401 if missing) and project membership (404 if the project does not
  exist or the caller is not a member — never revealing whether a foreign project exists).
- Requires `editor` role or higher (403 `forbidden` for a `viewer`).
- Validates `originalQuery` (400 `invalid_query` if empty) and `declaredInputKind` (400
  `invalid_input_kind` if not `'AUTO'` or a real `INPUT_KINDS` value).
- `maxCandidateBudget` is clamped server-side to `[1, 50]` via the existing `clampInt` helper —
  an absurd value is never taken at face value, and a negative/zero value still returns at least
  the default behavior.
- Never automatically executes expensive compute stages; `checkRequestedComputeCapabilities` is
  available but only queried when explicitly requested.
- Never bypasses the existing campaign API: `prepareCampaignDraft: true` calls
  `prepareCampaignDraft`, which delegates entirely to the existing
  `campaign/persistence.mjs::createCampaign`/`addCandidate` — the resulting campaign is visible
  through the existing, unmodified `GET /api/projects/:id/campaigns` route. It is never
  auto-started; running remains the existing, separate, explicit action.
- A `BLOCKED_*`/`CONFLICTING_IDENTITY`/`UNSUPPORTED` result is still returned as HTTP 200 with a
  structured result body — Genesis returns clear blocked states in the response payload rather
  than a misleading non-200 for a well-formed, honestly-blocked research question.

**Example response (`BLOCKED_TARGET`):**

```json
{
  "result": {
    "contractVersion": "1.0.0",
    "status": "BLOCKED_TARGET",
    "inputKind": "DISEASE_OR_CONDITION",
    "resolvedGrounding": null,
    "candidateMatrix": [],
    "selectionExplanation": "No verified disease→target source in this repo covers \"lung cancer\". Genesis will not invent a disease mechanism or target for an uncovered condition.",
    "limitations": ["No verified disease→target source in this repo covers \"lung cancer\"..."]
  },
  "campaignDraft": null
}
```

## 12. Test-only fixtures

Where a test needs a fixture the repo does not genuinely have (e.g. a deliberately malformed CAS
number, or an invalid SMILES), it is clearly local to the test file and never presented as
production evidence. The one **positive, fully source-backed fixture** (Test 7 in
`researchIntake.test.mjs`, "source-backed target input can prepare an existing campaign draft")
uses only the genuinely bundled `GLP1R` activity pin already shipped in this repo — it is not a
synthetic or mocked dataset.

## 13. Future UI integration seam

This module exposes exactly the functions a future Codex UI needs and nothing else:

- `resolveResearchIntake(request)` — the one entry point for a research question.
- `prepareCampaignDraft(db, campaignStore, projectId, result, opts)` — opt-in, existing-campaign
  delegation.
- `INPUT_KINDS`, `INTAKE_STATUS`, `CANDIDATE_ORIGIN`, `SYNTHESIS_READINESS`, `BUNDLED_TARGETS` —
  frozen enums/registries a UI can render directly (e.g. a dropdown of supported input kinds, or a
  badge per candidate origin) without re-deriving them.

No frontend code, route, or component is added by this change — this document exists so that
integration work can be scoped precisely against the contract above.
