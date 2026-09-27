import type { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { kernelRegistry, type CentralDogmaAnalysis } from '@genesis/core/mythos/KernelProviderRegistry.js';
import { canonicalJson } from '../events/hash';
import type { EvidenceRecordInput, EvidenceSink } from './humanLab/contracts';
import { GenesisHyperscope } from './humanLab/hyperscope';
import { createMicroscopeCapture, VIRTUAL_MICROSCOPE_MAGNIFICATIONS } from './humanLab/virtualMicroscope';
import { OrpheusAnalyzer } from './humanLab/orpheus';
import { GenesisImagingCenter } from './humanLab/imagingCenter';
import { SpecimenRegistry } from './humanLab/specimen';
import { buildCellModel, createHistologySlide } from './humanLab/histology';
import { NEURO_REGIONS, simulateNeuralSignals } from './humanLab/neuroLab';
import { simulatePhysiology } from './humanLab/physiology';
import { evaluateBiosafety } from './humanLab/biosafety';
import { getProtocol } from './humanLab/protocols';
import type { CellModel, HistologySlide, HyperscopeCapture, HyperscopeCaptureRequest, ImagingFrame, ImagingRequest, MagnificationLevel, NeuronSignal, OrpheusRunResult, PhysiologicalState, Specimen, TissueType } from './humanLab/types';
import type { EpistemicStatus, ExperimentRunResult, ExperimentRunner, SessionInputs } from './experimentSession';

/**
 * SCIENTIFIC WORLDS — HUMAN BIOLOGY LAB RUNNERS.
 *
 * The V3 pack's instruments (Hyperscope, ORPHEUS, Imaging Center, virtual
 * histology, neuro-signal and physiology models) are deterministic models
 * that write through an EvidenceSink. Here that sink IS the kernel's
 * EvidenceLedger, every run is sealed as ONE canonical ExperimentSession
 * (content hash, replay fingerprint), and every result keeps the pack's own
 * epistemic label: SIMULATION / MODEL / RECONSTRUCTION — never an
 * observation. "Visual realism is not evidence" (pack rule) holds by
 * construction: the renderer only draws what a sealed session contains.
 *
 * Determinism note: the pack stamps `sourceTimestamp: new Date()` on sink
 * records; the ledger adapter drops the wall clock (null) so a replay of
 * the same inputs reproduces the same ledger content hash.
 */

export type BiologyExperimentId = 'physiology-state' | 'neuro-signals' | 'hyperscope-capture' | 'histology-slide' | 'imaging-frame' | 'orpheus-scan' | 'central-dogma';

export interface PhysiologyArtifact { readonly kind: 'physiology'; readonly state: PhysiologicalState; }
export interface NeuroArtifact { readonly kind: 'neuro'; readonly signals: readonly NeuronSignal[]; readonly sourceRegionId: string; }
export interface HyperscopeArtifact { readonly kind: 'hyperscope'; readonly capture: HyperscopeCapture; readonly cell: CellModel | null; }
export interface HistologyArtifact { readonly kind: 'histology'; readonly slide: HistologySlide; readonly cell: CellModel; }
export interface ImagingArtifact { readonly kind: 'imaging'; readonly frame: ImagingFrame; }
export interface OrpheusArtifact { readonly kind: 'orpheus'; readonly run: OrpheusRunResult; readonly specimen: Specimen; }
export interface CentralDogmaArtifact { readonly kind: 'central-dogma'; readonly report: CentralDogmaAnalysis['report']; }
export type BiologyArtifact = PhysiologyArtifact | NeuroArtifact | HyperscopeArtifact | HistologyArtifact | ImagingArtifact | OrpheusArtifact | CentralDogmaArtifact;

/** A short reference coding sequence (ATG … stop) used when a command names none: 12 codons of a made-up ORF, labelled as such. */
export const DEFAULT_CODING_SEQUENCE = 'ATGGCCTTAGTGAAGCACGGTACCTTCGAATGGTGA';

const TISSUES: readonly TissueType[] = ['BLOOD', 'EPITHELIUM', 'MUSCLE', 'NEURAL', 'CONNECTIVE', 'BONE', 'LIVER', 'LUNG', 'CARDIAC', 'GENERIC'];
const IMAGING_MODES: readonly ImagingRequest['mode'][] = ['XRAY', 'CT_RECONSTRUCTION', 'MRI_LIKE', 'ULTRASOUND_LIKE', 'FLUORESCENCE'];
const AXES: readonly ImagingRequest['sliceAxis'][] = ['AXIAL', 'CORONAL', 'SAGITTAL'];

function num(v: unknown, fallback: number): number { return typeof v === 'number' && Number.isFinite(v) ? v : fallback; }
function str(v: unknown, fallback: string): string { return typeof v === 'string' && v.length ? v : fallback; }
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T { return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback; }
function r(v: number, digits = 3): number { return +v.toFixed(digits); }

/** The pack's epistemic labels onto the session vocabulary (RECONSTRUCTION is a model-derived view, never an observation). */
export function sessionStatusFor(label: string): EpistemicStatus {
  switch (label) {
    case 'REAL_OBSERVATION': return 'REAL_OBSERVATION';
    case 'VERIFIED_SOURCE': return 'VERIFIED_SOURCE';
    case 'SIMULATION': return 'SIMULATION';
    case 'HYPOTHESIS': return 'HYPOTHESIS';
    case 'SPECULATIVE': return 'SPECULATIVE';
    case 'FICTION_INSPIRED': return 'FICTION_INSPIRED_SCENARIO';
    case 'NOT_MODELED': return 'NOT_MODELED';
    case 'INSUFFICIENT_EVIDENCE': return 'INSUFFICIENT_EVIDENCE';
    default: return 'MODEL';
  }
}

/** The pack's EvidenceSink, implemented by the kernel ledger; collects the content hashes it produced. */
export function createLedgerSink(ledger: EvidenceLedger, worldId: string): EvidenceSink & { readonly hashes: string[] } {
  const hashes: string[] = [];
  return {
    hashes,
    addRecord(input: EvidenceRecordInput) {
      const normalizedClaimType = input.claimType.trim().toUpperCase();
      const ledgerClaimType = normalizedClaimType === 'MEASUREMENT'
        || normalizedClaimType === 'OBSERVATION'
        || normalizedClaimType === 'REAL_OBSERVATION'
        || normalizedClaimType === 'LAB_RESULT'
        ? 'observation'
        : normalizedClaimType.includes('HYPOTHESIS')
          ? 'hypothesis'
          : 'model';
      const res = ledger.addRecord({
        sourceUrl: `${input.sourceUrl}?world=${encodeURIComponent(worldId)}`,
        sourceTimestamp: null,
        claim: `${input.claim} provenance=${canonicalJson(input.provenance)}`,
        claimType: ledgerClaimType,
        confidence: Math.min(1, Math.max(0, input.confidence)),
        provenance: { sourceKind: 'dataset', retrievedBy: `human-biology-lab:${input.claimType}`, independentSourceIds: [] },
      });
      hashes.push(res.record.contentHash);
      return { record: { id: res.record.id, contentHash: res.record.contentHash } };
    },
  };
}

function magnificationFrom(v: unknown): MagnificationLevel {
  const n = num(v, 5);
  return (VIRTUAL_MICROSCOPE_MAGNIFICATIONS.find((m) => m === n) ?? 5) as MagnificationLevel;
}

function scopeModeFor(m: MagnificationLevel, requested: unknown): HyperscopeCaptureRequest['mode'] {
  if (typeof requested === 'string' && ['OPTICAL_OBSERVATION', 'DIGITAL_ZOOM', 'RECONSTRUCTION', 'CELL_MODEL', 'SUBCELLULAR_MODEL'].includes(requested)) return requested as HyperscopeCaptureRequest['mode'];
  // No optical source is attached to this world, so no capture may call itself an observation: ≤25× is a digital zoom of the model, 100–500× a cell model, 1000× subcellular.
  if (m >= 1000) return 'SUBCELLULAR_MODEL';
  if (m >= 100) return 'CELL_MODEL';
  return 'DIGITAL_ZOOM';
}

export function createBiologyExperimentRunner(worldId: string, ledger: EvidenceLedger): ExperimentRunner<BiologyArtifact> {
  return (experimentId, seed, inputs: SessionInputs): ExperimentRunResult<BiologyArtifact> => {
    const sink = createLedgerSink(ledger, worldId);
    const tissue = oneOf(inputs.tissue, TISSUES, 'EPITHELIUM');
    const specimenOf = (): Specimen => new SpecimenRegistry(sink).create({ label: `Wirtualna próbka referencyjna (${tissue}, ziarno ${seed})`, tissueType: tissue, sourceDescription: 'Virtual reference specimen of this world; no physical material exists.', storageState: 'SIMULATED', evidenceIds: [], epistemic: 'MODEL' });
    switch (experimentId as BiologyExperimentId) {
      case 'physiology-state': {
        const state = simulatePhysiology({ seed, timeSeconds: num(inputs.timeSeconds, 0), activity: Math.min(1, Math.max(0, num(inputs.activity, 0.2))) });
        sink.addRecord({ sourceUrl: 'genesis://human-twin/physiology', claim: `Educational physiology model seed=${seed} activity=${num(inputs.activity, 0.2)} state=${canonicalJson(state)}`, claimType: 'PHYSIOLOGY_MODEL', confidence: 1, provenance: { seed, label: state.stateLabel } });
        return {
          outputs: { heartRateBpm: r(state.heartRateBpm, 1), respiratoryRatePerMin: r(state.respiratoryRatePerMin, 1), oxygenSaturationPercent: r(state.oxygenSaturationPercent, 1), systolicMmHg: Math.round(state.bloodPressureMmHg.systolic), diastolicMmHg: Math.round(state.bloodPressureMmHg.diastolic), bodyTemperatureC: r(state.bodyTemperatureC, 2), cerebralPerfusionIndex: r(state.cerebralPerfusionIndex), clinicalUse: 'NOT_A_MEDICAL_DEVICE' },
          evidenceHashes: sink.hashes, epistemicStatus: sessionStatusFor(state.stateLabel), engineLabel: 'PHYSIOLOGY_EDU_MODEL',
          steps: ['twin parameters (1:1 world scale)', 'circadian + activity terms', 'seeded variation', 'ledger commit'],
          artifact: { kind: 'physiology', state },
        };
      }
      case 'neuro-signals': {
        const sourceRegionId = NEURO_REGIONS.some((x) => x.id === inputs.region) ? String(inputs.region) : 'cortex.frontal';
        const timeMs = Math.max(0, num(inputs.timeMs, 0));
        const signals = simulateNeuralSignals(seed, timeMs, sourceRegionId);
        const meanAmp = signals.reduce((a, s) => a + s.amplitude, 0) / Math.max(1, signals.length);
        const meanLat = signals.reduce((a, s) => a + s.latencyMs, 0) / Math.max(1, signals.length);
        const strongest = [...signals].sort((a, b) => b.amplitude - a.amplitude)[0];
        sink.addRecord({ sourceUrl: 'genesis://neuro-lab/signals', claim: `Neuro signal simulation seed=${seed} t=${timeMs}ms source=${sourceRegionId} signals=${canonicalJson(signals)}`, claimType: 'NEURO_SIMULATION', confidence: 1, provenance: { seed, timeMs, sourceRegionId } });
        return {
          outputs: { sourceRegionId, signals: signals.length, meanAmplitude: r(meanAmp), meanLatencyMs: r(meanLat, 1), strongestTarget: strongest?.toRegionId ?? 'none', strongestAmplitude: r(strongest?.amplitude ?? 0) },
          evidenceHashes: sink.hashes, epistemicStatus: 'SIMULATION', engineLabel: 'NEURO_SIGNAL_MODEL',
          steps: ['source region', 'seeded signal amplitudes/latencies to 5 regions', 'ledger commit'],
          artifact: { kind: 'neuro', signals, sourceRegionId },
        };
      }
      case 'hyperscope-capture': {
        const specimen = specimenOf();
        const magnification = magnificationFrom(inputs.magnification);
        const mode = scopeModeFor(magnification, inputs.mode);
        const capture = createMicroscopeCapture(new GenesisHyperscope(sink), specimen.specimenId, magnification, mode, seed);
        const cell = magnification >= 100 || tissue === 'BLOOD' ? buildCellModel(createHistologySlide(specimen.specimenId, tissue), seed) : null;
        return {
          outputs: { captureId: capture.captureId, specimenId: specimen.specimenId, tissue, specimenKind: tissue === 'BLOOD' ? 'REFERENCE_BLOOD_SMEAR' : 'REFERENCE_TISSUE', magnification, mode, fieldOfViewUm: r(capture.request.fieldOfViewMicrometers, 2), resolutionMultiplier: r(capture.visualResolutionMultiplier, 2), instrumentLabel: capture.epistemic, sourceNote: capture.sourceNote, cellOrganelles: cell?.organelles.length ?? 0, ...(tissue === 'BLOOD' ? { modeledComponents: 'ERYTHROCYTES,LEUKOCYTE,PLATELETS', diagnosticUse: 'PROHIBITED' } : {}) },
          evidenceHashes: sink.hashes, epistemicStatus: sessionStatusFor(capture.epistemic), engineLabel: `HYPERSCOPE_${mode}`,
          steps: ['virtual specimen', `mode ${mode} at ${magnification}×`, 'capture record', tissue === 'BLOOD' ? 'reference blood-cell population model' : cell ? 'cell model at this magnification' : 'no cell model below 100×', 'ledger commit'],
          artifact: { kind: 'hyperscope', capture, cell },
        };
      }
      case 'histology-slide': {
        const specimen = specimenOf();
        const stain = oneOf(inputs.stain, ['H_AND_E', 'FLUORESCENT_SIM', 'NONE'] as const, 'H_AND_E');
        const slide = createHistologySlide(specimen.specimenId, tissue, stain);
        const cell = buildCellModel(slide, seed);
        sink.addRecord({ sourceUrl: 'genesis://histology/slide', claim: `Virtual histology slide ${slide.slideId} (${tissue}, ${stain}) cell ${cell.cellId} organelles=${cell.organelles.length}`, claimType: 'HISTOLOGY_MODEL', confidence: 1, provenance: { slide, cellId: cell.cellId, seed } });
        const nucleus = cell.organelles.find((o) => o.kind === 'NUCLEUS');
        return {
          outputs: { slideId: slide.slideId, cellId: cell.cellId, tissue, stain, preparation: slide.preparationStatus, organelles: cell.organelles.length, mitochondria: cell.organelles.filter((o) => o.kind === 'MITOCHONDRION').length, nucleusScale: r(nucleus?.scaleNormalized ?? 0), stage: str(inputs.stage, 'slide') },
          evidenceHashes: sink.hashes, epistemicStatus: sessionStatusFor(cell.epistemic), engineLabel: 'HISTOLOGY_VIRTUAL_MODEL',
          steps: ['virtual specimen', `slide ${stain}`, 'seeded cell model (organelle layout)', 'ledger commit'],
          artifact: { kind: 'histology', slide, cell },
        };
      }
      case 'imaging-frame': {
        const request: ImagingRequest = { subjectId: str(inputs.subjectId, 'human-twin'), mode: oneOf(inputs.mode, IMAGING_MODES, 'CT_RECONSTRUCTION'), sliceAxis: oneOf(inputs.sliceAxis, AXES, 'AXIAL'), sliceIndex: Math.max(0, Math.min(127, Math.round(num(inputs.sliceIndex, 64)))), source: 'MODEL' };
        const frame = new GenesisImagingCenter(sink).capture(request, seed);
        return {
          outputs: { frameId: frame.frameId, subjectId: request.subjectId, mode: request.mode, sliceAxis: request.sliceAxis, sliceIndex: request.sliceIndex, source: request.source, instrumentLabel: frame.epistemic, diagnosticUse: frame.diagnosticUse },
          evidenceHashes: sink.hashes, epistemicStatus: sessionStatusFor(frame.epistemic), engineLabel: `IMAGING_${request.mode}`,
          steps: ['subject = the twin (model)', `${request.mode} ${request.sliceAxis} slice ${request.sliceIndex}`, 'frame record', 'ledger commit'],
          artifact: { kind: 'imaging', frame },
        };
      }
      case 'orpheus-scan': {
        const specimen = specimenOf();
        const protocol = getProtocol('proto:orpheus-scan');
        const biosafety = evaluateBiosafety('MOLECULAR', protocol, ['lab-coat', 'gloves', 'eye-protection']);
        const run = new OrpheusAnalyzer(sink).run({ runId: `ORP-${worldId}-${seed}`, specimenId: specimen.specimenId, protocolId: protocol.protocolId, seed, requestedAtLogicalTime: 0 }, specimen);
        const metrics: Record<string, number> = {};
        for (const m of run.outputMetrics) metrics[m.name] = r(m.value);
        return {
          outputs: { runId: run.runId, specimenId: specimen.specimenId, protocol: protocol.protocolId, status: run.status, ...metrics, biosafety: biosafety.state, biosafetyReason: biosafety.reasons[0] ?? '', outputHash: run.outputHash },
          evidenceHashes: sink.hashes, epistemicStatus: sessionStatusFor(run.epistemic), engineLabel: 'ORPHEUS_CONCEPTUAL_SIMULATION',
          steps: ['virtual specimen registered', 'biosafety evaluation (conceptual-only protocol)', 'seeded multimodal metrics', 'ledger commit'],
          artifact: { kind: 'orpheus', run, specimen },
        };
      }
      case 'central-dogma': {
        const p = kernelRegistry.resolve('central-dogma-model');
        if (!p) throw new Error('MOLECULAR_BIOLOGY_PROVIDER_NOT_REGISTERED');
        const dna = str(inputs.dna, DEFAULT_CODING_SEQUENCE);
        const pathway = inputs.pathway === 'GLYCOLYSIS_ONLY' ? 'GLYCOLYSIS_ONLY' : 'AEROBIC_COMPLETE';
        const a = p.analyze({ kernelId: 'genesis-cyber-kernel', route: '#/human-biology-lab', operatorId: `AGENT:${worldId}` }, { worldId, dna, pathway }) as CentralDogmaAnalysis;
        const r0 = a.report;
        return {
          outputs: { dnaLength: r0.length, gc: r0.gc, mrna: r0.mrna, peptide: r0.translation.peptide, peptideLength: r0.translation.peptide.length, terminated: r0.translation.terminated, stopCodon: r0.translation.stopCodon ?? 'none', codons: r0.translation.codons.length, atpPathway: r0.atp.pathway, atpNetMin: r0.atp.atpNetMin, atpNetMax: r0.atp.atpNetMax, atpLabel: r0.atp.label, sequenceSource: typeof inputs.dna === 'string' && inputs.dna.length ? 'command' : 'default reference ORF', reportHash: r0.contentHash },
          evidenceHashes: [a.ledgerContentHash], epistemicStatus: 'MODEL', engineLabel: a.label,
          steps: ['coding strand validated', 'transcription (T→U)', 'translation from the first AUG (standard code)', `ATP budget ${pathway} (textbook range)`, 'ledger commit'],
          artifact: { kind: 'central-dogma', report: r0 },
        };
      }
      default:
        throw new Error(`unknown experiment ${experimentId}`);
    }
  };
}
