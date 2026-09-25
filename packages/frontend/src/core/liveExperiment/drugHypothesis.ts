import { canonicalJson, fnv1a } from '../events/hash';
import type { LiveCandidate, LiveDrugRunState } from './drugRunState';

/**
 * DRUG HYPOTHESIS — stated and frozen BEFORE the run, judged only against what the engines produced.
 *
 * The criteria are fixed thresholds on the persisted measurements; the fingerprint is taken before the
 * lab starts, so a result cannot move them afterwards. The verdict adds no science: per criterion it is
 * MET / NOT_MET / UNRESOLVED (no measurement, or the stage was blocked), and the aggregate is
 *   SUPPORTED  — every criterion evaluated and met;
 *   FALSIFIED  — at least one criterion failed and none was met;
 *   WEAKENED   — at least one met and at least one failed;
 *   UNRESOLVED — nothing failed but something could not be evaluated (or nothing could).
 * Everything is a MODEL_ESTIMATE (RDKit, ADMET-AI, Vina against a stand-in receptor, PySCF sto-3g).
 */

export type CriterionStatus = 'MET' | 'NOT_MET' | 'UNRESOLVED';
export type DrugVerdict = 'SUPPORTED' | 'WEAKENED' | 'FALSIFIED' | 'UNRESOLVED';

export interface DrugCriterion {
  readonly id: 'retained' | 'admet' | 'docking';
  readonly label: string;
  /** For docking: Vina affinity must be at or below this (kcal/mol, more negative = tighter). */
  readonly threshold: number | null;
}

export interface DrugHypothesis {
  readonly subject: string;
  readonly statement: string;
  readonly criteria: readonly DrugCriterion[];
  readonly plan: readonly { readonly stage: string; readonly engine: string; readonly label: string }[];
  /** fnv1a of the canonical JSON of subject+statement+criteria — frozen before the run. */
  readonly fingerprint: string;
}

export interface CriterionResult { readonly id: DrugCriterion['id']; readonly status: CriterionStatus; readonly observed: string }
export interface DrugHypothesisResult { readonly verdict: DrugVerdict; readonly criteria: readonly CriterionResult[]; readonly candidateSmiles: string | null; readonly hypothesisFingerprint: string }

export const DOCKING_THRESHOLD_KCAL_MOL = -5.0;

export function buildDrugHypothesis(subject: string): DrugHypothesis {
  const criteria: DrugCriterion[] = [
    { id: 'retained', label: 'Co najmniej jeden kandydat przechodzi ograniczenia lekopodobności (RDKit)', threshold: null },
    { id: 'admet', label: 'Kandydat nie zostaje odrzucony przez filtr ADMET/toksyczności (ADMET-AI)', threshold: null },
    { id: 'docking', label: `Afinity dokowania ≤ ${DOCKING_THRESHOLD_KCAL_MOL.toFixed(1)} kcal/mol (Vina, receptor zastępczy)`, threshold: DOCKING_THRESHOLD_KCAL_MOL },
  ];
  const statement = `Pochodne „${subject}” zaprojektowane in-silico zachowają lekopodobność, nie zostaną odrzucone przez ADMET i osiągną afinity dokowania ≤ ${DOCKING_THRESHOLD_KCAL_MOL.toFixed(1)} kcal/mol.`;
  const plan = [
    { stage: 'generation', engine: 'RDKit', label: 'Generacja analogów i deskryptory' },
    { stage: 'admet', engine: 'ADMET-AI', label: 'Estymaty ADMET i toksyczności' },
    { stage: 'docking', engine: 'AutoDock Vina', label: 'Docking (receptor zastępczy, nie białko)' },
    { stage: 'quantum', engine: 'PySCF', label: 'Chemia kwantowa RHF/sto-3g' },
  ];
  return { subject, statement, criteria, plan, fingerprint: fnv1a(canonicalJson({ subject, statement, criteria })) };
}

