import { HONESTY_LABELS, type HonestyLevel } from '../core/types';

/**
 * Etykieta uczciwości naukowej + nota — powtarzana w LabShell, Atom Lab
 * i AI Discovery Lab. Wydzielona, by wszystkie trzy miejsca renderowały
 * ją identycznie (jedna zmiana stylu/tekstu = jedno miejsce w kodzie).
 */
export function HonestyBadge({ level, note }: { level: HonestyLevel; note: string }) {
  return (
    <div className="honesty-row">
      <span className={`honesty ${level}`}>{HONESTY_LABELS[level]}</span>
      <span className="honesty-note">{note}</span>
    </div>
  );
}
