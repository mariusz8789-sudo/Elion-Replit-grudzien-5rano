# Scenario/Evidence Reconciliation Record

**Scope:** This record reconciles the verified Evidence/Replay work from Claude commit `e94ef1635f7890192162bf0176b8bed9ca8e8b69` into the current Digital Twin branch without changing routing behavior or the Scientific Core.

## Verified ancestry

Claude’s `e94ef16` is a merge commit with parents `5b57b6f` and `688f9a3`. The current Manus branch began its later visual work at `688f9a3`, then added the visual upgrade `9df0797` and the Multi-Hazard audit `808c9df`. The true shared point for this reconciliation is therefore `688f9a3`, not the older Claude/Manus common ancestor `54e773c`.

## Reconciled additively

The current branch receives the Evidence/Replay panel, its LocalEvidenceStore, deterministic fingerprint and SHA-256 utilities, experiment-comparison helper, build-time git commit provenance, stylesheet additions and associated regression tests. The panel remains collapsible and appears alongside the existing Scenario Command Center, Hospital, hotspot/cluster, route-topology and observability panels in the one `#/city3d` Command Center.

| Preserved invariant | Reconciliation outcome |
|---|---|
| Single City3D renderer/canvas/OrbitControls | Preserved; no renderer file was replaced |
| Read-only WorldState projection | Preserved; no contract or projection change was imported |
| Scientific Core and Hospital/Scenario logic | Preserved; `EpidemicCitySimulation`, contacts, Hospital Model, Scenario Engine and Discovery Engine were not changed |
| Governed visual assets | Preserved; no asset-governance change was imported |
| Evidence/Replay | Added as real experiment/evidence UI with tests |

## Explicitly excluded

Claude’s branch also contains feature-flagged road-routing additions in `cityAgent.ts`, `epidemicCity.ts`, two routing tests and route-control wording in `City3DWebGLScreen.tsx`. Although the default was reported as disabled, those files modify agent movement and are outside the approved reconciliation scope. They are deliberately **not** included. The City3D route-topology panel continues to state that assignment of agents to routes and attribution of contacts to segments are `NOT_MODELED`.

## Independent validation

The selective result passed all focused Evidence/Replay and City3D boundary tests: **7 files / 26 tests**. The full frontend suite passed **118 files / 1,185 tests**. TypeScript checking, production Vite build and `git diff --check` passed. The untouched backend suite passed **269 tests** with **0 failures** and **40 skipped** tests.

> The result adopts proven Evidence/Replay capabilities without silently reintroducing routing or redefining the existing simulation’s scientific semantics.
