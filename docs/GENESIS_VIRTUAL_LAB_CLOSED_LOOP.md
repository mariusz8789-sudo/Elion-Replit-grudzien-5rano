# Genesis Virtual Lab Closed Loop

Branch: `claude/genesis-virtual-lab-completion`. Base: `claude/genesis-lab-closed-loop` @
`e1de3f3fcbc731c3a379f978abf651a495109e18`.

This is the IN-SILICO computational experiment loop:

```
research question -> source-backed candidate -> hypothesis
  -> virtual experiment plan -> existing real solver/tool adapter
  -> computational observation -> canonical Evidence proposal
  -> support / falsification / conflict -> next experiment
  -> deterministic replay
```

It is a thin integration layer over existing canonical systems only. **No second campaign
engine, EvidenceLedger, Research Intake pipeline, toolchain, solver registry, or persistence
system was created.**

## Distinct from the external Lab Closed Loop

`packages/backend/src/campaign/labClosedLoop.mjs` (unmodified, off-limits to this branch) is the
**external wet-lab observation** path: a governed request → a real, human-provided external
observation → human review → Evidence. This module (`virtualLabClosedLoop.mjs`) is the
**in-silico computational** path: a hypothesis → the existing toolchain runs a real, registered
solver on this software → the software's own output is the "computational observation" → Evidence.
The two are deliberately kept apart (different event types, different modules, never imported into
each other) so an in-silico result can never be mistaken for, or silently merged with, a real
external measurement.

## Canonical systems reused (none duplicated)

| Concern | Reused from | How |
|---|---|---|
| Campaign/candidate persistence, append-only events | `campaign/persistence.mjs` | `getCampaign`/`getCandidate`/`addEvent`/`listEvents` — same calls every other campaign module uses |
| Toolchain/engine registry + validated availability | `campaign/toolchain.mjs` | `capabilityAvailable(capabilityId)`, `getTool(toolId)` |
| Real single-candidate execution + Scientific Run persistence | `campaign/multiFidelity.mjs` | `dockCandidate`, `qmCandidate`, `admetToxicityStage` called directly, unmodified |
| Real bounded MD reference execution + real PDB structural validation | `compute/mdAdapter.mjs`, `compute/proteinAdapter.mjs` | `md.referenceCase({ steps })`, `protein.validatePdb(pdbText)` called directly, unmodified — this module persists their results as `ScienceRun`s itself (no campaign-level wrapper existed for either engine before this branch) |
| Deterministic replay | `campaign/verify.mjs` | `verifyScienceRun(db, scienceRunId)` — its `MATCH`/`DRIFT`/`ENGINE_VERSION_CHANGED`/`BLOCKED_BY_RUNTIME`/`REPLAY_UNSUPPORTED` verdicts are mapped 1:1 onto this module's `REPLAY_STATUS` |
| Safety/research gate (bounded autonomy: stop on safety veto) | `campaign/scientificIntegration.mjs` | `researchGateVerdict(db, campaignId, candidateId)`, checked at both plan AND execute time |
| Clinical-language guard on the hypothesis text | `campaign/researchIntake.mjs` | `assertNoClinicalLanguage(hypothesis)` — the SAME guard the research-intake pipeline uses, not a weaker reimplementation |
| Evidence proposal (propose-only, never published) | `knowledgeApi.proposeStructuredEvidence` | Wired in `api.mjs`'s `/virtual-lab/execute` route, exactly the seam `labClosedLoop.mjs`'s own review route already uses |
| Fingerprinting | `provenance.mjs` | `sha256Hex16`, `snapshotEnvironment` |

## Virtual experiment contract

`planVirtualExperiment` persists a `VIRTUAL_EXPERIMENT_PLANNED` event carrying:

