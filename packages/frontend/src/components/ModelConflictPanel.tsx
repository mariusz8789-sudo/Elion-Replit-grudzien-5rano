import { useMemo, useState } from 'react';
import { buildFrictionConflict, evaluateConflict, type ModelConflict } from '../core/mcre';
import { HonestyBadge } from './HonestyBadge';

/**
 * MCRE UI (priorytet 2). Pokazuje dwa uznane modele tej samej wielkości, wykrywa
 * konflikt, oznacza dziedziny ważności i — gdy modele się nie zgadzają — jawnie
 * mówi „NIE WIEMY, który lepiej opisuje ten przypadek" oraz wskazuje pomiar, który
 * to rozstrzygnie. Nie wybiera po cichu żadnego modelu.
 */
function fmt(v: number, f?: (v: number) => string): string {
  if (!Number.isFinite(v)) return '—';
  if (f) return f(v);
  return v.toFixed(3);
}

export function ModelConflictPanel({ conflict: passed }: { conflict?: ModelConflict } = {}) {
  const conflict = useMemo(() => passed ?? buildFrictionConflict(), [passed]);
  const [params, setParams] = useState<Record<string, number>>(() => {
    const base: Record<string, number> = {};
    for (const p of conflict.params) base[p.id] = conflict.variants[0].graph.getValue(p.id);
    return base;
  });

  const result = evaluateConflict(conflict, params);

  function setParam(id: string, value: number) {
    setParams((p) => ({ ...p, [id]: value }));
  }

  return (
    <div className="mcre-panel">
      <HonestyBadge
        level="simplified"
        note="Dwie powszechnie stosowane korelacje empiryczne tej samej wielkości. Obie liczy wykonywalny Graf Modeli na identycznych parametrach. MCRE nie rozstrzyga sporu za Ciebie — pokazuje, gdzie i dlaczego modele się różnią, i co zmierzyć."
      />
      <div className="consequence-headline">{conflict.headline}</div>

      <div className="section-label">Parametry (wspólne dla obu modeli)</div>
      {conflict.params.map((p) => (
        <div className="control" key={p.id}>
          <label htmlFor={`mc-${p.id}`}>{p.label} — {fmt(params[p.id] ?? 0, p.format)} {p.unit}</label>
          <input id={`mc-${p.id}`} type="range" min={p.min} max={p.max} step={p.step}
            value={params[p.id] ?? p.min} onChange={(e) => setParam(p.id, Number(e.target.value))} />
        </div>
      ))}

      <div className={`mcre-verdict ${result.conflictDetected ? 'conflict' : 'agree'}`} role="status">
        {result.conflictDetected ? (
          <>
            <strong>⚠ WYKRYTO KONFLIKT MODELI.</strong> Modele istotnie się różnią (pierwsza rozbieżność:{' '}
            {result.outputs.find((o) => o.id === result.firstDivergentId)?.label}). NIE WIEMY z samego obliczenia,
            który lepiej opisuje TĘ rurę — to zależy od rzeczywistej chropowatości, którą trzeba zmierzyć.
          </>
        ) : (
          <><strong>✓ Modele zgodne</strong> w bieżącym zakresie (rozrzut poniżej progu). Zwiększ chropowatość, by zobaczyć, jak się rozjeżdżają.</>
        )}
      </div>

      <div className="section-label">Porównanie predykcji</div>
      <div className="mcre-table">
        <div className="mcre-row mcre-head">
          <span className="mcre-cell">Wielkość</span>
          {conflict.variants.map((v) => <span key={v.id} className="mcre-cell">{v.label}</span>)}
          <span className="mcre-cell">rozrzut</span>
        </div>
        {result.outputs.map((o) => (
          <div key={o.id} className={`mcre-row${o.id === result.firstDivergentId ? ' first-divergent' : ''}${o.divergent ? ' divergent' : ''}`}>
            <span className="mcre-cell mcre-label">{o.label}{o.unit ? ` [${o.unit}]` : ''}</span>
            {o.values.map((val) => {
              const spec = conflict.outputs.find((x) => x.id === o.id);
              return <span key={val.variantId} className="mcre-cell mcre-val">{fmt(val.value, spec?.format)}</span>;
            })}
            <span className="mcre-cell mcre-spread">{(o.spread * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>

      <div className="section-label">Założenia i dziedziny ważności</div>
      {conflict.variants.map((v) => (
        <div key={v.id} className={`mcre-variant${result.inDomain[v.id] ? '' : ' out-of-domain'}`}>
          <div className="mcre-variant-head">
            <span className="mcre-variant-name">{v.label}</span>
            <span className={`mcre-domain-badge ${result.inDomain[v.id] ? 'in' : 'out'}`}>
              {result.inDomain[v.id] ? 'w dziedzinie ważności' : 'POZA dziedziną ważności'}
            </span>
          </div>
          <div className="mcre-variant-note"><strong>Założenia:</strong> {v.assumptions}</div>
          <div className="mcre-variant-note"><strong>Ważny gdy:</strong> {v.applicableDomain}</div>
        </div>
      ))}

      <div className="section-label">Co zmierzyć, by rozstrzygnąć</div>
      <div className="measure-item">
        <span className="measure-icon" aria-hidden="true">📏</span>
        <span>{conflict.resolvingMeasurement}</span>
      </div>
    </div>
  );
}
