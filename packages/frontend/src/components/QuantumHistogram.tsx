import { formatPct, quantumAriaLabel, type QuantumHistogramData } from '../core/scienceChat/quantumTurn';

/**
 * Histogram for a `/quantum` chat turn: one `.quantum-bar` per outcome, sorted by bitstring, width
 * proportional to its count, with the sampled share next to the exact model probability (when the
 * backend supplied one). The header repeats where the job ran and what the label means, so a
 * MODEL_ESTIMATE can never be read as a measurement.
 */
export function QuantumHistogram({ data }: { data: QuantumHistogramData }) {
  return (
    <div className="quantum-hist" role="img" aria-label={quantumAriaLabel(data)} data-label={data.label} data-executed-on={data.executedOn}>
      <div className="quantum-hist-head">
        <span className={`quantum-hist-label quantum-hist-${data.label.toLowerCase()}`}>{data.label}</span>
        <span className="quantum-hist-meta">{data.executedOn} · {data.shots} shots · seed {data.seed}</span>
      </div>
      {data.bars.map((b) => (
        <div key={b.bitstring} className="quantum-row">
          <code className="quantum-bit">{b.bitstring}</code>
          <div className="quantum-track">
            <div className="quantum-bar" style={{ width: `${b.widthPct}%` }} data-bitstring={b.bitstring} data-count={b.count} />
          </div>
          <span className="quantum-val">
            {b.count} · {formatPct(b.sampledPct)}
            {b.modelPct !== null && <span className="quantum-model"> (model {formatPct(b.modelPct)})</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
