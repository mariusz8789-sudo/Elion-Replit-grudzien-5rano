# Genesis Quantum Lab (PROPOSED — REQUIRES REPO INTEGRATION — NOT EXECUTED BY QWEN)
Modules: GenesisSpacetimePortalEngine (5D RK4 geodesic solver, Kerr horizon, warp factor, procedural portal geometry), GenesisQuantumSandbox (deterministic force-field + velocity-Verlet molecular dynamics, symmetric force matrix, SHA-256 fingerprint), GenesisCinematicLabView (React + Three.js composer: bloom + chromatic aberration + portal shader; Flow State; precision knobs; telemetry).
Imports: 'three' and 'three/addons/...' from repo package.json (no CDN/importmap); alias '@genesis/core/quantum-lab/...' must be wired by Claude (or switched to relative monorepo path).
Labels: RELATIVISTIC_SIMULATION / MODEL_ESTIMATE on all outputs; UI badges always visible; never present as measurement or prediction.
Integration for Claude: place core under packages/core/src/quantum-lab/, UI under packages/ui/src/quantum-lab/; run tsc -b and vitest; show diff; dispose composer render targets on unmount (done in component); pixelRatio<=2.
Rollback: delete quantum-lab directories; no migrations, no data changes, no Winner Gate changes.
