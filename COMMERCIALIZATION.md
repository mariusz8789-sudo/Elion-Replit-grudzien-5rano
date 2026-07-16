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

## What blocks the first paying laboratory (be blunt)
The triage itself is something a chemist can already do in free RDKit/DataWarrior. To be
*worth paying for* to a lab analysing ~500 molecules/week, Genesis needs:
1. **Server-side persistence + team accounts** (today campaigns are per-browser localStorage).
2. **A capability free tools lack** — the strongest candidate is turning the honest,
   grounded framework into a place where *measured* data (ADMET assays, in-house results)
   is stored alongside computed descriptors, not more predictions.
3. **File import/export in lab formats** (SDF, CSV bulk, ELN integration).

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
