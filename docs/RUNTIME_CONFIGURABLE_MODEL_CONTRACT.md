# Runtime-configurable models — audit and contract

C3, in response to the MASTER_PRIORITY P1 item: *"Nie implementuj fake
ModelUpdate. Zbadaj, jak przekształcić model z hardcoded/compiled form w
runtime-configurable model, aby Genesis w przyszłości mógł rzeczywiście
modyfikować model po falsyfikacji."*

Nothing is implemented here. This is what the substrate actually is, what it
already permits, and the smallest honest contract that would let Genesis treat a
model's STRUCTURE as a claim it can test.

**It also corrects a claim I made earlier.** `AUTONOMOUS_DISCOVERY_ROADMAP.md`
§10.15 says a model would have to "become a VALUE a solver can be built from at
runtime" before Genesis could do anything structural, and calls that a Fabric
change. That is right for one half of the problem and wrong for the other, and
the two halves need separating before any of this is actionable.

## 1. What a "model" concretely IS today

Two different things wear the word, and only one of them is compiled.

**WorldGraph side.** A model is a `DomainSolver`:

```ts
// core/worldModel/solvers/solverRouter.ts:37
export type DomainSolver = (entity: WorldModelEntity, ctx: SolverContext) => SolverResult;
```

registered by string id into a runtime map:

```ts
// core/worldModel/solvers/solverRouter.ts:49-53
private readonly solvers = new Map<string, DomainSolver>();
register(solverId: string, solver: DomainSolver): void { this.solvers.set(solverId, solver); }
```

and selected per entity by a value on the entity itself —
`entity.domainBinding.solverId` (`solverRouter.ts:87`). Eighteen solvers are
registered across `core/worldModel/domains/`, each with its own id
(`electrical-backup-generator-model`, `epidemic-seir-rk4`,
`chemistry-kinetics-arrhenius`, …).

**Fabric side.** A model is a registered router model (`biology-protein-folding-hp`,
`chemistry-arrhenius`) invoked by id with a parameter record.

Both are, structurally, the same arrangement: **a string id, resolved at
runtime, to compiled code.**

## 2. The distinction §10.15 collapsed

Inside every model there are two layers, and they are not equally frozen.

| layer | example, from `domains/electricalGenerator.ts` | is it a value today? |
| --- | --- | --- |
| PARAMETERS | `specificFuelConsumptionLPerKwh: 0.32`, `ratedPowerKw` | **yes** — this is exactly what PARAMETER and CALIBRATION inquiries vary |
| STRUCTURE | `fuelBurnedL = (loadKw * specificFuelConsumptionLPerKwh / 3600) * dt` (`electricalGenerator.ts:97`) | no — a literal in compiled code |

So "Genesis cannot change the model" is true of the second row and false of the
first. But there is a third possibility §10.15 never separated out:

- **CHOOSING** among structures somebody already wrote — no Fabric change
  needed. The registry is already runtime and the binding is already a value.
- **INVENTING** a structure nobody wrote — needs a solver that can be built at
  runtime from a declared form. That is the Fabric change, and §10.15's
  prerequisite is correct for this case only.

Everything below is about the first. The second stays where §10.15 put it.

## 3. Why nothing structural happens today, and it is not the mechanism

The mechanism exists. What is missing is a CLAIM to point it at.

All eighteen registered solvers cover eighteen DIFFERENT quantities. **No
quantity has two competing solvers.** There is nothing to select between, so
"which structure?" has never been a question anyone could ask — not because the
router refuses it, but because no domain has ever declared an alternative.

That is the real state, and it is a much smaller gap than "the substrate cannot
express it".

## 4. Prior art that must be reused, not duplicated

`core/worldModel/domains/seismicFragility.ts` already does most of this shape
for one domain. `FragilityRegistry` (`:255`) holds SEVERAL models for the SAME
quantity, and `forIntensityMeasure(im)` (`:279`) returns the ones applicable to
one hazard — competing models for one question, enumerable at runtime.

Its registration discipline is the part worth copying verbatim (`:265-271`): a
model without a citation or a licence is REJECTED, because *"once a number is in
the code an uncited one is indistinguishable from an invented one."* Any
structural-alternative registry must hold the same line, for the stronger
reason that a structure is a bigger claim than a number.

`FragilityModel` also already carries `citation` and `license` as required
fields. That is the provenance a structural hypothesis needs and it exists.

## 5. The contract

A structural hypothesis is a declared alternative solver for a quantity another
solver already computes. It is a claim of the same kind as "the temperature is
0.5" — testable, refutable, and NOT something Genesis writes.

```ts
/** An alternative structure for a quantity some other solver already computes. */
interface StructuralAlternative {
  /** The solver id this competes WITH, so the pairing is declared and not inferred. */
  readonly incumbentSolverId: string;
  /** This alternative's own registered id — a value, resolvable through SolverRouter. */
  readonly solverId: string;
  /** The quantity both compute, so a comparison has something to read. */
  readonly metric: string;
  /** How the two differ, in one sentence, in the domain's own terms. */
  readonly structuralDifference: string;
  /** Required, and validated on registration. FragilityRegistry's rule, for a bigger claim. */
  readonly citation: string;
  readonly license: string;
}
```

**How it would be tested, with machinery that already exists.** A structural
comparison is a MECHANISM-shaped experiment: fork the world at a decision tick,
rebind the entity to the alternative solver, advance both arms, compare the
metric. That is `TemporalEngine.forkBranch` plus a one-line mutation — precisely
what `mechanismGeneration.ts` already does to apply two levers in one fork. The
mutation is `graph.updateEntity(id, { domainBinding: { ...binding, solverId:
alternative.solverId } })` instead of a lever's `apply`.

So no new loop, no new contract for reporting, and no change to
`StrategyRun`: a structural comparison is a `MECHANISM` run whose hypothesis
happens to be about the model rather than about an intervention.

**What it must never become.** A structural alternative is not "the model is
wrong". `modelSufficiency.ts` is careful that an exhausted declared space is
insufficiency OF THE DECLARED SPACE, and adding structures to that space does
not change what a refutation means: refuting structure A in favour of B says B
survived a comparison A did not, on this metric, at this tolerance — never that
B is true.

## 6. The honest cost of a first demonstration

One domain must declare a second, real, cited structure for a quantity it
already computes. The generator is the natural candidate: its fuel model is
linear in load (`electricalGenerator.ts:97`), and the standard engineering
alternative is affine with an idle term (`fuelRate = a + b·load`), which is
textbook rather than invented.

That is real domain work with a real citation attached, and it is the whole
cost. **Writing a second solver purely so that there are two would be
fabricating physics to have something to discriminate** — the exact failure
`FragilityRegistry` rejects uncited models to prevent, and the reason this
document stops at the contract rather than shipping a demonstration.

## 7. What is still genuinely out of reach

Inventing a structure. For Genesis to propose a form nobody wrote, a solver
would have to be constructible at runtime from a declared expression over named
quantities — a Fabric change, exactly as §10.15 said, and one that brings its
own honesty problem: a machine-generated functional form has no citation, so
every guard in this codebase that demands provenance for a number would need an
answer for a structure that has none. That question should be settled before the
capability is built, not after.
