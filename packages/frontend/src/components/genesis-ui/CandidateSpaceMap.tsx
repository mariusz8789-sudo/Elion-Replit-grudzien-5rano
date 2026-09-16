import type React from 'react';
import type { CandidateSpaceEntry } from '../../core/orchestrator/winnerRecord';

/**
 * CandidateSpaceMap — every scored candidate of one run on a real 2-axis map
 * (D-117): x = efficacy score, y = safety score, both exactly as
 * `rankForLowerHarm` computed them. Eliminated candidates stay on the map
 * with the class of their real elimination reason; TOP2 is ringed. The map
 * computes nothing — it only plots numbers the pipeline already produced.
 */

export type EliminationClass = 'QUALIFIES' | 'SAFETY_VETO' | 'BELOW_FLOOR' | 'INSUFFICIENT_EVIDENCE' | 'OTHER';

export function classifyElimination(c: CandidateSpaceEntry): EliminationClass {
  if (c.qualifies) return 'QUALIFIES';
  const reason = c.eliminationReason ?? '';
  if (c.vetoed || /safety veto/i.test(reason)) return 'SAFETY_VETO';
  if (c.efficacyFloor.status === 'BELOW_FLOOR') return 'BELOW_FLOOR';
  if (/^INSUFFICIENT_EVIDENCE/.test(reason) || /NO_.*EVIDENCE/.test(c.efficacyFloor.status)) return 'INSUFFICIENT_EVIDENCE';
  return 'OTHER';
}

const CLASS_LABEL: Readonly<Record<EliminationClass, string>> = {
  QUALIFIES: 'clears floor + veto',
  SAFETY_VETO: 'existential safety veto',
  BELOW_FLOOR: 'below efficacy floor',
  INSUFFICIENT_EVIDENCE: 'insufficient evidence',
  OTHER: 'eliminated',
};

const W = 640;
const H = 340;
const PAD = { l: 56, r: 20, t: 16, b: 44 };

function scaleLinear(v: number, min: number, max: number, a: number, b: number): number {
  return max === min ? (a + b) / 2 : a + ((v - min) / (max - min)) * (b - a);
}

export function CandidateSpaceMap({ candidates }: { readonly candidates: readonly CandidateSpaceEntry[] }): React.ReactElement {
  const xs = candidates.map((c) => c.efficacyScore);
  const ys = candidates.map((c) => c.safetyScore);
  const xMin = Math.min(-1, ...xs); const xMax = Math.max(1, ...xs);
  const yMin = Math.min(-1, ...ys); const yMax = Math.max(1, ...ys);
  const x = (v: number): number => scaleLinear(v, xMin, xMax, PAD.l, W - PAD.r);
  const y = (v: number): number => scaleLinear(v, yMin, yMax, H - PAD.b, PAD.t);
  const zeroX = x(0); const zeroY = y(0);
  const classes = new Set(candidates.map(classifyElimination));
  return (
    <figure className="gu-cmap" data-testid="candidate-space-map">
      <svg viewBox={`0 0 ${W} ${H}`} className="gu-cmap-svg" role="img" aria-label="Candidate space: efficacy score against safety score">
        <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} className="gu-cmap-plot" />
        <line x1={zeroX} y1={PAD.t} x2={zeroX} y2={H - PAD.b} className="gu-cmap-zero" />
        <line x1={PAD.l} y1={zeroY} x2={W - PAD.r} y2={zeroY} className="gu-cmap-zero" />
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 10} className="gu-cmap-axis" textAnchor="middle">efficacy score → (reference-relative, higher is better)</text>
        <text x={14} y={(PAD.t + H - PAD.b) / 2} className="gu-cmap-axis" textAnchor="middle" transform={`rotate(-90 14 ${(PAD.t + H - PAD.b) / 2})`}>safety score ↑ (higher is safer)</text>
        <text x={PAD.l} y={H - PAD.b + 14} className="gu-cmap-tick">{xMin.toFixed(1)}</text>
        <text x={W - PAD.r} y={H - PAD.b + 14} className="gu-cmap-tick" textAnchor="end">{xMax.toFixed(1)}</text>
        <text x={PAD.l - 6} y={PAD.t + 10} className="gu-cmap-tick" textAnchor="end">{yMax.toFixed(1)}</text>
        <text x={PAD.l - 6} y={H - PAD.b} className="gu-cmap-tick" textAnchor="end">{yMin.toFixed(1)}</text>
        {candidates.map((c) => {
          const cls = classifyElimination(c);
          const cx = x(c.efficacyScore); const cy = y(c.safetyScore);
          return (
            <g key={c.candidateId} className={`gu-cmap-point gu-cmap-${cls.toLowerCase()}${c.inTop2 ? ' gu-cmap-top2' : ''}`} data-testid={`cmap-${c.candidateId}`}>
              <title>{`${c.candidateName} (${c.candidateId}) — ${CLASS_LABEL[cls]} · efficacy ${c.efficacyScore.toFixed(2)} · safety ${c.safetyScore.toFixed(2)} · ${c.observationCount} obs${c.eliminationReason !== null ? ` · ${c.eliminationReason}` : ''}`}</title>
              {c.inTop2 && <circle cx={cx} cy={cy} r={13} className="gu-cmap-ring" />}
              <circle cx={cx} cy={cy} r={c.inTop2 ? 6 : 4.5} className="gu-cmap-dot" />
              {(c.inTop2 || cls === 'SAFETY_VETO') && (
                <text x={cx + 10} y={cy - 8} className="gu-cmap-label">{c.candidateName}</text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="gu-cmap-legend">
        {(['QUALIFIES', 'SAFETY_VETO', 'BELOW_FLOOR', 'INSUFFICIENT_EVIDENCE', 'OTHER'] as const).filter((k) => classes.has(k)).map((k) => (
          <span key={k} className={`gu-cmap-key gu-cmap-${k.toLowerCase()}`}><i /> {CLASS_LABEL[k]} · {candidates.filter((c) => classifyElimination(c) === k).length}</span>
        ))}
        <span className="gu-cmap-key gu-cmap-top2"><i /> TOP2 pair</span>
      </figcaption>
    </figure>
  );
}
