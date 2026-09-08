import { describe, expect, it } from 'vitest';
import { buildCampaignRequest, parseDiscoveryGoal } from '../core/discovery/discoveryGoalIntent';

describe('parseDiscoveryGoal — starting molecule (explicit marker only, never a heuristic guess)', () => {
  it('recognizes "starting from X"', () => {
    expect(parseDiscoveryGoal('Find me a candidate starting from CCO.').startingSmiles).toEqual(['CCO']);
  });

  it('recognizes "based on X"', () => {
    expect(parseDiscoveryGoal('Optimize based on c1ccccc1.').startingSmiles).toEqual(['c1ccccc1']);
  });

  it('recognizes Polish "zaczynając od X"', () => {
    expect(parseDiscoveryGoal('Znajdź kandydata zaczynając od CCO.').startingSmiles).toEqual(['CCO']);
  });

  it('is unresolved (STARTING_MOLECULE) when no marker phrase names a molecule', () => {
    const intent = parseDiscoveryGoal('Find me a good drug candidate.');
    expect(intent.startingSmiles).toEqual([]);
    expect(intent.unresolved).toContain('STARTING_MOLECULE');
  });

  it('does NOT guess a molecule from a bare word that merely looks chemistry-adjacent', () => {
    // "CC" alone, with no marker phrase, must not be treated as a named starting molecule.
    const intent = parseDiscoveryGoal('Find me something with logP around 2, similar to CC maybe.');
    expect(intent.startingSmiles).toEqual([]);
    expect(intent.unresolved).toContain('STARTING_MOLECULE');
  });
});

describe('parseDiscoveryGoal — target properties', () => {
  it('reads a target logP', () => {
    expect(parseDiscoveryGoal('starting from CCO, logP around 3').targetLogP).toBe(3);
  });

  it('reads a target molecular weight', () => {
    expect(parseDiscoveryGoal('starting from CCO, molecular weight around 300').targetMolWt).toBe(300);
  });

  it('reads Polish target phrasing for logP and MW', () => {
    const intent = parseDiscoveryGoal('zaczynając od CCO, logP na poziomie 2.5, masa cząsteczkowa około 320');
    expect(intent.targetLogP).toBe(2.5);
    expect(intent.targetMolWt).toBe(320);
  });

  it('is null for properties the sentence never mentions', () => {
    const intent = parseDiscoveryGoal('starting from CCO');
    expect(intent.targetLogP).toBeNull();
    expect(intent.targetMolWt).toBeNull();
  });
});

describe('parseDiscoveryGoal — constraints', () => {
  it('reads "molecular weight under X" as a max constraint', () => {
    expect(parseDiscoveryGoal('starting from CCO, molecular weight under 400').maxMolWt).toBe(400);
  });

  it('reads "logP between X and Y" as min+max', () => {
    const intent = parseDiscoveryGoal('starting from CCO, logP between -1 and 4');
    expect(intent.minLogP).toBe(-1);
    expect(intent.maxLogP).toBe(4);
  });

  it('reads "logP above X" / "logP below X" independently', () => {
    expect(parseDiscoveryGoal('starting from CCO, logP above 1').minLogP).toBe(1);
    expect(parseDiscoveryGoal('starting from CCO, logP below 4').maxLogP).toBe(4);
  });

  it('reads a generation budget ("up to N generations")', () => {
    expect(parseDiscoveryGoal('starting from CCO, try up to 6 generations').maxGenerations).toBe(6);
  });
});

describe('buildCampaignRequest — honest refusal and omission discipline', () => {
  it('refuses with a real reason when no starting molecule was named — never fabricates one', () => {
    const result = buildCampaignRequest(parseDiscoveryGoal('Find me a good candidate.'));
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toMatch(/starting molecule/i);
  });

  it('omits objectives/constraints entirely when the sentence names none — backend defaults apply, nothing invented', () => {
    const result = buildCampaignRequest(parseDiscoveryGoal('starting from CCO'));
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.startingSmiles).toEqual(['CCO']);
      expect(result.objectives).toBeUndefined();
      expect(result.constraints).toBeUndefined();
      expect(result.budget).toBeUndefined();
    }
  });

  it('builds a real objective/constraint request from a fully-specified goal', () => {
    const result = buildCampaignRequest(parseDiscoveryGoal(
      'starting from CCO, logP around 2, molecular weight under 400, try up to 5 generations',
    ));
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.objectives).toEqual([{ id: 'logp-distance', targetProperty: 'crippenLogP', target: 2, scale: 1 }]);
      expect(result.constraints).toEqual([{ id: 'mw-max', property: 'molWt', op: 'lte', value: 400 }]);
      expect(result.budget).toEqual({ maxGenerations: 5 });
      expect(result.domain).toBe('DRUG_DISCOVERY');
    }
  });

  it('the raw sentence becomes the campaign objective label, never rewritten', () => {
    const goal = 'starting from CCO, logP around 2';
    const result = buildCampaignRequest(parseDiscoveryGoal(goal));
    if (!('error' in result)) expect(result.objective).toBe(goal);
  });
});
