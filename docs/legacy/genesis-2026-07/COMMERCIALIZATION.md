# Commercialization

## The honest thesis
The commercially defensible product inside Genesis is narrow and real: **"trustworthy
molecule triage an AI cannot fabricate."** Real RDKit descriptors + a transparent,
self-explaining ranking + provenance + honest refusal to predict biology, wrapped in a
workflow (Assistant → Compare → Campaigns) with PDF/CSV/JSON export and a public API.

That honesty *is* the differentiator. Most AI chemistry tools blur the line between a
computed fact and a model guess; Genesis draws it explicitly on every value.

## What is already built for revenue
- **Stripe checkout → webhook → automatic API-key provisioning** (idempotent).
- **Self-service billing dashboard** (plan, usage, quota, regenerate key, upgrade). Degrades
  to "Billing unavailable" when Stripe is unconfigured — never crashes.
- **Tiered public API** — `API_TIERS = { free: 100, starter: 10,000, pro: 100,000 }`
  requests/month, quota-enforced per key.

## Two plausible wedges
1. **Developer API** (`/api/v1`) — sell reliable, honest RDKit-as-a-service with usage
   tiers. Fastest path to a first paying integration; smallest surface to harden.
2. **Med-chem triage app** (Assistant/Compare/Campaigns) — sell the workflow to research
   groups. Higher value, but needs server-side persistence + team accounts first
   (KNOWN_LIMITATIONS.md §3).

## What blocks the first paying laboratory (be blunt — updated 2026-07 code-cited audit)
The triage itself is something a chemist can already do in free RDKit/DataWarrior. To be
*worth paying for* to a lab analysing ~500 molecules/week, Genesis needs, in priority order:
1. **File import** (CSV/SDF) for Compare and Campaigns — confirmed still textarea-only
   (`ComparePlatformScreen.tsx`, `CampaignScreen.tsx`). A lab will not hand-type 500 SMILES;
   this is the literal gate that keeps a pilot from ever completing onboarding.
2. **Server-side persistence for ALL saved data, not just campaigns.** Campaigns got a real
   server-persistence layer in Genesis 2.1 (`core/campaignSync.ts`) — but the Assistant's
   saved-analysis history (`core/assistantHistory.ts`) is still confirmed localStorage-only.
   A user reasonably assumes both survive a device change; only one does, silently.
3. **A capability free tools lack** — the strongest candidate is surfacing the
   already-built, already-tested **ADMET-AI engine** (`compute/admetAdapter.mjs`, 52
   endpoints, published TDC metrics) in the product UI (clearly tagged ⚠ MODEL_INFERRED,
   never as a verified fact). It is wired into the backend but never shown in
   Assistant/Compare/Campaigns today — this is wiring, not new science.
4. **Team accounts / sharing** — every campaign has exactly one `ownerId`
   (`core/campaigns.ts`); there is no membership model, no read-only share link, nothing a
   PI or co-founder can use to show a colleague a result without handing over the account.
   A lightweight read-only share link is a much cheaper first step than full RBAC.

See FUTURE_WORK.md "Current top 5" for the effort/impact-ranked version of this list.

## Pricing posture (directional, not committed)
- **Free:** 100 API calls / basic single-molecule Assistant — acquisition + trust-building.
- **Starter:** individual researcher — campaigns, exports, 10k API calls.
- **Pro / Team:** shared campaigns, higher quota, priority compute — the real ARPU once
  server persistence lands.

## Go-to-market sequence (see ROADMAP.md)
Pilot with one friendly med-chem group → collect what they actually need → harden the two
security blockers that gate any external exposure → Stripe Live + public domain → first paid
API integration → first paid lab seat. **No feature expansion until a real user names the
blocker.**

## Honest risks
- The computed-descriptor layer is commoditized (RDKit is free). The moat is *workflow +
  honesty + provenance + support*, not the math.
- The surrounding education/cognitive platform is a distraction from this thesis and dilutes
  positioning; a commercial spin-out would ship only the product layer.

## Competitive positioning (2026-07, no marketing language)

Compared on architecture/capability, not on scientific rigor Genesis doesn't claim to match.

| | They do better | Genesis already does better | Genesis still loses | Genesis's realistic #1 |
|---|---|---|---|---|
| **RDKit** | Full mature toolkit (200+ descriptors, reactions), community-vetted, embeddable | UX, workflow, decision support, provenance around the same numbers | Genesis is a layer *over* RDKit, not a replacement | An honest, auditable decision layer over a free engine |
| **ChemAxon** | Structure editor (Marvin), validated proprietary pKa/logD, enterprise data integration | Price, transparency (explicit ✓/⚠/ⓘ tagging vs. a black-box predictor) | No structure editor at all — SMILES text only; less mature physchem prediction | Honesty + price for teams too small for enterprise licensing |
| **DataWarrior** | Richer SAR/clustering toolkit, **free**, 15+ years of chemist-driven refinement | Web-based, API, server persistence, billing | DataWarrior does today, for free, much of what Compare charges for | Team/API/audit trail — DataWarrior has none of that |
| **Schrödinger** | FEP+, physics-based docking, homology modeling — the gold standard | Accessibility, price, speed for early triage | Zero physics-based binding prediction capability | The cheap, fast layer *before* justifying a Schrödinger spend |
| **OpenAI / Claude (general)** | Flexibility, breadth of reasoning, ubiquity | Real computation (not next-token guessing), reproducible analysis hash, persistent multi-molecule workflow, architecturally-enforced honesty | N/A — different category of tool | An auditable, reproducible, AI-native triage workflow a raw LLM session can't replicate without rebuilding this product |

**Honest bottom line:** Genesis will not win on raw cheminformatics power (RDKit/ChemAxon),
physics-based prediction (Schrödinger), or general reasoning (LLMs). The one narrow, real,
defensible position is: **an audited, reproducible, honestly-labeled molecule-triage
workflow** — a niche none of the above optimizes for, because they are either raw libraries,
enterprise suites priced for big pharma, single-user desktop tools, or domain-ungrounded
general assistants.
