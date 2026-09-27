# ZEFIR Truth Engine — Independent Forensic Verification Matrix

> Verified from code, tests, schema, API routing, frontend integration, and runtime — NOT
> from the previous final report. VERIFIED = code + passing test + (where relevant) runtime.

| # | Claim | Code evidence | Test / runtime evidence | Verdict |
|---|-------|---------------|--------------------------|---------|
| 1 | UI uses the real backend API | `TruthEngineScreen`→`runTruthAnalysis`→`request` | frontend client tests; no mocks in product path | VERIFIED |
| 2 | API invokes the real Truth Engine | `runTruthAnalysisHandler`→`truthEngine.analyze` | apiTruth tests; real-HTTP smoke (BLOCK w/ numbers) | VERIFIED |
| 3 | No hardcoded GO/WARN/BLOCK in product paths | grep of api.mjs/truthEngine.mjs | none found | VERIFIED |
| 4 | Malformed input cannot silently GO | `sanitizeProposal` requires content; GO needs substantive>0 | empty→400; INSUFFICIENT_DATA tests | VERIFIED |
| 5 | Unsupported science → no fabricated certainty | `KNOWN_UNSUPPORTED_DOMAINS`→UNSUPPORTED | adversarial + trial I | VERIFIED |
| 6 | All 12 constraints genuinely execute (via product) | registry + engine wiring | 15 registry tests; **found unit-compatibility unreachable via analyze()** | PARTIAL → FIXED |
| 7 | BLOCK constraints require structured inputs + deterministic violation | each `def()` has requiredInputs+applicable+evaluate | registry tests PASS/VIOLATED/SKIPPED | VERIFIED |
| 8 | Marketing language cannot improve the decision | hype not in substantive set | adversarial + trial B | VERIFIED |
| 9 | Necropolis isolated by tenant | `listFailureRegionsByProject` filters project_id | necropolis + security tests | VERIFIED |
| 10 | Tenant A cannot affect tenant B | strict project scoping | hostile tests + trial H + demo case 8 | VERIFIED |
| 11 | Necropolis materially influences same-tenant later decision | NECROPOLIS_CHECK via projectId | trial E, demo case 7, pilotReport test | VERIFIED |
| 12 | Decision hashes reproducible | `decisionHash=canonicalHash(decisionCore)`, no timestamp | reordered-keys adversarial test; trial G | VERIFIED |
| 13 | Necropolis export hashes deterministic | sorted by contentHash; exportedAt excluded | necropolis order-independence test | VERIFIED |
| 14 | Meta-Orchestrator funnel defect fixed | funnel branch + FUNNEL_COMPLETE | 4 regression tests | VERIFIED |
| 15 | Genuine failure distinguishable from funnel completion | decided==all / partial / none ladder | 3 regression tests | VERIFIED |
| 16 | Trials A–I traverse the product API path | all call `handleApi` | 18/18 checks | VERIFIED |
| 17 | Water trial does not fake oxygen-transfer/limnology | requestedDomains→UNSUPPORTED | trial I; adversarial | VERIFIED |
| 18 | UI exposes enough decision evidence for a non-programmer | screen + PilotReportView | build + render fields | VERIFIED |
| 19 | Auth/RBAC protect analysis + Necropolis routes | project gate + `atLeast` | 13 hostile authz tests | VERIFIED |
| 20 | No scientific-core regression | full suite | backend 500/500, 0 skipped | VERIFIED |

## The one defect independently reproduced and fixed
**Claim 6 was overstated.** `unit-compatibility` was defined and unit-tested in the
registry, but `truthEngine.analyze()` never passed the `comparisons` field into the
registry (`registryInputs` omitted it, `anyStructured` ignored it) — so through the actual
product path that constraint was unreachable, even though the API accepted `comparisons`.
This is the classic "field collected but ignored by the backend" defect. Reproduced by a
failing adversarial test (`ATTACK incompatible units → BLOCK`), root-caused, and fixed by
folding `comparisons` into `registryInputs`/`anyStructured`. Now BLOCKs correctly.

## Security posture (hostile application-level authorization audit)
All fail-closed. Cross-tenant analysis read, certificate read, history enumeration,
Necropolis export/import: 404/403. A body-supplied `projectId`/`project_id`/`tenant`
cannot override the URL/authorization context — the engine scopes strictly to the
authenticated URL project. Malformed/injection analysis IDs return 404, no crash.
This is an application-level authorization audit, NOT a penetration test.
