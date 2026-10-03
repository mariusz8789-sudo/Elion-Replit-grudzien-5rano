# Genesis final completion report — 2026-10-03 (Saturday)

Statuses: GREEN / PARTIAL / BLOCKED_EXTERNAL / FAILED / NOT_APPLICABLE. "Local" = this sandbox, "CI" = GitHub Actions on the exact head that was merged.
FINAL MAIN: 729a67ae (merge of PR #63). Rollback point before it: 90d2fca2. DEPLOYED: NO (production is still the older build; deploy only on "wdrażaj" typed in the Human Explorer thread).

## Merged in this campaign
#58 consolidation (122ef7da) · #59 bounded fan-out + matrix (86823e70) · #61 durable queue wired into the ResearchRun route (5916987b) · #63 five engines through ResearchRun, async artifact custody, Golden E2E, CSRN window and rotation, audits (729a67ae).
Other threads merged in parallel (not mine, not re-audited here): #56, #57, #35, #60, #62, #64.

## Whole Genesis
| AREA | STATUS | EVIDENCE |
|---|---|---|
| Lint, typecheck, production build | GREEN | eslint 0 errors (warnings only), `tsc` clean, `npm run build` exit 0, CI "verify" and container smoke green on 7fde0065 |
| Backend suite | GREEN in CI; PARTIAL locally | CI green on 7fde0065. Local full run: 1599 tests, 1564 pass, 26 skipped, 0 failed tests, and 2 suites (server HTTP persistence, C3 World Proposal) whose server did not start within 8 s under full-suite load; the same file passes 9/9 when run alone |
| Frontend suite | GREEN | 7607 pass, 1 skipped, 709 files |
| Core suite | GREEN | 344 pass, 37 files |
| CSRN package + tooling | GREEN | 41 pass in the package; reviewerSignedEvidence and csrnScripts tests (disposable keys) |
| Golden E2E | GREEN | goldenResearchRun.e2e.test.mjs: question → async real RDKit → artifact → verdict → Evidence PROPOSED → Replay MATCH → DecisionTrace → NEXT_EXPERIMENT → memory recall, with a worker crash, restart and recovery; CI engines job |
| Real engines through ResearchRun | GREEN (OpenMM PARTIAL) | RDKit, PySCF, Vina, ADMET: SUPPORTED + FALSIFIED + replay MATCH + reopen; OpenMM water-box reference only, replay NOT_APPLICABLE; ADMET commercial use BLOCKED_BY_LICENSE (tested); retrosynthesis BLOCKED_BY_RUNTIME |
| ResearchRun sync/async/cancel/dead-letter/restart/corrupted chain/artifacts/duplicates | GREEN | researchRunJobs, researchRunArtifacts, researchRunExecution, fan-out tests |
| Replay | GREEN | MATCH for descriptors, quantum chemistry, docking, ADMET; again after restart in the Golden E2E |
| Restart / recovery | GREEN | same frozen fingerprint and experiment id after recovery, one execution, one artifact, abandoned lease closed as DEAD_LETTER then re-enqueued under a new generation |
| Scientific integrity | GREEN | verdicts bound to the frozen protocol; model estimates never relabelled as measurements (CSRN promotion tests); evidence stays PROPOSED |
| Security / trust | PARTIAL | secret scan of tracked files clean, `npm audit --omit=dev` 0 vulnerabilities, artifact route authz and path-leak test, scripts refuse CI and in-repo private keys. Not done: penetration test, row-level tenant isolation audit route by route |
| UI visual QA | PARTIAL | 66/66 page loads pass (no overflow, no blank, no console error) at 1920×1080, 1440×900, 1366×768, 390×844, 412×915, 360×780; only two screenshots reviewed by eye; Human Explorer interactions and real devices not covered |
| Production build + container smoke | GREEN | CI job "Obraz produkcyjny — build i realny smoke test kontenera" |

## Domain status
- GLP-1R: PARTIAL. Owned by the GLP-1R thread. D-144 untouched, D-153 passes its unchanged gate with the series-interpolation caveat, D-154 NO_SUITABLE_STRUCTURE under the frozen rule, D-156 selected 6X18 under the unchanged rule, D-159 keeps 6X18 a reference structure (not a docking target). No real GLP-1R ResearchRun exists, no candidate. Verdict for a grant-ready candidate: NO GRANT-READY CANDIDATE YET (section 14 campaign not started, by instruction).
- RUN 9: BLOCKED_EXTERNAL for this thread. Seal A is frozen on another branch (owner thread). This session cannot reach zenodo.org or RCSB (proxy denies; the session predates the network change). Run 9 was not started and nothing was run.
- CSRN: PARTIAL. Tooling, validity window, rotation, tamper tests and the owner command sheet (docs/keys/OWNER-CSRN-KEY-COMMANDS.md) are done; the production key is NOT generated (owner command on his own machine), so certificates are UNSIGNED and the wording stays "fingerprints and replay".
- SAAS / PILOT READINESS: PILOT_READY for one supervised customer; SAAS_PARTIAL for self-serve; ENTERPRISE_BLOCKED on SSO, billing, backup/restore drill, multi-replica infrastructure (docs/evidence/consolidation/saas-readiness-2026-10-03.md).

## Remaining blockers
1. Single node: shared queue and shared object storage not provisioned (BLOCKED_EXTERNAL).
2. Retrosynthesis engine not installed in any CI job; Vina/Meeko and OpenMM licence review not confirmed.
3. No real GLP-1R ResearchRun and no purchasable candidate list; needs a docking target the owner accepts (D-159 refused 6X18) and a lab.
4. Run 9 needs the Zatoka thread's Seal B conditions and the data from zenodo.org, in a session started after the network change.
5. The synchronous ResearchRun route stores no artifact; only the async path has custody.
6. OpenMM has no bit-exact replayer.

## Owner actions
1. Generate the CSRN key on his own machine (command sheet above), then commit only the public files.
2. Choose the pilot customer, a persistent volume and a backup policy.
3. Say "wdrażaj" in the Human Explorer thread when he wants production updated.
4. Find a lab for the measurement and the prep-time study chemist (unchanged).
