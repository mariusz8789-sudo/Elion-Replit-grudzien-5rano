import type { LowerHarmRunDetail, LowerHarmWinnerRecord, NoWinnerBlocker } from '../orchestrator/winnerRecord';

/**
 * DISCOVERY HALL — shot list for the cinematic walk-through of ONE real run
 * (D-117). Pure data: it maps what the pipeline recorded (custody, evidence,
 * G2 numbers, Winner Gate conjuncts, gate decisions, WinnerRecord or blocker)
 * onto the lab scene's four existing fixed camera shots (`LabScene3D
 * .focusScientific`: WIDE / SCIENTIFIC / ANOMALY / REPLAY). It never adds a
 * number the run did not produce; when a part of the run is missing it says
 * so on the shot instead of inventing content. The 3D scene itself is a
 * VISUALISATION and every shot carries that label next to the REAL data.
 */

export type HallShotKind = 'WIDE' | 'SCIENTIFIC' | 'ANOMALY' | 'REPLAY';

export interface HallShot {
  readonly id: string;
  readonly kind: HallShotKind;
  readonly holdSeconds: number;
  readonly title: string;
  readonly lines: readonly string[];
}

/** The slice of a finished run the hall narrates — a RunResult satisfies it structurally. */
export interface HallRunView {
  readonly mode: string;
  readonly verdict: string;
  readonly auditFingerprint: string;
  readonly stages: readonly { readonly stage: string; readonly status: string; readonly fingerprint: string }[];
  readonly evidenceCustody: { readonly ok: boolean; readonly sourceId: string; readonly record?: { readonly artifact: { readonly hash: string; readonly hashPolicy: string } | null } | null } | null;
  readonly detail?: LowerHarmRunDetail;
  readonly winnerRecord?: LowerHarmWinnerRecord | NoWinnerBlocker;
}

const short = (fp: string | null | undefined, n = 10): string => (fp === null || fp === undefined ? 'n/a' : fp.slice(0, n));

export function buildDiscoveryHallSequence(run: HallRunView): readonly HallShot[] {
  const okStages = run.stages.filter((s) => s.status === 'OK').length;
  const d = run.detail;
  const custody = run.evidenceCustody;
  const custodyHash = custody?.record?.artifact?.hash ?? null;

  const opening: HallShot = {
    id: 'opening', kind: 'WIDE', holdSeconds: 5,
    title: 'GENESIS · SCIENTIFIC OS',
    lines: [
      `Mode ${run.mode} · ${run.stages.length} stages, ${okStages} OK`,
      `Audit fingerprint ${short(run.auditFingerprint)} — hash of all ${run.stages.length} stage fingerprints`,
      'Pytanie → kandydaci → dowody → falsyfikacja → bramka zwycięzcy → Research Recipe → replay',
    ],
  };

  const evidence: HallShot = {
    id: 'evidence', kind: 'SCIENTIFIC', holdSeconds: 6,
    title: 'Evidence custody',
    lines: custody === null
      ? ['Custody gate: not recorded for this run']
      : [
        `Source ${custody.sourceId} · ${custody.ok ? 'FROZEN + replay-verified' : 'FAILED'}`,
        custodyHash === null ? 'No artifact hash' : `${custody.record?.artifact?.hashPolicy ?? 'hash'} ${short(custodyHash, 16)}…`,
        d === undefined ? 'Observation detail not available' : `${d.evidence.length} real observations · ${d.candidates.length} candidates scored · TOP2 ${d.top2Ids.join(' / ')}`,
      ],
  };

  const f = d?.falsification ?? null;
  const falsification: HallShot = {
    id: 'falsification', kind: 'ANOMALY', holdSeconds: 6,
    title: 'G2 falsification experiment',
    lines: f === null
      ? ['No TOP2 pair reached the falsification stage']
      : f.outcome === 'EXPERIMENT_SELECTED'
        ? [
          `Observable ${f.observableId ?? 'n/a'} · discriminability ${f.discriminability?.toFixed(2) ?? 'n/a'}σ · power ${Math.round((f.falsificationPower ?? 0) * 100)}%`,
          ...f.expectedByCandidate.map((e) => `${e.candidateId}: expected ${e.expectedOutcome > 0 ? '+' : ''}${e.expectedOutcome.toFixed(2)} pp (±${e.toleranceSigma}σ)`),
          `Decision rule frozen ${short(f.decisionRuleFingerprint)} before any observation was read`,
        ]
        : [`NO_DISCRIMINATING_EXPERIMENT_AVAILABLE — ${f.reason ?? ''}`],
  };

  const gate: HallShot = {
    id: 'gate', kind: 'REPLAY', holdSeconds: 6,
    title: 'Winner Gate — three conjuncts, all must hold',
    lines: d === undefined
      ? ['Winner Gate detail not available']
      : [
        ...(d.conjuncts.length === 0 ? ['No conjunct was evaluated'] : d.conjuncts.map((c) => `${c.held ? 'HELD' : 'FAILED'} · ${c.criterion.toLowerCase().replace(/_/g, ' ')}`)),
        ...d.gateDecisions.map((g) => `${g.candidateName}: ${g.outcome.replace(/_/g, ' ')}`),
      ],
  };

  const r = run.winnerRecord;
  const verdict: HallShot = {
    id: 'verdict', kind: 'WIDE', holdSeconds: 7,
    title: r?.kind === 'WINNER_RECORD' ? `WINNER — ${r.candidateName}` : run.verdict,
    lines: r?.kind === 'WINNER_RECORD'
      ? [
        `${r.winnerId} · gate ${r.gate.outcome.replace(/_/g, ' ')} — nothing is activated by this system`,
        `WinnerRecord ${r.recordFingerprint} · recipe ${short(r.fingerprints.recipeFingerprint)} · prereg ${short(r.fingerprints.preregistrationFingerprint)}`,
        'Relative claim under the frozen LOWER-HARM rule; indirect evidence; single funnel pass — see the record\'s own disclosures',
      ]
      : r?.kind === 'NO_WINNER_BLOCKER'
        ? [`Blocked at ${r.blockedAt}`, r.reason, 'No artificial winner — the run is shown as it ended']
        : ['No WinnerRecord was built for this run'],
  };

  return [opening, evidence, falsification, gate, verdict];
}
