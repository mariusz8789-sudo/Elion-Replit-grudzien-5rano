import { describe, expect, it } from 'vitest';
import { parseScienceChatMessage } from '../core/experimentFabric/parser';
import { runExperiment } from '../core/experimentFabric/executor';

 describe('biotech Science Chat to Experiment Fabric integration', () => {
  it('returns the pinned ChEMBL evidence as knowledge-only without executing biology', () => {
    const request = parseScienceChatMessage('Znajdź naturalnego kandydata dla targetu kinaza X.');
    const run = runExperiment(request);

    expect(request).toMatchObject({ domainId: 'biotechnology', executionStatus: 'NOT_EXECUTED' });
    expect(run.intent.capability).toBe('ENGINE_NOT_AVAILABLE');
    expect(run.result.status).toBe('engine_not_available');
    expect(run.result.biologicalEvidence).toBeUndefined();
  });

  it('exposes the verified caffeine A1 record when the query matches the pinned source', () => {
    const request = parseScienceChatMessage('Znajdź naturalnych kandydatów dla targetu A1: kofeina.');
    const run = runExperiment({ ...request, parameters: { ...request.parameters, targetQuery: 'kofeina A1' } });

    expect(run.result.status).toBe('knowledge_only');
    expect(run.provenance.resultOrigin).toBe('knowledge-only');
    expect(run.result.outputs).toMatchObject({
      compoundId: 'pubchem:CID:2519',
      targetId: 'chembl:target:CHEMBL318',
      activityId: 189031,
      activityValue: '41000.0',
      activityUnits: 'nM',
    });
    expect(run.result.biologicalTarget).toMatchObject({ id: 'chembl:target:CHEMBL318', label: 'Adenosine receptor A1' });
    expect(run.result.biologicalEvidence).toMatchObject({ id: 'chembl:activity:189031', status: 'LITERATURE_SUPPORTED' });
    expect(run.result.warnings.join(' ')).toMatch(/nie z biological executora|nie ustanawia skuteczności/i);
  });

  it('does not attach the pinned record to unrelated biological queries', () => {
    const request = parseScienceChatMessage('Znajdź naturalnego kandydata dla targetu kinaza X.');
    const run = runExperiment(request);

    expect(run.result.status).toBe('engine_not_available');
    expect(run.result.biologicalTarget).toBeUndefined();
    expect(run.result.biologicalEvidence).toBeUndefined();
  });
});
