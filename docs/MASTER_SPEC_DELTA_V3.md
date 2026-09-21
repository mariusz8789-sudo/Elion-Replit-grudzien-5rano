# GENESIS AUTONOMOUS DISCOVERY ENGINE — MASTER SPEC DELTA v3

> **C1 EDITORIAL NOTE (2026-09-13) — REPOSITORY TRUTH OVERRIDES THIS DOCUMENT.**
> Dokument Research Directora (Qwen), zapisany dosłownie. Qwen **nie ma dostępu do repo**,
> więc jego etykiety statusu (DONE / IN PROGRESS / NOT STARTED) są deklaracjami projektowymi,
> nie stanem repozytorium. Wiążąca jest zasada z nagłówka oryginalnego wklejenia,
> odtworzona poniżej w §PRE.
>
> **Co jest już nieaktualne wobec HEAD (stan 2026-09-13):**
> - §3 TASK BOARD: P0.1 `DatasetLaboratory` **istnieje** (`core/agent/datasetLaboratory.ts`),
>   P0.2/P0-6 QE4 regime round **jest skanonikalizowany** (D-026, commit `54c78c1`),
>   a generyczny silnik kampanii (`core/agent/discoveryCampaign.ts` + `modelSpace.ts` +
>   `residualStructure.ts`) **wylądował** w `166665f` i działa na dwóch niezależnych
>   realnych zbiorach (QE4 Brydges, NASA NSSDC). Task board sprzed tych commitów jest stale.
> - "Cross-campaign dedup" pozostaje **UNVERIFIED** — zgodnie z §0 tego dokumentu,
>   i to potwierdza repo: zero implementacji (owner: C2).
> - **EIG pozostaje BLOCKED.** Planer punktuje `discrimination` (rozrzut predykcji żywych
>   modeli w jednostkach sigma obserwacji) i nazywa się dokładnie tym, czym jest.
>
> Zapisane do repo, bo czat ginie, a zadanie zostaje.

---

## PRE. BINDING PREAMBLE (z oryginalnego wklejenia, dosłownie)

IMPORTANT — REPOSITORY TRUTH OVERRIDES THIS DOCUMENT

The two documents below are the Research Director specification/handoff.

They are NOT authoritative over repository state.

Before changing code:
1. Verify every DONE / IN PROGRESS / NOT STARTED claim against the current repository HEAD.
2. Treat git history, tests, runtime evidence and existing code as authoritative.
3. Pay particular attention to the P0.2 canonicalization issue: there were two competing implementations reported around commits 6a6e039 / b5449fac.
4. Do not delete either implementation until you have compared them and established which one is canonical.
5. Do not assume any Qwen "REUSE" claim unless the repository confirms it.
6. Do not implement something merely because the document says it is missing if the repo already contains it.
7. Do not expand scope without reporting the conflict first.

After verification, continue with the assigned work using the documents as the design specification.===== DOCUMENT 1: MASTER SPEC DELTA v3 =====
---


**STATUS: DESIGN / DELTA v3 / C1-AUDIT-ALIGNED / NOT IMPLEMENTED (Qwen has no repo access).**
State labels used throughout: **DONE** (confirmed in repo by orchestrator/C1), **IN PROGRESS**, **NOT STARTED**, **BLOCKED**, **UNVERIFIED** (not confirmed against repo — must not be treated as existing). Qwen does not invent implementations. Corrections from the C1 audit and orchestrator are binding below.

