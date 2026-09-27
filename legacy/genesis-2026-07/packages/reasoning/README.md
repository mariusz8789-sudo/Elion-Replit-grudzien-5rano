# @genesis-os/reasoning — L3, the scientific reasoning core

Signed mechanism graph, two-axis evidence grading, cancer-safety composition,
value-of-information ranking, experiment feasibility. This is the part of Genesis
that does the science.

## The contract

**This package is pure.** Every module here is a function from data to data.

| Forbidden | Why |
|---|---|
| Database handles, `fetch`, `fs` | A reasoning step that reads the world cannot be replayed, and replay is what makes an artifact auditable |
| `Date.now()`, `Math.random()` | Same inputs must give the same output, or "Genesis concluded X in March" is not checkable |
| React, DOM, `window`, `localStorage` | The server runs this. A surface may depend on the reasoning; the reasoning may never depend on a surface |
| Imports from `packages/frontend` or `packages/backend` | Direction is enforced by a static test |

Persistence, clocks and provenance stamping live one layer down, in the backend's
L2. This package is handed the data and returns a verdict; someone else decides
what to remember about it.

## Why it is TypeScript that the backend imports directly

Node 22.18+ strips types on import, so `backend/src/*.mjs` can
`import … from '@genesis-os/reasoning/inference'` with no build step, no bundle
and no generated artifact that can drift from its source. The repo's older
`compute:bundle` script solves the same problem by checking an esbuild output
into the backend; that pattern needs a `compute:bundle:check` guard precisely
because the copy can go stale. Importing the source removes the failure mode
rather than guarding it.

The cost is a hard floor of **Node ≥ 22.18**, declared in `engines`.

## Tests

`npm test --workspace=packages/reasoning` — 88 tests, run under vitest.

They do not check that the code runs; they check that the reasoning is right. A
sign error in the cancer-safety composition would invert a risk verdict while
every type still checked and every screen still rendered, so the sign algebra is
pinned against biology that is not in dispute: telomerase activation must surface
an oncogenic route, senolytics must surface weakened tumour suppression, worm
lifespan evidence must score strong on strength and weak on human relevance.

They were left in vitest rather than converted to `node:test` during the L3
migration. Converting 88 tests by hand is exactly the operation that silently
weakens an assertion, and these assertions are the reason anyone should trust
the output.
