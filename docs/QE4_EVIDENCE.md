# QE4 — evidence record: real Rényi-2 entropy recomputation (Brydges dataset)

Companion to `docs/QE4_PREREGISTRATION.md` (sealed before any analysis) and
`packages/frontend/src/core/biotechData/qe4-brydges/manifest.json` (dataset
provenance/hashes). This file records what was actually run and verified,
with commands and real output — not narrated from memory.

## 1. Dataset identity (Phase 0)

- URL: `https://zenodo.org/records/2527010`
- DOI: `10.5281/zenodo.2527010`
- License: **CC-BY-4.0** (from the record's own API response,
  `metadata.license.id`)
- Access: open
- Publication date: 2018-10-05
- Archive: `Data_aau4963_Updated.zip`, 2,286,535 bytes
- MD5: `5f027c6ee5d1283ca9338015e066dff6` — verified against **both** the
  Zenodo API's own reported checksum for this file and the task-stated
  value; identical
- SHA-256: `87424c2ddfbc9e68361d70a41878b63919ceb7257bdb70b4fad65d4179cd8389`
- `metadata.version` is absent from the API response (the record page's own
  "v2" label is not exposed by this field; `conceptrecid=1445994`,
  `revision=5` are what the API does expose — see manifest.json's note)

**Why this went through GitHub Actions, not a local fetch.** `curl` from
this sandbox to `zenodo.org` returns `403` on `CONNECT` (policy denial); the
agent-side `WebFetch` tool independently returned `EGRESS_BLOCKED` for the
same host. Both checked directly before doing anything else:

```
$ curl -sS -o /dev/null -w "HTTP_CODE:%{http_code}\n" --max-time 20 "https://zenodo.org/records/2527010"
curl: (56) CONNECT tunnel failed, response 403
HTTP_CODE:000
```

Real fetch instead ran on a GitHub Actions runner (ordinary internet
access) via `scripts/fetch-qe4-brydges-fixture.mjs`, which reads Zenodo's
own REST API (`zenodo.org/api/records/2527010`) for the file list,
checksums, license, and download URL — job run `34718066781`
(`qe4-brydges-recon`, job `103618756589`), succeeded. Content was read back
into the sandbox through the job's own log via the GitHub Actions job-logs
API and every file's bytes independently SHA-256-verified before being
committed — see `manifest.json` for the full per-file hash list and job IDs.

## 2. `Description_of_data.docx` verification (Phase 0)

Confirmed directly from the real fetched docx text (all four docx files in
the archive, extracted via `zipfile`+regex in the CI job):

- `MeasuredStates_T_Xms.csv` cells are **decimal-encoded 10-bit projective
  measurement outcomes** (0–1023) of the 10-ion string.
- Each row = 150 shots (columns) under one random local-unitary setting.
- `10Ions_CleanSystem`: ~500 rows/file. `10Ions_withDisorder`: 345 rows/file,
  **every 10 consecutive rows is one disorder realization** (stated
  verbatim in the docx).
- `RenyiEntropy_T_Xms.csv` / `Purity_T_Xms.csv`: tab-delimited, header row,
  authors' own published values + standard error + two numerical-simulation
  reference columns (never used as prediction inputs).
- `Fig1a/PureState.csv` / `MixedState.csv`: single-qubit Bloch-vector
  components (`Sx`,`Sy`,`Sz`), already averaged per random unitary — NOT raw
  per-shot bitstrings like `MeasuredStates`.

## 3. Preregistration (Phase 1)

Sealed in `docs/QE4_PREREGISTRATION.md` before any of this dataset's entropy
VALUES were opened (one disclosed, narrow exception: a `head -n 4` format
preview during Phase 0 surfaced a few of the authors' own published S2
values — documented and reasoned about explicitly in the preregistration's
own §0, since the hypotheses themselves were fixed by the task text, not
chosen after seeing them).

## 4. Analysis code (Phase 2)

- `packages/frontend/src/core/biotechData/qe4BrydgesEstimator.ts` — pure
  math: CSV parsers, the unbiased randomized-measurement cross-correlation
  estimator (Elben/Vermersch/Dalmonte/Zoller PRL 120, 050406 (2018);
  van Enk-Beenakker PRL 108, 110503 (2012) — the published formula Brydges
  et al. 2019 itself uses, not invented here), bootstrap (row-joint for
  clean, block-joint for disorder), weighted linear regression.
- `packages/frontend/src/core/biotechData/qe4BrydgesAnalysis.ts` —
  orchestrates the above over the pinned files, evaluates P1–P4 per the
  preregistered rules, and reuses `core/agent/tautologyGate.ts`'s
  `assessTautology` UNMODIFIED for Gate classification.
- TDD: `packages/frontend/src/__tests__/qe4BrydgesEstimator.test.ts` — unit
  tests against SYNTHETIC ground-truth states with known analytic answers
  (a maximally mixed qubit → Tr(ρ²)≈0.5; a degenerate zero-variance input →
  correctly clamped to Tr(ρ²)=1). Two of these tests initially FAILED
  against a genuinely correct estimator because of bugs in the synthetic
  test data itself (a bad low-bit LCG for "random" bits, and a wrong bit
  position for a single-qubit partition) — found and fixed by re-deriving
  the expected value by hand before touching the implementation; the
  estimator code was never the problem.

## 5. Real output (Phase 3, 4)

```
$ node scripts/repro-demo.mjs
...
  OK    QE4 (Brydges/Zenodo 2527010): P1-P4 werdykty P1=SUPPORTED_WITHIN_MODEL P2=SUPPORTED_WITHIN_MODEL P3=SUPPORTED_WITHIN_MODEL P4=SUPPORTED_WITHIN_MODEL
  OK    QE4: Tautology Gate (wszystkie 4 EMPIRICAL_TEST) [EMPIRICAL_TEST, EMPIRICAL_TEST, EMPIRICAL_TEST, EMPIRICAL_TEST]
  OK    QE4: P4 integralność (0 punktów poza pasmem ±3σ) 0 punktów poza pasmem z 74 porównanych
  OK    QE4: odcisk wyniku (replay)                  a6578ae8
  OK    QE4: tożsamość zbioru                        DOI 10.5281/zenodo.2527010

  WYNIK: 23/23 zgodne z wartościami oczekiwanymi w repo.
```

Full numeric detail (from `runQe4BrydgesAnalysis()` against the real pinned
data, bootstrap seed `0x51455134`, 2000 iterations):

- **P1 (clean extensivity, k=1..5 at T=5ms):** weighted-regression slope
  `0.4363 ± 0.0139` (3σ excludes zero); `S2(k=5)/S2(k=1) = 2.932` (≥1.5
  threshold); not collapsing vs. T=4ms. **SUPPORTED_WITHIN_MODEL.**
- **P2 (disorder log-growth + sub-extensivity, k=5):** `S2` grows
  `0.397→1.811` from T=1 to T=20ms (3σ significant); weighted RSS
  logarithmic fit (`0.87`) vastly better than linear (`24.08`); T=20ms value
  (`1.811`) significantly below the clean system's own k=5 saturation
  (`2.756` at T=5ms). **SUPPORTED_WITHIN_MODEL.**
- **P3 (protocol validation):** `S2(Pure)=0.0004±0.0062` (purity 0.9997),
  `S2(Mixed)=0.641±0.0095` (purity 0.641) — mixed significantly greater.
  **SUPPORTED_WITHIN_MODEL.**
- **P4 (integrity):** 74/74 (T,k) comparisons against the authors' own
  published tables fall within `±3σ_bootstrap`. **SUPPORTED_WITHIN_MODEL.**
- A real, physically expected structural feature emerged in the clean
  dataset's full k=1..10 sweep at T=5ms: S2 rises to a peak near the
  half-chain (`k=5`, `2.756`) then falls toward the full 10-ion system
  (`k=10`, `0.489`) — the Page-curve-like turnover a globally near-pure
  quenched state must show (`S(k)≈S(N−k)`), which is exactly why P1 is
  scoped to `k=1..5` rather than naively expecting monotonic growth to
  `k=10` (see `docs/QE4_PREREGISTRATION.md` §8).

## 6. Replay (Phase 5)

`packages/frontend/src/__tests__/qe4BrydgesAnalysis.test.ts`'s `REPLAY` test
calls `runQe4BrydgesAnalysis()` twice and asserts byte-identical
`cleanPoints`/`disorderPoints` arrays and an identical `resultFingerprint`
(`a6578ae8`, `fnv1a(canonicalJson(...))` over the full numeric result) —
confirmed deterministic (fixed bootstrap seed, no wall-clock/random-without-seed
dependency anywhere in the pipeline).

## 7. Genesis integration (Phase 6) — architectural gap, reported not silently bridged

Audited before writing any new code (see conversation record): `core/agent/
tautologyGate.ts`'s `assessTautology` already supports multi-component
classification generically and is reused here unmodified.
`core/biotechData/externalAnchor.ts` (the P2.3 external-anchor pattern) is
architecturally a single-observation-vs-single-prediction contract — forcing
QE4's four independent, co-equal hypotheses into it would mean either
inventing new semantics inside that module or silently reporting only one
of the four verdicts. `core/discovery/discoveryCase.ts` +
`discoveryConclusion.ts` (this session's own canonical multi-criterion
path, per `docs/DECISIONS.md` D-021) supports one PRIMARY + N SUPPORTING
criteria rolled into ONE verdict — not four CO-EQUAL independent verdicts —
and is hard-typed to the epidemic Scenario Engine's two-arm
baseline/variant structure, which QE4 has no analog of.

**Conclusion, per Phase 6's explicit instruction to stop and report rather
than silently add an abstraction:** there is no existing Genesis seam for
"one external pinned dataset + N independent preregistered hypotheses, each
with its own verdict + replay" without inventing a new persistence/display
shape (an 11th `SavedExperiment` "investigation shape" in `scienceMemory.ts`,
plus a new `evidenceShowcase.ts` branch to display it on `#/evidence`). That
is a real architectural decision (new UI/persistence surface), not a pure
function — so it was NOT made unilaterally here. What WAS reused, unmodified:
`assessTautology` (the Gate itself) and the `core/repro/reproEntry.node.ts` +
`scripts/repro-demo.mjs` "one-command Node reproducibility" facade pattern,
exactly as `externalAnchor.ts`'s own two anchors already do — this IS the
existing backend/service path for a real-data analysis in this repo, and QE4
runs through it for real (`node scripts/repro-demo.mjs`, verified above).

**Recommendation, not acted on:** if `#/evidence` display for QE4 is wanted,
it needs its own short ADR (mirroring D-021's process) deciding the new
`SavedExperiment` shape's contract — not a decision this task should make by
building it silently.

**UPDATE (2026-09-13, QE4-integration round) — the recommendation above was
acted on, and the "11th `SavedExperiment` shape" option was explicitly
REJECTED once actually assessed against `externalAnchor.ts`'s own precedent.**
QE4 is a pinned, deterministic, no-user-trigger dataset anchor — the closest
existing analog (`externalAnchor.ts`'s PubChem/Kepler-Mars) has NO
`scienceMemory.ts` persistence at all; it renders live from a static
registry. Building an 11th persisted shape for QE4 would have been building
machinery its own closest analog does not have. Instead, per `docs/DECISIONS.md`
D-023, a single new, minimal, domain-agnostic module —
`core/agent/externalDatasetCase.ts` — was built to hold "N independent
co-equal verdicts over one external dataset" without collapsing them, reusing
`assessTautology`/`beliefRevision.ts`/`fnv1a` unmodified. The only QE4-specific
file is `core/biotechData/qe4EvidenceCase.ts` (pure reshaping, zero scientific
logic). `#/evidence` now renders all four verdicts live via a new
`MultiHypothesisCasesSection`, and `qe4BrydgesAnalysis.ts`/
`qe4BrydgesEstimator.ts` are genuinely reachable from `main.tsx` — removed
from `moduleReachability.test.ts`'s `ALLOWED_ORPHANS`. P1–P4's verdicts,
thresholds, preregistration, and bootstrap are byte-for-byte unchanged
(`resultFingerprint` still `a6578ae8`). See D-023 for the full comparison
against the two rejected alternatives.

## 8. Real Chromium E2E (Phase 7 at the time; superseded below)

No new UI screen was built for QE4 in the original Phase 0-8 round, per
Phase 7's explicit instruction not to invent one when no suitable existing
UI exists (§7 above explains why none did, architecturally, AT THAT TIME).
The "real E2E" for that round was `node scripts/repro-demo.mjs` itself: a
real Node process, real esbuild bundle of the actual TypeScript source (not
a mock), real file reads of the pinned CSVs, real computation, exit code
0/1 — verified above with real output.

**UPDATE (2026-09-13, QE4-integration round):** `#/evidence` now DOES
display QE4 (see §7's update). A real Chromium E2E now also exists for it:
`scripts/qe4-evidence-case-e2e.mjs`, run against a real `vite preview`
server with real Playwright + Chromium (desktop and mobile viewports),
asserting all four hypothesis cards, their Tautology Gate classifications,
belief revision, next questions, the case-level provenance/fingerprint
block, the un-collapsed verdict tally, zero console/page errors, and that
the pre-existing PubChem/Kepler-Mars anchors still render (regression). Both
`repro-demo.mjs` and this new script now pass side by side — the old
"backend/service path" proof was not removed, a UI proof was added on top.

## 9. Quality gate (Phase 8)

See the task's final report (chat) for command-by-command output:
`tsc --noEmit`, `eslint`, full frontend `vitest run`, full backend
`node --test`, `npm run build`, `node scripts/repro-demo.mjs`.

## 10. Limitations, stated plainly

- This is a REPRODUCTION of known physics (thermalization vs. many-body
  localization) plus a REPLICATION check (P4) against the authors' own
  published numbers — not a discovery. Confirming P1–P4 does not establish
  anything new about nature; it establishes that Genesis can take real
  external data through a genuine, independent, preregistered, auditable
  pipeline and get an answer that agrees with the original experiment.
- `20Ions_CleanSystem` and the disorder-only mutual-information/`Numerics`
  files were never opened for analysis (out of scope, decided before
  opening — manifest.json's `excludedFromScope`).
- The ion-to-bit convention (§4 of the preregistration) is Genesis's own
  fixed labeling, not verified against the paper's physical ion ordering —
  does not affect any of P1–P4's claims (all invariant under relabeling),
  would matter for a claim about one specific physical ion, which none of
  P1–P4 make.
- ~~`#/evidence` does not display QE4~~ — RESOLVED 2026-09-13, see §7's update
  and `docs/DECISIONS.md` D-023: it now does, through a new, minimal,
  domain-agnostic `externalDatasetCase.ts` module, not a QE4-specific hack.
- The `EvidenceShowcaseScreen` route's browser chunk grew to ~3.25 MB
  (~1.3 MB gzipped) now that it bundles QE4's pinned CSV dataset for the
  live, in-browser recomputation — a real, disclosed consequence of shipping
  real data to the browser, not a defect, and not addressed further here
  (out of this round's "smallest reusable solution" scope).
