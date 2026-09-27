# Genesis Atom-Bohr — G3 Forensic and Security Containment Review

**Base: LIVE `87f98c8` (`docs: record AME2020 terms blocker`).** Docs-only, one file, own branch.
No Option D, no Scientific Core change, no fixture created, no Evidence/Replay added, no merge to LIVE.
No artifact content was downloaded and no secret value appears in this document.

## Decision

| Gate | Result |
| --- | --- |
| **G3** | **`BLOCKED / REFERENCE_UNPINNED`** |
| **PINNED** | **NO** |
| **M-7** | **FAIL** |
| **AC-2** | **FAIL** |
| **LICENSE** | **`VERIFY_REQUIRED`** |
| **Option D** | **`NOT AUTHORIZED`** |
| **Security containment** | **COMPLETE** — all three historical G3 artifacts are gone |

G3 is blocked on **three independent grounds**, only one of which was previously known. The new one is
the most serious: **the A2 and A3 source payloads are not byte-reproducible**, so they cannot be pinned
by the current design at all.

---

## A. Historical artifacts

The G3 job was introduced in `2134ae6`. The A4 guard landed later, in `e49c598` (2026-08-27 22:18:24 UTC).
Every G3 run that went green **before** the guard wrote and uploaded the raw, token-bearing A4. Three
such runs exist, all on the LIVE branch:

| Run | Commit | Job time (UTC) | Artifact created (from the job log) | Size |
| --- | --- | --- | --- | --- |
| `33120357769` | `cd0dd117` | 21:55:58 | `atom-bohr-nist-g3-cd0dd117…`, ID `9666206820` | 50 082 B |
| `33120755017` | `5751d693` | 22:01:26 | `atom-bohr-nist-g3-5751d693…`, ID `9666349975` | 50 092 B |
| `33121795133` | `852c483f` | 22:15:58 | `atom-bohr-nist-g3-852c483f…`, ID `9666735214` | 50 093 B |

Each upload contained 5 files (A1–A4 raw plus `manifest.json`).

**Correction to my previous report.** I earlier recorded run `33121795133` as having produced no G3
artifact, because the artifact listing showed only `genesis-os-dist`. The job log for job
`98690189115` shows an upload did occur (ID `9666735214`) — the artifact had already been deleted
before I listed it. Three artifacts were created, not two.

## B. Containment status

Re-enumerated via the Actions API at review time. **No content was downloaded.**

| Run | G3 artifact now | Verified by |
| --- | --- | --- |
| `33120357769` | absent — only `genesis-os-dist` | `list_workflow_run_artifacts` |
| `33120755017` | absent — only `genesis-os-dist` | `list_workflow_run_artifacts` |
| `33121795133` | absent — only `genesis-os-dist` | `list_workflow_run_artifacts` |

Artifact `9666349975`, which was still present and `expired: false` earlier in this session, no longer
appears in its run's artifact listing, and the artifact-metadata endpoint returns `404 Not Found` for it.
Both signals agree: it has been deleted. **Containment of the stored copies is now COMPLETE.**

The guard is confirmed live on LIVE HEAD. Run `33125944293`, job `98704003896`, step 4 fails with:

```
Error: A4-nist-srd-terms: official terms payload contains an embedded access token;
       refusing to write or upload it
    at scripts/fetch-atom-bohr-nist-fixtures.mjs:99:11
```

Steps 5 (manifest verification) and 6 (upload) were skipped. No A4 bytes reached disk or storage.

## C. Potential credential exposure

The payload is the official NIST SRD terms page. It embeds a third-party mapping-service access token
(public-style key prefix; the value is deliberately not reproduced here). Key points:

- The credential is **not Genesis's**. It is published by the upstream site inside its own page markup.
  Genesis's exposure is that it *copied and re-hosted* that page in three CI artifacts for ~1–2 hours.
- Blast radius is limited: the artifacts were repository-scoped, required authenticated access, and are
  now deleted. Anyone with repo read access during that window could have retrieved them.
