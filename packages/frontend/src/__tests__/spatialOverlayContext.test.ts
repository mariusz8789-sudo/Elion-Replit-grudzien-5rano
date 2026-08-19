import { afterEach, describe, expect, it } from 'vitest';
import {
  getActiveSpatialOverlay,
  setActiveSpatialOverlay,
  subscribeActiveSpatialOverlay,
} from '../core/backend/spatialOverlayContext';

describe('active spatial overlay context', () => {
  afterEach(() => setActiveSpatialOverlay(null));

  it('retains only an explicit project artifact reference and scenario calibration', () => {
    const observed: Array<ReturnType<typeof getActiveSpatialOverlay>> = [];
    const unsubscribe = subscribeActiveSpatialOverlay((overlay) => observed.push(overlay));

    setActiveSpatialOverlay({ id: 'spatial-1', projectId: 'project-1', label: 'OSM source slice' });

    expect(getActiveSpatialOverlay()).toEqual({
      projectId: 'project-1',
      datasetId: 'spatial-1',
      label: 'OSM source slice',
      calibration: 'SCENARIO_BBOX_TO_WORLD',
    });
    expect(observed.at(-1)).toEqual(getActiveSpatialOverlay());
    unsubscribe();
  });
});
