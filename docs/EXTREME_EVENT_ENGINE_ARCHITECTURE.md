# Genesis Extreme-Event Impact Engine — Architecture Review & Common Contract

Scope of this document: a **consequence-modeling** architecture — disaster impact, risk,
resilience, safety, education, research, Digital Twin visualization. It contains **no**
weapon design, construction, targeting, delivery, or optimization content of any kind,
for any domain, and none is planned. Where a domain's physical/scientific model does not
exist in Genesis, this document says `NOT_MODELED` rather than inventing one.

Pipeline this document designs against:

```
EVENT → PHYSICAL EFFECTS → EXPOSURE → IMPACT → DAMAGE →
HUMAN/ENVIRONMENTAL CONSEQUENCES → DIGITAL TWIN PROJECTION → EVIDENCE → REPLAY
```

## 1. What already exists (and is already domain-neutral)

The Earthquake vertical slice (`core/hazard/*`) was built, from Phase 0 onward, as a
domain-neutral foundation with exactly one registered domain plugged in. Nothing in
`core/hazard/contracts.ts`, `fingerprint.ts`, `hazardEvidenceGate.ts`,
`hazardProvenanceStore.ts`, `hazardReplay.ts`, or `hazardModuleRegistry.ts` mentions
earthquakes, seismology, or ground motion. This means most of the "common framework"
this task asks for **already exists** — it does not need a parallel system, and building
one would violate this task's own instruction not to duplicate what Genesis already has.

| Pipeline stage | Existing contract | Domain-neutral? |
| --- | --- | --- |
| EVENT (captured input) | `SourceArtifact`, `HazardInput` | Yes — `hazardType: string` is the only per-domain field |
| PHYSICAL EFFECTS | `HazardRun.outputFields` (an opaque, per-domain-typed bag) | Structurally yes; see §3 for the gap |
| EXPOSURE | `ExposureSnapshot`, `ExposureSite` | Yes |
| IMPACT | `ImpactResult` | Yes |
| DAMAGE | `DamageAssessment` (added in the Earthquake Damage sprint) | Yes — already domain-neutral, not earthquake-typed |
| HUMAN/ENVIRONMENTAL CONSEQUENCES | — | **Missing**, see §3 |
| DIGITAL TWIN PROJECTION | Per-domain (`earthquakeWorldProjection.ts`) | Per-domain by design — see §5 |
| EVIDENCE | `HazardEvidencePack`-style pattern (currently one per domain: `earthquakeEvidence.ts`) | Pattern is neutral; no shared helper yet — see §3 |
| REPLAY | `replayHazardRun`, `HazardReplayStatus` | Yes |
| Registry / capability fence | `hazardModuleRegistry.ts` | Yes — already multi-domain by design (`REGISTRY: Record<hazardType, HazardModuleDescriptor>`) |
| Provenance store | `hazardProvenanceStore.ts` | Yes |
| Fingerprinting | `fingerprint.ts` (`canonicalJson` + `sha256Hex`) | Yes |
| Dataset governance | `datasetRegistry.ts` | Yes — already a dry, no-fetch metadata catalogue pattern any domain's future data source can reuse |

**Conclusion: Genesis does not need a new `ExtremeEventInput`/`ExtremeEventRun` type.**
`HazardInput`/`HazardRun` already are that type, under a name chosen before Earthquake was
the only domain. Renaming them now would touch every earthquake file for a cosmetic
reason, which both this task and the earlier operating-mode instruction (P0/P1 only, no
unnecessary churn) rule out. New domains register a second `hazardType` string and a
second `HazardModuleDescriptor` — the mechanism the registry was already built for.

## 2. Common contract, restated against real symbol names

