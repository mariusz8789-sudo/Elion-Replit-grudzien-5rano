# Genesis Premium Asset Acceptance Gate

**Location:** `packages/frontend/src/core/three/assetGovernance.ts` (exports `evaluatePremiumAssetAcceptance`, `PremiumAssetCandidate`, `PremiumAssetAcceptanceResult`, `PremiumAssetAcceptanceDecision`, plus the supporting field types).
**Tests:** `packages/frontend/src/__tests__/assetGovernance.test.ts`, describe block `Premium asset acceptance gate`.

## What this is

A fail-closed, pre-purchase/pre-integration screen for a **candidate** premium asset (typically a
paid anatomical model, or a premium environment/prop asset under consideration) — evaluated
*before* any purchase or production wiring decision. It is a second classification layer over the
same provenance vocabulary `WORLD_ENGINE_ASSET_MANIFEST` already uses (source, license,
SHA-256), not a second manifest or registry. It never reads from or writes to
`WORLD_ENGINE_ASSET_MANIFEST`; an `APPROVED` candidate still has to be actually acquired and
added to that manifest exactly like any other asset once it is.

This gate makes **no purchase decision** and performs **no purchase**. It answers one question:
*given everything currently known about this candidate, is it safe to proceed toward acquiring
and integrating it, and if not, what specifically is missing?*

## Decision schema

`evaluatePremiumAssetAcceptance(candidate: PremiumAssetCandidate): PremiumAssetAcceptanceResult`

```ts
type PremiumAssetAcceptanceDecision =
  | 'APPROVED'
  | 'REJECTED'
  | 'LEGAL_REVIEW_REQUIRED'
  | 'OPTIMIZATION_REQUIRED'
  | 'SCIENTIFIC_PROVENANCE_REQUIRED';

interface PremiumAssetAcceptanceResult {
  candidateId: string;
  decision: PremiumAssetAcceptanceDecision;
  reasons: readonly string[]; // never empty, including for APPROVED
}
```

**Fail-closed rule:** every field that is `null` or `'UNKNOWN'` is treated as *not yet known to be
fine* — never as an implicit pass. Only a candidate where every checked field is an explicit,
unambiguous pass can reach `APPROVED`.

## Priority order (most severe first)

A candidate is evaluated against five tiers, in this order; the first tier with any matching
reason wins, and every matching reason at that tier is returned together.

1. **`REJECTED`** — a *known* blocking fact, not ambiguity. No amount of legal review or
   optimization work fixes these; a different asset is needed.
   - Provenance is broken: no source URL, source is not pinned/content-addressed/versioned
     (`immutableSource: false`), no recorded SHA-256 checksums, or a recorded checksum is not a
     real 64-character hex digest.
   - The license **explicitly** forbids commercial redistribution
     (`permitsCommercialRedistribution === false`).
   - The license **explicitly** restricts AI-related use (`aiRestriction === 'RESTRICTED'`).
   - For `assetClass: 'ANATOMICAL'` candidates only: anatomy is not modeled as separate meshes
     with stable per-organ IDs, or does not support organ picking, isolation, or cross-section.
     This is a structural property of the asset, not something a license review or a texture
     re-export can fix.

2. **`LEGAL_REVIEW_REQUIRED`** — an *unclear* legal fact. A human must resolve the ambiguity;
   this is never auto-approved and never auto-rejected.
   - No license name or license URL recorded.
   - Commercial redistribution permission is `'UNKNOWN'` (distinct from an explicit `false`,
     which is `REJECTED` above).
   - AI-related restriction is `'UNKNOWN'` (e.g. an unclear "no AI training" clause).
   - The license requires attribution (`requiresAttribution: true`) — attribution licenses are
     not rejected outright, but a premium/commercial asset needs a human to confirm the
     attribution flow is actually implemented before the gate calls it `APPROVED`.

3. **`OPTIMIZATION_REQUIRED`** — legally and structurally fine, but not yet fit for real-time web
   delivery.
   - Polygon count missing or exceeds `maxPolygonBudget`.
   - Texture resolution missing or exceeds `maxTextureResolutionPx`.
   - No usable LOD chain (`hasLod: false` or `lodLevels` missing/`< 1`).
   - Not KTX2-ready.
   - Neither Meshopt nor Draco geometry compression is ready.
   - Not declared real-time-web-suitable (`realTimeWebSuitable: false` — a caller-declared fact,
     never re-derived from the numeric budgets above).

