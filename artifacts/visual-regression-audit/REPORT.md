# Genesis visual regression audit

HEAD: 0efeb7741f5a7d057118c755e60d6ef0a1c2002b

## b8524220 2026-09-18 08:32:12 +0000 frontend: HUD mode — the full-bleed WebGL world is the viewport, the UI floats over it as a borderless vector HUD

### changed files
```
A	packages/frontend/src/components/holo/MatrixStage.ts
```

### diff stat
```
.../frontend/src/components/holo/MatrixStage.ts    | 219 +++++++++++++++++++++
 1 file changed, 219 insertions(+)
```

## afc45479 2026-09-18 08:23:09 +0000 frontend: GENESIS 2040 screens layer — holographic engine-core hero (Three.js), procedural world previews on the Worlds hub, HUD restyle of console/lab/chat panels

### changed files
```
A	packages/frontend/src/components/holo/MatrixStage.ts
```

### diff stat
```
.../frontend/src/components/holo/MatrixStage.ts    | 219 +++++++++++++++++++++
 1 file changed, 219 insertions(+)
```

## 13eccbd4 2026-09-18 10:09:40 +0000 visual: sharp chrome figures on /matrix (metalness 0.9 / roughness 0.1, Fresnel rim contour in the shader, rim lights, near-zero emissive, bloom 0.42 @ threshold 0.78); HUD mode moved to a last-imported layer so the world shows through every dashboard panel on /

### changed files
```
M	packages/frontend/src/components/holo/MatrixStage.ts
```

### diff stat
```
.../frontend/src/components/holo/MatrixStage.ts    | 325 ++++++++-------------
 1 file changed, 114 insertions(+), 211 deletions(-)
```

## 4d99c341 2026-09-18 13:08:10 +0000 Matrix engine rework: black cyber-space with a GPU-procedural volumetric code rain, neutral mirror floor with hairline grid, black fog; /matrix figures rebuilt as cyber-armour silhouettes in dark chrome (metalness 0.95 / roughness 0.05) over matte titanium, studio-probe lighting, faint Fresnel rim, no emissive, dark pedestals with hairline edges; / runs the same engine without figures under a 100% transparent hairline HUD (portal world removed)

### changed files
```
M	packages/frontend/src/components/holo/MatrixStage.ts
```

### diff stat
```
.../frontend/src/components/holo/MatrixStage.ts    | 291 +++++----------------
 1 file changed, 59 insertions(+), 232 deletions(-)
```

## Required interpretation

- Do not infer "better" from line count. Open the owner-provided older captures and map them to the candidate commit/time.
- Check whether the current Temporal Cinematic route bypasses proven high-fidelity resolvers/assets and falls back to generic WorldFrame visuals.
- Prefer reusing existing `highFidelitySlice3D`, `buildingKit`, `materials`, `postProcessing`, `lighting`, `labKit`, `biologyStationKit`, `streetKit`, `vegetation`, `waterInfrastructure` over creating parallel systems.
- Record the first commit where the visible regression appears; then identify the exact lost/bypassed capability.
