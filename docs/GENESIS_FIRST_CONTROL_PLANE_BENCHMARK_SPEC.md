# Genesis First Scientific Control Plane Benchmark

**Decision status:** `DESIGNED / VERIFY_REQUIRED`

**Implementation status:** `NOT_IMPLEMENTED`

**Scope:** A bounded, deterministic, instrument-agnostic benchmark using the existing PySCF backend path, Experiment Fabric, Evidence Pack and Replay contracts. This is a specification and validation plan only. It does not add a new solver, biological procedure, laboratory instrument or external dataset.

## Executive decision

The first demonstrator should not be a claim about longevity, protein design or autonomous wet-lab control. It should prove a smaller but defensible capability that a normal chatbot cannot provide by text alone:

> Genesis executes two real, typed computational experiments through an admitted scientific engine, compares them under a preregistered hypothesis and invariant, records provenance and failure states, exports evidence, replays the record and proposes a bounded next validation experiment.

The selected engine is the existing bounded PySCF H₂ RHF path. The repository already contains a PySCF benchmark suite with a variational-principle case, translation/permutation invariance cases and deterministic checks. The benchmark must reuse those existing cases rather than create a new quantum-chemistry implementation.

## Benchmark question

**Question:** At fixed linear H₂ geometry and fixed RHF/STO-3G versus RHF/6-31G setup, does enlarging the basis set produce an energy that is less than or equal to the smaller-basis variational energy?

This is a bounded computational question, not an experimental measurement and not a claim about molecular behavior in the laboratory.

## Hypotheses

| ID | Type | Statement | Status |
|---|---|---|---|
| H0 | Null/invariant | The larger-basis Hartree–Fock energy is greater than or equal to the smaller-basis energy, within the declared numerical tolerance. | `PREREGISTERED` |
| H1 | Alternative | The larger-basis Hartree–Fock energy is lower than the smaller-basis energy, within the declared numerical tolerance. | `PREREGISTERED` |

The expected result follows from a mathematical property of variational basis enlargement for the same Hartree–Fock setup. It must be reported as an invariant check, not as a new scientific discovery.

## Existing capability map

| Layer | Current status | Required proof |
|---|---|---|
| Science Chat intent | `CONNECTED` | Typed request resolves to an existing PySCF-capable model |
| Structured experiment | `CONNECTED` | Existing protocol records hypothesis, arms, metric, repetitions and falsification relation |
| PySCF executor | `CONNECTED / BOUNDED` | Existing backend route executes the admitted H₂ RHF envelope |
| Two-arm comparison | `PARTIAL` | Must prove compatible snapshots and explicit A/B comparison in one evidence chain |
| Evidence Pack | `PARTIAL` | Must be created only from completed real runs and preserve engine/provenance fields |
| Replay | `CONNECTED for Fabric records` | Must produce deterministic replay status and expose any drift/block state |
| Instrument layer | `NOT_CONNECTED` | Intentionally out of scope for this benchmark |
| External dataset | `NOT_REQUIRED` | Ground truth is a mathematical invariant plus engine output |
| Novel scientific discovery | `NOT_CLAIMED` | Benchmark validates workflow integrity, not new chemistry |

## Required protocol

The protocol must include fixed H₂ geometry, atom ordering, charge, spin, basis sets, SCF method, convergence settings, metric key, tolerance, repetition count, seed policy if applicable, falsification relation, model version and engine version. The two arms must differ only in the preregistered basis-set variable.

The protocol must reject hidden changes in geometry, charge, spin, method, convergence policy, units or engine version. If the existing backend cannot expose a required field, the run is `VERIFY_REQUIRED` or `BLOCKED`, not silently upgraded.

## Required execution chain

```text
Science Chat question
→ structured request
→ explicit confirmation
→ Protocol/A-B design
→ PySCF arm A: H₂ RHF/STO-3G
→ PySCF arm B: H₂ RHF/6-31G
→ compatible comparison
→ invariant assessment
→ Evidence Pack
→ provenance snapshot
→ deterministic replay
→ bounded next validation
```

