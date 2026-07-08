import { useRef, useState } from 'react';
import type { NarrationBlock } from '../core/types';
import { askAI, type AskContext } from '../narrator/askAI';

/**
 * Panel Narratora AI.
 * Warstwa 0 (bloki): deterministyczny silnik narracji — liczby zawsze stąd.
 * Warstwa 1 ("Zapytaj AI", Etap 2): pytania otwarte przez backend proxy;
 * gdy backendu brak, panel uczciwie to komunikuje, a warstwa 0 działa dalej.
 */
export function NarratorPanel({ blocks, askContext }: { blocks: NarrationBlock[]; askContext?: AskContext }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const submit = async () => {
    const q = question.trim();
    if (!q || !askContext || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setAnswer(null);
    const result = await askAI(askContext, q);
    if (result.ok) setAnswer(result.answer);
    else setError(result.message);
    setBusy(false);
    inFlight.current = false;
  };

  return (
    <section className="narrator" aria-label="Narrator AI">
      <div className="narrator-head">
        <span className="dot" aria-hidden="true" />
        <span className="label">Narrator AI · na żywo</span>
      </div>
      <div className="narrator-blocks">
        {blocks.map((b, i) => (
          <div className={`nblock ${b.kind ?? 'insight'}`} key={i}>
            <div className="ntitle">{b.title}</div>
            <div className="nbody">{b.body}</div>
          </div>
        ))}

        {askContext && (
          <div className="ask-ai">
            <div className="ask-row">
              <input
                type="text"
                value={question}
                maxLength={500}
                placeholder="Zapytaj AI o tę symulację…"
                aria-label="Pytanie do AI"
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
                }}
              />
              <button className="chip-btn" onClick={() => void submit()} disabled={busy || !question.trim()}>
                {busy ? '…' : 'Zapytaj'}
              </button>
            </div>
            {answer && (
              <div className="nblock ask-answer">
                <div className="ntitle">Odpowiedź AI</div>
                <div className="nbody">{answer}</div>
              </div>
            )}
            {error && <div className="ask-error" role="status">{error}</div>}
          </div>
        )}
      </div>
    </section>
  );
}
