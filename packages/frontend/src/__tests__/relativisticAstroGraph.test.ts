import { describe, expect, it } from 'vitest';
import { buildRelativisticAstroGraph } from '../core/modelGraph/relativisticAstroGraph';
import { chirpMassSolar, iscoFrequency } from '../core/physics';

describe('buildRelativisticAstroGraph', () => {
  it('reproduces chirp mass for an equal-mass 60 Msun binary (m1=m2=30)', () => {
    const g = buildRelativisticAstroGraph();
    expect(g.getValue('chirpMassSolar')).toBeCloseTo(chirpMassSolar(30, 30), 6);
  });

  it('source-frame ISCO frequency matches physics.ts::iscoFrequency for the total mass', () => {
    const g = buildRelativisticAstroGraph();
    expect(g.getValue('iscoFrequencySource')).toBeCloseTo(iscoFrequency(60), 6);
  });

  it('at beta=0 the Doppler factor is exactly 1 and observed == source frequency', () => {
    const g = buildRelativisticAstroGraph();
    g.setParameter('lineOfSightBeta', 0);
    expect(g.getValue('dopplerRedshiftFactor')).toBeCloseTo(1, 12);
    expect(g.getValue('observedIscoFrequency')).toBeCloseTo(g.getValue('iscoFrequencySource'), 9);
  });

  it('a receding source (beta>0) redshifts the observed ISCO frequency BELOW the source value', () => {
    const g = buildRelativisticAstroGraph();
    g.setParameter('lineOfSightBeta', 0.5);
    expect(g.getValue('dopplerRedshiftFactor')).toBeLessThan(1);
    expect(g.getValue('observedIscoFrequency')).toBeLessThan(g.getValue('iscoFrequencySource'));
    // exact: sqrt((1-0.5)/(1+0.5)) = sqrt(1/3)
    expect(g.getValue('dopplerRedshiftFactor')).toBeCloseTo(Math.sqrt(1 / 3), 9);
  });

  it('THE CROSS-DOMAIN EDGE: observedIscoFrequency depends on one node from EACH domain', () => {
    const g = buildRelativisticAstroGraph();
    const bridge = g.getNode('observedIscoFrequency')!;
    expect(bridge.inputs).toEqual(['iscoFrequencySource', 'dopplerRedshiftFactor']);
    const gwDomain = g.getNode('iscoFrequencySource')!.domain;
    const srDomain = g.getNode('dopplerRedshiftFactor')!.domain;
    expect(gwDomain).toContain('fale grawitacyjne');
    expect(srDomain).toContain('teoria względności');
    expect(gwDomain).not.toBe(srDomain); // genuinely two different domains feeding one node
  });

  it('changing the SR parameter (beta) propagates into the GW-observed bridge but NOT into pure GW nodes', () => {
    const g = buildRelativisticAstroGraph();
    const steps = g.setParameter('lineOfSightBeta', 0.3);
    const touched = steps.map((s) => s.nodeId);
    expect(touched).toContain('dopplerRedshiftFactor');
    expect(touched).toContain('observedIscoFrequency'); // cross-domain consequence
    expect(touched).not.toContain('chirpMassSolar'); // pure GW quantity, unaffected by source velocity
    expect(touched).not.toContain('iscoFrequencySource'); // source-frame, unaffected by observer
    // and the bridge's causedBy correctly attributes the change to the SR side only
    const bridgeStep = steps.find((s) => s.nodeId === 'observedIscoFrequency')!;
    expect(bridgeStep.causedBy).toEqual(['dopplerRedshiftFactor']);
  });

  it('changing a GW parameter (total mass) propagates into the bridge, caused by the GW side only', () => {
    const g = buildRelativisticAstroGraph();
    const steps = g.setParameter('totalMassSolar', 120);
    const bridgeStep = steps.find((s) => s.nodeId === 'observedIscoFrequency')!;
    expect(bridgeStep.causedBy).toEqual(['iscoFrequencySource']);
  });

  it('the cross-domain bridge is labeled approximate (inherits ISCO + kinematic-redshift caveat)', () => {
    const g = buildRelativisticAstroGraph();
    expect(g.getNode('observedIscoFrequency')!.derivation).toBe('approximate');
    expect(g.getNode('dopplerRedshiftFactor')!.derivation).toBe('direct');
    expect(g.getNode('chirpMassSolar')!.derivation).toBe('direct');
  });
});
