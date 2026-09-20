import type { EpistemicTone } from './worldFirst.types';

/**
 * D-133 SMART UI AUDIT FINDING: the candidate `WorldViewShell` package introduced its own
 * `EpistemicTone` (`real|dataset|model|schematic|simulated|reconstructed|hypothesis|unknown|
 * blocked`) — one more epistemic vocabulary alongside the ones Genesis already has:
 *   - `.gx-status` tones (styles.css, `WorldChrome`): `real|visual|approximation|not-modelled|blocked`
 *   - `ExplorerEvidenceMode` (humanExplorer.ts, canonical for Human Biology):
 *     `REAL_IMAGE|REAL_DATASET|RECONSTRUCTED|SIMULATED|ILLUSTRATIVE`
 *   - `ClaimType` (EvidenceLedger): `observation|reported_claim|hypothesis|model|conclusion`
 *   - `EpistemicLabel` (D-134, humanLab/epistemic.ts, canonical for every `AnatomyNode`):
 *     `REAL_OBSERVATION|VERIFIED_SOURCE|MODEL|SIMULATION|RECONSTRUCTION|HYPOTHESIS|SPECULATIVE|
 *     FICTION_INSPIRED|NOT_MODELED|INSUFFICIENT_EVIDENCE`
 *
 * None of these are duplicated here — each stays the source of truth for its own layer (the
 * ledger's claim type, the Explorer's evidence mode, an organ node's own label). This module is the
 * ONE translation point from each of them into the shell's presentation-only `EpistemicTone`, so
 * every world that adopts `WorldViewShell` reads the same nine tones instead of each screen
 * inventing its own mapping ad hoc. Adding another vocabulary anywhere else in the app is exactly
 * the mistake this file exists to prevent — map onto one of these functions instead.
 */

/** `.gx-status` tone → shell tone. Used by any world still speaking the WorldChrome vocabulary
 * (Molecule World's own selected-atom state, CERN's badges) while it adopts `WorldViewShell`. */
export function gxStatusToEpistemicTone(tone: 'real' | 'visual' | 'approximation' | 'not-modelled' | 'blocked'): EpistemicTone {
  switch (tone) {
    case 'real': return 'real';
    case 'visual': return 'schematic';
    case 'approximation': return 'model';
    case 'not-modelled': return 'unknown';
    case 'blocked': return 'blocked';
  }
}

/** Canonical Human Explorer evidence mode → shell tone. Never upgrades: RECONSTRUCTED/SIMULATED/
 * ILLUSTRATIVE stay firmly on the non-observation side of the tone set. */
export function explorerEvidenceModeToEpistemicTone(mode: 'REAL_IMAGE' | 'REAL_DATASET' | 'RECONSTRUCTED' | 'SIMULATED' | 'ILLUSTRATIVE'): EpistemicTone {
  switch (mode) {
    case 'REAL_IMAGE': return 'real';
    case 'REAL_DATASET': return 'dataset';
    case 'RECONSTRUCTED': return 'reconstructed';
    case 'SIMULATED': return 'simulated';
    case 'ILLUSTRATIVE': return 'schematic';
  }
}

/** D-134: the Human Digital Twin's own `EpistemicLabel` (`humanLab/epistemic.ts`) — the FIFTH
 * existing vocabulary this adapter reconciles, never duplicates. Never upgrades: SPECULATIVE and
 * FICTION_INSPIRED stay off the observation/dataset/model side of the tone set entirely. */
export function anatomyEpistemicLabelToEpistemicTone(
  label: 'REAL_OBSERVATION' | 'VERIFIED_SOURCE' | 'MODEL' | 'SIMULATION' | 'RECONSTRUCTION' | 'HYPOTHESIS' | 'SPECULATIVE' | 'FICTION_INSPIRED' | 'NOT_MODELED' | 'INSUFFICIENT_EVIDENCE',
): EpistemicTone {
  switch (label) {
    case 'REAL_OBSERVATION': return 'real';
    case 'VERIFIED_SOURCE': return 'dataset';
    case 'MODEL': return 'model';
    case 'SIMULATION': return 'simulated';
    case 'RECONSTRUCTION': return 'reconstructed';
    case 'HYPOTHESIS': return 'hypothesis';
    case 'SPECULATIVE': return 'hypothesis';
    case 'FICTION_INSPIRED': return 'unknown';
    case 'NOT_MODELED': return 'unknown';
    case 'INSUFFICIENT_EVIDENCE': return 'unknown';
  }
}
