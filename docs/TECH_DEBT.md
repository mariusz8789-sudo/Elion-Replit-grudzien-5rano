# Technical debt — open engineering tasks

Items that are known, deliberately not fixed yet, and must not be quietly
resolved by weakening a check.

---

## ADMET tests require isolated execution

**Status:** mitigated, root cause open.
**Raised:** Phase 1a, from a full-suite run.

### What happens

Three tests in `packages/backend/src/admetEngine.test.mjs` drive a real Python
ML subprocess (ADMET-AI) under a strict 30 s timeout set in
`compute/admetAdapter.mjs`. `node --test` runs test files in parallel across
every core, so under the full ~97-file suite that subprocess competes for CPU and
times out. Observed: a failure at **30 049 ms** against a **30 000 ms** ceiling.

The same file passes 7/7 when run alone. The failure is resource contention, not
logic — it reports as a scientific failure and is not one.

### What was done

The three contended tests are gated behind `GENESIS_ISOLATED_TESTS=1` and run by
`npm run test:isolated --workspace=packages/backend`, serialised with
`--test-concurrency=1`. The root `npm test` runs the parallel suite first and the
isolated pass after, so they always run — they report as **skipped** in the
parallel pass, never as passed.

### What was deliberately NOT done

**The timeout was not raised.** A 30 s ceiling on a prediction call is a real
product constraint; widening it to obtain a green suite would trade a true signal
for a cosmetic statistic. If ADMET genuinely becomes slow in production, this
test is how we find out.

### Open work

Investigate adaptive resource scheduling — a compute-aware test lane, or a
semaphore around the Python subprocess — **only if isolated execution becomes
impractical** (for example if the isolated pass grows past a few minutes, or if
other subsystems need the same treatment and the lane list becomes unmanageable).
Until then, isolation is the cheaper and more honest answer.

### CI requirement

Any CI configuration must run **both** passes. A pipeline that runs only
`node --test "src/**/*.test.mjs"` will silently skip three real tests of a real
model and report success.
