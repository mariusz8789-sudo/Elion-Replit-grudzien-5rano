# Genesis D-136 institutional pilot protocol

Status: **NOT_VERIFIED**.

This document is a protocol, not evidence of approval, clinical validation, or medical-device
status. It describes what an institutional reviewer would need to see, and what the system already
provides toward that, as of this integration pass. See `docs/D136_ACCEPTANCE_MATRIX.md` for the
per-gate status this protocol depends on.

## Pilot boundary

The pilot evaluates Genesis as a scientific visualization / simulation / provenance system. It does
**not** authorize diagnostic or therapeutic use, and nothing in this repository claims otherwise.
No output of this system is a medical observation: a reconstructed volume is `RECONSTRUCTED`, a
segmentation is `MODEL` unless a caller explicitly declares otherwise, and only bytes that passed
checksum and source verification may carry `REAL_DATASET`. Model output is never presented as fact;
simulation is never presented as observation.

## What the system already provides toward each required record

1. **Dataset identity, provenance and license.** `packages/frontend/src/core/medicalData/medicalDatasetRegistry.ts`
   rejects a dataset lacking `sourceUrl`, `license`, or a verified `checksumSha256` (canonical
   SHA-256, via `packages/core/src/knowledge/sha256.ts` — the same algorithm the Evidence Ledger
   uses, never a second one). No dataset ships with this pass; the boundary exists and is gated, not
   exercised against a real file (see the acceptance matrix's "Real external dataset (an actual
   real-world scan)" row).
2. **Exact build identifier.** Not addressed by this pass; a pilot would pin a commit hash.
3. **Command transcript and logical time.** Every `WorldCommand` carries a deterministic
   `commandId` and `requestedAtLogicalTime`; `parseWorldCommands` (with the D-136 resolver hooks)
   is the single production entry point.
4. **Evidence Ledger snapshot and verified restore.** `packages/core/src/knowledge/ledgerPersistence.ts`
   (pre-existing, reused — not duplicated by D-136) provides bit-for-bit snapshot/restore with chain
   verification.
5. **Session event chain and replay.** `packages/core/src/flagship/sessionEventLog.ts`'s
   `verifySessionChain`/`replaySessionEvents`, now linked to the Evidence Ledger by
   `sessionEvidenceBridge.ts` and projected by `evidenceManifest.ts`.
6. **Explicit epistemic labels.** Enforced at the type level for D-136's new surfaces
   (`medicalDatasetTypes.ts`'s `epistemic` union has no unsafe default after this pass's fix to
   `segmentationOverlay.ts`); enforced at the resolver level for biology/Mirror Twin commands via
   the existing `EpistemicLabel`/`EpistemicTone` adapters.
7. **Tamper-negative result.** `d136AcceptanceGates.ts`'s `verifyD136TamperNegativeGate`, backed by
   real rejection behavior in both the ledger and the session log (see the acceptance matrix).
8. **Reviewer identity and sign-off.** Not addressed by this pass — this is the one record a
   protocol document cannot manufacture; it requires an actual external reviewer.

## Acceptance status vocabulary

- **PASS** — executed and independently evidenced by a real, assertion-bearing automated test.
- **FAIL** — executed and contradicted by the observed result.
- **SKIP** — not attempted; must not be converted to PASS.
- **NOT_VERIFIED** — the protocol or gate exists, but the specific evidence this row asks for
  (an external reviewer, a real external dataset, a browser E2E run) is absent.
