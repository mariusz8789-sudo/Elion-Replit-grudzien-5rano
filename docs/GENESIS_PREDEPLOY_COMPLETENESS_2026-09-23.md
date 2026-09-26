# Genesis pre-deploy completeness contract — 2026-09-23

This document is the staging-scope truth source. A green unit test does not by
itself make a subsystem a product. Started code is accounted for below instead
of being silently removed from scope.

Statuses:

- `COMPLETE_E2E` — reachable product flow with browser or justified runtime E2E.
- `PROTOTYPE_WITHOUT_PRODUCT` — real code/tests exist, but there is no supported
  product route or complete user workflow. It is not advertised as shipped.
- `DOCS_ONLY` — intent only; no product implementation exists.
- `BLOCKED_EXTERNAL` — repository software is wired but execution needs an
  external runtime, device, licensed asset, model/checkpoint, credentials, or
  physical measurement.

## Staging product surfaces

| Subsystem | Product proof | Status | Honest boundary / external dependency |
| --- | --- | --- | --- |
| Candidate → campaign → Virtual Lab | `#/campaign`; real backend campaign, ScienceRun and Virtual Lab API; Chromium closed-loop coverage | `COMPLETE_E2E` | Only engines with a passing live reference case are READY. The production image includes the pinned RDKit runtime; heavier engines remain explicit optional capabilities. |
| Lab Closed Loop | governed request, immutable external observation, independent review, Evidence proposal and comparison; API/browser coverage | `COMPLETE_E2E` | Stops at handoff until a real external laboratory submits an observation. |
| Evidence / provenance / replay | canonical ledger, content hashes, replay MATCH/DRIFT/BLOCKED states, result inspector | `COMPLETE_E2E` | Computational output is not wet-lab or clinical evidence. |
| SW-4 / World Director | `#/scientific-worlds`, `#/world-director`; BASELINE/A/B/C, canonical SEIR and Evidence Field | `COMPLETE_E2E` | Modelled epidemic scenarios, not observed public-health outcomes. |
| Prompt-to-world | `#/world-proposal` → canonical specification/graph → `#/world-director`; browser proof | `COMPLETE_E2E` for supported templates | Unsupported domains fail explicitly; this is not a universal world generator. |
| Human Explorer / Human Biology World | `#/human-biology-lab`; current legal GLB, system/organ/isolation/section/Hyperscope | `COMPLETE_E2E` for present assets | No patient-specific validated observation is implied. Premium anatomy and subject data are external upgrades. |
| CERN toy collision | `#/cern-complex`; step-visible canonical collision batch, selection and deterministic replay | `COMPLETE_E2E` | `TOY_MC_MODEL`, never measured detector telemetry. |
| CMS open data | `#/physics/cms-z`; pinned/checksummed offline sample | `COMPLETE_E2E` | Historical offline data, not a live LHC feed. PYTHIA/Geant4 and detector telemetry remain external runtimes/data. |
| Cyber | `#/cyber`; canonical synthetic investigation flow and browser coverage | `COMPLETE_E2E` | Synthetic evidence is visibly classified; no real target telemetry is claimed. |
| Mirror | `#/mirror`; consent/session proxy, honest fallback, divergence/replay state | `COMPLETE_E2E` | Real camera depends on browser policy and a physical device. Mirror is a `VISUAL_SESSION_PROXY`, not a second person/world. |
| Government drug discovery | `#/gov-campaign`; pinned sources, falsification and safety gate, browser coverage | `COMPLETE_E2E` for this bounded demonstrator | It is not a general public-administration platform or legal authority. |
| D-063 government services | Research Console `GovServicesPanel`; baseline comparison, claim audit and frozen trigger | `COMPLETE_E2E` at runtime; browser route covered through the console | Read-only decision support; the trigger threshold is an explicit demonstration parameter. |
| Contextual/voice guide | one canonical route guide on CERN, Cyber, Mirror, Government, World Director, Virtual Lab, Campaign and Human Explorer | `COMPLETE_E2E` | Audible output depends on browser speech/audio hardware; captions are the deterministic fallback. |
| Reality Navigator | `#/reality`; branch selection and scenario comparison | `COMPLETE_E2E` | Model/scenario navigator, not a physical multiverse. |
| Multiverse Nexus | `#/lab/multiverse`; canonical route/scenario handoff | `COMPLETE_E2E` for navigation | “Portal” is a navigation metaphor. |
| Deterministic cinematic | canonical world → camera → frames → H.264 MP4 → SHA-256/provenance | `COMPLETE_E2E` when final release artifact passes decode | Quality is the current WebGL renderer, not Hollywood/AAA or AI video. |
| Local AI-video Stage A/B | runtime diagnostics, control contract, registry, worker adapter, output hashing and Evidence exclusion | `BLOCKED_EXTERNAL` for real generation | Needs a legal compatible checkpoint and a supported GPU/model runtime. It returns BLOCKED; it never fakes media. |

