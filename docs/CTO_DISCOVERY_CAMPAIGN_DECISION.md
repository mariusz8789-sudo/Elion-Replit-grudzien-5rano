# CTO Decision — Discovery / Campaign Entry Point

**Decision:** `ADAPT` — thin, read-only navigation adapter only.  
**LIVE source of truth:** `manus/high-fidelity-epidemic-digital-twin`.

## Finding

The repository contains a real Scientific Acceleration / Campaign control layer. `CampaignScreen.tsx` is reachable through `#/campaign`, and the backend exposes campaign persistence, candidates, decisions, events, graph, WHY and science-run endpoints. Its verified domain is chemistry candidate search with explicit limitations: descriptors and objective values are model outputs, not docking, molecular dynamics, QM, ADMET, toxicity, binding affinity or therapeutic outcomes.

The repository also contains a separate local Experiment Fabric and a pre-existing epidemic-domain discovery path. They do not share one generic runtime contract for campaign creation, persistence, RBAC, background jobs and campaign graph lineage. Automatically bridging all three would recreate a second orchestration/evidence path or touch unrelated core systems.

## Accepted change

Science Chat now recognizes `Otwórz kampanię naukową`, `campaign`, `kampania naukowa` and related phrases. It returns typed intent `OPEN_CAMPAIGN` and opens the existing `#/campaign` route. The response explicitly states that this is read-only navigation: no campaign is created, no job is started and no backend mutation is issued.

This adapter reuses the existing resolver action `openRoute` and the existing CampaignScreen. It adds no model, no candidate, no result, no Evidence system and no Replay implementation.

## Deliberately not integrated

| Capability | Status | Decision |
|---|---|---|
| Science Chat → CampaignScreen navigation | `CONNECTED` | Accepted as thin adapter and tested. |
| Campaign creation/start from Science Chat | `NOT_CONNECTED` | Requires authenticated project context, RBAC and explicit user action. |
| Campaign candidates/decisions/graph in Experiment Fabric Evidence Pack | `PARTIAL` | Contracts are not equivalent; no automatic bridge. |
| Existing epidemic discovery engine into Campaign | `NOT_CONNECTED` | Separate domain-specific provenance/replay path; keep parked. |
| Campaign chemistry outcomes as therapeutic claims | `NOT_MODELED` | Explicitly forbidden by current engine contract. |

## Acceptance gate

The adapter is accepted only with resolver regression coverage, frontend typecheck, lint, production build, Chromium desktop and mobile smoke, `git diff --check`, clean Git and green GitHub CI. A future full bridge requires a separate design covering identity, authorization, project scope, event lineage, evidence interoperability, cancellation, replay and rollback.

## Next milestone

After this entry point is green, the next independent product gap is formal Evidence Pack interoperability for Campaign only if its existing persisted events can be represented without duplicating Evidence/Replay. If that contract is not demonstrated, keep the bridge `PARTIAL` and proceed to the next validated capability rather than inventing an integration.
