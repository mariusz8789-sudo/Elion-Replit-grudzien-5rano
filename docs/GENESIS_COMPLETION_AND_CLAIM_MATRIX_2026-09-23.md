# Genesis completion and claim matrix — 2026-09-23

This matrix separates executable software from evidence that must come from a physical device, laboratory, clinical study, licensed asset, or optional runtime. `PASS` means the named repository path executes and is tested. It does not mean empirical validation beyond the stated evidence.

| Area | Current canonical implementation | Software status | External requirement / honest boundary | Owner |
|---|---|---|---|---|
| World generation | `worldSpecification.ts` → `compiler.ts` → `worldGenerator.ts` → `WorldGraph` | PASS | Generated worlds are modelled/reconstructed/fictional according to their epistemic labels | Codex |
| SW-4 epidemic city | `sw4EpidemiologyCity.ts`, real `epidemic-seir-rk4`, evidence-bundle replay | PASS | A deterministic scenario is not a forecast of a real epidemic | Codex |
| Human Digital Twin state | `humanLab/anatomyAtlas.ts`, `digitalTwinRuntime.ts`, existing `physiology.ts` | PASS for generic simplified activity physiology; PARTIAL for broader biology | No patient calibration; compound, disease and treatment dynamics remain blocked without admitted models/data | Codex |
| Human external observation | `humanTwinObservation.ts` → canonical `EvidenceLedger` | PASS contract | Real calibrated device/lab input is external; no reading is fabricated | Codex |
| Segmentable anatomy | Canonical anatomy manifest, asset slots and `anatomyIntegrationShell.ts` readiness gate | SOFTWARE_READY_FOR_PREMIUM_ASSET; product shell tested | Segmentable licensed anatomy asset is external | Integrated Human Explorer |
| Mirror lifecycle | `flagship/mirrorTwin.ts`, `MirrorStatusScreen.tsx`, `browserCameraAdapter.ts` | PASS for consent/capability and synthetic lifecycle | Camera stream access is real capability evidence only; tracking and twin telemetry remain synthetic | Integrated Mirror UI |
| Mirror calibration | `mirror/cameraRegistration.ts` | PASS deterministic software harness | Real-camera calibration remains `BLOCKED_BY_PHYSICAL_HARDWARE` until measured correspondences pass tolerance | Codex contract + Claude browser adapter |
| Laboratory device boundary | `lab/devicePorts.ts`, calibration, ingest, safety interlock, HIL bridge | PASS contracts and simulated-device E2E | A production device adapter, calibration and raw payload are external | Codex |
| Lab evidence semantics | `genesisEvidencePort.ts` → `createLedgerSink` → `EvidenceLedger` | PASS: MEASUREMENT maps to observation; simulation/derived stays model | A simulator remains labelled simulated | Codex |
| Research Intake | `backend/campaign/researchIntake.mjs` and existing Drug Discovery UI/API | PASS | Unsupported target/modality/source fails closed | Existing + Codex |
| RDKit | `rdkitAdapter.mjs`, `drugAdapter.mjs`, candidate dossier | PASS on RDKit 2026.03.6 | Cheminformatics is computational evidence, never efficacy | Codex |
| Candidate dossier | `buildComputationalCandidateDossier` in `researchIntake.mjs` | PASS | Contains identity, descriptors, fingerprint, engine version, source, limitations and replay ID; no recipe/efficacy claim | Codex |
| ADMET | `admetAdapter.mjs`, multi-fidelity persistence/replay | SOFTWARE_READY; BLOCKED_BY_RUNTIME on this host | Install compatible ADMET-AI runtime; values remain model estimates | External runtime |
| Docking | `dockingAdapter.mjs`, `multiFidelity.mjs`, replay | SOFTWARE_READY; BLOCKED_BY_RUNTIME/target resource | Requires Vina/Meeko and an admitted receptor; score is not binding proof. Artifacts now carry full SHA-256 and disclose temp-vs-durable custody | External runtime/data |
| OpenMM | one `openmmRuntime.mjs` process/admission boundary, with `mdAdapter.mjs` QA and `openmmAdapter.mjs` bounded PDB cases | SOFTWARE_READY for the two bounded reference cases; runtime unavailable and no candidate parameterization seam | Requires supported OpenMM runtime plus target/topology/force-field inputs | External runtime/data + future scoped integration |
| PySCF | `qmAdapter.mjs`, campaign stage/replay, pinned requirement and prior evidence | SOFTWARE_READY; BLOCKED_BY_RUNTIME on current Python 3.14 host | Supported Python/PySCF runtime required | External runtime |
| Efficacy stages | `scientificClaimContract.ts`, backend `efficacyStatus`, canonical laboratory Evidence bridge | PASS contract | Compute cannot become clinical evidence. Replication requires independent empirical study identities | Codex |
| External laboratory ingestion | `labClosedLoop.mjs` → frozen governed request → immutable artifact hash → independent review → propose-only canonical ledger → preregistered comparison | PASS governed contract | The observation, method, source URI and raw artifact must come from a real laboratory; a proposal remains inactive until separate human publication | Integrated Lab Closed Loop |
| Evidence / provenance | One `EvidenceLedger`; backend `science_runs`; Evidence Packs | PASS; descriptor persistence now fails closed | External bytes/data custody depends on configured durable storage/source pins | Codex |
| Premium rendering | Existing Three.js renderer and staged premium detail layers | PASS software baseline; final product review pending | Premium licensed human/environment assets remain external | Existing + Claude |
| Browser/mobile/GPU | Existing Chromium harness; Human/Mirror desktop/mobile E2E authored | FOCUSED TESTS PASS; final integrated Chromium rerun pending | A fake Chromium camera proves software behavior, not physical calibration | Codex final gate |
| Production build | Existing Vite/TypeScript pipeline | PASS at last complete run; must be rerun after final integration | None | Codex final gate |

