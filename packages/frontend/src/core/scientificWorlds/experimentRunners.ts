import { kernelRegistry } from '@genesis/core/mythos/KernelProviderRegistry.js';
import type { BlackHoleAnalysis, CollisionBatchAnalysis, MaterialsAnalysis, SpacetimePhotonAnalysis } from '@genesis/core/mythos/KernelProviderRegistry.js';
import type { SpacetimePhotonReport } from '@genesis/core/flagship/spacetimePhoton.js';
import type { LatticeSite } from '@genesis/core/cern/MaterialsDiscoveryEngine.js';
import type { FinalParticle } from '@genesis/core/collider/QuantumColliderEngine.js';
import type { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { DEFAULT_EPIDEMIC, simulateEpidemic, type EpidemicParams, type EpidemicPoint } from '../epidemic/sir';
import { canonicalJson } from '../events/hash';
import type { ExperimentRunResult, ExperimentRunner, SessionInputs } from './experimentSession';
import { ION_PRESETS } from './ionPresets';
import { runTitrationScenario } from '../../labs/experiments/chemistry-titration';
import { getLiveDrugRun } from '../liveExperiment/liveDrugRun';
import type { LiveDrugRunState } from '../liveExperiment/drugRunState';

/**
 * SCIENTIFIC WORLDS — EXPERIMENT RUNNERS.
 *
 * The bridge from an ExperimentSession to the real engines. Every runner
 * goes through the single kernel's provider registry (D-124): the crystal
 * synthesizer is `crystal-synthesis-sim`, the collider console is
 * `collision-batch` (with `micro-blackhole-sim` for the horizon question),
 * the epidemiology desk is the repository's own SEIR RK4 integrator. The
 * engines commit their own evidence; the SEIR run is anchored here on the
 * same kernel ledger as a `model` claim. Each result carries the engine's
 * label untouched and an explicit epistemic status; a hash never promotes
 * a model to a fact.
 */

export type LabExperimentId = 'crystal-synthesis' | 'chemistry-titration' | 'collision-batch' | 'micro-blackhole' | 'seir-epidemic' | 'spacetime-photon' | 'drug-candidate-run';

export interface CrystalArtifact { readonly kind: 'crystal'; readonly sites: readonly LatticeSite[]; readonly lattice: string; readonly name: string; readonly aPm: number; }
export interface CollisionArtifact { readonly kind: 'collision'; readonly finals: readonly FinalParticle[]; readonly process: string; readonly eventId: string; readonly batchSize: number; }
export interface BlackHoleArtifact { readonly kind: 'blackhole'; readonly formed: boolean; readonly rsM: number | null; readonly temperatureK: number | null; }
export interface EpidemicArtifact { readonly kind: 'epidemic'; readonly series: readonly EpidemicPoint[]; readonly params: EpidemicParams; }
export interface SpacetimeArtifact { readonly kind: 'spacetime'; readonly report: SpacetimePhotonReport; }
export interface TitrationArtifact {
  readonly kind: 'titration'; readonly acid: string; readonly acidName: string; readonly ka: number;
  readonly vb: number; readonly ph: number; readonly veq: number; readonly pKa: number;
}
/** The drug bench: the live run's own read model, exactly as the backend pipeline persisted it. */
export interface DrugRunArtifact { readonly kind: 'drug-run'; readonly campaignId: string; readonly state: LiveDrugRunState; }
export type LabArtifact = CrystalArtifact | TitrationArtifact | CollisionArtifact | BlackHoleArtifact | EpidemicArtifact | SpacetimeArtifact;
/** Everything the lab runner can seal: the scene-drawn artifacts plus the drug bench's run state (drawn by its own layer). */
export type LabRunnerArtifact = LabArtifact | DrugRunArtifact;

const CTX = (worldId: string) => ({ kernelId: 'genesis-cyber-kernel', route: '#/scientific-worlds', operatorId: `AGENT:${worldId}` });

function num(v: unknown, fallback: number): number { return typeof v === 'number' && Number.isFinite(v) ? v : fallback; }
function str(v: unknown, fallback: string): string { return typeof v === 'string' && v.length ? v : fallback; }

/** Epidemic parameters from command inputs: multipliers act on the tabulated defaults, never on invented numbers. */
export function epidemicParamsFrom(inputs: SessionInputs): EpidemicParams {
  const base = DEFAULT_EPIDEMIC;
  const r0 = num(inputs.r0, base.r0) * num(inputs.transmissionMultiplier, 1);
  return {
    ...base,
    model: 'SEIRD',
    population: Math.max(1000, Math.round(num(inputs.population, base.population))),
    initialInfected: Math.max(1, Math.round(num(inputs.initialInfected, base.initialInfected))),
    r0: +r0.toFixed(6),
    infectiousDays: num(inputs.infectiousDays, base.infectiousDays),
    incubationDays: num(inputs.incubationDays, base.incubationDays),
    ifr: Math.min(1, Math.max(0, num(inputs.ifr, base.ifr))),
    interventionDay: Math.max(0, Math.round(num(inputs.interventionDay, base.interventionDay))),
    interventionEffect: Math.min(1, Math.max(0, num(inputs.interventionEffect, base.interventionEffect))),
  };
}

export function createLabExperimentRunner(worldId: string, ledger: EvidenceLedger): ExperimentRunner<LabRunnerArtifact> {
  return (experimentId, seed, inputs): ExperimentRunResult<LabRunnerArtifact> => {
    switch (experimentId as LabExperimentId) {
      case 'chemistry-titration': {
        // This is the same bounded charge-balance runner exposed by the canonical backend Fabric model.
        // The lab's default ends at equivalence so a bare "run titration" command produces an observable procedure.
        const acid = str(inputs.acid, 'acetic');
        const vb = num(inputs.vb, 25);
        const result = runTitrationScenario({ acid, vb });
        const record = ledger.addRecord({
          sourceUrl: `genesis://worlds/${worldId}/chemistry-titration/${seed}`,
          sourceTimestamp: null,
          claim: `Weak-acid/NaOH charge-balance scenario acid=${result.acid} vb=${result.vb}mL pH=${result.ph} Veq=${result.veq}mL`,
          claimType: 'model', confidence: 1,
          provenance: { sourceKind: 'dataset', retrievedBy: 'chemistry-titration-shared-runner', independentSourceIds: [] },
        });
        return {
          outputs: { acid: result.acid, acidName: result.acidName, ka: result.ka, vb: result.vb, ph: result.ph, veq: result.veq, pKa: result.pKa },
          evidenceHashes: [record.record.contentHash],
          epistemicStatus: 'MODEL',
          engineLabel: 'Genesis weak-acid charge-balance titration (shared frontend/backend runner)',
          steps: ['bounded weak-acid scenario', 'NaOH dose', 'charge-balance root solve with water autoionisation', 'pH and equivalence state', 'ledger commit'],
          artifact: { kind: 'titration', ...result },
        };
      }
      case 'crystal-synthesis': {
        const p = kernelRegistry.resolve('crystal-synthesis-sim');
        if (!p) throw new Error('MATERIALS_PROVIDER_NOT_REGISTERED');
        const composition = str(inputs.composition, 'NaCl');
        const ions = ION_PRESETS[composition];
        if (!ions) throw new Error(`unknown composition ${composition}`);
        const a = p.analyze(CTX(worldId), { seed, ions }) as MaterialsAnalysis;
        const c = a.crystal;
        return {
          outputs: { composition, name: c.name, lattice: c.lattice, aPm: c.aPm, densityKgM3: c.densityKgM3, bulkModulusGPa: c.bulkModulusGPa, conductivitySM: c.conductivitySM, formationEnergyEv: c.formationEnergyEv, stable: c.stable, sites: c.sites.length, structureHash: c.structureHash },
          evidenceHashes: [a.ledgerContentHash],
          epistemicStatus: 'MODEL',
          engineLabel: a.label,
          steps: ['ions:' + composition, 'lattice selection', 'cell constant', 'density/bulk modulus/conductivity estimates', 'ledger commit'],
          artifact: { kind: 'crystal', sites: c.sites, lattice: c.lattice, name: c.name, aPm: c.aPm },
        };
      }
      case 'collision-batch': {
        const p = kernelRegistry.resolve('collision-batch');
        if (!p) throw new Error('COLLISION_BATCH_PROVIDER_NOT_REGISTERED');
        const n = Math.max(1, Math.min(16, Math.round(num(inputs.batch, 4))));
        const a = p.analyze(CTX(worldId), { label: `${worldId}:${seed}`, n, startIndex: Math.round(num(inputs.startIndex, 0)), sqrtS: num(inputs.sqrtSGeV, 13000) }) as CollisionBatchAnalysis;
        const first = a.events[0];
        return {
          outputs: { events: a.events.length, seedBase: a.seedBase, firstEventId: first.eventId, firstProcess: first.process, firstHardPT: first.hardPT, tracks: a.tracks.count, sqrtSGeV: first.sqrtS },
          evidenceHashes: [a.ledgerContentHash],
          epistemicStatus: 'SIMULATION',
          engineLabel: a.label,
          steps: ['seed from label', `generate ${n} events`, 'track attributes', 'batch ledger commit'],
          artifact: { kind: 'collision', finals: first.finals, process: first.process, eventId: first.eventId, batchSize: a.events.length },
        };
      }
      case 'micro-blackhole': {
        const p = kernelRegistry.resolve('micro-blackhole-sim');
        if (!p) throw new Error('BLACKHOLE_PROVIDER_NOT_REGISTERED');
        const add = num(inputs.addThresholdTeV, NaN);
        const req = Number.isFinite(add) && add > 0 ? { seed, sqrtSGeV: num(inputs.sqrtSGeV, 13000), addThresholdTeV: add } : { seed, sqrtSGeV: num(inputs.sqrtSGeV, 13000) };
        const a = p.analyze(CTX(worldId), req) as BlackHoleAnalysis;
        const r = a.result;
        return {
          outputs: { formed: r.formed, regime: r.regime ?? 'none', reason: r.reason, rsM: r.bh?.rsM ?? 0, temperatureK: r.bh?.temperatureK ?? 0, lifetimeS: r.bh?.lifetimeS ?? 0, eventHash: r.eventHash },
          evidenceHashes: [a.ledgerContentHash],
          epistemicStatus: r.bh?.label === 'speculative' ? 'SPECULATIVE' : r.formed ? 'HYPOTHESIS' : 'MODEL',
          engineLabel: a.label,
          steps: ['threshold check (Planck / ADD)', 'Schwarzschild radius', 'Hawking temperature and lifetime', 'ledger commit'],
          artifact: { kind: 'blackhole', formed: r.formed, rsM: r.bh?.rsM ?? null, temperatureK: r.bh?.temperatureK ?? null },
        };
      }
      case 'seir-epidemic': {
        const params = epidemicParamsFrom(inputs);
        const days = Math.max(30, Math.min(400, Math.round(num(inputs.days, 180))));
        const result = simulateEpidemic(params, days, 0.25);
        const capacityMultiplier = num(inputs.hospitalCapacityMultiplier, 1);
        // Hospital pressure is a documented estimate: beds per 1000 × capacity multiplier vs. a fixed severe fraction of the infectious peak.
        const bedsPer1000 = num(inputs.bedsPer1000, 6.2);
        const severeFraction = num(inputs.severeFraction, 0.05);
        const beds = (params.population / 1000) * bedsPer1000 * capacityMultiplier;
        const peakSevere = result.peakInfected * severeFraction;
        const record = ledger.addRecord({
          sourceUrl: `genesis://worlds/${worldId}/seir/${seed}`, sourceTimestamp: null,
          claim: `SEIRD RK4 run r0=${params.r0} pop=${params.population} days=${days} peakInfected=${Math.round(result.peakInfected)} peakDay=${result.peakDay} params=${canonicalJson(params)}`,
          claimType: 'model', confidence: 1, provenance: { sourceKind: 'dataset', retrievedBy: 'seir-rk4-runner', independentSourceIds: [] },
        });
        return {
          outputs: {
            r0: params.r0, population: params.population, days, peakInfected: Math.round(result.peakInfected), peakDay: result.peakDay,
            totalInfected: Math.round(result.totalInfected), finalDead: Math.round(result.finalDead), hospitalBeds: Math.round(beds),
            peakSevere: Math.round(peakSevere), bedPressure: +(peakSevere / Math.max(1, beds)).toFixed(3), capacityMultiplier,
          },
          evidenceHashes: [record.record.contentHash],
          epistemicStatus: 'SIMULATION',
          engineLabel: 'SEIRD_RK4_MODEL',
          steps: ['parameters from tabulated defaults × command multipliers', `RK4 integration ${days} d @ 0.25 d`, 'peak/total/deaths', 'hospital pressure estimate', 'ledger commit'],
          artifact: { kind: 'epidemic', series: result.series, params },
        };
      }
      case 'spacetime-photon': {
        // D-130 flagship scenario at the observation window: photon propagation in a weak field vs. the flat baseline (MODEL; c is SI-defined).
        const p = kernelRegistry.resolve('spacetime-photon-model');
        if (!p) throw new Error('SPACETIME_PHOTON_PROVIDER_NOT_REGISTERED');
        const req = { worldId, massKg: num(inputs.massKg, 1.989e30), impactParameterM: num(inputs.impactParameterM, 6.957e8), emitterDistanceM: num(inputs.emitterDistanceM, 1.496e11), receiverDistanceM: num(inputs.receiverDistanceM, 1.496e11) };
        const a = p.analyze(CTX(worldId), req) as SpacetimePhotonAnalysis;
        const r = a.report;
        return {
          outputs: { massKg: r.inputs.massKg, impactParameterM: r.inputs.impactParameterM, schwarzschildRadiusM: r.schwarzschildRadiusM, flatTravelTimeS: r.flatTravelTimeS, shapiroDelayS: r.shapiroDelayS, curvedTravelTimeS: r.curvedTravelTimeS, deflectionArcsec: r.deflectionArcsec, curvatureProxy: r.curvatureProxy, regime: r.regime, speedOfLightMps: 299792458, reportHash: r.contentHash },
          evidenceHashes: [a.ledgerContentHash],
          epistemicStatus: 'MODEL',
          engineLabel: a.label,
          steps: ['inputs: mass, impact parameter, emitter/receiver distances (defaults: Sun, solar limb, 1 AU)', 'flat baseline: same geometry with M = 0', 'first-order Shapiro delay and Einstein deflection', 'regime check (b > 20 r_s)', 'ledger commit'],
          artifact: { kind: 'spacetime', report: r },
        };
      }
      case 'drug-candidate-run': {
        // The bench computes nothing: the backend campaign (RDKit → ADMET-AI → Vina → PySCF) already ran while the
        // agent worked the console. This seals THAT run's persisted state; replay re-reads the same state.
        const campaignId = String(inputs.campaign ?? '');
        const run = getLiveDrugRun(campaignId);
        if (!run) throw new Error(`DRUG_RUN_NOT_STARTED ${campaignId}`);
        if (run.phase === 'FAILED') throw new Error(`DRUG_RUN_FAILED ${run.error ?? ''}`.trim());
        if (run.phase !== 'DONE') throw new Error('DRUG_RUN_STILL_COMPUTING');
        const st = run.state;
        const retained = st.candidates.filter((c) => c.status === 'retained');
        const affinities = st.candidates.map((c) => c.stages.docking).filter((m) => m?.status === 'COMPUTED' || m?.status === 'PASSED').map((m) => m!.value).filter((v): v is number => v !== null);
        const gaps = st.candidates.map((c) => c.stages.quantum).filter((m) => m?.status === 'COMPUTED').map((m) => m!.value).filter((v): v is number => v !== null);
        const record = ledger.addRecord({
          sourceUrl: `genesis://worlds/${worldId}/drug-candidate-run/${campaignId}`,
          sourceTimestamp: null,
          claim: `Drug campaign ${campaignId}: ${st.candidates.length} candidates (${retained.length} retained), stop=${st.stopReason ?? 'n/a'}, state=${st.stateHash}`,
          claimType: 'model', confidence: 1,
          provenance: { sourceKind: 'dataset', retrievedBy: 'drug-bench-live-run', independentSourceIds: [] },
        });
        return {
          outputs: {
            campaignId, stateHash: st.stateHash, candidates: st.candidates.length, retained: retained.length,
            generations: st.generationsCompleted, stopReason: st.stopReason ?? 'NONE',
            ...(affinities.length ? { bestAffinityKcalMol: Math.min(...affinities) } : {}),
            ...(gaps.length ? { homoLumoGapEv: gaps[0]! } : {}),
            blockedStages: st.blocked.map((b) => b.stage).join(',') || 'NONE',
          },
          evidenceHashes: [record.record.contentHash],
          epistemicStatus: 'MODEL',
          engineLabel: 'Backend campaign pipeline: RDKit descriptors/transforms, ADMET-AI, AutoDock Vina, PySCF (MODEL_ESTIMATE)',
          steps: ['campaign generation (RDKit)', 'ADMET/toxicity estimates', 'docking (Vina)', 'quantum chemistry (PySCF)', 'persisted events → read model', 'ledger commit'],
          artifact: { kind: 'drug-run', campaignId, state: st },
        };
      }
      default:
        throw new Error(`unknown experiment ${experimentId}`);
    }
  };
}
