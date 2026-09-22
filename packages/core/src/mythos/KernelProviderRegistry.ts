/* Proprietary / All Rights Reserved - Genesis OS */
import type { CicadaEngine, ProcurementEvent, CicadaAssessment } from './CicadaEngine.js';
import type { ZeroTrustSemanticEngine, Assertion, CheckResult } from '../postmythos/ZeroTrustSemanticEngine.js';
import type { ActionGateSynthesizer, GraphStateFlags, ActionSpec } from '../postmythos/ActionGateSynthesizer.js';
import type { EvidenceLedger } from '../knowledge/EvidenceLedger.js';
import { QuantumColliderEngine, type ColliderEvent } from '../collider/QuantumColliderEngine.js';
import { ThermodynamicLabEngine, type LabResult } from '../lab/ThermodynamicLabEngine.js';
import { BlackHoleEventHorizonEngine, type FormationResult } from '../cern/BlackHoleEventHorizonEngine.js';
import { MaterialsDiscoveryEngine, type CrystalStructure, type IonSpec } from '../cern/MaterialsDiscoveryEngine.js';
import { ComputeColliderEngine, type TrackAttributes } from '../cern/ComputeColliderEngine.js';
import { commitSpacetimePhoton, spacetimePhoton, type SpacetimePhotonInput, type SpacetimePhotonReport } from '../flagship/spacetimePhoton.js';
import { centralDogmaReport, commitCentralDogmaReport, commitMechanismReport, molecularMechanism, type AtpPathway, type CentralDogmaReport, type MolecularMechanismReport, type MolecularMechanismRequest } from '../knowledge/molecularBiology.js';

export interface KernelContext { readonly kernelId: string; readonly route: string; readonly operatorId: string; }
export interface AnalysisProvider {
  readonly providerId: string;
  readonly capabilities: readonly string[];
  analyze(ctx: KernelContext, request: unknown): unknown;
}
/** Single-kernel policy: exactly one orchestrator kernel may bind; Mythos modules register as analysis providers only. */
export class KernelProviderRegistry {
  private providers = new Map<string, AnalysisProvider>();
  private kernelId: string | null = null;
  bindKernel(kernelId: string): void {
    if (this.kernelId !== null && this.kernelId !== kernelId) throw new Error('KERNEL_ALREADY_BOUND:' + this.kernelId);
    this.kernelId = kernelId;
  }
  get boundKernel(): string | null { return this.kernelId; }
  register(p: AnalysisProvider): void {
    if (this.providers.has(p.providerId)) throw new Error('DUPLICATE_PROVIDER:' + p.providerId);
    this.providers.set(p.providerId, p);
  }
  unregister(providerId: string): void { this.providers.delete(providerId); }
  resolve(capability: string): AnalysisProvider | null {
    for (const p of this.providers.values()) if (p.capabilities.includes(capability)) return p;
    return null;
  }
  list(): readonly string[] { return [...this.providers.keys()]; }
  /** Read-only production introspection for Meta-Cognition; providers remain owned by this registry. */
  describe(): readonly { readonly providerId: string; readonly capabilities: readonly string[] }[] {
    return [...this.providers.values()].map((provider) => ({ providerId: provider.providerId, capabilities: [...provider.capabilities] }));
  }
}
export const kernelRegistry = new KernelProviderRegistry();

export function cicadaProvider(engine: CicadaEngine): AnalysisProvider {
  return { providerId: 'cicada-ledger', capabilities: ['supply-chain-anomaly'], analyze: (_ctx, req) => engine.evaluate(req as readonly ProcurementEvent[]) as CicadaAssessment };
}
export function ztseProvider(engine: ZeroTrustSemanticEngine): AnalysisProvider {
  return { providerId: 'ztse-verify', capabilities: ['semantic-verify'], analyze: (_ctx, req) => engine.check(req as Omit<Assertion, 'id'>) as CheckResult };
}
export function actionGateProvider(gate: ActionGateSynthesizer): AnalysisProvider {
  return { providerId: 'action-gate', capabilities: ['action-synthesis'], analyze: (_ctx, req) => gate.synthesize(req as GraphStateFlags) as readonly ActionSpec[] };
}

