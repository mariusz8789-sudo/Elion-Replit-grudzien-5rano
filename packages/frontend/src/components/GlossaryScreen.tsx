import { useEffect, useMemo, useState } from 'react';
import { GLOSSARY } from '../data/glossary';
import { getLabs } from '../core/registry';
import { track } from '../core/analytics';

/** Słowniczek pojęć — filtrowalny tekstem i po laboratorium źródłowym. */
export function GlossaryScreen() {
  const [query, setQuery] = useState('');
  const [labFilter, setLabFilter] = useState<string | null>(null);
  const labs = useMemo(() => getLabs(), []);
  const labById = useMemo(() => new Map(labs.map((l) => [l.id, l])), [labs]);

  useEffect(() => {
    track('glossary_viewed');
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GLOSSARY.filter((t) => {
      if (labFilter && t.labId !== labFilter) return false;
      if (!q) return true;
      return t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q);
    });
  }, [query, labFilter]);

  const labsWithTerms = useMemo(
    () => labs.filter((l) => GLOSSARY.some((t) => t.labId === l.id)),
    [labs],
  );

  return (
    <main className="glossary-view" id="main-content" tabIndex={-1}>
      <div className="settings-section">
        <input
          type="search"
          className="glossary-search"
          placeholder="Szukaj pojęcia…"
          aria-label="Szukaj w słowniczku"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="glossary-chips" role="group" aria-label="Filtruj po laboratorium">
          <button className={`gchip ${labFilter === null ? 'active' : ''}`} onClick={() => setLabFilter(null)}>
            Wszystkie
          </button>
          {labsWithTerms.map((l) => (
            <button
              key={l.id}
              className={`gchip ${labFilter === l.id ? 'active' : ''}`}
              onClick={() => setLabFilter(l.id === labFilter ? null : l.id)}
            >
              {l.icon} {l.name}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="empty-state">Brak pojęć pasujących do wyszukiwania.</p>
      ) : (
        <dl className="glossary-list">
          {filtered.map((t) => {
            const lab = labById.get(t.labId);
            return (
              <div className="glossary-item" key={t.term} style={{ ['--accent' as string]: lab?.accent }}>
                <dt>
                  {t.term}
                  {lab && <span className="glossary-lab-tag">{lab.icon} {lab.name}</span>}
                </dt>
                <dd>{t.definition}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </main>
  );
}
