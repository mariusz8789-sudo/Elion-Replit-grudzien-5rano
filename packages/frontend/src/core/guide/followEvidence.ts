import type { GuideFacts, GuideLang } from './narrationModel';

/**
 * FOLLOW THE EVIDENCE (D-119): the chain RESULT → SCORE → OBSERVATION →
 * EXPERIMENT → SOURCE → HASH → FROZEN ARTIFACT as guide steps over the
 * provenance graph. Each step points at a real node of `ProvenanceDag`
 * (its `data-testid`) and says one sentence built from facts; a step whose
 * fact is missing is left out rather than filled in.
 */
export interface FollowStep { readonly id: string; readonly selector: string; readonly text: string; }

export function followEvidenceSteps(f: GuideFacts, lang: GuideLang): readonly FollowStep[] {
  const pl = lang === 'pl';
  const steps: FollowStep[] = [];
  if (f.verdict !== null) steps.push({ id: 'result', selector: '[data-testid="dag-outcome"]', text: pl ? 'Możesz teraz prześledzić, skąd dokładnie pochodzi ten wynik. Zaczynamy od końca — od werdyktu.' : 'You can now trace exactly where this result comes from. We start at the end — the verdict.' });
  if (f.gateOutcome !== null) steps.push({ id: 'score', selector: `[data-testid^="dag-gate:"]`, text: pl ? `Werdykt wynika z bramki nadzoru: ${f.gateOutcome.replace(/_/g, ' ')}.` : `The verdict follows from the governance gate: ${f.gateOutcome.replace(/_/g, ' ')}.` });
  if (f.g2Observable !== null) steps.push({ id: 'experiment', selector: '[data-testid="dag-experiment"]', text: pl ? `Bramkę poprzedził eksperyment ${f.g2Observable}, który rozdzielił kandydatów z siłą ${f.g2Discriminability?.toFixed(2) ?? ''}σ.` : `Before the gate came the ${f.g2Observable} experiment, separating the candidates with ${f.g2Discriminability?.toFixed(2) ?? ''}σ.` });
  if (f.observations > 0) steps.push({ id: 'observation', selector: '[data-testid^="dag-obs:"]', text: pl ? `Eksperyment czytał ${f.observations} realnych obserwacji — każda ma swój identyfikator badania.` : `The experiment read ${f.observations} real observations — each carries its trial identifier.` });
  if (f.custodyStatus !== null) steps.push({ id: 'source', selector: '[data-testid="dag-source"]', text: pl ? 'Obserwacje pochodzą z przypiętego źródła danych — nie z pamięci modelu.' : 'The observations come from a pinned data source — not from a model\'s memory.' });
  if (f.custodyHash !== null) steps.push({ id: 'hash', selector: '[data-testid="dag-custody"]', text: pl ? `Źródło zostało zamrożone i ma hash ${f.custodyHash.slice(0, 12)}. Gdyby ktoś zmienił jeden bajt, Genesis odmówiłby pracy.` : `The source was frozen and hashed: ${f.custodyHash.slice(0, 12)}. Change a single byte and Genesis refuses to run.` });
  if (f.auditFingerprint !== null) steps.push({ id: 'artifact', selector: '[data-testid="pipeline-timeline"]', text: pl ? `Cały przebieg ma odcisk ${f.auditFingerprint.slice(0, 8)}. To jest zamrożony artefakt, który można odtworzyć.` : `The whole run carries the fingerprint ${f.auditFingerprint.slice(0, 8)}. That is the frozen artifact anyone can replay.` });
  return steps;
}
