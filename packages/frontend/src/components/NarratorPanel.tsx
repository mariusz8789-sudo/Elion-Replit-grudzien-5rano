import type { NarrationBlock } from '../core/types';

/**
 * Panel Narratora AI. W Etapie 0 treść generuje lokalny silnik narracji
 * (narrator/engine.ts) — reaguje na żywe parametry symulacji. Architektura
 * przewiduje podmianę providera na LLM w Etapie 1 bez zmian w tym komponencie.
 */
export function NarratorPanel({ blocks }: { blocks: NarrationBlock[] }) {
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
      </div>
    </section>
  );
}