The generic executor must not be used to imply an engine run when the named backend is unavailable. A failed or rejected REAL_ENGINE request must retain the existing honest `engine-not-available` or blocked classification.

## Evidence requirements

Each arm must preserve, at minimum:

| Evidence field | Requirement |
|---|---|
| Protocol ID and version | Required |
| Hypothesis and falsification relation | Required |
| Model ID/version | Required |
| Engine and backend run ID | Required for completed backend run |
| Geometry, basis, charge, spin and method | Required parameter snapshot |
| Units and metric key | Required |
| Numerical result | Required only when the engine completed |
| Result origin | `real-engine` only for a completed engine run |
| Deterministic flag | Required and honest |
| Run fingerprint | Required |
| Environment/runtime information | Required to the extent exposed by the existing contract |
| Limitations | Must state fixed-geometry, bounded RHF scope |
| Replay verdict | `MATCH`, `DRIFT`, `BLOCKED` or `NOT_REPRODUCIBLE` |

No result may be copied from a literature value or inferred from the hypothesis. If one arm fails, the outcome is incomplete and must remain `BLOCKED`, `VARIANT_REQUIRED` or the existing explicit failure status.

## Validation matrix

| Case | Expected status | What it proves |
|---|---|---|
| Both compatible PySCF arms complete; invariant holds | `MATCH` / complete evidence | Real two-arm execution, comparison and evidence chain |
| Re-run unchanged protocol | `MATCH` | Deterministic replay under declared environment |
| Change basis without updating protocol | `BLOCKED` or validation error | Protocol immutability and no hidden variant |
| Change geometry or charge | `DRIFT` / incompatible variant | Snapshot compatibility guard |
| Backend unavailable | `ENGINE_NOT_AVAILABLE` / explicit blocked state | No fabricated real-engine result |
| One arm fails | Incomplete evidence | Failure is preserved, no false comparison |
| Alter stored result or fingerprint | `DRIFT` | Replay detects tampering/change |
| Replace completed run with local estimate | Rejected | Provenance cannot be upgraded to `real-engine` |
| Repeat with atom-order permutation | Separate validation case | Invariance check, not a new discovery |
| Translate both atoms equally | Separate validation case | Translation-invariance validation |

## Next experiment proposal

The first next step after a successful benchmark should be a **validation repetition**, not automatic optimization: rerun the same H₂ case with atom order permuted and then with a rigid translation, keeping all scientific settings constant. Genesis may propose this as a bounded next experiment, but `AUTO-RUN` remains disabled and no claim of causal discovery is made.

A later, separately approved extension could compare a geometry sweep, but that is not part of this first benchmark because the current admitted PySCF envelope is explicitly bounded and must not be expanded by implication.

## Why this beats a chatbot

A chatbot can explain the variational principle or invent plausible values. It cannot, by conversation alone, provide a trusted Genesis artifact containing two actually executed backend runs, exact parameter snapshots, engine identity, provenance fingerprints, an invariant assessment, tamper/drift detection and replay status. This benchmark demonstrates that product distinction without pretending to perform physical laboratory work.

## Admission gate before implementation

Implementation may begin only after a maintainer confirms:

1. the existing PySCF route really supports both required basis-set arms;
2. both arms expose complete compatible provenance;
3. the comparison can be represented by the current Evidence Pack without a second evidence schema;
4. the replay contract preserves the two-arm relationship;
5. the backend runtime and benchmark fixture are available in CI or the limitation is explicitly recorded;
6. Chromium can show the chain from Science Chat/Protocol to result, Evidence and Replay;
7. the benchmark remains bounded to H₂ RHF and does not imply materials, drug, therapeutic or laboratory claims.

If any gate fails, status remains `VERIFY_REQUIRED` or `BLOCKED`; the benchmark must not be advertised as complete.

## Final status

This benchmark is the recommended first **Scientific Control Plane proof**, not a new scientific capability. It reuses existing Genesis components and creates a measurable difference from a chatbot: executable, comparable, provenance-bearing, replayable evidence. It should be implemented only after the specification and admission gate above are accepted.
