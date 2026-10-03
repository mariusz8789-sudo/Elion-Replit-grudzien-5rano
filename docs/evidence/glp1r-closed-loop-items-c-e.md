# GLP-1R closed loop — items C and E

**Authorised by:** Mariusz, 2026-10-03 02:28Z: "GO na C i E… C: uzupełnij tylko brakujące pola w candidate dossier… E: popraw integralność lab handoff — hash surowego pliku ma być liczony po stronie Genesis z faktycznie przesłanych bajtów, nie przyjmowany jako tekst od klienta."

**Base:** current `main`. No preregistration, no frozen gate and no sealed artefact was touched. Item B was not started.

---

## Item C — the three fields a reader needs to audit a candidate dossier

The dossier already carried uncertainty, blockers and evidence references. Three things were missing, and all three were filled from data that already existed.

**1. InChIKey per candidate.** The RDKit worker has always computed InChI in the *same* invocation as the descriptors. The registry's `chem-rdkit-descriptors` projection dropped it, so a persisted candidate carried no identifier anyone outside its own campaign could match on — a SMILES string is not one. The projection now keeps `inchiKey` and `inchi`, and `candidateProtocol.mjs` *reads* them off the persisted descriptor run. The dossier module still runs no engine, which is its own stated rule. A candidate whose descriptor run has no key reports `inchiKey: null` with `inchiKeyAbsentReason`; nothing is computed to fill the hole.

**2 and 3. Model version, model fingerprint, training-data hash.** A new `modelProvenance` section lists every `MODEL_ESTIMATE` run that contributed to the dossier with the identity of the model that produced it, plus the gate fingerprint where one was recorded. Where the recording engine stored no identity, the row says `UNRECORDED` and names exactly which fields are absent — it is never inferred from the engine name or the run date. A deterministic computation (RDKit descriptors, an AutoDock pose) is deliberately absent from the section: it has no trained model and no training data, and listing it would imply otherwise.

The section states in its own text that a fingerprint identifies a trained model and is **not** evidence that the model was validated; validation lives in its own sealed gate record.

`PROTOCOL_CONTRACT_VERSION` 1 → 2, because the dossier shape changed.

No `winnerScore` was added. The term does not exist in this repository and still does not.

---

## Item E — the raw-artifact hash is computed by Genesis, not accepted from the client

**The defect, stated plainly.** `ingestExternalLabObservation` took `rawArtifactSha256` as a string from the request body and checked only that it matched `/^[0-9a-f]{64}$/`. A hash that arrives in the same request as the claim it is supposed to protect protects nothing: whoever sends the claim chooses the hash. Every downstream surface then displayed that number as the raw-artifact hash of a laboratory measurement.

**The fix.** When the bytes are transmitted (`observation.rawArtifactBase64`), Genesis decodes them strictly and hashes **those bytes** with sha256, and its own result is what gets stored. Specifically:

- `rawArtifactIntegrity.level = VERIFIED_BY_GENESIS` with the byte count, when Genesis hashed the bytes itself.
- A declared hash that **contradicts** the bytes is a refusal — `raw_artifact_hash_mismatch`, HTTP 400, reporting *both* hashes and the byte count. Genesis does not silently prefer one of them, and nothing is ingested.
- A declared hash that matches is recorded as matching, and the computed value is still the stored one.
- No bytes sent → the observation is still accepted, but labelled `DECLARED_BY_CLIENT` with the reason spelled out: Genesis never saw the bytes, this is a claim by the submitting client about a file Genesis does not hold, and it must not be presented as a verified artifact hash.
- Strict base64 decode on purpose. `Buffer.from(x, 'base64')` silently discards what it does not recognise, so a corrupted upload would otherwise hash cleanly as whatever survived. Non-base64, empty and oversized (> 32 MiB decoded) inputs are refused rather than hashed.
- The integrity level is part of the observation fingerprint, so a record whose bytes Genesis hashed and one that merely quotes a hash are not the same record.
- The bytes themselves are **not** stored in the append-only event. The event is a record, not a file store; what is stored is the byte count and the hash Genesis computed.

**Append-only, Evidence and provenance are unchanged.** The observation is still a single immutable `LAB_OBSERVATION_INGESTED` event, still `INGESTED_UNREVIEWED`, still unable to reach the Evidence ledger without a human review event, still `clinicalEfficacy: UNKNOWN`, and an identical resubmission still dedupes to the same event. `LAB_CLOSED_LOOP_VERSION` 1.0.0 → 1.1.0.

**What this does not claim.** Verified means Genesis hashed the bytes it was given. That proves which bytes it holds. It does not prove an instrument produced them, and the integrity block says so in its own `limitation` field.

---

## Evidence table

| CAPABILITY | TEST | ENVIRONMENT | RESULT | EVIDENCE | STATUS | LIMITATION |
|---|---|---|---|---|---|---|
| Candidate dossier carries InChIKey | Real RDKit run through the registry, plus a dossier assembled from seeded records | Node, real RDKit 2026.03.6 | Aspirin returns `BSYNRYMUTXBXSQ-UHFFFAOYSA-N`; a candidate without a recorded key reports the absence | `rdkit.test.mjs`, `candidateProtocol.test.mjs` | GREEN | Identity only; says nothing about activity |
| Model identity for every model estimate | Dossier built from a campaign with one identity-less ADMET run and one fully recorded QSAR run | Node, in-memory SQLite | Unrecorded identity reported as `UNRECORDED` with the missing field names; recorded identity reported as auditable | `candidateProtocol.test.mjs` (3 tests) | GREEN | A fingerprint identifies a model; it is not a validation claim |
| Raw-artifact hash computed server-side | 7 route-level tests through the real HTTP handler | Node, in-memory SQLite | Bytes hashed by Genesis; contradicting declared hash refused with both values; no-bytes path labelled `DECLARED_BY_CLIENT`; corrupt base64 refused; dedupe intact | `apiLabClosedLoop.test.mjs` | GREEN | Proves which bytes Genesis holds, not that an instrument produced them |
| No regression | Full backend suite and repository lint | Node | see the commit's own run | `npm test --workspace=packages/backend`, `npm run lint` | GREEN | — |

Neither item is a biological claim, a candidate nomination or a deploy.