```
SourceArtifact      (exists, contracts.ts)
HazardInput         (exists, contracts.ts)   == "ExtremeEventInput"
HazardRun           (exists, contracts.ts)   == "ExtremeEventRun"
ExposureSnapshot    (exists, contracts.ts)
ImpactResult        (exists, contracts.ts)
DamageAssessment    (exists, contracts.ts — added in the Damage sprint)
EnvironmentalImpact (MISSING — designed in §3, not implemented this round)
CascadeCandidate    (NEW — implemented this round, §4)
HazardEvidencePack  (pattern exists per-domain; no shared factory yet — §3)
HazardReplayStatus  (exists, contracts.ts)   == "ReplayVerdict": MATCH | DRIFT | BLOCKED | NOT_REPRODUCIBLE
```

Every domain module implements only its own physics/statistics
(`earthquakeModel.ts`, and a future `tsunamiModel.ts`, `wildfireModel.ts`, ...) plus a
`HazardReferenceEvaluator` and an entry in `hazardModuleRegistry.ts`. Provenance,
fingerprinting, determinism, the provenance store, the evidence-completeness pattern, and
replay stay shared — exactly as this task requires.

## 3. Gaps found (MISSING — not implemented this round)

- **`EnvironmentalImpact` contract.** `DamageAssessment` (built for Earthquake) is scoped
  to buildings/casualties/infrastructure. Soil, water, air, and ecosystem consequences are
  a distinct concern with distinct required data (contamination transport models,
  baseline ecological survey data, none of which Genesis has for any domain). A future
  contract shape:
  ```ts
  interface EnvironmentalImpact {
    readonly environmentalImpactId: string;
    readonly hazardRunId: string;
    readonly siteId: string;
    readonly medium: 'SOIL' | 'WATER' | 'AIR' | 'ECOSYSTEM';
    readonly status: 'NOT_MODELED';
    readonly notModeledReason: string;
    readonly requiredData: readonly { requirement: string; rationale: string }[];
    readonly datasetStatus: HazardDatasetStatus;
    readonly provenance: { hazardRunId: string; hazardModuleVersion: string };
  }
  ```
  Not implemented this round: no domain yet produces a physical field (contamination
  concentration, thermal load, etc.) for it to attach to, so building it now would be a
  contract with nothing real to describe — the same anti-fabrication reasoning that keeps
  `DamageAssessment.status` pinned to `'NOT_MODELED'` today.

- **Shared `HazardEvidencePack` factory.** `earthquakeEvidence.ts`'s
  `buildHazardEvidencePack` is a good pattern but is hand-written per domain. A shared
  `buildDomainEvidencePack(result, domainChecks)` helper in `core/hazard/` would remove
  duplication once a second domain exists. Deferred: writing it against one domain (still
  the case today) risks guessing the wrong shape; better to extract it when Tsunami or
  Flood actually needs it (Rule of Three).

- **`PhysicalEffect` as a first-class contract.** The pipeline diagram names a distinct
  "PHYSICAL EFFECTS" stage between the run and the exposure projection. Today that stage
  is just `HazardRun.outputFields`, typed per domain (e.g. `EarthquakeRunOutputFields`).
  Recommendation: **do not** add a new persisted contract for this. `outputFields` already
  carries exactly this data, is already fingerprinted, and is already what
  `computeImpactResults`-style functions consume. A separate `PhysicalEffect` record would
  duplicate `HazardRun` for no new capability — exactly the "parallel system" this task
  says not to build.

## 4. Implemented this round: `CascadeCandidate`

The only new contract this round adds code for — explicitly scoped, per this task, to
never resolve beyond a disclosure:

```
Event A → Potential Effect → Candidate Dependency → Evidence Required → Validation Status
```

`core/hazard/cascadeCandidate.ts` adds:

- `CascadeCandidate` / `CascadeValidationStatus` (`'NOT_MODELED' | 'BLOCKED'` — no other
  value exists in the type, matching the `DamageAssessment` pattern of making a false
  claim a type error, not a runtime discipline).
