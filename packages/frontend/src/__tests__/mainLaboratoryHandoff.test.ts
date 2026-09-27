import { describe, expect, it } from 'vitest';
import { LAB_CATALOG } from '../core/scientificWorlds/labWorld';
import { stationHandoffCommand, validateWorldCommand } from '../core/scientificWorlds/worldCommand';
import { planActions } from '../core/scientificWorlds/actionPlanner';
import { getRouterModel } from '../core/experimentFabric/router';
import { getGenesisCapability } from '../core/capabilities/genesisCapabilityRegistry';

/**
 * ONE MAIN LABORATORY: chemistry and physics requests land at a station of `#/scientific-worlds`
 * through `?station=<id>&…`, turned into the same validated RUN_EXPERIMENT the command bar makes.
 */
describe('main Laboratory station handoff', () => {
  it('turns ?station=st-titration&acid=formic&vb=12 into one valid RUN_EXPERIMENT with typed parameters', () => {
    const command = stationHandoffCommand('station=st-titration&acid=formic&vb=12', LAB_CATALOG, 3);
    expect(command).toMatchObject({ intent: 'RUN_EXPERIMENT', targetEntityId: 'st-titration', parameters: { acid: 'formic', vb: 12 } });
    expect(validateWorldCommand(command!, LAB_CATALOG)).toEqual({ ok: true });
    const plan = planActions([command!], LAB_CATALOG, null);
    expect(plan.steps.map((s) => s.kind)).toContain('EXECUTE');
    expect(plan.steps[0]).toMatchObject({ kind: 'NAVIGATE', stationId: 'st-titration' });
  });

  it('is deterministic and refuses unknown stations or a missing station', () => {
    expect(stationHandoffCommand('station=st-window', LAB_CATALOG, 1)).toEqual(stationHandoffCommand('?station=st-window', LAB_CATALOG, 1));
    expect(stationHandoffCommand('station=st-nowhere', LAB_CATALOG, 1)).toBeNull();
    expect(stationHandoffCommand('acid=acetic', LAB_CATALOG, 1)).toBeNull();
  });

  it('the canonical titration model and its registry entry show results at the main-Laboratory station', () => {
    expect(getRouterModel('chemistry-titration')?.route).toEqual({ kind: 'product-route', hash: '#/scientific-worlds?station=st-titration', parameterQueryKeys: ['acid', 'vb'] });
    expect(getGenesisCapability('chemistry-titration')?.visualizationRoute).toBe('#/scientific-worlds?station=st-titration');
  });
});
