import { useEffect, useMemo, useRef, useState } from 'react';
import { buildSearchIndex, filterSearchIndex, type SearchEntry } from '../core/search';
import { track } from '../core/analytics';
import { useFocusTrap } from '../core/useFocusTrap';

/**
 * Paleta poleceń (Ctrl/Cmd+K lub „/"): szuka po nazwach i tagline'ach
 * laboratoriów/eksperymentów z rejestru pluginów — zero osobnej bazy danych.
 */
export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const index = useMemo(buildSearchIndex, []);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, true);

  useEffect(() => {
    inputRef.current?.focus();
    track('search_used');
  }, []);

  const results = useMemo<SearchEntry[]>(() => {
    if (!query.trim()) return index.slice(0, 8);
    return filterSearchIndex(index, query).slice(0, 12);
  }, [index, query]);

  useEffect(() => setActive(0), [query]);

  const go = (e: SearchEntry) => {
    window.location.hash = `#/lab/${e.labId}`;
    onClose();
  };

  return (
    <div className="overlay-backdrop" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="overlay-panel search-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Szukaj laboratorium lub eksperymentu"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="search"
          className="glossary-search"
          placeholder="Szukaj laboratorium lub eksperymentu…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter' && results[active]) { go(results[active]); }
          }}
        />
        {results.length === 0 ? (
          <p className="empty-state" role="status">Brak wyników dla „{query}".</p>
        ) : (
          <ul className="search-results" role="listbox" aria-live="polite">
            {results.map((r, i) => (
              <li key={`${r.labId}:${r.expId}`}>
                <button
                  className={`search-result ${i === active ? 'active' : ''}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r)}
                >
                  <span className="icon" aria-hidden="true">{r.icon}</span>
                  <span className="sr-body">
                    <span className="sr-name">{r.expId === '__base' ? r.labName : `${r.labName} · ${r.expName}`}</span>
                    <span className="sr-tag">{r.tagline}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
