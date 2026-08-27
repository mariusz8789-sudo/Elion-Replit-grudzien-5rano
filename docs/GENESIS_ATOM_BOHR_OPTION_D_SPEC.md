# Genesis — `atom-bohr` Option D implementation specification

Specification only. **No production code was written.** `expectedValues[]` was not implemented,
`transitionWavelengthNm` was not added, no Evidence Pack or Replay system was created, no solver,
adapter, instrument, GIS or transport was built, and Earthquake, Epidemic and the water model were
not touched. This report is the only new file.

| Item                    | Value                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| LIVE HEAD               | `7d13c6578c151b3b60a73ba553e5704c250e923a` — "docs: preserve scientific knowledge references" |
| Work branch             | `claude/atom-bohr-option-d-spec`, from `7d13c65`                                              |
| Merged / pushed to LIVE | no                                                                                            |

## Recommendation

**BUILD LATER — pending CTO approval, pinned NIST references, and a Scientific Core contract
decision.**

The scope is now unambiguous: five files, ~55–75 production lines, one deliberate `modelVersion`
bump, and a fingerprint migration whose blast radius is bounded to `atom-bohr` evidence. Two
findings below reduce the work below the previous estimate (§2.4, §4.2). Three gates remain
unpassed (§9).

## 1. Current contract audit

All line references are FACTs read at LIVE HEAD.

### 1.1 Protocol / A-B types — `core/experimentFabric/scientificDiscovery.ts`

| Symbol                               | Line | Relevance                                                                                                                                             |
| ------------------------------------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FalsificationCriterion`             | 11   | **must change** — carries `metric`, `relation`, `expectedValue?` (14), `tolerance?` (15), `rationale`                                                 |
| `ScientificHypothesis.falsification` | 27   | embeds the criterion; enters the protocol fingerprint                                                                                                 |
| `ExperimentArm`                      | 32   | `armId`, `label`, `kind`, `request`, `expectedRole`. **Arm identity already exists — no change needed**                                               |
| `ExperimentArmKind`                  | 8    | `baseline \| variant \| negative-control \| positive-control \| replication`                                                                          |
| `ExperimentArmEvidence`              | 52   | per-arm `outputValues`, `units`, `reproduction`, `anomalyFlags`. **Should change** to carry the per-arm reference and residual                        |
| `HypothesisAssessmentEvidence`       | 63   | `assessment`, `message`, `criterion`, `referenceRunIds`                                                                                               |
| `HypothesisAssessment`               | 7    | `CANDIDATE \| SUPPORTED_WITHIN_PROTOCOL \| FALSIFIED_WITHIN_PROTOCOL \| INCONCLUSIVE`. **No `BLOCKED` or `VERIFY_REQUIRED` member exists** — see §2.5 |

### 1.2 Planner validation — `core/experimentFabric/scientificPlanner.ts`

| Symbol                       | Line | Behaviour                                                                                                                                    |
| ---------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `designScientificExperiment` | 24   | entry point                                                                                                                                  |
| model admission check        | 28   | real engine must be registered in the Knowledge Registry                                                                                     |
| sweep parameter check        | 33   | the swept parameter must be declared by the Knowledge Registry for the domain — **a new `atom-bohr` parameter must be registered there too** |
| unique sweep values          | 41   | `Sweep values must be unique.`                                                                                                               |
| at least one differing arm   | 80   | `At least one sweep value must differ from the baseline parameter.`                                                                          |
| `buildArmId`                 | 16   | `arm_${fnv1a({designSeed, suffix})}`; variant suffix is `variant:${valueKey(value)}` (75)                                                    |
| `protocolFingerprint`        | 53   | seed = `{version, hypothesis, baselineRequest, sweep, repetitions, positiveControl, knowledgeSources}`                                       |

**FACT with a large consequence:** the seed at line 53 contains `hypothesis`, which contains
`falsification`. **Any field added to `FalsificationCriterion` therefore enters the protocol
fingerprint automatically** — no separate fingerprint work is required for `expectedValues[]` or
for pinned reference hashes carried inside the criterion.

### 1.3 Evaluator — `core/experimentFabric/scientificExecutor.ts`

| Symbol                          | Line    | Behaviour                                                                                                                                                                |
| ------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `armEvidence` metric extraction | 16      | `run.result.outputs[design.primaryMetric]` — a **literal output key**                                                                                                    |
| unit extraction                 | 17, 30  | `run.result.units[design.primaryMetric]`                                                                                                                                 |
| variant filter                  | 50      | `arms.filter((arm) => arm.kind === 'variant')` — **controls are recorded but never asserted**                                                                            |
| `equal-within-tolerance` branch | 68      | requires `expectedValue` and `tolerance`, else `INCONCLUSIVE`; then `numbers.every(v => Math.abs(v - expectedValue) <= tolerance)` — **one value for every variant arm** |
| backend path metric extraction  | 108–117 | duplicate of 16–30 for `executeScientificBackendExperiment` — **both call sites must change together**                                                                   |
| chain `provenanceFingerprint`   | 125     | `{protocol, primaryMetric, arms: [{armId, runFingerprints, values, reproduction}]}`                                                                                      |

### 1.4 `runFingerprint` — `core/experimentFabric/provenance.ts`

`createExperimentProvenance` hashes `{requestFingerprint, planFingerprint, status, outputs, units,
warnings, backendExecution}`. `fingerprintExperimentPlan` hashes `{request, capability,
supplementalKnowledgeIds, engine, modelVersion, parameterSchema, route}`.

**Two independent guarantees for the migration:** adding a model output changes `outputs`, and
bumping `modelVersion` plus adding a parameter changes `parameterSchema` and `modelVersion`. Old
and new `atom-bohr` runs therefore cannot collide at either level.

### 1.5 Evidence Pack — `core/experimentFabric/evidencePack.ts`

`evidencePackId` seed (63–72) = `{contractVersion, chain: provenanceFingerprint, protocol:
protocolFingerprint, runFingerprints, assessment: {assessment, message, criterion,
referenceRunIds: []}}`.

**FACT:** `criterion` is in the seed. A changed reference value, tolerance or pinned artifact hash
carried inside the criterion changes `evidencePackId` automatically.

### 1.6 Replay comparator — `core/experimentFabric/evidencePackStore.ts:52`

```
compareScientificEvidencePacks(reference, replay):
  any run not 'completed'                      -> BLOCKED
  protocolFingerprint differs                  -> DRIFT
  run count differs                            -> DRIFT
  any runFingerprint differs                   -> DRIFT
  otherwise                                    -> MATCH