- `registerCascadeCandidate(...)` — a pure, deterministic constructor. It never computes,
  infers, or guesses a dependency's real-world likelihood; it only records that a
  hypothesis has been named, what evidence it would need, and forces `validationStatus`
  to `'NOT_MODELED'` when no evidence model is cited, or `'BLOCKED'` when one is cited but
  not yet reviewed. There is no path in this file that produces an affirmed cascade.
- The worked example from this task's own prompt is the module's own doctest-style unit
  test: `EARTHQUAKE → possible road closure → possible hospital-access change → requires
  an infrastructure model → NOT_MODELED`.

This is intentionally the entire Cascade Engine footprint for now. No traversal, no
propagation, no automatic triggering between domains — those remain explicitly out of
scope (`docs/MULTI_HAZARD_ARCHITECTURE_AUDIT.md` already deferred a full
`CascadeEdge`/`MultiHazardWorldState` for the same reason).

## 5. Implemented this round: shared honesty vocabulary

Two additive, domain-neutral enums in `contracts.ts`, for use by any *future* domain
module. Earthquake's existing `HazardDatasetStatus` / `ImpactSeverityClass` are
**unchanged** — renaming or widening a type already relied on by tested, shipped
earthquake code is exactly the kind of risky churn this task and the standing
operating-mode instruction (P0/P1 only) both rule out.

- `ExtremeEventDatasetStatus`: `'OBSERVED' | 'FORECAST' | 'SCENARIO' | 'SYNTHETIC' |
  'DERIVED' | 'NOT_MODELED' | 'NON_OPERATIONAL'` — the fuller vocabulary this task
  specifies, for a domain whose data provenance needs a distinction
  `HazardDatasetStatus` doesn't have (e.g. `'SYNTHETIC'` vs `'SCENARIO'`, or
  `'NON_OPERATIONAL'` to mark a model that must never be read as a live warning system —
  directly relevant to Tsunami and Weather, which this task explicitly forbids from ever
  being an operational warning/forecast system).
- `ExtremeEventSeverityClass`: `'NONE' | 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' |
  'CRITICAL' | 'UNKNOWN'` — the 7-value scale this task specifies. `'UNKNOWN'` exists
  specifically so a domain with an unresolved/ambiguous result is never forced to round to
  a false `'NONE'`. As the task instructs, no numeric-to-class mapping (calibration) is
  defined here for any domain — assigning meaning to these labels without a calibrated,
  reviewed source stays each domain module's own, separately-reviewed responsibility,
  exactly like `classifySeverity` in `earthquakeModel.ts` today.

Both are pure type additions (no runtime code, no behavior change), so nothing existing
was retested differently — they are exercised directly by
`extremeEventVocabulary.test.ts`, which asserts the exact literal membership of each
union (a change to either list is then a deliberate, reviewed, test-visible event, not a
silent drift).

## 6. Status per requested domain

