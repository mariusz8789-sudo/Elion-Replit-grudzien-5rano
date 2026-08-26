# CI reliability audit

## Scope

This audit concerns repository verification only. It does not publish Genesis, deploy an environment, run a live hazard, acquire data, or alter a scientific model.

## Observed remote failure

The GitHub Actions run for commit `f92354d` failed at the existing root `npm run lint` step. The remote failed-log evidence is retained by GitHub Actions run [`32947485678`](https://github.com/mariusz8789-sudo/Elion-Replit-grudzien-5rano/actions/runs/32947485678).

| Previous failure                                                                        | Evidence                                                                                                                                          | Root cause                                                                                                                                  | Remediation                                                                                                                                                                             | Verification state                                                             |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Root ESLint failed with `no-undef` in committed City3D benchmark/capture/proof scripts. | `process`, `setTimeout`, `fetch`, `WebSocket`, `Buffer` and `console` were reported undefined; the proof contained two unnecessary regex escapes. | The root linter traversed tracked `artifacts/**/*.mjs`, but the flat config defined Node/CLI globals only for backend and `scripts/` paths. | Added a tightly scoped `artifacts/**/*.mjs` Node/Chromium-proof global override; retained application lint rules; replaced the escaped version regex with a character-class equivalent. | Local full gate passes. Remote confirmation is pending the remediation commit. |

## Local reproduction and result

The remediation passed the same local sequence used by the quality gate:

```bash
npm run lint
npm run test --workspace=packages/frontend -- --maxWorkers=1
npm run test --workspace=packages/backend
npm exec --workspace=packages/frontend -- tsc --noEmit
npm run build
git diff --check
```

The observed local result was **129 frontend test files / 1,319 tests passed**, **269 backend tests passed**, explicit frontend typecheck passed, production build passed, and whitespace validation passed. The Vite large-chunk advisory remains a warning, not a test/build failure.

## Boundary

The `artifacts/**/*.mjs` override is limited to Node/CDP harness globals. It does not relax linting for React, TypeScript, scientific models, City3D runtime code, backend application code, or source adapters. It contains no deploy, publish, secret, external-data, GIS or model-execution capability.

## Remote verification result

Commit [`3cd3a745c6fdcca618f5b1be2ef0cfa4de5362d1`](https://github.com/mariusz8789-sudo/Elion-Replit-grudzien-5rano/commit/3cd3a745c6fdcca618f5b1be2ef0cfa4de5362d1) triggered GitHub Actions run [`32948224047`](https://github.com/mariusz8789-sudo/Elion-Replit-grudzien-5rano/actions/runs/32948224047). The remote `CI` workflow completed with **success** in **1 minute 41 seconds**.

| Remote run                                                                                                              |   Lint | Frontend tests | Backend tests | Typecheck | Production build | Final conclusion |
| ----------------------------------------------------------------------------------------------------------------------- | -----: | -------------: | ------------: | --------: | ---------------: | ---------------- |
| [`32948224047`](https://github.com/mariusz8789-sudo/Elion-Replit-grudzien-5rano/actions/runs/32948224047) for `3cd3a74` | Passed |         Passed |        Passed |    Passed |           Passed | **success**      |

The run emitted GitHub's Node 20 deprecation annotation for upstream `actions/checkout`, `actions/setup-node`, and `actions/upload-artifact`. This was non-blocking and is not suppressed here; it is a future workflow-maintenance concern rather than a Genesis runtime or scientific-model issue.
