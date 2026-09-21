# Genesis Supreme Modules (PROPOSED — REQUIRES REPO INTEGRATION — NOT EXECUTED BY QWEN)
Consolidates the AGI/Classified/Relativistic/Enterprise directives into one coherent package.
Files: GenesisAgisCognitiveCore.ts, ClassifiedInquiryEngine.ts, SpacetimeCurvatureEngine.ts, RelativisticRendererPipeline.ts, GenesisEnterpriseMonetizer.ts, GenesisLaboratoryView.tsx (ui), supreme-agi.test.ts, supreme-enterprise.test.ts.
Integration for Claude:
1. Place core files under packages/core/src/supreme/ and UI under packages/ui/src/supreme/. Import 'three' from repo package.json (no CDN/importmap). Import 'node:crypto' (node runtime); for browser swap to WebCrypto adapter, never inline secrets.
2. Inject Clock and TokenVerifier; wire ClassifiedInquiryEngine to the existing Cyber Bastion by injecting its verifier (do not duplicate secret handling).
3. Labels enforced: AGI_HYPOTHESIS, CLASSIFIED_SCENARIO, SPECULATIVE_HYPOTHESIS, RELATIVISTIC_SIMULATION, MODEL_ESTIMATE. Never present as clinical/measured fact; never create a Winner.
4. Monetizer: keep signing secret out of Git; rotate via sanitize(); treat telemetry chain as append-only audit.
5. Run `tsc -b` and `vitest run packages/core/src/supreme`; show diff. Do not change prereg/thresholds/Winner Gate.
Rollback: delete supreme/ directories; no migrations, no data changes.
Physics notes: Schwarzschild rs=2GM/c²; dilation sqrt(1-rs/r); Kerr r+=M+sqrt(M²-a²) (geometric units); photon geodesic via u=1/r RK4 fixed-step (deterministic); weak deflection 4GM/(c²b). All MODEL_ESTIMATE/RELATIVISTIC_SIMULATION.
