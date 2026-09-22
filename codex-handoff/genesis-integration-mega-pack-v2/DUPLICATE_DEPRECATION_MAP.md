# Duplicate / Deprecation Map

Every module this pack touches, classified as: **CANONICAL** (kept, the one source of
truth in this pack), **ADAPTER** (retained, ports/orchestration over something else),
**DUPLICATE-DEPRECATED** (a second implementation of something that already exists
elsewhere in this pack or the real repo, removed/retired here), **FUTURE-ONLY** (no real
target exists yet, kept as protocol/data only), **PRODUCTION-READY** (safe to bind
without further changes once ports are supplied).

## Mirror
| Module | Classification |
|---|---|
| `src/mirror/mirrorContract.ts` (`GenesisMirrorRuntime`) | CANONICAL |
| `src/mirror/cameraSource.ts` | ADAPTER (real + fake camera sources) |
| D-142 V1's own `src/mirror.ts` | **DUPLICATE-DEPRECATED** — retired, not carried into this pack |
| bio-real-lab-v1's own `src/mirror.ts` | **DUPLICATE-DEPRECATED** — retired, not carried into this pack |
| Real repo `packages/core/src/flagship/mirrorTwin.ts` | Not touched by this pack — real-repo replace-or-keep decision left to Codex/human (see `mirror/legacyNotes.ts`) |
| Real repo `GenesisMirrorBridge.ts` / `GenesisMirrorClient.ts` | Not touched — already dead code in the real repo per earlier session audit, unrelated to this pack's consolidation |

## Device / Real-Lab safety taxonomies
| Module | Classification |
|---|---|
| `src/deviceSafety/deviceSafetyContract.ts` (`DeviceSafetyMode`) | CANONICAL |
| `src/deviceSafety/legacyAdapters.ts` | ADAPTER — maps 4 legacy taxonomies, never rewrites them |
| Real repo D-140 `DeviceExecutionMode` | Left in place, unmodified — mapped via adapter, not replaced |
| D-142 `BayMode` | Left in place, unmodified — mapped via adapter |
| bio-real-lab `RealLabMode` | Left in place, unmodified — mapped via adapter |
| core-hardening `RiskClass` | Left in place, unmodified — mapped via adapter (different axis: command-risk, not device-mode) |

## Evidence / Memory
| Module | Classification |
|---|---|
| `src/d141/ports.ts::EvidencePort` | ADAPTER — production contract, MUST bind to real EvidenceLedger |
| `src/precisionBay/ports.ts::EvidencePort` | ADAPTER — a distinct port shape, do not conflate with D-141's |
| `src/drugDiscovery/ports.ts::CandidateEvidencePort` | ADAPTER — a third distinct shape |
| `src/cyberScientist/ports.ts::CyberEvidencePort` | ADAPTER — a fourth distinct shape |
| `src/providerRouter/ports.ts::RoutingEvidencePort` | ADAPTER — a fifth distinct shape |
| `src/d141/memory.ts::AppendOnlyMetaMemory` | **DUPLICATE-DEPRECATED as a production store** — kept only as an optional, mirror-only test/debug echo; never the durable store |
| `src/hashReplay/hashPort.ts::HashPort` | CANONICAL contract |
| `src/hashReplay/testHash.ts::TEST_ONLY_HASH_PORT` | TEST-ONLY, never bind in production |
| 4 legacy private `fnv1a32`/`canonicalJson` implementations (D-141, D-142, core-hardening, world-visual) | **DUPLICATE-DEPRECATED** — all now delegate to an injected `HashPort` |

## Epistemic taxonomies
| Module | Classification |
|---|---|
| `src/historicalEpistemic/epistemicTaxonomy.ts::EpistemicLabel` | CANONICAL |
| World Director V1's own `EvidenceStatus` | **DUPLICATE-DEPRECATED** — superseded by canonical taxonomy (real-repo reconciliation still needed, see MIGRATION_NOTES.md §5) |
| D-141 V1's `worldDirectorAdapter.ts` inline union | **DUPLICATE-DEPRECATED** — now imports canonical type |
| world-visual-v1's `historical.ts` | **DUPLICATE-DEPRECATED** — removed from this pack; `worldVisual/index.ts` re-exports the canonical module instead |
| Astra World Author V1's own `EpistemicLabel` | **DUPLICATE-DEPRECATED** — now re-exports canonical type (this pack's audit found this was a genuinely independent 4th/5th declaration, not confirmed to exist as a real-repo duplicate — see MIGRATION_NOTES.md §9) |

## World generation
| Module | Classification |
|---|---|
| `src/astraWorldAuthor/` (proposal/validate/orchestrate) | ADAPTER — NOT a WorldGraph/WorldGenerator; `worldGraphRef`/`worldFrameRef` stay `unknown` |
| Real World Director / WorldGenerator / WorldGraph | Untouched, remains sole canonical implementation |
| `src/worldVisual/unrealProtocol.ts` | FUTURE-ONLY — no Unreal toolchain, no real repo target |

## AI provider routing
| Module | Classification |
|---|---|
| `src/providerRouter/policy.ts`, `router.ts` | CANONICAL, vendor-agnostic |
| `src/providerRouter/adapters.ts` | ADAPTER — the only vendor-aware file, by design |

## Security
| Module | Classification |
|---|---|
| `src/cyberScientist/campaign.ts`, `remediation.ts`, `attackPath.ts` | CANONICAL orchestration; no real analysis logic |
| `src/cyberScientist/ports.ts` (9 interfaces) | ADAPTER — every real capability (static analysis, secret scan, fuzz, SBOM, CVE feeds) is unbound by design |

## Drug discovery
| Module | Classification |
|---|---|
| `src/drugDiscovery/pipeline.ts` | CANONICAL orchestration (new — V1 had none) |
| `src/drugDiscovery/evidenceGate.ts`, `winnerGate.ts`, `scoring.ts`, `falsification.ts` | CANONICAL, PRODUCTION-READY as pure functions |
| `src/drugDiscovery/ports.ts::MolecularEnginePort` | ADAPTER — RDKit/docking/QM/ADMET must be bound; never reimplemented here |
| A pre-existing, better real-repo candidate-research engine, if one exists | **Not audited by this pack** — per the ground rule "if a better version already exists in the real repo, prefer it." Codex must check before binding this pack's `drugDiscovery` module as canonical. |

## Everything else
No other duplication was found across the 11 vendor packages consolidated into this pack
— confirmed by the original per-package audits (each independently checked for a second
WorldGraph/EvidenceLedger/command-bus/memory/candidate-engine and found none beyond the
items listed above).
