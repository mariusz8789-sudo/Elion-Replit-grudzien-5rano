import { useState } from 'react';
import type React from 'react';
import { parseProblem } from '../../orchestrator/nl';
import { canonicalJson, fnv1a } from '../../events/hash';
import { createMindPorts, MIND_SELF_FALSIFICATION_COVERAGE } from '../mindPorts';
import { runResearch, type RunResearchResult } from '../runResearch';
import { expectedDiscriminationGain } from '../informationGain';
import { bridgeSymbolicToModelSpace } from '../mathExprModelBridge';
import { computeNoveltyLevel } from '../noveltyHarness';
import { MindKnowledgeIndex } from '../knowledgeIndex';
import { buildStructuredProblemExtension } from '../problemRepresentation';
import type { MindHypothesis } from '../contracts';
import type { ModelPoint, ModelSpaceConstraints } from '../../agent/modelSpace';
import { FingerprintChip } from '../../../components/genesis-ui/FingerprintChip';

/**
 * GENESIS MIND — read-only projection (docs/DECISIONS.md D-060).
 *
 * This panel computes NOTHING. Every value shown is exactly what the real
 * functions returned. It never fabricates a hypothesis, a verdict, a novelty
 * level, or a recipe.
 *
 * SYNTHETIC_TEST_ONLY BY CONSTRUCTION. The demonstration below runs the real
 * model-space generation, fitting and ranking over COMPUTED points on a known
 * generating law — it is a pipeline demonstration, not a discovery. PRODUCTION
 * mode is refused from here on purpose: it requires a custody-verified
 * evidence source and a real execution backend, neither of which this screen
 * has. That refusal is the honest state, not a missing feature.
 */

const XS = [1, 2, 3, 4, 5, 6] as const;
const H = (value: unknown): string => fnv1a(canonicalJson(value));

// xRange derived from the real x values — the same pattern the real callers use
// (biotechData/campaignLabs.ts, agent/structuralDiscovery.ts).
const CONSTRAINTS: ModelSpaceConstraints = { maxTerms: 2, xRange: { min: Math.min(...XS), max: Math.max(...XS) }, variables: ['x'] };

/** A known generating law. Stated openly so nobody mistakes this for an observation. */
const GENERATING_LAW = 'y = 2x + 1 (+/- 0.1) — a declared law, computed, not measured';
const observe = (x: number): ModelPoint => ({ x, y: 2 * x + 1, sigma: 0.1 });

const HYPOTHESES: readonly MindHypothesis[] = [
  {
    hypothesisId: 'H-LINEAR', statement: 'the response is linear in x', mechanismId: 'M-LINEAR',
    modelSpec: null, symbolic: null, observable: 'y', predictedValue: 13, tolerance: 0.5,
    falsificationCriterion: { metric: 'y', relation: 'equal-within-tolerance', expectedValue: 13, tolerance: 0.5, rationale: 'linear form predicts y(6)=13' },
    competingHypothesisIds: ['H-SATURATING'], generationRationale: 'enumerated from the declared model space', provenanceRefs: [], fingerprint: H('H-LINEAR'),
  },
  {
    hypothesisId: 'H-SATURATING', statement: 'the response saturates in x', mechanismId: 'M-SAT',
    modelSpec: null, symbolic: null, observable: 'y', predictedValue: 9, tolerance: 0.5,
    falsificationCriterion: { metric: 'y', relation: 'equal-within-tolerance', expectedValue: 9, tolerance: 0.5, rationale: 'saturating form predicts a lower y(6)' },
    competingHypothesisIds: ['H-LINEAR'], generationRationale: 'competing explanation, required for a discriminating prediction', provenanceRefs: [], fingerprint: H('H-SATURATING'),
  },
];

/**
 * The symbolic (L3) route, computed for real at module load: `sin(x)·x` is a
 * form the `ModelBasis` vocabulary genuinely cannot express, so the bridge
 * returns a MODEL_CANDIDATE rather than a `ModelSpec`. It is DISPLAYED, not
 * fed to the pipeline — the orchestrator's candidate shape is `ModelSpec`-
 * backed, so running symbolic-only forms end to end is real, disclosed
 * future work, not something this panel pretends to do.
 */
const SYMBOLIC_PROBE = bridgeSymbolicToModelSpace('sin(x) * x', null, () => null);

