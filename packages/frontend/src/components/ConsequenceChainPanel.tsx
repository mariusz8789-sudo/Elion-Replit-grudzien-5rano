import { useMemo, useState } from 'react';
import type { LabConsequenceSpec } from '../core/modelGraph/labConsequence';
import { isCrossDomainNode, inputDomains } from '../core/modelGraph/labConsequence';
import type { NodeDerivation, PropagationStep } from '../core/modelGraph/graph';
import type { HonestyLevel } from '../core/types';
import { HonestyBadge } from './HonestyBadge';

/**
 * Współdzielony panel „eksperyment = graf konsekwencji" (Priorytet 1 roadmapy).
 *
 * Renderuje DOWOLNY laboratoryjny graf modeli: suwaki parametrów → realna
 * propagacja przez wykonywalny graf → policzone wyjścia z etykietą wyprowadzenia
 * → łańcuch przyczynowy (causedBy) w kolejności faktycznego przeliczania.
 * Krawędzie międzydziedzinowe są wykrywane strukturalnie (z pól `domain`) i
 * wyraźnie oznaczane — to jest dokładnie ten mechanizm, którego 13 laboratoriów
 * dotąd nie miało. Zero nowej fizyki: wszystko pochodzi z gotowych builderów
 * grafów (te same, wcześniej przetestowane wzory).
 */

const DERIVATION_LABEL: Record<NodeDerivation, string> = {
  direct: 'wyprowadzenie dokładne',
  approximate: 'model przybliżony',
  interpretive: 'interpretacja / most',
};

function fmt(v: number, format?: (v: number) => string): string {
  if (format) return format(v);
  if (!Number.isFinite(v)) return '—';
  if (v !== 0 && (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3)) return v.toExponential(2);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export function ConsequenceChainPanel({
  spec,
  honesty,
  honestyNote,
}: {
  spec: LabConsequenceSpec;
  honesty: HonestyLevel;
  honestyNote: string;
}) {
  const { graph, params, outputs, headline } = spec;
  const [, setVersion] = useState(0);
  const [lastSteps, setLastSteps] = useState<PropagationStep[]>([]);

  // Wykryj krawędzie międzydziedzinowe raz (struktura grafu jest niezmienna).
  const crossDomainIds = useMemo(() => {
    const set = new Set<string>();
    for (const o of outputs) {
      const node = graph.getNode(o.id);
      if (node && isCrossDomainNode(graph, node)) set.add(o.id);
    }
    return set;
  }, [graph, outputs]);

  function applyParam(id: string, value: number) {
    const steps = graph.setParameter(id, value);
    if (steps.length > 0) setLastSteps(steps);
    setVersion((v) => v + 1);
  }

  const labelOf = (id: string) => graph.getNode(id)?.label ?? id;

  return (
    <div className="consequence-panel">
      <HonestyBadge level={honesty} note={honestyNote} />
      <div className="consequence-headline">{headline}</div>

      <div className="section-label">Parametry — dotknij, konsekwencje policzą się same</div>
      {params.map((p) => {
        const node = graph.getNode(p.id);
        const val = graph.getValue(p.id);
        return (
          <div className="control" key={p.id}>
            <label htmlFor={`cc-${p.id}`}>
              {node?.label ?? p.id} — {fmt(val, p.format)} {node?.unit}
            </label>
            <input
              id={`cc-${p.id}`}
              type="range"
              min={p.min}
              max={p.max}
              step={p.step}
              value={val}
              onChange={(e) => applyParam(p.id, Number(e.target.value))}
            />
          </div>
        );
      })}

      <div className="section-label">Policzone konsekwencje</div>
      <div className="consequence-outputs">
        {outputs.map((o) => {
          const node = graph.getNode(o.id);
          if (!node) return null;
          const isCross = crossDomainIds.has(o.id);
          return (
            <div key={o.id} className={`output-row deriv-${node.derivation}${isCross ? ' cross-domain' : ''}`}>
              <span className="output-label" title={node.honestyNote}>{node.label}</span>
              <span className="output-val">{fmt(graph.getValue(o.id), o.format)} {node.unit}</span>
              <span className={`reality-deriv ${node.derivation}`}>{DERIVATION_LABEL[node.derivation]}</span>
              {isCross && (
                <span className="cross-domain-chip" title={`Ten wynik łączy dziedziny: ${inputDomains(graph, node).join(' + ')}`}>
                  ⇄ międzydziedzinowa: {inputDomains(graph, node).join(' × ')}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {lastSteps.length > 0 && (
        <div className="reality-log" aria-label="Łańcuch konsekwencji">
          <div className="section-label">Łańcuch przyczynowy — co się zmieniło i dlaczego</div>
          {lastSteps.map((s) => {
            const node = graph.getNode(s.nodeId);
            const causes = s.causedBy.map((c) => labelOf(c));
            return (
              <div key={s.nodeId} className={`reality-log-row deriv-${node?.derivation ?? 'direct'}`}>
                <div className="reality-log-main">
                  <span className="reality-log-node">{node?.label ?? s.nodeId}</span>
                  <span className="reality-log-val">{fmt(s.previousValue)} → {fmt(s.value)} {node?.unit}</span>
                </div>
                <div className="reality-log-meta">
                  <span className={`reality-deriv ${node?.derivation ?? 'direct'}`}>
                    {DERIVATION_LABEL[node?.derivation ?? 'direct']}
                  </span>
                  {causes.length > 0 && <span className="reality-cause">← bo zmieniło się: {causes.join(', ')}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
