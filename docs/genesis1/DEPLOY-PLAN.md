# Deploy plan — prepared, not executed

**Status: AWAITING OWNER DECISION.** Nothing in this file has been deployed. The standing
autonomous-deploy authorization of 3 Oct 2026 19:06Z was withdrawn by the owner on
4 Oct 2026 01:26Z: no production deploy happens without his explicit order. This document exists
so that, when he gives it, the deploy is a single mechanical step with a known rollback.

## The commits

| Role | Commit | What it is |
| --- | --- | --- |
| CURRENT PRODUCTION SHA | `37197555` | `railway-production-ready`, the deploy of main `c6b4bc89` made 3 Oct 23:09Z |
| RELEASE CANDIDATE (main) | *pinned at the end of the round* | the integration head after the final test pass |
| ROLLBACK SHA | `37197555` | the current production commit itself: rolling back means reverting forward to this tree |
| PREVIOUS PRODUCTION SHA | `1fedbb58` | the deploy before it, main `c82b4f00`; code-only, schema unchanged |

`main` is currently 27 commits ahead of `railway-production-ready`.

## What a deploy is here

Railway builds the `railway-production-ready` branch. A deploy is a `--no-ff` merge of the chosen
main commit into that branch, with a commit message naming the main SHA and the PRs it carries.
Never a force push, never a history rewrite. Railway then posts a GitHub deployment status for the
production environment, which triggers the production smoke workflow.

## Rollback

A rollback is a **forward revert commit** on `railway-production-ready`, never a force push. The
rollback target is the tree of `37197555`.

**One caveat that decides whether a rollback is safe.** The schema version is now **17**
(production `37197555` runs 16; the deploy before it ran 14). Schema 17 is additive, and
`openDatabase` takes a `VACUUM INTO` snapshot before migrating, so a rollback to a code-only
earlier commit is safe for 16, but a rollback past a migration needs that pre-migration snapshot
restored. Check the snapshot exists (`db_pre_migration_snapshot` in the log) before rolling back
across a schema change.

## Pre-deployment gates

Every one of these must be green on the release candidate before the owner is asked to decide:

- TypeScript (`npx tsc -b`), ESLint, whitespace (`git diff --check`)
- frontend suite, backend suite, core suite
- candidate pipeline, GLP-1R and safety-first winner-gate tests
- Evidence and Replay; architectural invariant tests
- persistent-state kill/restart; tamper and corruption paths
- remote worker end to end, including worker takeover
- advance / next justified experiment; fan-out
- the laboratory closed loop; Lab handoff and Reports in a browser
- Flight Control; Arabic RTL; login and password-reset tests
- production build; container smoke; database migration, backup, restart
- the public-demo security gate

## Post-deploy check, and its known limitation

The production smoke workflow (`.github/workflows/production-smoke.yml`) runs on a successful
Railway deployment status and on demand. It checks that `/api/health` reports the deployed commit
and a persistent database, that the shell pages serve with their script bundle, and that an
unauthenticated private API call is refused.

**It cannot currently reach production.** `genesis-physics.com` resolves to a Namecheap parking
page (162.255.119.185; `www` to parkingpage.namecheap.com), so every HTTP check returns nothing.
The smoke run needs the `*.up.railway.app` URL, either passed as `base_url` or set as the
repository variable `GENESIS_PRODUCTION_URL`. Until that exists, **a post-deploy smoke result must
not be reported as GREEN** — it is BLOCKED_EXTERNAL, and the honest statement is that production
was deployed but not verified over HTTP.

## Order of operations when the owner decides

1. Re-run the gates above on the exact release candidate.
2. Record RELEASE SHA, PREVIOUS PRODUCTION SHA, test summary, known limitations, rollback target.
3. Merge main into `railway-production-ready` with `--no-ff`.
4. Watch the Railway deployment status.
5. Run the production smoke — or state that it is BLOCKED_EXTERNAL for the reason above.
6. If the smoke fails, revert forward to `37197555` and say so.