4. **`SCIENTIFIC_PROVENANCE_REQUIRED`** — `assetClass: 'ANATOMICAL'` candidates only. Anatomical
   accuracy needs its own evidence trail, separate from ordinary source/license provenance: no
   recorded dataset/reference (e.g. a named anatomical atlas) or no citation URL.

5. **`APPROVED`** — every checked field for this candidate's asset class passed explicitly.

## Candidate shape

```ts
interface PremiumAssetCandidate {
  id: string;
  assetClass: 'ANATOMICAL' | 'ENVIRONMENT_OR_PROP';
  license: {
    name: string | null;
    url: string | null;
    requiresAttribution: boolean;
    permitsCommercialRedistribution: true | false | 'UNKNOWN';
    aiRestriction: 'NONE' | 'RESTRICTED' | 'UNKNOWN';
  };
  provenance: {
    sourceName: string | null;
    sourceUrl: string | null;
    sha256: Readonly<Record<string, string>>; // per-file, real 64-hex digests
    immutableSource: boolean;
  };
  anatomy: { // only checked when assetClass === 'ANATOMICAL'
    separateMeshes: boolean;
    stableMeshIds: readonly string[];
    supportsOrganPicking: boolean;
    supportsIsolation: boolean;
    supportsCrossSection: boolean;
  };
  performance: {
    polygonCount: number | null;
    maxPolygonBudget: number;
    textureResolutionPx: number | null;
    maxTextureResolutionPx: number;
    hasLod: boolean;
    lodLevels: number | null;
    ktx2Ready: boolean;
    meshoptReady: boolean;
    dracoReady: boolean;
    realTimeWebSuitable: boolean;
  };
  scientificProvenance: { // only checked when assetClass === 'ANATOMICAL'
    datasetOrReference: string | null;
    reviewedBy: string | null;
    citationUrl: string | null;
  };
}
```

`assetClass: 'ENVIRONMENT_OR_PROP'` candidates skip the anatomy and scientific-provenance tiers
entirely — a CC0 environment prop has no organs to pick and no anatomical accuracy claim to
source.

## What this gate does not do

- It does not fetch, download, verify against a live upstream, or purchase anything.
- It does not compute polygon counts, texture resolutions, or checksums itself — every input is a
  caller-declared fact the gate checks against budgets and known-good values, matching this
  repo's own convention (`WorldAssetRecord`'s `sha256`/`license`/`sourceUrl`) of never fabricating
  or re-deriving provenance.
- It does not decide product/legal policy (e.g. what `maxPolygonBudget` should be for a given
  asset class) — those are caller-supplied numbers, not hardcoded here.
- It does not add, modify, or read `WORLD_ENGINE_ASSET_MANIFEST`.

## Example usage

```ts
import { evaluatePremiumAssetAcceptance } from '../core/three/assetGovernance';

const result = evaluatePremiumAssetAcceptance({
  id: 'candidate-anatomical-heart-lod',
  assetClass: 'ANATOMICAL',
  license: {
    name: 'CC-BY-4.0',
    url: 'https://creativecommons.org/licenses/by/4.0/',
    requiresAttribution: true,
    permitsCommercialRedistribution: true,
    aiRestriction: 'NONE',
  },
  provenance: {
    sourceName: 'Example Anatomy Vendor — Heart LOD Pack',
    sourceUrl: 'https://example-anatomy-vendor.example/heart-lod-pack/v3',
    sha256: { 'heart_lod0.glb': '<64-hex>' },
    immutableSource: true,
  },
  anatomy: {
    separateMeshes: true,
    stableMeshIds: ['heart.leftVentricle', 'heart.rightVentricle', 'heart.leftAtrium', 'heart.rightAtrium'],
    supportsOrganPicking: true,
    supportsIsolation: true,
    supportsCrossSection: true,
  },
  performance: {
    polygonCount: 180_000,
    maxPolygonBudget: 500_000,
    textureResolutionPx: 2048,
    maxTextureResolutionPx: 4096,
    hasLod: true,
    lodLevels: 3,
    ktx2Ready: true,
    meshoptReady: true,
    dracoReady: false,
    realTimeWebSuitable: true,
  },
  scientificProvenance: {
    datasetOrReference: 'Visible Human Project (NLM)',
    reviewedBy: 'in-house anatomist review',
    citationUrl: 'https://www.nlm.nih.gov/research/visible/visible_human.html',
  },
});

// result.decision === 'LEGAL_REVIEW_REQUIRED'
// result.reasons includes: "License requires attribution — needs human confirmation the
// attribution flow is implemented before approval."
```
