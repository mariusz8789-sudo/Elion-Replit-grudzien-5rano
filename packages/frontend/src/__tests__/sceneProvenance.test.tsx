import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import '../labs/index';
import { getLabs } from '../core/registry';
import { allLabSceneManifests, getSceneManifest, labSceneId } from '../core/sceneProvenance/labSceneManifests';
import {
  basisFromDataProvenance,
  basisFromEpistemicLabel,
  basisFromExplorerEvidenceMode,
  basisFromFlagshipStatus,
  validateSceneManifest,
  type SceneManifest,
} from '../core/sceneProvenance/sceneBasis';
import { SceneProvenanceBadge } from '../components/SceneProvenanceBadge';

/**
 * U0-b: every laboratory scene says what on screen is a measurement, what is
 * computed from theory, what is only drawn, and where the SIMULATION (not the
 * theory) stops being valid.
 */

// Custom lab screens render their own badges with one scene id per mode; read those ids from the source.
const CUSTOM_SCREENS = ['labs/atom.tsx', 'labs/mathematics.tsx', 'labs/discovery.tsx'];
function customSceneIds(): string[] {
  const ids: string[] = [];
  for (const f of CUSTOM_SCREENS) {
    const src = readFileSync(resolve(__dirname, '..', f), 'utf8');
    for (const m of src.matchAll(/lab:[a-z]+:[\w.-]+/g)) ids.push(m[0]);
    if (f === 'labs/atom.tsx') for (const mode of ['orbitals', 'orbitals2d', 'trends']) ids.push(`lab:atom:${mode}`);
  }
  return [...new Set(ids)];
}

function registeredSceneIds(): string[] {
  const ids: string[] = [];
  for (const lab of getLabs()) {
    if (lab.CustomView) continue;
    ids.push(labSceneId(lab.id, '__base'));
    for (const e of lab.experiments ?? []) ids.push(labSceneId(lab.id, e.id));
  }
  return ids;
}

