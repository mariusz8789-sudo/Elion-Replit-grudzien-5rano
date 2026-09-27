# GenesisHashPort — adapter proposal (not bound, not in production src)

**This does NOT compile standalone.** It intentionally imports
`fnv1a`/`canonicalJson` from the real repo's `packages/frontend/src/core/events/hash.ts`
(a relative import, `../events/hash`, written as if this file lived at
`packages/frontend/src/core/transferIntegration/genesisHashPort.ts` — its original,
since-removed location). It is kept here as a **pattern**, not a package: exact code to
drop back into that path, or adapt, once a transfer package is actually being bound.

## Why this exists

Every Genesis transfer package audited this session (`GENESIS-INTEGRATION-MEGA-PACK-V2`,
`genesis-engine-suite-e2e-v1`) declares its own `HashPort`-shaped seam
(`{ hash(text): string }` and/or `{ fingerprint(value): string }`) with a reference/
test-only FNV-1a reimplementation, explicitly marked "not for production" in each
package's own docs. The real repo already has the canonical algorithm
(`fnv1a`/`canonicalJson` in `core/events/hash.ts`, the same one `core/scienceMemory.ts`
uses). This file is what binding a transfer package's hash seam to that canonical
implementation looks like — nothing more.

## Why it isn't in `packages/frontend/src/core/` right now

It was there earlier (`core/transferIntegration/genesisHashPort.ts`), suppressed from the
module-reachability check via an `ALLOWED_ORPHANS` entry because nothing calls it. On
review, that's exactly the pattern to avoid: `ALLOWED_ORPHANS` should document a
*deliberate, load-bearing* non-wiring decision (see the D-085 `agentBridge.ts` entry in
`moduleReachability.test.ts` for what that looks like — a real import-cycle constraint), not
paper over "nothing needs this yet." Nothing in the real repo currently defines or consumes
a `HashPort`-shaped interface, so there is no real caller to wire this into today, and
picking a transfer package to bind is a product decision this session hasn't made. So: out
of production source, kept here as ready-to-apply material instead.

## To use it

1. Decide which transfer package (if any) is being bound.
2. Copy `src/genesisHashPort.ts` to `packages/frontend/src/core/transferIntegration/
   genesisHashPort.ts` (or wherever the bound package's ports live).
3. Copy `src/genesisHashPort.test.ts` alongside it, fixing its import path the same way.
4. Wire the bound package's `HashPort` construction to `new GenesisHashPort()` instead of
   its own reference implementation.
5. Run `npx vitest run <path>/genesisHashPort.test.ts` and the repo's
   `moduleReachability.test.ts` — at that point the module has a real caller and needs
   no `ALLOWED_ORPHANS` entry at all.
