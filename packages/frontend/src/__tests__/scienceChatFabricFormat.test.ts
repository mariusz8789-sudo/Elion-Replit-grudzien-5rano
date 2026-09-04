import { describe, expect, it } from 'vitest';
import { parseScienceChatMessage } from '../core/experimentFabric/parser';
import { runExperiment } from '../core/experimentFabric/executor';
import { formatFabricRun } from '../components/ScienceChat';

describe('Science Chat Fabric result formatting', () => {
  it('shows source-bound biotech target and evidence identity', () => {
    const parsed = parseScienceChatMessage('Znajdź naturalnych kandydatów dla targetu A1: kofeina.');
    const run = runExperiment({ ...parsed, parameters: { ...parsed.parameters, targetQuery: 'kofeina A1' } });
    const text = formatFabricRun(run);

    expect(text).toContain('Biotech target: Adenosine receptor A1 (chembl:target:CHEMBL318).');
    expect(text).toContain('Evidence: chembl:activity:189031.');
    expect(text).toContain('Status evidence: LITERATURE_SUPPORTED.');
    expect(text).toContain('knowledge-only');
  });

  it('does not manufacture biotech details for an unrelated run', () => {
    const run = runExperiment(parseScienceChatMessage('Oblicz promień Schwarzschilda dla 2 masy Słońca.'));
    expect(formatFabricRun(run)).not.toContain('Biotech target:');
  });
});
