# Genesis Molecular Engine (PROPOSED — REQUIRES REPO INTEGRATION — NOT EXECUTED BY QWEN)
Modules: GenesisMolecularSearchCore (Never-Give-Up deterministic evolutionary search over fragment genomes; State Ledger blocks re-testing visited structures; plateau-restart keeps searching until maxIterations or targetFitness), GenesisPhysicoChemicalSandbox (valence rules, molecular weight, fragment-based logP proxy, Lipinski screen, stability proxy; labels MODEL_ESTIMATE / SYNTHETIC_CANDIDATE / VALENCE_VERIFIED).
Determinism: mulberry32(seed) only; Clock injected (no Date.now); SHA-256 fingerprints via stableStringify+sha256hex for genomes, candidates and results.
Integration for Claude: place under packages/core/src/molecular-engine/; node:crypto (node runtime); wire Clock from existing sim clock; do NOT present candidates as drugs or safe compounds; do NOT feed into clinical channel or Winner Gate without real evidence; do not change prereg/thresholds.
Rollback: delete molecular-engine/ directory; no migrations, no data changes.
Note: logP/HBD/HBA/stability are documented MODEL_ESTIMATE proxies, not measured properties.
