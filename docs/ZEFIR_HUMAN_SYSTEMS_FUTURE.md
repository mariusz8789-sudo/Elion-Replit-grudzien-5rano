# ZEFIR Phase 3L — Human Systems Future Compatibility (ARCHITECTURE NOTE ONLY)

This is a FUTURE RESEARCH DIRECTION, not a current medical capability. No Human
Guardian System, no autonomous diagnosis, no autonomous treatment is built or
implied. Nothing here is a clinical decision system.

## How future longitudinal biological observations could enter Genesis

The generalized Evidence Store already models append-only, timestamped, provenance-
hashed observations with explicit epistemic status. Future longitudinal inputs —
biomarker time series, wearable telemetry, laboratory measurements, symptoms,
exposures — would enter through the SAME contracts WITHOUT contaminating the current
drug-discovery evidence model, by these rules:

1. **Separate mission domain.** Human-observation missions carry a distinct
   `domain` (e.g. `human-longitudinal`) so they are partitioned by `mission_id`,
   exactly as the Sandbox Lab partitions candidate evidence today. Drug-discovery
   missions never read them implicitly.
2. **Reality Bridge import contract (3K), extended.** Each observation is a
   structured record with source/lab identity, protocol, units, uncertainty,
   artifact reference + hash, and `reviewerStatus = PENDING`. A typed sentence is
   never evidence — identical to the existing experimental-import guard.
3. **Explicit epistemic status.** OBSERVED_DATA vs MODEL_ESTIMATE vs INFERRED stay
   distinct (the Bio Foundation evidence classes), so a wearable estimate can never
   be confused with a measured lab value.
4. **Provenance preserved.** `provenance.mjs` content hashing applies unchanged.

## The future loop (NOT a current capability)

SENSE → MODEL → HYPOTHESIZE → SELECT NEXT MEASUREMENT → VERIFY → MEASURE ERROR → ADAPT

This maps onto existing primitives: Evidence Store (sense), Bio Foundation (model),
Hypothesis Engine (hypothesize), next-best-experiment (select next measurement),
Verification Bridge (verify), Reality Bridge prediction-error (measure error),
Workflow Engine (adapt). It is documented here as a direction; it is deliberately
NOT wired, NOT marketed as medical, and NOT executable as diagnosis or treatment.
