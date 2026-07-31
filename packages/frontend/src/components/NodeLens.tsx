import type { ModelGraph } from '../core/modelGraph/graph';
import { HONESTY_LABELS } from '../core/types';
import { isCrossDomainNode, inputDomains } from '../core/modelGraph/labConsequence';

/**
 * Epistemic Lens (Priorytet 7: „UCZYŃ ZAŁOŻENIA WIDOCZNYMI").
 *
 * Uniwersalny interfejs inspekcji prawdy dla dowolnego węzła wykonywalnego
 * Grafu Modeli. Pokazuje WYŁĄCZNIE metadane, które w grafie już są — nic nie
 * wymyśla: wartość, jednostkę, wzór, poziom uczciwości (HonestyLevel), klasę
 * wyprowadzenia (derivation), dziedzinę, wejścia przyczynowe (causedBy),
 * wielkości zależne (downstream) oraz założenia/granice (honestyNote).
 *
 * Kluczowa zdolność z dyrektywy: „podążaj za causedBy wstecz aż do parametru,
 * założenia lub modelu źródłowego" — każde wejście jest klikalne i przenosi
 * soczewkę na ten węzeł, więc można dojść do korzenia łańcucha przyczynowego.
 * Zaprojektowane mobile-first (pełnoszerokościowa karta, duże cele dotykowe).
 */

const DERIVATION_LABEL: Record<string, string> = {
  direct: 'wyprowadzenie dokładne',
  approximate: 'model przybliżony',
  interpretive: 'interpretacja / most',
};

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (v !== 0 && (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3)) return v.toExponential(3);
  return Number.isInteger(v) ? String(v) : v.toFixed(3);
}

export function NodeLens({
  graph,
  nodeId,
  onSelect,
  onClose,
}: {
  graph: ModelGraph;
  nodeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const node = graph.getNode(nodeId);
  if (!node) return null;
  const isParam = node.inputs.length === 0;
  const cross = isCrossDomainNode(graph, node);
  const downstream = graph.getAllNodes().filter((n) => n.inputs.includes(nodeId));

  return (
    <div className="node-lens" role="dialog" aria-label={`Soczewka epistemiczna: ${node.label}`}>
      <div className="node-lens-head">
        <span className="node-lens-eye" aria-hidden="true">🔍</span>
        <span className="node-lens-title">{node.label}</span>
        <button className="chip-btn tiny" onClick={onClose} aria-label="Zamknij soczewkę">✕</button>
      </div>

      <div className="node-lens-value">
        <span className="node-lens-num">{fmt(graph.getValue(nodeId))}</span>
        <span className="node-lens-unit">{node.unit}</span>
      </div>

      <div className="node-lens-chips">
        <span className={`honesty ${node.honesty}`}>{HONESTY_LABELS[node.honesty]}</span>
        <span className={`reality-deriv ${node.derivation}`}>{DERIVATION_LABEL[node.derivation]}</span>
        <span className="lens-domain-chip">{node.domain}</span>
        {isParam && <span className="lens-param-chip">parametr wejściowy</span>}
        {cross && <span className="cross-domain-chip inline">⇄ {inputDomains(graph, node).join(' × ')}</span>}
      </div>

      {node.formula && (
        <div className="node-lens-field">
          <span className="node-lens-key">Wzór / model</span>
          <span className="node-lens-formula">{node.formula}</span>
        </div>
      )}

      <div className="node-lens-field">
        <span className="node-lens-key">Założenia i granice ważności</span>
        <span className="node-lens-note">{node.honestyNote}</span>
      </div>

      {!isParam && (
        <div className="node-lens-field">
          <span className="node-lens-key">Zależy od (podążaj wstecz)</span>
          <div className="node-lens-links">
            {node.inputs.map((inId) => {
              const inNode = graph.getNode(inId);
              return (
                <button key={inId} className="lens-link" onClick={() => onSelect(inId)}>
                  {inNode?.label ?? inId}
                  {inNode && inNode.inputs.length === 0 && <span className="lens-link-tag"> · parametr</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {downstream.length > 0 && (
        <div className="node-lens-field">
          <span className="node-lens-key">Wpływa na (konsekwencje)</span>
          <div className="node-lens-links">
            {downstream.map((n) => (
              <button key={n.id} className="lens-link" onClick={() => onSelect(n.id)}>{n.label}</button>
            ))}
          </div>
        </div>
      )}

      {isParam && downstream.length === 0 && (
        <div className="node-lens-note">Ten parametr jest korzeniem — nie ma wejść przyczynowych.</div>
      )}
    </div>
  );
}