- Because the token is upstream's, Genesis **cannot** rotate it and must not try.

**Owner actions:**

1. **Deletion — already done.** Verify once more in the Actions UI that no `atom-bohr-nist-g3-*`
   artifact is listed for runs `33120357769`, `33120755017`, `33121795133`.
2. **Attribution check.** Confirm the token belongs to the upstream site and not to this organisation.
   If it is in any way credited to Genesis, rotate/revoke it immediately.
3. **Do not report the value onward** beyond a private notice to NIST if the owner chooses to.
   It is upstream's to manage.
4. **Do not attempt to strip the token and keep the page.** A redacted terms page is no longer the
   official artifact and cannot serve as a licence reference.

Claude took no action against systems it does not own, and did not download, mirror or transcribe the
credential.

## D. Artifact deletion status

`DELETED — verified` for all three. See section B.

## E. Owner actions (consolidated)

| # | Action | Why |
| --- | --- | --- |
| 1 | Confirm zero `atom-bohr-nist-g3-*` artifacts remain | Closes the containment loop |
| 2 | Decide the A4 licence route (below) | A4 can never pass the guard as-is |
| 3 | Decide the A2/A3 reproducibility route (section F) | New blocker; A4 alone does not fix it |
| 4 | Decide whether the G3 job stays a blocking gate | LIVE CI is currently red on every commit |

On (4): since `e49c598`, **every** LIVE run fails, because the guard makes the G3 job fail by design
while A4 is unfixed. On LIVE HEAD `87f98c8` the `verify` and `Real PySCF benchmark` jobs both pass and
the run is red solely on G3. A permanently red gate cannot signal regressions in unrelated work. Either
make G3 non-blocking until the source questions are settled, or accept that the gate no longer
distinguishes healthy from broken commits.

## F. Current G3 state — forensic review from code

Source of truth: `scripts/fetch-atom-bohr-nist-fixtures.mjs` and the `nist-g3-pinned-artifacts` job in
`.github/workflows/ci.yml`, both read at `87f98c8`.

### Per-artifact

| | A1 | A2 | A3 | A4 |
| --- | --- | --- | --- | --- |
| Source | CODATA complete listing | NIST ASD lines | NIST ASD energy levels | NIST SRD terms page |
| URL | `physics.nist.gov/cuu/Constants/Table/allascii.txt` | `physics.nist.gov/cgi-bin/ASD/lines1.pl` | `physics.nist.gov/cgi-bin/ASD/energy1.pl` | `www.nist.gov/open/copyright-fair-use-…-srd-…` |
| Query | none (static file) | `spectra=H+I`, `low_w=650`, `upp_w=660`, **`unit=1`**, **`show_av=3`**, `format=1`, `unc_out=1` | `spectrum=H+I`, `units=1`, `format=1`, `unc_out=1`, `level_out=on` | none |
| Semantics | CODATA 2022 constants | H I lines, 650–660 nm, **vacuum/all wavelengths** | H I evaluated levels in eV | licence/terms, not an observable |
| Content assertion | `Fundamental Physical Constants`, `2022 CODATA adjustment` | **`H I` only** | **`H I` only** | `Standard Reference Data` |
| Security behaviour | none | none | none | token guard, line 98 |

**A2 verified as specified**: `unit=1`, `low_w=650`, `upp_w=660`, `show_av=3` are all present verbatim in
the URL at line 23 — vacuum-wavelength semantics confirmed from the code, not from a summary.
**A3 verified as specified**: the endpoint is `energy1.pl`, the NIST ASD Energy Levels form (line 35).
It is **not** NIST Chemistry WebBook. My earlier objection on this point is resolved.

### Validation order — correct

Lines 88–106, in order: fetch → decode → `mustContain` markers → **A4 token guard (98–100)** → SHA-256
(101) → `writeFile` (103) → manifest entry (105) → upload (workflow step 6). The security check
precedes the write, the manifest and the publication. **Guard placement: PASS.**

