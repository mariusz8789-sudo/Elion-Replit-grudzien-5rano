import { canonicalJson, fnv1a } from '../events/hash';
import type { LiveCandidate, LiveDrugRunState } from './drugRunState';

/**
 * DRUG HYPOTHESIS — stated and frozen BEFORE the run, judged only against what the engines produced.
 *
 * The criteria are fixed thresholds on persisted measurements; the fingerprint is taken before the lab
 * starts, so a result cannot move them afterwards. No language model takes part in the verdict. Per
 * criterion the status is MET / NOT_MET / UNRESOLVED (no measurement, blocked stage, or not measured
 * against the preregistered protein). Each criterion is preregistered as critical (a falsifier) or not,
 * and the verdict follows, in this order:
 *   FALSIFIED  — at least one critical criterion is NOT_MET;
 *   UNRESOLVED — otherwise, at least one criterion could not be evaluated;
 *   SUPPORTED  — otherwise, every criterion is MET;
 *   WEAKENED   — otherwise: no falsifier fired, every critical criterion is MET, and a non-critical one
 *                failed.
 * Epistemic status: RDKit geometry and the Vina run are real engine output; ADMET-AI endpoints are
 * MODEL_ESTIMATE; the Vina score is a scoring-function estimate against a rigid receptor, never a
 * measured binding affinity.
 */

export type CriterionStatus = 'MET' | 'NOT_MET' | 'UNRESOLVED';
export type DrugVerdict = 'SUPPORTED' | 'WEAKENED' | 'FALSIFIED' | 'UNRESOLVED';

export interface DrugCriterion {
  readonly id: 'retained' | 'ames' | 'herg' | 'docking';
  readonly label: string;
  /** A critical criterion is a preregistered falsifier: NOT_MET ⇒ FALSIFIED. */
  readonly critical: boolean;
  /** docking: Vina score must be ≤ this (kcal/mol); ames/herg: predicted probability must be ≤ this. */
  readonly threshold: number | null;
  readonly evidence: 'REAL_ENGINE_OUTPUT' | 'MODEL_ESTIMATE';
}

/** The protein the docking criterion is preregistered against. */
export interface DrugTargetSpec {
  readonly targetId: string;
  readonly pdbId: string;
  readonly chain: string;
  readonly protein: string;
}

export interface DrugHypothesis {
  readonly subject: string;
  readonly target: DrugTargetSpec;
  readonly statement: string;
  readonly criteria: readonly DrugCriterion[];
  readonly plan: readonly { readonly stage: string; readonly engine: string; readonly label: string; readonly evidence: string }[];
  /** fnv1a of the canonical JSON of subject+target+statement+criteria — frozen before the run. */
  readonly fingerprint: string;
}

export interface CriterionResult { readonly id: DrugCriterion['id']; readonly status: CriterionStatus; readonly observed: string }
export interface DrugHypothesisResult {
  readonly verdict: DrugVerdict;
  readonly criteria: readonly CriterionResult[];
  readonly candidateSmiles: string | null;
  readonly hypothesisFingerprint: string;
  /** Which branch of the rule above decided the verdict. */
  readonly rule: string;
}

export const DOCKING_THRESHOLD_KCAL_MOL = -9.0;
export const TOX_PROBABILITY_MAX = 0.5;
export const DEFAULT_DRUG_TARGET: DrugTargetSpec = { targetId: 'ABL1_1IEP', pdbId: '1IEP', chain: 'A', protein: 'kinaza ABL1 (domena kinazowa)' };