| Domain | EXISTS | REUSABLE | MISSING | IMPLEMENTED this round | NOT_MODELED | Biggest gap | Next step |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Earthquake** | Full vertical slice: SourceArtifact→HazardInput→HazardRun→Exposure→Impact→DamageAssessment→Projection→Evidence→Replay | — (already built) | Aftershocks, infrastructure cascade, casualties (see `EARTHQUAKE_NOT_MODELED`) | — (prior sprint) | Structural damage, casualties, infrastructure cascade, evacuation guidance | Everything beyond ground-shaking severity | Stable; no further work planned until a real fragility/casualty data source exists |
| **Tectonics/Seismic** | Nothing beyond what Earthquake's `epicenter`/`depthKm` fields imply | `SourceArtifact`/`HazardInput`, fingerprinting, registry | Plate boundary data, fault/stress representation, wave-propagation abstraction | — | Everything: no plate/fault model exists | No scientific source for plate/fault geometry is in Genesis | Do not animate plates without a model — stays fully `NOT_MODELED` until a real geologic dataset is sourced and reviewed |
| **Tsunami** | Nothing | Full common contract (§2), `ExtremeEventDatasetStatus.NON_OPERATIONAL` (so it can never be mistaken for a live warning system) | Water-displacement abstraction, wave-propagation abstraction, coastal exposure, inundation abstraction | — | Everything | No source-to-displacement model | Contract-only design pass next (per priority order), no solver yet |
| **Flood** | Nothing | Full common contract | Source, extent, depth/impact abstraction | — | Everything | No water-extent/depth model | Contract-only design pass, no solver yet |
| **Wildfire** | Nothing | Full common contract | Ignition event, spread abstraction, heat/smoke exposure | — | Everything | No spread model | Contract-only design pass, no solver yet |
| **Extreme Weather** | Nothing | Full common contract | Wind/heat/precipitation/storm representation | — | Everything | No meteorological model or live feed | Contract-only design pass, no solver yet |
| **Industrial Explosion** | Nothing | Full common contract, `CascadeCandidate` (an explosion's infrastructure knock-on is exactly this task's own worked example) | Blast/thermal/debris *consequence* abstraction (never a device or yield model) | — | Everything | No consequence model; also requires the strictest scope fence in this document (no material, construction, or yield-optimization content ever) | Contract-only design pass, no solver yet — and only after Tsunami/Flood/Wildfire/Weather per the stated priority order |
| **Radiological/Nuclear (consequences only)** | Nothing | Full common contract, `ExtremeEventDatasetStatus.NON_OPERATIONAL` | Radiation-field abstraction, contamination, time-dependent dose representation, shelter scenarios | — | Everything | No dose/contamination model; requires the same strict fence (no device, detonation, or targeting content ever) | Lowest priority per the stated order; contract-only, no solver, until Tsunami/Flood/Wildfire/Weather are through contract→test→validation→evidence→replay |
| **Chemical Release** | Nothing | Full common contract | Source-location abstraction, atmospheric transport abstraction, concentration/exposure abstraction | — | Everything | No dispersion model; no substance/synthesis content permitted ever | Same ordering as Radiological |
| **Biological Hazard** | Reusable epidemic-modeling *pattern* exists in Epidemic Core, but that module is explicitly out of scope to touch or reuse directly for this engine | Full common contract | Source abstraction, transmission abstraction, healthcare-burden linkage | — | Everything | No pathogen-agnostic transmission model; no pathogen-engineering content permitted ever | Same ordering as Radiological; must stay architecturally separate from Epidemic Core per this task's exclusion list |

## 7. Hard prohibitions (restated, unchanged, binding on every future domain module)

No weapon design, construction, attack optimization, targeting, or delivery optimization.
No operational nuclear model, no chemical synthesis, no biological engineering. Permitted:
disaster modeling, consequence modeling, risk, resilience, safety, education, research,
Digital Twin visualization. Every domain module's own file header must restate its own
domain-specific fence, exactly as `earthquakeDamageAssessment.ts` already does for
structural damage.

## 8. Priority order (unchanged, restated)

Earthquake → Damage foundation: **done**. Next: Tsunami → Flood → Wildfire → Weather
(contract-only passes, no solvers). Then, only after those: Radiological → Chemical →
Biological → Industrial — each strictly gated through contract → test → validation →
evidence → replay before the next begins.

## 9. What this round did NOT do

No new solver for Tsunami, Flood, Wildfire, Weather, Radiological, Chemical, Biological,
or Industrial Explosion. No `EnvironmentalImpact` implementation (designed only, §3). No
shared evidence-pack factory (designed only, §3). No cascade traversal/propagation engine
— only the static, always-`NOT_MODELED`/`BLOCKED` candidate-recording contract this task
explicitly authorized. No change to City3D, the renderer, UI, GIS, live data, Epidemic
Core, routing, Matrix World, Collider, or the existing Earthquake vertical slice's own
behavior.
