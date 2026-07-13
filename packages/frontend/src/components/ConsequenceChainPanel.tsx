import { useEffect, useMemo, useRef, useState } from 'react';
import type { LabConsequenceSpec } from '../core/modelGraph/labConsequence';
import { isCrossDomainNode, inputDomains } from '../core/modelGraph/labConsequence';
import { Sonifier, normalizeToFrequency, DEFAULT_FREQ_MIN, DEFAULT_FREQ_MAX, type SonificationMapping } from '../core/sonification';
import type { NodeDerivation, PropagationStep } from '../core/modelGraph/graph';
import type { HonestyLevel } from '../core/types';
import { HonestyBadge } from './HonestyBadge';
import { NodeLens } from './NodeLens';
import {
  listTrials, saveTrial, duplicateTrial, updateTrial, deleteTrial, diffTrials,
  TRIAL_STATUS_LABEL, type Trial, type TrialStatus,
} from '../core/trials';

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

const STATUS_CYCLE: TrialStatus[] = ['draft', 'promising', 'failed', 'baseline'];

export function ConsequenceChainPanel({
  spec,
  honesty,
  honestyNote,
  experimentId,
}: {
  spec: LabConsequenceSpec;
  honesty: HonestyLevel;
  honestyNote: string;
  experimentId: string;
}) {
  const { graph, params, outputs, headline, domainGuard } = spec;
  const [, setVersion] = useState(0);
  const [lastSteps, setLastSteps] = useState<PropagationStep[]>([]);
  const [trials, setTrials] = useState<Trial[]>(() => listTrials(experimentId));
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);
  const [lensNodeId, setLensNodeId] = useState<string | null>(null);
  const [sonifyId, setSonifyId] = useState<string | null>(null);
  const sonifierRef = useRef<Sonifier | null>(null);
  const violation = domainGuard ? domainGuard(graph) : null;

  // Sonifikacja: mapowanie wybranego wyjścia na ton, aktualizowane na żywo.
  const sonifyOutput = sonifyId ? outputs.find((o) => o.id === sonifyId) : null;
  const sonifyMapping: SonificationMapping | null = sonifyOutput?.sonify
    ? {
        sourceLabel: graph.getNode(sonifyOutput.id)?.label ?? sonifyOutput.id,
        unit: graph.getNode(sonifyOutput.id)?.unit ?? '',
        min: sonifyOutput.sonify.min,
        max: sonifyOutput.sonify.max,
        fMin: DEFAULT_FREQ_MIN,
        fMax: DEFAULT_FREQ_MAX,
      }
    : null;
  const sonifiedValue = sonifyId ? graph.getValue(sonifyId) : null;

  useEffect(() => {
    if (sonifiedValue !== null && sonifyMapping && sonifierRef.current?.running) {
      sonifierRef.current.setValue(sonifiedValue, sonifyMapping);
    }
  });

  useEffect(() => {
    return () => { sonifierRef.current?.stop(); sonifierRef.current = null; };
  }, []);

  function toggleSonify(id: string) {
    if (sonifyId === id) {
      sonifierRef.current?.stop();
      sonifierRef.current = null;
      setSonifyId(null);
      return;
    }
    if (!sonifierRef.current) sonifierRef.current = new Sonifier();
    if (!sonifierRef.current.running) sonifierRef.current.start();
    setSonifyId(id);
  }

  function captureState() {
    return {
      params: graph.getParameterSnapshot(),
      outputs: Object.fromEntries(outputs.map((o) => [o.id, graph.getValue(o.id)])),
    };
  }
  function refreshTrials() { setTrials(listTrials(experimentId)); }

  function handleSaveTrial() {
    const s = captureState();
    saveTrial(experimentId, s);
    refreshTrials();
  }
  function handleApplyTrial(t: Trial) {
    const steps = graph.applyParameterSnapshot(t.params);
    if (steps.length > 0) setLastSteps(steps);
    setVersion((v) => v + 1);
  }
  function handleDuplicate(id: string) { duplicateTrial(experimentId, id); refreshTrials(); }
  function handleDelete(id: string) {
    deleteTrial(experimentId, id);
    if (compareA === id) setCompareA(null);
    if (compareB === id) setCompareB(null);
    refreshTrials();
  }
  function cycleStatus(t: Trial) {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(t.status) + 1) % STATUS_CYCLE.length];
    updateTrial(experimentId, t.id, { status: next });
    refreshTrials();
  }
  function toggleCompare(id: string) {
    if (compareA === id) { setCompareA(null); return; }
    if (compareB === id) { setCompareB(null); return; }
    if (!compareA) { setCompareA(id); return; }
    if (!compareB) { setCompareB(id); return; }
    setCompareA(id); setCompareB(null);
  }

  const trialA = compareA ? trials.find((t) => t.id === compareA) : null;
  const trialB = compareB ? trials.find((t) => t.id === compareB) : null;
  const trialDiff = trialA && trialB ? diffTrials(trialA, trialB) : null;

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

      {violation && (
        <div className="domain-violation" role="alert">
          <strong>⚠ Poza granicą ważności modelu.</strong> {violation.message} Policzone wyniki
          w tym zakresie NIE są fizycznie sensowne (mogą być nieoznaczone) — model tu nie obowiązuje.
        </div>
      )}

      {lensNodeId && (
        <NodeLens graph={graph} nodeId={lensNodeId} onSelect={setLensNodeId} onClose={() => setLensNodeId(null)} />
      )}

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
              <button className="output-label lens-trigger" title="Otwórz soczewkę epistemiczną" onClick={() => setLensNodeId(o.id)}>
                🔍 {node.label}
              </button>
              <span className="output-val">{fmt(graph.getValue(o.id), o.format)} {node.unit}</span>
              {o.sonify && (
                <button
                  className={`sonify-btn${sonifyId === o.id ? ' on' : ''}`}
                  aria-pressed={sonifyId === o.id}
                  title="Sonifikuj: zmienna → normalizacja → ton"
                  onClick={() => toggleSonify(o.id)}
                >{sonifyId === o.id ? '🔊' : '🔈'}</button>
              )}
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

      {sonifyMapping && sonifiedValue !== null && (
        <div className="sonify-mapping" aria-live="polite">
          🔊 <strong>{sonifyMapping.sourceLabel}</strong>
          {' → '}normalizacja [{sonifyMapping.min}–{sonifyMapping.max} {sonifyMapping.unit}]
          {' → '}ton {Math.round(normalizeToFrequency(sonifiedValue, sonifyMapping))} Hz
          <span className="sonify-note"> — wysokość = deterministyczna funkcja wartości; przesuń suwak, by usłyszeć zmianę.</span>
        </div>
      )}

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

      <div className="trial-series">
        <div className="section-label">Seria prób — zapisz, porównaj, oznacz</div>
        <div className="trial-intro">
          Każda próba zamraża wejścia i policzone konsekwencje z prowieniencją (który model, jakie parametry).
          To rdzeń pętli odkrycia: przemiataj parametry, oznaczaj obiecujące/nieudane, porównuj — zapisywane lokalnie.
        </div>
        <button className="chip-btn" onClick={handleSaveTrial}>✚ Zapisz bieżący stan jako próbę</button>
        {trials.length > 0 && (
          <div className="trial-list">
            {trials.map((t) => (
              <div key={t.id} className={`trial-row status-${t.status}${t.id === compareA || t.id === compareB ? ' comparing' : ''}`}>
                <span className="trial-idx">#{String(t.index).padStart(3, '0')}</span>
                <span className="trial-label">{t.label}{t.parentId && <span className="trial-fork" title="odbita z innej próby"> ⑂</span>}</span>
                <button className={`trial-status status-${t.status}`} onClick={() => cycleStatus(t)} title="Kliknij, by zmienić status">
                  {TRIAL_STATUS_LABEL[t.status]}
                </button>
                <button className="chip-btn tiny" onClick={() => handleApplyTrial(t)} title="Wczytaj parametry tej próby do modelu">wczytaj</button>
                <button className="chip-btn tiny" aria-pressed={t.id === compareA || t.id === compareB} onClick={() => toggleCompare(t.id)} title="Wybierz do porównania (dwie próby)">⇄</button>
                <button className="chip-btn tiny" onClick={() => handleDuplicate(t.id)} title="Odbij jako nową próbę">odbij</button>
                <button className="chip-btn tiny danger" onClick={() => handleDelete(t.id)} title="Usuń próbę">✕</button>
              </div>
            ))}
          </div>
        )}
        {trialA && trialB && trialDiff && (
          <div className="trial-compare">
            <div className="section-label">Porównanie: #{String(trialA.index).padStart(3, '0')} vs #{String(trialB.index).padStart(3, '0')}</div>
            <div className="trial-compare-block">
              <span className="trial-compare-head">Zmienione parametry</span>
              {trialDiff.params.length === 0 && <div className="trial-compare-row muted">identyczne wejścia</div>}
              {trialDiff.params.map((d) => (
                <div key={d.key} className="trial-compare-row">
                  <span className="reality-log-node">{labelOf(d.key)}</span>
                  <span className="reality-log-val">{fmt(d.a)} → {fmt(d.b)}</span>
                </div>
              ))}
            </div>
            <div className="trial-compare-block">
              <span className="trial-compare-head">Konsekwencje, które się zmieniły</span>
              {trialDiff.outputs.length === 0 && <div className="trial-compare-row muted">identyczne wyniki</div>}
              {trialDiff.outputs.map((d) => (
                <div key={d.key} className="trial-compare-row">
                  <span className="reality-log-node">{labelOf(d.key)}</span>
                  <span className="reality-log-val">{fmt(d.a)} → {fmt(d.b)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