export function buildDrugHypothesis(subject: string, target: DrugTargetSpec = DEFAULT_DRUG_TARGET): DrugHypothesis {
  const where = `PDB ${target.pdbId}, łańcuch ${target.chain}`;
  const criteria: DrugCriterion[] = [
    { id: 'docking', critical: true, threshold: DOCKING_THRESHOLD_KCAL_MOL, evidence: 'REAL_ENGINE_OUTPUT', label: `Wynik Vina ≤ ${DOCKING_THRESHOLD_KCAL_MOL.toFixed(1)} kcal/mol w kieszeni ${target.protein} (${where}) — kryterium krytyczne` },
    { id: 'retained', critical: false, threshold: null, evidence: 'REAL_ENGINE_OUTPUT', label: 'Co najmniej jeden kandydat spełnia ograniczenia lekopodobności (RDKit)' },
    { id: 'ames', critical: false, threshold: TOX_PROBABILITY_MAX, evidence: 'MODEL_ESTIMATE', label: `Przewidywana mutagenność AMES ≤ ${TOX_PROBABILITY_MAX} (ADMET-AI)` },
    { id: 'herg', critical: false, threshold: TOX_PROBABILITY_MAX, evidence: 'MODEL_ESTIMATE', label: `Przewidywane ryzyko hERG ≤ ${TOX_PROBABILITY_MAX} (ADMET-AI)` },
  ];
  const statement = `Pochodne „${subject}” zaprojektowane obliczeniowo wiążą się w kieszeni ${target.protein} (${where}) z wynikiem Vina ≤ ${DOCKING_THRESHOLD_KCAL_MOL.toFixed(1)} kcal/mol, zachowują lekopodobność i nie przekraczają progów ADMET dla mutagenności i hERG.`;
  const plan = [
    { stage: 'generation', engine: 'RDKit', label: 'Przekształcenia obliczeniowe (COMPUTATIONAL TRANSFORMATION) i deskryptory', evidence: 'REAL_ENGINE_OUTPUT' },
    { stage: 'admet', engine: 'ADMET-AI', label: 'Estymaty ADMET i toksyczności', evidence: 'MODEL_ESTIMATE' },
    { stage: 'docking', engine: 'AutoDock Vina + Meeko', label: `Docking do białka ${target.pdbId} (łańcuch ${target.chain})`, evidence: 'REAL_ENGINE_OUTPUT' },
    { stage: 'quantum', engine: 'PySCF', label: 'Chemia kwantowa RHF/sto-3g (gdy cząsteczka mieści się w limicie silnika)', evidence: 'REAL_ENGINE_OUTPUT' },
  ];
  return { subject, target, statement, criteria, plan, fingerprint: fnv1a(canonicalJson({ subject, target, statement, criteria })) };
}

function judgeCandidate(h: DrugHypothesis, c: LiveCandidate | null, state: LiveDrugRunState): CriterionResult[] {
  return h.criteria.map((criterion): CriterionResult => {
    if (criterion.id === 'retained') {
      const retained = state.candidates.filter((x) => x.status === 'retained').length;
      return { id: 'retained', status: state.candidates.length === 0 ? 'UNRESOLVED' : retained > 0 ? 'MET' : 'NOT_MET', observed: `${retained}/${state.candidates.length} zachowanych` };
    }
    if (criterion.id === 'ames' || criterion.id === 'herg') {
      const key = criterion.id === 'ames' ? 'AMES' : 'hERG';
      const value = c?.stages.admet?.endpoints?.[key];
      if (value === undefined) return { id: criterion.id, status: 'UNRESOLVED', observed: state.blocked.some((b) => b.stage === 'admet') ? 'BLOCKED_BY_RUNTIME' : 'brak predykcji' };
      return { id: criterion.id, status: value <= (criterion.threshold ?? 0) ? 'MET' : 'NOT_MET', observed: `${key} = ${value.toFixed(2)}` };
    }
    const m = c?.stages.docking;
    if (!m || m.value === null) return { id: 'docking', status: 'UNRESOLVED', observed: state.blocked.some((b) => b.stage === 'docking') ? 'BLOCKED_BY_RUNTIME' : (m?.status ?? 'brak pomiaru') };
    // Only a score against the preregistered protein, with the pose on record, can decide this criterion.
    if (state.target?.targetId !== h.target.targetId || !c?.pose) {
      return { id: 'docking', status: 'UNRESOLVED', observed: `${m.value.toFixed(2)} kcal/mol, ale nie wobec ${h.target.pdbId}` };
    }
    return { id: 'docking', status: m.value <= (criterion.threshold ?? 0) ? 'MET' : 'NOT_MET', observed: `${m.value.toFixed(2)} kcal/mol (${h.target.pdbId}:${h.target.chain})` };
  });
}