```

Verdict type `ScientificEvidenceReplayVerdict = 'MATCH' | 'DRIFT' | 'BLOCKED'`. **No change is
required** — every Option D mutation already lands on the right verdict (§5).

### 1.7 `modelVersion` handling — `core/experimentFabric/router.ts:198`

`{ id: 'atom-bohr', domainId: 'atom', modelVersion: '1.0.0', engine: 'genesis-model-graph@1.0.0',
parameters: [atomicNumber (1–118), principalN (1–10)] }`.

### 1.8 Files and symbols that must change

| File                                           | Symbol                                             | Change                                                                    |
| ---------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| `core/experimentFabric/scientificDiscovery.ts` | `FalsificationCriterion`                           | add optional per-arm reference block                                      |
|                                                | `ExperimentArmEvidence`                            | add optional `reference`, `residual`, `referenceStatus`                   |
| `core/experimentFabric/scientificExecutor.ts`  | `armEvidence` (16), backend path (108)             | attach the per-arm reference and residual                                 |
|                                                | `evaluateHypothesis` `equal-within-tolerance` (68) | prefer the per-arm array; no silent single-value fallback                 |
| `core/modelGraph/bohrModelGraph.ts`            | `buildBohrModelGraph`                              | add `principalNUpper` input and transition nodes                          |
| `core/experimentFabric/router.ts`              | `atom-bohr` entry (198)                            | add the parameter, bump `modelVersion` to `1.1.0`                         |
| `core/experimentFabric/executor.ts`            | `case 'atom-bohr'`                                 | add the new output keys to `graphOutputs(...)`                            |
| `core/knowledge/registry.ts`                   | `atom` domain `parameters`                         | register `principalNUpper` so the planner accepts it as a sweep parameter |

Not changed: `evidencePack.ts`, `evidencePackStore.ts`, `provenance.ts`, `scenarioCapsule.ts`,
`counterfactualCompare.ts`, all UI.

## 2. Option D contract specification

### 2.1 Per-arm reference block

Carried **inside `FalsificationCriterion`**, so it is fingerprinted by the protocol and the pack for
free (§1.2, §1.5).

```
ArmReference {
  armKey            string   // 'baseline' or the sweep value key, matching buildArmId's suffix
  referenceValue    number
  unit              string   // must equal the arm's reported metric unit
  uncertainty       number   // standard uncertainty, same unit
  uncertaintyType   'standard' | 'expanded-k2' | 'stated-interval'
  tolerance         number   // per arm; may differ between arms
  toleranceRationale string
  sourceArtifactId  string
  rawPayloadSha256  string
  sourceUri         string
  datasetName       string
  datasetVersion    string
  licenceStatus     'CONFIRMED' | 'VERIFY_REQUIRED'
  transformId       string
  transformVersion  string
}

