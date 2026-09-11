# Genesis Sovereign Foundation — concept and handoff to C3

`packages/frontend/src/core/governance/`

A bounded foundation for running Genesis in a setting where **who did what, on
whose authority, and who signed for it** has to be answerable. No UI, no
storage, no network, no singleton — every export is a pure value or a pure
function, so C3 can wire it without inheriting a runtime.

---

## 1. The audit that came first

Before writing anything, three things were checked for in the repository,
because a governance layer is usually tempted to reinvent exactly these.
**All three already exist, and none of them is rebuilt:**

| Concern | Where it already lives | What this foundation does about it |
|---|---|---|
| Identity, sessions, tokens | `core/backend/session.ts`, `components/AccountPanel.tsx`, `LockedScreen.tsx` | **Nothing.** No export here authenticates, issues, reads or stores a token. |
| The authoritative policy | `packages/backend/src/access.mjs` — `canUseAccessLevel(level, role, operation)`, enforced server-side | **Consumes its verdict.** Never re-derives it. |
| The audit log | the `access_audit` table + `listProjectAccessAudit()` | **Produces rows shaped for it.** Does not open a second log. |

The existing vocabularies are reused verbatim: `ProjectRole`
(`owner | admin | editor | viewer`), the access classification
(`PUBLIC | RESEARCH | RESTRICTED`), and the `AccessAuditEntry` columns.

## 2. What was genuinely missing

1. **A named capability catalogue.** The server rule answers *"may this role
   read or run in this project"*. It has no vocabulary for the difference
   between *running a simulation* and *admitting a real laboratory measurement*
   — which in a regulated deployment are not remotely the same act.
2. **An approval workflow.** `access_audit` records what **happened**. Nothing
   recorded a request **waiting for a decision**, and nothing enforced that the
   person who asked is not the person who signs it off.
3. **A typed audit concept** tying a capability decision to the row that must be
   written about it — including for refusals.

## 3. The safety property

> **This layer can only narrow what the server already permitted. It has no
> expressible way to widen it.**

The obvious implementation would re-implement `canUseAccessLevel` in TypeScript
so the UI can decide offline. That is a **second policy engine**, and two policy
engines eventually disagree — at which point one grants what the other refuses
and nothing in a green test suite says so.

So `evaluateCapability()` takes the server's own verdict (`ProjectAccess`:
`{ accessLevel, role, canRun }`) as an **input** and ANDs the capability's
requirement onto it. Narrowing is therefore structural, not a review promise.

`governanceFoundation.test.ts` checks it exhaustively across every capability ×
every role × every access level × both server verdicts, rather than trusting the
argument above.

**Consequently this layer is advisory** — every `CapabilityDecision` carries
`advisory: true` in the value itself. It decides what a UI offers and what must
go for approval first. It is not, and must never become, the thing that actually
protects data.

## 4. The four modules

### `capabilities.ts` — what can be done, and what it costs to get wrong

Nine capabilities, each naming the **real code path it governs** (the `governs`
field) so the catalogue stays checkable rather than aspirational. Each declares
a `minimumRole`, a `maximumAccessLevel` ceiling, an approval policy or `null`,
and a `ConsequenceTier`:

- `REVERSIBLE` — undoing it restores the previous state.
- `PERSISTENT` — writes a lasting record; nothing leaves, nothing is claimed.
- `LEAVES_THE_SYSTEM` — data crosses the boundary and cannot be recalled.
- `ASSERTS_REALITY` — attaches `REAL_EXPERIMENTAL`/`REFERENCE` provenance, so
  everything downstream treats the number as a fact about the world.

That last tier is the one the server rule cannot express and the reason the
catalogue exists. A test enforces that **every** capability at the top two tiers
requires approval; `evidence.admit-real-measurement` requires **two**, because a
mistaken admission is not visibly different from a correct one.

### `decision.ts` — one pure function

`evaluateCapability(request) → ALLOW | REQUIRES_APPROVAL | DENY`, with a named
`basis` for every outcome (`SERVER_REFUSED_RUN`, `ROLE_BELOW_MINIMUM`,
`ACCESS_LEVEL_ABOVE_CEILING`, `APPROVAL_REQUIRED`, `PERMITTED`,
`UNKNOWN_CAPABILITY`). Checks run in that order, so a server refusal is never
reached past. **An unknown capability is denied** — a catalogue that fails open
is worse than no catalogue.

### `approval.ts` — a pure reducer, no clock

`openApprovalRequest` / `approve` / `reject` / `withdraw` / `expireIfDue`. `now`
is always an argument, never `Date.now()`, so a test can expire a request
without waiting and two callers cannot disagree about the current time.

Five rules, each tested:

1. **The requester can never approve their own request.** Without separation of
   duties this is a delay, not a control.
2. **One approver, one vote** — otherwise one person clears a two-approval
   policy by pressing twice.
3. **A rejection is decisive** — no shopping for a more agreeable approver.
4. **Terminal is terminal** — a late event cannot rewrite the trail.
5. **Every refused transition returns a reason.** "Nothing happened" is the
   worst possible answer to an attempt to approve something.

Signatures collected before a rejection are **kept**: who approved before
someone objected is exactly what an auditor needs.

### `audit.ts` — rows for the table that already exists

`GovernanceAuditEntry` is `AccessAuditEntry` minus `id`, `userId` and
`createdAt` — the three the server owns — so a caller **cannot forge an identity
or backdate a row**. Two rules:

- **A DENY is logged exactly as loudly as an ALLOW.** A log that only records
  successes answers the wrong question.
- **No entry ever carries the governed payload.** It records that a bundle was
  exported, never the bundle — otherwise the audit log becomes a second,
  unclassified copy of the sensitive thing. `payloadLikeKeys()` is the cheap
  assertion for this, and it is a *name* check by design: a content scan would
  have to look at the sensitive data to decide.

## 5. What C3 needs to do to integrate this

Nothing here is wired to anything yet — deliberately, since the instruction was
to build the foundation and not the UI.

1. **Feed it the real verdict.** Call `getProjectAccess(token, projectId)` and
   pass the result straight into `evaluateCapability` as `server`. Do not
   synthesise a `ServerAccessVerdict`; that is the one input whose honesty the
   whole property rests on.
2. **Persist approval requests.** The reducer is pure and holds nothing. A
   request needs a home — a new backend table is the natural one, and its
   columns are already implied by `ApprovalRequest`.
3. **Write the audit rows.** There is no endpoint yet that accepts a governance
   row; `appendAccessAudit()` in `access.mjs` is the function to expose. Until
   then, entries are produced and dropped.
4. **Enforce server-side.** This layer decides what to *offer*. Any capability
   that matters must also be refused by the backend for a caller that ignores
   the UI entirely.

## 6. Honest status

| Piece | Status |
|---|---|
| Capability catalogue over real code paths | **Built and tested** |
| Capability gating, provably narrowing-only | **Built and tested** |
| Approval workflow with separation of duties | **Built and tested** |
| Audit entry shapes aligned to the existing table | **Built and tested** |
| Persistence of approval requests | **Not built** — needs a backend table |
| An endpoint accepting governance audit rows | **Not built** — `appendAccessAudit()` exists but is not exposed |
| Any UI | **Not built, by instruction** |
| Server-side enforcement of these capabilities | **Not built** — the backend still enforces only its own access rule |

Nothing in this foundation changes any existing behaviour: no current code path
imports it yet. It compiles, it is covered by 30 tests, and it waits.
