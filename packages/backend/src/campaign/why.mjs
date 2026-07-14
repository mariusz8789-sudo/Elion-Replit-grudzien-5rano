/**
 * Silnik WHY (P10) — deterministyczne, oparte na DOWODACH odpowiedzi na pytania
 * „dlaczego". Wszystko konstruowane z UTRWALONYCH danych kampanii (rodowód
 * kandydatów, decyzje, zdarzenia, Scientific Runs). Zero fikcyjnego wstecznego
 * uzasadnienia — jeśli dowodu brak, mówimy o tym wprost.
 */
import * as store from './persistence.mjs';
import { getRun } from '../store.mjs';

const getCampaign = store.getCampaign;

export function whyCandidate(db, candidateId) {
  const c = store.getCandidate(db, candidateId);
  if (!c) return { ok: false, reason: 'Nieznany kandydat.' };
  if (c.generation === 0) {
    return { ok: true, answer: `Molekuła startowa (${c.canonicalSmiles}) podana w definicji kampanii.`, evidence: { generation: 0, runIds: c.runIds } };
  }
  return {
    ok: true,
    answer: `Wygenerowany w generacji ${c.generation} z rodzica „${c.parentSmiles}" transformacją „${c.transformation}". Deskryptory policzone realnym RDKit (Scientific Run).`,
    evidence: { parentSmiles: c.parentSmiles, parentId: c.parentId, transformation: c.transformation, runIds: c.runIds },
  };
}

export function whyStatus(db, candidateId) {
  const c = store.getCandidate(db, candidateId);
  if (!c) return { ok: false, reason: 'Nieznany kandydat.' };
  if (c.status === 'retained') {
    return { ok: true, answer: 'Zachowany: przeszedł walidację struktury i wszystkie twarde ograniczenia; niezduplikowany.', evidence: { objectiveVector: c.objectiveVector, constraintViolations: c.constraintViolations } };
  }
  return { ok: true, answer: `Odrzucony, powód: ${c.rejectedReason}.`, evidence: { rejectedReason: c.rejectedReason, constraintViolations: c.constraintViolations } };
}

export function whyPareto(db, candidateId) {
  const c = store.getCandidate(db, candidateId);
  if (!c) return { ok: false, reason: 'Nieznany kandydat.' };
  return {
    ok: true,
    answer: c.pareto
      ? 'Na froncie Pareto: żaden inny zachowany kandydat nie jest lepszy we WSZYSTKICH kryteriach jednocześnie.'
      : 'Poza frontem Pareto: istnieje kandydat dominujący (nie gorszy na wszystkich, lepszy na co najmniej jednym kryterium).',
    evidence: { pareto: c.pareto, objectiveVector: c.objectiveVector },
  };
}

export function whyStrategyChange(db, campaignId, generation) {
  const d = store.listDecisions(db, campaignId).find((x) => x.generation === generation);
  if (!d) return { ok: false, reason: 'Brak decyzji dla tej generacji.' };
  return { ok: true, answer: `Decyzja „${d.decision}": ${d.purpose}`, evidence: { metrics: d.metrics, params: d.params, algorithm: d.algorithm, stateHash: d.stateHash } };
}

export function whyNextExperiment(db, campaignId, generation) {
  return whyStrategyChange(db, campaignId, generation);
}

export function whyStop(db, campaignId) {
  const camp = getCampaign(db, campaignId);
  if (!camp) return { ok: false, reason: 'Nieznana kampania.' };
  if (!camp.stopReason) return { ok: true, answer: 'Kampania nie została jeszcze zatrzymana.', evidence: { status: camp.status } };
  const last = store.listDecisions(db, campaignId).filter((d) => d.decision === camp.stopReason).pop();
  return { ok: true, answer: `Zatrzymana: ${camp.stopReason}${last ? ` — ${last.purpose}` : ''}.`, evidence: { stopReason: camp.stopReason, final: camp.final } };
}

/** Który silnik/wersja/wejścia policzyły dany wynik (z tabeli runs). */
export function whichEngine(db, candidateId) {
  const c = store.getCandidate(db, candidateId);
  if (!c || c.runIds.length === 0) return { ok: false, reason: 'Brak powiązanego Scientific Run.' };
  const runs = c.runIds.map((id) => getRun(db, id)).filter(Boolean);
  if (runs.length === 0) return { ok: false, reason: 'Scientific Run nie odnaleziony (efemeryczny).' };
  return {
    ok: true,
    answer: runs.map((r) => `${r.modelId} v${r.modelVersion} (${r.provenance?.source ?? 'RDKit'})`).join('; '),
    evidence: runs.map((r) => ({ runId: r.runId, modelId: r.modelId, modelVersion: r.modelVersion, inputs: r.inputs })),
  };
}
