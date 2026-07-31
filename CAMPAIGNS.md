# Research Campaigns

Scientists rarely analyse one molecule — they run campaigns and compare candidates. The
Campaigns module (Stage 7) turns Genesis from single-molecule analysis into decision support
for a whole research project, built **entirely on the Stage 6 comparison engine** — one
source of truth, no parallel logic.

Screens: `#/campaigns` (list + create), `#/campaigns/<id>` (campaign workspace).

---

## Data model (`packages/frontend/src/core/campaigns.ts`)
A **campaign** = metadata (name, description, scientific goal, owner, created date, status)
+ a list of **molecules**. Each molecule stores its **verified RDKit descriptors once**
(never recomputed) plus a lifecycle stage and a transition **timeline**.

**Molecule lifecycle:** `New → Analysed → Compared → Selected / Needs-Validation / Rejected
→ Archived`. Every transition is timestamped in the molecule's timeline.

Persistence is **client-side** (`localStorage`, per user, via `core/storage.ts`) — the same
pattern as the analysis history. This is a deliberate, documented limitation: no server sync,
no team sharing, per-browser only, and quota-bounded. See KNOWN_LIMITATIONS.md §3. It is the
#1 thing to change before selling to a laboratory (see FUTURE_WORK.md).

## Execution pipeline (shared, fault-tolerant)
`core/batchRunner.ts` is the **single** analysis pipeline (introduced in Stage 6, extracted
in Stage 7 so Compare and Campaigns use identical code):
- Bounded concurrency (4 workers) — never fires 2,000 subprocesses at once.
- **Fault-tolerant:** an invalid SMILES is marked *Invalid* with its validation error and
  excluded from ranking; the campaign continues. One bad molecule never aborts the run.
- **Cancellable** (AbortSignal) with partial completion; **resumable** within the session
  (re-runs only pending molecules — results are already stored). No persistent crash
  recovery (by design).
- Live progress: Total / Analysed / Invalid / Pending / % / estimated remaining time.

## What a campaign shows
- **Dashboard** — counts, verdict buckets, average descriptor statistics, grounding summary.
  Only computed information — no biological / efficacy / toxicity predictions.
- **Ranking + Decision Trace** — the Stage 6 ranking, each row expandable to a Decision
  Trace: descriptors used, rules triggered, positive/negative contributions, rejected rules,
  grounding status. The trace is a **pure projection** of the ranking data
  (`moleculeComparison.decisionTrace`) — the same "WHY (+/−)" lines, not a second engine.
- **Scientific Matrix** — the reused Stage 6 `ComparisonReport` (heatmap, ranking, flags,
  strengths/weaknesses, reference comparison). Any future ranking improvement appears here
  automatically.
- **Candidate lifecycle & timeline** — per-molecule stage + full transition history.
- **Campaign Report** — Executive Summary, Top / Rejected candidates, Decision Trace,
  Scientific Comparison, Grounding + Provenance Summary, Statistics, Limitations, and an
  explicit *Experimental Validation Required* banner.

## Export (`core/campaignExport.ts`)
- **CSV** — one row per molecule: verified descriptors, verdict, provenance (RDKit +
  grounding versions); invalid rows carry their validation error.
- **JSON** — structured, self-describing, with `limitations` and
  `experimentalValidationRequired: true` baked in.
- **Scientific PDF** — browser print of the campaign report.

Exports contain **only** verified computations, grounded interpretations, and provenance.
Never biological activity, never predicted experimental success.

## Reuse guarantee
Ranking, decision logic, decision trace, and the comparison/matrix UI are the **same**
implementation used by the `#/compare` screen. Improving the ranking engine improves both
Compare and Campaigns through one shared module — by construction.

See also: SCIENTIFIC_ENGINE.md, PROVENANCE.md, KNOWN_LIMITATIONS.md.