- `projectId`, `campaignId`, `candidateId`
- `hypothesis` (the scientific question; clinical language rejected via the existing guard)
- `requestedCapability` (one of the toolchain's own `capabilityId`s — no competing vocabulary)
- `budget` (`maxComputeSeconds`, `maxExperiments` — clamped to `MAX_VIRTUAL_EXPERIMENTS_PER_CAMPAIGN = 25`)
- `inputFingerprint` / `executionId` (`VEXP-<fingerprint>`, deterministic — an identical plan dedupes)
- an optional `expectation` (`{ outputKey, comparator: 'LTE'|'GTE'|'EQ_WITHIN', threshold, tolerance }`) — the only thing that turns a raw observation into a support/conflict verdict

`executeVirtualExperiment` persists a `VIRTUAL_EXPERIMENT_RESULT` event carrying:

- `selectedEngine` (`toolId`, `engineName`, `engineVersion` — from the toolchain registry)
- `scienceRunId` (raw output reference — the actual persisted Scientific Run)
- `derivedOutput` (the run's own `outputs`)
- `epistemicClassification` (see below)
- `limitations` (the toolchain's own declared `assumptions`, plus a budget-exceeded note when measured duration exceeds the declared `maxComputeSeconds` — never hidden)
- `provenanceRefs` (`science-run:<id>`, `toolchain:<fingerprint>`)
- `outputFingerprint` (the Scientific Run's own `outputHash`)
- `status` (see below) and `replayStatus` (`NOT_YET_REPLAYED` until a replay call updates the dossier)

`replayVirtualExperiment` persists a `VIRTUAL_EXPERIMENT_REPLAY` event carrying the mapped
`replayStatus` and the full detail from `verify.mjs`'s own verdict.

## Statuses — exact required vocabulary, never fabricated

`EXECUTION_STATUS`: `EXECUTED_COMPUTATIONAL_EXPERIMENT`, `BLOCKED_UNBOUND_ENGINE`,
`BLOCKED_RUNTIME_UNAVAILABLE`, `BLOCKED_INVALID_INPUT`, `FAILED_ENGINE`.

- **`BLOCKED_UNBOUND_ENGINE`**: the requested capability is a real toolchain member with no
  campaign-level, single-candidate, persisted execution path bound to it yet. As of this branch
  this applies only to `maxwell-fdtd` (PyMeep) — `molecular-dynamics` (OpenMM) and
  `protein-structure-ingestion` (Biopython) are now bound directly by this module (see "Results"
  below); no campaign-level path exists for `maxwell-fdtd` and this module never writes a new
  adapter to fill that gap — it reports the gap honestly.
- **`BLOCKED_RUNTIME_UNAVAILABLE`**: the capability IS bound at the campaign layer, but
  `toolchain.capabilityAvailable()` reports it is not `AVAILABLE` right now (e.g. PyMeep —
  genuinely not installed in this environment: `pymeep_unavailable: No module named 'meep'`).
- **`BLOCKED_INVALID_INPUT`**: hypothesis empty/contains clinical language, unknown capability,
  malformed `expectation`, per-campaign budget ceiling reached, or a research-gate `SAFETY_VETO`
  (checked at both plan time and again at execute time — bounded autonomy never lets a later
  toxicity finding be silently ignored by an already-planned experiment).
- **`FAILED_ENGINE`**: the bound, available engine was actually invoked and returned a real
  failure (e.g. a docking call missing its required receptor spec).

`REPLAY_STATUS`: `REPLAY_MATCH`, `REPLAY_DRIFT` (the two required outcomes) plus
`REPLAY_ENGINE_VERSION_CHANGED`, `REPLAY_BLOCKED_BY_RUNTIME`, `REPLAY_UNSUPPORTED`,
`NOT_YET_REPLAYED` — honest additional outcomes `verify.mjs` itself already distinguishes, never
collapsed into a false `MATCH`.

## Scientific claim boundary — exact required vocabulary, never promoted

`EPISTEMIC_CLASSIFICATION`: `COMPUTATIONAL_HYPOTHESIS` (no expectation supplied — a raw
observation, not yet compared to anything), `IN_SILICO_SUPPORT` (the expectation held),
`IN_SILICO_CONFLICT` (the expectation was numerically violated), `UNKNOWN` (the output key was
missing or non-numeric).

`assertAllowedEpistemicClassification` throws at the exact point a result is constructed if the
value is ever anything outside this four-member set — a structural guard against a future edit
accidentally introducing `IN_VITRO_OBSERVATION`, `IN_VIVO_OBSERVATION`, `CLINICAL_OBSERVATION`,
`CLINICALLY_EFFECTIVE`, or `LAB_MEASUREMENT` (`FORBIDDEN_EPISTEMIC_PROMOTIONS`, exported and
regression-tested). `clinicalEfficacy` is hardcoded `'UNKNOWN'` on every payload this module
writes, and every payload carries the same `claimBoundary` disclaimer text.

## Bounded autonomy

There is **no autonomous loop anywhere in this module** — `planVirtualExperiment`,
`executeVirtualExperiment`, and `replayVirtualExperiment` are each a single bounded call an
explicit caller (the API, in practice) must make. Nothing here schedules, retries, or re-invokes
itself. On top of that:

- a hard per-campaign ceiling (`MAX_VIRTUAL_EXPERIMENTS_PER_CAMPAIGN = 25`) refuses a new plan
  once reached; a caller-requested higher budget is clamped, never honored as given;
- the research-gate `SAFETY_VETO` check runs at plan time AND again at execute time;
- a runtime-unavailable or unbound engine stops that experiment (`BLOCKED_*`), never triggers a
  retry loop;
- nothing in this module generates a wet-lab protocol, a dose, or a treatment recommendation —
  the one place external validation is even mentioned is `deriveNextVirtualAction`'s
  `ESCALATE_TO_EXTERNAL_VALIDATION` action, which only *names* `labClosedLoop.mjs`'s domain as the
  honest next step; it never creates a request there itself (proven by a regression test that no
  `LAB_VALIDATION_REQUESTED` event, and no dosing/treatment field, is ever written by this
  module).

## API — smallest surface needed

All under `/api/projects/:id/campaigns/:cid/virtual-lab`, authenticated + project/campaign-scoped
exactly like every other campaign route (`atLeast(role, 'editor')` for mutations, viewer+ for
reads; `campaignStore.getCampaign`/`getCandidate` ownership checks refuse a cross-project or
cross-campaign candidate with 404/400, never a leak):

- `GET  .../virtual-lab?candidate=:id` — the dossier (plans, results, replays, evidence links,
  `nextAction`, `dossierFingerprint`).
- `POST .../virtual-lab` — plan one bounded virtual experiment. The request body has no field for
  a client-supplied output, status, or epistemic classification — the contract structurally
  cannot accept a fabricated result (regression-tested: a hostile payload injecting
  `status`/`epistemicClassification`/`derivedOutput` is silently ignored, the plan comes back
  `PLANNED` with no such fields).
- `POST .../virtual-lab/execute` — execute a planned experiment (idempotent; dispatches to the one
  real bound engine; on `EXECUTED`, proposes Evidence on the same canonical ledger, propose-only).
- `POST .../virtual-lab/:executionId/replay` — deterministic replay via `verify.mjs`.

## Results

- **Real engines executed** (genuinely `AVAILABLE` in this environment, proven by real calls in
  both test suites): RDKit (`molecular-descriptors`), AutoDock Vina + Meeko
  (`molecular-docking`), ADMET-AI (`admet-estimation`, `toxicity-risk-estimation`), OpenMM
  (`molecular-dynamics`), Biopython (`protein-structure-ingestion`). PySCF (`quantum-chemistry`)
  is also genuinely `AVAILABLE` and wired, exercised in the module-level test suite.
  - **`molecular-dynamics` (OpenMM)** binds directly to the existing `../compute/mdAdapter.mjs`'s
    `referenceCase({ steps })` — the ONLY per-call entry point that adapter exposes (no
    per-candidate simulation entry point exists anywhere in this repo). This proves OpenMM
    genuinely executes a real, bounded TIP3P water-box minimization + short NVT run through this
    module, persisted as a canonical `ScienceRun` (`engine: 'OpenMM'`). Two honest, explicitly
    surfaced limitations (never hidden): (1) the reference system is independent of the campaign
    candidate's own molecular structure — this proves the engine executes, it does not currently
    simulate the specific candidate; (2) the adapter forwards only `steps` to the underlying
    worker — random seed and box size are fixed server-side (`boxNm`/`seed` are NOT exposed as
    caller-configurable through this adapter, confirmed by reading `compute/md_worker.py`
    directly), and the integrator name is never serialized into the worker's JSON response, so
    bit-level trajectory reproducibility is not claimed. `verify.mjs` has no `REPLAYERS` entry for
    `molecular-dynamics`, so replay always and honestly reports `REPLAY_UNSUPPORTED`, never a
    fabricated `MATCH`.
  - **`protein-structure-ingestion` (Biopython)** binds directly to the existing
    `../compute/proteinAdapter.mjs`'s `validatePdb(pdbText)` — the one real, general-purpose,
    per-caller-input entry point that adapter exposes. The caller must supply real PDB-format
    text (at least 20 characters); this module never fetches, invents, or fabricates a structure
    on the caller's behalf. Missing/too-short input is refused with `BLOCKED_INVALID_INPUT` before
    the adapter is even invoked. A real, valid PDB produces a real Biopython structural report
    (chains/residues/hetero atoms/`needsPreparation`), persisted as a canonical `ScienceRun`
    (`engine: 'Biopython'`); `verify.mjs` likewise has no `REPLAYERS` entry for this capability, so
    replay always and honestly reports `REPLAY_UNSUPPORTED`.
- **Blocked engine**: `maxwell-fdtd` (PyMeep — `BLOCKED_UNBOUND_ENGINE` (no campaign execution
  binding exists for it) AND genuinely not installed, `BLOCKED_BY_RUNTIME` at the toolchain layer,
  confirmed directly: `pymeep_unavailable: No module named 'meep'`).
- **Evidence**: propose-only, on the same `EvidenceLedger` singleton `knowledgeApi.mjs` already
  serves every other caller from. Verified pending, never auto-published, via a real end-to-end
  API test.
- **Replay**: `REPLAY_MATCH` proven against a real RDKit descriptor run (bit-exact tolerance);
  `verify.mjs`'s own per-capability tolerance table (0 for docking/QM/descriptors, `1e-4` for
  ADMET's measured batched-inference floating-point noise floor) is reused unchanged.
- **Falsification/support/conflict**: an `expectation` numerically violated by the real computed
  output is honestly `IN_SILICO_CONFLICT`; a raw observation with no expectation stays
  `COMPUTATIONAL_HYPOTHESIS` — never silently promoted.

## Existing Lab Closed Loop UI — real browser E2E finding

`packages/e2e/src/labClosedLoop.e2e.spec.ts` drives the **existing, unmodified**
`CampaignScreen` → `LabValidationPanel` UI in a real Chromium browser against a real, freshly
generated campaign candidate (seeded via the real local HTTP API — register → create project →
create campaign → start → a real ~20s RDKit-only generation run). It passes.

**Honest finding, not a bug in this branch**: `LabValidationPanel.tsx` and its typed client
(`packages/frontend/src/core/backend/client.ts`) predate this repository's `labClosedLoop.mjs`
governed-request hardening (branch `claude/genesis-lab-closed-loop`, already merged into this
branch's base). That hardening now requires every validation request to carry either a real
`PRECLINICAL_CANDIDATE_PROTOCOL` reference or an explicit `governedManualRequest` (`reason` +
`authorizedBy`), and every `endpointPlan` entry naming a `comparisonOutputKey` to also carry a
frozen `tolerance`. The current UI form sends neither. Clicking "Create validation request" in a
real browser against the real backend now genuinely receives a `400
preclinical_protocol_or_governed_manual_request_required`, which the panel correctly displays
(proving the UI-to-API wiring itself is intact) but which stops the loop before an observation can
ever be ingested. This test was written to prove exactly that real behavior, not to route around
it — see the handoff report's "frontend bindings still needed" section for the two fields Codex
needs to add.

## Verification

- `virtualLabClosedLoop.test.mjs`: 24/24 passing (real RDKit + real docking execution, honest
  blocking, replay, Evidence, bounded autonomy, safety veto, ownership, forbidden-promotion
  regression).
- `apiVirtualLabClosedLoop.test.mjs`: 10/10 passing (full plan → execute → Evidence → replay round
  trip, RBAC, ownership, honest client-input rejection, `BLOCKED_UNBOUND_ENGINE` via the API).
- `apiLabClosedLoop.test.mjs`, `apiResearchIntake.test.mjs`, `finalScientificIntegration.test.mjs`,
  `campaign/researchIntake.test.mjs`: 104/104 passing — zero regression in the systems this module
  reuses.
- ESLint clean on every owned file. Full backend suite run near the end of this branch's work
  (see the handoff report for exact counts and the two pre-existing, unrelated failures already
  confirmed present on the base branch before this work started).
- `packages/e2e/src/labClosedLoop.e2e.spec.ts`: 1/1 passing, real Chromium, real API, real
  generated candidate.

No merge, no deploy, no force-push.
