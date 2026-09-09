# Real Experiment Contract — design

C3, against MASTER_PRIORITY P1/P2: build the contract so a real laboratory
result can enter Genesis later **without rearchitecting**, integrating no
hardware now.

Nothing here is implemented. The one thing that IS implemented alongside it is
the provenance axis (`core/measurementProvenance.ts`), because the master doc is
right that doing it later means discovering half of Evidence, Memory and Replay
already assumed everything was a simulation.

## 1. What the audit found, before any design

Five facts constrain the whole design. Each was checked in the code, not assumed.

**A. There is exactly ONE measurement seam.**
`core/agent/inquiryLoop.ts:266` — `runAt(system, unknownValues, probeValue, purpose): ExperimentRun | null`,
module-private, and its own comment says every measurement AND every prediction
goes through it. That is the whole surface a real instrument has to fit.

**B. Execution is SYNCHRONOUS.**
`core/experimentFabric/executor.ts:1102` — `runExperiment(request: StructuredExperimentRequest): ExperimentRun`.
A real instrument cannot answer inside a synchronous call. This is the single
hardest constraint in the design and the reason §3 below is shaped the way it is.

**C. `resultOrigin` cannot express a measurement.**
`core/experimentFabric/types.ts:105` —
`'real-engine' | 'hypothetical-visualization' | 'knowledge-only' | 'capability-seam' | 'engine-not-available'`.
Every value describes whether a Genesis ENGINE ran. `experimentGraph.ts:148-154`
says so explicitly where it maps a completed run to `SIMULATION` or
`MODEL_ESTIMATE` and never to `OBSERVED`.

**D. Provenance was LOST at the `StrategyRun` hop.** It survived
Fabric → Run → Evidence and then stopped: `StrategyRun` carried no provenance
field of any kind, so Memory, replay and every UI downstream saw findings with
no record of what produced them. **Closed now** — see §2.

**E. `isSynthetic` is not the axis and cannot be extended into it.**
`core/dataSource.ts:32` is a property of a loaded DATASET, has zero branch
points in production code, is never persisted, and never touches an
`ExperimentRun`. Replacing that boolean would not have fixed anything, because
nothing downstream reads it. The axis had to be introduced where measurements
actually flow.

Prior art that must be reused rather than reinvented:
`externalJobManifest.ts:28-45` (`ExternalSolverJobManifest`, status
`AWAITING_RUNTIME`, `executionProhibitedReason`) is already this codebase's
pattern for "declared, described, deliberately not executable".
`externalAdapters.ts` already carries `requiredProvenance`,
`sourceLicenseOrTerms`, `sourceTimestamp` for imported external data.

## 2. The provenance axis — implemented

`core/measurementProvenance.ts`. `MeasurementOrigin` is
`SIMULATED | REFERENCE | REAL_EXPERIMENTAL`, and it is a different question from
every grading that already exists:

| existing | asks |
| --- | --- |
| `ConfirmationLevel` (`citation.ts`) | how well established the SCIENCE is |
| `HonestyLevel` (`types.ts`) | how much a presentation simplifies |
| `GroundingLevel` (worldModel) | whether an entity was advanced by a real solver |
| `ExperimentProvenance.resultOrigin` | whether an ENGINE executed, and which kind |
| **`MeasurementOrigin`** | **was the number COMPUTED, LOOKED UP, or MEASURED** |

It is now on `InquiryLoopResult` and **required** on `StrategyRun` (contract
1.3.0). Required rather than optional deliberately: an optional provenance field
is one every adapter is free to forget, which is exactly how it was lost at this
hop before.

Three properties the tests hold:

- **No path produces `REAL_EXPERIMENTAL`.** Every reading of a real
  `ExperimentRun` maps to `SIMULATED` whatever its `resultOrigin`, because C
  above leaves no honest alternative. The test enumerating all five origins is
  the boundary marker: it fails the day a real path is added without giving that
  path its own origin.
- **A MIXED run reports NO single origin.** A finding drawn across a simulation
  and a measurement is worth what its weakest source is worth, and collapsing it
  to one word is the precise loss this axis exists to prevent.
- **A run that measured nothing says so** rather than defaulting to `SIMULATED`.

## 3. The contract for a real experiment

The chain the master doc names, with each hop mapped onto what exists:

```
Hypothesis → Prediction → ExperimentRequest → RealExperimentRun → RawData
  → DerivedData → Evidence → Falsification/Support → Memory → Next Experiment
```

Hypothesis, Prediction, Falsification/Support, Memory and Next Experiment all
exist and need no change. The three new pieces are between `ExperimentRequest`
and `Evidence`, and constraint B decides their shape.

### 3.1 A real experiment is a REQUEST and a later RESULT, never a call

`runExperiment` is synchronous and must stay so — every loop in Genesis is built
on it returning. A real instrument cannot answer inside that call, so a real
experiment is not a slower `runExperiment`; it is two events separated by
however long the lab takes.

