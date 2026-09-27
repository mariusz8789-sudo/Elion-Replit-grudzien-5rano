import { describe, expect, it } from 'vitest';
import { createStandaloneLabRuntime } from './standaloneDeterminism';
import { SampleLineageStore } from './sampleLineage';
import { ScientificDataAssimilation } from './scientificDataAssimilation';

describe('D-140 lineage and assimilation', () => {
  it('preserves parent lineage', () => {
    const store = new SampleLineageStore(createStandaloneLabRuntime());
    store.create({ sampleId: 'b', kind: 'BATCH', source: 'source', transformations: [], storage: 's', provenance: ['p'] });
    const child = store.create({ sampleId: 'a', kind: 'ALIQUOT', parentSampleId: 'b', source: 'b', transformations: ['split'], storage: 's', provenance: ['p'] });
    expect(child.parentSampleId).toBe('b');
  });

  it('hybrid assimilation preserves simulated and measured values', () => {
    const result = new ScientificDataAssimilation(createStandaloneLabRuntime()).assimilate('HYBRID', { value: 10, standardUncertainty: 2 }, { value: 12, standardUncertainty: 1 }, ['p']);
    expect(result.simulated?.value).toBe(10); expect(result.measured?.value).toBe(12); expect(result.assimilated.value).toBeGreaterThan(10);
  });
});
