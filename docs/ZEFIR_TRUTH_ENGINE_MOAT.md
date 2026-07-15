# ZEFIR Deep-Tech Truth Engine + R&D Kill-Switch — Commercial Moat Audit (Phase H)

> Honest internal analysis. Nothing here is a sales claim. Where the moat is thin, it says so.

## 1. What the product actually is

A deterministic **pre-flight decision layer** for deep-tech R&D. Given a research proposal
(equations, assumptions, physical constraints, required capabilities, parameter region),
it returns an explainable **GO / WARN / BLOCK / INSUFFICIENT_DATA** decision plus the
**cheapest next falsification test**, before any money/compute/lab-time/expert-hours are
spent. Every decision ships as a hashed, reproducible certificate.

It composes only already-verified deterministic engines (`formalKernel`,
`speculativePhysics`, `preflightGate`, Necropolis failure-memory). It invents no new
science and asserts no correctness — a GO is *necessary, not sufficient*.

## 2. Where a real moat exists

| Moat | Strength | Why |
|------|----------|-----|
| **Accumulated failure memory (Necropolis)** | **Strong, compounding** | Per-client dead-end regions grow over time and are queried on every future proposal. A competitor starting fresh has an empty Necropolis. This is the only genuinely compounding asset. |
| **Reproducible decision certificates** | Medium | `decisionHash` is stable for identical canonical input + engine versions (timestamp excluded). This is auditable/defensible for regulated or investment-committee use — a differentiator vs. an LLM that answers differently each call. |
| **Determinism + explainability** | Medium | Every decision decomposes into which checks ran, which were skipped and *why* (missing info is first-class). This is legally and scientifically defensible in a way a black-box model is not. |
| **Honesty contract as a feature** | Medium | BLOCK is explicitly bounded ("under supplied assumptions/encoded checks", never "impossible in all universes"). Buyers in deep-tech distrust hype; a system that refuses to over-claim is a trust moat — but it is a *cultural/brand* moat, easily copied in principle. |

## 3. Where the moat is thin (stated plainly)

- **The formal checks are textbook.** Dimensional analysis, Buckingham-Pi, unit
  consistency, over-unity/perpetual-motion rejection — these are standard physics. A
  competent team can reimplement the *engines* in weeks. The engines are table stakes,
  not the moat.
- **Coverage is narrow.** The encoded physical-constraint and speculative-physics checks
  are a small, hand-curated set. Most real proposals will skip most stages (missing
  inputs), landing on WARN/INSUFFICIENT_DATA. The product is honest about this, but it
  limits standalone value until coverage grows.
- **No proprietary data corpus (yet).** The only compounding data is the per-client
  Necropolis. There is no large licensed dataset or unique instrument feed.
- **The decision policy is simple.** The kill-switch aggregation (critical→BLOCK,
  nothing-checkable→INSUFFICIENT_DATA, warnings→WARN, else GO) is transparent and
  therefore trivially inspectable/copyable.

## 4. Honest moat verdict

The defensible core is **not** the physics engines — it is the **compounding, per-client
failure memory + reproducible-certificate audit trail**. Sold as a *computational-
reproducibility / pre-flight-audit service* (decisions you can defend to an investment
committee or regulator), the moat is real but early. Sold as "AI that knows what's
possible", it is thin and over-claims.

**Fastest defensible revenue:** pre-flight audit + reproducibility certification as a
service on top of clients' own campaigns — the Necropolis compounds per account and the
certificate is the deliverable. This matches the earlier business/valuation finding.

## 5. Twelve-month moat-deepening actions (priority order)

1. Grow the physical-constraint / speculative-physics check library (coverage is the gap).
2. Ship the Necropolis as a per-tenant, exportable, signed asset — make the compounding value visible and portable-with-the-customer (lock-in).
3. Certificate anchoring (e.g. periodic hash notarization) for regulated audit trails.
4. Domain packs (electrochemistry, catalysis, protein design) with curated constraints.
5. Benchmark publication: run the 12-case hostile suite publicly and keep it green — the honesty contract becomes a verifiable claim, not marketing.
