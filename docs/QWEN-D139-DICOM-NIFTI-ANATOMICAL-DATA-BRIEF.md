# EXTERNAL-MODEL IMPLEMENTATION BRIEF — D-139
## REAL DICOM/NIfTI MEDICAL IMAGING DATA FOR THE HUMAN BIOLOGY LAB

**Repository state this brief was written against: branch `claude/genesis-winner-gate-audit-qgf90v`.**
Every path, export, and contract quoted below was read directly from this branch. Nothing here is recalled from memory. If you (the model reading this brief) cannot verify a claim against the actual repository, say so — do not fill the gap with a plausible-sounding invention.

This brief is meant to be run in a **separate session of another model** (Qwen, GPT, or Gemini) — not inside the Claude session that wrote it. That Claude session has no direct API access to you; a human is relaying this brief and will bring your output back for review and integration. Your output will be audited before anything is merged: hashes verified, license text checked, no claim upgraded past what it actually is.

---

## §0. THE ONE RULE THAT MATTERS MOST

Every experiment currently running in this world is honestly labelled `MODEL` or `SIMULATION` — a deterministic textbook/statistical model, never dressed up as a real observation. The imaging station specifically is already wired for the day real data arrives (see §2) but has never received any. Your job is to supply the FIRST real piece: either genuine, appropriately licensed medical imaging data, or a real reader for it, or both — with paperwork that survives scrutiny.

**A deliverable that says "I could not find genuinely licensed sample data, here is the reader code only" PASSES.**
**A deliverable that invents pixel data, invents a license, or silently reuses a copyrighted dataset without checking its terms FAILS**, no matter how complete it looks.

---

## §1. THE MISSION IN ONE PARAGRAPH

The Human Biology Lab (`#/human-biology-lab`) has an Imaging Center station whose every capture today is a seeded, deterministic MODEL — no real DICOM or NIfTI file has ever been read anywhere in this codebase (verified: `grep -ri "dicom\|nifti" packages/ --include="*.ts"` returns nothing outside this brief). The imaging contract, however, was already designed with real data in mind (see the exact type below) — a `source: 'EXTERNAL_DATASET'` value exists and is even distinguished in the epistemic label, but nothing has ever populated it. Your task: (A) find a small number of genuinely public-domain or explicitly open-licensed DICOM and/or NIfTI sample files suitable for a browser-based educational anatomy viewer, and/or (B) write a real, dependency-light TypeScript parser for one of those formats, sized to actually run in this project's frontend bundle.

---

## §2. THE REAL EXISTING CONTRACT YOU ARE EXTENDING

```
REAL FILE:        packages/frontend/src/core/scientificWorlds/humanLab/types.ts
EXPORTED CONTRACT:
  export interface ImagingRequest {
    readonly subjectId: string;
    readonly mode: ImagingMode; // 'XRAY' | 'CT_RECONSTRUCTION' | 'MRI_LIKE' | 'ULTRASOUND_LIKE' | 'FLUORESCENCE'
    readonly sliceAxis: 'AXIAL' | 'CORONAL' | 'SAGITTAL';
    readonly sliceIndex: number;
    readonly source: 'MODEL' | 'EXTERNAL_DATASET' | 'USER_DATASET';
  }
  export interface ImagingFrame {
    readonly frameId: string;
    readonly request: ImagingRequest;
    readonly outputHash: string;
    readonly epistemic: EpistemicLabel; // 'MODEL' | 'RECONSTRUCTION' (see below)
    readonly diagnosticUse: 'PROHIBITED_WITHOUT_VALIDATED_DATA';
  }
CURRENT FUNCTION:  packages/frontend/src/core/scientificWorlds/humanLab/imagingCenter.ts's
                    GenesisImagingCenter.capture() ALREADY branches on `request.source`:
                      const epistemic = request.source === 'USER_DATASET' || request.source === 'EXTERNAL_DATASET'
                        ? 'RECONSTRUCTION' : 'MODEL';
                    — but this is the ONLY place `EXTERNAL_DATASET` has any effect today. It changes
                    a label, nothing else. No file is ever read; no pixel data is ever produced from
                    anything but the seeded model. `diagnosticUse` is HARD-CODED to
                    'PROHIBITED_WITHOUT_VALIDATED_DATA' regardless of source — do not change that field.
USED BY:           packages/frontend/src/core/scientificWorlds/biologyRunners.ts's 'imaging-frame'
                    experiment case (the ONLY caller of GenesisImagingCenter.capture()).
DO NOT MODIFY:     ImagingRequest/ImagingFrame's shape, `diagnosticUse`'s fixed value, or anything in
                    experimentSession.ts/agentController.ts/worldCommand.ts — those are the SAME
                    canonical WorldCommand -> ActionPlan -> AgentController -> ExperimentSession ->
                    Evidence Ledger pipeline every other domain in this project already runs through
                    (chemistry, physics, biology). A real-data imaging source plugs into this EXACT
                    seam as a new case inside the existing `createBiologyExperimentRunner` (or a
                    sibling runner composed the same way chemistry was — ask the human relaying this
                    brief for `chemistryRunners.ts` as a worked example of the pattern if you need one).
```