function judgeCandidate(h: DrugHypothesis, c: LiveCandidate | null, state: LiveDrugRunState): CriterionResult[] {
  return h.criteria.map((criterion): CriterionResult => {
    if (criterion.id === 'retained') {
      const retained = state.candidates.filter((x) => x.status === 'retained').length;
      return { id: 'retained', status: state.candidates.length === 0 ? 'UNRESOLVED' : retained > 0 ? 'MET' : 'NOT_MET', observed: `${retained}/${state.candidates.length} zachowanych` };
    }
    if (criterion.id === 'admet') {
      const m = c?.stages.admet;
      if (!m || m.status === 'SELECTED' || m.status === 'NOT_SELECTED' || m.status === 'FAILED') return { id: 'admet', status: 'UNRESOLVED', observed: m?.status ?? 'brak pomiaru' };
      return { id: 'admet', status: m.status === 'REJECTED' ? 'NOT_MET' : 'MET', observed: m.status };
    }
    const m = c?.stages.docking;
    if (!m || m.value === null) return { id: 'docking', status: 'UNRESOLVED', observed: state.blocked.some((b) => b.stage === 'docking') ? 'BLOCKED_BY_RUNTIME' : (m?.status ?? 'brak pomiaru') };
    return { id: 'docking', status: m.value <= (criterion.threshold ?? 0) ? 'MET' : 'NOT_MET', observed: `${m.value.toFixed(2)} kcal/mol` };
  });
}

export function evaluateDrugHypothesis(h: DrugHypothesis, state: LiveDrugRunState, candidate: LiveCandidate | null): DrugHypothesisResult {
  const criteria = judgeCandidate(h, candidate, state);
  const evaluated = criteria.filter((c) => c.status !== 'UNRESOLVED');
  const met = evaluated.filter((c) => c.status === 'MET').length;
  const failed = evaluated.length - met;
  const verdict: DrugVerdict = failed === 0
    ? (met === criteria.length ? 'SUPPORTED' : 'UNRESOLVED')
    : (met === 0 ? 'FALSIFIED' : 'WEAKENED');
  return { verdict, criteria, candidateSmiles: candidate?.smiles ?? null, hypothesisFingerprint: h.fingerprint };
}

/** The next experiment follows from what is missing or what failed — a proposal, never auto-run. */
export function nextDrugExperiment(result: DrugHypothesisResult, state: LiveDrugRunState): { readonly title: string; readonly rationale: string; readonly requires: readonly string[] } {
  if (state.blocked.length) return { title: 'Uruchom zablokowany etap na workerze z silnikiem', rationale: `Etap ${state.blocked.map((b) => b.stage).join(', ')} nie wykonał się (BLOCKED_BY_RUNTIME); bez niego kryterium pozostaje nierozstrzygnięte.`, requires: ['dostępny worker silnika'] };
  const docking = result.criteria.find((c) => c.id === 'docking');
  if (docking?.status === 'MET') return { title: 'Docking do prawdziwego białka docelowego', rationale: 'Afinity spełnia próg wobec receptora zastępczego; to nie jest cel białkowy. Następny krok: struktura PDB z kieszenią wiązania.', requires: ['plik PDB celu', 'definicja kieszeni'] };
  if (docking?.status === 'NOT_MET') return { title: 'Kolejna generacja analogów z innymi transformacjami', rationale: 'Afinity nie spełnia progu; kolejna runda RDKit z innymi transformacjami sprawdzi, czy da się ją poprawić.', requires: ['zatwierdzenie nowego budżetu'] };
  return { title: 'Powtórz run z większym budżetem kandydatów', rationale: 'Za mało pomiarów, żeby rozstrzygnąć hipotezę.', requires: ['zatwierdzenie budżetu'] };
}

/** Frozen hypotheses by campaign, registered by the chat before the lab starts the run. */
const plans = new Map<string, DrugHypothesis>();
export function registerDrugHypothesis(campaignId: string, h: DrugHypothesis): void { if (!plans.has(campaignId)) plans.set(campaignId, h); }
export function getDrugHypothesis(campaignId: string): DrugHypothesis | null { return plans.get(campaignId) ?? null; }
