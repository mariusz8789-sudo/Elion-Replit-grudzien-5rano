# ZEFIR Truth Engine — Commercial Reality Audit (Phase 8)

> Inspected as a deep-tech CTO, R&D director, skeptical physicist, water-technology
> engineer, grant evaluator, technical investor, and hostile competitor would.
> Every answer is grounded in code + tests that exist in this repository. No sales claims.

## The 10 factual questions

**1. Can a non-programmer now use the Truth Engine through the product UI?**
Yes. `TruthEngineScreen.tsx` is a structured form — problem, mechanism, claimed result,
assumptions, constraints, materials, required capabilities, and numeric fields (energy,
efficiency, flow Q/V/t, power P/E/t, operating temperature/pressure). No code is required.
Raw equations are an optional *Advanced* JSON field with a parse guard (invalid JSON is
ignored, never crashes). A non-programmer gets a GO/WARN/BLOCK/INSUFFICIENT_DATA verdict,
the reasons, the cheapest next test, and a certificate.

**2. Does the UI execute the real backend Truth Engine?**
Yes. `runTruthAnalysis` → `POST /api/projects/:id/truth-analyses` → `handleApi` →
`truthEngine.analyze`. There are **no hardcoded GO/WARN/BLOCK objects** anywhere in the
frontend or the route handler. The client test asserts the HTTP contract; the API test
asserts the real decision; trials A–I run through the exact same path.

**3. Which deterministic checks are genuinely useful today?**
All are deterministic and unit-tested: dimensional consistency, unit compatibility,
energy input/output accounting (over-unity), efficiency bound (>100%), mass balance,
pressure/temperature operating bounds, flow = V/t, power = E/t, geometric sanity,
explicit material operating limits, generic conservation/accounting, and the tenant
Necropolis dead-end check. These catch *provable contradictions* with exact numbers —
the highest-value, lowest-controversy checks for a pre-flight gate.

**4. How broad is actual physical constraint coverage?**
Narrow but honest: **12 structured constraints** across 6 domains (general,
thermodynamics, mechanical, thermal, fluid, materials). This is conservation/consistency
algebra, not the whole of physics. It is deliberately bounded and every boundary is
documented (`KNOWN_UNSUPPORTED_DOMAINS`). This is the product's main growth axis.

**5. How often will a realistic unknown proposal still return INSUFFICIENT_DATA?**
Often, when the submitter provides little structured data. That is the correct, honest
behavior — the engine refuses to manufacture a verdict from nothing. It is a coverage/UX
limit, not a defect: more structured input and a broader constraint pack shrink it.

**6. Does Necropolis now create a measurable accumulating asset?**
Yes. `necropolis.mjs` gives each tenant an owned, growing failure memory with a
deterministic export hash, duplicate detection, and import validation. Trial E proves a
recorded failure **materially flips** a later decision (GO → BLOCK) for the same tenant.
This is the one genuinely compounding asset.

**7. Is tenant isolation demonstrated?**
Yes, adversarially. `necropolis.assess` filters strictly by `project_id`; the API returns
404 for a non-member. Trial H and dedicated hostile tests show tenant B is **not**
influenced by tenant A's failure memory and cannot read tenant A's analyses.

**8. Was the Meta-Orchestrator defect reproduced and actually fixed?**
Yes. The defect (a valid all-rejected funnel mislabeled `MISSION_FAILURE`) is reproduced
by a regression test that fails before the fix. The root cause — the classifier was blind
to funnel state — is fixed by reading `funnel_candidates`/`funnel_stages` and mapping a
decisive completion to a new honest `FUNNEL_COMPLETE` class. Genuine failure and
partial/ambiguous states are preserved (three regression tests guard all paths).

**9. Can ZEFIR WATER be built as a real domain pack on this architecture?**
Architecturally yes. Trial I shows the registry already validating water-plant hydraulics
(Q=V/t), power (P=E/t), operating bounds, and material limits — and honestly reporting
oxygen-transfer efficiency / reaeration as **UNSUPPORTED capability gaps**. A ZEFIR WATER
pack = add domain constraints to the same registry. This is **not** a claim that ZEFIR is
a complete water-science platform; the deep gas–liquid mass-transfer science is not encoded.

**10. What can a customer genuinely pay for TODAY?**
A deterministic, explainable **pre-flight R&D kill-switch + reproducible decision
certificate**, deployable as a CI gate (the CLI exits BLOCK=1 / INSUFFICIENT_DATA=3), with
a **per-tenant accumulating Necropolis** that gets more valuable the more they use it. Sold
as computational-reproducibility / pre-flight audit — defensible to an investment committee
or reviewer — not as "AI that knows what's possible."

## Weak answers that were materially improved in this cycle
- **Coverage (Q4/Q5)** was the weakest point. It moved from ad-hoc keyword checks to a
  structured, versioned, tested 12-constraint registry with explicit UNSUPPORTED domains.
  Remaining breadth is an honest, documented limit — the top next action, not a hidden gap.
- **Necropolis as an asset (Q6)** moved from a mission-scoped internal table to a
  tenant-owned, exportable, hashed, de-duplicated product subsystem with isolation tests.
