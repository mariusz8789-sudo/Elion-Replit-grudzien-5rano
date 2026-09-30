import { EPISTEMIC_LABELS } from '../core/generator/recipe';
import { SCENE_BASIS_EXPLANATIONS_PL, SCENE_BASIS_LABELS_PL, type SceneManifest } from '../core/sceneProvenance/sceneBasis';
import { getSceneManifest } from '../core/sceneProvenance/labSceneManifests';

const SECTIONS: ReadonlyArray<readonly [keyof SceneManifest, string]> = [
  ['measuredDataRefs', 'Prawdziwe dane pomiarowe'],
  ['modelRefs', 'Teoria i równania'],
  ['sourceRefs', 'Źródła historyczne'],
  ['assumptions', 'Założenia'],
  ['speculativeElements', 'Hipotezy i spekulacje'],
  ['visualizationOnlyElements', 'Tylko do oglądania (nie fizyka)'],
  ['simulationLimits', 'Gdzie kończy się ta symulacja'],
  ['theoryLimits', 'Gdzie kończy się teoria'],
];

/**
 * U0-b: what in this scene is a measurement, theory, reconstruction, claim
 * or fiction. Sits under the honesty badge; renders nothing for a scene
 * without a manifest (the lab manifest test keeps that list empty).
 */
export function SceneProvenanceBadge({ sceneId }: { sceneId: string }) {
  const m = getSceneManifest(sceneId);
  if (!m) return null;
  return (
    <div className="scene-provenance" data-testid="scene-provenance" data-scene-id={m.sceneId}>
      <div className="scene-provenance-chips">
        <span className={`scene-basis scene-basis-${m.basis.toLowerCase()}`}>{SCENE_BASIS_LABELS_PL[m.basis]}</span>
        <span className="scene-reliability">{EPISTEMIC_LABELS[m.reliability]}</span>
      </div>
      <details className="honesty-explanation">
        <summary>Co w tej scenie jest prawdziwe?</summary>
        <div className="honesty-note scene-provenance-body">
          <p>{SCENE_BASIS_EXPLANATIONS_PL[m.basis]}</p>
          {SECTIONS.map(([key, title]) => {
            const items = (m[key] as readonly string[] | undefined) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={key}>
                <strong>{title}</strong>
                <ul>{items.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}
