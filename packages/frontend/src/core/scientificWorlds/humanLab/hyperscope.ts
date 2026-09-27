import type { EvidenceSink } from './contracts';
import type { HyperscopeCapture, HyperscopeCaptureRequest, MagnificationLevel, ScopeMode } from './types';
import { stableHash } from './hash';

const MODE_LABEL: Record<ScopeMode, string> = {
  OPTICAL_OBSERVATION: 'source-backed optical observation',
  DIGITAL_ZOOM: 'digital zoom of supplied data',
  RECONSTRUCTION: '3D reconstruction',
  CELL_MODEL: 'cellular model',
  SUBCELLULAR_MODEL: 'subcellular model',
};

function resolutionMultiplier(mode: ScopeMode, magnification: MagnificationLevel): number {
  if (mode === 'OPTICAL_OBSERVATION') return 1;
  if (mode === 'DIGITAL_ZOOM') return Math.min(4, 1 + magnification / 5);
  if (mode === 'RECONSTRUCTION') return 3;
  if (mode === 'CELL_MODEL') return 6;
  return 8;
}

function epistemicForMode(mode: ScopeMode): HyperscopeCapture['epistemic'] {
  if (mode === 'OPTICAL_OBSERVATION') return 'REAL_OBSERVATION';
  if (mode === 'DIGITAL_ZOOM') return 'RECONSTRUCTION';
  if (mode === 'RECONSTRUCTION') return 'RECONSTRUCTION';
  return 'MODEL';
}

export class GenesisHyperscope {
  constructor(private readonly evidenceSink?: EvidenceSink) {}

  capture(request: HyperscopeCaptureRequest, logicalTime: number): HyperscopeCapture {
    if (!request.specimenId) throw new Error('HYPERSCOPE_SPECIMEN_REQUIRED');
    if (!Number.isFinite(request.fieldOfViewMicrometers) || request.fieldOfViewMicrometers <= 0) throw new Error('HYPERSCOPE_FIELD_OF_VIEW_INVALID');
    if (request.resolutionWidthPx < 256 || request.resolutionHeightPx < 256) throw new Error('HYPERSCOPE_RESOLUTION_TOO_LOW');
    const epistemic = epistemicForMode(request.mode);
    const outputHash = stableHash({ request, logicalTime, epistemic });
    const capture: HyperscopeCapture = {
      captureId: `HSC-${outputHash}`,
      specimenId: request.specimenId,
      request,
      generatedAtLogicalTime: logicalTime,
      outputHash,
      epistemic,
      visualResolutionMultiplier: resolutionMultiplier(request.mode, request.magnification),
      sourceNote: MODE_LABEL[request.mode],
    };
    this.evidenceSink?.addRecord({
      sourceUrl: 'genesis://hyperscope',
      sourceTimestamp: new Date().toISOString(),
      claim: `Hyperscope capture ${capture.captureId} created from specimen ${request.specimenId}.`,
      claimType: 'INSTRUMENT_EVENT',
      confidence: 1,
      provenance: { request, outputHash, epistemic },
    });
    return capture;
  }
}
