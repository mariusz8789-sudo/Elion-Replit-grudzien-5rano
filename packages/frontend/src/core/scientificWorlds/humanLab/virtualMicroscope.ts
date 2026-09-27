import type { HyperscopeCapture, HyperscopeCaptureRequest, MagnificationLevel } from './types';
import { GenesisHyperscope } from './hyperscope';

export const VIRTUAL_MICROSCOPE_MAGNIFICATIONS: readonly MagnificationLevel[] = [1, 5, 25, 100, 500, 1000];

export function createMicroscopeCapture(
  scope: GenesisHyperscope,
  specimenId: string,
  magnification: MagnificationLevel,
  mode: HyperscopeCaptureRequest['mode'],
  logicalTime: number,
): HyperscopeCapture {
  return scope.capture({
    specimenId,
    mode,
    magnification,
    fieldOfViewMicrometers: Math.max(1, 200 / magnification),
    resolutionWidthPx: 4096,
    resolutionHeightPx: 3072,
  }, logicalTime);
}

export function explainMagnification(magnification: MagnificationLevel): string {
  if (magnification === 1) return '1×: baseline field of view.';
  if (magnification === 5) return '5×: fivefold visual magnification; this does not create new physical evidence.';
  if (magnification === 25) return '25×: high visual magnification of the available specimen/model.';
  if (magnification === 100) return '100×: cellular-scale visualization where supported by the source/model.';
  if (magnification === 500) return '500×: advanced virtual microscope view; resolution depends on source data/model.';
  return '1000×: extreme virtual magnification; not a claim of optical resolution.';
}