export function evaluateDrugHypothesis(h: DrugHypothesis, state: LiveDrugRunState, candidate: LiveCandidate | null): DrugHypothesisResult {
  const criteria = judgeCandidate(h, candidate, state);
  const critical = new Set(h.criteria.filter((c) => c.critical).map((c) => c.id));
  const criticalFailed = criteria.filter((c) => c.status === 'NOT_MET' && critical.has(c.id));
  const unresolved = criteria.filter((c) => c.status === 'UNRESOLVED');
  const failed = criteria.filter((c) => c.status === 'NOT_MET');
  let verdict: DrugVerdict;
  let rule: string;
  if (criticalFailed.length) {
    verdict = 'FALSIFIED';
    rule = `kryterium krytyczne niespełnione: ${criticalFailed.map((c) => c.id).join(', ')}`;
  } else if (unresolved.length) {
    verdict = 'UNRESOLVED';
    rule = `nierozstrzygnięte kryteria: ${unresolved.map((c) => c.id).join(', ')}`;
  } else if (!failed.length) {
    verdict = 'SUPPORTED';
    rule = 'wszystkie zarejestrowane kryteria spełnione';
  } else {
    verdict = 'WEAKENED';
    rule = `kryteria krytyczne spełnione, niekrytyczne niespełnione: ${failed.map((c) => c.id).join(', ')}`;
  }
  return { verdict, rule, criteria, candidateSmiles: candidate?.smiles ?? null, hypothesisFingerprint: h.fingerprint };
}

/** The next experiment follows from what is missing or what failed — a proposal, never auto-run. */
export function nextDrugExperiment(result: DrugHypothesisResult, state: LiveDrugRunState): { readonly title: string; readonly rationale: string; readonly requires: readonly string[] } {
  if (state.blocked.length) return { title: 'Uruchom zablokowany etap na workerze z silnikiem', rationale: `Etap ${state.blocked.map((b) => b.stage).join(', ')} nie wykonał się (BLOCKED_BY_RUNTIME); bez niego kryterium pozostaje nierozstrzygnięte.`, requires: ['dostępny worker silnika'] };
  const docking = result.criteria.find((c) => c.id === 'docking');
  if (docking?.status === 'UNRESOLVED') return { title: 'Powtórz docking wobec zarejestrowanego białka', rationale: 'Kryterium krytyczne wymaga wyniku z pozą w kieszeni zarejestrowanego celu; tego pomiaru brakuje.', requires: ['przygotowany receptor celu', 'budżet dokowania'] };
  const tox = result.criteria.find((c) => (c.id === 'ames' || c.id === 'herg') && c.status === 'NOT_MET');
  if (docking?.status === 'MET' && tox) return { title: 'Optymalizacja pod kątem bezpieczeństwa przy zachowanym wiązaniu', rationale: `Wiązanie spełnia próg, ale ${tox.observed} przekracza zarejestrowany próg. Kolejna runda powinna szukać analogów o niższym przewidywanym ryzyku.`, requires: ['zatwierdzenie budżetu', 'kryteria bezpieczeństwa z góry'] };
  if (docking?.status === 'MET') return { title: 'Dynamika molekularna dla najlepszej pozy', rationale: 'Wynik Vina to estymata funkcji oceniającej przy sztywnym receptorze; symulacja MD sprawdzi, czy poza jest trwała.', requires: ['silnik MD (OpenMM)', 'pole siłowe dla ligandu'] };
  if (docking?.status === 'NOT_MET') return { title: 'Kolejna generacja analogów z innymi przekształceniami', rationale: 'Wynik dokowania nie spełnia progu; kolejna runda RDKit z innymi przekształceniami sprawdzi, czy da się go poprawić.', requires: ['zatwierdzenie nowego budżetu'] };
  return { title: 'Powtórz run z większym budżetem kandydatów', rationale: 'Za mało pomiarów, żeby rozstrzygnąć hipotezę.', requires: ['zatwierdzenie budżetu'] };
}

/** Frozen hypotheses by campaign, registered by the chat before the lab starts the run. */
const plans = new Map<string, DrugHypothesis>();
export function registerDrugHypothesis(campaignId: string, h: DrugHypothesis): void { if (!plans.has(campaignId)) plans.set(campaignId, h); }
export function getDrugHypothesis(campaignId: string): DrugHypothesis | null { return plans.get(campaignId) ?? null; }
