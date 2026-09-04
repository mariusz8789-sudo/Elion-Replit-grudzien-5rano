import type { ModelGraph } from '../modelGraph/graph';
import type { ConsequenceParamSpec, ConsequenceOutputSpec, DomainViolation } from '../modelGraph/labConsequence';
import type { HonestyLevel } from '../types';

/**
 * CDE — Candidate Discovery Engine (Founder Directive, Milestone 3).
 *
 * Rdzeń: bierze KANDYDATA (wektor parametrów) i przepuszcza go przez ADAPTER
 * DZIEDZINY = wykonywalny Graf Modeli + jawne KRYTERIA AKCEPTACJI. Wynikiem jest
 * PASZPORT KANDYDATA: co model policzył, które kryteria spełnione, czy stan
 * mieści się w dziedzinie ważności modelu, z jakim poziomem uczciwości.
 *
 * ZASADA UCZCIWOŚCI: CDE NIGDY nie ogłasza „odkrycia". Mówi wyłącznie:
 * „ten kandydat SPEŁNIA podane kryteria W RAMACH ważności modelu X". Jeśli stan
 * narusza dziedzinę modelu, paszport jest odrzucony niezależnie od kryteriów —
 * bo policzone liczby nie są wtedy fizycznie sensowne. Zero generowania wyników
 * przez AI: wszystko liczy ten sam, wcześniej przetestowany Graf Modeli.
 */

export type CriterionOp = 'gte' | 'lte' | 'between';

export interface AcceptanceCriterion {
  /** Id węzła-wyjścia w grafie, którego dotyczy kryterium. */
  outputId: string;
  label: string;
  op: CriterionOp;
  /** Próg (dla gte/lte) lub dolna granica (dla between). */
  value: number;
  /** Górna granica dla 'between'. */
  value2?: number;
  unit?: string;
}

/**
 * Adapter dziedziny = to samo, co wykonywalny łańcuch konsekwencji laboratorium
 * (LabConsequenceSpec), rozszerzone o KRYTERIA AKCEPTACJI. Dzięki temu każdy
 * istniejący graf modeli może stać się dziedziną odkrycia bez duplikowania
 * fizyki — reużywamy builderów grafów, straży dziedziny i formatowania.
 */
export interface DomainAdapter {
  id: string;
  label: string;
  description: string;
  honesty: HonestyLevel;
  honestyNote: string;
  /** Świeża instancja grafu na każdą ocenę (bez współdzielonego stanu). */
  buildGraph: () => ModelGraph;
  params: ConsequenceParamSpec[];
  outputs: ConsequenceOutputSpec[];
  criteria: AcceptanceCriterion[];
  domainGuard?: (graph: ModelGraph) => DomainViolation | null;
}

export interface Candidate {
  label?: string;
  params: Record<string, number>;
}

export interface CriterionResult {
  criterion: AcceptanceCriterion;
  actual: number;
  passed: boolean;
}

export interface CandidatePassport {
  id: string;
  adapterId: string;
  label: string;
  params: Record<string, number>;
  outputs: Record<string, number>;
  results: CriterionResult[];
  /** Wszystkie kryteria spełnione ORAZ brak naruszenia dziedziny. */
  accepted: boolean;
  /** Komunikat straży dziedziny, jeśli stan wyszedł poza ważność modelu. */
  domainViolation: string | null;
  honesty: HonestyLevel;
  evaluatedAt: number;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `passport-${Date.now().toString(36)}-${idCounter}`;
}

/** Deterministyczny podpis wektora parametrów — do deduplikacji w Bibliotece Porażek. */
export function candidateSignature(params: Record<string, number>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${Number(params[k]).toPrecision(6)}`)
    .join('|');
}

function checkCriterion(actual: number, c: AcceptanceCriterion): boolean {
  if (!Number.isFinite(actual)) return false;
  if (c.op === 'gte') return actual >= c.value;
  if (c.op === 'lte') return actual <= c.value;
  // between: [value, value2]
  const hi = c.value2 ?? Infinity;
  return actual >= c.value && actual <= hi;
}

/**
 * Ocena jednego kandydata przez adapter. Buduje ŚWIEŻY graf, wstrzykuje
 * parametry, odczytuje wyjścia, sprawdza kryteria i straż dziedziny. Nie
 * modyfikuje żadnego współdzielonego stanu.
 */
export function evaluateCandidate(adapter: DomainAdapter, candidate: Candidate): CandidatePassport {
  const graph = adapter.buildGraph();
  graph.applyParameterSnapshot(candidate.params);

  const outputs: Record<string, number> = {};
  for (const o of adapter.outputs) outputs[o.id] = graph.getValue(o.id);

  const results: CriterionResult[] = adapter.criteria.map((c) => {
    const actual = graph.getValue(c.outputId);
    outputs[c.outputId] = actual; // upewnij się, że wielkość kryterialna jest w paszporcie
    return { criterion: c, actual, passed: checkCriterion(actual, c) };
  });

  const violation = adapter.domainGuard ? adapter.domainGuard(graph) : null;
  const allPass = results.every((r) => r.passed);

  return {
    id: nextId(),
    adapterId: adapter.id,
    label: candidate.label?.trim() || 'Kandydat',
    params: { ...candidate.params },
    outputs,
    results,
    accepted: allPass && violation === null,
    domainViolation: violation ? violation.message : null,
    honesty: adapter.honesty,
    evaluatedAt: Date.now(),
  };
}

export interface BatchResult {
  accepted: CandidatePassport[];
  rejected: CandidatePassport[];
  all: CandidatePassport[];
}

/** Ocena wielu kandydatów; rozdziela zaakceptowane od odrzuconych (te trafiają do Biblioteki Porażek). */
export function evaluateBatch(adapter: DomainAdapter, candidates: Candidate[]): BatchResult {
  const all = candidates.map((c) => evaluateCandidate(adapter, c));
  return {
    accepted: all.filter((p) => p.accepted),
    rejected: all.filter((p) => !p.accepted),
    all,
  };
}

/** Zwięzłe, czytelne wyjaśnienie, DLACZEGO kandydat odpadł (kryteria + dziedzina). */
export function rejectionReasons(passport: CandidatePassport): string[] {
  const reasons: string[] = [];
  if (passport.domainViolation) reasons.push(`poza dziedziną ważności modelu: ${passport.domainViolation}`);
  for (const r of passport.results) {
    if (r.passed) continue;
    const c = r.criterion;
    const bound = c.op === 'between' ? `[${c.value}–${c.value2 ?? '∞'}]` : `${c.op === 'gte' ? '≥' : '≤'} ${c.value}`;
    reasons.push(`${c.label}: ${Number.isFinite(r.actual) ? r.actual.toPrecision(4) : '—'} ${c.unit ?? ''} nie spełnia ${bound}`);
  }
  return reasons;
}