```ts
/** Issued by Genesis. Carries what to measure and what was predicted, so the
 *  comparison is preregistered rather than assembled after the data arrives. */
interface RealExperimentRequest {
  readonly requestId: string;
  /** The SAME StructuredExperimentRequest the simulated path would build, so a
   *  real run and a simulated one are answering an identical question. */
  readonly request: StructuredExperimentRequest;
  /** What Genesis predicted, recorded BEFORE the measurement exists. */
  readonly prediction: { readonly metric: string; readonly value: number };
  /** The band the prediction will be judged against, declared up front. */
  readonly agreementTolerance: number;
  readonly requestedAtIso: string;
  /** Why this measurement, from the run that proposed it. */
  readonly why: string;
}

/** Returned by whoever performed it. Never constructed by Genesis. */
interface RealExperimentRun {
  readonly requestId: string;
  readonly origin: 'REAL_EXPERIMENTAL';
  /** What the instrument produced, before any interpretation. */
  readonly rawData: RawMeasurement;
  /** What was computed FROM the raw data, and by what declared procedure. */
  readonly derivedData: DerivedMeasurement;
  readonly provenance: RealExperimentProvenance;
}
```

### 3.2 Raw and derived are separate, and both are kept

```ts
interface RawMeasurement {
  readonly capturedAtIso: string;
  /** The instrument's own output, unmodified. Opaque to Genesis on purpose. */
  readonly payload: unknown;
  /** Content hash of the payload, so a later claim can be checked against it. */
  readonly payloadSha256: string;
  readonly units: string;
}

interface DerivedMeasurement {
  readonly metric: string;
  readonly value: number;
  readonly units: string;
  /** How value was obtained from payload — named, versioned, and re-runnable. */
  readonly reductionProcedureId: string;
  readonly reductionProcedureVersion: string;
  /** Uncertainty the LAB reported. Never invented by Genesis. Null when the lab gave none. */
  readonly reportedUncertainty: number | null;
}
```

Separating them is the whole point of the pair. A number a lab derived from raw
data by a procedure nobody recorded is not reproducible, and Genesis's existing
replay discipline (re-execute and compare) has no analogue for a real
measurement — you cannot re-run a pipette. Keeping `payload` + `payloadSha256` +
a named reduction procedure is the closest honest substitute: the derivation can
be re-checked even though the measurement cannot be repeated.

`externalObservationComparison.provenance.{sourceUrl, rawPayloadSha256}` already
does exactly this for the AME2020 comparison. Same shape, extended.

### 3.3 Provenance a real run must carry, and why each field is not optional

```ts
interface RealExperimentProvenance {
  readonly origin: 'REAL_EXPERIMENTAL';
  /** Who performed it. A measurement with no responsible party is an anecdote. */
  readonly performedBy: string;
  readonly instrumentId: string;
  readonly instrumentCalibratedAtIso: string | null;
  readonly protocolId: string;
  readonly protocolVersion: string;
  /** Replicate index, so N=1 cannot be silently presented as a result. */
  readonly replicate: number;
  readonly license: string;
  /** Anything the lab flagged. Carried verbatim, never summarised away. */
  readonly caveats: readonly string[];
}
```

`instrumentCalibratedAtIso` is nullable and its absence must be reported, not
defaulted — an uncalibrated instrument is a real and common state, and
`seismicFragility.ts` already sets the precedent that a published curve does not
launder an uncalibrated input (`:245`).

### 3.4 The one seam that changes

`runAt` currently always calls `runExperiment`. The real path does not make it
async; it makes the SOURCE a declared choice:

```
runAt(system, values, probe, purpose)
  ├─ system.measurementSource === 'SOLVER'  → runExperiment(...)          [today]
  └─ system.measurementSource === 'REAL'    → lookupRealResult(requestId) [new]
                                               ↳ pending → the inquiry SUSPENDS
```

A suspended inquiry is a new terminal state, not an error, and it is the honest
one: `MEASUREMENT_PENDING` alongside the existing `MEASUREMENT_FAILED`. The loop
already knows how to stop and report why (that vocabulary was added when the
failed-measurement defect was fixed), so this reuses it rather than inventing
suspension machinery.

**What must NOT be done:** blocking, polling, or faking a value while the lab
works. A synthesised placeholder would be a simulation wearing a real run's
provenance, which is the single worst outcome this whole contract exists to
prevent.

### 3.5 Where it joins the existing chain

`RealExperimentRun` converts to an `ExperimentRun`-shaped record carrying
`MeasurementOrigin.REAL_EXPERIMENTAL`, and from there everything downstream is
unchanged — Evidence, `StrategyRun` (which now carries the axis), Memory,
replay. That is the test of this design: **no loop, no adapter and no memory
record needs a new branch**, because the axis they all now carry is the thing
that differs.

## 4. What this design deliberately leaves open

- **`resultOrigin` is not extended.** Adding a sixth value meaning "measured"
  would put two different questions on one enum, and `resultOrigin` has eleven
  branch sites that all mean "did an engine run". The new axis sits beside it.
- **`REFERENCE` has no producer yet either.** Real reference data exists in the
  codebase (AME2020, the dimuon dataset) with its own provenance records that
  never reach an `ExperimentRun`. Routing those through this axis is a smaller,
  separate change and a good first exercise of it — with no lab involved.
- **Replay for a real run is unsolved and named as unsolved.** Genesis's replay
  re-executes and compares fingerprints. A real measurement cannot be
  re-executed. §3.2 preserves what can be re-checked; asserting more would be
  the overclaim.
- **`saveParameterInquiryToMemory` silently drops `execution` for any
  non-`real-engine` origin** (`scienceMemory.ts:1850`). It erases rather than
  mislabels, so it is not urgent, and the new axis survives regardless because
  it rides on `result`. Worth tightening when the real path lands.
