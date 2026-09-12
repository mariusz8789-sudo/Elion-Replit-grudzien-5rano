import { useState } from 'react';
import { resolveWorldProposal, type ResolveWorldProposalResult } from '../core/worldModel/generation/resolveWorldProposal';
import { createScientificWorld, type CreateScientificWorldResult } from '../core/worldModel/orchestration/createScientificWorld';

/**
 * ZAPROPONUJ ŚWIAT — the LLM → deterministic-fallback path, finally reachable.
 *
 * `generation/llmWorldProposalAdapter.ts` posts to the backend's real
 * `/api/world-proposal`; `generation/resolveWorldProposal.ts` composes it with
 * the deterministic proposer so one call always returns a proposal. Both were
 * complete and tested, the backend endpoint exists, and no UI ever asked a user
 * for a world — so the whole path was dead from the browser's side.
 *
 * THE FALLBACK REQUEST IS EXPLICIT, NOT DERIVED FROM THE SENTENCE.
 * `proposeWorldDeterministically` is deliberately NOT natural-language
 * understanding (its own doc says so), and `resolveWorldProposal` therefore
 * REQUIRES the caller to supply the structured fallback up front. So this
 * screen asks for both: the sentence for the LLM, and the checkboxes for the
 * fallback. Quietly keyword-matching the sentence into those flags and calling
 * the result "understanding" is exactly the pretence the module refuses.
 *
 * `resolvedVia` is displayed always, never inferred by the reader. With no API
 * key configured the honest outcome is SCRIPT + reason `no-key`, and the screen
 * says that rather than presenting a deterministic composition as an LLM's
 * work.
 *
 * The world itself is built by `createScientificWorld`, unchanged — this screen
 * composes no world of its own and validates nothing itself; every number below
 * is read off the result.
 */

interface Outcome {
  resolved: ResolveWorldProposalResult;
  created: CreateScientificWorldResult | null;
  createError: string | null;
}

const VIA_LABEL: Readonly<Record<ResolveWorldProposalResult['resolvedVia'], string>> = {
  LLM: 'MODEL JĘZYKOWY (backend /api/world-proposal)',
  SCRIPT: 'DETERMINISTYCZNY FALLBACK',
};

