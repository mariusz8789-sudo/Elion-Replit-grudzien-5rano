import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SceneProvenanceBadge } from '../components/SceneProvenanceBadge';
import { CERN_SCENE_MANIFESTS } from '../core/sceneProvenance/cernSceneManifests';
import { allLabSceneManifests, getSceneManifest } from '../core/sceneProvenance/labSceneManifests';
import { validateSceneManifest } from '../core/sceneProvenance/sceneBasis';

const src = (f: string): string => readFileSync(resolve(__dirname, '../components', f), 'utf8');

describe('CERN world: measurement, reconstruction, model and simulation stay apart', () => {
  it('every CERN manifest passes the structural rules and is found by id', () => {
    expect(CERN_SCENE_MANIFESTS.flatMap(validateSceneManifest)).toEqual([]);
    for (const m of CERN_SCENE_MANIFESTS) expect(getSceneManifest(m.sceneId)).toBe(m);
  });

  it('the lab manifest list stays lab-only', () => {
    const lab = new Set(allLabSceneManifests().map((m) => m.sceneId));
    for (const m of CERN_SCENE_MANIFESTS) expect(lab.has(m.sceneId)).toBe(false);
  });

  it('the hall, tunnel and detector are simulation and never claim LHC data', () => {
    for (const id of ['world:cern-complex', 'world:cern-detector']) {
      const m = getSceneManifest(id)!;
      expect(m.basis).toBe('COMPUTED_MODEL');
      expect(m.measuredDataRefs).toEqual([]);
      expect(m.simulationLimits.join(' ')).toMatch(/nie pochodzi z detektora CMS ani z LHC/);
    }
  });

  it('the CMS Open Data view is a measurement with its source, and names the reconstruction and the Genesis computation', () => {
    const m = getSceneManifest('physics:cms-z')!;
    expect(m.basis).toBe('MEASURED_DATA');
    expect(m.measuredDataRefs.join(' ')).toMatch(/rekord 5208/);
    expect(m.assumptions.join(' ')).toMatch(/rekonstrukcja wykonana przez CMS/);
    expect(m.modelRefs.join(' ')).toMatch(/liczona przez Genesis/);
    const html = renderToStaticMarkup(<SceneProvenanceBadge sceneId="physics:cms-z" />);
    expect(html).toContain('Genesis sam tych pomiarów nie wykonał');
  });

  it('each CERN screen renders its own badge and the hall no longer says LIVE', () => {
    expect(src('CernComplexView.tsx')).toContain('<SceneProvenanceBadge sceneId="world:cern-complex" />');
    expect(src('ColliderChamber.tsx')).toContain('<SceneProvenanceBadge sceneId="world:cern-detector" />');
    expect(src('PhysicsCmsZScreen.tsx')).toContain('<SceneProvenanceBadge sceneId="physics:cms-z" />');
    expect(src('CernComplexView.tsx')).not.toMatch(/LIVE: ZDERZENIE/);
  });
});