/** Collider request: one event of a seeded run. `sqrtS` in GeV (default 13000). */
export interface ColliderRequest { readonly seed: number; readonly index: number; readonly sqrtS?: number; }
export interface ColliderAnalysis { readonly event: ColliderEvent; readonly ledgerContentHash: string; readonly label: 'TOY_MC_MODEL'; }
/** Every generated event is anchored in the ledger through the engine's own commitToLedger(). */
export function colliderProvider(ledger: EvidenceLedger): AnalysisProvider {
  return {
    providerId: 'quantum-collider', capabilities: ['particle-collision-sim'],
    analyze: (_ctx, req) => {
      const r = req as ColliderRequest;
      const engine = new QuantumColliderEngine(r.seed >>> 0, r.sqrtS ?? 13000);
      const event = engine.generateEvent(r.index);
      const ledgerContentHash = engine.commitToLedger(ledger, event);
      const out: ColliderAnalysis = { event, ledgerContentHash, label: 'TOY_MC_MODEL' };
      return out;
    },
  };
}
/** Thermo-lab request: reagents in mol, ignition flag, initial temperature in K (default 298.15). */
export interface ThermoLabRequest { readonly seed: number; readonly reagents: Readonly<Record<string, number>>; readonly ignition: boolean; readonly T0?: number; }
export interface ThermoLabAnalysis { readonly result: LabResult; readonly ledgerContentHash: string; readonly label: 'THERMODYNAMIC_MODEL'; }
/** Every mix is anchored in the ledger through the engine's own commitToLedger(). */
export function thermoLabProvider(ledger: EvidenceLedger): AnalysisProvider {
  return {
    providerId: 'thermo-lab', capabilities: ['thermodynamic-reaction-sim'],
    analyze: (_ctx, req) => {
      const r = req as ThermoLabRequest;
      const engine = new ThermodynamicLabEngine(r.seed >>> 0);
      const result = engine.mix(r.reagents, r.ignition, r.T0 ?? 298.15);
      const ledgerContentHash = engine.commitToLedger(ledger, result);
      const out: ThermoLabAnalysis = { result, ledgerContentHash, label: 'THERMODYNAMIC_MODEL' };
      return out;
    },
  };
}
/** Micro black hole request: collision energy √s in GeV; `addThresholdTeV` opts into the SPECULATIVE ADD (extra-dimension) scenario. */
export interface BlackHoleRequest { readonly seed: number; readonly sqrtSGeV: number; readonly addThresholdTeV?: number; }
/** `label` is the engine's own epistemic label of the formed object ('hypothesis' | 'speculative') or NOT_FORMED. */
export interface BlackHoleAnalysis { readonly result: FormationResult; readonly ledgerContentHash: string; readonly label: 'hypothesis' | 'speculative' | 'NOT_FORMED'; }
/** Every formation attempt (formed or not) is anchored in the ledger through the engine's own commitToLedger(). */
export function blackHoleProvider(ledger: EvidenceLedger): AnalysisProvider {
  return {
    providerId: 'blackhole-event-horizon', capabilities: ['micro-blackhole-sim'],
    analyze: (_ctx, req) => {
      const r = req as BlackHoleRequest;
      const engine = new BlackHoleEventHorizonEngine(r.seed >>> 0);
      const result = engine.attemptFormation(r.sqrtSGeV, r.addThresholdTeV === undefined ? {} : { addThresholdTeV: r.addThresholdTeV });
      const ledgerContentHash = engine.commitToLedger(ledger, result);
      const out: BlackHoleAnalysis = { result, ledgerContentHash, label: result.bh?.label ?? 'NOT_FORMED' };
      return out;
    },
  };
}
/** Crystal synthesis request: the ionic composition (species, charge, ionic radius in pm, count per formula unit, mass in u). */
export interface MaterialsRequest { readonly seed: number; readonly ions: readonly IonSpec[]; }
export interface MaterialsAnalysis { readonly crystal: CrystalStructure; readonly ledgerContentHash: string; readonly label: 'EMPIRICAL_ESTIMATE_MODEL'; }
/** Every synthesised structure is anchored in the ledger through the engine's own commitToLedger(). Properties are documented estimates, not DFT. */
export function materialsProvider(ledger: EvidenceLedger): AnalysisProvider {
  return {
    providerId: 'materials-discovery', capabilities: ['crystal-synthesis-sim'],
    analyze: (_ctx, req) => {
      const r = req as MaterialsRequest;
      const engine = new MaterialsDiscoveryEngine(r.seed >>> 0);
      const crystal = engine.synthesize(r.ions);
      const ledgerContentHash = engine.commitToLedger(ledger, crystal);
      const out: MaterialsAnalysis = { crystal, ledgerContentHash, label: 'EMPIRICAL_ESTIMATE_MODEL' };
      return out;
    },
  };
}
/** Collision batch request: `label` derives the engine seed (sha256 of the label); `n` events from `startIndex` at √s (GeV, default 13000). */
export interface CollisionBatchRequest { readonly label: string; readonly n: number; readonly startIndex?: number; readonly sqrtS?: number; }
export interface CollisionBatchAnalysis { readonly events: readonly ColliderEvent[]; readonly tracks: TrackAttributes; readonly seedBase: number; readonly ledgerContentHash: string; readonly label: 'TOY_MC_MODEL'; }
/** The batch (all event hashes under the seed) is anchored in the ledger through the engine's own commitBatch(). */
export function computeColliderProvider(ledger: EvidenceLedger): AnalysisProvider {
  return {
    providerId: 'compute-collider', capabilities: ['collision-batch'],
    analyze: (_ctx, req) => {
      const r = req as CollisionBatchRequest;
      const engine = new ComputeColliderEngine(ledger, r.label, r.sqrtS ?? 13000);
      const events = engine.generateBatch(Math.max(1, Math.min(64, r.n | 0)), r.startIndex ?? 0);
      const ledgerContentHash = engine.commitBatch(events);
      const out: CollisionBatchAnalysis = { events, tracks: engine.buildTrackAttributes(events), seedBase: engine.getSeedBase(), ledgerContentHash, label: 'TOY_MC_MODEL' };
      return out;
    },
  };
}

