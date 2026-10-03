# Astra integration status

Checked 2026-10-03 against `origin/main` `5f52356a`, file by file (`git diff <branch> origin/main -- <file>` and a read of each hunk the branch introduced). Old UI was not merged.

| Astra branch | Head | State |
|---|---|---|
| `astra/evidence-researchrun-roadmap` | `6701d02c` | Fully contained in main (PR #55, `7b6dd401`): `docs/astra/` |
| `astra/genesis-investor-visual-polish` | `b9a95424` | 7 files: 7 ABSORBED |
| `astra/human-explorer-visual-ceiling` | `83d36900` | 63 files: 7 ABSORBED, 2 VALUABLE (ported), 54 OBSOLETE |

## `astra/genesis-investor-visual-polish` (1 commit, 7 files)

| File | Class | Where / reason |
|---|---|---|
| `docs/ASTRA_VISUAL_POLISH.md` | ABSORBED | Identical on main (`7af1a6f2`) |
| `packages/frontend/src/__tests__/astraVisualPolish.test.ts` | ABSORBED | Identical on main |
| `scripts/astra-visual-polish-e2e.mjs` | ABSORBED | Identical on main |
| `packages/frontend/src/core/three/graphics/cameraRig.ts` | ABSORBED | Identical on main |
| `packages/frontend/src/core/three/graphics/cinematicCamera.ts` | ABSORBED | Identical on main (`cameraDampingFactor`) |
| `packages/frontend/src/core/three/humanTwinMaterials.ts` | ABSORBED | Rim light in `totalEmissiveRadiance` and `diffuseColor.a` x-ray are on main; main later added `getMaterialRimIntensity` |
| `packages/frontend/src/core/three/agentLabScene3D.ts` | ABSORBED | Frame-rate-independent `cameraEase` and reduced-motion handling are on main, extended by the Human Explorer rebuild |

## `astra/human-explorer-visual-ceiling` (2 commits, 63 files)

| File | Class | Where / reason |
|---|---|---|
| `docs/HUMAN_VISUAL_CEILING_REVIEW.md` | ABSORBED | Identical on main (`7296ae80`, recovered from unmerged branches) |
| `docs/HUMAN_INSTRUMENTS_REVIEW.md` | ABSORBED | Identical on main (`7296ae80`) |
| `packages/frontend/src/components/HumanExplorerHero.css` | ABSORBED | On main and evolved since then (`4926b1b3`, `967d16c9`) |
| `packages/frontend/src/components/HumanExplorerPanel.tsx` | ABSORBED | The hero, inspector tabs (explore/microscope/section/research), subject peek (`human-subject-target`, `human-context`) and test ids are on main. Only the hero GHOST chip `human-mode-ghost` was dropped: the rebuild (PR #33–#35, #64) keeps surface modes in the section tab |
| `packages/frontend/src/components/ScientificWorldsScreen.tsx` | ABSORBED | `subjectBounds={sim.getHumanSubjectBounds()}` is on main. The rest of the branch version is the pre-rebuild screen, superseded by PR #33–#35 and #64 |
| `packages/frontend/src/core/three/agentLabScene3D.ts` | ABSORBED | `getHumanSubjectBounds`, the `premiumHumanDetail` visibility and the `subjectOffset` framing are on main |
| `packages/frontend/src/core/three/biologyStationKit.ts` | ABSORBED | The `TECH_COMPOSITE`/`CERAMIC` microscope materials are on main |
| `scripts/human-visual-ceiling-review.mjs` | VALUABLE, ported | It was missing on main although `docs/HUMAN_VISUAL_CEILING_REVIEW.md` names it. It is a Playwright layout check: no overflow, no HUD overlap. It is ported with GHOST set through the section tab |
| `scripts/human-instruments-review.mjs` | VALUABLE, ported | It was missing on main although `docs/HUMAN_INSTRUMENTS_REVIEW.md` names it. It checks that the peek covers ≤35% of the screen and does not cover the subject, and it exercises the retained instruments. Same GHOST adaptation |
| `artifacts/human-visual-ceiling/before/*` (11 PNG + `report.json`) | OBSOLETE | Evidence of the pre-rebuild prototype. The base UI no longer exists, and the ported script regenerates captures on demand |
| `artifacts/human-visual-ceiling/after/*` (11 PNG + `report.json`) | OBSOLETE | Captures of the prototype UI, which PR #33–#35 and #64 superseded. About 9 MB of binaries add nothing that main lacks |
| `artifacts/human-visual-ceiling/instruments/*` (24 PNG + `report.json`) | OBSOLETE | Captures of the second prototype pass. The same pass can be regenerated with `scripts/human-instruments-review.mjs` against current main |
| `artifacts/human-visual-ceiling/context/*` (4 PNG + `report.json`) | OBSOLETE | Peek captures of the prototype. The same check can be regenerated with `CONTEXT_ONLY=1 node scripts/human-instruments-review.mjs` |

The two absorbed review docs still link to `artifacts/human-visual-ceiling/…`. Those links stay unresolved on purpose: the captures were rejected above, and the scripts recreate them locally. Each doc now opens with a note saying so.

The ported scripts pass `node --check` and ESLint. They were not run here because the container has no Chromium or Edge. They need `BASE_URL` (Vite) and optionally `CHROMIUM_PATH`.

## Evidence Pack spec

`RESEARCHRUN_EVIDENCE_PACK_SPEC.md` is now implemented in `packages/backend/src/researchRunEvidencePack.mjs`. That file holds the builder, the offline and anchored verifier, and `GET`/`POST …/research-runs/:runId/evidence-pack[/verify]`. The schema changes it required are listed in the spec's Implementation section.

ASTRA: FULLY INTEGRATED. Every Astra file is on main or ported, or it is rejected above with a reason. The Evidence Pack spec has an implementation.
