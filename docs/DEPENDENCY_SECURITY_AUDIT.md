# Dependency Security Audit

## Scope and boundary

This maintenance pass updates only `package-lock.json`. No package manifest, source code, scientific model, City3D renderer, Earthquake contract, data adapter, GIS behavior, scenario, replay path, or deployment configuration changed.

The initial production-only audit reported **zero vulnerabilities** across 18 production dependencies. The full locked-tree audit identified three high-severity findings in development/build tooling. The remediation therefore preserves the runtime dependency boundary while keeping the developer and CI build chain current.

| Advisory package  | Prior lock version | Patched lock version | Resolved through       |
| ----------------- | -----------------: | -------------------: | ---------------------- |
| `brace-expansion` |            `5.0.7` |              `5.0.9` | `eslint` → `minimatch` |
| `nanoid`          |           `3.3.15` |             `3.3.18` | `vite` → `postcss`     |
| `postcss`         |           `8.5.16` |             `8.5.26` | `vite`                 |

The refresh also advances compatible lockfile-resolved development packages, including ESLint, TypeScript-ESLint, Rollup, and Rollup platform packages, within their existing declared semver ranges. It deliberately leaves `package.json` and `packages/frontend/package.json` unchanged.

## Advisory basis

`brace-expansion` `5.0.7` was affected by the unbounded expansion-length denial-of-service advisory; GitHub lists `5.0.8` as the first patched 5.x version. [1] `nanoid` versions before `3.3.18` were affected when custom generators receive a zero size; `3.3.18` is the patched 3.x version. [2] PostCSS `8.5.16` was in the affected range for previous-source-map path traversal; `8.5.18` is the first patched release. [3]

## Compatibility evidence

The candidate lockfile was first refreshed in a detached worktree with lifecycle scripts disabled. A clean `npm ci --ignore-scripts` installation, lint, full single-worker frontend suite, backend suite, frontend typecheck, production build, `git diff --check`, production-only audit, and full audit all passed. Both audits reported zero vulnerabilities after resolution.

The promoted lockfile was byte-identical to the isolated candidate. Live production-only and full audits both reported zero findings. Commit [`64eddbe`](https://github.com/mariusz8789-sudo/Elion-Replit-grudzien-5rano/commit/64eddbe7eb56888e3a34a1167f5089ed6e0e8fe1) then completed the unchanged remote quality gate successfully in [GitHub Actions run `32956020910`](https://github.com/mariusz8789-sudo/Elion-Replit-grudzien-5rano/actions/runs/32956020910): clean install, whitespace check, lint, frontend tests, backend tests, frontend typecheck, production build, and artifact upload all passed.

## Continuous CI enforcement

The repository quality gate now runs `npm audit --audit-level=high` immediately after `npm ci`. It fails only when npm reports a high- or critical-severity advisory, while still assessing the full locked dependency tree rather than silently excluding the development/build chain. This is intentional: the build, lint, test, and artifact-upload tools execute inside the CI trust boundary. The step neither publishes nor deploys Genesis and has no application, scientific, renderer, hazard, data, or GIS behavior.

## References

1. [GitHub Advisory Database: `brace-expansion` unbounded expansion denial of service](https://github.com/advisories/GHSA-mh99-v99m-4gvg)
2. [GitHub Advisory Database: `nanoid` zero-size custom generator infinite loop](https://github.com/advisories/GHSA-2v37-7h3g-55p8)
3. [GitHub Advisory Database: PostCSS previous-source-map path traversal](https://github.com/advisories/GHSA-r28c-9q8g-f849)