// --- Molecular biology (D-128): the textbook central dogma + ATP ledger as a provider of the single kernel. ---
export interface CentralDogmaRequest { readonly worldId: string; readonly dna: string; readonly pathway?: AtpPathway; }
export interface CentralDogmaAnalysis { readonly report: CentralDogmaReport; readonly ledgerContentHash: string; readonly label: 'MOLECULAR_BIOLOGY_TEXTBOOK_MODEL'; }
export interface MolecularMechanismAnalysis { readonly report: MolecularMechanismReport; readonly ledgerContentHash: string; readonly label: 'MOLECULAR_BIOLOGY_TEXTBOOK_MODEL'; }
export function molecularBiologyProvider(ledger: EvidenceLedger): AnalysisProvider {
  return {
    providerId: 'molecular-biology', capabilities: ['central-dogma-model', 'molecular-mechanism-model'],
    analyze: (_ctx, req) => {
      // D-130: the same provider serves the mechanism layer (replication, repair, RNA processing, folding, ETC, ATP, flux) — one engine, two request shapes.
      if (req && typeof req === 'object' && 'kind' in req && 'input' in req) {
        const m = req as MolecularMechanismRequest & { readonly worldId?: string };
        const report = molecularMechanism(m);
        const ledgerContentHash = commitMechanismReport(ledger, report, m.worldId ?? 'kernel');
        return { report, ledgerContentHash, label: 'MOLECULAR_BIOLOGY_TEXTBOOK_MODEL' } satisfies MolecularMechanismAnalysis;
      }
      const r = req as CentralDogmaRequest;
      const report = centralDogmaReport(r.dna, r.pathway ?? 'AEROBIC_COMPLETE');
      const ledgerContentHash = commitCentralDogmaReport(ledger, report, r.worldId);
      return { report, ledgerContentHash, label: 'MOLECULAR_BIOLOGY_TEXTBOOK_MODEL' } satisfies CentralDogmaAnalysis;
    },
  };
}

/** D-130: photon propagation in a weak field vs. a flat baseline (the flagship physics scenario), anchored on the ledger as MODEL. */
export interface SpacetimePhotonAnalysis { readonly report: SpacetimePhotonReport; readonly ledgerContentHash: string; readonly label: 'SPACETIME_PHOTON_WEAK_FIELD_MODEL'; }
export function spacetimePhotonProvider(ledger: EvidenceLedger): AnalysisProvider {
  return {
    providerId: 'spacetime-photon', capabilities: ['spacetime-photon-model'],
    analyze: (_ctx, req) => {
      const r = req as SpacetimePhotonInput & { readonly worldId?: string };
      const report = spacetimePhoton(r);
      return { report, ledgerContentHash: commitSpacetimePhoton(ledger, report, r.worldId ?? 'kernel'), label: 'SPACETIME_PHOTON_WEAK_FIELD_MODEL' } satisfies SpacetimePhotonAnalysis;
    },
  };
}
