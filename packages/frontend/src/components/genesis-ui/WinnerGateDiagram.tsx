import type React from 'react';
import type { FalsificationView, WinnerGateConjunct, WinnerGateDecisionView } from '../../core/orchestrator/winnerRecord';

/**
 * WinnerGateDiagram — the three Winner Gate conjuncts as gates in series
 * (D-117), plus the G2 separation band. It draws exactly the booleans and
 * numbers `decideFunnelVerdict` / `runG2Falsification` produced: a gate is
 * open only when its conjunct HELD, the flow reaches the end-cap only when
 * every gate is open, and the two G2 bands are the recorded expected outcome
 * ± tolerance. Nothing here decides anything.
 */

const CONJUNCT_LABEL: Readonly<Record<string, string>> = {
  G2_SEPARATES_TOP2: 'G2 separates TOP2',
  AGREES_WITH_PRE_EXPERIMENT_RANK: 'agrees with frozen pre-rank',
  FAVOURED_CANDIDATE_PASSES_SAFETY_GATE: 'favourite passes safety gate',
};

const GATE_W = 200;
const GATE_H = 60;
const GAP = 44;
const LEFT = 16;
const ROW_Y = 30;

export function WinnerGateDiagram({ conjuncts, falsification, gateDecisions, verdict, candidateNames }: {
  readonly conjuncts: readonly WinnerGateConjunct[];
  readonly falsification: FalsificationView | null;
  readonly gateDecisions: readonly WinnerGateDecisionView[];
  readonly verdict: string;
  readonly candidateNames?: Readonly<Record<string, string>>;
}): React.ReactElement {
  const gates = conjuncts.length > 0 ? conjuncts : [];
  const allHeld = gates.length > 0 && gates.every((c) => c.held);
  const firstFailed = gates.findIndex((c) => !c.held);
  const width = LEFT + gates.length * (GATE_W + GAP) + 150;
  const endX = LEFT + gates.length * (GATE_W + GAP) + 10;
  const f = falsification;
  const band = f !== null && f.outcome === 'EXPERIMENT_SELECTED' ? f.expectedByCandidate : [];
  const lo = Math.min(0, ...band.map((b) => b.expectedOutcome - b.toleranceSigma)) - 0.15;
  const hi = Math.max(0, ...band.map((b) => b.expectedOutcome + b.toleranceSigma)) + 0.15;
  const bx = (v: number): number => 90 + ((v - lo) / (hi - lo)) * 500;
  return (
    <div className="gu-gated" data-testid="winner-gate-diagram">
      <svg viewBox={`0 0 ${Math.max(width, 720)} ${GATE_H + ROW_Y * 2}`} className="gu-gated-svg" role="img" aria-label="Winner Gate: three conjuncts in series">
        {gates.map((c, i) => {
          const x0 = LEFT + i * (GATE_W + GAP);
          const reached = firstFailed === -1 || i <= firstFailed;
          return (
            <g key={c.criterion} className={`gu-gated-gate ${c.held ? 'gu-gated-held' : 'gu-gated-failed'}${reached ? '' : ' gu-gated-unreached'}`} data-testid={`gate-diagram-${c.criterion}`}>
              <title>{`${c.criterion}: ${c.held ? 'HELD' : 'FAILED'} — ${c.detail}`}</title>
              {i > 0 && <line x1={x0 - GAP} y1={ROW_Y + GATE_H / 2} x2={x0} y2={ROW_Y + GATE_H / 2} className={`gu-gated-flow${reached ? ' gu-gated-flow-on' : ''}`} />}
              <rect x={x0} y={ROW_Y} width={GATE_W} height={GATE_H} rx={10} className="gu-gated-box" />
              <text x={x0 + 14} y={ROW_Y + 22} className="gu-gated-idx">{i + 1}</text>
              <text x={x0 + 34} y={ROW_Y + 22} className="gu-gated-state">{c.held ? 'HELD' : 'FAILED'}</text>
              <text x={x0 + 14} y={ROW_Y + 44} className="gu-gated-name">{CONJUNCT_LABEL[c.criterion] ?? c.criterion.toLowerCase().replace(/_/g, ' ')}</text>
              {/* the gate port on the box edge: an open ring when held, a closed bar across the flow when failed */}
              {c.held
                ? <circle cx={x0 + GATE_W} cy={ROW_Y + GATE_H / 2} r={5} className="gu-gated-port" />
                : <line x1={x0 + GATE_W + 10} y1={ROW_Y + 10} x2={x0 + GATE_W + 10} y2={ROW_Y + GATE_H - 10} className="gu-gated-leaf" />}
            </g>
          );
        })}
        {gates.length > 0 && (
          <g className={`gu-gated-end ${allHeld ? 'gu-gated-end-open' : 'gu-gated-end-closed'}`} data-testid="gate-diagram-end">
            <line x1={endX - 10} y1={ROW_Y + GATE_H / 2} x2={endX + 18} y2={ROW_Y + GATE_H / 2} className={`gu-gated-flow${allHeld ? ' gu-gated-flow-on' : ''}`} />
            <rect x={endX + 18} y={ROW_Y + 6} width={118} height={GATE_H - 12} rx={24} className="gu-gated-endcap" />
            <text x={endX + 77} y={ROW_Y + GATE_H / 2 + 5} textAnchor="middle" className="gu-gated-endtext">{verdict}</text>
          </g>
        )}
        {gates.length === 0 && <text x={LEFT} y={ROW_Y + GATE_H / 2} className="gu-gated-name">no pair reached the falsification stage — no conjunct evaluated</text>}
      </svg>

      {f !== null && f.outcome === 'EXPERIMENT_SELECTED' && band.length > 0 && (
        <svg viewBox="0 0 720 96" className="gu-gated-band" role="img" aria-label="G2 falsification: expected outcome bands per candidate" data-testid="g2-band">
          <text x={0} y={14} className="gu-gated-bandtitle">G2 · {f.observableId} · discriminability {f.discriminability?.toFixed(2) ?? 'n/a'}σ · rule frozen {f.decisionRuleFingerprint?.slice(0, 8)}</text>
          <line x1={90} y1={84} x2={590} y2={84} className="gu-gated-axis" />
          <line x1={bx(0)} y1={24} x2={bx(0)} y2={84} className="gu-gated-zero" />
          <text x={bx(0)} y={94} textAnchor="middle" className="gu-cmap-tick">0 pp</text>
          {band.map((b, i) => {
            const cy = 36 + i * 22;
            return (
              <g key={b.candidateId} data-testid={`g2-band-${b.candidateId}`}>
                <title>{`${b.candidateId} expected ${b.expectedOutcome.toFixed(2)} pp ± ${b.toleranceSigma}σ`}</title>
                <text x={84} y={cy + 4} textAnchor="end" className="gu-gated-bandlabel">{candidateNames?.[b.candidateId] ?? b.candidateId}</text>
                <rect x={bx(b.expectedOutcome - b.toleranceSigma)} y={cy - 6} width={Math.max(2, bx(b.expectedOutcome + b.toleranceSigma) - bx(b.expectedOutcome - b.toleranceSigma))} height={12} rx={6} className={`gu-gated-bandbar gu-gated-bandbar-${i}`} />
                <line x1={bx(b.expectedOutcome)} y1={cy - 9} x2={bx(b.expectedOutcome)} y2={cy + 9} className="gu-gated-bandtick" />
                <text x={600} y={cy + 4} className="gu-cmap-tick">{b.expectedOutcome > 0 ? '+' : ''}{b.expectedOutcome.toFixed(2)} pp</text>
              </g>
            );
          })}
        </svg>
      )}

      {gateDecisions.length > 0 && (
        <ul className="gu-gated-decisions">
          {gateDecisions.map((g) => (
            <li key={g.candidateId} className={`gu-gated-decision gu-gated-decision-${g.outcome.toLowerCase()}`}>
              <span className="gu-gated-decision-name">{g.candidateName}</span>
              <span className="gu-gated-decision-outcome">{g.outcome.replace(/_/g, ' ')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