Two scope notes on the guard: it is keyed to `item.id === 'A4-nist-srd-terms'`, so a credential
appearing in A1–A3 would be written and uploaded unchecked; and the pattern `/pk[.][A-Za-z0-9_-]+/`
recognises one vendor's key shape only. Neither is exploited today (A1–A3 are plain data files), but a
payload-wide scan would be the stronger rule.

**Manifest cardinality: PASS.** `ci.yml` asserts `manifest.artifacts.length !== 4` → throw.

### The new blocker — A2 and A3 are not byte-reproducible

The only change to the G3 pipeline between `cd0dd117` and `87f98c8` is the three-line A4 guard
(`git diff cd0dd11 HEAD -- scripts/fetch-atom-bohr-nist-fixtures.mjs`). The URLs, queries and hashing
are byte-identical code. Yet three runs of that identical code give:

| Artifact | `cd0dd117` @ 21:56 | `852c483f` @ 22:16 | `87f98c8` @ 23:20 |
| --- | --- | --- | --- |
| A1 | 40 801 B · `77fb90e6…3e67e67` | 40 801 B · `77fb90e6…3e67e67` | `77fb90e6…3e67e67` |
| A2 | 32 646 B · `7984eb55…f58484557` | 32 646 B · `9ea946f8…f9ee74de2` | `f725ef21…768335551` |
| A3 | 109 196 B · `796e2c5f…6a34328d50` | 109 196 B · `20373d12…5bad95b64` | `f8f2405f…7c4237cd2b` |
| A4 | 92 638 B · `9ae06a76…c46316421` | 92 639 B · `750a5a97…3e10fc066` | blocked by guard |

- **A1 is stable** across 85 minutes — same bytes, same hash. It is genuinely pinnable.
- **A2 and A3 change on every request** while their **byte length stays exactly constant**
  (32 646 and 109 196 in both measured runs). Constant length with a different digest is the signature
  of a fixed-width volatile field embedded in the response — a timestamp, request id or session marker.
- **A4 changes too**, and its length moves as well.

This was invisible until now because the manifest verification step re-reads the files the same job just
wrote and re-hashes them, comparing them to the hash computed from those same bytes seconds earlier. It
is a tautology: it can only fail on disk corruption. **It cannot detect source volatility, and never
could.** Every "G3 VERIFIED" line in the logs attests to intra-run consistency only.

Consequences, in order of importance:

1. A hash for A2 or A3 recorded in any document is **valid only for the single capture it came from**.
   The three A2 hashes in the record are all "correct" and all different. Re-fetching to confirm a
   pinned A2/A3 is guaranteed to report `DRIFT` — a false alarm, permanently.
2. Committing the raw bytes pins one capture. That is necessary but it does **not** make the reference
   verifiable against the source, and the provenance claim "this is what NIST ASD returns" cannot be
   re-checked by anyone.
3. `manifest.json` is itself non-reproducible by construction: `retrievedAt` (line 6) is a fresh
   timestamp on every run, so the manifest's own bytes always differ.

Fixing A4 does **not** fix this. This is a design question about the source, and it needs a CTO decision
before any fixture is committed. Three routes exist, and I am not choosing one here:

- **Route 1 — pin the raw capture and drop re-verification.** Commit one A2/A3 capture, record its
  hash, and state explicitly that the hash pins *the stored file*, not the upstream response. Honest,
  cheap, and gives up source re-verifiability.
- **Route 2 — pin a normalised derivative.** Define and version a documented transform that strips the
  volatile field, then hash the normalised bytes. Restores reproducibility, but the pinned artifact is
  no longer the raw payload, so the transform itself becomes part of the provenance and must be
  fingerprinted.
- **Route 3 — find a genuinely static ASD distribution.** A versioned data release rather than a CGI
  query, if one exists that carries the needed observables. Best outcome if available; needs research.

Route 2 is the only one that satisfies both "reproducible" and "re-verifiable", at the cost of an extra
provenance element. It should not be implemented before the CTO picks a route.

