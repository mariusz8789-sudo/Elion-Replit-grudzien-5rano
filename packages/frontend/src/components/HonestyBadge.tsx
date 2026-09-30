import { HONESTY_LABELS, type HonestyLevel } from '../core/types';
import { SceneProvenanceBadge } from './SceneProvenanceBadge';

/**
 * Etykieta uczciwości naukowej + nota — powtarzana w LabShell, Atom Lab
 * i AI Discovery Lab. Wydzielona, by wszystkie trzy miejsca renderowały
 * ją identycznie (jedna zmiana stylu/tekstu = jedno miejsce w kodzie).
 */
export function HonestyBadge({ level, note, sceneId }: { level: HonestyLevel; note: string; sceneId?: string }) {
  return (
    <div className="honesty-row">
      <span className={`honesty ${level}`}>{HONESTY_LABELS[level]}</span>
      <details className="honesty-explanation">
        <summary>Co dokładnie liczy ten model?</summary>
        <p className="honesty-note">{note}</p>
      </details>
      {sceneId && <SceneProvenanceBadge sceneId={sceneId} />}
    </div>
  );
}
