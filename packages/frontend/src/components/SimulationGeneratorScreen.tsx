import { useMemo, useState } from 'react';
import { ensureGeneratorReady, resolveQuery, getRecipes, epistemicStatusOf, EPISTEMIC_LABELS, type ResolveMatch } from '../core/generator';
import { getLab } from '../core/registry';
import { setPendingScenario } from '../core/scenarioBridge';
import { HONESTY_LABELS } from '../core/types';
import { track } from '../core/analytics';

/**
 * Generator symulacji sterowany językiem naturalnym (nowa warstwa Genesis).
 * Efekt „napisałem jedno zdanie i dostałem działającą symulację": zdanie →
 * deterministyczny resolver → przepis wskazujący ISTNIEJĄCY eksperyment →
 * `setPendingScenario` → `#/lab/<labId>`, gdzie realny silnik rusza z presetem.
 * Zero atrapy: nie renderujemy tu własnej fizyki — delegujemy do sprawdzonych
 * eksperymentów. Gdy nie ma dopasowania, mówimy to wprost i pokazujemy katalog.
 */

const EXAMPLES = [
  'Zasymuluj dylatację czasu przy prędkości bliskiej światła',
  'Pokaż, co stanie się z orbitą, jeśli zwiększymy masę gwiazdy 2 razy',
  'Zasymuluj paradoks bliźniąt',
  'Pokaż paradoks Fermiego',
  'Pokaż powstawanie czarnej dziury',
  'Atraktor Lorenza',
];

export function SimulationGeneratorScreen() {
  ensureGeneratorReady();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');

  const result = useMemo(() => (submitted.trim() ? resolveQuery(submitted) : null), [submitted]);

  const run = (recipeMatch: ResolveMatch) => {
    const { recipe } = recipeMatch;
    if (!getLab(recipe.labId)) return; // obrona: nieznany lab → nic nie rób (nie udawaj)
    track('experiment_open', { lab: recipe.labId, experiment: recipe.experimentId ?? '__base' });
    setPendingScenario(recipe.labId, recipe.params ?? {}, recipe.experimentId);
    window.location.hash = `#/lab/${recipe.labId}`;
  };

  const submit = (text: string) => {
    setQuery(text);
    setSubmitted(text);
  };

  return (
    <main className="settings-view generator-view" id="main-content" tabIndex={-1}>
      <section className="settings-section">
        <h2>🔭 Generator symulacji</h2>
        <p className="settings-hint">
          Opisz zjawisko jednym zdaniem. Genesis dobierze realny model obliczeniowy, uruchomi go i pozwoli
          zmieniać parametry na żywo — z równaniami, założeniami i etykietą uczciwości. To nie animacja:
          wynik liczy sprawdzony silnik.
        </p>
        <form
          className="generator-form"
          onSubmit={(e) => { e.preventDefault(); if (query.trim()) submit(query); }}
        >
          <input
            className="generator-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="np. Zasymuluj dylatację czasu przy prędkości bliskiej światła"
            aria-label="Opisz symulację w języku naturalnym"
          />
          <button className="primary-btn" type="submit" disabled={!query.trim()}>Generuj</button>
        </form>
        <div className="generator-examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="chip-btn" onClick={() => submit(ex)}>{ex}</button>
          ))}
        </div>
      </section>

      {result && result.best && (
        <section className="settings-section">
          <RecipeCard match={result.best} onRun={run} primary />
          {result.alternatives.length > 0 && (
            <>
              <div className="section-label" style={{ padding: '0.8rem 0 0.2rem' }}>Może chodziło o…</div>
              {result.alternatives.map((m) => (
                <RecipeCard key={m.recipe.id} match={m} onRun={run} />
              ))}
            </>
          )}
        </section>
      )}

      {result && !result.best && (
        <section className="settings-section">
          <p className="empty-state">
            Nie mam jeszcze modelu dla „{submitted}". Genesis nigdy nie udaje symulacji, której nie potrafi
            policzyć — poniżej jest pełny katalog dostępnych zjawisk.
          </p>
          <CatalogList onRun={run} />
        </section>
      )}

      {!result && (
        <section className="settings-section">
          <div className="section-label">Biblioteka demo · {getRecipes().length} zjawisk</div>
          <CatalogList onRun={run} />
        </section>
      )}
    </main>
  );
}

function RecipeCard({ match, onRun, primary }: { match: ResolveMatch; onRun: (m: ResolveMatch) => void; primary?: boolean }) {
  const { recipe } = match;
  const labKnown = !!getLab(recipe.labId);
  return (
    <div className={`generator-recipe ${primary ? 'is-primary' : ''}`}>
      <div className="generator-recipe-head">
        <strong>{recipe.title}</strong>
        <span className="pill pill-ok">{EPISTEMIC_LABELS[epistemicStatusOf(recipe)]}</span>
        <span className="pill pill-warn">{HONESTY_LABELS[recipe.honesty]}</span>
      </div>
      <p className="muted">{recipe.summary}</p>
      {recipe.equations && recipe.equations.length > 0 && (
        <div className="generator-eqs">
          {recipe.equations.map((eq) => <code key={eq}>{eq}</code>)}
        </div>
      )}
      {recipe.assumptions && recipe.assumptions.length > 0 && (
        <p className="muted small">Założenia: {recipe.assumptions.join(' · ')}</p>
      )}
      <button className={primary ? 'primary-btn' : 'chip-btn'} onClick={() => onRun(match)} disabled={!labKnown}>
        ▶ Uruchom symulację
      </button>
    </div>
  );
}

function CatalogList({ onRun }: { onRun: (m: ResolveMatch) => void }) {
  return (
    <div className="generator-catalog">
      {getRecipes().map((recipe) => (
        <button
          key={recipe.id}
          className="lab-card"
          onClick={() => onRun({ recipe, score: 0, matched: [] })}
        >
          <span className="name">{recipe.title}</span>
          <span className="desc">{recipe.summary}</span>
        </button>
      ))}
    </div>
  );
}
