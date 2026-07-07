import type { ParamDef, SimParams } from '../core/types';

/** Panel kontrolek generowany deklaratywnie z ParamDef[]. */
export function Controls({
  defs,
  params,
  onChange,
}: {
  defs: ParamDef[];
  params: SimParams;
  onChange: (key: string, value: number | boolean | string) => void;
}) {
  if (defs.length === 0) return null;
  return (
    <div className="controls">
      {defs.map((d) => {
        if (d.type === 'toggle') {
          const on = Boolean(params[d.key]);
          return (
            <div className="control toggle-row" key={d.key}>
              <span>{d.label}</span>
              <button
                className="switch"
                role="switch"
                aria-checked={on}
                aria-label={d.label}
                onClick={() => onChange(d.key, !on)}
              />
            </div>
          );
        }
        if (d.type === 'select') {
          const val = String(params[d.key]);
          return (
            <div className="control" key={d.key}>
              <label>{d.label}</label>
              <div className="seg" role="group" aria-label={d.label}>
                {d.options!.map((o) => (
                  <button
                    key={o.value}
                    aria-pressed={val === o.value}
                    onClick={() => onChange(d.key, o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        const v = Number(params[d.key]);
        const shown = d.format ? d.format(v) : `${v.toLocaleString('pl-PL')}${d.unit ? ` ${d.unit}` : ''}`;
        return (
          <div className="control" key={d.key}>
            <label>
              <span>{d.label}</span>
              <span className="val">{shown}</span>
            </label>
            <input
              type="range"
              min={d.min}
              max={d.max}
              step={d.step ?? 1}
              value={v}
              aria-label={d.label}
              onChange={(e) => onChange(d.key, Number(e.target.value))}
            />
          </div>
        );
      })}
    </div>
  );
}

export function defaultParams(defs: ParamDef[]): SimParams {
  const p: SimParams = {};
  for (const d of defs) p[d.key] = d.default;
  return p;
}
