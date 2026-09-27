/**
 * Charts — self-contained, dependency-free SVG data-visualisations (V5 design system).
 *
 * No charting library, no CDN: the app is an offline PWA under a strict no-external-
 * request policy. Each chart is a pure function of its props → deterministic SVG,
 * theme-aware via currentColor / CSS custom properties, and accessible (role=img +
 * <title>). The maths (path building, polar mapping) lives in ./chartMath so it is
 * unit-tested without a DOM.
 */
import type { CSSProperties } from 'react';
import { sparklinePath, sparklineArea, donutSegments, radarPoints, niceTicks, polar } from './chartMath';

const AXIS = 'var(--border-strong, rgba(160,178,220,0.3))';
const DIM = 'var(--text-dim, #8d97b4)';

/* ---------------- Sparkline ---------------- */
export function Sparkline({ values, width = 120, height = 34, color = 'var(--cyan)', fill = true, strokeWidth = 1.6, label }: {
  values: number[]; width?: number; height?: number; color?: string; fill?: boolean; strokeWidth?: number; label?: string;
}) {
  if (!values.length) return null;
  const pad = 2;
  const line = sparklinePath(values, width, height, pad);
  const area = fill ? sparklineArea(values, width, height, pad) : null;
  const gid = `spark-${Math.round(width)}x${Math.round(height)}-${values.length}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? 'trend'} style={{ display: 'block' }}>
      {label ? <title>{label}</title> : null}
      {area ? (
        <>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <path d={area} fill={`url(#${gid})`} stroke="none" />
        </>
      ) : null}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------- Donut ---------------- */
export function Donut({ data, size = 132, thickness = 16, centerLabel, centerSub }: {
  data: { label: string; value: number; color: string }[]; size?: number; thickness?: number; centerLabel?: string; centerSub?: string;
}) {
  const r = (size - thickness) / 2;
  const c = size / 2;
  const segs = donutSegments(data.map((d) => d.value), r, thickness);
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="distribution">
        <g transform={`translate(${c} ${c}) rotate(-90)`}>
          <circle r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth={thickness} />
          {segs.map((s, i) => (
            <circle key={i} r={r} fill="none" stroke={data[i].color} strokeWidth={thickness}
              strokeDasharray={s.dash} strokeDashoffset={s.offset} strokeLinecap="butt" />
          ))}
        </g>
        {centerLabel ? <text x={c} y={c - 2} textAnchor="middle" fontSize="1.05rem" fontWeight="700" fill="var(--text)">{centerLabel}</text> : null}
        {centerSub ? <text x={c} y={c + 15} textAnchor="middle" fontSize="0.62rem" fill={DIM}>{centerSub}</text> : null}
      </svg>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.76rem' }}>
        {data.map((d, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: DIM }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color, flex: '0 0 auto' }} />
            <span style={{ color: 'var(--text)' }}>{d.label}</span>
            <span style={{ marginLeft: 'auto', color: DIM }}>{total > 0 ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- Radar (multi-axis, e.g. ADMET) ---------------- */
export function RadarChart({ axes, size = 220, color = 'var(--violet)' }: {
  axes: { label: string; value: number }[]; size?: number; color?: string;
}) {
  if (axes.length < 3) return null;
  const c = size / 2;
  const r = c - 34;
  const rings = [0.25, 0.5, 0.75, 1];
  const pts = radarPoints(axes.map((a) => Math.max(0, Math.min(1, a.value))), c, r);
  const poly = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="multi-axis profile">
      {rings.map((rr, i) => (
        <polygon key={i} points={radarPoints(axes.map(() => rr), c, r).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="none" stroke={AXIS} strokeWidth="0.75" opacity={0.6} />
      ))}
      {axes.map((a, i) => {
        const p = polar(c, r, i, axes.length);
        const lp = polar(c, r + 16, i, axes.length);
        return (
          <g key={i}>
            <line x1={c} y1={c} x2={p.x} y2={p.y} stroke={AXIS} strokeWidth="0.5" opacity={0.5} />
            <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fontSize="0.6rem" fill={DIM}>{a.label}</text>
          </g>
        );
      })}
      <polygon points={poly} fill={color} fillOpacity="0.22" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.4" fill={color} />)}
    </svg>
  );
}

/* ---------------- Horizontal bars (e.g. ranking) ---------------- */
export function BarList({ data, max, unit = '', height = 20 }: {
  data: { label: string; value: number; color?: string }[]; max?: number; unit?: string; height?: number;
}) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(80px, 30%) 1fr auto', gap: '0.6rem', alignItems: 'center', fontSize: '0.76rem' }}>
          <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.label}>{d.label}</span>
          <span style={{ height, background: 'var(--bg-elevated)', borderRadius: 5, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.max(2, (d.value / top) * 100)}%`, background: d.color ?? 'var(--cyan)', borderRadius: 5, transition: 'width var(--dur-base, 0.26s) var(--ease-out)' }} />
          </span>
          <span style={{ color: DIM, fontVariantNumeric: 'tabular-nums' }}>{d.value}{unit}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Area chart with axis (e.g. pipeline value) ---------------- */
export function AreaChart({ values, labels, width = 320, height = 130, color = 'var(--cyan)', unitPrefix = '' }: {
  values: number[]; labels?: string[]; width?: number; height?: number; color?: string; unitPrefix?: string;
}) {
  if (values.length < 2) return null;
  const padL = 38, padB = 18, padT = 8, padR = 6;
  const w = width - padL - padR, h = height - padT - padB;
  const max = Math.max(...values), min = Math.min(0, ...values);
  const ticks = niceTicks(min, max, 3);
  const x = (i: number) => padL + (i / (values.length - 1)) * w;
  const y = (v: number) => padT + h - ((v - min) / (max - min || 1)) * h;
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(values.length - 1).toFixed(1)} ${padT + h} L${padL} ${padT + h} Z`;
  const gid = `area-${width}x${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="time series" style={{ maxWidth: '100%' }}>
      <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.3" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </linearGradient>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={y(t)} x2={width - padR} y2={y(t)} stroke={AXIS} strokeWidth="0.5" opacity={0.5} />
          <text x={padL - 5} y={y(t) + 3} textAnchor="end" fontSize="0.58rem" fill={DIM}>{unitPrefix}{formatTick(t)}</text>
        </g>
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      {labels ? labels.map((l, i) => i % Math.ceil(labels.length / 6) === 0 ? (
        <text key={i} x={x(i)} y={height - 4} textAnchor="middle" fontSize="0.56rem" fill={DIM}>{l}</text>
      ) : null) : null}
    </svg>
  );
}

function formatTick(t: number): string {
  if (Math.abs(t) >= 1e9) return `${(t / 1e9).toFixed(1)}B`;
  if (Math.abs(t) >= 1e6) return `${(t / 1e6).toFixed(0)}M`;
  if (Math.abs(t) >= 1e3) return `${(t / 1e3).toFixed(0)}K`;
  return `${t}`;
}

/* ---------------- KPI stat card ---------------- */
export function StatCard({ label, value, sub, accent = 'var(--cyan)', spark, style }: {
  label: string; value: string | number; sub?: string; accent?: string; spark?: number[]; style?: CSSProperties;
}) {
  return (
    <div className="ds-stat" style={style}>
      <span className="ds-stat-label">{label}</span>
      <span className="ds-stat-value" style={{ color: accent }}>{value}</span>
      {sub ? <span className="ds-stat-sub">{sub}</span> : null}
      {spark && spark.length > 1 ? <div className="ds-stat-spark"><Sparkline values={spark} width={150} height={30} color={accent} /></div> : null}
    </div>
  );
}
