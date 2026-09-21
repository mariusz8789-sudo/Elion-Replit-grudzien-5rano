# Genesis City Enterprise (PROPOSED — REQUIRES REPO INTEGRATION — NOT EXECUTED BY QWEN)
Modules: GenesisCityGenerator (1:1 procedural digital twin: elevation DEM, zones, population, road capacity, transport nodes, buildings; profiles DUBAI/WARSAW/CUSTOM), GenesisCrisisEngine (spatial SEIR diffusion, volume-conserving flood routing over DEM, TNT scaled-distance blast/overpressure with damage index + evacuation zones), GenesisCityMonetizer (B2G deployment keys Municipal/Defense/Insurance, seats, lease, HMAC-SHA256 immutable audit chain, tier rate limiting).
Labels: SYNTHETIC_CRISIS_MODEL / DISASTER_SCENARIO on all outputs. Never present as real forecast or real casualty prediction.
Integration for Claude: place under packages/core/src/city-enterprise/; node:crypto (node runtime); inject Clock; no Math.random/Date.now; wire renderer to CityGrid arrays; do not change Winner Gate/prereg; keep secrets out of Git.
Rollback: delete city-enterprise/ directory; no migrations, no data changes.
Commercial note: pricing tiers are PROPOSED placeholders for negotiation; not a binding price list.
