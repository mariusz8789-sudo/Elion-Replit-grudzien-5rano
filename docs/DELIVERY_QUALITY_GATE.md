# Genesis delivery quality gate

## Purpose

The repository-native quality gate in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) protects changes to Genesis on every branch push and pull request. It is a verification workflow only. It neither publishes an application, uploads scenario evidence outside the existing short-lived build artifact, invokes a live data source, nor changes simulation behavior.

## Checks

| Check                    | Command or mechanism                                              | Reason                                                                    |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Dependency installation  | `npm ci`                                                          | Recreates the lockfile-defined workspace dependency tree.                 |
| Changed-range whitespace | `git diff --check` against the pull-request base or previous push | Rejects trailing whitespace and malformed patch whitespace before review. |
| Lint                     | `npm run lint`                                                    | Preserves repository static-analysis coverage.                            |
| Frontend tests           | `npm run test --workspace=packages/frontend -- --maxWorkers=1`    | Executes the frontend suite in its stable single-worker mode.             |
| Backend tests            | `npm run test --workspace=packages/backend`                       | Retains existing backend regression coverage.                             |
| Frontend typecheck       | `npm exec --workspace=packages/frontend -- tsc --noEmit`          | Checks TypeScript independently of the bundling path.                     |
| Production build         | `npm run build`                                                   | Verifies the deployable frontend bundle can be produced.                  |
| Build artifact           | `packages/frontend/dist`, retained for seven days                 | Supports review of the built output without a deployment action.          |

## Local reproduction

Developers can reproduce the quality gate sequentially from repository root:

```bash
npm exec -- prettier --check .github/workflows/ci.yml
npm run lint
npm run test --workspace=packages/frontend -- --maxWorkers=1
npm run test --workspace=packages/backend
npm exec --workspace=packages/frontend -- tsc --noEmit
npm run build
git diff --check
```

The single-worker frontend command is intentional. It preserves normal test assertions while avoiding resource-contention timeouts observed in concurrent execution; it is not a reduction of test scope.

## Verified remote execution

The artifact-harness lint scope was verified remotely on GitHub Actions run [`32948224047`](https://github.com/mariusz8789-sudo/Elion-Replit-grudzien-5rano/actions/runs/32948224047) for commit [`3cd3a74`](https://github.com/mariusz8789-sudo/Elion-Replit-grudzien-5rano/commit/3cd3a745c6fdcca618f5b1be2ef0cfa4de5362d1): **lint, frontend tests, backend tests, frontend typecheck, production build, and build artifact all passed**. The preceding failure and narrow `artifacts/**/*.mjs` remediation are documented in [CI reliability audit](./CI_RELIABILITY_AUDIT.md).

## Boundary

> The quality gate validates code and produces a review artifact. It does **not** publish Genesis, make a scientific claim, run a live hazard, change City3D, restore an overlay, or contact an external provider.

Publishing remains a separate user-controlled deployment decision after a validated pushed version is available.
