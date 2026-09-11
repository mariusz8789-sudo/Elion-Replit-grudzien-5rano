import { useMemo, useState } from 'react';
import { GenesisDeciphermentOrchestrator } from '../core/agent/decipherment/deciphermentOrchestrator';
import { buildGlyphSequence } from '../core/agent/decipherment/glyphAnalysis';
import { toDeciphermentCaseResult, type GlyphSequence, type GlyphToken, type ReadingSpec, type DeciphermentCaseState } from '../core/agent/decipherment/deciphermentTypes';
import type { HypothesisAssessment } from '../core/experimentFabric/scientificDiscovery';
import { buildSavedDeciphermentCase, saveDeciphermentCaseToMemory } from '../core/scienceMemory';

/**
 * DECIPHERMENT WORKSPACE — the UI for `core/agent/decipherment/`, built the
 * same way `CyberWorkspace.tsx` was: run the REAL orchestrator in the
 * browser, render exactly what it produced. No score is invented for
 * display, no verdict is smoothed over.
 *
 * INPUT: an already-segmented glyph sequence. Genesis has no OCR/image
 * pipeline anywhere in the repo — confirmed by search before this domain
 * was designed — so "load an artefact" here means typing or pasting a
 * transcription, one glyph per character, never uploading an image. A
 * demo sequence is provided so the loop can be exercised without typing.
 *
 * WHAT IS DELIBERATELY PRESERVED: `conflicts` — a reading hypothesis whose
 * assessment history holds both SUPPORTED_WITHIN_PROTOCOL and
 * FALSIFIED_WITHIN_PROTOCOL is shown as a conflict, never averaged into one
 * confident reading. Same rule as Cyber's `conflicts`.
 */

const ASSESSMENT_LABEL: Record<HypothesisAssessment, string> = {
  CANDIDATE: 'kandydat',
  SUPPORTED_WITHIN_PROTOCOL: 'potwierdzona w protokole',
  FALSIFIED_WITHIN_PROTOCOL: 'obalona w protokole',
  INCONCLUSIVE: 'nierozstrzygnięta',
};
const ASSESSMENT_CLASS: Record<HypothesisAssessment, string> = {
  CANDIDATE: 'cy-verdict-candidate',
  SUPPORTED_WITHIN_PROTOCOL: 'cy-verdict-supported',
  FALSIFIED_WITHIN_PROTOCOL: 'cy-verdict-falsified',
  INCONCLUSIVE: 'cy-verdict-inconclusive',
};

/** Classic pedagogical Caesar example (shift=3): "ATTACKATDAWN" -> "DWWDFNDWGDZQ". Entirely synthetic/toy. */
export const DEMO_CIPHERTEXT = 'DWWDFNDWGDZQ';

/** Exported so Science Chat's inline "run decipherment" intent reuses this exact conversion instead
 * of a second copy — see resolveCommand.ts's 'runDecipherment' action and its handler in ScienceChat.tsx. */
export function sequenceFromText(text: string, sourceKind: GlyphSequence['sourceKind']): GlyphSequence {
  const glyphs: GlyphToken[] = [...text].map((ch, i) => ({
    symbol: ch === '?' ? '¿' : ch.toUpperCase(),
    position: i,
    damaged: ch === '?',
    provenance: ch === '?' ? 'RECONSTRUCTED' : 'OBSERVED',
  }));
  return buildGlyphSequence(`seq:${sourceKind}:${text.length}`, sourceKind, glyphs);
}

/** Three competing readings: no key (baseline), and two rival Caesar shifts. Real rivals, not a strawman. */
export function demoReadingSpecs(): readonly ReadingSpec[] {
  return [
    { label: 'A — bez klucza (linia bazowa)', cipherModelId: 'CAESAR', candidateKey: null, assumptions: ['identity pass: no decryption applied'] },
    { label: 'B — Cezar, przesunięcie 3', cipherModelId: 'CAESAR', candidateKey: { kind: 'CAESAR', shift: 3 }, assumptions: [] },
    { label: 'C — Cezar, przesunięcie 7', cipherModelId: 'CAESAR', candidateKey: { kind: 'CAESAR', shift: 7 }, assumptions: [] },
  ];
}

