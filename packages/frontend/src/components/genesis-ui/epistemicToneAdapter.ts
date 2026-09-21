import type { EpistemicTone } from './worldFirst.types';

/**
 * D-133 SMART UI AUDIT FINDING: the candidate `WorldViewShell` package introduced its own
 * `EpistemicTone` (`real|dataset|model|schematic|simulated|reconstructed|hypothesis|unknown|
 * blocked`) — a FOURTH epistemic vocabulary alongside the three Genesis already has:
 *   - `.gx-status` tones (styles.css, `WorldChrome`): `real|visual|approximation|not-modelled|blocked`
 *   - `ExplorerEvidenceMode` (humanExplorer.ts, canonical for Human Biology):
 *     `REAL_IMAGE|REAL_DATASET|RECONSTRUCTED|SIMULATED|ILLUSTRATIVE`
 *   - `ClaimType` (EvidenceLedger): `observation|reported_claim|hypothesis|model|conclusion`
 *
 * None of these are duplicated here — each stays the source of truth for its own layer (the
 * ledger's claim type, the Explorer's evidence mode). This module is the ONE translation point from
 * each of them into the shell's presentation-only `EpistemicTone`, so every world that adopts
 * `WorldViewShell` reads the same nine tones instead of each screen inventing its own mapping ad
 * hoc. Adding a fifth vocabulary anywhere else in the app is exactly the mistake this file exists
 * to prevent — map onto one of these two functions instead.
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
