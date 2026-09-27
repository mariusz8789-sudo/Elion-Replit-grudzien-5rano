# D-136 acceptance matrix

Status reflects what was actually executed and observed in this integration pass (see
`D-136 INTEGRATION COMPLETE` report for the run commands and counts behind each row). PASS here
means "verified by a real, assertion-bearing automated test in this repository, run and observed
passing" — never a claim about production traffic, an external reviewer, or a real patient dataset.

| Gate | Required evidence | Status |
|---|---|---|
| Canonical parser | resolver-hook architecture; zero regression on the pre-existing V3 acceptance suite; deterministic command ids | PASS |
| Human Biology command path (production import) | `biologyCommands.ts` routes every clause through `parseWorldCommands` + `BIOLOGY_CATALOG.resolvers`; no second parser entry point | PASS |
| Human Biology command path (real browser session) | a live browser exercising the command bar end to end for D-136 vocabulary specifically | NOT_VERIFIED — no new browser E2E was attempted this pass (see Desktop/Mobile E2E rows and their cost note) |
| Mirror Twin (command → state machine → session event) | canonical `INTERACT` command → existing `mirrorTransition` reducer → `MIRROR_STATE` session event | PASS (unit-level, real state machine, no second Mirror Twin) |
| Mirror Twin (reachable from a live screen) | a UI affordance in `ScientificWorldsScreen.tsx` that actually sends a `MIRROR_*` command | NOT_VERIFIED — the resolver and bridge exist and are tested, but that screen is D-134-protected territory and was not modified to add a Mirror Twin entry point in this pass |
| Evidence provenance (command → action → evidence → session) | every `EvidenceLedger` append while a session is active becomes a session `EVIDENCE_APPENDED` event carrying the real content hash, ledger index and command id | PASS |
| Evidence Manifest | deterministic report over the real session log + ledger, cross-checking every claimed evidence link against the ledger's own entries | PASS |
| Ledger persistence | snapshot → restore, bit-for-bit, on the existing `packages/core/src/knowledge/ledgerPersistence.ts` (reused, not duplicated) | PASS (pre-existing coverage, re-confirmed; no new persistence layer was written) |
| Tamper negative (ledger) | a corrupted snapshot is rejected on restore, never auto-repaired | PASS |
| Tamper negative (session log) | a hand-edited event is rejected by `verifySessionChain` | PASS |
| Real external dataset (DICOM/NIfTI ingestion boundary) | real binary header parsing, SHA-256, source/license/provenance gate, rejection of unsupported formats and fabricated checksums | PASS at the adapter/unit level, against real-format byte fixtures built from the NIfTI-1 and DICOM Part-10 specifications |
| Real external dataset (an actual real-world scan) | ingesting one genuine, externally-sourced DICOM/NIfTI file end to end | NOT_VERIFIED — no such file exists in this repository; the boundary was built and gated, not exercised against real patient/scan data, per the standing "no invented data" rule |
| Volume reconstruction | real voxel array round-trip from parsed bytes; epistemic status set to `RECONSTRUCTED`, never defaulted to `REAL_DATASET` | PASS at the unit level |
| Segmentation overlay | dimension-mismatch rejection; epistemic status is never defaulted, always caller-declared | PASS at the unit level |
| Institutional pilot sign-off | an external reviewer's approval of the protocol below | NOT_VERIFIED — this is a protocol document, not a completed review |
| Desktop E2E | a real browser session exercising this integration end to end on desktop viewport | NOT_VERIFIED — not attempted this pass; D-134's own organ-picking E2E in this sandboxed, software-rendered environment already took 45+ minutes per run and one such run's raw `page.mouse.click()` call itself hung to timeout, so a new D-136-specific E2E was not started without the user's direction on that cost |
| Mobile E2E | same, mobile viewport | NOT_VERIFIED — not attempted, same reason |