## Started code that is not a staging product

These modules are retained and explicitly classified. They are not counted as
complete product capabilities and must not be shown to investors as shipped.

| Started subsystem | Existing implementation | Classification | Work required before it becomes a product |
| --- | --- | --- | --- |
| General Government / Sovereign administration | `core/governance/*`, `sovereignTruthAnswer.ts`, environmental detective/case graph, generic document and GIS ingestion | `PROTOTYPE_WITHOUT_PRODUCT` | Canonical case schema/store/API/UI; document classification/OCR; authorised register connectors; case RBAC; human approval; audit-package export; browser E2E. |
| Environmental case graph | causal report, sourced signals, anomalies, counter-explanations, GIS-ready graph | `PROTOTYPE_WITHOUT_PRODUCT` | Persistent case intake, authorised source ingestion, reviewer UI and case-level audit/E2E. |
| City disaster / digital-twin adapters | `CityDisasterController`, `GenesisCityDigitalTwin`, `GenesisDisasterEngine` | `PROTOTYPE_WITHOUT_PRODUCT` | Approved product route, canonical data contract, truthful source policy and browser E2E. |
| Genuine Discovery Phase F | replication, novelty, self-falsification and hypothesis modules | `PROTOTYPE_WITHOUT_PRODUCT` | Production caller/UI, bounded orchestration and literature/data access policy. |
| Physics World package | `core/physicsWorld/*` and demo script | `PROTOTYPE_WITHOUT_PRODUCT` | Canonical screen and product workflow; heavy engines remain external where unavailable. |
| D-140 physical-lab framework | `core/lab/*`, instrument/lab contracts and adapters | `PROTOTYPE_WITHOUT_PRODUCT` | One canonical immutable observation contract, production callers/UI and real instrument connectors. Physical telemetry remains external. |
| History of Physics | historical claims data | `PROTOTYPE_WITHOUT_PRODUCT` | Panel/route, source graph and E2E. |
| Hazard registry | metadata-only dataset registry | `DOCS_ONLY` / prototype metadata | Approved dataset admission, ingestion and product surface. |
| Universal capability status | capability contract used by paused universal intent work | `PROTOTYPE_WITHOUT_PRODUCT` | Product owner, resolver integration, route and E2E. |
| Agent composer | `agentBridge.ts` | `PROTOTYPE_WITHOUT_PRODUCT` | Canonical production caller above campaign/hypothesis layers without creating an ESM cycle. |
| Institutional profile | planned navigation note | `DOCS_ONLY` | Route, data model and permission model. |
| Legacy command-center visuals | legacy canvas/HUD/shader systems | superseded prototype | No staging action; current canonical renderer remains authoritative. |

## Architecture overlap that must not be marketed as one completed capability

- Time-machine concepts exist in three forms: the truthful flagship relativity
  comparison, a synthetic cinematic package and a mathematical execution-log
  package. Only the first participates in the current flagship summary. None
  is physical time travel.
- Portal concepts exist as an epistemic state machine, a speculative
  spacetime/mesh model and the real Multiverse route bridge. The route bridge
  is the only product navigation mechanism; the other two remain model/prototype
  layers and are not a second world runtime.
- There is no separate “Mirror World”. The shipped Mirror is the canonical
  visual session proxy.

## External blockers

- Physical laboratory measurements and instrument/device telemetry.
- A legal local AI-video checkpoint plus compatible GPU/runtime.
- PYTHIA/Geant4 and live CERN detector infrastructure.
- Premium/licensed anatomy and validated subject data.
- Production credentials and authorised government/register data connectors.
- Browser camera/audio hardware and deployment policies.

The repository must not receive `GENESIS_READY_FOR_STAGING_DEPLOY` solely from
unit/build success. The final release still requires the expanded backend gate,
frontend/core suites, production build, Chromium matrix, deterministic MP4
decode/hash proof, RBAC/isolation checks and a clean reviewed Git state.