export function DeciphermentWorkspace(): JSX.Element {
  const [input, setInput] = useState(DEMO_CIPHERTEXT);
  const [state, setState] = useState<DeciphermentCaseState | null>(null);
  const [openReadingId, setOpenReadingId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const run = (): void => {
    const text = input.trim();
    if (text.length < 4) return;
    setRunning(true);
    setSaveNote(null);
    try {
      const sourceKind: GlyphSequence['sourceKind'] = text === DEMO_CIPHERTEXT ? 'SYNTHETIC' : 'HUMAN_TRANSCRIPTION';
      const sequence = sequenceFromText(text, sourceKind);
      const orchestrator = new GenesisDeciphermentOrchestrator(sequence, { seed: sequence.glyphs.length, modelVersion: '1.0.0', readingSpecs: demoReadingSpecs() });
      setState(orchestrator.runFullLoop());
    } finally {
      setRunning(false);
    }
  };

  const save = (): void => {
    if (!state) return;
    try {
      const result = toDeciphermentCaseResult(state);
      const saved = buildSavedDeciphermentCase(result);
      saveDeciphermentCaseToMemory(saved);
      setSaveNote(`Zapisano do Pamięci Naukowej: ${saved.result.caseId}`);
    } catch (err) {
      setSaveNote(`Nie udało się zapisać: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const verdictCounts = useMemo(() => {
    if (!state) return null;
    const counts = new Map<HypothesisAssessment, number>();
    for (const h of state.hypotheses) counts.set(h.assessment, (counts.get(h.assessment) ?? 0) + 1);
    return counts;
  }, [state]);

  return (
    <main className="cy-workspace" id="main-content" tabIndex={-1}>
      <header className="cy-head">
        <span className="dash-eyebrow">Genesis · Decipherment</span>
        <h1 className="dash-title">Laboratorium deszyfracji</h1>
        <p className="dash-subtitle">
          Klasyczna kryptoanaliza i analiza nieznanych symboli, na realnym silniku Genesis:
          OBSERWACJA → EKSTRAKCJA GLIFÓW → ANALIZA WZORCÓW → HIPOTEZY → KONKURENCYJNE ODCZYTY → TEST → FALSYFIKACJA → WERDYKT.
          Wejście to <strong>już posegmentowana sekwencja glifów</strong> — Genesis nie ma nigdzie pipeline'u OCR,
          więc wpisujesz transkrypcję (jeden znak = jeden glif), nigdy obraz. Modele szyfrów są klasyczne/edukacyjne —
          bez realnych kont, sieci ani współczesnych systemów bezpieczeństwa.
        </p>
      </header>

      <div className="cy-controls">
        <label className="cy-toggle" style={{ flex: '1 1 20rem' }}>
          <span style={{ marginRight: '0.5rem' }}>Sekwencja (znak = glif, „?" = uszkodzony):</span>
          <input
            className="generator-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ width: '100%', marginTop: '0.3rem' }}
          />
        </label>
        <button className="dash-btn dash-btn-primary" onClick={run} disabled={running || input.trim().length < 4}>
          {running ? 'Uruchamiam…' : '▶ Uruchom dochodzenie'}
        </button>
        <button className="dash-btn" onClick={() => setInput(DEMO_CIPHERTEXT)}>Załaduj przykład (Cezar, toy)</button>
      </div>

      {!state ? (
        <section className="cy-block cy-intro">
          <h2>Co zobaczysz po uruchomieniu</h2>
          <ul className="locked-caps">
            <li><span aria-hidden="true">◆</span>Realną analizę wzorców: częstość symboli, powtórzenia, możliwe separatory</li>
            <li><span aria-hidden="true">◆</span>Konkurencyjne odczyty (A/B/C) z przejrzystym, jawnym wzorem punktacji — nigdy czarną skrzynką</li>
            <li><span aria-hidden="true">◆</span>Hipotezy z prawdziwymi falsyfikatorami — każda mówi, co by ją obaliło</li>
            <li><span aria-hidden="true">◆</span>Test typu holdout: klucz dekoduje ODŁOŻONĄ część sekwencji, niezależną od tego, na czym liczono wynik hipotezy — to może realnie się nie udać</li>
            <li><span aria-hidden="true">◆</span>Konflikty zachowane, nie uśrednione</li>
          </ul>
          <p className="locked-note">Domyślna sekwencja to podręcznikowy przykład Cezara (przesunięcie 3) — celowo toy, żeby dwie rywalizujące hipotezy (przesunięcie 3 i 7) miały się o co spierać.</p>
        </section>
      ) : (
        <>
          <section className="cy-summary">
            <div className="dash-tile"><span className="dash-tile-count">{state.sequence.glyphs.length}</span><span className="dash-tile-label">Glify</span><span className="dash-tile-hint">wejście, nie obraz</span></div>
            <div className="dash-tile"><span className="dash-tile-count">{state.readings.length}</span><span className="dash-tile-label">Odczyty</span><span className="dash-tile-hint">konkurencyjne</span></div>
            <div className="dash-tile"><span className="dash-tile-count">{state.testsRun.length}</span><span className="dash-tile-label">Testy</span><span className="dash-tile-hint">holdout, niezależne</span></div>
            <div className="dash-tile"><span className="dash-tile-count">{state.conflicts.length}</span><span className="dash-tile-label">Konflikty</span><span className="dash-tile-hint">potwierdzona i obalona naraz</span></div>
          </section>

          {verdictCounts && verdictCounts.size > 0 && (
            <section className="cy-block">
              <h2>Werdykty</h2>
              <ul className="cy-verdict-list">
                {[...verdictCounts.entries()].map(([assessment, count]) => (
                  <li key={assessment}><span className={`cy-verdict ${ASSESSMENT_CLASS[assessment]}`}>{ASSESSMENT_LABEL[assessment]}</span><span className="mono">{count}</span></li>
                ))}
              </ul>
            </section>
          )}

          {state.conflicts.length > 0 && (
            <section className="cy-block cy-conflicts">
              <h2>Konflikty — zachowane, nie uśrednione</h2>
              <p className="cy-why">Te hipotezy mają w historii zarówno SUPPORTED, jak i FALSIFIED. Nie zamieniamy tego w jedną pewną liczbę.</p>
              <ul className="cy-conflict-list">
                {state.conflicts.map((c) => (
                  <li key={c.conflictId}><strong className="mono">{c.hypothesisId}</strong><span className="mono">{c.history.map((a) => ASSESSMENT_LABEL[a]).join(' → ')}</span></li>
                ))}
              </ul>
            </section>
          )}

          <section className="cy-block">
            <h2>Konkurencyjne odczyty</h2>
            <ul className="cy-hyp-list">
              {state.readings.map((r) => {
                const hyp = state.hypotheses.find((h) => h.readingId === r.readingId);
                const expanded = openReadingId === r.readingId;
                return (
                  <li key={r.readingId}>
                    <button className="cy-step-head" style={{ width: '100%' }} onClick={() => setOpenReadingId(expanded ? null : r.readingId)} aria-expanded={expanded}>
                      <span className="cy-kind">{r.cipherModelId}</span>
                      <span className="cy-step-hyp">{r.label}</span>
                      {hyp && <span className={`cy-verdict ${ASSESSMENT_CLASS[hyp.assessment]}`}>{ASSESSMENT_LABEL[hyp.assessment]}</span>}
                      <span className="cy-step-score">fit {r.structuralFit}</span>
                    </button>
                    {expanded && (
                      <div className="cy-step-body">
                        <section className="cy-block">
                          <h4>Zdekodowany wynik</h4>
                          <p className="cy-why mono">{r.output}</p>
                          <dl className="cy-kv">
                            <div><dt>structuralFit</dt><dd className="mono">{r.structuralFit}</dd></div>
                            <div><dt>linguisticFit (TOY)</dt><dd className="mono">{r.linguisticFit}</dd></div>
                            <div><dt>nierozwiązane glify</dt><dd className="mono">{r.unresolvedGlyphs}</dd></div>
                            <div><dt>status epistemiczny</dt><dd className="mono">{r.epistemicStatus}</dd></div>
                          </dl>
                        </section>
                        {hyp && (
                          <section className="cy-block">
                            <h4>Falsyfikator</h4>
                            <p className="cy-falsifier">Przewidywana obserwacja: {hyp.falsifier.predictedObservable}</p>
                            <p className="cy-falsifier">Obaliłaby ją: {hyp.falsifier.falsifyingObservable}</p>
                            {hyp.supportingObservations.length > 0 && <p className="cy-ok">Potwierdzenia: {hyp.supportingObservations.join('; ')}</p>}
                            {hyp.contradictions.length > 0 && <p className="cy-warn">Obalenia: {hyp.contradictions.join('; ')}</p>}
                          </section>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="cy-block">
            <div className="cy-controls">
              <button className="dash-btn dash-btn-primary" onClick={save}>Zapisz do Pamięci Naukowej</button>
              {saveNote && <span className="cy-why">{saveNote}</span>}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export default DeciphermentWorkspace;