export function MindPanel(): React.ReactElement {
  const [research, setResearch] = useState<RunResearchResult | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (mode: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY'): Promise<void> => {
    setBusy(true);
    try {
      const problem = parseProblem(
        'MIND-DEMO',
        {
          text: 'which functional form explains the observed response?',
          objectives: [{ metric: 'y', direction: 'maximize' }],
          constraints: ['declared model space only'],
          harmAxes: [],
          evidenceMinimum: '>=1 observation per candidate x',
        },
        H,
      );

      const knowledge = new MindKnowledgeIndex();
      await knowledge.add({ itemId: 'law', status: 'MODEL', claim: GENERATING_LAW, provenanceRefs: ['declared'], provenanceRanks: [3], llmAssisted: false });
      const extension = buildStructuredProblemExtension(problem, ['response', 'x']);

      const ports = createMindPorts({
        scope: { domain: 'mind-demo', assumptions: ['single variable', 'declared generating law'], boundary: `x in [${Math.min(...XS)}, ${Math.max(...XS)}]` },
        observe, candidateX: XS, backendAvailable: true, evidenceClass: 'COMPUTATIONAL',
        now: () => '1970-01-01T00:00:00Z', nowMs: () => 0,
      });

      const knowledgeSnapshotFingerprint = await knowledge.snapshotFingerprint();

      // Real gains, computed by the real metric from each candidate x's own
      // predicted separation between the two competing forms.
      const gains = XS.map((x) => {
        const pair = { hypothesisA: 'H-LINEAR', hypothesisB: 'H-SATURATING', predictedDifference: 2 * x + 1 - (9 * x) / (x + 2), pooledSigma: 0.1 };
        return { experimentLabel: `x=${x}`, pairIds: ['H-LINEAR', 'H-SATURATING'] as [string, string], sigmaSeparation: expectedDiscriminationGain([pair]), gain: expectedDiscriminationGain([pair]) };
      });

      const outcome = await runResearch({
        problem,
        maxRounds: 3,
        now: () => '1970-01-01T00:00:00Z',
        makeRoundOptions: () => ({
          problem, ports, mode,
          gen: {
            constraints: CONSTRAINTS, hypotheses: HYPOTHESES, fixedRetrievalList: [], symbolicCandidates: [],
            gains,
            novelty: computeNoveltyLevel([{ candidateId: 'demo', lineage: 'INITIAL_SPACE' }], 'NOT RUN — the prior-art axis needs noveltyGate against a real corpus'),
            knowledgeSnapshotFingerprint,
            researchStateHead: extension.fingerprint,
            custodyHash: 'n/a-synthetic', custodyPolicy: 'n/a-synthetic',
          },
        }),
        // A real stopping rule: once no candidate experiment separates the
        // rivals by more than 1 sigma, another round buys nothing.
        shouldContinue: (_result, round) => {
          const best = gains.reduce((max, g) => Math.max(max, g.gain), 0);
          return best > 1 && round < 1
            ? { continue: true, reason: `best remaining separation ${best.toFixed(2)} sigma` }
            : { continue: false, reason: 'NO_INFORMATION_GAIN: no available observation separates the rivals further' };
        },
      });
      setResearch(outcome);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section">
      <h3 className="section-label">Genesis Mind — read-only projection</h3>
      <p className="gu-hint">
        This panel computes nothing. {GENERATING_LAW}. The demonstration is <strong>SYNTHETIC_TEST_ONLY</strong>: it exercises the real
        model-space generation, fitting and ranking, then hands the result to the same unmodified orchestrator every other domain uses.
        Self-falsification coverage here is {MIND_SELF_FALSIFICATION_COVERAGE}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
        <button type="button" className="chip-btn primary" disabled={busy} onClick={() => void run('SYNTHETIC_TEST_ONLY')}>
          {busy ? 'Running…' : 'Run Mind (SYNTHETIC_TEST_ONLY)'}
        </button>
        <button type="button" className="chip-btn" disabled={busy} onClick={() => void run('PRODUCTION')}>
          Try PRODUCTION (expected: refused)
        </button>
      </div>

      <p className="gu-hint">
        SYMBOLIC (L3) ROUTE: <code>{SYMBOLIC_PROBE.rendered}</code> — {SYMBOLIC_PROBE.kind}, status{' '}
        {SYMBOLIC_PROBE.symbolic?.status ?? 'n/a'}. A form the ModelBasis vocabulary cannot express. Shown, not run: feeding
        symbolic-only forms through the ModelSpec-backed pipeline is disclosed future work.
      </p>

      {research === null && <p className="empty-state">Nothing is computed until you click.</p>}

      {research !== null && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            <FingerprintChip label="domain" value="MIND" />
            <FingerprintChip label="terminal" value={research.terminal} />
            <FingerprintChip label="rounds" value={String(research.rounds.length)} />
            <FingerprintChip label="state head" value={research.stateHead.slice(0, 12)} />
            <FingerprintChip label="chain verified" value={String(research.chainVerified)} />
          </div>
          <p className="gu-hint">STOP REASON: {research.stopReason}</p>
          <ul className="gu-conjunct-list">
            {research.rounds.map((round, index) => (
              <li key={index} className={`gu-conjunct-item ${round.kind === 'RUN' ? 'gu-conjunct-held' : 'gu-conjunct-failed'}`}>
                <span className="gu-conjunct-name">
                  round {index} — {round.kind === 'RUN' ? round.verdict : `EXECUTION_BLOCKED [${round.code}]`}
                </span>
                <div className="gu-conjunct-detail">
                  {round.kind === 'RUN' ? (
                    <>
                      <FingerprintChip label="mode" value={round.mode} />
                      <FingerprintChip label="audit" value={round.auditFingerprint.slice(0, 10)} />
                      <FingerprintChip
                        label="recipe"
                        value={round.recipeFingerprint === undefined ? 'LOCKED' : round.recipeFingerprint.slice(0, 10)}
                      />
                    </>
                  ) : (
                    <span> {round.error}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
