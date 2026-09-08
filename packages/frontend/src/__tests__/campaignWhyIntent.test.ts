import { describe, expect, it } from 'vitest';
import { parseCampaignWhyQuestion } from '../core/discovery/campaignWhyIntent';

describe('parseCampaignWhyQuestion — each real why-kind, both languages', () => {
  it('status: why was this candidate rejected/retained', () => {
    expect(parseCampaignWhyQuestion('Why was this candidate rejected?').kind).toBe('status');
    expect(parseCampaignWhyQuestion('Why was it retained?').kind).toBe('status');
    expect(parseCampaignWhyQuestion('Dlaczego ten kandydat został odrzucony?').kind).toBe('status');
  });

  it('pareto: is this candidate pareto-optimal', () => {
    expect(parseCampaignWhyQuestion('Why is this on the pareto front?').kind).toBe('pareto');
    expect(parseCampaignWhyQuestion('Dlaczego to jest na froncie pareto?').kind).toBe('pareto');
  });

  it('engine: which engine computed this', () => {
    expect(parseCampaignWhyQuestion('Which engine computed this?').kind).toBe('engine');
    expect(parseCampaignWhyQuestion('Jaki silnik to policzył?').kind).toBe('engine');
  });

  it('strategy: why did the strategy change', () => {
    expect(parseCampaignWhyQuestion('Why did the strategy change?').kind).toBe('strategy');
    expect(parseCampaignWhyQuestion('Dlaczego zmieniono strategię?').kind).toBe('strategy');
  });

  it('next-experiment: what should Genesis do next', () => {
    expect(parseCampaignWhyQuestion("What's next?").kind).toBe('next-experiment');
    expect(parseCampaignWhyQuestion('Why this next experiment?').kind).toBe('next-experiment');
    expect(parseCampaignWhyQuestion('Co dalej?').kind).toBe('next-experiment');
  });

  it('stop: why did the campaign stop', () => {
    expect(parseCampaignWhyQuestion('Why did the campaign stop?').kind).toBe('stop');
    expect(parseCampaignWhyQuestion('Dlaczego kampania się zatrzymała?').kind).toBe('stop');
  });

  it('stage-selection: why was this selected for the stage', () => {
    expect(parseCampaignWhyQuestion('Why was this selected for docking?').kind).toBe('stage-selection');
  });

  it('conflict: why do the models disagree', () => {
    expect(parseCampaignWhyQuestion('Why do the models disagree?').kind).toBe('conflict');
    expect(parseCampaignWhyQuestion('Show me the model conflict.').kind).toBe('conflict');
  });

  it('candidate (lineage): where did this come from', () => {
    expect(parseCampaignWhyQuestion('Where did this come from?').kind).toBe('candidate');
    expect(parseCampaignWhyQuestion('How was this generated?').kind).toBe('candidate');
    expect(parseCampaignWhyQuestion('Skąd się wzięło?').kind).toBe('candidate');
  });
});

describe('parseCampaignWhyQuestion — precedence and honesty', () => {
  it('routes "why this next experiment" to next-experiment, not the generic status pattern', () => {
    expect(parseCampaignWhyQuestion('Why this next experiment?').kind).toBe('next-experiment');
  });

  it('is unresolved (KIND) for a sentence matching none of the real why-kinds — never guesses', () => {
    const intent = parseCampaignWhyQuestion('Show me the pump.');
    expect(intent.kind).toBeNull();
    expect(intent.unresolved).toEqual(['KIND']);
  });

  it('reads an explicit generation number when present', () => {
    expect(parseCampaignWhyQuestion('Why did the strategy change at generation 3?').generation).toBe(3);
    expect(parseCampaignWhyQuestion('Dlaczego zmieniono strategię w generacji 2?').generation).toBe(2);
  });

  it('generation is null when the sentence never states one', () => {
    expect(parseCampaignWhyQuestion('Why did the campaign stop?').generation).toBeNull();
  });
});
