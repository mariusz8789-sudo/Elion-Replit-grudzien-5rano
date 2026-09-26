import type { EvidenceSink } from './contracts';
import type { ImagingFrame, ImagingRequest } from './types';
import { stableHash } from './hash';

export class GenesisImagingCenter {
  constructor(private readonly evidenceSink?: EvidenceSink) {}

  capture(request: ImagingRequest, logicalTime: number): ImagingFrame {
    const epistemic = request.source === 'USER_DATASET' || request.source === 'EXTERNAL_DATASET' ? 'RECONSTRUCTION' : 'MODEL';
    const outputHash = stableHash({ request, logicalTime, epistemic });
    const frame: ImagingFrame = {
      frameId: `IMG-${outputHash}`,
      request,
      outputHash,
      epistemic,
      diagnosticUse: 'PROHIBITED_WITHOUT_VALIDATED_DATA',
    };
    this.evidenceSink?.addRecord({
      sourceUrl: 'genesis://imaging-center',
      sourceTimestamp: new Date().toISOString(),
      claim: `Imaging frame ${frame.frameId} generated.`,
      claimType: 'IMAGING_EVENT',
      confidence: 1,
      provenance: { request, outputHash, epistemic },
    });
    return frame;
  }
}
