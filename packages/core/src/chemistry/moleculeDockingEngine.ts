/* Proprietary / All Rights Reserved - Genesis OS */
import { describeLigand, parseSmiles, type LigandDescriptors } from './chemistrySMILES.js';
import { getReceptor, type BindingSiteGeometry, type ReceptorChargeProfile } from './receptorVisuals.js';
import type { EpistemicData } from './genesisChemistryTypes.js';

/**
 * GENESIS CHEMISTRY — MOLECULAR DOCKING ENGINE (D-137).
 *
 * A deterministic, closed-form docking HEURISTIC — not a physically simulated
 * docking pose and not a force-field free-energy calculation. It combines the
 * ligand's `LigandDescriptors` (from `chemistrySMILES.ts`, parsed from a real
 * SMILES string — often one already declared on a canonical
 * `chemistryKnowledgeAdapter` compound) with a receptor's real
 * `chargeProfile`, `hydrophobicity` and `bindingSiteGeometry`
 * (`receptorVisuals.ts`) into three 0..1 fit terms and one 0..100 binding
 * score. Every term is a pure function of those inputs: no `Math.random()`,
 * no `Date.now()`, no external data fetch, so the same ligand + receptor
 * always produces the identical result (proven by `replayExperimentSession`
 * at the `ExperimentSession` boundary in `chemistryRunners.ts`).
 *
 * `epistemic: 'MODEL'` here (the per-record label, `genesisChemistryTypes.ts`'s
 * `EpistemicData`); the `ExperimentSession`-level `epistemicStatus` this feeds
 * is pinned to `'SIMULATION'` by the runner — a heuristic model result, never
 * a real observation or a verified pharmacological fact.
 */

export interface DockingContacts {
  readonly electrostaticFit: number;
  readonly hydrophobicFit: number;
  readonly stericFit: number;
}

export interface DockingResult {
  readonly ligandSmiles: string;
  readonly receptorId: string;
  readonly receptorLabel: string;
  /** 0..100. */
  readonly bindingScore: number;
  /** Illustrative linear proxy of `bindingScore`, NOT a physically computed binding free energy. Negative = more favorable, matching the chemist's ΔG sign convention. */
  readonly affinityProxyKcalMol: number;
  readonly contacts: DockingContacts;
  readonly ligandDescriptors: LigandDescriptors;
  readonly receptorChargeProfile: ReceptorChargeProfile;
  readonly receptorHydrophobicity: number;
  readonly receptorBindingSiteGeometry: BindingSiteGeometry;
  readonly epistemic: EpistemicData;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

function electrostaticFit(ligand: LigandDescriptors, receptor: ReceptorChargeProfile, site: BindingSiteGeometry): number {
  const magnitudeSum = Math.abs(ligand.netCharge) + Math.abs(receptor.netCharge) + 1;
  const chargeComplementarity = 1 - Math.min(1, Math.abs(ligand.netCharge + receptor.netCharge) / magnitudeSum);
  const patchAlignment = ligand.netCharge < 0 ? receptor.positivePatchStrength : ligand.netCharge > 0 ? receptor.negativePatchStrength : (receptor.positivePatchStrength + receptor.negativePatchStrength) / 2;
  const polarGroupDensity = Math.min(1, (ligand.hDonorCount + ligand.hAcceptorCount) / Math.max(1, ligand.heavyAtomCount));
  const polarMatch = 1 - Math.abs(polarGroupDensity - site.polarity);
  return clamp01(0.4 * chargeComplementarity + 0.3 * patchAlignment + 0.3 * polarMatch);
}

function hydrophobicFit(ligand: LigandDescriptors, receptorHydrophobicity: number): number {
  const ligandHydro01 = (ligand.hydrophobicityProxy + 1) / 2;
  return clamp01(1 - Math.abs(ligandHydro01 - receptorHydrophobicity));
}

function stericFit(ligand: LigandDescriptors, site: BindingSiteGeometry): number {
  // ~40 A^3 of pocket volume per heavy atom is a coarse, deterministic packing constant (not measured) — an "ideal" ligand size for this pocket.
  const idealExtent = site.pocketVolumeA3 / 40;
  const sigma = Math.max(1, (site.pocketWidthA + site.pocketDepthA) / 4);
  const delta = ligand.molecularExtentProxy - idealExtent;
  return clamp01(Math.exp(-(delta * delta) / (2 * sigma * sigma)));
}

/** Deterministic docking heuristic: same SMILES + receptor id always yields the identical DockingResult. Throws on an unparseable SMILES or an unknown receptor id — never silently substitutes. */
export function dockLigand(smiles: string, receptorId: string): DockingResult {
  const receptor = getReceptor(receptorId);
  if (!receptor) throw new Error(`UNKNOWN_RECEPTOR:${receptorId}`);
  const molecule = parseSmiles(smiles);
  const ligand = describeLigand(molecule);

  const eFit = electrostaticFit(ligand, receptor.chargeProfile, receptor.bindingSiteGeometry);
  const hFit = hydrophobicFit(ligand, receptor.hydrophobicity);
  const sFit = stericFit(ligand, receptor.bindingSiteGeometry);
  const bindingScore = 100 * clamp01(0.4 * eFit + 0.3 * hFit + 0.3 * sFit);
  const affinityProxyKcalMol = +(-0.1 * bindingScore).toFixed(3);

  return {
    ligandSmiles: smiles,
    receptorId: receptor.id,
    receptorLabel: receptor.label,
    bindingScore: +bindingScore.toFixed(3),
    affinityProxyKcalMol,
    contacts: { electrostaticFit: +eFit.toFixed(4), hydrophobicFit: +hFit.toFixed(4), stericFit: +sFit.toFixed(4) },
    ligandDescriptors: ligand,
    receptorChargeProfile: receptor.chargeProfile,
    receptorHydrophobicity: receptor.hydrophobicity,
    receptorBindingSiteGeometry: receptor.bindingSiteGeometry,
    epistemic: 'MODEL',
  };
}