describe('U0-b scene provenance: coverage', () => {
  it('every registered lab experiment and every custom lab mode has a manifest', () => {
    const missing = [...registeredSceneIds(), ...customSceneIds()].filter((id) => !getSceneManifest(id));
    expect(missing).toEqual([]);
  });

  it('no manifest describes a scene that does not exist', () => {
    const known = new Set([...registeredSceneIds(), ...customSceneIds()]);
    expect(allLabSceneManifests().map((m) => m.sceneId).filter((id) => !known.has(id))).toEqual([]);
  });

  it('scene ids are unique', () => {
    const ids = allLabSceneManifests().map((m) => m.sceneId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every manifest passes the structural rules', () => {
    expect(allLabSceneManifests().flatMap(validateSceneManifest)).toEqual([]);
  });

  it('a synthetic-data scene is never labelled a measurement', () => {
    expect(getSceneManifest('lab:particle:invmass')!.basis).toBe('COMPUTED_MODEL');
    expect(getSceneManifest('lab:particle:invmass')!.simulationLimits.join(' ')).toMatch(/SYNTETYCZNE/);
    expect(getSceneManifest('lab:universe:hubbletension')!.basis).toBe('MEASURED_DATA');
  });

  it('speculative labs stay below theory on the reliability scale', () => {
    for (const id of ['lab:multiverse:multiverse', 'lab:multiverse:altstar-2d', 'lab:multiverse:nexus', 'lab:civilization:civilization', 'lab:civilization:kardashev-2d', 'lab:civilization:colonization']) {
      expect(getSceneManifest(id)!.reliability).toBe('SPECULATIVE_MODEL');
    }
  });
});

describe('U0-b: simulation limits are kept apart from theory limits', () => {
  const base: SceneManifest = {
    sceneId: 'test', basis: 'COMPUTED_MODEL', reliability: 'ESTABLISHED_SCIENCE',
    measuredDataRefs: [], modelRefs: ['m'], assumptions: [], speculativeElements: [], visualizationOnlyElements: [],
    simulationLimits: ['x'], theoryLimits: [],
  };

  it('rejects presenting the horizon as the end of physics, in Polish and English', () => {
    for (const bad of ['Na horyzoncie zdarzeń kończy się znana fizyka', 'Physics breaks down at the event horizon', 'the horizon is where known physics ends']) {
      expect(validateSceneManifest({ ...base, theoryLimits: [bad] }).length).toBeGreaterThan(0);
    }
  });

  it('accepts the correct statement used by the black-hole scenes', () => {
    const bh = getSceneManifest('lab:einstein:einstein')!;
    expect(bh.theoryLimits.some((t) => /granicą przyczynową/.test(t))).toBe(true);
    expect(bh.simulationLimits.some((t) => /symulacja dalej ich nie śledzi/.test(t))).toBe(true);
    expect(validateSceneManifest(bh)).toEqual([]);
  });

  it('requires a simulation limit, sources for reconstructions and fiction at the bottom of the scale', () => {
    expect(validateSceneManifest({ ...base, simulationLimits: [] }).length).toBe(1);
    expect(validateSceneManifest({ ...base, basis: 'HISTORICAL_RECONSTRUCTION' }).length).toBe(1);
    expect(validateSceneManifest({ ...base, basis: 'ALLEGED_CLAIM', reliability: 'HYPOTHESIS', sourceRefs: ['relacja'] })).toEqual([]);
    expect(validateSceneManifest({ ...base, basis: 'ALLEGED_CLAIM', reliability: 'WELL_SUPPORTED_MODEL', sourceRefs: ['relacja'] }).length).toBe(1);
    expect(validateSceneManifest({ ...base, basis: 'FICTION' }).length).toBe(1);
    expect(validateSceneManifest({ ...base, basis: 'MEASURED_DATA' }).length).toBe(1);
  });
});

describe('U0-b: existing status vocabularies map onto the scene basis without a new truth system', () => {
  it('maps kinds of content and refuses to force process states onto a basis', () => {
    expect(basisFromEpistemicLabel('REAL_OBSERVATION')).toBe('MEASURED_DATA');
    expect(basisFromEpistemicLabel('RECONSTRUCTION')).toBe('HISTORICAL_RECONSTRUCTION');
    expect(basisFromEpistemicLabel('FICTION_INSPIRED')).toBe('FICTION');
    expect(basisFromEpistemicLabel('INSUFFICIENT_EVIDENCE')).toBeUndefined();
    expect(basisFromFlagshipStatus('FICTIONAL')).toBe('FICTION');
    expect(basisFromFlagshipStatus('FALSIFIED')).toBeUndefined();
    expect(basisFromDataProvenance('SIMULATED')).toBe('COMPUTED_MODEL');
    expect(basisFromDataProvenance('REAL_EXPERIMENTAL')).toBe('MEASURED_DATA');
    expect(basisFromExplorerEvidenceMode('ILLUSTRATIVE')).toBe('FICTION');
    expect(basisFromExplorerEvidenceMode('REAL_IMAGE')).toBe('MEASURED_DATA');
  });
});

describe('U0-b badge', () => {
  it('shows the basis, the reliability and both kinds of limits', () => {
    const html = renderToStaticMarkup(<SceneProvenanceBadge sceneId="lab:einstein:einstein" />);
    expect(html).toContain('Obliczenie z teorii');
    expect(html).toContain('Nauka ustalona');
    expect(html).toContain('Co w tej scenie jest prawdziwe?');
    expect(html).toContain('Gdzie kończy się ta symulacja');
    expect(html).toContain('Gdzie kończy się teoria');
    expect(html).toContain('Tylko do oglądania');
  });

  it('renders nothing for an unknown scene rather than guessing', () => {
    expect(renderToStaticMarkup(<SceneProvenanceBadge sceneId="lab:nope:nope" />)).toBe('');
  });
});