## Investor and grant claim boundary

| Claim | Allowed wording now | Prohibited wording without external proof |
|---|---|---|
| World generation | “Genesis generates structured scientific simulation worlds through one canonical WorldGraph pipeline.” | “Every generated world is a measured copy of reality.” |
| SW-4 | “Genesis executes a deterministic SEIR simulation over a generated city and reproduces it by fingerprinted replay.” | “Genesis predicts a real epidemic.” |
| Human Digital Twin | “Genesis provides a layered generic computational human model with a simplified, deterministic physiology runtime and provenance.” | “Genesis is a clinically validated or patient-specific twin.” |
| Anatomy | “Genesis has stable anatomical IDs, system hierarchy and a replaceable segmentable-asset integration path.” | “Medical-grade anatomical fidelity” until a qualified asset and validation are supplied. |
| Mirror | “Genesis has consent-gated synthetic Mirror software and a deterministic camera-registration validation protocol.” | “The physical camera is calibrated/registered” until a real device run passes. |
| Drug discovery | “Genesis resolves source-backed candidates and computationally calculates, prioritizes and falsifies research hypotheses with provenance.” | “Genesis proved a drug works”, “clinically effective”, dosing or treatment advice. |
| RDKit | “Genesis executes real RDKit canonicalization, descriptors and molecular fingerprints.” | “RDKit proves biological binding, safety or efficacy.” |
| ADMET/docking/QM/MD | “Genesis has fail-closed adapters and governed optional compute stages.” When a runtime runs, name the exact engine/version/result class. | Presenting unavailable stages as passed, or model scores as experimental measurements. |
| Laboratory | “Genesis can ingest calibrated instrument observations through a safe, provenance-bearing contract.” | “Genesis is connected to a real instrument” without a real adapter/device run. |
| Evidence | “Genesis maintains append-only, hash-chained evidence and deterministic replay where the executing subsystem supports it.” | “Every visual or simulation output is an observation.” |

## Final external blockers

- Licensed, segmentable premium anatomy and premium environment assets.
- Physical camera and calibration target for Mirror validation.
- Real laboratory/instrument adapters and measurements.
- Independent in-vitro, in-vivo and clinical observations.
- Compatible ADMET-AI, Vina/Meeko, OpenMM and PySCF runtimes plus required molecular/protein resources.

These blockers must remain visible in product UI and reports. They are not authorization to substitute synthetic success.
