# Grounding Layer

The Grounding Layer is Genesis's guardrail against AI hallucination. When the optional AI
interpretation is enabled, **every molecular claim the model makes is checked against a real
RDKit computation before it reaches the user.** Numbers the model invents — or properties
RDKit cannot compute at all (toxicity, IC50, LD50, hERG…) — are redacted, not shown.

This is a real, tested guardrail, not a cosmetic label. It was audited (2026-07) and
confirmed substantive.

---

## Where it lives
- `packages/backend/src/groundingLayer.mjs` — the guardrail itself.
- `packages/backend/src/aiGrounding.mjs` — thin, testable integration glue.
- `GROUNDING_VERSION = 'genesis-grounding/1'` — stamped on grounded output and reports.

## How it works
1. **Fact registry.** For each analysed molecule, RDKit-computed descriptors are registered
   keyed by canonical SMILES.
2. **Structured claim extraction.** The model is asked to emit structured `genesis-claims`;
   these are matched against the registry.
3. **Defense-in-depth prose scan.** Independently of the structured channel, the layer scans
   the free-text answer for property-keyword → number and unit patterns.
4. **Fail-closed redaction.** Any numeric molecular claim **not** backed by a real
   computation is redacted. A `NON_GROUNDABLE` list (toxicity, IC50, LD50, hERG, …) forces
   redaction of any number RDKit cannot produce — this directly prevents that entire class
   of hallucination.

## Flag-gated, byte-identical when off
Controlled by `GROUNDING_ENABLED` (default `false`). When disabled, the AI path is a
**byte-identical pass-through** — the contract (`computed_by`, `BLOCKED_BY_RUNTIME`, error
codes) is unchanged. When enabled, each answer is grounded before delivery, failing open on
internal errors so the AI feature never crashes the request.

## The product does not depend on AI
The commercial workflow (Assistant, Compare, Campaigns) derives its interpretations from
**deterministic rules over verified RDKit facts** (see SCIENTIFIC_ENGINE.md §2), not from a
language model. If no AI model is configured, Genesis says so honestly and still produces a
complete, grounded report. The Grounding Layer is what makes it *safe* to turn AI on later.

## Known nuance (disclosed)
The layer matches Crippen LogP to ±0.2 while the product discloses LogP's model error as
~±0.5. This is an internal-consistency nit (it verifies against RDKit's exact value, not
against ground truth), not a correctness bug. See KNOWN_LIMITATIONS.md §1.

See also: SCIENTIFIC_ENGINE.md, PROVENANCE.md.