FalsificationCriterion += {
  expectedValues?:  readonly ArmReference[]
  referencePolicy?: 'per-arm-required'   // explicit opt-in; absence keeps today's behaviour
}
```

### 2.2 Binding rule — no silent fallback

`referencePolicy: 'per-arm-required'` is **mandatory** whenever `expectedValues` is present. When
it is set:

- a single `expectedValue` is **never** applied to any arm;
- every asserted arm must resolve exactly one `ArmReference` by `armKey`;
- unmatched or duplicate `armKey` is a hard failure, not a default.

Setting both `expectedValue` and `expectedValues` without the policy flag is rejected by the
planner, so an ambiguous protocol cannot be pre-registered.

### 2.3 Comparison verdict per arm

For each asserted arm: `residual = armMean − referenceValue`; `pass = |residual| ≤ tolerance`.
The protocol assessment is `SUPPORTED_WITHIN_PROTOCOL` only if every asserted arm passes **and**
every arm resolved a reference. Otherwise `FALSIFIED_WITHIN_PROTOCOL`, unless a `referenceStatus`
below forces `INCONCLUSIVE`.

### 2.4 Which arms are asserted — a scope reduction

**FACT (§1.3, line 50):** the evaluator asserts only `kind === 'variant'`. Option D **keeps that
rule**. The baseline is executed and recorded but not asserted, exactly as today.

**Consequence, and it shrinks the work:** the two-directional raw-versus-corrected test does not
need a new arm kind or any control-arm change. Raw and corrected are two _variant_ arms of the same
sweep, each with its own `ArmReference` and its own pre-registered `tolerance` — which is precisely
what `expectedValues[]` provides. No `ExperimentArmKind` change.

### 2.5 Missing, absent or malformed references — never PASS

`HypothesisAssessment` has no `BLOCKED` or `VERIFY_REQUIRED` member (§1.1). Adding one would ripple
through the UI and every persisted pack. **Minimal design:** keep the enum unchanged, use
`INCONCLUSIVE` — which is not a pass — and carry precision in a new required per-arm field.

```
ExperimentArmEvidence += {
  reference?:      ArmReference
  residual?:       number
  referenceStatus: 'COMPARED' | 'VERIFY_REQUIRED' | 'BLOCKED' | 'NOT_ASSERTED'
}
```

| Condition                                                                            | `referenceStatus` | Protocol assessment          |
| ------------------------------------------------------------------------------------ | ----------------- | ---------------------------- |
| Reference resolved, units agree, arm completed                                       | `COMPARED`        | pass or fail on the residual |
| No `ArmReference` matches an asserted arm's `armKey`                                 | `VERIFY_REQUIRED` | `INCONCLUSIVE`               |
| `licenceStatus: 'VERIFY_REQUIRED'`, or `rawPayloadSha256` absent or not 64 hex chars | `VERIFY_REQUIRED` | `INCONCLUSIVE`               |
| Reference unit ≠ arm metric unit                                                     | `BLOCKED`         | `INCONCLUSIVE`               |
| `tolerance` absent, ≤ 0 or not finite; `referenceValue` not finite                   | `BLOCKED`         | `INCONCLUSIVE`               |
| Duplicate `armKey`, or an `armKey` matching no arm                                   | `BLOCKED`         | `INCONCLUSIVE`               |
| Arm is baseline or a control                                                         | `NOT_ASSERTED`    | ignored, as today            |

**Invariant to be pinned by test: no combination of missing, malformed or unlicensed reference can
produce `SUPPORTED_WITHIN_PROTOCOL`.**

## 3. `atom-bohr` output contract

Three distinct observables with separate provenance. The correction is **never** folded into an
existing value.

| Observable                        | Output key                                            | Unit | Formula                                                    | Version field                     |
| --------------------------------- | ----------------------------------------------------- | ---- | ---------------------------------------------------------- | --------------------------------- |
| Raw ionization energy             | `ionizationPhotonEV` _(existing, unchanged in value)_ | eV   | `RYDBERG_EV · Z²/n²`                                       | `modelVersion`                    |
| Raw transition wavelength         | `transitionWavelengthNm` _(new)_                      | nm   | `hc / (E(n_lower) − E(n_upper))`, both from the same graph | `modelVersion`                    |
| Reduced-mass corrected wavelength | `transitionWavelengthReducedNm` _(new, optional)_     | nm   | raw ÷ (μ/mₑ) for the declared isotope                      | **`correctionVersion`, separate** |

New input: `principalNUpper` (integer, `> principalN`, bounded like `principalN`). The existing
`principalN` becomes the lower level of the transition; its meaning for `energyLevelEV` and
`orbitalRadiusPm` is unchanged.

Rules:

- The corrected value is a **separate output key**, never a silent replacement. Both appear in the
  same run so a protocol can assert either.
- `correctionVersion` is its own field in the run provenance and its own line in the Evidence Pack.
  Bumping the correction must not look like a model change, and vice versa.
- The correction requires an isotope or mass-ratio input. **That input is itself a pinned reference**
  (`ArmReference` with `sourceArtifactId`), not a hardcoded constant — otherwise the corrected arm
  reintroduces exactly the constant-readback problem this whole line of work rejected.
- If the isotope input or its pinned constant is absent, `transitionWavelengthReducedNm` is **not
  emitted**. It is never computed from a default.
- `principalNUpper ≤ principalN` is a validation rejection, not a negative wavelength.

## 4. Fingerprint and migration

### 4.1 Versions

| Stage                              | `modelVersion` | `correctionVersion` |
| ---------------------------------- | -------------- | ------------------- |
| Today                              | `1.0.0`        | —                   |
| After adding the transition output | **`1.1.0`**    | —                   |
| After adding the corrected variant | `1.1.0`        | **`1.0.0`**         |

### 4.2 Migration behaviour — a second scope reduction

Old `atom-bohr` evidence changes on two independent axes: `outputs` (new keys) and
`planFingerprint` (`modelVersion` + `parameterSchema`). Both feed `runFingerprint` (§1.4).

**Consequence:** `compareScientificEvidencePacks` returns **DRIFT** for any old pack replayed
against the new model — automatically, with **no comparator change**. A silent MATCH across model
versions is impossible by construction. This is the mechanism working as designed, not a defect.

| Case                                                              | Verdict     | Mechanism                                    |
| ----------------------------------------------------------------- | ----------- | -------------------------------------------- |
| Old pack, old model                                               | `MATCH`     | unchanged                                    |
| Old pack, new model                                               | **`DRIFT`** | `runFingerprint` differs on both axes        |
| New pack, new model, identical references                         | `MATCH`     | unchanged                                    |
| New pack, one reference value edited                              | **`DRIFT`** | criterion is in `protocolFingerprint` (§1.2) |
| New pack, one reference **artifact hash** edited, value unchanged | **`DRIFT`** | hash lives inside the criterion (§2.1)       |

Required product decision: old `atom-bohr` packs must be **re-executed**, not reinterpreted. They
should be labelled `SUPERSEDED_BY_MODEL_VERSION` in the Scientific Memory list rather than shown as
failures.

## 5. Test matrix

Specified, not implemented. Every case runs offline against pinned fixtures.

| #   | Case                                                                | Expected                                                                                                                                                   |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Two variant arms, two distinct references, both within tolerance    | `SUPPORTED_WITHIN_PROTOCOL`; each arm `COMPARED` with its **own** residual                                                                                 |
| 2   | Two arms, one outside its tolerance                                 | `FALSIFIED_WITHIN_PROTOCOL`; the failing arm identified by `armId`                                                                                         |
| 3   | Asserted arm with no matching `ArmReference`                        | `VERIFY_REQUIRED` + `INCONCLUSIVE`; **never** a pass                                                                                                       |
| 4   | Reference value changed                                             | `evidencePackId` and `protocolFingerprint` change; replay `DRIFT`                                                                                          |
| 5   | `rawPayloadSha256` changed, value unchanged                         | replay `DRIFT`                                                                                                                                             |
| 6   | `principalNUpper` changed (H-α → H-β)                               | different arm request, different `runFingerprint`, replay `DRIFT`                                                                                          |
| 7   | `tolerance` changed                                                 | `protocolFingerprint` changes → `DRIFT`; tolerance absent or ≤ 0 → `BLOCKED` + `INCONCLUSIVE`                                                              |
| 8   | Raw arm vs corrected arm, same transition                           | two distinct output keys, two distinct residuals; **no MATCH between them**; raw fails its tight tolerance, corrected passes its own — both pre-registered |
| 9   | Old pack replayed against `modelVersion 1.1.0`                      | `DRIFT`, never `MATCH`                                                                                                                                     |
| 10  | `backendRunId` volatility                                           | scientific fingerprints stable — already pinned by `evidenceReplayVolatility.test.ts`                                                                      |
| 11  | Replay performs no network access                                   | no fetch; pinned files only                                                                                                                                |
| 12  | Unit mismatch (nm vs Å)                                             | `BLOCKED` + `INCONCLUSIVE`                                                                                                                                 |
| 13  | `licenceStatus: 'VERIFY_REQUIRED'`                                  | `VERIFY_REQUIRED` + `INCONCLUSIVE`, even if the residual is tiny                                                                                           |
| 14  | Duplicate `armKey`                                                  | `BLOCKED`, rejected at design time                                                                                                                         |
| 15  | Both `expectedValue` and `expectedValues` without `referencePolicy` | planner throws; protocol cannot be pre-registered                                                                                                          |
| 16  | Existing protocols using a single `expectedValue`                   | byte-identical `evidencePackId` — **the backward-compatibility gate**                                                                                      |
| 17  | Corrected output requested without a pinned mass-ratio reference    | output not emitted; arm `VERIFY_REQUIRED`                                                                                                                  |

## 6. NIST blocker — still `REFERENCE_UNPINNED`

**No fetch was attempted in this session and no reference value was written from memory.** The
previous audit established that egress is denied: `curl` returns `(56) CONNECT tunnel failed,
response 403` for `physics.nist.gov`, `pml.nist.gov`, `tsapps.nist.gov` and `arxiv.org`, `WebFetch`
returns `EGRESS_BLOCKED`, and the agent proxy reports `connect_rejected — policy denial`. Nothing
in this environment has changed that.

Artifacts to pin, all `VERIFY_REQUIRED` until the files exist:

| Artifact                               | Source      | Identifier                                                              | Needed for                               |
| -------------------------------------- | ----------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| H I transition wavelengths, **vacuum** | NIST ASD    | SRD 78, DOI `10.18434/T4W30F`; `physics.nist.gov/cgi-bin/ASD/lines1.pl` | `referenceValue` per arm                 |
| H I ionization energy                  | NIST ASD    | same                                                                    | constant-provenance check only           |
| Rydberg constant R∞                    | NIST CODATA | `physics.nist.gov/cgi-bin/cuu/Value?ryd`                                | provenance of the hardcoded `RYDBERG_EV` |
| Electron–proton mass ratio             | NIST CODATA | `physics.nist.gov/cgi-bin/cuu/Value?mesmp`                              | the reduced-mass correction input        |
| Terms of use                           | NIST SRD    | `VERIFY_REQUIRED`                                                       | `licenceStatus`                          |

Procedure where egress exists — CI reaches the network, FACT, since the `pyscf-real` job installs
from PyPI: fetch once, keep the **raw response bytes unmodified**, `sha256sum` those bytes, and
record URL, exact query, retrieval timestamp (UTC), dataset name, version, unit, observable
definition, medium (**vacuum or air — they differ in the fourth digit**), stated uncertainty and
licence. Same contract as `docs/evidence/usgs/`.

## 7. Estimated hours (`ESTIMATE`)

| Work                                                                                        | Hours       |
| ------------------------------------------------------------------------------------------- | ----------- |
| `expectedValues[]` + `referencePolicy` + per-arm status in the criterion and evidence types | 3–5         |
| Evaluator: per-arm resolution, residual, status precedence, both call sites (16 and 108)    | 4–6         |
| `atom-bohr` transition output + `principalNUpper` + Knowledge Registry parameter            | 4–6         |
| Corrected variant with `correctionVersion` and pinned mass-ratio input                      | 3–5         |
| `modelVersion` bump + migration labelling of superseded packs                               | 2–3         |
| Test matrix (17 cases) incl. the backward-compatibility gate                                | 6–9         |
| Pin and normalize NIST artifacts (**needs egress**)                                         | 4–6         |
| Pre-registered two-directional protocol and Evidence/Replay proof                           | 3–5         |
| **Total**                                                                                   | **29–45 h** |

Production lines: **~55–75** (`ESTIMATE`), unchanged from the previous audit; §2.4 and §4.2 removed
work rather than adding it.

## 8. Risks

| Risk                                                             | Severity   | Mitigation                                                                                                   |
| ---------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| Old `atom-bohr` evidence reads as failure after the version bump | **High**   | Label `SUPERSEDED_BY_MODEL_VERSION`; decide before implementation, not after users see DRIFT                 |
| A silent single-value fallback creeps in                         | **High**   | `referencePolicy: 'per-arm-required'` is mandatory; planner rejects the ambiguous combination; test 15       |
| Corrected variant reintroduces a hardcoded constant              | **High**   | The mass ratio must be a pinned `ArmReference`; test 17                                                      |
| Tolerance tuned after seeing the residual                        | **High**   | Both tolerances are inside the criterion, hence inside `protocolFingerprint`; changing one is DRIFT (test 7) |
| Vacuum / air wavelength confusion                                | **Medium** | `medium` is a required field; mismatch is `BLOCKED` (test 12)                                                |
| Two evaluator call sites diverge (16 and 108)                    | **Medium** | Shared helper; both covered by tests 1–3                                                                     |
| Existing protocols change their `evidencePackId`                 | **Medium** | Test 16 is a hard gate — byte-identical or the change is rejected                                            |
| `principalN` semantics shift for existing outputs                | **Medium** | `energyLevelEV` and `orbitalRadiusPm` keep their current meaning; only the new keys use `principalNUpper`    |
| References never get pinned, work sits half-done                 | **Medium** | Gate 2 below blocks implementation start                                                                     |

## 9. Decision gates

1. **CTO approval of the Scientific Core contract change** — `expectedValues[]` and
   `referencePolicy` on `FalsificationCriterion`. Not started until approved.
2. **Pinned NIST artifacts exist**, with real SHA-256 and a resolved `licenceStatus`. Until then
   every reference is `REFERENCE_UNPINNED` and no benchmark may report a scientific result.
3. **Migration decision for `atom-bohr` evidence** — accept the version bump and the
   `SUPERSEDED_BY_MODEL_VERSION` label.

Gates 1 and 3 are decisions; gate 2 needs an environment with egress. None is blocked by unknowns.

## 10. Decision

# BUILD LATER — pending CTO approval, pinned NIST references, and Scientific Core contract decision

Scope is now fully specified: eight symbols across seven files, ~55–75 production lines, 29–45 h,
a bounded migration, and a 17-case test matrix whose 16th case is a hard backward-compatibility
gate. Two findings reduced the work — controls need no change because only variants are asserted
(§2.4), and the replay comparator needs no change because DRIFT across model versions is automatic
(§4.2). Nothing here is speculative, and nothing may start before the three gates in §9.
