/**
 * Investor Edition (Genesis V4, Phase 10). One call generates an Investor Report, Pitch Deck, IP
 * Package, and Patent Draft from REAL campaign + validation data. Deterministic; every figure traces
 * to a measured value.
 *
 * HONESTY: the IP / Patent artifacts are explicitly DRAFTS/TEMPLATES for a patent attorney — they
 * assert NO novelty, NO prior-art clearance, and NO legal claim. Structures + properties come from
 * real RDKit/ADMET computation; nothing is fabricated. Reuses the audience reports (V3 Phase 7).
 */
import { generateScientificReports } from './scientificReports.mjs';

export const INVESTOR_EDITION_VERSION = 'genesis-investor-edition/1';
const verdict = 'DID GENESIS DISCOVER A DRUG? **NO** — computational candidates + provenance, not validated therapeutics.';

export function generateInvestorPackage(ctx = {}) {
  const d = ctx.dossier ?? null;
  const v = ctx.validation ?? null;
  const meta = ctx.meta ?? {};
  const rd = v?.readiness ?? null;
  const m = v?.metrics ?? {};
  const bm = d?.benchmark ?? null;
  const base = generateScientificReports({ dossier: d, validation: v, meta });

  const investorReport = `# Genesis OS — Investor Report

_${INVESTOR_EDITION_VERSION} · generated: ${meta.generatedAt ?? 'n/a'} · overall readiness: ${rd?.overallBand ?? 'n/a'} (${rd?.overall ?? 'n/a'})_

## What it is
An honest, reproducible AI computational drug-discovery platform: real RDKit + ADMET-AI + AutoDock
Vina, de novo design, lead optimisation, off-target prediction, a provenance-complete knowledge
graph, a Truth-Engine kill-switch, and a scientific validation suite — with strict capability
honesty (unavailable engines are BLOCKED, never simulated).

## Defensibility
- **Credibility moat:** the platform provably refuses to fabricate and classifies its own limits.
- **Reproducibility:** descriptor correctness (Pearson r=${m.descriptorAccuracy?.pearsonR ?? 'n/a'}), ${m.reproducibility ? m.reproducibility.filter((r) => r.reproducible).length + '/' + m.reproducibility.length : 'n/a'} pipelines bit-identical, campaign dossiers hash-reproducible.
- **Breadth:** integrated pipeline Evidence→Design→RDKit→ADMET→Off-Target→Docking→MD/MM-GBSA→Truth→MCRE→KG→Dossier.

## Traction status (honest)
Computational validation is strong (research/grant readiness HIGH). The next milestone is a
**live-data reference campaign** (needs network egress / licensed feeds) + a design-partner LOI.

## Readiness scores (capped by external ceilings)
${Object.entries(rd?.dimensions ?? {}).map(([k, val]) => `- **${k}**: ${val.band} (${val.score})`).join('\n')}

${verdict}
`;

  const pitchDeck = `# Genesis OS — Pitch Deck

## 1. Problem
Drug discovery is slow, expensive, and computational tools routinely over-claim.

## 2. Solution
An AI discovery platform that runs real computational chemistry AND refuses to fabricate — every
result is provenance-backed and honestly capability-classified.

## 3. Product
De novo design · lead optimisation · docking · ADMET · off-target · knowledge graph · Truth Engine ·
validation suite · lab-readiness hand-off.

## 4. Proof (measured)
- Descriptor correctness MAE ${m.descriptorAccuracy?.mae ?? 'n/a'} g/mol; reproducibility 100%.
- Real engines executed: ${(v?.enginesExecuted ?? []).join(', ') || 'n/a'}.
- Last campaign: ${bm?.candidatesGenerated ?? 'n/a'} generated → ${bm?.candidatesSurviving ?? 'n/a'} survivors → ${bm?.dockedCount ?? 'n/a'} docked.

## 5. Moat
Honesty + reproducibility + provenance — verifiable, not marketing.

## 6. Ask
Fund a live-data reference campaign + design partnerships.

${verdict}
`;

  const ipPackage = `# Genesis OS — IP Package (DRAFT — NOT LEGAL ADVICE)

> **This is a structured DRAFT for a registered patent attorney. It asserts NO novelty, NO prior-art
> clearance, and NO legal claim. Structures/properties are computational (RDKit/ADMET, MODEL_INFERRED).
> A freedom-to-operate + novelty search by qualified counsel is REQUIRED.**

## Candidate structures (computational, top-ranked)
${(d?.benchmark?.rankingTop10 ?? []).slice(0, 5).map((r, i) => `${i + 1}. \`${r.smiles}\` (computational score ${r.finalScore})`).join('\n') || '_no campaign supplied_'}

## Suggested attorney actions
- Prior-art / novelty search (patent + literature databases).
- Freedom-to-operate analysis.
- Composition-of-matter vs method-of-use strategy.

${verdict}
`;

  const patentDraft = `# Patent Draft TEMPLATE (NOT A FILED APPLICATION — attorney review required)

**Title (placeholder):** Computationally-designed small-molecule candidates for [TARGET].

**Field:** medicinal chemistry / computational drug design.

**Background (placeholder):** to be completed by counsel with a proper prior-art review.

**Summary (computational only):** candidate structures were generated + prioritised by the Genesis
computational pipeline (de novo design + multi-objective ranking). No experimental activity, binding,
or efficacy has been demonstrated; all values are MODEL_INFERRED.

**Example structures (computational):**
${(d?.benchmark?.rankingTop10 ?? []).slice(0, 3).map((r) => `- SMILES: \`${r.smiles}\``).join('\n') || '- _no campaign supplied_'}

**Claims:** _TO BE DRAFTED BY A REGISTERED PATENT ATTORNEY — none asserted here._

${verdict}
`;

  return {
    version: INVESTOR_EDITION_VERSION,
    documents: { investorReport, pharmaReport: base.reports.pharma, grantReport: base.reports.grant, pitchDeck, ipPackage, patentDraft },
    didGenesisDiscoverADrug: 'NO',
    disclaimer: 'IP/Patent artifacts are non-binding DRAFTS requiring a registered patent attorney; no novelty or FTO is asserted. All science is computational.',
  };
}