## 0. BINDING CORRECTIONS (do not regress)
- **`campaign/orchestrator.mjs` is NOT a generic `DatasetLaboratory`.** It is the campaign orchestrator. The generic observation-source abstraction is the separate `DatasetLaboratory` (P0.1, DONE per orchestrator at `740577b`). Do not collapse the two.
- **Cross-campaign dedup is UNVERIFIED / not confirmed implemented.** Do NOT tag it REUSE or DONE. It remains a task (owner C2) until C2 confirms implementation in repo.
- **EIG (expected information gain) stays BLOCKED** until there is an implementational basis (a posterior representation over the hypothesis set + a way to score an experiment's entropy reduction). No agent may claim EIG scoring before that basis exists; the planner uses the non-EIG terms only.
- **One owner per component. No duplicated tasks.**

## 1. EXISTING FOUNDATION — C1-VERIFIED (REUSE)
Confirmed present in repo (orchestrator/C1 audit):
- Campaign engine `packages/backend/src/campaign/*` (loop driver, rounds, state) — REUSE.
- `makeCampaignNextAction` / `CAMPAIGN_SELECTOR_ID` (next-action selector = planner core) — REUSE.
- `tautologyGate.assessTautology` (domain-agnostic) — REUSE.
- `beliefRevision.createHypothesis` / `updateConfidence` / `evidenceCeiling` — REUSE.
- `events/hash` `fnv1a` / `canonicalJson` — REUSE.
- `externalAnchor`, `externalDatasetCase` (+ `qe4EvidenceCase`), `ScientificEvidencePack` / `discoveryCase` precedents — REUSE.
- Evidence / Provenance / Replay / Scientific Memory foundations — REUSE.
- ChEMBL / PubChem / Kepler / CMS anchors — REUSE.
- `DatasetLaboratory` + QE4 implementation (P0.1) — DONE (`740577b`).

## 2. OWNER MAP (one owner per component)
| Owner | Scope |
|---|---|
| Orchestrator session | P0.2 (DONE `6a6e039`) + already-taken/closed tasks |
| C1 | B1 (ULEZ NO₂ adjudication: `causalInference.ts` + DEFRA AURN data freeze) |
| C2 | cross-campaign dedup → P0-1 (selector scoring gates) → P0-4 (truth-schema) |
| C3 | P0-3 (stopping rules) → P0-5 (adversarial self-falsification pass) |
| Qwen | Research Director only — no repo, no code; A1 package + this DELTA |
| A1 execution | unassigned agent (C2 after dedup, or C3 after P0-5); see Document 2 |

## 3. TASK BOARD (status per component)
| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| P0.1 | `DatasetLaboratory` + QE4 observation source | Orchestrator | **DONE** | `740577b`; distinct from `campaign/orchestrator.mjs` |
| P0.2 | Hypothesis generator from `(T,k)` grid + `parentHypothesisId`/`generatedBy` lineage | Orchestrator | **DONE** | `6a6e039` |
| P0-1 | Selector scoring gates (Sep/Fals/Avail/Cost/Risk/Redund; hard gates) — **EIG excluded (BLOCKED)** | C2 | **NOT STARTED** | extends `makeCampaignNextAction` inputs |
| P0-3 | Stopping rules enum + evaluation in campaign state machine | C3 | **NOT STARTED** | |
| P0-4 | Truth-schema: `INFERENCE`, `CONFLICTING_EVIDENCE` + confidence/evidence-strength/assumptions/counterevidence + enforcement | C2 | **NOT STARTED** | |
| P0-5 | Post-round adversarial self-falsification pass (counterevidence, discriminating experiment, HARKing/circularity/tautology/bias checks) wiring existing falsification + tautologyGate | C3 | **NOT STARTED** | |
| P0-6 | Round provenance/replay fingerprint wiring (every campaign round → fingerprinted event + DiscoveryState fingerprint; replay-MATCH gate) | UNVERIFIED owner | **NOT STARTED** | verify-first against existing `events/hash` + replay |
| dedup | Cross-campaign dedup (key = fnv1a of hypothesis+design+datasetVersion+config; rerun only with declared justification) | C2 | **UNVERIFIED / NOT STARTED** | do NOT treat as existing |
| EIG | Expected-information-gain scoring term | — | **BLOCKED** | needs posterior-over-hypotheses basis first |
| B1 | ULEZ NO₂ adjudication (`causalInference.ts` DiD/ITS/synthetic-control + DEFRA AURN freeze) | C1 | **IN PROGRESS** | 12 shards done; artifact transport; freeze pending (see §6 notes) |
| A1 | GLP-1 substitution (ChEMBL + ClinicalTrials.gov) | unassigned | **READY FOR EXECUTION / NOT RUN** | Document 2; needs no new engine post-P0.1 |
| causal-inference reusable | DiD/ITS/synthetic-control component | C1 | **IN PROGRESS** | TRUE NEW; serves B1/gov/water |
| Laboratory contract generalization | unify `externalAnchor`/`externalDatasetCase`/campaign lab adapters | — | **NOT STARTED (P2)** | not P0 |
| Policy Control Plane | action-vs-truth config | — | **NOT STARTED (P2)** | never alters TRUTH |
| World/Spatial unification | one engine, world plugins | — | **NOT STARTED (P2)** | |
| Cross-domain analogy | TRANSFERRED_HYPOTHESIS only | — | **NOT STARTED (P3)** | |
| Drug ADME/Tox adapters | optional RDKit/OpenMM/PySCF hooks | — | **BLOCKED / UNVERIFIED** | confirm hooks exist before P1 drug pipeline |

## 4. DEPENDENCIES
- **P0 (current):** P0.1, P0.2 DONE. Remaining P0 = P0-1, P0-3, P0-4, P0-5, P0-6, dedup — all EXTEND on existing campaign engine/selector; zero new engines. EIG BLOCKED within P0.
- **P1:** DiscoveryState/why-best EXTEND; candidate generalization; causal-inference (C1, IN PROGRESS); A1 execution; B1 completion; drug ADME/Tox `[UNVERIFIED]`.
- **P2:** Laboratory contract generalization; World/Spatial unification; Policy Control Plane.
- **P3:** cross-domain analogy detection.
- First autonomous demonstrator (QE4 bounded regime campaign on `DatasetLaboratory` + `externalDatasetCase`) becomes runnable once P0-1/P0-3/P0-4/P0-5 land; EIG not required for the first loop (use Sep/Fals/Redund gating).

## 5. WHAT IS / IS NOT BEING BUILT
- Building (EXTEND only, P0): selector gates, stopping rules, truth-schema, adversarial pass, round provenance wiring, cross-campaign dedup.
- Not building now: new orchestrator, new planner engine, new dedup engine, EIG, Laboratory contract, Policy Control Plane, World engine, cross-domain, drug pipeline.
- Never building: individual prescription/dose/medical advice; policy decree; cross-domain transfer asserted as FACT; ungrounded open-ended hypothesis generation.

## 6. B1 DATA-FREEZE NOTES (for C1 — provenance integrity)
- Provenance root = DEFRA, not CI artifacts. Record: source URL (DEFRA Data Selector/preformatted), access method including the proxy workaround (GitHub MCP / artifacts, because raw-blob egress is blocked), timestamp, and sha256 of raw files after download.
- Shard-merge determinism: shard boundaries (stations/months) and merge order enter preregistration/preprocessing fingerprint so the 12-shard merge is bit-reproducible; check no station duplication at shard seams.
- Raw beside aggregates: if shard artifacts are already hour→month aggregates, also freeze a sample of raw hourly CSVs (a few stations) as a raw layer for preprocessing control.

## 7. SELF-AUDIT
- Foundations §1 = C1-VERIFIED. `campaign/orchestrator.mjs` ≠ `DatasetLaboratory` (binding). Cross-campaign dedup = UNVERIFIED (not tagged REUSE). EIG = BLOCKED. Ownership = one-per-component, no duplicates. A1 = READY FOR EXECUTION / NOT RUN (no Qwen code). Everything else NOT IMPLEMENTED / NOT VERIFIED where unconfirmed.