import type { CellModel, HistologySlide, TissueType } from './types';
import { seededRandom, stableHash } from './hash';

export function createHistologySlide(specimenId: string, tissueType: TissueType, stain: HistologySlide['stain'] = 'H_AND_E'): HistologySlide {
  return {
    slideId: `SLIDE-${stableHash({ specimenId, tissueType, stain })}`,
    specimenId,
    tissueType,
    stain,
    preparationStatus: 'VIRTUAL',
    epistemic: 'MODEL',
  };
}

export function buildCellModel(slide: HistologySlide, seed = 1): CellModel {
  const rnd = seededRandom(seed);
  const kinds: Array<CellModel['organelles'][number]['kind']> = ['NUCLEUS', 'MITOCHONDRION', 'MITOCHONDRION', 'RIBOSOME', 'ER', 'GOLGI', 'LYSOSOME', 'MEMBRANE'];
  const organelles = kinds.map((kind, index) => ({
    id: `ORG-${stableHash({ slide: slide.slideId, kind, index })}`,
    label: kind,
    kind,
    positionNormalized: { x: rnd(), y: rnd(), z: rnd() },
    scaleNormalized: kind === 'NUCLEUS' ? 0.34 : 0.04 + rnd() * 0.08,
  }));
  return { cellId: `CELL-${stableHash({ slide: slide.slideId, seed })}`, tissueType: slide.tissueType, organelles, epistemic: 'MODEL' };
}
