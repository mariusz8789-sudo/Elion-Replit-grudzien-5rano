# Genesis Advanced Modules (PROPOSED — REQUIRES REPO INTEGRATION — NOT EXECUTED BY QWEN)
Files: VirtualHyperMicroscope.ts, MarketGapHarvester.ts, GenesisCyberBastion.ts, advanced.test.ts.
Integration for Claude:
1. Place under packages/core/src/advanced/. Import 'node:crypto' (node runtime). For browser, swap sha256/hmac for a WebCrypto adapter; do NOT inline secrets.
2. Inject Clock and FetchAdapter in tests and runtime; never call Date.now()/Math.random() in logic.
3. Labels: microscope => MODEL_ESTIMATE; gaps => UNVERIFIED_GAP until falsified; never feed UNVERIFIED_GAP or MODEL_ESTIMATE into the clinical channel or Winner Gate.
4. Bastion: keep session key out of repo/Git; rotate via sanitize(); treat LOCKED as air-gapped (writes rejected, audit append-only).
5. Run `tsc -b` and `vitest run packages/core/src/advanced`; show diff. Do not create a Winner; do not change prereg/thresholds.
Rollback: delete the advanced/ directory; no migrations, no data changes.