export function WorldProposalScreen() {
  const [prompt, setPrompt] = useState('Miasto z laboratorium i siecią wodną, w trakcie epidemii.');
  const [wantsCity, setWantsCity] = useState(true);
  const [wantsLaboratory, setWantsLaboratory] = useState(true);
  const [wantsWaterSystem, setWantsWaterSystem] = useState(true);
  const [wantsEpidemiology, setWantsEpidemiology] = useState(true);
  const [wantsIndustrialSite, setWantsIndustrialSite] = useState(false);
  const [populationCount, setPopulationCount] = useState(5000);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (): Promise<void> => {
    setBusy(true);
    try {
      // The SAME worldId and seed are given to both paths deliberately: the
      // adapter's own doc requires them to be caller-controlled and never read
      // from the model's output, so "same seed + same specification => same
      // world" holds whichever path answers.
      const worldId = `proposed-${Date.now()}`;
      const seed = 7;
      const resolved = await resolveWorldProposal(prompt, {
        worldId,
        seed,
        fallback: {
          worldId, seed,
          wantsCity, wantsLaboratory, wantsWaterSystem, wantsEpidemiology, wantsIndustrialSite,
          populationCount,
        },
      });
      // A proposal that fails validation must NOT silently become a world; the
      // orchestrator throws, and that refusal is the honest outcome to show.
      let created: CreateScientificWorldResult | null = null;
      let createError: string | null = null;
      try {
        created = createScientificWorld({ kind: 'proposal', proposal: resolved.proposal });
      } catch (error) {
        createError = error instanceof Error ? error.message : String(error);
      }
      setOutcome({ resolved, created, createError });
    } finally {
      setBusy(false);
    }
  };

  const spec = outcome?.resolved.proposal.specification;

  return (
    <main className="home" id="main-content" tabIndex={-1}>
      <section className="pilot-step">
        <p className="settings-hint">
          Genesis pyta najpierw realny model językowy (backend{' '}
          <span className="mono">/api/world-proposal</span>), a gdy ten jest niedostępny — z JAKIEGOKOLWIEK powodu:
          brak klucza, offline, limit, zła odpowiedź — składa świat deterministycznie z zadeklarowanych niżej
          elementów. Który z tych dwóch torów zadziałał, jest zawsze napisane wprost.
        </p>
        <p className="settings-hint">
          <strong>Dlaczego zdanie NIE wystarcza:</strong> deterministyczny proposer celowo nie rozumie języka
          naturalnego, więc nie udajemy, że zdanie zamienia się w te przełączniki. Zdanie idzie do modelu; przełączniki
          są jawnym planem awaryjnym, który podajesz z góry.
        </p>

        <label>
          Opis świata (dla modelu językowego)
          <input className="matrix-ask-input" type="text" value={prompt} data-testid="world-proposal-prompt"
            onChange={(e) => setPrompt(e.target.value)} />
        </label>

        <fieldset>
          <legend>Plan awaryjny — z czego złożyć świat, jeśli model nie odpowie</legend>
          <label><input type="checkbox" checked={wantsCity} data-testid="wants-city" onChange={(e) => setWantsCity(e.target.checked)} /> Miasto</label>{' '}
          <label><input type="checkbox" checked={wantsLaboratory} onChange={(e) => setWantsLaboratory(e.target.checked)} /> Laboratorium</label>{' '}
          <label><input type="checkbox" checked={wantsWaterSystem} onChange={(e) => setWantsWaterSystem(e.target.checked)} /> Sieć wodna</label>{' '}
          <label><input type="checkbox" checked={wantsEpidemiology} onChange={(e) => setWantsEpidemiology(e.target.checked)} /> Epidemiologia</label>{' '}
          <label><input type="checkbox" checked={wantsIndustrialSite} onChange={(e) => setWantsIndustrialSite(e.target.checked)} /> Zakład przemysłowy</label>{' '}
          <label>
            Populacja
            <input type="number" min={0} step={500} value={populationCount} data-testid="population-count"
              onChange={(e) => setPopulationCount(Number(e.target.value))} />
          </label>
        </fieldset>

        <div className="pilot-actions">
          <button className="chip-btn pilot-primary" data-testid="propose-world" onClick={() => { void run(); }} disabled={busy}>
            {busy ? 'Proponuję…' : 'Zaproponuj i zbuduj świat'}
          </button>
        </div>
      </section>

      {outcome !== null && spec !== undefined && (
        <>
          <section className="pilot-step" data-testid="world-proposal-result">
            <h2>Skąd wzięła się ta propozycja</h2>
            <dl className="pilot-provenance">
              <div><dt>tor</dt><dd className="mono" data-testid="resolved-via">{VIA_LABEL[outcome.resolved.resolvedVia]}</dd></div>
              <div><dt>źródło propozycji</dt><dd className="mono">{outcome.resolved.proposal.source}</dd></div>
              <div><dt>id propozycji</dt><dd className="mono">{outcome.resolved.proposal.proposalId}</dd></div>
              {outcome.resolved.proposal.provenance.model !== undefined && (
                <div><dt>model</dt><dd className="mono">{outcome.resolved.proposal.provenance.model}</dd></div>
              )}
              <div><dt>pewność</dt><dd className="mono">{outcome.resolved.proposal.confidence ?? '—'}</dd></div>
            </dl>
            {/* The failure reason is the point of the fallback being honest. */}
            {outcome.resolved.llmFailure !== undefined && (
              <p className="pilot-summary" data-testid="llm-failure">
                Model językowy nie odpowiedział ({outcome.resolved.llmFailure.reason}): {outcome.resolved.llmFailure.message}{' '}
                Świat poniżej pochodzi z toru deterministycznego — nie udajemy, że wymyślił go model.
              </p>
            )}
            {outcome.resolved.proposal.rationale !== undefined && (
              <p className="settings-hint">Uzasadnienie propozycji: {outcome.resolved.proposal.rationale}</p>
            )}
          </section>

          <section className="pilot-step">
            <h3>Zaproponowana specyfikacja</h3>
            <dl className="pilot-provenance" data-testid="proposed-specification">
              <div><dt>worldId</dt><dd className="mono">{spec.worldId}</dd></div>
              <div><dt>ziarno</dt><dd className="mono">{spec.seed}</dd></div>
              <div><dt>typ świata</dt><dd className="mono">{spec.worldType.join(', ')}</dd></div>
              {/* `scale` is optional on a WorldSpecification — the deterministic
                  proposer leaves it unset rather than picking one, so an empty
                  cell would read as a rendering bug instead of "not declared". */}
              <div><dt>skala</dt><dd className="mono">{spec.scale ?? 'nie zadeklarowano'}</dd></div>
              <div><dt>populacja</dt><dd className="mono">{spec.population?.count ?? '—'}</dd></div>
              <div><dt>domeny</dt><dd className="mono">{(spec.scientificDomains ?? []).map((d) => `${d.domain}${d.required ? '' : ' (opcjonalna)'}`).join(', ') || '—'}</dd></div>
            </dl>
          </section>

          <section className="pilot-step">
            <h3>Czy Genesis potrafił go zbudować?</h3>
            {outcome.created === null ? (
              <p className="pilot-summary" data-testid="world-create-error">
                ODRZUCONE: {outcome.createError}
              </p>
            ) : (
              <>
                <dl className="pilot-provenance" data-testid="world-created">
                  <div><dt>walidacja</dt><dd className="mono">{outcome.created.validation.ok ? 'OK' : 'BŁĘDY'}</dd></div>
                  <div><dt>encje w grafie</dt><dd className="mono">{outcome.created.specified.graph.listEntities().length}</dd></div>
                  <div><dt>domeny z realnym solverem</dt><dd className="mono">{outcome.created.availableDomains.join(', ') || 'brak'}</dd></div>
                  <div><dt>tick silnika</dt><dd className="mono">{outcome.created.engine.tick}</dd></div>
                  <div><dt>zdarzenia</dt><dd className="mono">{outcome.created.events.length}</dd></div>
                </dl>
                {/* Warnings are where "you asked for X, Genesis has no solver for
                    it" lives — dropping them would make an unmodelled domain
                    look modelled. */}
                {outcome.created.validation.warnings.length > 0 && (
                  <ul className="matrix-relation-list" data-testid="world-validation-warnings">
                    {outcome.created.validation.warnings.map((issue) => (
                      <li key={`${issue.path}:${issue.message}`}><span className="mono">{issue.path}</span> — {issue.message}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
