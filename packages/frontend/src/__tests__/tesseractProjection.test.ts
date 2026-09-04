import { describe, expect, it } from 'vitest';
import { runTesseractProjectionScenario } from '../labs/experiments/multiverse-tesseract';

describe('exact tesseract 4D projection runner', () => {
  it('delegates all vertices to the existing 4D rotation and 3D projection deterministically', () => {
    const input = { angleXWDeg: 45, angleYZDeg: 30, doubleRotation: true };
    const first = runTesseractProjectionScenario(input);
    const repeated = runTesseractProjectionScenario(input);

    expect(first).toEqual(repeated);
    expect(first.vertexCount).toBe(16);
    expect(first.edgeCount).toBe(32);
    expect(first.projectedVertices).toHaveLength(16);
    expect(first.maxProjectedRadius).toBeGreaterThan(0);
  });

  it('applies the YZ rotation only when the explicitly requested second rotation is enabled', () => {
    const single = runTesseractProjectionScenario({ angleXWDeg: 45, angleYZDeg: 90, doubleRotation: false });
    const double = runTesseractProjectionScenario({ angleXWDeg: 45, angleYZDeg: 90, doubleRotation: true });

    expect(double.projectedVertices).not.toEqual(single.projectedVertices);
    expect(() => runTesseractProjectionScenario({ angleXWDeg: 361 })).toThrow('angleXWDeg');
  });
});
