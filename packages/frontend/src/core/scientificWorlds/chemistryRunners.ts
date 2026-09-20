import type { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { chemistryAdapter } from '@genesis/core/chemistry/chemistryKnowledgeAdapter.js';
import { dockLigand, type DockingResult } from '@genesis/core/chemistry/moleculeDockingEngine.js';
import { DEFAULT_RECEPTOR_ID } from '@genesis/core/chemistry/receptorVisuals.js';
import { canonicalJson } from '../events/hash';
import type { EpistemicStatus, ExperimentRunResult, ExperimentRunner, SessionInputs } from './experimentSession';
import { computePharmacokinetics, type PharmacokineticsProfile } from './pharmacokineticsAdapter';

/**
 * SCIENTIFIC WORLDS — CHEMISTRY RUNNERS.
 *
 * The canonical Genesis Chemistry v0.2.1 knowledge module (`chemistryAdapter`,
 * `@genesis/core/chemistry/chemistryKnowledgeAdapter.ts`) wired in as the
 * chemistry provider for the SAME pipeline every other domain already uses:
 * WorldCommand -> ActionPlan -> AgentController -> ExperimentSession ->
 * Observation -> Evidence Ledger. This is not a second chemistry engine, not
 * a second world, and not a second experimental session type — it is one
 * more `ExperimentRunner` (see `experimentSession.ts`), the exact same
 * plug-in point `createBiologyExperimentRunner`/`createLabExperimentRunner`
 * already implement.
 *
 * The adapter's own data is `SOURCE_DECLARED_NOT_LIVE_VERIFIED` (never a
 * live, independently verified fact): `chemistryEpistemicStatus` below maps
 * its per-record `EpistemicData` label onto the session's `EpistemicStatus`
 * vocabulary conservatively — never claiming `REAL_OBSERVATION` or
 * `VERIFIED_SOURCE`, since neither has actually happened.
 */

export const CHEMISTRY_EXPERIMENTS = [
  'chemistry-sample-identification',
  'chemistry-reaction-balance',
  'chemistry-elemental-analysis',
  'chemistry-molecular-docking',
  'chemistry-pharmacokinetics',
  'chemistry-pka-lookup',
] as const;

export type ChemistryExperimentId = typeof CHEMISTRY_EXPERIMENTS[number];

export function isChemistryExperiment(experimentId: string): experimentId is ChemistryExperimentId {
  return (CHEMISTRY_EXPERIMENTS as readonly string[]).includes(experimentId);
}

export interface SampleIdentificationArtifact {
  readonly kind: 'chemistry-sample';
  readonly formula: string;
  readonly composition: Readonly<Record<string, number>>;
  readonly charge: number;
  readonly molarMass: number;
  readonly compoundId?: string;
  readonly name?: string;
}
export interface ReactionBalanceArtifact {
  readonly kind: 'chemistry-reaction';
  readonly reactionId: string;
  readonly equation: string;
  readonly atomsOk: boolean;
  readonly chargeOk: boolean;
}
export interface ElementalAnalysisArtifact {
  readonly kind: 'chemistry-elemental';
  readonly formula: string;
  readonly composition: Readonly<Record<string, number>>;
  readonly molarMass: number;
  readonly massFractions: Readonly<Record<string, number>>;
}
export interface MolecularDockingArtifact {
  readonly kind: 'chemistry-docking';
  readonly result: DockingResult;
}
export interface PharmacokineticsArtifact {
  readonly kind: 'chemistry-pharmacokinetics';
  readonly profile: PharmacokineticsProfile;
  readonly docking: DockingResult;
}
export interface PkaLookupArtifact {
  readonly kind: 'chemistry-pka';
  readonly acidId: string;
  readonly value: number;
  readonly solvent: string;
  readonly temperatureK: number;
  readonly source: string;
}
export type ChemistryArtifact = SampleIdentificationArtifact | ReactionBalanceArtifact | ElementalAnalysisArtifact | MolecularDockingArtifact | PharmacokineticsArtifact | PkaLookupArtifact;

function str(v: unknown, fallback: string): string { return typeof v === 'string' && v.trim().length ? v.trim() : fallback; }
function num(v: unknown, fallback: number): number { return typeof v === 'number' && Number.isFinite(v) ? v : fallback; }

/** Default ligand: a real SMILES already declared on a canonical `chemistryKnowledgeAdapter` compound (sulfuric acid, `O=S(=O)(O)O`) — never a fabricated default. */
const DEFAULT_LIGAND_SMILES = 'O=S(=O)(O)O';

function ligandSmilesFrom(inputs: SessionInputs): string {
  const explicit = typeof inputs.smiles === 'string' && inputs.smiles.trim().length ? inputs.smiles.trim() : null;
  if (explicit) return explicit;
  const compoundId = typeof inputs.compoundId === 'string' ? inputs.compoundId : null;
  const compound = compoundId ? chemistryAdapter.getCompound(compoundId) : undefined;
  return compound?.smiles ?? DEFAULT_LIGAND_SMILES;
}

/** Conservative: the adapter's records are `SOURCE_DECLARED_NOT_LIVE_VERIFIED`, so nothing here is ever reported as REAL_OBSERVATION or VERIFIED_SOURCE. */
function chemistryEpistemicStatus(label: string | undefined): EpistemicStatus {
  switch (label) {
    case 'SIMULATION': return 'SIMULATION';
    case 'PREDICTED_DATA': return 'HYPOTHESIS';
    case 'REFERENCE_DATA':
    case 'DERIVED_DATA':
    case 'CALCULATED_DATA':
    case 'MODEL':
    default:
      return 'MODEL';
  }
}

const SOURCE = (worldId: string, kind: string) => `genesis://chemistry/${kind}/${worldId}`;

export function createChemistryExperimentRunner(worldId: string, ledger: EvidenceLedger): ExperimentRunner<ChemistryArtifact> {
  return (experimentId, seed, inputs: SessionInputs): ExperimentRunResult<ChemistryArtifact> => {
    switch (experimentId as ChemistryExperimentId) {
      case 'chemistry-sample-identification': {
        const requested = str(inputs.formula, 'H2O');
        const compound = chemistryAdapter.getCompound(requested);
        const formula = compound?.formula ?? requested;
        const parsed = chemistryAdapter.getFormula(formula);
        const record = ledger.addRecord({
          sourceUrl: SOURCE(worldId, 'sample-identification'), sourceTimestamp: null,
          claim: `Sample identification formula=${formula} composition=${canonicalJson(parsed.composition)} charge=${parsed.charge} molarMass=${parsed.molarMass} compound=${compound?.id ?? 'unregistered'}`,
          claimType: 'model', confidence: 1, provenance: { sourceKind: 'dataset', retrievedBy: 'genesis-chemistry-v0.2.1-adapter', independentSourceIds: [] },
        });
        return {
          outputs: {
            formula, chargeState: parsed.charge, molarMass: parsed.molarMass,
            compoundId: compound?.id ?? 'unregistered', compoundName: compound?.name ?? 'unregistered',
            category: compound?.category ?? 'unregistered', phase: compound?.phase ?? 'unregistered',
          },
          evidenceHashes: [record.record.contentHash],
          epistemicStatus: chemistryEpistemicStatus(compound?.epistemic),
          engineLabel: 'GENESIS_CHEMISTRY_V0_2_1_KNOWLEDGE_ADAPTER',
          steps: ['formula/compound lookup', 'formula parse (parseFormulaV2)', 'molar mass (molarMassOf)', 'ledger commit'],
          artifact: { kind: 'chemistry-sample', formula, composition: parsed.composition, charge: parsed.charge, molarMass: parsed.molarMass, compoundId: compound?.id, name: compound?.name },
        };
      }
      case 'chemistry-reaction-balance': {
        const reactionId = str(inputs.reactionId, 'R01');
        const reaction = chemistryAdapter.getReaction(reactionId);
        if (!reaction) throw new Error(`UNKNOWN_REACTION:${reactionId}`);
        const check = chemistryAdapter.validateReaction(reaction.reactants, reaction.products);
        const record = ledger.addRecord({
          sourceUrl: SOURCE(worldId, 'reaction-balance'), sourceTimestamp: null,
          claim: `Reaction balance ${reaction.id} equation=${reaction.equation} atomsOk=${check.atomsOk} chargeOk=${check.chargeOk} atomDiff=${canonicalJson(check.atomDiff)}`,
          claimType: 'model', confidence: 1, provenance: { sourceKind: 'dataset', retrievedBy: 'genesis-chemistry-v0.2.1-adapter', independentSourceIds: [] },
        });
        return {
          outputs: { reactionId: reaction.id, equation: reaction.equation, atomsOk: check.atomsOk, chargeOk: check.chargeOk, reversible: reaction.reversible, contextDependent: reaction.contextDependent ?? false },
          evidenceHashes: [record.record.contentHash],
          epistemicStatus: chemistryEpistemicStatus(reaction.epistemic),
          engineLabel: 'GENESIS_CHEMISTRY_V0_2_1_REACTION_BALANCE',
          steps: ['reaction lookup', 'stoichiometric atom/charge balance (balanceCheck)', 'ledger commit'],
          artifact: { kind: 'chemistry-reaction', reactionId: reaction.id, equation: reaction.equation, atomsOk: check.atomsOk, chargeOk: check.chargeOk },
        };
      }
      case 'chemistry-elemental-analysis': {
        const formula = str(inputs.formula, 'H2SO4');
        const parsed = chemistryAdapter.getFormula(formula);
        const massFractions: Record<string, number> = {};
        const fractionOutputs: Record<string, number> = {};
        for (const [symbol, count] of Object.entries(parsed.composition)) {
          const element = chemistryAdapter.getElement(symbol);
          const mass = (element?.standardAtomicWeight ?? 0) * count;
          const fraction = parsed.molarMass > 0 ? +(mass / parsed.molarMass).toFixed(4) : 0;
          massFractions[symbol] = fraction;
          fractionOutputs[`massFraction_${symbol}`] = fraction;
        }
        const record = ledger.addRecord({
          sourceUrl: SOURCE(worldId, 'elemental-analysis'), sourceTimestamp: null,
          claim: `Elemental analysis formula=${formula} composition=${canonicalJson(parsed.composition)} molarMass=${parsed.molarMass} massFractions=${canonicalJson(massFractions)}`,
          claimType: 'model', confidence: 1, provenance: { sourceKind: 'dataset', retrievedBy: 'genesis-chemistry-v0.2.1-adapter', independentSourceIds: [] },
        });
        return {
          outputs: { formula, molarMass: parsed.molarMass, elementCount: Object.keys(parsed.composition).length, ...fractionOutputs },
          evidenceHashes: [record.record.contentHash],
          epistemicStatus: 'MODEL',
          engineLabel: 'GENESIS_CHEMISTRY_V0_2_1_ELEMENTAL_ANALYSIS',
          steps: ['formula parse (parseFormulaV2)', 'molar mass (molarMassOf)', 'per-element mass fraction', 'ledger commit'],
          artifact: { kind: 'chemistry-elemental', formula, composition: parsed.composition, molarMass: parsed.molarMass, massFractions },
        };
      }
      case 'chemistry-molecular-docking': {
        const smiles = ligandSmilesFrom(inputs);
        const receptorId = str(inputs.receptorId, DEFAULT_RECEPTOR_ID);
        const result = dockLigand(smiles, receptorId);
        const record = ledger.addRecord({
          sourceUrl: SOURCE(worldId, 'molecular-docking'), sourceTimestamp: null,
          claim: `Molecular docking heuristic ligand=${smiles} receptor=${receptorId} bindingScore=${result.bindingScore} affinityProxyKcalMol=${result.affinityProxyKcalMol} contacts=${canonicalJson(result.contacts)}`,
          claimType: 'model', confidence: 1, provenance: { sourceKind: 'dataset', retrievedBy: 'genesis-chemistry-molecule-docking-engine', independentSourceIds: [] },
        });
        return {
          outputs: {
            ligandSmiles: result.ligandSmiles, receptorId: result.receptorId, receptorLabel: result.receptorLabel,
            bindingScore: result.bindingScore, affinityProxyKcalMol: result.affinityProxyKcalMol,
            electrostaticFit: result.contacts.electrostaticFit, hydrophobicFit: result.contacts.hydrophobicFit, stericFit: result.contacts.stericFit,
            heavyAtomCount: result.ligandDescriptors.heavyAtomCount, ringBondCount: result.ligandDescriptors.ringBondCount,
            hDonorCount: result.ligandDescriptors.hDonorCount, hAcceptorCount: result.ligandDescriptors.hAcceptorCount,
          },
          evidenceHashes: [record.record.contentHash],
          epistemicStatus: 'SIMULATION',
          engineLabel: 'GENESIS_CHEMISTRY_MOLECULE_DOCKING_ENGINE',
          steps: ['SMILES parse (chemistrySMILES.parseSmiles)', 'ligand descriptors (describeLigand)', 'receptor lookup (receptorVisuals)', 'electrostatic/hydrophobic/steric fit', 'binding score', 'ledger commit'],
          artifact: { kind: 'chemistry-docking', result },
        };
      }
      case 'chemistry-pharmacokinetics': {
        const smiles = ligandSmilesFrom(inputs);
        const receptorId = str(inputs.receptorId, DEFAULT_RECEPTOR_ID);
        const docking = dockLigand(smiles, receptorId);
        const profile = computePharmacokinetics({
          dockingResult: docking, seed, timeSeconds: num(inputs.timeSeconds, 0), activity: num(inputs.activity, 0.2), doseMg: num(inputs.doseMg, 100),
        });
        const record = ledger.addRecord({
          sourceUrl: SOURCE(worldId, 'pharmacokinetics'), sourceTimestamp: null,
          claim: `Pharmacokinetics one-compartment model ligand=${smiles} receptor=${receptorId} doseMg=${profile.doseMg} ka=${profile.absorptionRateKaPerHour} ke=${profile.eliminationRateKePerHour} physiology=${canonicalJson(profile.physiologyUsed)}`,
          claimType: 'model', confidence: 1, provenance: { sourceKind: 'dataset', retrievedBy: 'genesis-pharmacokinetics-adapter', independentSourceIds: [] },
        });
        return {
          outputs: {
            doseMg: profile.doseMg, absorptionRateKaPerHour: profile.absorptionRateKaPerHour, eliminationRateKePerHour: profile.eliminationRateKePerHour,
            volumeOfDistributionL: profile.volumeOfDistributionL, halfLifeHours: profile.halfLifeHours, cMaxProxyMgL: profile.cMaxProxyMgL, tMaxHoursApprox: profile.tMaxHoursApprox,
            heartRateBpmUsed: profile.physiologyUsed.heartRateBpm, bodyTemperatureCUsed: profile.physiologyUsed.bodyTemperatureC, cerebralPerfusionIndexUsed: profile.physiologyUsed.cerebralPerfusionIndex,
            dockingBindingScore: docking.bindingScore, dockingAffinityProxyKcalMol: docking.affinityProxyKcalMol,
          },
          evidenceHashes: [record.record.contentHash],
          epistemicStatus: 'SIMULATION',
          engineLabel: 'GENESIS_PHARMACOKINETICS_ONE_COMPARTMENT_MODEL',
          steps: ['molecular docking (affinity proxy)', 'physiology state (simulatePhysiology, seeded)', 'ka/ke/Vd derived from physiology + affinity', 'one-compartment concentration series', 'ledger commit'],
          artifact: { kind: 'chemistry-pharmacokinetics', profile, docking },
        };
      }
      case 'chemistry-pka-lookup': {
        const acidId = str(inputs.acidId, 'CH3COOH');
        const record = chemistryAdapter.getPka(acidId);
        if (!record) throw new Error(`UNKNOWN_PKA_RECORD:${acidId}`);
        const evidence = ledger.addRecord({
          sourceUrl: SOURCE(worldId, 'pka-lookup'), sourceTimestamp: null,
          claim: `pKa lookup ${record.id} value=${record.value} solvent=${record.solvent} temperatureK=${record.temperatureK} source=${record.source}`,
          claimType: 'model', confidence: 1, provenance: { sourceKind: 'dataset', retrievedBy: 'genesis-chemistry-v0.2.1-adapter', independentSourceIds: [] },
        });
        return {
          outputs: { acidId: record.id, pkaValue: record.value, solvent: record.solvent, temperatureK: record.temperatureK, source: record.source },
          evidenceHashes: [evidence.record.contentHash],
          epistemicStatus: 'MODEL',
          engineLabel: 'GENESIS_CHEMISTRY_V0_2_1_PKA_CONTEXT',
          steps: ['pKa record lookup (PKA_CONTEXT)', 'ledger commit'],
          artifact: { kind: 'chemistry-pka', acidId: record.id, value: record.value, solvent: record.solvent, temperatureK: record.temperatureK, source: record.source },
        };
      }
      default:
        throw new Error(`unknown experiment ${experimentId}`);
    }
  };
}
