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
  // A mature human erythrocyte has no nucleus or mitochondria. Blood is therefore
  // rendered as a cell population by the microscope visualizer, rather than being
  // forced through the generic nucleated-cell model below.
  if (slide.tissueType === 'BLOOD') {
    return { cellId: `CELL-${stableHash({ slide: slide.slideId, seed, kind: 'ERYTHROCYTE_POPULATION' })}`, tissueType: slide.tissueType, organelles: [], epistemic: 'MODEL' };
  }
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