A second, smaller finding: the content assertions for A2 and A3 are `['H I']` — three characters. That
substring would match an empty result set, an error page, or a query echo. Nothing checks that a
vacuum-wavelength column is present for A2, or that the ionization-limit row is present for A3 — the
two things the benchmark actually depends on. Whatever route is chosen, those assertions need to name
the columns.

## G. M-7 (no-network replay) — **FAIL**

M-7 requires replay to read pinned files and never refetch. `git ls-files` shows no committed A1–A4
payload; the only tracked atom-bohr files are `packages/frontend/src/labs/experiments/atom-bohr-consequence.ts`
and the fetch script itself. `docs/evidence/atom-bohr-nist/` **does not exist** (`docs/evidence/` holds
only the PySCF evidence JSON and the USGS contract fixtures). No production or test code references
`atom-bohr-nist`, `A1-codata` or `asd-hydrogen`. A replay today could only obtain the data by
refetching, which M-7 forbids. Independently, the volatility in section F means a refetching replay
would return different bytes anyway.

## H. AC-2 (durable pinned reference) — **FAIL**

Zero of four raw payloads are in Git. The fixtures live under `artifacts/atom-bohr-nist`, a CI-only
path. Retention of 90 days on a deleted-or-expiring artifact is not durability, and every one of the
three artifacts that ever held these bytes has now been deleted — so the bytes behind the recorded
hashes no longer exist anywhere Genesis controls.

## I. Licence status — **`VERIFY_REQUIRED`**

Downloadable is not redistributable, and nothing in the pipeline establishes redistribution rights.
A4 — the artifact whose entire purpose is to record the terms — is the one that cannot be captured.
All four entries carry the same `termsUrl`, so **no** artifact has confirmed terms, A1 included.
Until the terms are pinned, the repository has no recorded basis for storing the raw payloads or for
shipping them inside a product. Licence therefore stays `VERIFY_REQUIRED` for A1, A2, A3 and A4.

## J. Pinned status — **NO**

| Requirement | State |
| --- | --- |
| A1–A4 raw bytes in Git | **absent** |
| SHA-256 from real bytes | computed in CI, but the bytes are gone and, for A2/A3, not reproducible |
| Manifest | generated per run, never committed, non-reproducible by construction |
| Metadata / source / query / retrieval context | present in the script and manifest — **the one part that is ready** |
| Licence / terms | `VERIFY_REQUIRED` |
| Transform | undefined — and now required, pending the route decision in section F |
| Repo persistence | none |

Three of seven requirements fail outright and one is undefined. `PINNED` is not claimable.

## K. Option D — **`NOT AUTHORIZED`**

Unchanged and not started: no `expectedValues[]`, no `transitionWavelengthNm`, no `ArmReference`, no
`referencePolicy`, no migration, none of the 17 cases. Option D remains gated on G3 = PASS. With
references unpinned, every arm would resolve `VERIFY_REQUIRED` and the protocol outcome would be
`INCONCLUSIVE` or `BLOCKED` by construction — a benchmark that cannot report a result while still
triggering the `modelVersion` fingerprint migration.

## Verification method

Everything above was re-derived at review time. Artifact existence came from the Actions API listing
per run, never from a download. Hashes and byte counts came from the primary job logs of runs
`33120357769`, `33121795133` and `33125944293`, not from any prior document. Guard placement, queries,
markers and manifest cardinality came from reading `scripts/fetch-atom-bohr-nist-fixtures.mjs` and
`.github/workflows/ci.yml` at `87f98c8`. The claim that only the guard changed between runs came from
`git diff`. Fixture absence came from `git ls-files` and `git ls-tree`.

## Next

One action: **CTO decides the A2/A3 reproducibility route (Route 1, 2 or 3 in section F).** Everything
else — a safe A4, committing fixtures, the M-7 test, Option D — depends on that answer, and committing
a fixture before it is settled would pin bytes under a provenance claim that cannot hold.