## §3. THE PROVENANCE DISCIPLINE THIS PROJECT ALREADY ENFORCES (read this before sourcing anything)

This project already went through exactly this exercise once, for chemistry data, and the rules that came out of it apply here unchanged:

- `SOURCE_STATUS` must say plainly whether this is: an original file from its named source, a reconstruction, or a synthetic phantom you generated. Never claim "original" for anything you did not download byte-for-byte from a named, checkable URL.
- `LIVE_VERIFICATION = NOT_PERFORMED` unless you actually re-fetched and re-hashed the file in this session (not a prior training-data memory of what a file "should" contain).
- Every file needs a SHA-256, its exact byte size, and the exact source URL you retrieved it from.
- License text must be quoted, not summarized from memory. "I believe this is public domain" is not a license determination — find and quote the actual license/rights statement from the source.
- If you cannot find genuinely open sample data, say so explicitly and stop at that boundary — do not substitute a plausible-sounding placeholder and label it as real.

## §4. WHAT TO ACTUALLY LOOK FOR

Realistic, actually-open candidate sources (verify each one's current license yourself — do not trust this list without checking):

- **NIH Visible Human Project** — US federal government work, historically public domain; verify current NLM terms before use.
- **The DICOM standard's own publicly distributed sample/test files** (used for conformance testing) — check the exact distribution terms on the file(s) you pick.
- **OSF/Zenodo-hosted open anatomical phantom datasets** explicitly marked CC0 or CC-BY.
- **Synthetic/phantom NIfTI volumes** generated by well-known open neuroimaging toolkits under an open license (e.g. software-generated test phantoms), where the LICENSE is of the generating software/data release, not of a real patient.

Never source anything from a hospital PACS export, a Kaggle mirror of clinical data without its own explicit re-share license, or any dataset whose terms you have not personally quoted.

## §5. WHAT TO BRING BACK

1. **If real sample files**: a small number (2-5) of small (each under a few MB — this must fit a frontend bundle or a lazily-fetched asset, not a multi-GB clinical volume) DICOM or NIfTI files, a `PACKAGE_MANIFEST.json` listing each file's exact source URL, SHA-256, byte size, and quoted license text, plus a `DATA_PROVENANCE.md` stating `SOURCE_STATUS`/`LIVE_VERIFICATION` per §3.
2. **A real parser**, in TypeScript, dependency-light enough for this Vite/React frontend bundle (check `packages/frontend/package.json` for what's already a dependency before adding one), that can read the format you sourced and produce real pixel/voxel data — not a stub that returns a hash of its input.
3. **A short compatibility note** explaining exactly how you'd wire this into `ImagingRequest.source: 'EXTERNAL_DATASET'` at the `GenesisImagingCenter.capture()` call site — you do not need to write that integration code yourself (the human's Claude session will do the actual integration and testing), but name the real file, the real function, and the real shape your reader's output needs to take to slot in without changing `ImagingRequest`/`ImagingFrame`'s existing shape.
4. **An explicit list of what you could NOT verify or find** — this is not a failure, it's the honest boundary this whole project has run on every time real external data was needed.

## §6. WHAT THIS BRIEF IS NOT ASKING FOR

Not a new imaging engine, not a new experiment/session/world type, not a rendering change, not a clinical claim of any kind. `diagnosticUse: 'PROHIBITED_WITHOUT_VALIDATED_DATA'` stays exactly as it is regardless of what you bring back — this is an educational/illustrative anatomy viewer, never a diagnostic tool, and nothing you produce should claim otherwise.
