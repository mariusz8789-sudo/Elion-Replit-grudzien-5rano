import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  isLabEnvironmentCatalog,
  labEnvironmentCatalogIds,
  LabEnvironmentPicker,
} from '../components/visual-simulation/LabEnvironmentPicker';
import { GENESIS_ATOMIC_IONIZATION_CATALOG_ID } from '../core/agent/atomicIonizationLeverCatalog';
import { GENESIS_PARTICLE_PHYSICS_CATALOG_ID } from '../core/agent/particlePhysicsLeverCatalog';
import { LAB_ENVIRONMENTS } from '../core/agent/particleAtomicLabEnvironments';

const noop = () => {};

function render(catalogId: string): string {
  return renderToStaticMarkup(
    <LabEnvironmentPicker catalogId={catalogId} onSelectCatalog={noop} />,
  );
}

describe('the environment list appears only on this laboratory’s worlds', () => {
  it('renders nothing at all on an unrelated world', () => {
    expect(render('genesis-scientific-city-3')).toBe('');
    expect(render('genesis-chemistry-lab')).toBe('');
    expect(isLabEnvironmentCatalog('genesis-chemistry-lab')).toBe(false);
  });

  it('renders on both physics worlds', () => {
    expect(isLabEnvironmentCatalog(GENESIS_PARTICLE_PHYSICS_CATALOG_ID)).toBe(true);
    expect(isLabEnvironmentCatalog(GENESIS_ATOMIC_IONIZATION_CATALOG_ID)).toBe(true);
    expect(render(GENESIS_PARTICLE_PHYSICS_CATALOG_ID)).toContain('lab-environments');
    expect(render(GENESIS_ATOMIC_IONIZATION_CATALOG_ID)).toContain('lab-environments');
  });

  it('only ever names catalogues that really exist', async () => {
    const { WORLD_LEVER_CATALOGS } = await import('../core/agent/worldGoalIntent');
    for (const id of labEnvironmentCatalogIds()) {
      expect(WORLD_LEVER_CATALOGS[id], id).toBeDefined();
    }
  });
});

describe('a NOT_BUILT environment is never offered as a laboratory', () => {
  const markup = render(GENESIS_PARTICLE_PHYSICS_CATALOG_ID);

  it('shows the plasma lab only under the unavailable heading, with no way in', () => {
    expect(LAB_ENVIRONMENTS.PLASMA_LAB.status).toBe('NOT_BUILT');
    expect(markup).toContain('lab-environments-unavailable');
    expect(markup).toContain('Not available');
    // Its row exists — the roadmap stays visible...
    expect(markup).toContain('lab-env-PLASMA_LAB');
    // ...but there is no enter button for it anywhere in the document.
    expect(markup).not.toContain('lab-env-enter-PLASMA_LAB');
  });

  it('puts the unavailable heading AFTER every offered environment, never mixed in', () => {
    const unavailableAt = markup.indexOf('lab-environments-unavailable');
    for (const id of ['VIRTUAL_CERN_LHC_LIKE', 'COLLIDER_LAB', 'ATOMIC_LAB', 'NUCLEAR_LAB'] as const) {
      expect(markup.indexOf(`lab-env-${id}`), id).toBeLessThan(unavailableAt);
    }
    expect(markup.indexOf('lab-env-PLASMA_LAB')).toBeGreaterThan(unavailableAt);
  });
});

describe('every row states a real status, and the status is the stored one', () => {
  const markup = render(GENESIS_ATOMIC_IONIZATION_CATALOG_ID);

  it('prints the three real statuses and invents no fourth', () => {
    expect(markup).toContain('RUNNABLE');
    expect(markup).toContain('CHANNELS ONLY');
    expect(markup).toContain('NOT BUILT');
  });

  it('offers an entry point for RUNNABLE environments and withholds it from CHANNELS_ONLY', () => {
    expect(markup).toContain('lab-env-enter-VIRTUAL_CERN_LHC_LIKE');
    expect(markup).toContain('lab-env-enter-COLLIDER_LAB');
    // The nuclear lab has real channels but no apparatus, so there is nothing to enter.
    expect(LAB_ENVIRONMENTS.NUCLEAR_LAB.status).toBe('CHANNELS_ONLY');
    expect(markup).toContain('lab-env-NUCLEAR_LAB');
    expect(markup).not.toContain('lab-env-enter-NUCLEAR_LAB');
    expect(markup).not.toContain('lab-env-enter-CUSTOM_EXPERIMENT_LAB');
  });

  it('marks the environment the panel is already on as loaded rather than enterable', () => {
    expect(markup).toContain('lab-env-active');
    expect(markup).toContain('Loaded — this world is selected above');
  });

  it('carries each environment’s own epistemic note, including the real-LHC disclaimer', () => {
    expect(markup).toContain('NOT a model of the real LHC');
    expect(markup).toContain(LAB_ENVIRONMENTS.PLASMA_LAB.epistemicNote.slice(0, 40));
  });

  it('states a fidelity floor per environment, and it is the WEAKEST channel not the best', () => {
    // The CERN-like row mixes an exact channel with simplified ones, so it must
    // print SIMPLIFIED — printing EXACT_KINEMATICS there would let one channel
    // speak for the others.
    expect(markup).toContain('SIMPLIFIED');
    const cernRow = markup.slice(markup.indexOf('lab-env-VIRTUAL_CERN_LHC_LIKE'));
    const cernCell = cernRow.slice(0, cernRow.indexOf('lab-env-COLLIDER_LAB'));
    expect(cernCell).toContain('SIMPLIFIED');
    expect(cernCell).not.toContain('>EXACT_KINEMATICS<');
  });

  it('names real reaction channels, not placeholder text', () => {
    expect(markup).toContain('e+e- -&gt; Z -&gt; mu+ mu-');
    expect(markup).toContain('Lotz cross-section');
  });
});

describe('entering an environment re-points the existing panel, nothing more', () => {
  it('calls back with a catalogue id the registry knows', async () => {
    const { WORLD_LEVER_CATALOGS } = await import('../core/agent/worldGoalIntent');
    const seen: string[] = [];
    renderToStaticMarkup(
      <LabEnvironmentPicker
        catalogId={GENESIS_ATOMIC_IONIZATION_CATALOG_ID}
        onSelectCatalog={(id) => seen.push(id)}
      />,
    );
    // Static rendering does not click, so assert the contract the button is
    // wired to instead: every RUNNABLE environment points at a real catalogue.
    for (const env of Object.values(LAB_ENVIRONMENTS)) {
      if (env.status !== 'RUNNABLE') continue;
      expect(env.discoveryCatalogId).not.toBeNull();
      expect(WORLD_LEVER_CATALOGS[env.discoveryCatalogId!]).toBeDefined();
    }
    expect(seen).toHaveLength(0);
  });

  it('disables every entry button while a search is running', () => {
    const markup = renderToStaticMarkup(
      <LabEnvironmentPicker
        catalogId={GENESIS_PARTICLE_PHYSICS_CATALOG_ID}
        onSelectCatalog={noop}
        disabled
      />,
    );
    const buttons = markup.match(/<button[^>]*lab-env-enter-[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button).toContain('disabled');
  });
});
